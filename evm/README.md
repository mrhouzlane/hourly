# Hourly on EVM

A port of the Solana program (`program/programs/hourly/src/lib.rs`) to Solidity, so MetaMask users can trade the same contracts: fully collateralized call spreads, put spreads and digitals on averages of Ornn's GPU rental price index, RFQ fills, a 1% fee to the treasury (capped at 5%), close, oracle settlement with a 72-hour backup settler, redeem, reclaim, a trading pause, and weekly underwriting vaults.

Nothing here is deployed, audited, or pushed. A testnet deploy script exists and has only been run in simulation.

## Oracle verdict (checked live on 2026-10-04)

**No EVM chain verifies a Switchboard update for our custom Ornn feed today.** Crossbar signs the feed for EVM without trouble. Every deployed Switchboard EVM contract I tested either rejects the signature or quietly ignores the update.

| Chain | Switchboard contract | What happened with our crossbar update | Verdict |
|---|---|---|---|
| Arbitrum Sepolia (421614) | `0xA2a0425fA3C5669d384f4e6c8068dfCf64485b3b` | This is a legacy Diamond contract with no `version()` or `getLatestValue`. On a local anvil fork, `updateFeeds(bytes[])` returned success for both the genuine update and a tampered one (29,685 gas, nothing stored). Afterwards `latestUpdate(feedId)` still reverts with `0xc9b8aa83`. | Not usable. It silently ignores v2 payloads. |
| Arbitrum One (42161) | `0xAd9b8604b6B97187CDe9E826cDeB7033C8C37198` | Same legacy Diamond behaviour (eth_call only). | Not usable |
| Monad testnet (10143) | `0x6724818814927e057a693f4e3A172b6cC1eA690C` | `version()` is 2.0.0. `updateFeeds` reverts with "No valid signatures". | Not usable today |
| Monad mainnet (143) | `0xB7F03eee7B9F56347e32cC71DaD65B303D5a0E67` | `version()` is 2.0.0 and the fee is 0. Our update fails with "No valid signatures". So does a fresh crossbar update for a feed that already lives on this contract (`0x7418dc64...23ee`). The newest update among its 72 feeds is dated 2026-05-28. | Not usable today. It was checked with eth_call only, no transaction. |
| HyperEVM (999) | `0xcDb299Cb902D1E39F83F54c7725f54eDDa7F3347` | `version()` is 2.0.0. Our update fails with "No valid signatures". The contract has 2 feeds, last updated 2025-11-10. | Not usable today |
| Base / Base Sepolia | none listed | Base is not in Switchboard's EVM deployment table. | No path |

Sources and evidence:

- **VERIFIED**: the deployment table (Arbitrum, Core, HyperEVM, Monad and Morph; no Base) comes from https://docs.switchboard.xyz/docs-by-chain/evm (fetched this session as `.md`).
- **VERIFIED**: a custom feed on EVM goes through `fetchV2Update(feedHash, {chain: "evm", network, use_timestamp: true})` → `switchboard.updateFeeds{value: getFee}(updates)` → `latestUpdate` or `getLatestValue(feedId)`. The legacy `fetchEVMResults` and `/updates/evm` routes are only for old aggregator feeds. Sources: https://docs.switchboard.xyz/docs-by-chain/evm/price-feeds/price-feeds-tutorial and https://docs.switchboard.xyz/ai-agents-llms/switchboard-agent-skill/switchboard-evm-feeds
- **VERIFIED**: the Solidity interface comes from the npm package `@switchboard-xyz/on-demand-solidity@1.1.0` (`ISwitchboard.sol`, `SwitchboardEncoding.sol`, `SwitchboardSignatureVerification.sol`). The signature scheme is secp256k1 ECDSA over `sha256(slot LE ‖ timestamp LE ‖ feedId ‖ value i128 LE ‖ minSamples)`. The contract accepts the update if the recovered signer is a registered oracle key on its queue.
- **VERIFIED**: `crossbar.switchboard.xyz` has no A record. https://dns.google/resolve?name=crossbar.switchboard.xyz&type=A returns NOERROR with no answer. `crossbar.switchboardlabs.xyz` resolves to 139.162.92.192 and works.
- **VERIFIED (live crossbar, 2026-10-04 17:51 UTC)**, using `app/node_modules/@switchboard-xyz/common@5.8.5` against `https://crossbar.switchboardlabs.xyz`:
  - `storeOracleFeed(oracleFeed("H100_SXM", ["2026-10-02","2026-10-03"]))` returned feed id `0xe627418b4e8ee8970d37ebdd1eb365a79305d0dbe76a6faf54599023ac6a84e3`.
  - `fetchOracleQuote([feedId], "testnet" | "mainnet")` and `fetchV2Update(..., {chain: "evm"})` both work. They return a 132-byte `encoded` update with value `2715000000000000000` (2.715) and one oracle signature. The updates are saved in `test/fixtures/sb-*.json`.
  - `fetchEVMResults({chainId: 421614})` returned "Aggregator 0xe627... does not exist". `fetchEVMResults({chainId: 84532})` returned HTTP 400. This legacy route does not serve custom feeds.
