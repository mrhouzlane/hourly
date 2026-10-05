// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISettlementOracle} from "../interfaces/ISettlementOracle.sol";
import {HourlyMath} from "../HourlyMath.sol";

/// @notice The subset of the deployed Switchboard On-Demand EVM contract we use.
/// Checked live on 2026-10-04 against the v2.0.0 deployments on Monad
/// (0xB7F0...0E67) and HyperEVM (0xcDb2...3347): `getFee(bytes[])`,
/// `updateFeeds(bytes[])` and `getLatestValue(bytes32)` all resolve there.
/// Source interface: npm package switchboard-xyz/on-demand-solidity 1.1.0, ISwitchboard.sol.
interface ISwitchboardOnDemand {
    function getFee(bytes[] calldata updates) external view returns (uint256);
    function updateFeeds(bytes[] calldata updates) external payable;
    function getLatestValue(bytes32 feedId) external view returns (int128 value, uint256 timestamp, uint64 slotNumber);
}

/// @dev Liveness dependency (checked live 2026-10-05, see evm/SWITCHBOARD_EVM.md):
/// the v2.0.0 verifier accepts a signature only if the recovered oracle key was
/// registered on its SwitchboardQueue within `maxAge` (30 days). Registration is
/// admin-only (`setOracleKeys`). On Monad mainnet, Monad testnet and HyperEVM the
/// keys crossbar signs with are registered but expired, so `updateFeeds` reverts
/// "No valid signatures" and this adapter reverts `OracleVerify` until Switchboard
/// refreshes them. test/SwitchboardFork.t.sol proves the same genuine bytes settle
/// once the keys are refreshed. Series then settle via the 72 h backup settler.
/// @title Switchboard settlement adapter for Hourly.
/// @notice Submits a crossbar-encoded update to the Switchboard contract (which
/// checks the oracle ECDSA signatures against its registered oracle keys), then
/// reads the verified value for the series' feed id. The feed id is the hash of
/// the deterministic Ornn window feed (app/engine/ornn.js `oracleFeed`), stored
/// on the series at listing, so a value for any other feed cannot settle it.
///
/// Rules (EVM equivalent of the Solana QuoteVerifier checks):
///  - the verified update must be timestamped at or after the series expiry
///    (so it averages the full window), and
///  - no older than `maxAge` seconds at settlement (Solana: 150 slots).
contract SwitchboardSettlementOracle is ISettlementOracle {
    ISwitchboardOnDemand public immutable switchboard;
    uint256 public immutable maxAge;
    /// Tolerated clock skew between the oracle timestamp and block.timestamp.
    uint256 public constant MAX_FUTURE_SKEW = 60;

    error OracleVerify();
    error OracleFeedMissing();
    error OracleStale();
    error InsufficientFee(uint256 required, uint256 sent);
    error RefundFailed();

    constructor(ISwitchboardOnDemand switchboard_, uint256 maxAge_) {
        switchboard = switchboard_;
        maxAge = maxAge_;
    }

    function settlementPrice(bytes32 feedId, uint64 notBefore, bytes[] calldata updates, address refundTo)
        external
        payable
        returns (uint64 priceAtoms, bytes32 evidence)
    {
        uint256 fee = switchboard.getFee(updates);
        if (msg.value < fee) revert InsufficientFee(fee, msg.value);
        try switchboard.updateFeeds{value: fee}(updates) {}
        catch {
            revert OracleVerify();
        }
        int128 value;
        uint256 ts;
        uint64 slot;
        try switchboard.getLatestValue(feedId) returns (int128 v, uint256 t, uint64 sl) {
            (value, ts, slot) = (v, t, sl);
        } catch {
            revert OracleFeedMissing();
        }
        if (ts == 0) revert OracleFeedMissing();
        if (ts < notBefore) revert OracleStale();
        if (ts > block.timestamp + MAX_FUTURE_SKEW) revert OracleStale();
        if (block.timestamp > ts && block.timestamp - ts > maxAge) revert OracleStale();
        priceAtoms = HourlyMath.sbValueToAtoms(int256(value));
        // evidence: oracle slot (high 64 bits) and oracle timestamp (low 64 bits)
        evidence = bytes32((uint256(slot) << 64) | uint256(uint64(ts)));
        if (msg.value > fee) {
            (bool ok,) = refundTo.call{value: msg.value - fee}("");
            if (!ok) revert RefundFailed();
        }
    }
}
