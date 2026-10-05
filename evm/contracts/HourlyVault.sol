// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155Receiver} from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Hourly} from "./Hourly.sol";
import {HourlyMath} from "./HourlyMath.sol";

/// @title One epoch of underwriting capital for Hourly.
/// @notice Port of the Solana vault instructions (create_vault, vault_deposit,
/// vault_sell, vault_buy, vault_collect, vault_withdraw). The contract is its
/// own ERC-20 share token (6 decimals, minted 1:1 with deposits).
///
/// Deposits are taken before the epoch trades; during the epoch the venue's
/// quoter trades the vault's capital within an on-chain cap per series; after
/// every series it touched is settled and collected, LPs withdraw pro rata.
/// No mark-to-model is needed because deposits and withdrawals only happen
/// when the vault holds cash.
///
/// Trades: the quoter signs an EIP-712 `VaultQuote`; the taker submits it with
/// `trade` (Solana: quoter and taker co-sign). The taker approves THIS vault
/// (not Hourly): the vault collects what the taker owes, then Hourly pulls the
/// collateral and fee from the vault only.
contract HourlyVault is ERC20, EIP712, ReentrancyGuard, IERC1155Receiver {
    using SafeERC20 for IERC20;

    bytes32 public constant VAULT_QUOTE_TYPEHASH = keccak256(
        "VaultQuote(uint256 seriesId,address taker,bool vaultSells,uint256 qty,uint256 premium,uint64 quoteExpiry,uint256 nonce,uint16 maxFeeBps)"
    );

    struct VaultQuote {
        uint256 seriesId;
        address taker; // address(0): anyone
        bool vaultSells; // true: vault writes, taker buys
        uint256 qty;
        uint256 premium;
        uint64 quoteExpiry;
        uint256 nonce;
        uint16 maxFeeBps; // reverts if the live protocol fee exceeds this
    }

    struct VaultSeries {
        uint256 short;
        uint256 long;
        bool touched;
        bool closed;
    }

    error BadTerms();
    error BadQty();
    error StaleQuote();
    error Expired();
    error NotSettled();
    error SelfTrade();
    error Unauthorized();
    error Paused();
    error VaultClosed();
    error VaultLocked();
    error VaultLimit();
    error VaultNotTrading();
    error SeriesOutsideEpoch();
    error QuoteUsed();
    error FeeTooHigh();
    error PremiumOutOfBounds();
    error TradeTooLarge();
    error EpochRiskLimit();

    event Deposited(address indexed lp, uint256 amount);
    event Traded(uint256 indexed seriesId, address indexed taker, bool vaultSells, uint256 qty, uint256 premium, uint256 fee);
    event Collected(uint256 indexed seriesId, uint256 amount);
    event MaxEpochBpsSet(uint16 bps);
    event MaxTradeBpsSet(uint16 bps);
    event Withdrawn(address indexed lp, uint256 shares, uint256 amount);

    Hourly public immutable hourly;
    IERC20 public immutable quoteToken;
    uint32 public immutable epoch;
    address public immutable quoter;
    uint64 public immutable depositEnd;
    uint64 public immutable epochEnd;
    uint16 public immutable maxSeriesBps;

    /// Premium bounds, as bps of the contract's max payoff (collateral per contract).
    /// The vault never pays more than 95% of max payoff to buy, and never sells below 1%.
    uint256 public constant MAX_BUY_PREMIUM_BPS = 9_500;
    uint256 public constant MIN_SELL_PREMIUM_BPS = 100;

    /// Epoch-wide cap on collateral at risk summed over every series
    /// (qty * collateralPerContract on either side, never netted down), as bps of
    /// deposits. Default 50%. Admin-settable within 1..10000.
    uint16 public maxEpochBps = 5_000;
    /// Cap on one trade's qty * collateralPerContract, bps of deposits. Default 10%.
    uint16 public maxTradeBps = 1_000;
    uint256 public atRisk;

    uint256 public deposits;
    uint256 public premiums;
    uint32 public openSeries;
    mapping(uint256 => VaultSeries) public vaultSeries;
    mapping(uint256 => bool) public nonceUsed;

    constructor(Hourly hourly_, uint32 epoch_, address quoter_, uint64 depositEnd_, uint64 epochEnd_, uint16 maxSeriesBps_)
        ERC20(string.concat("Hourly vault epoch ", _u2s(epoch_)), string.concat("hvLP-", _u2s(epoch_)))
        EIP712("HourlyVault", "1")
    {
        // The lister creates vaults; the quoter is its own hot key and must not
        // be the governance key.
        if (msg.sender != hourly_.lister()) revert Unauthorized();
        if (quoter_ == address(0) || quoter_ == hourly_.admin()) revert Unauthorized();
        if (depositEnd_ >= epochEnd_) revert BadTerms();
        if (maxSeriesBps_ == 0 || maxSeriesBps_ > 10_000) revert BadTerms();
        hourly = hourly_;
        quoteToken = hourly_.quoteToken();
        epoch = epoch_;
        quoter = quoter_;
        depositEnd = depositEnd_;
        epochEnd = epochEnd_;
        maxSeriesBps = maxSeriesBps_;
        // Hourly pulls collateral and fees from the vault; it never pulls more
        // than the call it is serving computes.
        quoteToken.forceApprove(address(hourly_), type(uint256).max);
    }

    function setMaxEpochBps(uint16 bps) external {
        if (msg.sender != hourly.admin()) revert Unauthorized();
        if (bps == 0 || bps > 10_000) revert BadTerms();
        maxEpochBps = bps;
        emit MaxEpochBpsSet(bps);
    }

    function setMaxTradeBps(uint16 bps) external {
        if (msg.sender != hourly.admin()) revert Unauthorized();
        if (bps == 0 || bps > 10_000) revert BadTerms();
        maxTradeBps = bps;
        emit MaxTradeBpsSet(bps);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function cash() public view returns (uint256) {
        return quoteToken.balanceOf(address(this));
    }

    // ------------------------------------------------------------------ deposit

    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert BadQty();
        if (hourly.paused()) revert Paused();
        if (block.timestamp >= depositEnd) revert VaultClosed();
        quoteToken.safeTransferFrom(msg.sender, address(this), amount);
        _mint(msg.sender, amount);
        deposits += amount;
        emit Deposited(msg.sender, amount);
    }

    // -------------------------------------------------------------------- trade

    function hashVaultQuote(VaultQuote calldata q) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    VAULT_QUOTE_TYPEHASH, q.seriesId, q.taker, q.vaultSells, q.qty, q.premium, q.quoteExpiry, q.nonce, q.maxFeeBps
                )
            )
        );
    }

    /// msg.sender is the taker. Selling: the taker pays premium + fee to the
    /// vault (approve this vault for that). Buying: the taker posts collateral
    /// through the vault and receives the premium.
    function trade(VaultQuote calldata q, bytes calldata quoterSignature) external nonReentrant {
        if (hourly.paused()) revert Paused();
        if (q.qty == 0) revert BadQty();
        if (block.timestamp > q.quoteExpiry) revert StaleQuote();
        if (block.timestamp < depositEnd) revert VaultNotTrading();
        Hourly.Series memory s = hourly.series(q.seriesId);
        if (s.settled || block.timestamp >= s.expiry) revert Expired();
        if (s.expiry > epochEnd) revert SeriesOutsideEpoch();
        if (q.taker != address(0) && q.taker != msg.sender) revert Unauthorized();
        if (!SignatureChecker.isValidSignatureNow(quoter, hashVaultQuote(q), quoterSignature)) revert Unauthorized();
        if (nonceUsed[q.nonce]) revert QuoteUsed();
        if (msg.sender == address(this)) revert SelfTrade();
        nonceUsed[q.nonce] = true;

        uint256 per = HourlyMath.collateralPerContract(s.cap, s.units);
        uint256 notional = per * q.qty;
        // The quoter is a hot key: bound what one signature can do.
        if (q.vaultSells) {
            if (q.premium < (notional * MIN_SELL_PREMIUM_BPS) / 10_000) revert PremiumOutOfBounds();
        } else {
            if (q.premium > (notional * MAX_BUY_PREMIUM_BPS) / 10_000) revert PremiumOutOfBounds();
        }
        if (notional > (deposits * maxTradeBps) / 10_000) revert TradeTooLarge();
        atRisk += notional;
        if (atRisk > (deposits * maxEpochBps) / 10_000) revert EpochRiskLimit();
        VaultSeries storage vs = vaultSeries[q.seriesId];
        uint256 newSide = (q.vaultSells ? vs.short : vs.long) + q.qty;
        if (newSide * per > (deposits * maxSeriesBps) / 10_000) revert VaultLimit();
        if (q.vaultSells) vs.short = newSide;
        else vs.long = newSide;
        if (!vs.touched) {
            vs.touched = true;
            openSeries += 1;
        }

        if (hourly.feeBps() > q.maxFeeBps) revert FeeTooHigh();
        uint256 fee = HourlyMath.feeFor(q.premium, hourly.feeBps());
        if (q.vaultSells) {
            // premium and fee: taker -> vault; Hourly then takes collateral + fee from the vault
            quoteToken.safeTransferFrom(msg.sender, address(this), q.premium + fee);
            premiums += q.premium;
        } else {
            // the taker's collateral comes in, the premium goes out of vault cash
            quoteToken.safeTransferFrom(msg.sender, address(this), per * q.qty);
            if (q.premium > 0) quoteToken.safeTransfer(msg.sender, q.premium);
        }
        uint256 charged = hourly.vaultFill(q.seriesId, msg.sender, q.vaultSells, q.qty, q.premium);
        assert(charged == fee);
        emit Traded(q.seriesId, msg.sender, q.vaultSells, q.qty, q.premium, fee);
    }

    // ------------------------------------------------------------------ collect

    /// After settlement, pulls everything the vault is owed on one series back
    /// into vault cash. Anyone can call it; a second call moves nothing.
    function collect(uint256 seriesId) external nonReentrant returns (uint256 amount) {
        VaultSeries storage vs = vaultSeries[seriesId];
        if (!vs.touched) revert BadQty();
        if (!hourly.series(seriesId).settled) revert NotSettled();
        uint256 before = cash();
        if (vs.long > 0) {
            uint256 l = vs.long;
            vs.long = 0;
            hourly.redeem(seriesId, l);
        }
        if (vs.short > 0) {
            vs.short = 0;
            hourly.reclaim(seriesId);
        }
        if (!vs.closed) {
            vs.closed = true;
            openSeries -= 1;
        }
        amount = cash() - before;
        emit Collected(seriesId, amount);
    }

    // ----------------------------------------------------------------- withdraw

    /// After the epoch ends and every series is collected, LPs burn shares for
    /// their pro rata slice of vault cash.
    function withdraw(uint256 shares) external nonReentrant returns (uint256 amount) {
        if (shares == 0) revert BadQty();
        if (block.timestamp < epochEnd || openSeries != 0) revert VaultLocked();
        uint256 supply = totalSupply();
        if (supply == 0 || shares > supply) revert BadQty();
        amount = (cash() * shares) / supply;
        _burn(msg.sender, shares);
        if (amount > 0) quoteToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, shares, amount);
    }

    // ------------------------------------------------------------- ERC-1155 in

    function onERC1155Received(address, address, uint256, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(hourly)) revert Unauthorized();
        return IERC1155Receiver.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata)
        external
        view
        returns (bytes4)
    {
        if (msg.sender != address(hourly)) revert Unauthorized();
        return IERC1155Receiver.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == type(IERC1155Receiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    function _u2s(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0";
        bytes memory b;
        while (v > 0) {
            b = abi.encodePacked(bytes1(uint8(48 + (v % 10))), b);
            v /= 10;
        }
        return string(b);
    }
}
