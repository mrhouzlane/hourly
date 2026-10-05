// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {Hourly} from "../contracts/Hourly.sol";
import {HourlyVault} from "../contracts/HourlyVault.sol";

/// Regression tests for the EVM findings of docs/SECURITY_REVIEW.md
/// (H1, H2, M1, L2, L3). L6 lives in ChainlinkFunctions.t.sol.
/// Each one passed as an exploit before the fix; now it must revert.
contract SecurityReviewTest is Base {
    uint64 constant DEP_END = T0 + DAY;
    uint64 constant EPOCH_END = T0 + 8 * DAY;
    uint64 constant EXP = T0 + 5 * DAY;
    uint256 vNonce = 1;
    address lister = makeAddr("lister");

    function _vault(uint16 seriesBps) internal returns (HourlyVault v) {
        vm.startPrank(admin);
        v = new HourlyVault(hourly, 1, maker, DEP_END, EPOCH_END, seriesBps);
        hourly.setVault(address(v), true);
        vm.stopPrank();
    }

    function _deposit(HourlyVault v, uint256 amount) internal {
        address lp = makeAddr("lp");
        usdc.mint(lp, amount);
        vm.startPrank(lp);
        usdc.approve(address(v), type(uint256).max);
        v.deposit(amount);
        vm.stopPrank();
    }

    function _trade(HourlyVault v, address who, uint256 s, bool sells, uint256 qty, uint256 prem) internal {
        _tradeExpect(v, who, s, sells, qty, prem, bytes4(0));
    }

    /// `err` = 0: must succeed; else must revert with that selector. The
    /// quote is signed before expectRevert so the cheatcodes do not consume it.
    function _tradeExpect(HourlyVault v, address who, uint256 s, bool sells, uint256 qty, uint256 prem, bytes4 err)
        internal
    {
        HourlyVault.VaultQuote memory q = HourlyVault.VaultQuote({
            seriesId: s,
            taker: who,
            vaultSells: sells,
            qty: qty,
            premium: prem,
            quoteExpiry: type(uint64).max,
            nonce: vNonce++,
            maxFeeBps: 500
        });
        (uint8 vv, bytes32 r, bytes32 ss) = vm.sign(makerKey, v.hashVaultQuote(q));
        bytes memory sig = abi.encodePacked(r, ss, vv);
        if (err != bytes4(0)) vm.expectRevert(err);
        vm.prank(who);
        v.trade(q, sig);
    }

    function _taker(HourlyVault v, address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(v), type(uint256).max);
    }

    // ------------------------------------------------------------------ H1

    /// The original exploit (vault pays $990 for a $1 contract) must now revert.
    function test_H1_buy_premium_is_capped_at_95pct_of_max_payoff() public {
        HourlyVault v = _vault(2_000);
        _deposit(v, 1_000 * USD);
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0 + 4 * DAY, EXP);
        vm.warp(DEP_END);
        address acc = makeAddr("accomplice");
        _taker(v, acc, 10 * USD);

        _tradeExpect(v, acc, s, false, 1, 990 * USD, HourlyVault.PremiumOutOfBounds.selector);
        _tradeExpect(v, acc, s, false, 10, 9_500_001, HourlyVault.PremiumOutOfBounds.selector); // 1 atom over 95% of $10
        _trade(v, acc, s, false, 10, 9_500_000); // exactly 95%
        assertGt(v.cash(), 1_000 * USD - 10 * USD, "LP cash intact");
    }

    function test_H1_sell_premium_has_a_1pct_floor() public {
        HourlyVault v = _vault(2_000);
        _deposit(v, 1_000 * USD);
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0 + 4 * DAY, EXP);
        vm.warp(DEP_END);
        address t = makeAddr("t");
        _taker(v, t, 100 * USD);

        _tradeExpect(v, t, s, true, 10, 0, HourlyVault.PremiumOutOfBounds.selector); // deep ITM written for free
        _tradeExpect(v, t, s, true, 10, 99_999, HourlyVault.PremiumOutOfBounds.selector); // 1 atom under 1% of $10
        _trade(v, t, s, true, 10, 100_000); // exactly 1%
    }

    function test_H1_epoch_wide_cap_on_collateral_at_risk() public {
        HourlyVault v = _vault(10_000);
        _deposit(v, 1_000 * USD);
        assertEq(v.maxEpochBps(), 5_000, "default 50%");
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0 + 4 * DAY, EXP);
        uint256 s2 = createSeries(DIGITAL, 2_800_000, uint64(USD), 1, T0 + 4 * DAY, EXP + 1);
        vm.warp(DEP_END);
        address t = makeAddr("t");
        _taker(v, t, 1_000 * USD);

        // five trades of $100 spread over two series reach the 50% cap exactly
        for (uint256 i = 0; i < 5; i++) {
            _trade(v, t, i % 2 == 0 ? s : s2, true, 100, 5 * USD);
        }
        assertEq(v.atRisk(), 500 * USD);
        _tradeExpect(v, t, s2, true, 1, USD / 100, HourlyVault.EpochRiskLimit.selector);

        // only admin moves it, and only within 1..10000 bps
        vm.expectRevert(HourlyVault.Unauthorized.selector);
        v.setMaxEpochBps(10_000);
        vm.prank(admin);
        vm.expectRevert(HourlyVault.BadTerms.selector);
        v.setMaxEpochBps(0);
        vm.prank(admin);
        vm.expectRevert(HourlyVault.BadTerms.selector);
        v.setMaxEpochBps(10_001);
        vm.prank(admin);
        v.setMaxEpochBps(6_000);
        _trade(v, t, s2, true, 100, 5 * USD);
    }

    function test_H1_per_trade_size_cap() public {
        HourlyVault v = _vault(10_000);
        _deposit(v, 1_000 * USD);
        assertEq(v.maxTradeBps(), 1_000, "default 10%");
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0 + 4 * DAY, EXP);
        vm.warp(DEP_END);
        address t = makeAddr("t");
        _taker(v, t, 1_000 * USD);
        _tradeExpect(v, t, s, true, 101, 10 * USD, HourlyVault.TradeTooLarge.selector);
        _trade(v, t, s, true, 100, 10 * USD);
        vm.expectRevert(HourlyVault.Unauthorized.selector);
        v.setMaxTradeBps(10_000);
        vm.prank(admin);
        v.setMaxTradeBps(2_000);
        _trade(v, t, s, true, 200, 10 * USD);
    }

    function test_H1_quoter_must_not_be_the_admin_and_only_the_lister_creates_vaults() public {
        vm.prank(admin);
        vm.expectRevert(HourlyVault.Unauthorized.selector);
        new HourlyVault(hourly, 1, admin, DEP_END, EPOCH_END, 1_000);
        vm.prank(admin);
        vm.expectRevert(HourlyVault.Unauthorized.selector);
        new HourlyVault(hourly, 1, address(0), DEP_END, EPOCH_END, 1_000);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(HourlyVault.Unauthorized.selector);
        new HourlyVault(hourly, 1, maker, DEP_END, EPOCH_END, 1_000);
    }

    // ------------------------------------------------------------------ H2

    function test_H2_roles_are_split() public {
        Hourly h = new Hourly(usdc, admin, treasury, settler, oracle, FEE_BPS, lister);
        assertEq(h.admin(), admin);
        assertEq(h.lister(), lister);

        // lister lists series and registers vaults, nothing else
        vm.prank(lister);
        uint256 id = h.createSeries(H100, DIGITAL, 2_700_000, uint64(USD), 1, T0, T0 + DAY, FEED);
        vm.startPrank(lister);
        h.setVault(address(0xBEEF), true);
        vm.expectRevert(Hourly.Unauthorized.selector);
        h.setPaused(true);
        vm.expectRevert(Hourly.Unauthorized.selector);
        h.setFee(0);
        vm.expectRevert(Hourly.Unauthorized.selector);
        h.setSettler(lister);
        vm.expectRevert(Hourly.Unauthorized.selector);
        h.setMinPremium(0);
        vm.expectRevert(Hourly.Unauthorized.selector);
        h.setLister(lister);
        vm.stopPrank();

        // admin (multisig) cannot list and cannot register vaults
        vm.startPrank(admin);
        vm.expectRevert(Hourly.Unauthorized.selector);
        h.createSeries(H100, DIGITAL, 2_800_000, uint64(USD), 1, T0, T0 + DAY, FEED);
        vm.expectRevert(Hourly.Unauthorized.selector);
        h.setVault(address(0xBEEF), false);
        // but owns the setters and can rotate a compromised lister
        h.setPaused(true);
        h.setFee(50);
        h.setSettler(admin);
        h.setMinPremium(1);
        h.setLister(makeAddr("lister2"));
        vm.expectRevert(Hourly.ZeroAddress.selector);
        h.setLister(address(0));
        vm.stopPrank();
        vm.prank(lister);
        vm.expectRevert(Hourly.Unauthorized.selector);
        h.createSeries(H100, DIGITAL, 2_900_000, uint64(USD), 1, T0, T0 + DAY, FEED);

        // the settler (separate key) cannot list either
        vm.prank(makeAddr("someone"));
        vm.expectRevert(Hourly.Unauthorized.selector);
        h.createSeries(H100, DIGITAL, 3_000_000, uint64(USD), 1, T0, T0 + DAY, FEED);
        assertTrue(id != 0);
    }

    function test_H2_constructor_rejects_zero_lister() public {
        vm.expectRevert(Hourly.ZeroAddress.selector);
        new Hourly(usdc, admin, treasury, settler, oracle, FEE_BPS, address(0));
    }

    // ------------------------------------------------------------------ M1

    /// Every role is fixed in a constructor, so there is no initializer to
    /// front-run: Hourly cannot be re-initialised and a vault can only be built
    /// by the lister. (Chainlink adapter `bind` is deployer-only and one-shot,
    /// covered in ChainlinkFunctions.t.sol.)
    function test_M1_no_initializer_exists() public {
        (bool ok,) = address(hourly).call(abi.encodeWithSignature("initialize(address)", makeAddr("evil")));
        assertFalse(ok);
        assertEq(hourly.admin(), admin);
        assertEq(hourly.lister(), admin);
        HourlyVault v = _vault(1_000);
        (bool ok2,) = address(v).call(abi.encodeWithSignature("initialize(address)", makeAddr("evil")));
        assertFalse(ok2);
        assertEq(v.quoter(), maker);
    }

    // ------------------------------------------------------------------ L2

    function test_L2_fee_above_signed_max_reverts() public {
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, EXP);
        fund(maker, 100 * USD);
        fund(taker, 100 * USD);
        Hourly.Quote memory q = quote(s, maker, false, 10, 10 * USD, uint64(T0 + 60));
        q.maxFeeBps = 100; // the maker signs for a 1% fee at most
        bytes memory sig = sign(makerKey, q);
        vm.prank(admin);
        hourly.setFee(500);
        vm.prank(taker);
        vm.expectRevert(Hourly.FeeTooHigh.selector);
        hourly.fill(q, sig);
        // back at the signed fee, the same quote fills
        vm.prank(admin);
        hourly.setFee(100);
        vm.prank(taker);
        hourly.fill(q, sig);
        assertEq(usdc.balanceOf(treasury), 100_000);
    }

    function test_L2_max_fee_is_part_of_the_signature() public {
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, EXP);
        fund(maker, 100 * USD);
        fund(taker, 100 * USD);
        Hourly.Quote memory q = quote(s, maker, false, 10, 10 * USD, uint64(T0 + 60));
        q.maxFeeBps = 100;
        bytes memory sig = sign(makerKey, q);
        q.maxFeeBps = 500; // taker tries to widen the signed bound
        vm.prank(taker);
        vm.expectRevert(Hourly.BadSignature.selector);
        hourly.fill(q, sig);
    }

    function test_L2_vault_quote_fee_bound() public {
        HourlyVault v = _vault(2_000);
        _deposit(v, 1_000 * USD);
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0 + 4 * DAY, EXP);
        vm.warp(DEP_END);
        address t = makeAddr("t");
        _taker(v, t, 100 * USD);
        HourlyVault.VaultQuote memory q = HourlyVault.VaultQuote(s, t, true, 10, USD, type(uint64).max, 99, 50);
        (uint8 vv, bytes32 r, bytes32 ss) = vm.sign(makerKey, v.hashVaultQuote(q));
        vm.prank(t);
        vm.expectRevert(HourlyVault.FeeTooHigh.selector); // live fee 100 > signed 50
        v.trade(q, abi.encodePacked(r, ss, vv));
    }

    // ------------------------------------------------------------------ L3

    function test_L3_zero_and_dust_premium_cannot_skip_the_fee() public {
        assertEq(hourly.minPremium(), 10_000, "default 0.01 USDC");
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, EXP);
        fund(maker, 100 * USD);
        fund(taker, 100 * USD);
        Hourly.Quote memory q = quote(s, maker, true, 1, 0, uint64(T0 + 60));
        bytes memory sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.PremiumTooLow.selector);
        hourly.fill(q, sig);
        q = quote(s, maker, true, 1, 9_999, uint64(T0 + 60));
        sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.PremiumTooLow.selector);
        hourly.fill(q, sig);
        // exactly the minimum fills and pays the fee (1% of 10_000 = 100)
        q = quote(s, maker, true, 1, 10_000, uint64(T0 + 60));
        sig = sign(makerKey, q);
        vm.prank(taker);
        hourly.fill(q, sig);
        assertEq(usdc.balanceOf(treasury), 100);
    }

    function test_L3_min_premium_is_admin_configurable() public {
        vm.expectRevert(Hourly.Unauthorized.selector);
        hourly.setMinPremium(0);
        vm.prank(admin);
        hourly.setMinPremium(USD);
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, EXP);
        fund(maker, 100 * USD);
        fund(taker, 100 * USD);
        Hourly.Quote memory q = quote(s, maker, true, 1, USD - 1, uint64(T0 + 60));
        bytes memory sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.PremiumTooLow.selector);
        hourly.fill(q, sig);
    }
}
