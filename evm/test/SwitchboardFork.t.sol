// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {MockUSDC} from "./mocks/Mocks.sol";
import {Hourly} from "../contracts/Hourly.sol";
import {SwitchboardSettlementOracle, ISwitchboardOnDemand} from "../contracts/oracles/SwitchboardSettlementOracle.sol";

interface ISbV2 {
    function verifierAddress() external view returns (address);
    function version() external pure returns (string memory);
    function updateFeeds(bytes[] calldata updates) external payable;
}

interface ISbVerifier {
    function switchboardQueue() external view returns (address);
}

interface ISbQueue {
    function maxAge() external view returns (uint256);
    function oracleSigningKeys(address) external view returns (uint256);
    function isValidOracleSigningKey(address) external view returns (bool);
}

/// Fork tests against the REAL Switchboard On-Demand v2.0.0 contracts, with the
/// REAL crossbar bytes in test/fixtures. Opt-in because they need RPC access:
///   SB_FORK=1 forge test --match-contract SwitchboardFork -vv
/// RPCs default to the public endpoints and can be overridden with
/// MONAD_RPC, HYPEREVM_RPC, MONAD_TESTNET_RPC.
///
/// What they prove, per chain:
///  1. live state: the genuine update reverts "No valid signatures";
///  2. cause: the signer crossbar used IS registered on that chain's queue, but
///     its registration is older than the queue's maxAge (30 days), so
///     isValidOracleSigningKey is false. Nothing else is wrong with the bytes;
///  3. once the key's registration timestamp is refreshed (what Switchboard's
///     admin does with setOracleKeys; simulated here with vm.store on the
///     queue's oracleSigningKeys mapping), the same genuine bytes settle an
///     Hourly series at 2.715 through SwitchboardSettlementOracle, and a copy
///     with the value tampered still reverts.
abstract contract SwitchboardForkBase is Base {
    /// SwitchboardQueue storage: slot 0 maxAge, 1 guardianMaxAge, 2 oracleSigningKeys
    /// (OZ v5 upgradeable bases use ERC-7201 namespaced storage). Asserted below.
    uint256 constant ORACLE_KEYS_SLOT = 2;

    ISbV2 live;
    ISbQueue queue;
    bytes encoded;
    bytes tampered;
    bytes32 feedId;
    address signer;
    uint64 ts;
    bool forked;

    function rpc() internal view virtual returns (string memory);
    function switchboardAddr() internal pure virtual returns (address);
    function fixture() internal pure virtual returns (string memory);
    function chainId() internal pure virtual returns (uint256);

    function setUp() public override {
        if (!vm.envOr("SB_FORK", false)) return;
        vm.createSelectFork(rpc());
        forked = true;
        assertEq(block.chainid, chainId(), "forked the intended chain");
        live = ISbV2(switchboardAddr());
        queue = ISbQueue(ISbVerifier(live.verifierAddress()).switchboardQueue());

        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/", fixture()));
        encoded = vm.parseJsonBytes(json, ".encoded");
        feedId = vm.parseJsonBytes32(json, ".feedId");
        signer = vm.parseAddress(string.concat("0x", vm.parseJsonString(json, ".oracles[0].ethAddress")));
        ts = uint64(vm.parseJsonUint(json, ".timestamp"));
        tampered = _tamper(encoded);

        // Hourly wired to the REAL Switchboard contract (no mock).
        (maker, makerKey) = makeAddrAndKey("maker");
        (taker, takerKey) = makeAddrAndKey("taker");
        usdc = new MockUSDC();
        oracle = new SwitchboardSettlementOracle(ISwitchboardOnDemand(address(live)), 1 hours);
        hourly = new Hourly(usdc, admin, treasury, settler, oracle, FEE_BPS);
    }

    /// Flip the low byte of the int128 value (bytes 50..65 after an 18-byte header + 32-byte feed id).
    function _tamper(bytes memory e) internal pure returns (bytes memory t) {
        t = bytes.concat(e);
        t[18 + 32 + 15] = bytes1(uint8(t[18 + 32 + 15]) ^ 0x01);
    }

    function _skipUnlessForked() internal {
        if (!forked) vm.skip(true);
    }

    function test_fork_live_state_rejects_genuine_update() public {
        _skipUnlessForked();
        assertEq(live.version(), "2.0.0");
        bytes[] memory u = new bytes[](1);
        u[0] = encoded;
        vm.expectRevert(bytes("No valid signatures"));
        live.updateFeeds(u);
    }

    function test_fork_cause_is_expired_key_registration() public {
        _skipUnlessForked();
        uint256 registeredAt = queue.oracleSigningKeys(signer);
        assertGt(registeredAt, 0, "crossbar's signer is registered on this queue");
        assertEq(queue.maxAge(), 30 days);
        assertGt(block.timestamp, registeredAt + queue.maxAge(), "registration older than maxAge");
        assertFalse(queue.isValidOracleSigningKey(signer), "so the key is rejected");
        // the storage slot we refresh below is the one the getter reads
        assertEq(uint256(vm.load(address(queue), _keySlot(signer))), registeredAt);
        assertEq(uint256(vm.load(address(queue), bytes32(0))), queue.maxAge());
    }

    function test_fork_refreshed_key_settles_genuine_and_rejects_tampered() public {
        _skipUnlessForked();
        uint64 expiry = 1_791_072_000; // 2026-10-04 00:00 UTC, after the 10-03 print
        vm.warp(expiry - 2 * DAY);
        vm.prank(admin);
        uint256 s = hourly.createSeries(H100, CALL, 2_600_000, 400_000, 48, expiry - 2 * DAY, expiry, feedId);
        _fund(maker);
        _fund(taker);
        fillSell(s, makerKey, taker, 1, 3 * USD, expiry - DAY);
        vm.warp(ts + 30);

        // as deployed: rejected
        vm.expectRevert(SwitchboardSettlementOracle.OracleVerify.selector);
        hourly.settleOracle(s, one(encoded));

        // Switchboard re-registers its oracle keys (simulated)
        vm.store(address(queue), _keySlot(signer), bytes32(uint256(block.timestamp)));
        assertTrue(queue.isValidOracleSigningKey(signer));

        // tampered value: the signature now recovers to an unregistered address
        vm.expectRevert(SwitchboardSettlementOracle.OracleVerify.selector);
        hourly.settleOracle(s, one(tampered));

        hourly.settleOracle(s, one(encoded));
        Hourly.Series memory ser = hourly.series(s);
        assertTrue(ser.settledByOracle);
        assertEq(ser.settlePrice, 2_715_000);
        assertEq(ser.payoffPerContract, 115_000 * 48);
    }

    function _keySlot(address k) internal pure returns (bytes32) {
        return keccak256(abi.encode(k, ORACLE_KEYS_SLOT));
    }

    function _fund(address who) internal {
        usdc.mint(who, 1_000 * USD);
        vm.prank(who);
        usdc.approve(address(hourly), type(uint256).max);
    }
}

