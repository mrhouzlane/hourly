#!/usr/bin/env python3
"""Is any Chainlink Functions DON still answering? Read-only.

For each router, ask the chain's Blockscout explorer for the router's newest
logs and report the newest RequestStart and the newest RequestProcessed with
their block timestamps. A DON that is alive answers RequestStart with
RequestProcessed within minutes (the docs' fulfilment timeout is 5 minutes).

Usage: python3 scripts/clf-liveness.py
"""

import json
import sys
import urllib.request

ROUTERS = [
    (
        "base-sepolia",
        "base-sepolia.blockscout.com",
        "0xf9B8fc078197181C841c296C876945aaa425B278",
    ),
    (
        "eth-sepolia",
        "eth-sepolia.blockscout.com",
        "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0",
    ),
    (
        "arb-sepolia",
        "arbitrum-sepolia.blockscout.com",
        "0x234a5fb5Bd614a7AA2FfAB244D603abFA0Ac5C5C",
    ),
    (
        "op-sepolia",
        "optimism-sepolia.blockscout.com",
        "0xC17094E3A1348E5C7544D4fF8A36c28f2C6AAE28",
    ),
    (
        "polygon-amoy",
        "polygon-amoy.blockscout.com",
        "0xC22a79eBA640940ABB6dF0f7982cc119578E11De",
    ),
    (
        "base-mainnet",
        "base.blockscout.com",
        "0xf9b8fc078197181c841c296c876945aaa425b278",
    ),
    (
        "arb-mainnet",
        "arbitrum.blockscout.com",
        "0x97083e831f8f0638855e2a515c90edcf158df238",
    ),
    (
        "op-mainnet",
        "optimism.blockscout.com",
        "0xaA8AaA682C9eF150C0C8E96a8D60945BCB21faad",
    ),
    ("eth-mainnet", "eth.blockscout.com", "0x65Dcc24F8ff9e51F10DCc7Ed1e4e2A61e6E14bd6"),
    (
        "polygon-mainnet",
        "polygon.blockscout.com",
        "0xdc2AAF042Aeff2E68B3e8E33F19e4B9fA7C73F10",
    ),
]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "curl/8"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def block_time(host, n, cache={}):
    if (host, n) not in cache:
        cache[(host, n)] = get(f"https://{host}/api/v2/blocks/{n}")["timestamp"]
    return cache[(host, n)]


def main():
    for name, host, router in ROUTERS:
        try:
            items = get(f"https://{host}/api/v2/addresses/{router}/logs").get(
                "items", []
            )
        except Exception as e:  # noqa: BLE001 - report and keep going
            print(f"{name:16} ERROR {e}")
            continue
        newest = {}
        for it in items:
            m = ((it.get("decoded") or {}).get("method_call") or "?").split("(")[0]
            if m not in newest:
                newest[m] = it["block_number"]
        parts = []
        for ev in ("RequestStart", "RequestProcessed"):
            if ev in newest:
                parts.append(f"{ev} @ {newest[ev]} {block_time(host, newest[ev])}")
            else:
                parts.append(f"{ev} none in newest {len(items)} logs")
        print(f"{name:16} " + " | ".join(parts))


if __name__ == "__main__":
    sys.exit(main())
