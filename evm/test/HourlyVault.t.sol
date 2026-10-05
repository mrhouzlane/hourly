// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Hourly} from "../contracts/Hourly.sol";
import {HourlyVault} from "../contracts/HourlyVault.sol";

/// Port of vault_underwrites_an_epoch_and_pays_lps_pro_rata (lifecycle.rs),
/// same numbers, plus the EVM-specific checks.
contract HourlyVaultTest is Base {
    uint256 vNonce = 1;
    uint64 constant DEP_END = T0 + DAY;
    uint64 constant EPOCH_END = T0 + 8 * DAY;
    uint64 constant EXP = T0 + 5 * DAY;
    address lp1 = makeAddr("lp1");
    address lp2 = makeAddr("lp2");

    function newVault(uint32 epoch, address quoter_, uint64 depositEnd, uint64 epochEnd, uint16 bps)
        internal
        returns (HourlyVault v)
    {
        vm.startPrank(admin);
        v = new HourlyVault(hourly, epoch, quoter_, depositEnd, epochEnd, bps);
        hourly.setVault(address(v), true);
        vm.stopPrank();
    }

    function vq(uint256 id, bool vaultSells, uint256 qty, uint256 premium)
        internal
        returns (HourlyVault.VaultQuote memory)
    {
        return HourlyVault.VaultQuote({
            seriesId: id,
            taker: address(0),
            vaultSells: vaultSells,
            qty: qty,
            premium: premium,
            quoteExpiry: type(uint64).max,
            nonce: vNonce++,
            maxFeeBps: 500
        });
    }

    function vsign(HourlyVault v, uint256 key, HourlyVault.VaultQuote memory q) internal view returns (bytes memory) {
        (uint8 vv, bytes32 r, bytes32 s) = vm.sign(key, v.hashVaultQuote(q));
        return abi.encodePacked(r, s, vv);
    }

    function loosen(HourlyVault v) internal {
        vm.startPrank(admin);
        v.setMaxTradeBps(10_000);
        v.setMaxEpochBps(10_000);
        vm.stopPrank();
    }

    function trade(HourlyVault v, uint256 quoterKey, address who, uint256 id, bool sells, uint256 qty, uint256 prem)
        internal
    {
        HourlyVault.VaultQuote memory q = vq(id, sells, qty, prem);
        bytes memory sig = vsign(v, quoterKey, q);
        vm.prank(who);
        v.trade(q, sig);
    }

    function lpFund(HourlyVault v, address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(v), type(uint256).max);
    }

    function test_vault_underwrites_an_epoch_and_pays_lps_pro_rata() public {
        // the venue's pricing engine is the quoter
        HourlyVault v = newVault(1, maker, DEP_END, EPOCH_END, 2_000); // 20% cap per series
        loosen(v); // this test writes 50 of 400 in one trade

        // two LPs deposit 300 and 100
        lpFund(v, lp1, 300 * USD);
        lpFund(v, lp2, 100 * USD);
        vm.prank(lp1);
        v.deposit(300 * USD);
        vm.prank(lp2);
        v.deposit(100 * USD);
        assertEq(v.cash(), 400 * USD);
        assertEq(v.balanceOf(lp1), 300 * USD);

        // a series inside the epoch
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0 + 4 * DAY, EXP);
        lpFund(v, taker, 100 * USD);

        // no trading during the deposit window
        HourlyVault.VaultQuote memory q = vq(s, true, 1, 400_000);
        bytes memory sig = vsign(v, makerKey, q);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.VaultNotTrading.selector);
        v.trade(q, sig);
        vm.warp(DEP_END);
        // no deposits once trading starts
        vm.prank(lp2);
        vm.expectRevert(HourlyVault.VaultClosed.selector);
        v.deposit(1);
        // only the vault's quoter can trade its capital
        (, uint256 strangerKey) = makeAddrAndKey("stranger");
        q = vq(s, true, 1, 400_000);
        sig = vsign(v, strangerKey, q);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.Unauthorized.selector);
        v.trade(q, sig);

        // the vault writes 50 YES at $0.40 to the taker
        trade(v, makerKey, taker, s, true, 50, 20 * USD);
        assertEq(hourly.balanceOf(taker, s), 50);
        assertEq(v.cash(), 400 * USD - 50 * USD + 20 * USD);
        assertEq(usdc.balanceOf(taker), 100 * USD - 20 * USD - 200_000);
        assertEq(usdc.balanceOf(treasury), 200_000);
        // the cap: 20% of 400 = $80 of collateral in one series; 31 more would make 81
        q = vq(s, true, 31, 31 * USD / 2);
        sig = vsign(v, makerKey, q);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.VaultLimit.selector);
        v.trade(q, sig);

        // the vault also buys 10 contracts written by a second trader, at $0.30
        address t2 = makeAddr("t2");
        lpFund(v, t2, 50 * USD);
        trade(v, makerKey, t2, s, false, 10, 3 * USD);
        assertEq(usdc.balanceOf(t2), 50 * USD - 10 * USD + 3 * USD);
        assertEq(hourly.balanceOf(address(v), s), 10);
        uint256 vaultCashAfterTrades = 400 * USD - 50 * USD + 20 * USD - 3 * USD - 30_000;
        assertEq(v.cash(), vaultCashAfterTrades);
        (uint256 short_, uint256 long_,, bool closed) = v.vaultSeries(s);
        assertEq(short_, 50);
        assertEq(long_, 10);
        assertFalse(closed);
        assertEq(v.openSeries(), 1);
        assertEq(v.deposits(), 400 * USD);
        assertEq(v.premiums(), 20 * USD);

        // a series that outlives the epoch cannot be traded by this vault
        uint256 late = createSeries(DIGITAL, 2_800_000, uint64(USD), 1, T0 + 9 * DAY, T0 + 10 * DAY);
        q = vq(late, true, 1, 400_000);
        sig = vsign(v, makerKey, q);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.SeriesOutsideEpoch.selector);
        v.trade(q, sig);

        // settle YES (print 2.80 > 2.70): the vault owes its 50 shorts, collects on its 10 longs
        vm.warp(EXP + FALLBACK);
        settleBackup(s, 2_800_000);
        // withdrawals stay locked until the epoch ends and the series is collected
        vm.prank(lp1);
        vm.expectRevert(HourlyVault.VaultLocked.selector);
        v.withdraw(1);
        v.collect(s);
        assertEq(v.openSeries(), 0);
        uint256 cash = vaultCashAfterTrades + 10 * USD; // long payoff; short collateral fully paid out
        assertEq(v.cash(), cash);
        // collecting twice moves nothing and does not double count
        v.collect(s);
        assertEq(v.cash(), cash);
        assertEq(v.openSeries(), 0);

        // the taker redeems 50 winning contracts
        vm.prank(taker);
        hourly.redeem(s, 50);
        assertEq(usdc.balanceOf(taker), 100 * USD - 20 * USD - 200_000 + 50 * USD);

        // epoch over: LPs withdraw pro rata
        vm.warp(EPOCH_END);
        vm.prank(lp1);
        v.withdraw(300 * USD);
        uint256 lp1Out = (cash * 300) / 400;
        assertEq(usdc.balanceOf(lp1), lp1Out);
        vm.prank(lp2);
        v.withdraw(100 * USD);
        assertEq(usdc.balanceOf(lp2), cash - lp1Out);
        assertEq(v.cash(), 0, "vault fully distributed");
        assertEq(usdc.balanceOf(address(hourly)), 0, "series escrow fully paid out");
    }

    function test_vault_guards() public {
        // only Hourly's admin creates vaults; terms are checked
        vm.prank(maker);
        vm.expectRevert(HourlyVault.Unauthorized.selector);
        new HourlyVault(hourly, 1, maker, T0 + DAY, T0 + 2 * DAY, 1_000);
        vm.startPrank(admin);
        vm.expectRevert(HourlyVault.BadTerms.selector);
        new HourlyVault(hourly, 1, maker, T0 + DAY, T0 + DAY, 1_000);
        vm.expectRevert(HourlyVault.BadTerms.selector);
        new HourlyVault(hourly, 1, maker, T0 + DAY, T0 + 2 * DAY, 0);
        vm.expectRevert(HourlyVault.BadTerms.selector);
        new HourlyVault(hourly, 1, maker, T0 + DAY, T0 + 2 * DAY, 10_001);
        vm.stopPrank();

        HourlyVault v = newVault(2, maker, T0 + DAY, T0 + 8 * DAY, 10_000);
        lpFund(v, taker, 100 * USD);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.BadQty.selector);
        v.deposit(0);
        vm.prank(taker);
        v.deposit(50 * USD);
        // pause blocks deposits and trades
        vm.prank(admin);
        hourly.setPaused(true);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.Paused.selector);
        v.deposit(1);
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, T0 + 5 * DAY);
        vm.warp(T0 + DAY);
        HourlyVault.VaultQuote memory q = vq(s, true, 1, USD / 100);
        bytes memory sig = vsign(v, makerKey, q);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.Paused.selector);
        v.trade(q, sig);
        vm.prank(admin);
        hourly.setPaused(false);
        // replay of a quoter signature
        vm.prank(taker);
        v.trade(q, sig);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.QuoteUsed.selector);
        v.trade(q, sig);
        // a quote addressed to another taker
        q = vq(s, true, 1, USD / 100);
        q.taker = maker;
        sig = vsign(v, makerKey, q);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.Unauthorized.selector);
        v.trade(q, sig);
        // stale quote
        q = vq(s, true, 1, USD / 100);
        q.quoteExpiry = T0;
        sig = vsign(v, makerKey, q);
        vm.prank(taker);
        vm.expectRevert(HourlyVault.StaleQuote.selector);
        v.trade(q, sig);
        // collect before settlement / on an untouched series
        vm.expectRevert(HourlyVault.NotSettled.selector);
        v.collect(s);
        vm.expectRevert(HourlyVault.BadQty.selector);
        v.collect(s + 1);
        // an unregistered vault cannot reach Hourly
        vm.prank(admin);
        hourly.setVault(address(v), false);
        q = vq(s, true, 1, USD / 100);
        sig = vsign(v, makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.Unauthorized.selector);
        v.trade(q, sig);
        // nobody but Hourly can push ERC-1155 tokens into the vault
        vm.expectRevert(HourlyVault.Unauthorized.selector);
        v.onERC1155Received(address(0), address(0), 0, 0, "");
    }

    /// Exact pro-rata at random deposits and a random outcome: LPs together get
    /// every atom of vault cash, each within 1 atom of their exact share.
    function testFuzz_vault_pro_rata(uint64 d1, uint64 d2, uint16 qty, uint64 premium, bool yes) public {
        d1 = uint64(bound(d1, 1, 1_000_000 * USD));
        d2 = uint64(bound(d2, 1, 1_000_000 * USD));
        uint256 total = uint256(d1) + d2;
        HourlyVault v = newVault(3, maker, T0 + DAY, T0 + 8 * DAY, 10_000);
        loosen(v);
        lpFund(v, lp1, d1);
        lpFund(v, lp2, d2);
        vm.prank(lp1);
        v.deposit(d1);
        vm.prank(lp2);
        v.deposit(d2);
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, expiry);
        vm.warp(T0 + DAY);
        qty = uint16(bound(qty, 0, total / USD > 1_000 ? 1_000 : total / USD));
        premium = uint64(bound(premium, uint256(qty) * USD / 100, 1_000 * USD)); // vault sells >= 1% of max payoff
        if (qty > 0) {
            lpFund(v, taker, premium + premium / 100);
            trade(v, makerKey, taker, s, true, qty, premium);
        }
        vm.warp(expiry + FALLBACK);
        settleBackup(s, yes ? 2_800_000 : 2_600_000);
        if (qty > 0) v.collect(s);
        assertEq(v.cash(), total + (qty > 0 ? premium : 0) - (yes ? uint256(qty) * USD : 0));
        vm.warp(T0 + 8 * DAY);
        _withdrawBoth(v, d1, d2);
    }

    function _withdrawBoth(HourlyVault v, uint256 d1, uint256 d2) internal {
        uint256 cash = v.cash();
        uint256 total = d1 + d2;
        vm.prank(lp1);
        uint256 out1 = v.withdraw(d1);
        vm.prank(lp2);
        uint256 out2 = v.withdraw(d2);
        assertEq(out1 + out2, cash);
        assertEq(out1, (cash * d1) / total);
        assertApproxEqAbs(out2, (cash * d2) / total, 1);
        assertEq(v.cash(), 0);
    }
}
