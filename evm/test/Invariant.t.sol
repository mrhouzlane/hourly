// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";

import {Hourly} from "../contracts/Hourly.sol";
import {HourlyVault} from "../contracts/HourlyVault.sol";
import {ISettlementOracle} from "../contracts/interfaces/ISettlementOracle.sol";
import {NoOracle} from "../contracts/oracles/NoOracle.sol";
import {MockUSDC} from "./mocks/Mocks.sol";

/// Drives random sequences of fills, closes, long transfers, vault trades,
/// settlements, redemptions, reclaims and vault collects/withdrawals.
contract Handler is Test {
    uint64 constant DAY = 86_400;
    uint256 constant USD = 1e6;

    Hourly public hourly;
    MockUSDC public usdc;
    HourlyVault public vault;
    address public admin;
    address public settler;
    uint256[] public ids;
    uint256[] internal keys;
    address[] public actors;
    uint256 quoterKey;
    uint256 nonce = 1;
    // ghost counters: successful calls, so a passing run proves the paths ran
    mapping(bytes32 => uint256) public ok;

    constructor(Hourly h, MockUSDC u, address admin_, address settler_, uint256[] memory ids_, HourlyVault v, uint256 qk) {
        hourly = h;
        usdc = u;
        admin = admin_;
        settler = settler_;
        ids = ids_;
        vault = v;
        quoterKey = qk;
        for (uint256 i = 0; i < 4; i++) {
            (address a, uint256 k) = makeAddrAndKey(string.concat("actor", vm.toString(i)));
            actors.push(a);
            keys.push(k);
            usdc.mint(a, 1_000_000 * USD);
            vm.startPrank(a);
            usdc.approve(address(h), type(uint256).max);
            usdc.approve(address(v), type(uint256).max);
            vm.stopPrank();
        }
    }

    function idCount() external view returns (uint256) {
        return ids.length;
    }

    function fill(uint256 seed, uint256 qty, uint256 premium, bool makerSells) external {
        uint256 id = ids[seed % ids.length];
        uint256 mi = (seed >> 8) % actors.length;
        uint256 ti = (mi + 1 + ((seed >> 16) % (actors.length - 1))) % actors.length;
        qty = bound(qty, 1, 50);
        premium = bound(premium, 0, 500 * USD);
        Hourly.Quote memory q = Hourly.Quote(id, actors[mi], address(0), makerSells, qty, premium, type(uint64).max, nonce++);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keys[mi], hourly.hashQuote(q));
        vm.prank(actors[ti]);
        try hourly.fill(q, abi.encodePacked(r, s, v)) { ok["fill"]++; } catch {}
    }

    function close(uint256 seed, uint256 qty) external {
        uint256 id = ids[seed % ids.length];
        address a = actors[(seed >> 8) % actors.length];
        uint256 max = hourly.positionOf(id, a);
        uint256 bal = hourly.balanceOf(a, id);
        if (bal < max) max = bal;
        if (max == 0) return;
        qty = bound(qty, 1, max);
        vm.prank(a);
        try hourly.close(id, qty) { ok["close"]++; } catch {}
    }

    function transferLongs(uint256 seed, uint256 qty) external {
        uint256 id = ids[seed % ids.length];
        address from = actors[(seed >> 8) % actors.length];
        address to = actors[(seed >> 16) % actors.length];
        uint256 bal = hourly.balanceOf(from, id);
        if (bal == 0) return;
        qty = bound(qty, 1, bal);
        vm.prank(from);
        hourly.safeTransferFrom(from, to, id, qty, "");
        ok["transfer"]++;
    }

    function vaultTrade(uint256 seed, uint256 qty, uint256 premium, bool sells) external {
        uint256 id = ids[seed % ids.length];
        address t = actors[(seed >> 8) % actors.length];
        qty = bound(qty, 1, 20);
        premium = bound(premium, 0, 100 * USD);
        HourlyVault.VaultQuote memory q = HourlyVault.VaultQuote(id, address(0), sells, qty, premium, type(uint64).max, nonce++);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(quoterKey, vault.hashVaultQuote(q));
        vm.prank(t);
        try vault.trade(q, abi.encodePacked(r, s, v)) { ok["vaultTrade"]++; } catch {}
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 6 hours));
    }

    /// Jumps to the moment the backup settler may act on one series.
    /// Acts on 1 call in 8 so most of a run is spent trading before expiry.
    function jumpPastExpiry(uint256 seed) external {
        if (uint256(keccak256(abi.encode(seed))) % 8 != 0) return;
        Hourly.Series memory s = hourly.series(ids[seed % ids.length]);
        uint256 t = uint256(s.expiry) + hourly.FALLBACK_DELAY();
        if (block.timestamp < t) vm.warp(t);
    }

    function settle(uint256 seed, uint256 price) external {
        uint256 id = ids[seed % ids.length];
        Hourly.Series memory s = hourly.series(id);
        if (s.settled || block.timestamp < uint256(s.expiry) + hourly.FALLBACK_DELAY()) return;
        vm.prank(settler);
        hourly.settle(id, uint64(bound(price, 0, 10 * USD)), bytes32(0));
        ok["settle"]++;
    }

    function redeem(uint256 seed, uint256 qty) external {
        uint256 id = ids[seed % ids.length];
        address a = actors[(seed >> 8) % actors.length];
        uint256 bal = hourly.balanceOf(a, id);
        if (bal == 0 || !hourly.series(id).settled) return;
        qty = bound(qty, 1, bal);
        vm.prank(a);
        hourly.redeem(id, qty);
        ok["redeem"]++;
    }

    function reclaim(uint256 seed) external {
        uint256 id = ids[seed % ids.length];
        address a = actors[(seed >> 8) % actors.length];
        if (hourly.positionOf(id, a) == 0 || !hourly.series(id).settled) return;
        vm.prank(a);
        hourly.reclaim(id);
        ok["reclaim"]++;
    }

    function collect(uint256 seed) external {
        uint256 id = ids[seed % ids.length];
        (,, bool touched,) = vault.vaultSeries(id);
        if (!touched || !hourly.series(id).settled) return;
        vault.collect(id);
        ok["collect"]++;
    }

    function deposit(uint256 seed, uint256 amount) external {
        address a = actors[seed % actors.length];
        amount = bound(amount, 1, 10_000 * USD);
        vm.prank(a);
        try vault.deposit(amount) { ok["deposit"]++; } catch {}
    }

    function withdraw(uint256 seed, uint256 shares) external {
        address a = actors[seed % actors.length];
        uint256 bal = vault.balanceOf(a);
        if (bal == 0) return;
        shares = bound(shares, 1, bal);
        vm.prank(a);
        try vault.withdraw(shares) { ok["withdraw"]++; } catch {}
    }
}

