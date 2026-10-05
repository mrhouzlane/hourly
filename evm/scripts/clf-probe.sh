#!/usr/bin/env bash
# Probe Chainlink Functions routers on-chain (eth_call only, no transaction).
# Usage: bash scripts/clf-probe.sh
# For each network: router code size, typeAndVersion, paused() and the coordinator
# registered for the DON id. Whether a DON still answers: scripts/clf-liveness.py.
set -u
CAST="${CAST:-$HOME/.foundry/bin/cast}"

probe() {
  local name="$1" rpc="$2" router="$3" don="$4"
  echo "== $name router=$router don=$don"
  local code
  code=$("$CAST" code "$router" --rpc-url "$rpc" 2>&1)
  echo "code bytes: $(( (${#code} - 2) / 2 ))"
  echo "typeAndVersion: $("$CAST" call "$router" 'typeAndVersion()(string)' --rpc-url "$rpc" 2>&1 | head -1)"
  echo "paused: $("$CAST" call "$router" 'paused()(bool)' --rpc-url "$rpc" 2>&1 | head -1)"
  local donhex
  donhex=$("$CAST" format-bytes32-string "$don")
  echo "donId hex: $donhex"
  local coord
  coord=$("$CAST" call "$router" 'getContractById(bytes32)(address)' "$donhex" --rpc-url "$rpc" 2>&1 | head -1)
  echo "coordinator: $coord"
  local head
  head=$("$CAST" block-number --rpc-url "$rpc" 2>&1)
  echo "head block: $head ts $("$CAST" block "$head" -f timestamp --rpc-url "$rpc" 2>&1 | head -1)"
}

probe base-sepolia https://sepolia.base.org 0xf9B8fc078197181C841c296C876945aaa425B278 fun-base-sepolia-1
probe eth-sepolia https://ethereum-sepolia-rpc.publicnode.com 0xb83E47C2bC239B3bf370bc41e1459A34b41238D0 fun-ethereum-sepolia-1
probe arb-sepolia https://sepolia-rollup.arbitrum.io/rpc 0x234a5fb5Bd614a7AA2FfAB244D603abFA0Ac5C5C fun-arbitrum-sepolia-1
probe avax-fuji https://api.avax-test.network/ext/bc/C/rpc 0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0 fun-avalanche-fuji-1
probe base-mainnet https://mainnet.base.org 0xf9b8fc078197181c841c296c876945aaa425b278 fun-base-mainnet-1
probe arb-mainnet https://arb1.arbitrum.io/rpc 0x97083e831f8f0638855e2a515c90edcf158df238 fun-arbitrum-mainnet-1
probe eth-mainnet https://ethereum-rpc.publicnode.com 0x65Dcc24F8ff9e51F10DCc7Ed1e4e2A61e6E14bd6 fun-ethereum-mainnet-1
