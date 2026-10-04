// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SwitchboardTypes} from "@switchboard-xyz/on-demand-solidity/libraries/SwitchboardTypes.sol";
import {SwitchboardEncoding} from "@switchboard-xyz/on-demand-solidity/libraries/SwitchboardEncoding.sol";
import {SwitchboardSignatureVerification} from
    "@switchboard-xyz/on-demand-solidity/libraries/SwitchboardSignatureVerification.sol";

import {HourlyMath} from "../../contracts/HourlyMath.sol";

/// Test USDC: 6 decimals, open mint. Also used by the testnet deploy script.
contract MockUSDC is ERC20 {
    constructor() ERC20("Test USDC", "tUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Stand-in for the deployed Switchboard On-Demand EVM contract. It uses
/// Switchboard's own published libraries (on-demand-solidity 1.1.0) to decode
/// the crossbar wire format and to build the message hash, and recovers the
/// oracle ECDSA signatures exactly as SwitchboardVerifier does. The only mocked
/// part is the oracle key registry, which tests fill in with `setOracle`.
contract MockSwitchboard {
    struct Latest {
        int128 value;
        uint256 timestamp;
        uint64 slot;
    }

    mapping(address => bool) public isOracle;
    mapping(bytes32 => Latest) internal _latest;
    uint256 public feePerUpdate;

    function setOracle(address key, bool ok) external {
        isOracle[key] = ok;
    }

    function setFee(uint256 fee) external {
        feePerUpdate = fee;
    }

    function getFee(bytes[] calldata updates) external view returns (uint256) {
        return feePerUpdate * updates.length;
    }

    function updateFeeds(bytes[] calldata updates) external payable {
        require(msg.value >= feePerUpdate * updates.length, "Insufficient fee");
        for (uint256 i = 0; i < updates.length; i++) {
            SwitchboardTypes.FeedUpdateData memory d = SwitchboardEncoding.decode(updates[i]);
            bytes32 h = SwitchboardSignatureVerification.createMessageHash(d.feedInfos, d.slotNumber, d.timestamp);
            uint256 valid;
            for (uint256 j = 0; j < d.signatures.length; j++) {
                if (isOracle[recover(h, d.signatures[j])]) valid++;
            }
            require(valid > 0, "No valid signatures");
            for (uint256 k = 0; k < d.feedInfos.length; k++) {
                Latest storage l = _latest[d.feedInfos[k].feedId];
                if (d.timestamp > l.timestamp) {
                    l.value = d.feedInfos[k].value;
                    l.timestamp = d.timestamp;
                    l.slot = d.slotNumber;
                }
            }
        }
    }

    function getLatestValue(bytes32 feedId) external view returns (int128, uint256, uint64) {
        Latest storage l = _latest[feedId];
        require(l.timestamp > 0, "Feed does not exist");
        return (l.value, l.timestamp, l.slot);
    }

    function recover(bytes32 h, bytes memory sig) public pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }
        return ecrecover(h, v, r, s);
    }

    function messageHash(bytes calldata update) external pure returns (bytes32, SwitchboardTypes.FeedUpdateData memory d) {
        d = SwitchboardEncoding.decode(update);
        return (SwitchboardSignatureVerification.createMessageHash(d.feedInfos, d.slotNumber, d.timestamp), d);
    }
}

/// Exposes the internal math library so tests can assert reverts.
contract MathHarness {
    function payoff(uint8 kind, uint64 strike, uint64 cap, uint64 units, uint64 price) external pure returns (uint256) {
        return HourlyMath.payoffPerContract(kind, strike, cap, units, price);
    }

    function fee(uint256 premium, uint16 bps) external pure returns (uint256) {
        return HourlyMath.feeFor(premium, bps);
    }

    function sbToAtoms(int256 v) external pure returns (uint64) {
        return HourlyMath.sbValueToAtoms(v);
    }
}
