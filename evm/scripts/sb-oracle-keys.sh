#!/usr/bin/env bash
# Read-only: list the oracle signing keys a deployed Switchboard v2.0.0 (EVM)
# contract accepts, and whether the signer of our crossbar update is one of them.
#   bash evm/scripts/sb-oracle-keys.sh <rpc> <switchboard> <fixture.json>
set -u
CAST="${CAST:-$HOME/.foundry/bin/cast}"
RPC="$1"; SB="$2"; FX="$3"
SIGNER=0x$(node -e "console.log(require('$FX').oracles[0].ethAddress)")
VER=$("$CAST" call "$SB" 'verifierAddress()(address)' --rpc-url "$RPC")
Q=$("$CAST" call "$VER" 'getSwitchboardQueue()(address)' --rpc-url "$RPC")
echo "verifier $VER queue $Q"
echo "maxAge: $("$CAST" call "$Q" 'maxAge()(uint256)' --rpc-url "$RPC" 2>&1)"
echo "active oracle keys: $("$CAST" call "$Q" 'getActiveOracleSigningKeys()(address[])' --rpc-url "$RPC" 2>&1)"
echo "our signer $SIGNER valid: $("$CAST" call "$Q" 'isValidOracleSigningKey(address)(bool)' "$SIGNER" --rpc-url "$RPC" 2>&1)"
