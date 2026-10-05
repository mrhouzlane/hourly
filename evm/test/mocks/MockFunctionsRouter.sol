// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IFunctionsClient} from "@chainlink/contracts/src/v0.8/functions/v1_0_0/interfaces/IFunctionsClient.sol";

/// Stand-in for the Chainlink Functions router (FunctionsRouter v1.0.0). It
/// records every request and lets the test play the DON: `fulfill` calls the
/// consumer's `handleOracleFulfillment` with exactly the request's callback gas
/// limit and, like the real router, does not bubble a callback revert up (it
/// returns success = false). Billing, subscriptions and the coordinator are not
/// modelled.
contract MockFunctionsRouter {
    struct Req {
        address client;
        uint64 subscriptionId;
        bytes data;
        uint16 dataVersion;
        uint32 callbackGasLimit;
        bytes32 donId;
    }

    mapping(bytes32 => Req) public requests;
    bytes32 public lastRequestId;
    uint256 public count;

    function sendRequest(
        uint64 subscriptionId,
        bytes calldata data,
        uint16 dataVersion,
        uint32 callbackGasLimit,
        bytes32 donId
    ) external returns (bytes32 id) {
        id = keccak256(abi.encode(address(this), ++count));
        requests[id] = Req(msg.sender, subscriptionId, data, dataVersion, callbackGasLimit, donId);
        lastRequestId = id;
    }

    function dataOf(bytes32 id) external view returns (bytes memory) {
        return requests[id].data;
    }

    /// Plays the DON's answer. Returns whether the callback succeeded and the gas it used.
    function fulfill(bytes32 id, bytes memory response, bytes memory err) external returns (bool ok, uint256 gasUsed) {
        Req storage r = requests[id];
        require(r.client != address(0), "unknown request");
        uint256 g = gasleft();
        (ok,) = r.client.call{gas: r.callbackGasLimit}(
            abi.encodeCall(IFunctionsClient.handleOracleFulfillment, (id, response, err))
        );
        gasUsed = g - gasleft();
    }

    /// Delivers a callback for an id this router never issued (a forged or stale id).
    function fulfillRaw(address client, bytes32 id, bytes memory response, bytes memory err) external returns (bool ok) {
        (ok,) = client.call(abi.encodeCall(IFunctionsClient.handleOracleFulfillment, (id, response, err)));
    }
}
