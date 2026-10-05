// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Hourly} from "../contracts/Hourly.sol";
import {ChainlinkFunctionsSettlementOracle} from "../contracts/oracles/ChainlinkFunctionsSettlementOracle.sol";
import {MockUSDC} from "../test/mocks/Mocks.sol";
import {MockFunctionsRouter} from "../test/mocks/MockFunctionsRouter.sol";

/// Testnet-only deploy of Hourly settled through Chainlink Functions.
/// Refuses every chain id that is not a Functions testnet in the table below
/// (or local anvil 31337, which gets a MockFunctionsRouter). Mainnet ids revert.
///
/// Router addresses and DON ids: https://docs.chain.link/chainlink-functions/supported-networks
/// (fetched 2026-10-05). That page also says Chainlink Functions is DEPRECATED
/// (testnets June 15, 2026; mainnets June 30, 2026), and the routers show no
/// fulfilment after mid-2026 (scripts/clf-liveness.py). Expect requests sent
/// through this deploy to go unanswered unless Chainlink revives the DONs.
///
/// Signer comes from the CLI (--account <keystore> or --ledger), never from env:
///   FUNCTIONS_SUB_ID=<id> forge script script/DeployFunctions.s.sol \
///     --rpc-url $RPC --account hourly-deployer --broadcast
///
/// Env:
///   FUNCTIONS_SUB_ID  Functions subscription id (required off anvil). After the
///                     deploy, add the printed adapter as a consumer.
///   CALLBACK_GAS      default 300000 (the documented maximum)
///   RETRY_AFTER       seconds a pending request blocks a new one, default 600
///   USDC, TREASURY, SETTLER, FEE_BPS as in Deploy.s.sol
contract DeployFunctions is Script {
    function functionsConfig(uint256 chainId) public pure returns (address router, bytes32 donId) {
        if (chainId == 11155111) {
            return (0xb83E47C2bC239B3bf370bc41e1459A34b41238D0, "fun-ethereum-sepolia-1");
        }
        if (chainId == 84532) return (0xf9B8fc078197181C841c296C876945aaa425B278, "fun-base-sepolia-1");
        if (chainId == 421614) return (0x234a5fb5Bd614a7AA2FfAB244D603abFA0Ac5C5C, "fun-arbitrum-sepolia-1");
        if (chainId == 11155420) return (0xC17094E3A1348E5C7544D4fF8A36c28f2C6AAE28, "fun-optimism-sepolia-1");
        if (chainId == 43113) return (0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0, "fun-avalanche-fuji-1");
        if (chainId == 80002) return (0xC22a79eBA640940ABB6dF0f7982cc119578E11De, "fun-polygon-amoy-1");
        if (chainId == 31337) return (address(0), "local-mock");
        revert("DeployFunctions: not a Functions testnet on the allowlist");
    }

    function run() external {
        uint256 id = block.chainid;
        (address router, bytes32 donId) = functionsConfig(id); // reverts on mainnet and unknown ids
        uint64 subId = uint64(vm.envOr("FUNCTIONS_SUB_ID", uint256(0)));
        require(id == 31337 || subId != 0, "DeployFunctions: FUNCTIONS_SUB_ID required");
        string memory source = vm.readFile("functions/settle.js");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        if (router == address(0)) router = address(new MockFunctionsRouter());
        address usdc = vm.envOr("USDC", address(0));
        if (usdc == address(0)) usdc = address(new MockUSDC());
        ChainlinkFunctionsSettlementOracle adapter = new ChainlinkFunctionsSettlementOracle(
            router,
            donId,
            subId,
            uint32(vm.envOr("CALLBACK_GAS", uint256(300_000))),
            uint64(vm.envOr("RETRY_AFTER", uint256(600)))
        );
        Hourly hourly = new Hourly(
            IERC20(usdc),
            deployer,
            vm.envOr("TREASURY", deployer),
            vm.envOr("SETTLER", deployer),
            adapter,
            uint16(vm.envOr("FEE_BPS", uint256(100))),
            vm.envOr("LISTER", deployer)
        );
        adapter.bind(hourly);
        bytes32 sourceHash = adapter.registerSource(source);
        vm.stopBroadcast();

        console.log("chainId", id);
        console.log("functions router", router);
        console.log("subscription", uint256(subId));
        console.log("adapter (add as consumer)", address(adapter));
        console.log("settle.js keccak");
        console.logBytes32(sourceHash);
        console.log("Hourly", address(hourly));
        console.log("quoteToken", usdc);
    }
}
