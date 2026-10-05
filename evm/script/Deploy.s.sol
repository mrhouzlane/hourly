// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Hourly} from "../contracts/Hourly.sol";
import {ISettlementOracle} from "../contracts/interfaces/ISettlementOracle.sol";
import {NoOracle} from "../contracts/oracles/NoOracle.sol";
import {SwitchboardSettlementOracle, ISwitchboardOnDemand} from "../contracts/oracles/SwitchboardSettlementOracle.sol";
import {MockUSDC} from "../test/mocks/Mocks.sol";

/// Testnet deploy. Refuses any chain that is not on the testnet allowlist.
///
/// The signer comes from the forge CLI (--account <keystore> or --ledger), never
/// from an env var, so no key is written to a file or printed:
///
///   forge script script/Deploy.s.sol --rpc-url $RPC --account hourly-deployer --broadcast
///
/// Optional env:
///   USDC         existing test USDC; when unset a MockUSDC (open mint) is deployed
///   TREASURY     fee recipient (default: deployer)
///   SETTLER      backup settler (default: deployer)
///   FEE_BPS      default 100 (1%), max 500
///   SWITCHBOARD  Switchboard On-Demand contract; when unset, NoOracle is used and
///                every series settles through the backup settler after 72 h
///   SB_MAX_AGE   seconds, default 3600
contract Deploy is Script {
    function run() external {
        uint256 id = block.chainid;
        require(
            id == 31337 // local anvil
                || id == 11155111 // Ethereum Sepolia
                || id == 84532 // Base Sepolia
                || id == 421614 // Arbitrum Sepolia
                || id == 10143 // Monad testnet
                || id == 998, // HyperEVM testnet
            "Deploy: not a testnet on the allowlist"
        );

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address usdc = vm.envOr("USDC", address(0));
        if (usdc == address(0)) usdc = address(new MockUSDC());
        address treasury = vm.envOr("TREASURY", deployer);
        address settler = vm.envOr("SETTLER", deployer);
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(100)));
        address sb = vm.envOr("SWITCHBOARD", address(0));
        ISettlementOracle oracle = sb == address(0)
            ? ISettlementOracle(address(new NoOracle()))
            : ISettlementOracle(
                address(new SwitchboardSettlementOracle(ISwitchboardOnDemand(sb), vm.envOr("SB_MAX_AGE", uint256(3600))))
            );
        Hourly hourly = new Hourly(IERC20(usdc), deployer, treasury, settler, oracle, feeBps, vm.envOr("LISTER", deployer));
        vm.stopBroadcast();

        console.log("chainId", id);
        console.log("quoteToken", usdc);
        console.log("oracle", address(oracle), sb == address(0) ? "(NoOracle: backup settler only)" : "(Switchboard)");
        console.log("Hourly", address(hourly));
        console.log("admin", deployer);
    }
}
