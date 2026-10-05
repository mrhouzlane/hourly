// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FunctionsRequest} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/libraries/FunctionsRequest.sol";
import {FunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/FunctionsClient.sol";

import {Base} from "./Base.t.sol";
import {Hourly} from "../contracts/Hourly.sol";
import {ChainlinkFunctionsSettlementOracle as CLF} from "../contracts/oracles/ChainlinkFunctionsSettlementOracle.sol";
import {MockFunctionsRouter} from "./mocks/MockFunctionsRouter.sol";
import {DeployFunctions} from "../script/DeployFunctions.s.sol";

/// Hourly settled through the Chainlink Functions adapter, with a mock router
/// playing the DON. The source is the real evm/functions/settle.js.
contract ChainlinkFunctionsTest is Base {
    using FunctionsRequest for FunctionsRequest.Request;

    bytes32 constant DON = "fun-base-sepolia-1";
    uint64 constant SUB = 42;
    uint32 constant CB_GAS = 300_000; // documented maximum callback gas
    uint64 constant RETRY = 600;
    string constant GPU = "H100 SXM";
    // window mean of H100 SXM over 2026-09-01..30, computed from the live API
    // on 2026-10-05 by app/engine/ornn.js and by settle.js in simulateScript
    uint64 constant SEP_MEAN = 2_829_333;

    MockFunctionsRouter router;
    CLF clf;
    string source;
    bytes32 sourceHash;
    bytes32 feedSep;
    bytes32 feedAug;

    function setUp() public override {
        super.setUp();
        router = new MockFunctionsRouter();
        clf = new CLF(address(router), DON, SUB, CB_GAS, RETRY);
        hourly = new Hourly(usdc, admin, treasury, settler, clf, FEE_BPS, admin);
        clf.bind(hourly);
        source = vm.readFile("functions/settle.js");
        sourceHash = clf.registerSource(source);
        feedSep = clf.registerFeed(sourceHash, GPU, month("2026-09-", 30));
        feedAug = clf.registerFeed(sourceHash, GPU, month("2026-08-", 31));
    }

    // ------------------------------------------------------------ helpers

    function month(string memory prefix, uint256 n) internal pure returns (string[] memory d) {
        d = new string[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 day = i + 1;
            d[i] = string.concat(prefix, day < 10 ? "0" : "", vm.toString(day));
        }
    }

    function list(bytes32 feedId, uint64 expiry) internal returns (uint256 id) {
        id = listAt(feedId, expiry, 2_600_000);
    }

    // the series id hashes the terms but not the feed, so siblings need another strike
    function listAt(bytes32 feedId, uint64 expiry, uint64 strike) internal returns (uint256 id) {
        vm.prank(admin);
        id = hourly.createSeries(H100, CALL, strike, 400_000, 720, T0, expiry, feedId);
    }

    function listed(bytes32 feedId, uint64 expiry) internal returns (uint256 id) {
        id = list(feedId, expiry);
        fund(maker, 1_000 * USD);
        fund(taker, 1_000 * USD);
        fillSell(id, makerKey, taker, 2, 100 * USD, T0 + 30);
    }

    function expectedRequest(string memory src, string memory gpu, string[] memory dates)
        internal
        pure
        returns (bytes memory)
    {
        string[] memory args = new string[](dates.length + 1);
        args[0] = gpu;
        for (uint256 i = 0; i < dates.length; i++) {
            args[i + 1] = dates[i];
        }
        FunctionsRequest.Request memory req;
        req.initializeRequestForInlineJavaScript(src);
        req.setArgs(args);
        return req.encodeCBOR();
    }

    function settled(uint256 id) internal view returns (bool) {
        return hourly.series(id).settled;
    }

    // -------------------------------------------------------------- tests

    function test_cl_happy_path_settles_redeems_and_drains() public {
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = listed(feedSep, expiry);
        vm.warp(expiry + 60);

        address anyone = makeAddr("anyone");
        vm.prank(anyone);
        bytes32 rid = clf.requestSettlement(s);

        // the router got exactly settle.js + [gpu, dates...] with our sub, DON and gas
        (address client, uint64 sub, , uint16 ver, uint32 gas, bytes32 don) = router.requests(rid);
        assertEq(client, address(clf));
        assertEq(sub, SUB);
        assertEq(ver, FunctionsRequest.REQUEST_DATA_VERSION);
        assertEq(gas, CB_GAS);
        assertEq(don, DON);
        assertEq(keccak256(router.dataOf(rid)), keccak256(expectedRequest(source, GPU, month("2026-09-", 30))));
        assertLt(router.dataOf(rid).length, 30 * 1024); // request size limit

        (bool ok, uint256 used) = router.fulfill(rid, abi.encode(uint256(SEP_MEAN)), "");
        assertTrue(ok);
        assertLt(used, CB_GAS);
        emit log_named_uint("fulfillment gas incl. Hourly settle", used);

        Hourly.Series memory ser = hourly.series(s);
        assertTrue(ser.settled && ser.settledByOracle);
        assertEq(ser.settlePrice, SEP_MEAN);
        assertEq(ser.evidence, rid);
        assertEq(ser.payoffPerContract, (SEP_MEAN - 2_600_000) * 720);
        assertEq(clf.pendingOf(s), bytes32(0));

        vm.prank(taker);
        hourly.redeem(s, 2);
        vm.prank(maker);
        hourly.reclaim(s);
        assertEq(usdc.balanceOf(address(hourly)), 0);
        assertEq(usdc.balanceOf(taker), 1_000 * USD - 100 * USD - USD + 2 * (SEP_MEAN - 2_600_000) * 720);
    }

    function test_cl_wrong_series() public {
        uint64 expiry = T0 + 5 * DAY;
        // unknown series id
        vm.warp(expiry);
        vm.expectRevert(CLF.UnknownSeries.selector);
        clf.requestSettlement(123);
        vm.warp(T0);

        // a series whose feed was never registered with the adapter
        uint256 orphan = listAt(bytes32(uint256(0xdead)), expiry, 2_500_000);
        uint256 a = listAt(feedSep, expiry, 2_600_000);
        uint256 b = listAt(feedAug, expiry, 2_700_000);
        vm.warp(expiry + 1);
        vm.expectRevert(CLF.FeedNotRegistered.selector);
        clf.requestSettlement(orphan);

        // the answer for series A settles A only; B has its own feed and stays open
        bytes32 rid = clf.requestSettlement(a);
        router.fulfill(rid, abi.encode(uint256(SEP_MEAN)), "");
        assertTrue(settled(a));
        assertFalse(settled(b));
        vm.expectRevert(CLF.NotPriced.selector);
        hourly.settleOracle(b, new bytes[](0));

        // nobody but Hourly reads prices through the oracle interface,
        // and nobody but the router can deliver a fulfilment
        vm.expectRevert(CLF.NotHourly.selector);
        clf.settlementPrice(feedSep, 0, new bytes[](0), address(this));
        vm.expectRevert(FunctionsClient.OnlyRouterCanFulfill.selector);
        clf.handleOracleFulfillment(rid, abi.encode(uint256(1)), "");

        // a forged request id from the router is ignored
        bytes32 ridB = clf.requestSettlement(b);
        assertTrue(router.fulfillRaw(address(clf), keccak256("forged"), abi.encode(uint256(1)), ""));
        assertFalse(settled(b));
        assertEq(clf.pendingOf(b), ridB);
    }

    function test_cl_early_request() public {
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = listed(feedSep, expiry);
        vm.expectRevert(CLF.NotExpired.selector);
        clf.requestSettlement(s);
        vm.warp(expiry - 1);
        vm.expectRevert(CLF.NotExpired.selector);
        clf.requestSettlement(s);
        vm.expectRevert(Hourly.NotExpired.selector);
        hourly.settleOracle(s, new bytes[](0));
        // at expiry it works, but nothing settles before the DON answers
        vm.warp(expiry);
        clf.requestSettlement(s);
        vm.expectRevert(CLF.NotPriced.selector);
        hourly.settleOracle(s, new bytes[](0));
        assertEq(router.count(), 1);
    }

    function test_cl_error_and_malformed_responses_do_not_settle() public {
        uint64 expiry = T0 + 5 * DAY;
        // one series per case: each series is capped at MAX_ATTEMPTS requests (L6)
        uint256[5] memory ids;
        for (uint256 i = 0; i < 5; i++) {
            ids[i] = listed(feedSep, expiry + uint64(i) * 1 hours);
        }
        vm.warp(expiry + 5 hours);

        bytes[4] memory badResponses =
            [bytes(""), abi.encodePacked(uint248(SEP_MEAN)), abi.encode(uint256(0)), abi.encode(uint256(1) << 64)];
        uint256 s = ids[0];
        for (uint256 i = 0; i < 5; i++) {
            s = ids[i];
            bytes32 rid = clf.requestSettlement(s);
            bool ok;
            if (i == 0) {
                // the DON reports a JS error (e.g. "window incomplete")
                vm.expectEmit(true, true, false, true, address(clf));
                emit CLF.SettlementFailed(s, rid, "", bytes("window incomplete"));
                (ok,) = router.fulfill(rid, "", bytes("window incomplete"));
            } else {
                (ok,) = router.fulfill(rid, badResponses[i - 1], "");
            }
            assertTrue(ok); // the callback never reverts on DON input
            assertFalse(settled(s));
            assertEq(clf.pendingOf(s), bytes32(0)); // pending slot freed (cooldown still applies)
            (uint64 atoms,,) = clf.priceOf(feedSep);
            assertEq(atoms, 0);
        }
        vm.expectRevert(CLF.NotPriced.selector);
        hourly.settleOracle(s, new bytes[](0));
    }

    /// L6: a permissionless caller cannot loop paid requests, with or without
    /// answers in between.
    function test_L6_requests_are_capped_and_cooled_down() public {
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = listed(feedSep, expiry);
        vm.warp(expiry + 60);
        assertEq(clf.MAX_ATTEMPTS(), 3);

        bytes32 r = clf.requestSettlement(s);
        router.fulfill(r, "", bytes("ornn http 503")); // error clears the pending slot
        assertEq(clf.pendingOf(s), bytes32(0));
        // ... but an immediate retry is still refused (cooldown)
        vm.expectRevert(abi.encodeWithSelector(CLF.CoolingDown.selector, uint64(block.timestamp) + RETRY));
        clf.requestSettlement(s);

        for (uint256 i = 1; i < 3; i++) {
            vm.warp(block.timestamp + RETRY);
            r = clf.requestSettlement(s);
            router.fulfill(r, "", bytes("ornn http 503"));
        }
        assertEq(clf.attemptsOf(s), 3);
        vm.warp(block.timestamp + 10 * RETRY);
        vm.expectRevert(CLF.TooManyAttempts.selector);
        clf.requestSettlement(s);
        // the fallback settler still finishes the series
        vm.warp(expiry + FALLBACK);
        settleBackup(s, SEP_MEAN);
        assertTrue(settled(s));
    }

    function test_cl_retry_after_error_and_after_timeout() public {
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = listed(feedSep, expiry);
        vm.warp(expiry + 60);

        // error, then a retry after the cooldown succeeds
        bytes32 r1 = clf.requestSettlement(s);
        router.fulfill(r1, "", bytes("ornn http 503"));
        vm.warp(block.timestamp + RETRY);
        bytes32 r2 = clf.requestSettlement(s);
        assertTrue(r2 != r1);

        // while r2 is pending, a new request is refused until RETRY has passed
        vm.expectRevert(abi.encodeWithSelector(CLF.RequestPending.selector, r2));
        clf.requestSettlement(s);
        vm.warp(block.timestamp + RETRY);
        bytes32 r3 = clf.requestSettlement(s);

        // the superseded r2 answering late is ignored; r3 settles
        vm.expectEmit(true, false, false, false, address(clf));
        emit CLF.UnknownFulfillment(r2);
        router.fulfill(r2, abi.encode(uint256(9_999_999)), "");
        assertFalse(settled(s));
        router.fulfill(r3, abi.encode(uint256(SEP_MEAN)), "");
        assertEq(hourly.series(s).settlePrice, SEP_MEAN);
        assertEq(hourly.series(s).evidence, r3);
    }

    function test_cl_double_settle() public {
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = listed(feedSep, expiry);
        // a second series on the same feed and expiry (another strike)
        vm.prank(admin);
        uint256 s2 = hourly.createSeries(H100, DIGITAL, 2_800_000, 1_000_000, 1, T0, expiry, feedSep);
        vm.warp(expiry + 60);

        bytes32 r1 = clf.requestSettlement(s);
        router.fulfill(r1, abi.encode(uint256(SEP_MEAN)), "");
        assertTrue(settled(s));

        // no second request, no second oracle settle, no backup override
        vm.expectRevert(CLF.AlreadySettled.selector);
        clf.requestSettlement(s);
        vm.expectRevert(Hourly.AlreadySettled.selector);
        hourly.settleOracle(s, new bytes[](0));
        vm.warp(expiry + FALLBACK);
        vm.prank(settler);
        vm.expectRevert(Hourly.AlreadySettled.selector);
        hourly.settle(s, 1, bytes32(0));

        // the sibling series reuses the stored price instead of paying again
        vm.expectRevert(CLF.AlreadyPriced.selector);
        clf.requestSettlement(s2);
        address keeper = makeAddr("keeper");
        vm.deal(keeper, 1 ether);
        vm.prank(keeper);
        hourly.settleOracle{value: 1 ether}(s2, new bytes[](0)); // stray ETH is refunded
        assertEq(keeper.balance, 1 ether);
        assertEq(hourly.series(s2).settlePrice, SEP_MEAN);
        assertEq(hourly.series(s2).payoffPerContract, 1_000_000);
        assertEq(address(clf).balance, 0);

        // a stale answer delivered again by a misbehaving router changes nothing
        vm.expectEmit(true, false, false, false, address(clf));
        emit CLF.UnknownFulfillment(r1);
        router.fulfill(r1, abi.encode(uint256(1)), "");
        assertEq(hourly.series(s).settlePrice, SEP_MEAN);
        (uint64 atoms,,) = clf.priceOf(feedSep);
        assertEq(atoms, SEP_MEAN);
    }

    function test_cl_price_for_shared_feed_must_postdate_each_expiry() public {
        uint64 e1 = T0 + 5 * DAY;
        uint64 e2 = T0 + 6 * DAY;
        uint256 s1 = listAt(feedSep, e1, 2_600_000);
        uint256 s2 = listAt(feedSep, e2, 2_600_000);
        vm.warp(e1 + 60);
        router.fulfill(clf.requestSettlement(s1), abi.encode(uint256(SEP_MEAN)), "");
        assertTrue(settled(s1));
        vm.warp(e2);
        // the stored price was requested before s2's expiry: s2 needs its own request
        vm.expectRevert(CLF.PriceTooEarly.selector);
        hourly.settleOracle(s2, new bytes[](0));
        router.fulfill(clf.requestSettlement(s2), abi.encode(uint256(SEP_MEAN + 1)), "");
        assertEq(hourly.series(s2).settlePrice, SEP_MEAN + 1);
        assertEq(hourly.series(s1).settlePrice, SEP_MEAN);
    }

    function test_cl_source_tamper() public {
        uint64 expiry = T0 + 5 * DAY;
        uint256 s = listed(feedSep, expiry);

        // the feed id commits to the source hash, the gpu and every date
        string[] memory sep = month("2026-09-", 30);
        assertEq(feedSep, keccak256(abi.encode(sourceHash, GPU, sep)));
        assertEq(feedSep, clf.feedIdOf(sourceHash, GPU, sep));
        // same ids as functions/simulate.mjs printed off-chain (ethers keccak/abi)
        assertEq(sourceHash, 0x8d35ad17cd9181af089cbf9860ea1353579f7c16509e019c2224d6274fcd23a7);
        assertEq(feedSep, 0xa37ece55ef4247a61cc4fb7ce02d8ff78b77795e6836daebfb3b4b25c5da3f7d);

        // a modified source is a different hash and therefore a different feed;
        // it can never be attached to the listed series
        string memory evil = string.concat(source, "\n// return 1");
        bytes32 evilHash = clf.registerSource(evil);
        assertTrue(evilHash != sourceHash);
        bytes32 evilFeed = clf.registerFeed(evilHash, GPU, sep);
        assertTrue(evilFeed != feedSep);
        assertEq(hourly.series(s).feedId, feedSep);
        // other args are different feeds too
        assertTrue(clf.feedIdOf(sourceHash, "H200", sep) != feedSep);
        sep[29] = "2026-09-29";
        assertTrue(clf.feedIdOf(sourceHash, GPU, sep) != feedSep);

        // re-registering is idempotent and cannot overwrite anything
        assertEq(clf.registerSource(source), sourceHash);
        assertEq(clf.registerFeed(sourceHash, GPU, month("2026-09-", 30)), feedSep);
        assertEq(keccak256(bytes(clf.sourceOf(sourceHash))), sourceHash);
        // a feed needs a registered source and sane args
        vm.expectRevert(CLF.UnknownSource.selector);
        clf.registerFeed(keccak256("not registered"), GPU, month("2026-09-", 30));
        vm.expectRevert(CLF.BadFeed.selector);
        clf.registerFeed(sourceHash, GPU, new string[](0));
        string[] memory bad = new string[](1);
        bad[0] = "2026-9-1";
        vm.expectRevert(CLF.BadFeed.selector);
        clf.registerFeed(sourceHash, GPU, bad);

        // the request still carries the original source after the evil registration
        vm.warp(expiry + 60);
        bytes32 rid = clf.requestSettlement(s);
        assertEq(keccak256(router.dataOf(rid)), keccak256(expectedRequest(source, GPU, month("2026-09-", 30))));

        // if the stored source bytes were ever altered in storage, the hash check refuses to send
        bytes32 strSlot = keccak256(abi.encode(sourceHash, uint256(1))); // _sources is slot 1
        bytes32 dataSlot = keccak256(abi.encode(strSlot));
        vm.store(address(clf), dataSlot, bytes32("// tampered first 32 bytes......"));
        vm.warp(block.timestamp + RETRY);
        vm.expectRevert(CLF.SourceMismatch.selector);
        clf.requestSettlement(s);
    }

    function test_cl_bind_once_and_deploy_refuses_mainnets() public {
        vm.expectRevert(CLF.AlreadyBound.selector);
        clf.bind(hourly);
        CLF fresh = new CLF(address(router), DON, SUB, CB_GAS, RETRY);
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(CLF.NotDeployer.selector);
        fresh.bind(hourly);

        DeployFunctions d = new DeployFunctions();
        uint256[9] memory mainnets = [uint256(1), 8453, 42161, 10, 137, 43114, 42220, 1868, 324];
        for (uint256 i = 0; i < mainnets.length; i++) {
            vm.expectRevert(bytes("DeployFunctions: not a Functions testnet on the allowlist"));
            d.functionsConfig(mainnets[i]);
        }
        (address r, bytes32 don) = d.functionsConfig(84532);
        assertEq(r, 0xf9B8fc078197181C841c296C876945aaa425B278);
        assertEq(don, bytes32("fun-base-sepolia-1"));
    }
}
