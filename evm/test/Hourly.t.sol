// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Errors, IERC1155Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {Base} from "./Base.t.sol";
import {Hourly} from "../contracts/Hourly.sol";
import {HourlyMath} from "../contracts/HourlyMath.sol";
import {SwitchboardSettlementOracle} from "../contracts/oracles/SwitchboardSettlementOracle.sol";
import {NoOracle} from "../contracts/oracles/NoOracle.sol";
import {MathHarness} from "./mocks/Mocks.sol";

/// Ports of every test in program/programs/hourly/tests/lifecycle.rs and the
/// math_tests module of lib.rs, with the same numbers. Where the EVM behaves
/// differently (e.g. SPL errors become OpenZeppelin errors), the comment says so.
contract HourlyTest is Base {
    // ------------------------------------------------ digital_full_lifecycle_pays_winner_and_returns_rest

    function test_digital_full_lifecycle_pays_winner_and_returns_rest() public {
        assertEq(hourly.settler(), settler);
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0 + 4 * DAY, expiry);
        fund(maker, 1_000 * USD);
        fund(taker, 100 * USD);

        // taker buys 50 YES at $0.42 each
        fillSell(s, makerKey, taker, 50, 21 * USD, T0 + 30);
        assertEq(hourly.balanceOf(taker, s), 50);
        assertEq(usdc.balanceOf(address(hourly)), 50 * USD);
        assertEq(usdc.balanceOf(taker), 79 * USD - 210_000, "premium plus 1% fee");
        assertEq(usdc.balanceOf(treasury), 210_000, "fee lands in the treasury");
        assertEq(usdc.balanceOf(maker), 1_000 * USD - 50 * USD + 21 * USD);
        assertEq(hourly.series(s).openInterest, 50);
        assertEq(hourly.positionOf(s, maker), 50);

        // cannot settle early, cannot redeem before settlement
        vm.prank(settler);
        vm.expectRevert(Hourly.NotExpired.selector);
        hourly.settle(s, 2_800_000, bytes32(uint256(7)));
        vm.prank(taker);
        vm.expectRevert(Hourly.NotSettled.selector);
        hourly.redeem(s, 50);

        vm.warp(expiry);
        // the trusted settler is a fallback only: closed until FALLBACK_DELAY after expiry
        vm.prank(settler);
        vm.expectRevert(Hourly.FallbackTooEarly.selector);
        hourly.settle(s, 2_800_000, bytes32(uint256(7)));
        // an oracle update signed by a key the Switchboard contract does not
        // recognise is rejected (Solana: quote from the wrong queue)
        (, uint256 strangerKey) = makeAddrAndKey("not-an-oracle");
        bytes memory forged = sbUpdate(strangerKey, FEED, 2.8e18, expiry, 1);
        vm.expectRevert(SwitchboardSettlementOracle.OracleVerify.selector);
        hourly.settleOracle(s, one(forged));
        // a quote-less oracle settlement fails
        vm.expectRevert(SwitchboardSettlementOracle.OracleFeedMissing.selector);
        hourly.settleOracle(s, new bytes[](0));

        vm.warp(expiry + FALLBACK);
        // only the settler can settle
        vm.prank(maker);
        vm.expectRevert(Hourly.Unauthorized.selector);
        hourly.settle(s, 1, bytes32(0));
        settleBackup(s, 2_800_000);
        vm.prank(settler);
        vm.expectRevert(Hourly.AlreadySettled.selector);
        hourly.settle(s, 2_000_000, bytes32(0));
        Hourly.Series memory ser = hourly.series(s);
        assertTrue(ser.settled);
        assertFalse(ser.settledByOracle);
        assertEq(ser.feedId, FEED);
        assertEq(ser.payoffPerContract, USD);
        assertEq(ser.evidence, bytes32(uint256(7)));

        vm.prank(taker);
        hourly.redeem(s, 50);
        assertEq(usdc.balanceOf(taker), 79 * USD - 210_000 + 50 * USD);
        vm.prank(maker);
        hourly.reclaim(s);
        assertEq(usdc.balanceOf(address(hourly)), 0, "vault fully paid out");
        vm.prank(maker);
        vm.expectRevert(Hourly.BadQty.selector);
        hourly.reclaim(s);
    }

    // ------------------------------------------------ call_spread_pays_capped_amount_and_vault_balances

    function test_call_spread_pays_capped_amount_and_vault_balances() public {
        uint64 expiry = T0 + 30 * DAY;
        // 720 GPU-hours, strike $2.60, cap $0.40 -> $288 collateral per contract
        uint256 s = createSeries(CALL, 2_600_000, 400_000, 720, T0, expiry);
        fund(maker, 10_000 * USD);
        fund(taker, 1_000 * USD);
        fillSell(s, makerKey, taker, 3, 150 * USD, T0 + 30);
        assertEq(usdc.balanceOf(address(hourly)), 3 * 288 * USD);

        vm.warp(expiry + FALLBACK);
        settleBackup(s, 2_750_000); // average $2.75 -> $0.15/h -> $108 per contract
        vm.prank(taker);
        hourly.redeem(s, 3);
        assertEq(usdc.balanceOf(taker), 1_000 * USD - 150 * USD - 1_500_000 + 3 * 108 * USD);
        vm.prank(maker);
        hourly.reclaim(s);
        assertEq(usdc.balanceOf(maker), 10_000 * USD + 150 * USD - 3 * 108 * USD);
        assertEq(usdc.balanceOf(address(hourly)), 0);
    }

    // ------------------------------------------------ put_out_of_the_money_returns_all_collateral_to_writer

    function test_put_out_of_the_money_returns_all_collateral_to_writer() public {
        uint64 expiry = T0 + 30 * DAY;
        uint256 s = createSeries(PUT, 2_400_000, 500_000, 720, T0, expiry);
        // here the TAKER writes: the maker signs as buyer
        fund(maker, 1_000 * USD);
        fund(taker, 1_000 * USD);
        fillBuy(s, makerKey, taker, 2, 20 * USD, T0 + 30);
        assertEq(usdc.balanceOf(taker), 1_000 * USD - 720 * USD + 20 * USD);
        vm.warp(expiry + FALLBACK);
        settleBackup(s, 2_500_000);
        vm.prank(maker);
        hourly.redeem(s, 2);
        assertEq(usdc.balanceOf(maker), 1_000 * USD - 20 * USD - 200_000, "worthless put pays nothing; buyer paid the fee");
        vm.prank(taker);
        hourly.reclaim(s);
        assertEq(usdc.balanceOf(taker), 1_000 * USD + 20 * USD);
        assertEq(usdc.balanceOf(address(hourly)), 0);
    }

    // ------------------------------------------------ writer_can_close_with_own_longs_before_settlement

    function test_writer_can_close_with_own_longs_before_settlement() public {
        uint64 expiry = T0 + 30 * DAY;
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, expiry);
        fund(maker, 100 * USD);
        fund(taker, 100 * USD);
        fillSell(s, makerKey, taker, 10, 5 * USD, T0 + 30);
        // maker buys 4 written by the taker
        fillBuy(s, makerKey, taker, 4, 2 * USD, T0 + 30);
        // maker holds 4 longs and is short 10: close 4
        vm.prank(maker);
        hourly.close(s, 4);
        assertEq(hourly.positionOf(s, maker), 6);
        assertEq(hourly.series(s).openInterest, 10 - 4 + 4);
        // no longs left to burn (Solana: SPL insufficient funds on burn)
        vm.prank(maker);
        vm.expectRevert(abi.encodeWithSelector(IERC1155Errors.ERC1155InsufficientBalance.selector, maker, 0, 1, s));
        hourly.close(s, 1);
        // vault = 6 (maker) + 4 (taker) contracts of $1
        assertEq(usdc.balanceOf(address(hourly)), 10 * USD);
        // closing more than your short position is rejected even with longs in hand
        vm.prank(taker);
        vm.expectRevert(Hourly.BadQty.selector);
        hourly.close(s, 5);
        // close after settlement is rejected
        vm.warp(expiry + FALLBACK);
        settleBackup(s, 2_000_000);
        vm.prank(taker);
        vm.expectRevert(Hourly.AlreadySettled.selector);
        hourly.close(s, 1);
    }

    // ------------------------------------------------ rejects_bad_fills_and_bad_listings

    function test_rejects_bad_fills_and_bad_listings() public {
        uint64 expiry = T0 + 5 * DAY;
        // only admin lists
        vm.prank(maker);
        vm.expectRevert(Hourly.Unauthorized.selector);
        hourly.createSeries(H100, DIGITAL, 2_700_000, uint64(USD), 1, T0, expiry, FEED);
        // put cap above strike rejected
        vm.prank(admin);
        vm.expectRevert(Hourly.BadTerms.selector);
        hourly.createSeries(H100, PUT, 1_000_000, 2_000_000, 720, T0, expiry, FEED);
        // expiry in the past rejected
        vm.prank(admin);
        vm.expectRevert(Hourly.Expired.selector);
        hourly.createSeries(H100, CALL, 1_000_000, 1, 1, T0 - 10, T0 - 1, FEED);
        // unknown kind, zero cap, zero strike, inverted window
        vm.startPrank(admin);
        vm.expectRevert(Hourly.BadKind.selector);
        hourly.createSeries(H100, 3, 1, 1, 1, T0, expiry, FEED);
        vm.expectRevert(Hourly.BadTerms.selector);
        hourly.createSeries(H100, CALL, 1, 0, 1, T0, expiry, FEED);
        vm.expectRevert(Hourly.BadTerms.selector);
        hourly.createSeries(H100, CALL, 0, 1, 1, T0, expiry, FEED);
        vm.expectRevert(Hourly.BadTerms.selector);
        hourly.createSeries(H100, CALL, 1, 1, 1, expiry, expiry, FEED);
        vm.stopPrank();

        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, expiry);
        // listing the same terms twice (Solana: PDA already in use)
        vm.prank(admin);
        vm.expectRevert(Hourly.SeriesExists.selector);
        hourly.createSeries(H100, DIGITAL, 2_700_000, uint64(USD), 1, T0, expiry, FEED);
        fund(maker, 10 * USD);
        fund(taker, 10 * USD);

        // stale quote
        Hourly.Quote memory q = quote(s, maker, true, 1, USD / 2, T0 - 1);
        bytes memory sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.StaleQuote.selector);
        hourly.fill(q, sig);
        // self trade (Solana hit the duplicate-account guard first; here SelfTrade fires)
        q = quote(s, maker, true, 1, 0, T0 + 30);
        sig = sign(makerKey, q);
        vm.prank(maker);
        vm.expectRevert(Hourly.SelfTrade.selector);
        hourly.fill(q, sig);
        // seller lacks collateral: 11 contracts need $11 (Solana: SPL insufficient funds)
        q = quote(s, maker, true, 11, 0, T0 + 30);
        sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientBalance.selector, maker, 10 * USD, 11 * USD)
        );
        hourly.fill(q, sig);
        // a quote must carry the maker's signature (Solana: the seller must sign)
        q = quote(s, maker, true, 1, 0, T0 + 30);
        sig = sign(takerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.BadSignature.selector);
        hourly.fill(q, sig);
        // terms cannot be altered after signing
        q = quote(s, maker, true, 1, USD / 2, T0 + 30);
        sig = sign(makerKey, q);
        q.premium = 1;
        vm.prank(taker);
        vm.expectRevert(Hourly.BadSignature.selector);
        hourly.fill(q, sig);
        // a quote addressed to someone else
        q = quote(s, maker, true, 1, 0, T0 + 30);
        q.taker = makeAddr("someone-else");
        sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.WrongTaker.selector);
        hourly.fill(q, sig);
        // zero quantity
        q = quote(s, maker, true, 0, 0, T0 + 30);
        sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.BadQty.selector);
        hourly.fill(q, sig);
        // unknown series
        q = quote(s + 1, maker, true, 1, 0, T0 + 30);
        sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.UnknownSeries.selector);
        hourly.fill(q, sig);
        // nothing moved
        assertEq(usdc.balanceOf(address(hourly)), 0);
        assertEq(usdc.balanceOf(taker), 10 * USD);
        // after expiry no new fills
        vm.warp(expiry);
        q = quote(s, maker, true, 1, 0, expiry + 30);
        sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.Expired.selector);
        hourly.fill(q, sig);
    }

    function test_replay_and_cancel() public {
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, T0 + 5 * DAY);
        fund(maker, 10 * USD);
        fund(taker, 10 * USD);
        Hourly.Quote memory q = quote(s, maker, true, 1, USD / 2, T0 + 30);
        bytes memory sig = sign(makerKey, q);
        vm.prank(taker);
        hourly.fill(q, sig);
        vm.prank(taker);
        vm.expectRevert(Hourly.QuoteUsed.selector);
        hourly.fill(q, sig);
        // a maker can withdraw a quote before it is taken
        q = quote(s, maker, true, 1, USD / 2, T0 + 30);
        sig = sign(makerKey, q);
        vm.prank(maker);
        hourly.cancelNonce(q.nonce);
        vm.prank(taker);
        vm.expectRevert(Hourly.QuoteUsed.selector);
        hourly.fill(q, sig);
    }

    function test_collar_fills_atomically() public {
        uint64 expiry = T0 + 30 * DAY;
        uint256 put = createSeries(PUT, 2_400_000, 400_000, 720, T0, expiry);
        uint256 call = createSeries(CALL, 2_900_000, 400_000, 720, T0, expiry);
        fund(maker, 10_000 * USD);
        fund(taker, 1_000 * USD);
        // a GPU owner buys the floor and sells the cap in one transaction
        Hourly.Quote[] memory qs = new Hourly.Quote[](2);
        bytes[] memory sigs = new bytes[](2);
        qs[0] = quote(put, maker, true, 1, 30 * USD, T0 + 30);
        qs[1] = quote(call, maker, false, 1, 25 * USD, T0 + 30);
        sigs[0] = sign(makerKey, qs[0]);
        sigs[1] = sign(makerKey, qs[1]);
        vm.prank(taker);
        hourly.fillBatch(qs, sigs);
        assertEq(hourly.balanceOf(taker, put), 1);
        assertEq(hourly.balanceOf(maker, call), 1);
        assertEq(usdc.balanceOf(address(hourly)), 2 * 288 * USD);
        // fee 1% on each premium: taker pays 0.30, maker pays 0.25
        assertEq(usdc.balanceOf(treasury), 300_000 + 250_000);
        assertEq(usdc.balanceOf(taker), 1_000 * USD - 30 * USD - 300_000 + 25 * USD - 288 * USD);

        // all or nothing: a bad second leg reverts the first
        qs[0] = quote(put, maker, true, 1, 30 * USD, T0 + 30);
        qs[1] = quote(call, maker, false, 1, 25 * USD, T0 - 1);
        sigs[0] = sign(makerKey, qs[0]);
        sigs[1] = sign(makerKey, qs[1]);
        vm.prank(taker);
        vm.expectRevert(Hourly.StaleQuote.selector);
        hourly.fillBatch(qs, sigs);
        assertEq(hourly.balanceOf(taker, put), 1);
    }

    // ------------------------------------------------ pause_stops_new_trades_only

    function test_pause_stops_new_trades_only() public {
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, expiry);
        fund(maker, 10 * USD);
        fund(taker, 10 * USD);
        vm.prank(maker);
        vm.expectRevert(Hourly.Unauthorized.selector); // only admin
        hourly.setPaused(true);
        fillSell(s, makerKey, taker, 2, 0, T0 + 30); // a position exists before the pause
        vm.prank(admin);
        hourly.setPaused(true);
        Hourly.Quote memory q = quote(s, maker, true, 1, 0, T0 + 30);
        bytes memory sig = sign(makerKey, q);
        vm.prank(taker);
        vm.expectRevert(Hourly.Paused.selector);
        hourly.fill(q, sig);
        // funds can still leave while paused: settle, redeem, reclaim
        vm.warp(expiry + FALLBACK);
        settleBackup(s, 2_800_000);
        vm.prank(taker);
        hourly.redeem(s, 2);
        vm.prank(maker);
        hourly.reclaim(s);
        assertEq(usdc.balanceOf(address(hourly)), 0);
        vm.prank(admin);
        hourly.setPaused(false);
        uint256 s2 = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, expiry + FALLBACK, expiry + FALLBACK + DAY);
        fillSell(s2, makerKey, taker, 1, 400_000, expiry + FALLBACK + 30);
        assertEq(hourly.balanceOf(taker, s2), 1);
    }

    // ------------------------------------------------ fees and admin

    function test_fee_cap_and_admin() public {
        vm.expectRevert(Hourly.BadTerms.selector);
        new Hourly(usdc, admin, treasury, settler, oracle, 501);
        vm.prank(admin);
        vm.expectRevert(Hourly.BadTerms.selector);
        hourly.setFee(501);
        vm.prank(maker);
        vm.expectRevert(Hourly.Unauthorized.selector);
        hourly.setFee(0);
        vm.prank(admin);
        hourly.setFee(500);
        assertEq(hourly.feeBps(), 500);
        // 5% fee on a $2 premium lands in the treasury
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, T0 + DAY);
        fund(maker, 10 * USD);
        fund(taker, 10 * USD);
        fillSell(s, makerKey, taker, 5, 2 * USD, T0 + 30);
        assertEq(usdc.balanceOf(treasury), 100_000);
        // settler rotation
        address next = makeAddr("next-settler");
        vm.prank(maker);
        vm.expectRevert(Hourly.Unauthorized.selector);
        hourly.setSettler(next);
        vm.prank(admin);
        hourly.setSettler(next);
        assertEq(hourly.settler(), next);
    }

    // ------------------------------------------------ oracle settlement (Switchboard wire format)

    function test_oracle_settlement_end_to_end() public {
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = createSeries(CALL, 2_600_000, 400_000, 720, T0, expiry);
        fund(maker, 1_000 * USD);
        fund(taker, 1_000 * USD);
        fillSell(s, makerKey, taker, 2, 100 * USD, T0 + 30);

        // too early
        bytes[] memory pre1 = one(sbUpdate(oracleKey, FEED, 2.75e18, expiry - 1, 10));
        vm.expectRevert(Hourly.NotExpired.selector);
        hourly.settleOracle(s, pre1);

        vm.warp(expiry + 120);
        // an update signed before expiry cannot settle (it may miss the last print)
        bytes[] memory pre2 = one(sbUpdate(oracleKey, FEED, 2.75e18, expiry - 1, 10));
        vm.expectRevert(SwitchboardSettlementOracle.OracleStale.selector);
        hourly.settleOracle(s, pre2);
        // a genuine update for ANOTHER feed does not settle this series
        bytes[] memory pre3 = one(sbUpdate(oracleKey, bytes32(uint256(1)), 2.75e18, expiry + 60, 11));
        vm.expectRevert(SwitchboardSettlementOracle.OracleFeedMissing.selector);
        hourly.settleOracle(s, pre3);
        // a tampered value breaks the signature
        bytes memory u = sbUpdate(oracleKey, FEED, 2.75e18, expiry + 60, 12);
        u[18 + 32 + 15] = bytes1(uint8(u[18 + 32 + 15]) ^ 1);
        vm.expectRevert(SwitchboardSettlementOracle.OracleVerify.selector);
        hourly.settleOracle(s, one(u));

        // the oracle-signed window mean 2.6928571428571428571 -> 2_692_857 atoms
        hourly.settleOracle(s, one(sbUpdate(oracleKey, FEED, 2_692_857_142_857_142_857, expiry + 60, 13)));
        Hourly.Series memory ser = hourly.series(s);
        assertTrue(ser.settled && ser.settledByOracle);
        assertEq(ser.settlePrice, 2_692_857);
        assertEq(ser.payoffPerContract, 92_857 * 720);
        assertEq(ser.evidence, bytes32((uint256(13) << 64) | uint256(expiry + 60)));
        // the backup settler can no longer act
        vm.warp(expiry + FALLBACK);
        vm.prank(settler);
        vm.expectRevert(Hourly.AlreadySettled.selector);
        hourly.settle(s, 1, bytes32(0));
        bytes[] memory pre4 = one(sbUpdate(oracleKey, FEED, 9e18, expiry + 61, 14));
        vm.expectRevert(Hourly.AlreadySettled.selector);
        hourly.settleOracle(s, pre4);

        vm.prank(taker);
        hourly.redeem(s, 2);
        vm.prank(maker);
        hourly.reclaim(s);
        assertEq(usdc.balanceOf(address(hourly)), 0);
        assertEq(usdc.balanceOf(taker), 1_000 * USD - 100 * USD - USD + 2 * 92_857 * 720);
    }

    function test_oracle_rejects_old_and_future_updates_and_bad_values() public {
        uint64 expiry = T0 + DAY;
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, expiry);
        vm.warp(expiry + 2 hours);
        // older than maxAge (1 hour)
        bytes[] memory pre5 = one(sbUpdate(oracleKey, FEED, 2.8e18, expiry + 1, 1));
        vm.expectRevert(SwitchboardSettlementOracle.OracleStale.selector);
        hourly.settleOracle(s, pre5);
        // dated in the future beyond the skew allowance
        bytes[] memory pre6 = one(sbUpdate(oracleKey, FEED, 2.8e18, expiry + 2 hours + 61, 2));
        vm.expectRevert(SwitchboardSettlementOracle.OracleStale.selector);
        hourly.settleOracle(s, pre6);
        // non-positive value
        bytes[] memory pre7 = one(sbUpdate(oracleKey, FEED, -1, expiry + 2 hours, 3));
        vm.expectRevert(HourlyMath.OracleBadValue.selector);
        hourly.settleOracle(s, pre7);
    }

    function test_oracle_fee_is_paid_and_excess_refunded() public {
        uint64 expiry = T0 + DAY;
        uint256 s = createSeries(DIGITAL, 2_700_000, uint64(USD), 1, T0, expiry);
        sb.setFee(0.001 ether);
        vm.warp(expiry + 10);
        address keeper = makeAddr("keeper");
        vm.deal(keeper, 1 ether);
        bytes[] memory u = one(sbUpdate(oracleKey, FEED, 2.8e18, expiry + 5, 1));
        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(SwitchboardSettlementOracle.InsufficientFee.selector, 0.001 ether, 0));
        hourly.settleOracle(s, u);
        vm.prank(keeper);
        hourly.settleOracle{value: 0.01 ether}(s, u);
        assertEq(keeper.balance, 1 ether - 0.001 ether, "excess refunded");
        assertEq(address(sb).balance, 0.001 ether);
        assertEq(address(hourly).balance, 0);
        assertEq(address(oracle).balance, 0);
        assertEq(hourly.series(s).payoffPerContract, USD);
    }

    function test_no_oracle_deployment_settles_only_through_backup_after_72h() public {
        NoOracle none = new NoOracle();
        Hourly h = new Hourly(usdc, admin, treasury, settler, none, FEE_BPS);
        vm.prank(admin);
        uint256 s = h.createSeries(H100, DIGITAL, 2_700_000, uint64(USD), 1, T0, T0 + DAY, FEED);
        vm.warp(T0 + DAY);
        vm.expectRevert(NoOracle.OracleUnavailable.selector);
        h.settleOracle(s, new bytes[](0));
        vm.prank(settler);
        vm.expectRevert(Hourly.FallbackTooEarly.selector);
        h.settle(s, 2_800_000, bytes32(0));
        vm.warp(T0 + DAY + FALLBACK - 1);
        vm.prank(settler);
        vm.expectRevert(Hourly.FallbackTooEarly.selector);
        h.settle(s, 2_800_000, bytes32(0));
        vm.warp(T0 + DAY + FALLBACK);
        vm.prank(settler);
        h.settle(s, 2_800_000, bytes32(0));
        assertTrue(h.series(s).settled);
    }

    // ------------------------------------------------ math_tests (lib.rs)

    function test_payoffs() public {
        MathHarness m = new MathHarness();
        // call spread: 2.60 strike, 0.40 cap, 720 hours
        assertEq(m.payoff(CALL, 2_600_000, 400_000, 720, 2_500_000), 0);
        assertEq(m.payoff(CALL, 2_600_000, 400_000, 720, 2_750_000), 150_000 * 720);
        assertEq(m.payoff(CALL, 2_600_000, 400_000, 720, 9_000_000), 400_000 * 720);
        // put
        assertEq(m.payoff(PUT, 2_400_000, 2_400_000, 720, 2_100_000), 300_000 * 720);
        assertEq(m.payoff(PUT, 2_400_000, 2_400_000, 720, 2_500_000), 0);
        // digital pays only strictly above
        assertEq(m.payoff(DIGITAL, 2_500_000, 1_000_000, 1, 2_500_000), 0);
        assertEq(m.payoff(DIGITAL, 2_500_000, 1_000_000, 1, 2_500_001), 1_000_000);
        vm.expectRevert(HourlyMath.BadKind.selector);
        m.payoff(9, 1, 1, 1, 1);
    }

    function test_fee_math() public {
        MathHarness m = new MathHarness();
        assertEq(m.fee(600_000, 100), 6_000); // 1% of $0.60
        assertEq(m.fee(99, 100), 0); // rounds down
        assertEq(m.fee(1_000_000, 0), 0);
        assertEq(m.fee(type(uint64).max, 500), (uint256(type(uint64).max) * 500) / 10_000);
    }

    function test_oracle_value_conversion() public {
        MathHarness m = new MathHarness();
        // 2.715 with 18 decimals -> 2_715_000 atoms
        assertEq(m.sbToAtoms(2_715_000_000_000_000_000), 2_715_000);
        // 2.6928571428571428571 -> rounds to 2_692_857
        assertEq(m.sbToAtoms(2_692_857_142_857_142_857), 2_692_857);
        // half-up rounding at the 7th decimal
        assertEq(m.sbToAtoms(1_000_000_500_000_000_000), 1_000_001);
        vm.expectRevert(HourlyMath.OracleBadValue.selector);
        m.sbToAtoms(0);
        vm.expectRevert(HourlyMath.OracleBadValue.selector);
        m.sbToAtoms(-5);
        vm.expectRevert(HourlyMath.OracleBadValue.selector);
        m.sbToAtoms(400_000_000_000); // rounds to zero atoms
    }

    // ------------------------------------------------ fuzz

    /// The payoff never exceeds the collateral, for any kind, terms and price.
    function testFuzz_payoff_bounded_by_collateral(uint8 kind, uint64 strike, uint64 cap, uint32 units, uint64 price)
        public
    {
        MathHarness m = new MathHarness();
        kind = uint8(bound(kind, 0, 2));
        strike = uint64(bound(strike, 1, type(uint64).max));
        cap = uint64(bound(cap, 1, kind == PUT ? strike : type(uint64).max));
        units = uint32(bound(units, 1, type(uint32).max));
        assertLe(m.payoff(kind, strike, cap, units, price), uint256(cap) * units);
    }

    /// Full lifecycle at random terms: the escrow pays every long and writer
    /// exactly and ends empty.
    function testFuzz_lifecycle_drains_escrow_exactly(
        uint8 kind,
        uint64 strike,
        uint64 cap,
        uint16 units,
        uint16 qty,
        uint64 premium,
        uint64 price
    ) public {
        kind = uint8(bound(kind, 0, 2));
        strike = uint64(bound(strike, 1, 100 * USD));
        cap = uint64(bound(cap, 1, kind == PUT ? strike : 100 * USD));
        units = uint16(bound(units, 1, kind == DIGITAL ? 1 : 744));
        qty = uint16(bound(qty, 1, 1_000));
        premium = uint64(bound(premium, 0, 1_000_000 * USD));
        price = uint64(bound(price, 0, 200 * USD));
        uint64 expiry = T0 + 7 * DAY;
        uint256 s = createSeries(kind, strike, cap, units, T0, expiry);
        uint256 coll = uint256(cap) * units * qty;
        fund(maker, coll);
        fund(taker, premium + premium / 100);
        fillSell(s, makerKey, taker, qty, premium, T0 + 30);
        assertEq(usdc.balanceOf(address(hourly)), coll);
        vm.warp(expiry + FALLBACK);
        settleBackup(s, price);
        uint256 pay = hourly.series(s).payoffPerContract * qty;
        vm.prank(taker);
        hourly.redeem(s, qty);
        vm.prank(maker);
        hourly.reclaim(s);
        assertEq(usdc.balanceOf(address(hourly)), 0);
        assertEq(hourly.totalEscrow(), 0);
        assertEq(usdc.balanceOf(taker), pay);
        assertEq(usdc.balanceOf(maker), coll - pay + premium);
    }
}
