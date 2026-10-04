// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SwitchboardTypes} from "@switchboard-xyz/on-demand-solidity/libraries/SwitchboardTypes.sol";
import {Base} from "./Base.t.sol";
import {Hourly} from "../contracts/Hourly.sol";
import {SwitchboardSettlementOracle} from "../contracts/oracles/SwitchboardSettlementOracle.sol";

/// Replays REAL crossbar output. test/fixtures/sb-*.json were fetched on
/// 2026-10-04 by scripts/sb-fetch-update.mjs from crossbar.switchboardlabs.xyz
/// (`fetchV2Update(chain=evm)`) for the custom feed
/// oracleFeed("H100_SXM", ["2026-10-02","2026-10-03"]) from app/engine/ornn.js.
///
/// What this proves: the bytes decode with Switchboard's own EVM library, carry
/// our feed id and the value 2.715, and the ECDSA signature recovers to the
/// oracle address crossbar reported. What it does NOT prove: that a deployed
/// Switchboard contract recognises that oracle key (the live check on
/// 2026-10-04 said "No valid signatures" on Monad and HyperEVM; see README).
contract SwitchboardFixtureTest is Base {
    function load(string memory name)
        internal
        view
        returns (bytes memory encoded, bytes32 feedId, address signer, uint64 ts)
    {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/", name));
        encoded = vm.parseJsonBytes(json, ".encoded");
        feedId = vm.parseJsonBytes32(json, ".feedId");
        signer = vm.parseAddress(string.concat("0x", vm.parseJsonString(json, ".oracles[0].ethAddress")));
        ts = uint64(vm.parseJsonUint(json, ".timestamp"));
    }

    function check(string memory name) internal {
        (bytes memory encoded, bytes32 feedId, address signer, uint64 ts) = load(name);
        assertEq(feedId, 0xe627418b4e8ee8970d37ebdd1eb365a79305d0dbe76a6faf54599023ac6a84e3, "the Ornn window feed");
        (bytes32 h, SwitchboardTypes.FeedUpdateData memory d) = sb.messageHash(encoded);
        assertEq(d.timestamp, ts);
        assertEq(d.feedInfos.length, 1);
        assertEq(d.feedInfos[0].feedId, feedId);
        assertEq(int256(d.feedInfos[0].value), 2_715_000_000_000_000_000, "mean of the 2026-10-02 and -03 prints");
        assertEq(d.signatures.length, 1);
        assertEq(sb.recover(h, d.signatures[0]), signer, "signature recovers to the oracle crossbar named");
    }

    function test_real_testnet_update_decodes_and_recovers_oracle() public {
        check("sb-testnet.json");
    }

    function test_real_mainnet_update_decodes_and_recovers_oracle() public {
        check("sb-mainnet.json");
    }

    /// End to end with the real signed bytes: a series on that window settles
    /// at 2.715 once the oracle key is registered (as the deployed contract's
    /// queue would have to do).
    function test_real_update_settles_a_series() public {
        (bytes memory encoded, bytes32 feedId, address signer, uint64 ts) = load("sb-testnet.json");
        uint64 expiry = 1_791_072_000; // 2026-10-04 00:00 UTC, after the 10-03 print
        vm.warp(expiry - 2 * DAY);
        vm.prank(admin);
        uint256 s = hourly.createSeries(H100, CALL, 2_600_000, 400_000, 48, expiry - 2 * DAY, expiry, feedId);
        fund(maker, 1_000 * USD);
        fund(taker, 1_000 * USD);
        fillSell(s, makerKey, taker, 1, 3 * USD, expiry - DAY);
        vm.warp(ts + 30);

        // unregistered oracle key: rejected
        vm.expectRevert(SwitchboardSettlementOracle.OracleVerify.selector);
        hourly.settleOracle(s, one(encoded));

        sb.setOracle(signer, true);
        hourly.settleOracle(s, one(encoded));
        Hourly.Series memory ser = hourly.series(s);
        assertTrue(ser.settledByOracle);
        assertEq(ser.settlePrice, 2_715_000);
        assertEq(ser.payoffPerContract, 115_000 * 48);
    }
}
