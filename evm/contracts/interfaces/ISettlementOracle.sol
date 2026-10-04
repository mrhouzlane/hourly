// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pluggable settlement oracle. Hourly calls it from `settleOracle`.
/// An implementation must return the window average for `feedId` in quote atoms
/// (6 decimals), taken from a verified update produced at or after `notBefore`
/// (the series expiry), or revert. Any ETH left over from oracle fees must be
/// refunded to `refundTo`.
interface ISettlementOracle {
    function settlementPrice(bytes32 feedId, uint64 notBefore, bytes[] calldata updates, address refundTo)
        external
        payable
        returns (uint64 priceAtoms, bytes32 evidence);
}