- **VERIFIED (forge test)**: the real crossbar bytes decode with Switchboard's own library, carry our feed id and 2.715, and the ECDSA signature recovers to the oracle address crossbar reported (`test/SwitchboardFixture.t.sol`). Once that key is registered in the mock registry, the same bytes settle a series at 2_715_000 through `SwitchboardSettlementOracle`.
- **UNVERIFIED (my hypothesis)**: why the v2.0.0 contracts reject the signature. The likely cause is that the oracle keys registered on the EVM queues are not the oracles that `crossbar.switchboardlabs.xyz` routes to, or that those keys have expired. The canonical crossbar has no DNS, so I could not try it. Switchboard would have to confirm which crossbar and queue serve EVM in 2026.

What this means for the build:

- `contracts/oracles/SwitchboardSettlementOracle.sol` targets the v2.0.0 interface (`getFee`, `updateFeeds(bytes[])`, `getLatestValue`). It will work unchanged once a deployed queue accepts crossbar's oracle keys.
- Until then, deploy with `NoOracle`. Every series then settles through the backup settler, which can act only 72 hours after expiry, the same rule as on Solana.

## Second adapter: Chainlink Functions (built 2026-10-05, not usable today)

`contracts/oracles/ChainlinkFunctionsSettlementOracle.sol` lets a Chainlink Functions DON fetch Ornn's index and return the window mean. It is built and tested against a mock router. **It cannot settle anything on a live chain today, because Chainlink has shut Functions down.**

### Live findings (2026-10-05)

- **VERIFIED, deprecated.** https://docs.chain.link/chainlink-functions/supported-networks (fetched with curl, HTTP 200) says: "Chainlink Functions has been deprecated (mainnet: June 30, 2026, testnet: June 15, 2026)... Migrate to the Chainlink Runtime Environment (CRE)". The same banner is on the service-limits and billing pages.
- **VERIFIED, the DONs no longer answer.** `python3 scripts/clf-liveness.py` reads each router's newest logs from Blockscout. On every chain checked, `RequestStart` events kept arriving after the last `RequestProcessed`:

  | Chain | Newest RequestProcessed | Newest RequestStart |
  |---|---|---|
  | Base Sepolia | 2026-06-10 | 2026-08-07 (unanswered) |
  | Ethereum Sepolia | 2026-06-17 | 2026-08-10 (unanswered) |
  | Arbitrum Sepolia | none in the newest 50 logs | 2026-06-17 |
  | OP Sepolia | 2025-11-19 | 2026-06-18 |
  | Base | 2026-07-31 | 2026-08-25 (unanswered) |
  | Arbitrum One | none in the newest 50 logs | 2026-09-18 |
  | Ethereum | 2026-08-11 | 2026-09-03 (unanswered) |
  | Polygon | 2026-07-02 | 2026-08-17 (unanswered) |

  Not checked: Avalanche, Celo, Soneium, zkSync, Polygon Amoy (its Blockscout returned 404).
