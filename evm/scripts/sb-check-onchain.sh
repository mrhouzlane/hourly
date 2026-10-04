#!/usr/bin/env bash
# Read-only check (eth_call, no transaction, no key): does the deployed
# Switchboard contract accept a crossbar EVM update for our custom Ornn feed?
#   bash evm/scripts/sb-check-onchain.sh <rpc> <switchboard> <fixture.json>
set -u
CAST="${CAST:-$HOME/.foundry/bin/cast}"
RPC="$1"; SB="$2"; FX="$3"
ENC=$(node -e "console.log(require('$FX').encoded)")
FEED=$(node -e "console.log(require('$FX').feedId)")
echo "chainId: $("$CAST" chain-id --rpc-url "$RPC")"
echo "version: $("$CAST" call "$SB" 'version()(string)' --rpc-url "$RPC" 2>&1)"
echo "verifier: $("$CAST" call "$SB" 'verifierAddress()(address)' --rpc-url "$RPC" 2>&1)"
echo "updateFee: $("$CAST" call "$SB" 'updateFee()(uint256)' --rpc-url "$RPC" 2>&1)"
echo "getFee: $("$CAST" call "$SB" 'getFee(bytes[])(uint256)' "[$ENC]" --rpc-url "$RPC" 2>&1)"
echo "feedExists(before): $("$CAST" call "$SB" 'feedExists(bytes32)(bool)' "$FEED" --rpc-url "$RPC" 2>&1)"
echo "updateFeeds(bytes) simulated:"
"$CAST" call "$SB" 'updateFeeds(bytes)((uint64,uint64,(bytes32,int128,uint8)[],bytes[]))' "$ENC" --rpc-url "$RPC" 2>&1 | head -c 1500
echo
echo "updateFeeds(bytes[]) simulated (legacy entry point):"
"$CAST" call "$SB" 'updateFeeds(bytes[])' "[$ENC]" --rpc-url "$RPC" 2>&1 | head -c 600
echo
echo "latestUpdate(before):"
"$CAST" call "$SB" 'latestUpdate(bytes32)((bytes32,int128,uint256,uint64,address))' "$FEED" --rpc-url "$RPC" 2>&1 | head -c 400
echo
