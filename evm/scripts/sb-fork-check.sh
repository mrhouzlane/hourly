#!/usr/bin/env bash
# Fork check on a LOCAL anvil fork (nothing is broadcast to the real chain, no key):
# 1. submit the crossbar update for our custom Ornn feed to the deployed Switchboard contract
# 2. read latestUpdate(feedId) back
# 3. submit a tampered copy (value changed) and expect a revert
#   bash evm/scripts/sb-fork-check.sh <rpc> <switchboard> <fixture.json> [port]
set -u
BIN="${FOUNDRY_BIN:-$HOME/.foundry/bin}"
RPC="$1"; SB="$2"; FX="$3"; PORT="${4:-18545}"
ENC=$(node -e "console.log(require('$FX').encoded)")
FEED=$(node -e "console.log(require('$FX').feedId)")
# tamper: flip the last byte of the int128 value that follows the feed id
BAD=$(node -e "const e=require('$FX').encoded, f=require('$FX').feedId.slice(2); const i=e.indexOf(f)+64+32-2; const b=(parseInt(e.slice(i,i+2),16)^1).toString(16).padStart(2,'0'); console.log(e.slice(0,i)+b+e.slice(i+2))")
"$BIN/anvil" --fork-url "$RPC" --port "$PORT" --auto-impersonate --silent &
APID=$!
trap 'kill $APID 2>/dev/null' EXIT
L="http://127.0.0.1:$PORT"
for _ in $(seq 1 60); do "$BIN/cast" chain-id --rpc-url "$L" >/dev/null 2>&1 && break; sleep 0.5; done
FROM=0x1000000000000000000000000000000000000001
"$BIN/cast" rpc anvil_setBalance "$FROM" 0x56BC75E2D63100000 --rpc-url "$L" >/dev/null
echo "fork chainId: $("$BIN/cast" chain-id --rpc-url "$L")  block: $("$BIN/cast" block-number --rpc-url "$L")"
echo "-- tampered update (expect revert):"
"$BIN/cast" send "$SB" 'updateFeeds(bytes[])' "[$BAD]" --from "$FROM" --unlocked --rpc-url "$L" 2>&1 | grep -E "status|Error|revert" | head -3
echo "-- genuine update:"
"$BIN/cast" send "$SB" 'updateFeeds(bytes[])' "[$ENC]" --from "$FROM" --unlocked --rpc-url "$L" 2>&1 | grep -E "^status|Error|revert|gasUsed" | head -3
echo "-- latestUpdate(feedId) after:"
"$BIN/cast" call "$SB" 'latestUpdate(bytes32)((bytes32,int128,uint256,uint64,address))' "$FEED" --rpc-url "$L" 2>&1 | head -c 400
echo