- **VERIFIED (eth_call, `bash scripts/clf-probe.sh`).** The routers are still deployed, report `Functions Router v1.0.0`, are not paused, and still map their DON ids to a coordinator on Base Sepolia, Ethereum Sepolia, Arbitrum Sepolia, Avalanche Fuji, Base, Arbitrum One and Ethereum. So `requestSettlement` would succeed and lock LINK, but no answer would come back.
- **VERIFIED, networks listed on the docs page** (router, DON id). Testnets: Ethereum Sepolia `0xb83E47C2bC239B3bf370bc41e1459A34b41238D0` `fun-ethereum-sepolia-1`; Base Sepolia `0xf9B8fc078197181C841c296C876945aaa425B278` `fun-base-sepolia-1`; Arbitrum Sepolia `0x234a5fb5Bd614a7AA2FfAB244D603abFA0Ac5C5C` `fun-arbitrum-sepolia-1`; OP Sepolia `0xC17094E3A1348E5C7544D4fF8A36c28f2C6AAE28` `fun-optimism-sepolia-1`; Avalanche Fuji `0xA9d587a00A31A52Ed70D6026794a8FC5E2F5dCb0` `fun-avalanche-fuji-1`; Polygon Amoy `0xC22a79eBA640940ABB6dF0f7982cc119578E11De` `fun-polygon-amoy-1`; also Celo Alfajores, Soneium Minato and zkSync Sepolia. Mainnets: Ethereum, Arbitrum, Base, OP, Polygon, Avalanche, Celo, Soneium, zkSync. The on-chain DON id is the ASCII name right-padded to bytes32.
- **VERIFIED, limits** (https://docs.chain.link/chainlink-functions/resources/service-limits): callback gas at most 300,000; request at most 30 KB (source, args and secrets); return value at most 256 bytes; 10 s execution; 128 MB memory; 5 HTTP queries, 9 s each, 2 MB response; request timeout 5 minutes; 100 consumers per subscription.
- **VERIFIED, funding** (https://docs.chain.link/chainlink-functions/resources/billing and `/resources/architecture`): a subscription is prepaid in LINK only. Each request reserves the estimated gas plus a USD-denominated premium (320 cents in the docs' example network), and the actual cost is charged at fulfilment. The subscription owner must first accept the Terms of Service, which puts the EOA on the `TermsOfServiceAllowList`, and must add each consumer contract to the subscription. The docs do this through the browser Subscription Manager, which cannot be done from this headless VM.
- **VERIFIED, no domain allowlist.** Neither the service-limits page nor the architecture page lists any restriction on which hosts the source may call. The only allowlist they mention is the ToS allowlist for subscription owners. `api.ornnai.com` is public with no key, so the request needs no secrets.
- **UNVERIFIED.** Whether CRE (the successor) can run this same job, and what it costs. I did not test it.

### Simulation vs the local mean (VERIFIED, 2026-10-05 03:35 UTC, live API)

`functions/settle.js` runs in Chainlink's own Deno sandbox (`@chainlink/functions-toolkit` 0.3.2 `simulateScript`, Deno 1.46.3, with the documented limits), and its answer is compared with `app/engine/ornn.js` `windowMean` on a fresh fetch of the same endpoint:

| Window | ornn.js windowMean | settle.js in simulateScript |
|---|---|---|
| H100 SXM, 2026-09-01..30 | 2.829333333333333 (30 prints), 2829333 atoms | `0x...2b2c15` = **2829333** |
| B200, 2026-08-01..31 | 6.141935483870968 (31 prints), 6141935 | 6141935 |
| A100 SXM4, 2026-09-15..10-04 | 0.9649999999999999 (20 prints), 965000 | 965000 |
| H200, 2026-10-01..10 (not over yet) | n/a | error `window incomplete` |

Reproduce with `cd functions && npm install && PATH=../.tools:$PATH node simulate.mjs H100_SXM 2026-09-01 2026-09-30`. Deno 1.46.3 goes in `evm/.tools/` (gitignored). The source parses each value as an exact decimal and rounds the mean half up to 1e-6, the same rounding as `HourlyMath.sbValueToAtoms`. It does no floating-point maths, which is why the A100 line gives 965000 rather than 964999. It adds one guard that `windowMean` lacks: a print must exist for the last window date, so a request sent before the final print fails and can be retried. On a complete window the two give the same result.

### How the adapter binds a series

1. `registerSource(settle.js)` stores the source under its keccak256 (`0x8d35ad17...23a7` for the committed file). It is content-addressed and permissionless.
2. `registerFeed(sourceHash, "H100 SXM", dates[])` returns `feedId = keccak256(abi.encode(sourceHash, gpu, dates))`. For September 2026 that is `0xa37ece55...3f7d`, and the tests check that ethers computes the same value off-chain.
3. The Hourly admin lists the series with that `feedId`. From then on the source, the GPU and every date are fixed by the hash. A different source or different args make a different feed, which cannot be attached to the series.
4. After expiry anyone can call `requestSettlement(seriesId)`. The caller passes nothing but the id. The adapter reads the series from Hourly, re-checks the stored source against its hash, and sends exactly `settle.js` + `[gpu, dates...]`.
5. `fulfillRequest` never reverts on DON input. An error, a response that is not 32 bytes, 0, or a value above uint64 stores nothing, clears the pending request and logs `SettlementFailed`, and anyone can retry. A good answer is stored per feed (evidence = request id) and the adapter calls `Hourly.settleOracle(seriesId, [])` right away. That call used 101,140 gas in the test, against a 300,000 cap. If it fails, the price stays stored and anyone can finish with `Hourly.settleOracle`.
6. A pending request blocks a new one for `retryAfter` seconds (600 by default, longer than the 5-minute timeout), so callers cannot drain the subscription by spamming requests. An answer to a superseded request is ignored. Hourly settles each series only once. A sibling series on the same feed reuses the stored price, but only if that price was requested at or after its own expiry.

Tests (`test/ChainlinkFunctions.t.sol`, 9 tests, mock router that calls back with exactly the callback gas limit and swallows reverts the way FunctionsRouter does): the happy path, including the exact CBOR bytes and full redeem/reclaim; wrong series (unknown id, unregistered feed, cross-feed, non-router caller, forged request id); early request; error and malformed responses; retry after an error and after a timeout; double settle; the shared-feed expiry rule; source tamper (content addressing, idempotent registration, and a direct storage write to the stored source makes `requestSettlement` revert with `SourceMismatch`); and one-time `bind` plus the deploy script refusing nine mainnet chain ids.

Deploy (testnet only, not run against any chain): `FUNCTIONS_SUB_ID=<id> forge script script/DeployFunctions.s.sol --rpc-url <testnet> --account hourly-deployer --broadcast`. It refuses everything except the six testnets above and anvil (31337, where it deploys `MockFunctionsRouter`). It was only run in local simulation.

## What is in here

| File | What it is |
|---|---|
| `contracts/Hourly.sol` | Series, RFQ fills, close, settlement, redeem, reclaim, pause, fee, vault hook. Longs are ERC-1155 tokens (token id = series id). Shorts are tracked internally in `positionOf`. |
| `contracts/HourlyVault.sol` | One underwriting epoch per contract. The contract is also the LP share token (ERC-20, 6 decimals, minted 1:1 with deposits). |
| `contracts/HourlyMath.sol` | Payoff, fee and 1e18 → 1e6 conversion, identical to `lib.rs`. |
| `contracts/oracles/SwitchboardSettlementOracle.sol` | Switchboard adapter: checks the feed id, requires the update timestamp to be at or after expiry and no older than `maxAge`, then refunds any excess fee. |
| `contracts/oracles/ChainlinkFunctionsSettlementOracle.sol` | Chainlink Functions adapter (see above). `functions/settle.js` is its source, and `functions/simulate.mjs` runs the local simulation. |
| `contracts/oracles/NoOracle.sol` | Always reverts, so only the 72-hour backup settler can settle. |
| `script/DeployFunctions.s.sol` | Testnet-only deploy with the Chainlink Functions adapter (six Functions testnets and anvil). |
| `scripts/clf-*.{py,sh}` | Chainlink Functions router probes (eth_call) and DON liveness (Blockscout logs). |
| `script/Deploy.s.sol` | Testnet-only deploy. It refuses any chain id outside 31337, Sepolia, Base Sepolia, Arbitrum Sepolia, Monad testnet and HyperEVM testnet. The signer comes from `--account` or `--ledger`, never from an env var. |
| `scripts/sb-*.{mjs,sh}` | The probes behind the verdict above: fetch an update, eth_call checks, an anvil fork check, and contract freshness. |
| `test/` | Ported Solana tests, fuzz, invariants, and replay of the real crossbar update. |

### Semantics vs Solana

Kept identical: payoff formulas, collateral = `cap × units` per contract, the fee paid by the buyer on top of the premium and sent to the treasury, `MAX_FEE_BPS` = 500, `FALLBACK_DELAY` = 72 h, settle-once, redeem and reclaim math, and the pause scope (blocks fills, vault deposits and vault trades; close, settle, redeem, reclaim, collect and withdraw keep working). The vault is the same too: deposits only before `depositEnd`, trading only from `depositEnd` on, a per-series cap of `side × collateral ≤ deposits × bps / 10_000`, `SeriesOutsideEpoch`, collect is idempotent, and withdrawals require the epoch to be over and every touched series collected, then pay `cash × shares / supply`. Error names are the same.

Changed for EVM:

- **Fill.** On Solana, buyer and seller co-sign one transaction. Here the maker signs an EIP-712 `Quote` (`seriesId, maker, taker, makerSells, qty, premium, quoteExpiry, nonce`) with `eth_signTypedData_v4`, and the taker submits it with `fill`. Each `(maker, nonce)` fills once, and `cancelNonce` withdraws a quote. `taker = 0` means anyone may take it. `fillBatch` fills multi-leg quotes such as collars atomically. Smart-wallet makers are supported through ERC-1271 (OpenZeppelin `SignatureChecker`).
- **Vault trades.** The quoter signs a `VaultQuote` and the taker submits it to the vault. The taker approves the vault, not Hourly. `Hourly.vaultFill` can only be called by an admin-registered vault and only pulls tokens from that vault, so a vault can never spend a user's approval to Hourly.
- **Oracle freshness.** The update timestamp must be at or after expiry (so the window is complete) and at most `maxAge` old (1 h in tests). Solana checks a quote age of 150 slots instead.
- **Overflow** is Solidity's checked arithmetic (Panic 0x11) instead of an `Overflow` error. `SelfTrade` fires directly; on Solana a duplicate-account guard fired first. `UnknownSeries`, `SeriesExists`, `BadSignature`, `QuoteUsed` and `WrongTaker` are new.
- **Gas.** On Solana the venue paid every fee. Here users pay gas in ETH or MON. Gasless trading (permit plus a relayer) is not built.

## Tests

```bash
cd evm
npm run setup          # OpenZeppelin 5.6.1, Switchboard on-demand-solidity 1.1.0, Chainlink contracts 1.5.0 from npm, forge-std v1.11.0
forge test             # 37 tests
```

Result on 2026-10-05 (forge 1.7.1, solc 0.8.28): **37 passed, 0 failed.** That is the 28 below plus the 9 in `ChainlinkFunctions.t.sol`, described above.

| Suite | Tests |
|---|---|
| `Hourly.t.sol` | All 7 Solana integration tests ported with the same numbers: the digital, call-spread and put-OTM lifecycles, close, every rejection with its exact error, pause, and the fee to treasury. Also replay/cancel, an atomic collar, fee cap and admin, oracle end-to-end, oracle stale/future/bad value, oracle fee refund, the NoOracle 72 h rule, and the 3 `lib.rs` math tests. Plus 2 fuzz tests: the payoff never exceeds collateral, and a random-terms lifecycle drains escrow to exactly 0 (512 runs each). |
| `HourlyVault.t.sol` | The Solana vault test with the same numbers (exact pro rata), vault guards, and a fuzz test of pro rata at random deposits and outcomes (512 runs). |
| `SwitchboardFixture.t.sol` | Real crossbar bytes (testnet and mainnet) decode, carry 2.715 and our feed id, and recover to the reported oracle. They settle a series once that key is registered. |
| `Invariant.t.sol` | 3 invariants, each over 128 runs × 128 calls (16,384 calls) of random fills, closes, long transfers, vault trades, settlements, redemptions, reclaims, collects, deposits and withdrawals. (1) Hourly's USDC balance ≥ `totalEscrow`. (2) For every series, escrow equals the outstanding obligations exactly: `cap×units×longs` before settlement, and `payoff×longs + (cap×units − payoff)×shorts` after. (3) The vault's per-series exposure stays within its cap. |
| `HandlerSmoke.t.sol` | A deterministic pass that makes every handler action succeed at least once, to prove the campaign can reach every path. |

Proof that the invariant campaign exercised each path: each run appends its successful-call counts to `cache/invariant-stats.log`. Aggregate them with:

```bash
awk '{for(i=1;i<=NF;i++){split($i,a,"="); s[a[1]]+=a[2]; if(a[2]>0) r[a[1]]++}} END {for(k in s) print k, s[k], "ok in", r[k]+0, "of", NR, "runs"}' cache/invariant-stats.log
```

On the run behind this README, the successful calls across 387 runs were: fill 2,536, deposit 1,596, transfer 1,060, vaultTrade 575, settle 555, withdraw 399, close 320, redeem 127, reclaim 73, collect 12.

## What is mocked

- **USDC.** `MockUSDC` is a 6-decimal token with open mint. The deploy script uses it when `USDC` is unset.
- **Switchboard.** `MockSwitchboard` decodes and hashes with Switchboard's published libraries and does real `ecrecover`. Only the oracle-key registry is a test-controlled allowlist, standing in for the deployed queue's key set.
- **Not mocked.** The crossbar payloads in `test/fixtures` are real oracle-signed bytes fetched on 2026-10-04.

## Deploy (testnet only, not run)

```bash
cast wallet import hourly-deployer --interactive      # key stays in the encrypted keystore
forge script script/Deploy.s.sol --rpc-url <testnet rpc> --account hourly-deployer --broadcast
```

The script was only run in simulation (`forge script` with no RPC, chain 31337). There is no funded key on this machine. Before any real-money use: get a licence from Ornn (its terms bar settlement use; see the top-level README), an audit, and multi-signature oracle settlement.
