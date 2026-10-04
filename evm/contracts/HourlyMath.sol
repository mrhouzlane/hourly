// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Pure math shared with the Solana program (program/programs/hourly/src/lib.rs).
/// Prices are quote-token atoms per GPU-hour (USDC, 6 decimals: 2_640_000 = $2.64).
///
///   call    payoff/hour = min(max(S - K, 0), cap)   (a call spread K to K+cap)
///   put     payoff/hour = min(max(K - S, 0), cap)   (cap <= K)
///   digital payoff      = cap if S > K else 0       (units = 1: pays `cap` atoms)
library HourlyMath {
    uint8 internal constant KIND_CALL = 0;
    uint8 internal constant KIND_PUT = 1;
    uint8 internal constant KIND_DIGITAL = 2;

    /// Switchboard values are fixed point with 18 decimals; quote atoms use 6.
    int256 internal constant SB_TO_ATOMS = 1e12;

    error BadKind();
    error OracleBadValue();

    function collateralPerContract(uint64 cap, uint64 units) internal pure returns (uint256) {
        return uint256(cap) * uint256(units);
    }

    function payoffPerContract(uint8 kind, uint64 strike, uint64 cap, uint64 units, uint64 price)
        internal
        pure
        returns (uint256)
    {
        uint256 perHour;
        if (kind == KIND_CALL) {
            perHour = price > strike ? _min(price - strike, cap) : 0;
        } else if (kind == KIND_PUT) {
            perHour = strike > price ? _min(strike - price, cap) : 0;
        } else if (kind == KIND_DIGITAL) {
            perHour = price > strike ? cap : 0;
        } else {
            revert BadKind();
        }
        return perHour * uint256(units);
    }

    /// Fee in quote atoms, rounded down.
    function feeFor(uint256 premium, uint16 feeBps) internal pure returns (uint256) {
        return (premium * feeBps) / 10_000;
    }

    /// Converts an 18-decimal Switchboard value to 6-decimal quote atoms,
    /// rounding half up. Rejects non-positive and out-of-range values.
    function sbValueToAtoms(int256 v) internal pure returns (uint64) {
        if (v <= 0) revert OracleBadValue();
        int256 atoms = (v + SB_TO_ATOMS / 2) / SB_TO_ATOMS;
        if (atoms <= 0 || atoms > int256(uint256(type(uint64).max))) revert OracleBadValue();
        return uint64(uint256(atoms));
    }

    function _min(uint256 a, uint256 b) private pure returns (uint256) {
        return a < b ? a : b;
    }
}