/// Monad mainnet (143), crossbar mainnet bytes.
contract SwitchboardForkMonadTest is SwitchboardForkBase {
    function chainId() internal pure override returns (uint256) {
        return 143;
    }

    function rpc() internal view override returns (string memory) {
        return vm.envOr("MONAD_RPC", string("https://rpc.monad.xyz"));
    }

    function switchboardAddr() internal pure override returns (address) {
        return 0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67;
    }

    function fixture() internal pure override returns (string memory) {
        return "sb-mainnet.json";
    }
}

/// HyperEVM (999), crossbar mainnet bytes.
contract SwitchboardForkHyperEvmTest is SwitchboardForkBase {
    function chainId() internal pure override returns (uint256) {
        return 999;
    }

    function rpc() internal view override returns (string memory) {
        return vm.envOr("HYPEREVM_RPC", string("https://rpc.hyperliquid.xyz/evm"));
    }

    function switchboardAddr() internal pure override returns (address) {
        return 0xcDb299Cb902D1E39F83F54c7725f54eDDa7F3347;
    }

    function fixture() internal pure override returns (string memory) {
        return "sb-mainnet.json";
    }
}

/// Monad testnet (10143), crossbar testnet bytes.
contract SwitchboardForkMonadTestnetTest is SwitchboardForkBase {
    function chainId() internal pure override returns (uint256) {
        return 10143;
    }

    function rpc() internal view override returns (string memory) {
        return vm.envOr("MONAD_TESTNET_RPC", string("https://testnet-rpc.monad.xyz"));
    }

    function switchboardAddr() internal pure override returns (address) {
        return 0x6724818814927e057a693f4e3A172b6cC1eA690C;
    }

    function fixture() internal pure override returns (string memory) {
        return "sb-testnet.json";
    }
}
