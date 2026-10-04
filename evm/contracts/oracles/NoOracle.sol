// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISettlementOracle} from "../interfaces/ISettlementOracle.sol";

/// @notice Oracle for chains where no Switchboard path works: it always reverts,
/// so every series settles through Hourly's backup settler, which can act only
/// FALLBACK_DELAY (72 h) after expiry. Deploy this when the oracle path is not
/// verified, rather than a trusted "oracle" key that could settle at expiry.
contract NoOracle is ISettlementOracle {
    error OracleUnavailable();

    function settlementPrice(bytes32, uint64, bytes[] calldata, address)
        external
        payable
        returns (uint64, bytes32)
    {
        revert OracleUnavailable();
    }
}
