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
- **VERIFIED (2026-10-05, eth_call + fork tests)**: why the v2.0.0 contracts reject the signature. The oracle keys crossbar signs with ARE registered on every v2.0.0 queue, but each registration is older than the queue's 30-day `maxAge` (Monad mainnet expired 2026-05-28, Monad testnet 2026-08-07, HyperEVM 2025-12-10), and only Switchboard's admin can refresh them. Refreshing the key on a fork makes the genuine bytes settle and a tampered copy revert. Full write-up: `SWITCHBOARD_EVM.md`; fork tests: `SB_FORK=1 forge test --match-contract SwitchboardFork`.

What this means for the build:

- `contracts/oracles/SwitchboardSettlementOracle.sol` targets the v2.0.0 interface (`getFee`, `updateFeeds(bytes[])`, `getLatestValue`). It will work unchanged once a deployed queue accepts crossbar's oracle keys.
- Until then, deploy with `NoOracle`. Every series then settles through the backup settler, which can act only 72 hours after expiry, the same rule as on Solana.

## What is in here

| File | What it is |
|---|---|
| `contracts/Hourly.sol` | Series, RFQ fills, close, settlement, redeem, reclaim, pause, fee, vault hook. Longs are ERC-1155 tokens (token id = series id). Shorts are tracked internally in `positionOf`. |
| `contracts/HourlyVault.sol` | One underwriting epoch per contract. The contract is also the LP share token (ERC-20, 6 decimals, minted 1:1 with deposits). |
| `contracts/HourlyMath.sol` | Payoff, fee and 1e18 → 1e6 conversion, identical to `lib.rs`. |
| `contracts/oracles/SwitchboardSettlementOracle.sol` | Switchboard adapter: checks the feed id, requires the update timestamp to be at or after expiry and no older than `maxAge`, then refunds any excess fee. |
| `contracts/oracles/NoOracle.sol` | Always reverts, so only the 72-hour backup settler can settle. |
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
npm run setup          # OpenZeppelin 5.6.1 + Switchboard on-demand-solidity 1.1.0 from npm, forge-std v1.11.0
forge test             # 28 tests
```

Result on 2026-10-04 (forge 1.7.1, solc 0.8.28): **28 passed, 0 failed.**

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
