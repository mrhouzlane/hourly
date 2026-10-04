// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {InvariantBase} from "./Invariant.t.sol";

/// Deterministic pass through every handler action, asserting each one
/// actually succeeds, so the invariant campaign is known to exercise them.
contract HandlerSmokeTest is InvariantBase {
    function test_handler_paths_all_run() public {
        handler.deposit(0, 1_000e6);
        handler.deposit(1, 500e6);
        handler.fill(0, 5, 10e6, true);
        handler.fill(1 << 8, 3, 1e6, false);
        handler.transferLongs((1 << 8) | (2 << 16), 1); // actor1 -> actor2, series 0
        handler.warp(6 hours);
        handler.warp(6 hours); // reaches the vault deposit end
        handler.vaultTrade(2, 3, 1e6, true);
        handler.vaultTrade(3 | (1 << 8), 2, 1e6, false);
        handler.fill(0, 2, 1e6, false); // actor0 (short 5) buys 2 back from actor1
        handler.close(0, 2);
        vm.warp(T0 + 2 * DAY + 72 hours); // series 2 open to the backup settler
        handler.settle(2, 3e6);
        handler.settle(3, 9e6);
        handler.redeem(2, 1);
        handler.reclaim(2);
        handler.collect(2);
        vm.warp(T0 + 6 * DAY + 72 hours); // every series open to the backup settler
        handler.settle(3, 9e6);
        handler.settle(0, 2.7e6);
        handler.settle(1, 2.2e6);
        handler.reclaim(0); // actor0, series 0
        handler.collect(3);
        handler.withdraw(0, 1_000e6);
        string[10] memory k =
            ["fill", "close", "transfer", "vaultTrade", "settle", "redeem", "reclaim", "collect", "deposit", "withdraw"];
        for (uint256 i = 0; i < k.length; i++) {
            assertGt(handler.ok(bytes32(bytes(k[i]))), 0, k[i]);
        }
        checkBalanceCoversEscrow();
        checkEscrowEqualsObligations();
        checkVaultCap();
    }
}