abstract contract InvariantBase is StdInvariant, Test {
    uint64 constant DAY = 86_400;
    uint64 constant T0 = 1_791_158_400;
    Hourly hourly;
    MockUSDC usdc;
    HourlyVault vault;
    Handler handler;
    address admin = makeAddr("admin");

    function setUp() public virtual {
        vm.warp(T0);
        usdc = new MockUSDC();
        hourly = new Hourly(usdc, admin, makeAddr("treasury"), makeAddr("settler"), new NoOracle(), 100);
        (address quoter, uint256 qk) = makeAddrAndKey("quoter");
        uint256[] memory ids = new uint256[](4);
        vm.startPrank(admin);
        ids[0] = hourly.createSeries(bytes16("H100_SXM"), 0, 2_600_000, 400_000, 720, T0, T0 + 3 * DAY, bytes32(0));
        ids[1] = hourly.createSeries(bytes16("H100_SXM"), 1, 2_400_000, 500_000, 720, T0, T0 + 4 * DAY, bytes32(0));
        ids[2] = hourly.createSeries(bytes16("H100_SXM"), 2, 2_700_000, 1_000_000, 1, T0, T0 + 2 * DAY, bytes32(0));
        ids[3] = hourly.createSeries(bytes16("B200"), 2, 7_800_000, 1_000_000, 1, T0, T0 + 6 * DAY, bytes32(0));
        vault = new HourlyVault(hourly, 1, quoter, T0 + DAY / 2, T0 + 7 * DAY, 5_000);
        hourly.setVault(address(vault), true);
        vm.stopPrank();
        handler = new Handler(hourly, usdc, admin, makeAddr("settler"), ids, vault, qk);
    }

    /// The contract always holds at least what it owes.
    function checkBalanceCoversEscrow() public view {
        assertGe(usdc.balanceOf(address(hourly)), hourly.totalEscrow());
    }

    /// Per series: escrow equals exactly the outstanding obligations.
    /// Before settlement: every long is backed by one contract of collateral.
    /// After: longs are owed the payoff, writers the rest.
    function checkEscrowEqualsObligations() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.idCount(); i++) {
            uint256 id = handler.ids(i);
            Hourly.Series memory s = hourly.series(id);
            uint256 coll = uint256(s.cap) * s.units;
            uint256 longs = hourly.totalSupply(id);
            if (!s.settled) {
                assertEq(longs, s.totalShort, "longs == shorts before settlement");
                assertEq(s.openInterest, longs, "open interest == longs before settlement");
                assertEq(s.escrow, coll * longs);
            } else {
                assertLe(s.payoffPerContract, coll);
                assertEq(s.escrow, s.payoffPerContract * longs + (coll - s.payoffPerContract) * s.totalShort);
            }
            sum += s.escrow;
        }
        assertEq(sum, hourly.totalEscrow());
    }

    /// The vault never sells more than its per-series cap allows.
    function checkVaultCap() public view {
        for (uint256 i = 0; i < handler.idCount(); i++) {
            uint256 id = handler.ids(i);
            (uint256 short_, uint256 long_,,) = vault.vaultSeries(id);
            uint256 coll = hourly.collateralPerContract(id);
            uint256 cap = (vault.deposits() * vault.maxSeriesBps()) / 10_000;
            assertLe(short_ * coll, cap);
            assertLe(long_ * coll, cap);
        }
    }
}

contract HourlyInvariantTest is InvariantBase {
    function setUp() public override {
        super.setUp();
        targetContract(address(handler));
    }

    function invariant_balance_covers_escrow() public view {
        checkBalanceCoversEscrow();
    }

    function invariant_escrow_equals_obligations() public view {
        checkEscrowEqualsObligations();
    }

    function invariant_vault_cap() public view {
        checkVaultCap();
    }

    /// Appends one line per run to cache/invariant-stats.log: how many calls
    /// of each kind SUCCEEDED, so a green campaign is known to have exercised
    /// every path (aggregate with the awk line in README.md).
    function afterInvariant() external {
        string[10] memory k =
            ["fill", "close", "transfer", "vaultTrade", "settle", "redeem", "reclaim", "collect", "deposit", "withdraw"];
        string memory line = "";
        for (uint256 i = 0; i < k.length; i++) {
            line = string.concat(line, k[i], "=", vm.toString(handler.ok(bytes32(bytes(k[i])))), " ");
        }
        vm.writeLine(string.concat(vm.projectRoot(), "/cache/invariant-stats.log"), line);
    }
}
