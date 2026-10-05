// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";
import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";

import {ISettlementOracle} from "../interfaces/ISettlementOracle.sol";
import {Hourly} from "../Hourly.sol";

/// @title Chainlink Functions settlement adapter for Hourly.
/// @notice A Chainlink Functions DON runs `evm/functions/settle.js` against
/// Ornn's public index-history endpoint and returns the window mean in USDC
/// atoms. The adapter stores that price per feed and settles the series.
///
/// Binding (nothing about a series' settlement can be swapped after listing):
///  - `registerSource(source)` stores a JS source under its keccak256. It is
///    content addressed: a hash can only ever map to that exact source.
///  - `registerFeed(sourceHash, gpu, dates)` returns
///    feedId = keccak256(abi.encode(sourceHash, gpu, dates)). Also content
///    addressed and permissionless.
///  - The Hourly admin lists a series with that feedId (Hourly stores it).
///  - `requestSettlement(seriesId)` reads the series from Hourly, takes the
///    feed's stored source and args, re-checks the source hash, and sends that
///    request. The caller supplies nothing but the series id.
///
/// Flow: anyone calls `requestSettlement(seriesId)` after expiry. The DON calls
/// back `fulfillRequest`. A good response is stored as the feed's price and the
/// adapter immediately calls `Hourly.settleOracle(seriesId)`, which reads the
/// price back through `settlementPrice`. If that settle call fails (e.g. Hourly
/// ran out of callback gas), the price stays stored and anyone can finish with
/// `Hourly.settleOracle(seriesId, [])`. An error or a malformed response stores
/// nothing, clears the pending request, and the series can be requested again.
/// Hourly itself enforces one settlement per series.
contract ChainlinkFunctionsSettlementOracle is ISettlementOracle, FunctionsClient {
    using FunctionsRequest for FunctionsRequest.Request;

    struct Feed {
        bytes32 sourceHash;
        string gpu;
        string[] dates;
    }

    struct Price {
        uint64 atoms; // 0 = no price yet
        uint64 requestedAt; // block time the winning request was sent
        bytes32 requestId; // evidence: the Functions request that produced it
    }

    struct Pending {
        uint256 seriesId;
        bytes32 feedId;
        uint64 requestedAt; // 0 = unknown request
    }

    /// Longest window accepted, in dates (keeps the request far below 30 KB).
    uint256 public constant MAX_DATES = 62;

    /// Requests allowed per series, answered or not. Requests are paid in LINK
    /// by the subscription, so a permissionless caller must not be able to loop
    /// them. After this many the series settles through the fallback settler.
    uint8 public constant MAX_ATTEMPTS = 3;

    address public immutable deployer;
    bytes32 public immutable donId;
    uint64 public immutable subscriptionId;
    uint32 public immutable callbackGasLimit;
    /// A pending request blocks a new one for this long (Functions times out a
    /// request after 5 minutes, so a silent DON does not block retries forever).
    uint64 public immutable retryAfter;

    Hourly public hourly;

    mapping(bytes32 => string) internal _sources; // sourceHash => source
    mapping(bytes32 => Feed) internal _feeds; // feedId => feed
    mapping(bytes32 => Price) public priceOf; // feedId => price
    mapping(bytes32 => Pending) public pendingRequest; // requestId => request
    mapping(uint256 => bytes32) public pendingOf; // seriesId => open requestId
    mapping(uint256 => uint8) public attemptsOf; // seriesId => requests sent
    mapping(uint256 => uint64) public lastRequestAt; // seriesId => time of the latest request

    error AlreadyBound();
    error NotDeployer();
    error NotHourly();
    error UnknownSeries();
    error AlreadySettled();
    error NotExpired();
    error UnknownSource();
    error EmptySource();
    error BadFeed();
    error FeedNotRegistered();
    error SourceMismatch();
    error AlreadyPriced();
    error RequestPending(bytes32 requestId);
    error NotPriced();
    error PriceTooEarly();
    error RefundFailed();
    error TooManyAttempts();
    error CoolingDown(uint64 readyAt);

    event HourlyBound(address hourly);
    event SourceRegistered(bytes32 indexed sourceHash);
    event FeedRegistered(bytes32 indexed feedId, bytes32 indexed sourceHash, string gpu, string[] dates);
    event SettlementRequested(uint256 indexed seriesId, bytes32 indexed feedId, bytes32 indexed requestId);
    event PriceStored(uint256 indexed seriesId, bytes32 indexed feedId, bytes32 indexed requestId, uint64 atoms);
    event SettlementFailed(uint256 indexed seriesId, bytes32 indexed requestId, bytes response, bytes err);
    event SettleDeferred(uint256 indexed seriesId, bytes32 indexed requestId, bytes reason);
    event UnknownFulfillment(bytes32 indexed requestId);

    constructor(address router, bytes32 donId_, uint64 subscriptionId_, uint32 callbackGasLimit_, uint64 retryAfter_)
        FunctionsClient(router)
    {
        deployer = msg.sender;
        donId = donId_;
        subscriptionId = subscriptionId_;
        callbackGasLimit = callbackGasLimit_;
        retryAfter = retryAfter_;
    }

    /// One-time link to Hourly (Hourly takes the oracle address in its
    /// constructor, so the adapter is deployed first).
    function bind(Hourly hourly_) external {
        if (msg.sender != deployer) revert NotDeployer();
        if (address(hourly) != address(0)) revert AlreadyBound();
        hourly = hourly_;
        emit HourlyBound(address(hourly_));
    }

    // ------------------------------------------------------------ registry

    function registerSource(string calldata source) external returns (bytes32 sourceHash) {
        if (bytes(source).length == 0) revert EmptySource();
        sourceHash = keccak256(bytes(source));
        if (bytes(_sources[sourceHash]).length == 0) {
            _sources[sourceHash] = source;
            emit SourceRegistered(sourceHash);
        }
    }

    function feedIdOf(bytes32 sourceHash, string memory gpu, string[] memory dates) public pure returns (bytes32) {
        return keccak256(abi.encode(sourceHash, gpu, dates));
    }

    function registerFeed(bytes32 sourceHash, string calldata gpu, string[] calldata dates)
        external
        returns (bytes32 feedId)
    {
        if (bytes(_sources[sourceHash]).length == 0) revert UnknownSource();
        if (bytes(gpu).length == 0 || dates.length == 0 || dates.length > MAX_DATES) revert BadFeed();
        for (uint256 i = 0; i < dates.length; i++) {
            if (bytes(dates[i]).length != 10) revert BadFeed(); // YYYY-MM-DD; settle.js checks the digits
        }
        feedId = feedIdOf(sourceHash, gpu, dates);
        Feed storage f = _feeds[feedId];
        if (f.sourceHash == bytes32(0)) {
            f.sourceHash = sourceHash;
            f.gpu = gpu;
            for (uint256 i = 0; i < dates.length; i++) {
                f.dates.push(dates[i]);
            }
            emit FeedRegistered(feedId, sourceHash, gpu, dates);
        }
    }

    function sourceOf(bytes32 sourceHash) external view returns (string memory) {
        return _sources[sourceHash];
    }

    function feed(bytes32 feedId) external view returns (Feed memory) {
        return _feeds[feedId];
    }

    // ---------------------------------------------------------- settlement

    /// Permissionless. Sends the series' fixed request to the DON; the
    /// subscription (funded in LINK by its owner) pays.
    function requestSettlement(uint256 seriesId) external returns (bytes32 requestId) {
        Hourly.Series memory s = hourly.series(seriesId);
        if (!s.exists) revert UnknownSeries();
        if (s.settled) revert AlreadySettled();
        if (block.timestamp < s.expiry) revert NotExpired();

        Feed storage f = _feeds[s.feedId];
        if (f.sourceHash == bytes32(0)) revert FeedNotRegistered();

        Price storage p = priceOf[s.feedId];
        // A price for this feed taken after this series' expiry already exists:
        // finish with Hourly.settleOracle(seriesId, []) instead of paying again.
        if (p.atoms != 0 && p.requestedAt >= s.expiry) revert AlreadyPriced();

        bytes32 open = pendingOf[seriesId];
        if (open != bytes32(0) && block.timestamp < uint256(pendingRequest[open].requestedAt) + retryAfter) {
            revert RequestPending(open);
        }

        // Cooldown applies even after an error response cleared `pendingOf`.
        if (attemptsOf[seriesId] >= MAX_ATTEMPTS) revert TooManyAttempts();
        uint64 ready = lastRequestAt[seriesId] + retryAfter;
        if (lastRequestAt[seriesId] != 0 && block.timestamp < ready) revert CoolingDown(ready);

        string memory source = _sources[f.sourceHash];
        if (keccak256(bytes(source)) != f.sourceHash) revert SourceMismatch();

        requestId = _sendRequest(buildRequest(s.feedId), subscriptionId, callbackGasLimit, donId);
        attemptsOf[seriesId] += 1;
        lastRequestAt[seriesId] = uint64(block.timestamp);
        if (open != bytes32(0)) delete pendingRequest[open]; // a late answer to the old one is ignored
        pendingRequest[requestId] = Pending(seriesId, s.feedId, uint64(block.timestamp));
        pendingOf[seriesId] = requestId;
        emit SettlementRequested(seriesId, s.feedId, requestId);
    }

    /// The exact CBOR bytes sent for a feed: inline JS source + [gpu, dates...].
    function buildRequest(bytes32 feedId) public view returns (bytes memory) {
        Feed storage f = _feeds[feedId];
        if (f.sourceHash == bytes32(0)) revert FeedNotRegistered();
        uint256 n = f.dates.length;
        string[] memory args = new string[](n + 1);
        args[0] = f.gpu;
        for (uint256 i = 0; i < n; i++) {
            args[i + 1] = f.dates[i];
        }
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(_sources[f.sourceHash]);
        req.setArgs(args);
        return req.encodeCBOR();
    }

    /// Never reverts on DON input (the router would just record a failed
    /// callback); bad answers are logged and leave the series retryable.
    function fulfillRequest(bytes32 requestId, bytes memory response, bytes memory err) internal override {
        Pending memory r = pendingRequest[requestId];
        if (r.requestedAt == 0) {
            emit UnknownFulfillment(requestId);
            return;
        }
        delete pendingRequest[requestId];
        if (pendingOf[r.seriesId] == requestId) delete pendingOf[r.seriesId];

        if (err.length != 0 || response.length != 32) {
            emit SettlementFailed(r.seriesId, requestId, response, err);
            return;
        }
        uint256 v = abi.decode(response, (uint256));
        if (v == 0 || v > type(uint64).max) {
            emit SettlementFailed(r.seriesId, requestId, response, err);
            return;
        }

        Price storage p = priceOf[r.feedId];
        if (p.atoms == 0 || r.requestedAt > p.requestedAt) {
            p.atoms = uint64(v);
            p.requestedAt = r.requestedAt;
            p.requestId = requestId;
        }
        emit PriceStored(r.seriesId, r.feedId, requestId, uint64(v));

        try hourly.settleOracle(r.seriesId, new bytes[](0)) {}
        catch (bytes memory reason) {
            emit SettleDeferred(r.seriesId, requestId, reason);
        }
    }

    /// ISettlementOracle: called by Hourly.settleOracle. Returns the stored
    /// DON price for the feed, provided it was requested at or after expiry.
    function settlementPrice(bytes32 feedId, uint64 notBefore, bytes[] calldata, address refundTo)
        external
        payable
        returns (uint64 priceAtoms, bytes32 evidence)
    {
        if (msg.sender != address(hourly)) revert NotHourly();
        Price storage p = priceOf[feedId];
        if (p.atoms == 0) revert NotPriced();
        if (p.requestedAt < notBefore) revert PriceTooEarly();
        if (msg.value > 0) {
            (bool ok,) = refundTo.call{value: msg.value}("");
            if (!ok) revert RefundFailed();
        }
        return (p.atoms, p.requestId);
    }
}
