// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {Hourly} from "../contracts/Hourly.sol";
import {HourlyVault} from "../contracts/HourlyVault.sol";
import {SwitchboardSettlementOracle, ISwitchboardOnDemand} from "../contracts/oracles/SwitchboardSettlementOracle.sol";
import {MockUSDC, MockSwitchboard} from "./mocks/Mocks.sol";

/// Shared fixture: mirrors setup() in program/programs/hourly/tests/lifecycle.rs.
abstract contract Base is Test {
    uint64 constant DAY = 86_400;
    uint64 constant T0 = 1_791_158_400; // 2026-10-05 00:00 UTC
    bytes32 constant FEED = bytes32(uint256(0x0909090909090909090909090909090909090909090909090909090909090909));
    uint16 constant FEE_BPS = 100; // 1% of premium
    uint256 constant USD = 1_000_000;
    uint64 constant FALLBACK = 72 hours;
    uint8 constant CALL = 0;
    uint8 constant PUT = 1;
    uint8 constant DIGITAL = 2;
    bytes16 constant H100 = bytes16("H100_SXM");

    Hourly hourly;
    MockUSDC usdc;
    MockSwitchboard sb;
    SwitchboardSettlementOracle oracle;

    address admin = makeAddr("admin");
    address settler = makeAddr("settler");
    address treasury = makeAddr("treasury");
    uint256 makerKey;
    uint256 takerKey;
    uint256 oracleKey;
    address maker;
    address taker;
    address oracleSigner;
    uint256 nextNonce = 1;

    function setUp() public virtual {
        vm.warp(T0);
        (maker, makerKey) = makeAddrAndKey("maker");
        (taker, takerKey) = makeAddrAndKey("taker");
        (oracleSigner, oracleKey) = makeAddrAndKey("switchboard-oracle");
        usdc = new MockUSDC();
        sb = new MockSwitchboard();
        sb.setOracle(oracleSigner, true);
        oracle = new SwitchboardSettlementOracle(ISwitchboardOnDemand(address(sb)), 1 hours);
        hourly = new Hourly(usdc, admin, treasury, settler, oracle, FEE_BPS);
    }

    // ------------------------------------------------------------ helpers

    function createSeries(uint8 kind, uint64 strike, uint64 cap, uint64 units, uint64 start, uint64 expiry)
        internal
        returns (uint256)
    {
        vm.prank(admin);
        return hourly.createSeries(H100, kind, strike, cap, units, start, expiry, FEED);
    }

    function fund(address who, uint256 amount) internal {
        usdc.mint(who, amount);
        vm.prank(who);
        usdc.approve(address(hourly), type(uint256).max);
    }

    function quote(uint256 id, address mk, bool makerSells, uint256 qty, uint256 premium, uint64 quoteExpiry)
        internal
        returns (Hourly.Quote memory q)
    {
        q = Hourly.Quote({
            seriesId: id,
            maker: mk,
            taker: address(0),
            makerSells: makerSells,
            qty: qty,
            premium: premium,
            quoteExpiry: quoteExpiry,
            nonce: nextNonce++
        });
    }

    function sign(uint256 key, Hourly.Quote memory q) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, hourly.hashQuote(q));
        return abi.encodePacked(r, s, v);
    }

    /// The Solana `fill(buyer, seller, qty, premium, quote_expiry)`: here the
    /// seller is the maker who signs, the buyer is the taker who submits.
    function fillSell(uint256 id, uint256 sellerKey, address buyer, uint256 qty, uint256 premium, uint64 qe) internal {
        address seller = vm.addr(sellerKey);
        Hourly.Quote memory q = quote(id, seller, true, qty, premium, qe);
        bytes memory sig = sign(sellerKey, q);
        vm.prank(buyer);
        hourly.fill(q, sig);
    }

    /// The maker signs as BUYER; the taker submits and writes.
    function fillBuy(uint256 id, uint256 buyerKey, address seller, uint256 qty, uint256 premium, uint64 qe) internal {
        address buyer = vm.addr(buyerKey);
        Hourly.Quote memory q = quote(id, buyer, false, qty, premium, qe);
        bytes memory sig = sign(buyerKey, q);
        vm.prank(seller);
        hourly.fill(q, sig);
    }

    function settleBackup(uint256 id, uint64 price) internal {
        vm.prank(settler);
        hourly.settle(id, price, bytes32(uint256(7)));
    }

    /// Builds a Switchboard EVM update in the crossbar wire format
    /// (header: slot u64 BE, timestamp u64 BE, numFeeds u8, numSigs u8;
    /// feed: id 32, value i128 BE, minSamples u8; sig: r, s, v) signed by `key`.
    function sbUpdate(uint256 key, bytes32 feedId, int128 value, uint64 ts, uint64 slot)
        internal
        view
        returns (bytes memory)
    {
        bytes memory unsigned = abi.encodePacked(slot, ts, uint8(1), uint8(1), feedId, value, uint8(1));
        bytes memory placeholder = abi.encodePacked(unsigned, new bytes(65));
        (bytes32 h,) = sb.messageHash(placeholder);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, h);
        return abi.encodePacked(unsigned, r, s, v);
    }

    function one(bytes memory u) internal pure returns (bytes[] memory a) {
        a = new bytes[](1);
        a[0] = u;
    }
}
