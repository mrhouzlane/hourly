// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {HourlyMath} from "./HourlyMath.sol";
import {ISettlementOracle} from "./interfaces/ISettlementOracle.sol";

/// @title Hourly: cash-settled options on a GPU rental price index (EVM port).
/// @notice Port of the Solana program at program/programs/hourly/src/lib.rs.
///
/// Every series has a bounded payoff, so every contract is fully collateralized
/// at write time. Long positions are ERC-1155 tokens whose id is the series id.
/// A writer's short position is an internal record (`positionOf`).
///
/// Trading is RFQ: a maker signs an EIP-712 `Quote` off chain and the taker
/// submits it with `fill` (this replaces the Solana two-signer transaction).
/// The seller's collateral moves to escrow, the buyer pays the premium to the
/// seller plus a protocol fee to the treasury, and the buyer receives longs,
/// all in one call. Settlement is permissionless through a pluggable oracle
/// (`settleOracle`); a trusted settler key may settle only FALLBACK_DELAY after
/// expiry if the oracle has been silent.
contract Hourly is ERC1155Supply, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- constants

    uint16 public constant MAX_FEE_BPS = 500; // 5% of premium
    uint64 public constant FALLBACK_DELAY = 72 hours;

    bytes32 public constant QUOTE_TYPEHASH = keccak256(
        "Quote(uint256 seriesId,address maker,address taker,bool makerSells,uint256 qty,uint256 premium,uint64 quoteExpiry,uint256 nonce)"
    );

    // ------------------------------------------------------------------- types

    struct Series {
        bytes16 underlying;
        uint8 kind;
        uint64 strike;
        uint64 cap;
        uint64 units;
        uint64 periodStart;
        uint64 expiry;
        bytes32 feedId;
        bool exists;
        bool settled;
        bool settledByOracle;
        uint64 settlePrice;
        uint256 payoffPerContract;
        bytes32 evidence;
        uint256 openInterest; // longs written minus longs closed (same as Solana)
        uint256 totalShort; // sum of every writer's open short position
        uint256 escrow; // quote atoms held for this series
    }

    /// @notice An RFQ quote. `makerSells` = maker writes (seller) and taker buys.
    /// `taker` = address(0) lets anyone take it. Each (maker, nonce) fills once.
    struct Quote {
        uint256 seriesId;
        address maker;
        address taker;
        bool makerSells;
        uint256 qty;
        uint256 premium;
        uint64 quoteExpiry;
        uint256 nonce;
    }

    // ------------------------------------------------------------------ errors
    // Same names as HourlyError in the Solana program, plus the EVM-only ones.

    error BadKind();
    error BadTerms();
    error BadQty();
    error StaleQuote();
    error Expired();
    error NotExpired();
    error AlreadySettled();
    error NotSettled();
    error SelfTrade();
    error Unauthorized();
    error FallbackTooEarly();
    error Paused();
    // EVM only
    error UnknownSeries();
    error SeriesExists();
    error BadSignature();
    error QuoteUsed();
    error WrongTaker();
    error ZeroAddress();

    // ------------------------------------------------------------------ events

    event SeriesCreated(
        uint256 indexed seriesId,
        bytes16 underlying,
        uint8 kind,
        uint64 strike,
        uint64 cap,
        uint64 units,
        uint64 periodStart,
        uint64 expiry,
        bytes32 feedId
    );
    event Filled(
        uint256 indexed seriesId, address indexed buyer, address indexed seller, uint256 qty, uint256 premium, uint256 fee
    );
    event Closed(uint256 indexed seriesId, address indexed writer, uint256 qty, uint256 collateral);
    event Settled(uint256 indexed seriesId, uint64 price, uint256 payoffPerContract, bool byOracle);
    event Redeemed(uint256 indexed seriesId, address indexed holder, uint256 qty, uint256 amount);
    event Reclaimed(uint256 indexed seriesId, address indexed writer, uint256 qty, uint256 amount);
    event NonceCancelled(address indexed maker, uint256 nonce);
    event SettlerSet(address settler);
    event FeeSet(uint16 feeBps);
    event PausedSet(bool paused);
    event VaultSet(address vault, bool allowed);

    // ------------------------------------------------------------------- state

    IERC20 public immutable quoteToken;
    address public immutable admin;
    address public immutable treasury;
    ISettlementOracle public immutable oracle;
    address public settler;
    uint16 public feeBps;
    bool public paused;

    mapping(uint256 => Series) internal _series;
    mapping(uint256 => mapping(address => uint256)) public positionOf; // seriesId => writer => short qty
    mapping(address => mapping(uint256 => bool)) public nonceUsed; // maker => nonce => used
    mapping(address => bool) public isVault;
    uint256 public totalEscrow;

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Unauthorized();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor(
        IERC20 quoteToken_,
        address admin_,
        address treasury_,
        address settler_,
        ISettlementOracle oracle_,
        uint16 feeBps_
    ) ERC1155("") EIP712("Hourly", "1") {
        if (feeBps_ > MAX_FEE_BPS) revert BadTerms();
        if (address(quoteToken_) == address(0) || admin_ == address(0) || treasury_ == address(0)) {
            revert ZeroAddress();
        }
        quoteToken = quoteToken_;
        admin = admin_;
        treasury = treasury_;
        settler = settler_;
        oracle = oracle_;
        feeBps = feeBps_;
    }

    // ------------------------------------------------------------------- admin

    function setSettler(address settler_) external onlyAdmin {
        settler = settler_;
        emit SettlerSet(settler_);
    }

    function setFee(uint16 feeBps_) external onlyAdmin {
        if (feeBps_ > MAX_FEE_BPS) revert BadTerms();
        feeBps = feeBps_;
        emit FeeSet(feeBps_);
    }

    /// Emergency switch: stops new fills and vault deposits/trades. Close,
    /// settlement, redemption, reclaim and withdrawals keep working so funds
    /// can always leave.
    function setPaused(bool paused_) external onlyAdmin {
        paused = paused_;
        emit PausedSet(paused_);
    }

    /// Registers an underwriting vault (Solana: create_vault is admin-only).
    /// A vault can only spend its own tokens through `vaultFill`.
    function setVault(address vault, bool allowed) external onlyAdmin {
        isVault[vault] = allowed;
        emit VaultSet(vault, allowed);
    }

    // ------------------------------------------------------------------ series

    function seriesIdOf(bytes16 underlying, uint8 kind, uint64 strike, uint64 cap, uint64 units, uint64 expiry)
        public
        pure
        returns (uint256)
    {
        return uint256(keccak256(abi.encode(underlying, kind, strike, cap, units, expiry)));
    }

    function createSeries(
        bytes16 underlying,
        uint8 kind,
        uint64 strike,
        uint64 cap,
        uint64 units,
        uint64 periodStart,
        uint64 expiry,
        bytes32 feedId
    ) external onlyAdmin returns (uint256 id) {
        if (kind > HourlyMath.KIND_DIGITAL) revert BadKind();
        if (cap == 0 || units == 0) revert BadTerms();
        if (strike == 0) revert BadTerms();
        if (periodStart >= expiry) revert BadTerms();
        if (kind == HourlyMath.KIND_PUT && cap > strike) revert BadTerms();
        if (expiry <= block.timestamp) revert Expired();
        id = seriesIdOf(underlying, kind, strike, cap, units, expiry);
        Series storage s = _series[id];
        if (s.exists) revert SeriesExists();
        s.underlying = underlying;
        s.kind = kind;
        s.strike = strike;
        s.cap = cap;
        s.units = units;
        s.periodStart = periodStart;
        s.expiry = expiry;
        s.feedId = feedId;
        s.exists = true;
        emit SeriesCreated(id, underlying, kind, strike, cap, units, periodStart, expiry, feedId);
    }

    function series(uint256 id) external view returns (Series memory) {
        return _series[id];
    }

    function collateralPerContract(uint256 id) public view returns (uint256) {
        Series storage s = _get(id);
        return HourlyMath.collateralPerContract(s.cap, s.units);
    }

    // ------------------------------------------------------------------ trading

    function hashQuote(Quote calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    QUOTE_TYPEHASH,
                    q.seriesId,
                    q.maker,
                    q.taker,
                    q.makerSells,
                    q.qty,
                    q.premium,
                    q.quoteExpiry,
                    q.nonce
                )
            )
        );
    }

    /// One RFQ fill. The maker signed `q` off chain; msg.sender is the taker.
    /// Both sides must have approved this contract for the quote token:
    /// the seller for `qty * collateralPerContract`, the buyer for
    /// `premium + fee`.
    function fill(Quote calldata q, bytes calldata signature) external nonReentrant whenNotPaused {
        _fillQuote(q, signature);
    }

    /// Several quotes in one transaction, all or nothing (collars, multi-leg).
    function fillBatch(Quote[] calldata qs, bytes[] calldata signatures) external nonReentrant whenNotPaused {
        if (qs.length != signatures.length || qs.length == 0) revert BadQty();
        for (uint256 i = 0; i < qs.length; i++) {
            _fillQuote(qs[i], signatures[i]);
        }
    }

    /// A maker withdraws an unfilled quote.
    function cancelNonce(uint256 nonce) external {
        nonceUsed[msg.sender][nonce] = true;
        emit NonceCancelled(msg.sender, nonce);
    }

    /// A registered vault trades with `taker`. The vault has already collected
    /// whatever the taker owes; every token this call moves comes from the vault:
    /// the seller's collateral when the vault writes, the taker's collateral
    /// (forwarded) when the vault buys, and the protocol fee in both cases.
    /// Premium moves between vault and taker inside the vault.
    function vaultFill(uint256 id, address taker, bool vaultSells, uint256 qty, uint256 premium)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 fee)
    {
        if (!isVault[msg.sender]) revert Unauthorized();
        (address buyer, address seller) = vaultSells ? (taker, msg.sender) : (msg.sender, taker);
        Series storage s = _checkTradable(id, qty, buyer, seller);
        uint256 collateral = HourlyMath.collateralPerContract(s.cap, s.units) * qty;
        fee = HourlyMath.feeFor(premium, feeBps);
        _book(s, id, seller, collateral, qty);
        quoteToken.safeTransferFrom(msg.sender, address(this), collateral);
        if (fee > 0) quoteToken.safeTransferFrom(msg.sender, treasury, fee);
        _mint(buyer, id, qty, "");
        emit Filled(id, buyer, seller, qty, premium, fee);
    }

    /// Before settlement, a writer holding longs of the same series burns them
    /// against their own short position and takes the collateral back.
    function close(uint256 id, uint256 qty) external nonReentrant {
        if (qty == 0) revert BadQty();
        Series storage s = _get(id);
        if (s.settled) revert AlreadySettled();
        if (positionOf[id][msg.sender] < qty) revert BadQty();
        uint256 collateral = HourlyMath.collateralPerContract(s.cap, s.units) * qty;
        _burn(msg.sender, id, qty);
        positionOf[id][msg.sender] -= qty;
        s.openInterest -= qty;
        s.totalShort -= qty;
        _pay(s, msg.sender, collateral);
        emit Closed(id, msg.sender, qty, collateral);
    }

    // --------------------------------------------------------------- settlement

    /// Permissionless settlement through the configured oracle. `updates` is
    /// whatever the oracle needs (for Switchboard: the crossbar-encoded update).
    /// msg.value pays the oracle's update fee; any excess is refunded.
    function settleOracle(uint256 id, bytes[] calldata updates) external payable nonReentrant {
        Series storage s = _get(id);
        if (s.settled) revert AlreadySettled();
        if (block.timestamp < s.expiry) revert NotExpired();
        (uint64 price, bytes32 evidence) =
            oracle.settlementPrice{value: msg.value}(s.feedId, s.expiry, updates, msg.sender);
        _applySettlement(id, s, price, evidence, true);
    }

    /// Fallback only: the trusted settler posts the averaged index value if no
    /// oracle settlement has happened FALLBACK_DELAY after expiry.
    function settle(uint256 id, uint64 price, bytes32 evidence) external {
        if (msg.sender != settler) revert Unauthorized();
        Series storage s = _get(id);
        if (s.settled) revert AlreadySettled();
        if (block.timestamp < s.expiry) revert NotExpired();
        if (block.timestamp < uint256(s.expiry) + FALLBACK_DELAY) revert FallbackTooEarly();
        _applySettlement(id, s, price, evidence, false);
    }

    /// Long holder burns tokens and receives the settled payoff.
    function redeem(uint256 id, uint256 qty) external nonReentrant returns (uint256 amount) {
        if (qty == 0) revert BadQty();
        Series storage s = _get(id);
        if (!s.settled) revert NotSettled();
        amount = s.payoffPerContract * qty;
        _burn(msg.sender, id, qty);
        if (amount > 0) _pay(s, msg.sender, amount);
        emit Redeemed(id, msg.sender, qty, amount);
    }

    /// Writer takes back collateral minus what the longs are owed.
    function reclaim(uint256 id) external nonReentrant returns (uint256 amount) {
        Series storage s = _get(id);
        if (!s.settled) revert NotSettled();
        uint256 qty = positionOf[id][msg.sender];
        if (qty == 0) revert BadQty();
        amount = (HourlyMath.collateralPerContract(s.cap, s.units) - s.payoffPerContract) * qty;
        positionOf[id][msg.sender] = 0;
        s.totalShort -= qty;
        if (amount > 0) _pay(s, msg.sender, amount);
        emit Reclaimed(id, msg.sender, qty, amount);
    }

    // ---------------------------------------------------------------- internals

    function _get(uint256 id) internal view returns (Series storage s) {
        s = _series[id];
        if (!s.exists) revert UnknownSeries();
    }

    function _fillQuote(Quote calldata q, bytes calldata signature) internal {
        if (q.taker != address(0) && q.taker != msg.sender) revert WrongTaker();
        (address buyer, address seller) = q.makerSells ? (msg.sender, q.maker) : (q.maker, msg.sender);
        if (q.qty == 0) revert BadQty();
        if (block.timestamp > q.quoteExpiry) revert StaleQuote();
        Series storage s = _checkTradable(q.seriesId, q.qty, buyer, seller);
        if (nonceUsed[q.maker][q.nonce]) revert QuoteUsed();
        if (!SignatureChecker.isValidSignatureNow(q.maker, hashQuote(q), signature)) revert BadSignature();
        nonceUsed[q.maker][q.nonce] = true;

        uint256 collateral = HourlyMath.collateralPerContract(s.cap, s.units) * q.qty;
        uint256 fee = HourlyMath.feeFor(q.premium, feeBps);
        _book(s, q.seriesId, seller, collateral, q.qty);
        quoteToken.safeTransferFrom(seller, address(this), collateral);
        if (q.premium > 0) quoteToken.safeTransferFrom(buyer, seller, q.premium);
        // protocol fee, paid by the buyer on top of the premium
        if (fee > 0) quoteToken.safeTransferFrom(buyer, treasury, fee);
        _mint(buyer, q.seriesId, q.qty, "");
        emit Filled(q.seriesId, buyer, seller, q.qty, q.premium, fee);
    }

    function _checkTradable(uint256 id, uint256 qty, address buyer, address seller)
        internal
        view
        returns (Series storage s)
    {
        if (qty == 0) revert BadQty();
        s = _get(id);
        if (s.settled || block.timestamp >= s.expiry) revert Expired();
        if (buyer == seller) revert SelfTrade();
    }

    /// State first (checks-effects-interactions): the ERC-1155 mint calls the
    /// buyer's receiver hook afterwards.
    function _book(Series storage s, uint256 id, address seller, uint256 collateral, uint256 qty) internal {
        positionOf[id][seller] += qty;
        s.openInterest += qty;
        s.totalShort += qty;
        s.escrow += collateral;
        totalEscrow += collateral;
    }

    function _pay(Series storage s, address to, uint256 amount) internal {
        s.escrow -= amount; // underflow here would mean a broken invariant: revert
        totalEscrow -= amount;
        quoteToken.safeTransfer(to, amount);
    }

    function _applySettlement(uint256 id, Series storage s, uint64 price, bytes32 evidence, bool byOracle) internal {
        s.settlePrice = price;
        s.evidence = evidence;
        s.payoffPerContract = HourlyMath.payoffPerContract(s.kind, s.strike, s.cap, s.units, price);
        s.settled = true;
        s.settledByOracle = byOracle;
        emit Settled(id, price, s.payoffPerContract, byOracle);
    }
}
