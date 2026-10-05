// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Hourly} from "../contracts/Hourly.sol";
import {HourlyVault} from "../contracts/HourlyVault.sol";

/// Security review proofs (docs/SECURITY_REVIEW.md). Each test PASSES while the
/// weakness it documents is present; a fix should make it fail and be flipped
/// into a regression test.
contract SecurityReviewTest is Base {
    uint64 constant DEP_END = T0 + DAY;
    uint64 constant EPOCH_END = T0 + 8 * DAY;
    uint64 constant EXP = T0 + 5 * DAY;

    /// SR-H1 (EVM): one quoter signature with an unbounded premium drains the vault.
    function test_SR_H1_quoter_drains_vault_with_unbounded_premium() public {
        vm.startPrank(admin);
        HourlyVault v = new HourlyVault(hourly, 1, maker, DEP_END, EPOCH_END, 2_000);
        hourly.setVault(address(v), true);
        vm.stopPrank();

        address lp = makeAddr("lp");
        usdc.mint(lp, 1_000 * USD);
        vm.prank(lp);
        usdc.approve(address(v), type(uint256).max);
        vm.prank(lp);
        v.deposit(1_000 * USD);

        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0 + 4 * DAY, EXP);
        vm.warp(DEP_END);

        address accomplice = makeAddr("accomplice");
        usdc.mint(accomplice, USD); // $1 collateral for one $1-max contract
        vm.prank(accomplice);
        usdc.approve(address(v), type(uint256).max);

        HourlyVault.VaultQuote memory q = HourlyVault.VaultQuote({
            seriesId: s,
            taker: accomplice,
            vaultSells: false, // vault buys
            qty: 1,
            premium: 990 * USD, // + 1% fee = $999.90 of $1,000
            quoteExpiry: type(uint64).max,
            nonce: 1
        });
        (uint8 vv, bytes32 r, bytes32 ss) = vm.sign(makerKey, v.hashVaultQuote(q));
        vm.prank(accomplice);
        v.trade(q, abi.encodePacked(r, ss, vv));

        assertEq(usdc.balanceOf(accomplice), 990 * USD, "accomplice paid $990 for a contract worth at most $1");
        assertLe(v.cash(), USD, "LP cash drained");
    }

    /// SR-L2: the fee is not part of the signed Quote. A maker who signs as
    /// BUYER at 1% pays whatever fee is live when the taker fills (up to 5%).
    function test_SR_L2_fee_not_bound_by_maker_signature() public {
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, EXP);
        fund(maker, 100 * USD);
        fund(taker, 100 * USD);
        Hourly.Quote memory q = quote(s, maker, false, 10, 10 * USD, uint64(T0 + 60));
        bytes memory sig = sign(makerKey, q); // signed while fee = 1%
        vm.prank(admin);
        hourly.setFee(500);
        vm.prank(taker);
        hourly.fill(q, sig);
        assertEq(usdc.balanceOf(treasury), 500_000, "maker charged 5%, not the 1% live at signing");
    }
}
