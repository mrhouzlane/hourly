# Hourly on Solana devnet

Status as of 2026-11-03. Devnet and test money only. Nothing here is mainnet, and nothing holds real funds.

## Summary

| Step | Status |
|---|---|
| 1. Devnet program matches current code | Done. Byte-identical, no redeploy |
| 2. Test USDC mint and faucet | Done. Works from the app's "Add test USDC" path |
| 3. Switchboard feed for the H100 daily price, one real update onchain | **Blocked**: Crossbar host has no DNS record |
| 4. One H100 floor market listed, vault seeded | **Blocked** by step 3: listing registers the feed with Crossbar first |
| 5. Full cycle: firm price, sign, expiry, payout from Switchboard | **Blocked** by steps 3 and 4 |
| 6. App and API env-driven, `/api/status` fixed | Done |
| 7. Playwright run against devnet | Done. 4 of 5 checks pass; the failing check is the missing market |
| 8. This file | Done |

## What is deployed

- Program: `givjbTiAfcwKbKhr5kztwgkkNGZj3E8eEceKnvio8Bf` ([explorer](https://explorer.solana.com/address/givjbTiAfcwKbKhr5kztwgkkNGZj3E8eEceKnvio8Bf?cluster=devnet)). Last deployed in slot 510183649, on 2026-10-12. Upgrade authority and admin: `G9A1tg5zgxMZg4EsoeBt8Yi5hEfwXsAEiu8zEqcAMxMT`.
- Config: initialized. Settler `6jJpMJ5qGq1TewivCJRnka9DvWrbkcsJB6aS1TMCwFG6`, Switchboard devnet queue `EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7`, one oracle signature required.
- Test USDC mint: `4Hbsnab11cyzegAXuXA8DCq3TBjwp3ZkKUgMviA1Fn2u`, 6 decimals ([explorer](https://explorer.solana.com/address/4Hbsnab11cyzegAXuXA8DCq3TBjwp3ZkKUgMviA1Fn2u?cluster=devnet)). The admin key is the mint authority.
- Admin balance: 1.9575 devnet SOL after these tests. The devnet airdrop is rate limited (`airdrop request failed. This can happen when the rate limit is reached.`). A program upgrade needs about 3 SOL of buffer, so there is no room to redeploy.

### Step 1: how the match was checked

1. `solana program dump` of the devnet program.
2. A rebuild of the current source with `HOURLY_INIT_AUTHORITY=G9A1tg5zgxMZg4EsoeBt8Yi5hEfwXsAEiu8zEqcAMxMT cargo-build-sbf --features devnet`.
3. Both binaries are 592,401 bytes once the program account's zero padding is stripped, and they are identical.

The init-authority variable matters. Without it, the build differs only because the admin key is no longer baked in.

## Transactions

All test money, all finalized on devnet.

| What | Tx |
|---|---|
| Faucet, 10,000 test USDC (API) | [4V9mVDVx…oQ64cuKoj](https://explorer.solana.com/tx/4V9mVDVxYyagpK4BqQfmY2EJLyiptmdHumZFwTDMXptW4jCx2iPFqdivRcx4ZmcseB5UpqeamVtSoG3oQ64cuKoj?cluster=devnet) |
| Faucet via the UI burner wallet (Playwright run 1) | [5mvXfnHH…zi3WsnTv](https://explorer.solana.com/tx/5mvXfnHHPSV7rdWtatywqNCYH18VTdz9rvHAshTeRmRU6ep1EJ4YYNicpAdH9mMwRY3D5q7maoi71khszi3WsnTv?cluster=devnet) |
| Faucet via the UI burner wallet (Playwright run 2) | [4fS9F34B…jzhTuUQ7](https://explorer.solana.com/tx/4fS9F34BkWoBi61rUF94XbQ73dLo9YqNU63CG1eJmG8CPqKkMj3qUbK6FfMjtb9sQjBwhZCAr5Tsk474jzhTuUQ7?cluster=devnet) |
| Switchboard oracle update | none yet (blocked) |
| Trade | none yet (blocked) |
| Payout | none yet (blocked) |

The Playwright run appends every faucet and trade signature to `devnet-txs.json`.

## The Switchboard block

The keeper reads Crossbar from `CROSSBAR_URL`. The default is now `https://crossbar.switchboard.xyz`, the default host in `@switchboard-xyz/common` (the installed `@switchboard-xyz/on-demand` is 3.10.6 already). Neither host works from this VM on 2026-11-03:

- `crossbar.switchboard.xyz`:
  - The system resolver returns nothing.
  - 1.1.1.1 and 8.8.8.8 answer `NOERROR` with zero records for A, AAAA and CNAME.
  - Switchboard's authoritative Cloudflare nameserver (`jaziel.ns.cloudflare.com`) also answers `NOERROR` with zero answers. The name exists but has no address, so the problem is on Switchboard's side, not our resolver.
  - The keeper fails with `getaddrinfo ENOTFOUND crossbar.switchboard.xyz`.
- `gateway.switchboard.xyz` and `docs.switchboard.xyz` also return no A record. `switchboard.xyz` itself resolves and returns 200.
- `crossbar.switchboardlabs.xyz` (the old host) resolves to 139.162.92.192:
  - From the VM it fails with `Connection timed out after 20002 milliseconds`.
  - From outside it fails with `connect ECONNREFUSED 139.162.92.192:443`.

On a public cluster, listing a market stores its price feed with Crossbar before the series is created (`engine/keeper.js`, `ensureFeed`), and payout fetches the signed oracle quote through Crossbar. So steps 3, 4 and 5 all wait on a working Crossbar host. Nothing was mocked to get around it.

## What changed on this branch

- `engine/keeper.js`: `CROSSBAR_URL` env var; the default host is now `crossbar.switchboard.xyz`.
- `server.js`: `/api/status` answers even when the RPC is down. It returns `rpcOk`, `rpcError` and `crossbar` instead of a 500.
- `.env.devnet.example`: the devnet settings. Localnet stays the default in `.env`.
- `scripts/devnet-e2e.js`: a Playwright run in the real UI. It covers burner wallet, test USDC, the H100 floor trade and the payout check, and logs every tx with an explorer link.

## How to rerun

```bash
cd app
# 1. start the app on devnet (separate port; the public /hourly stays as it is)
CLUSTER=devnet RPC_URL=https://api.devnet.solana.com PORT=7992 node server.js
# 2. check Crossbar first; listing and payout need it
curl -s http://127.0.0.1:7992/api/status | jq '{cluster, rpcOk, crossbar}'
getent hosts crossbar.switchboard.xyz
# 3. run the end to end
BASE=http://127.0.0.1:7992/ node scripts/devnet-e2e.js
```

**Warning:** the devnet app runs the keeper. Once Crossbar resolves, the keeper lists the whole catalog (68 markets) and seeds a vault, which costs rent in devnet SOL. With 1.96 SOL, list the single H100 floor deliberately and stop the app afterwards, rather than leaving it running.

## Not done yet

- One H100 floor (put) market listed 2 to 3 days out, with the vault seeded and labelled "seeded by us".
- A Switchboard update onchain, a signed trade and a payout. Each needs Crossbar.
- The public `/hourly` still points at localnet, whose chain was removed on 2026-10-30. Switching it to devnet is a deploy and waits on review.
- UI copy: the footer and the Chip intel note still say "Markets still settle on Ornn" (`src/mac.js` lines 251 and 1313). That names Ornn and says "settle", which breaks the copy rules. It is not changed on this branch.
