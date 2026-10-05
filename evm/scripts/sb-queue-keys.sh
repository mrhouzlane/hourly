#!/usr/bin/env bash
# Read a Switchboard On-Demand v2.0.0 EVM deployment's oracle key registry (eth_call only).
# Switchboard -> verifierAddress() -> switchboardQueue() -> activeOracleAddresses[i] / oracleSigningKeys(addr).
# A key is accepted only while block.timestamp <= registeredAt + maxAge (SwitchboardQueue.isValidOracleSigningKey).
#   bash evm/scripts/sb-queue-keys.sh https://rpc.monad.xyz 0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67
set -u
C="${FOUNDRY_BIN:-$HOME/.foundry/bin}/cast"
R="$1"; SB="$2"
NOW=$("$C" block --rpc-url "$R" -f timestamp)
V=$("$C" call "$SB" 'verifierAddress()(address)' --rpc-url "$R")
Q=$("$C" call "$V" 'switchboardQueue()(address)' --rpc-url "$R")
MAXAGE=$("$C" call "$Q" 'maxAge()(uint256)' --rpc-url "$R" | awk '{print $1}')
echo "chain $("$C" chain-id --rpc-url "$R")  now $(date -u -d @"$NOW" +%FT%TZ)  switchboard $SB  verifier $V  queue $Q  maxAge ${MAXAGE}s"
echo "metadata (count, slot, lastUpdated): $("$C" call "$Q" 'getOracleKeysMetadata()(uint256,uint64,uint256)' --rpc-url "$R" | awk '{print $1}' | tr '\n' ' ')"
i=0
while A=$("$C" call "$Q" 'activeOracleAddresses(uint256)(address)' "$i" --rpc-url "$R" 2>/dev/null); do
  T=$("$C" call "$Q" 'oracleSigningKeys(address)(uint256)' "$A" --rpc-url "$R" | awk '{print $1}')
  OK=$("$C" call "$Q" 'isValidOracleSigningKey(address)(bool)' "$A" --rpc-url "$R")
  echo "  [$i] $A registered $(date -u -d @"$T" +%F) expires $(date -u -d @$((T + MAXAGE)) +%F) valid=$OK"
  i=$((i + 1))
done
