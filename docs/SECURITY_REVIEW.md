# Hourly security review (pre-mainnet)

Date: 2026-10-05. Scope: authorized defensive review of our own code before mainnet.

- `program/programs/hourly/src/lib.rs` (Anchor 1.1, Solana)
- `evm/contracts/*.sol` (Hourly, HourlyVault, HourlyMath, oracle adapters)
- `app/engine/venue.js` (prepareUserTx / submitUserTx), `app/engine/market.js` (quote routing), plus the `keeper.js`, `ornn.js`, `model.js` and `server.js` code they depend on

No production code was changed. The proof tests are new files. They pass while the weakness is present. Once a fix lands, flip each one into a regression test.

- `program/programs/hourly/tests/security.rs`: `cargo test -p hourly --test security`. 2 pass.
- `evm/test/SecurityReview.t.sol`: `PATH=$HOME/.foundry/bin:$PATH forge test --match-contract SecurityReviewTest`. 2 pass.

## Summary

| ID | Sev | Where | One line |
|---|---|---|---|
| H1 | High | lib.rs:468-635, HourlyVault.sol:143-181 | The vault quoter's premium has no bound. One hot-key signature drains all LP cash. **Proven on both chains.** |
| H2 | High | keeper.js:52-58, venue.js:33,68,80 | The program admin key is a hot key on the server: fee payer, series lister and vault creator. This contradicts the MAINNET.md multisig plan. |
| M1 | Medium | lib.rs:75-86, 1008-1018 | Anyone can call `init_config` first after deploy and take admin, treasury and settler. **Proven.** |
| M2 | Medium | ornn.js:95-109, lib.rs:298-329, SwitchboardSettlementOracle.sol:54-84 | The Switchboard settlement has no print-count or completeness check, and one oracle signature is enough. |
| M3 | Medium | keeper.js:39-47 | The feed id comes from crossbar and is written on chain without being recomputed locally. |
| M4 | Medium | venue.js:164-167, market.js:167,205,217,268; model.js:171-177 | The venue pays rent for ATAs the user owns. A $0.01 trade plus closing the ATA pulls about 0.002 SOL from the venue each time. |
| M5 | Medium | ornn.js:18,64-69; market.js:11,41-52 | Quotes run on Ornn data up to 16 minutes old, or older when the fetch fails. Arbitrageurs can trade against the desk and the vaults after each print. |
| L1 | Low | lib.rs:333-340, Hourly.sol settle | The fallback settler can post any price 72 h after expiry, and its key is hot on the server. On EVM it is currently the only path that works. |
| L2 | Low | Hourly.sol:386-397 | The fee is not part of the EIP-712 Quote. A maker who signs as buyer pays the fee that is live at fill time, up to 5%. **Proven.** |
| L3 | Low | lib.rs:197,515,621,797; Hourly.sol:397 | The fee can be bypassed with `premium=0` and an off-chain side payment, or by rounding on tiny premiums. In `vault_buy` the LPs pay the fee. |
| L4 | Low | venue.js:78-93; server.js:31 | The client gets a venue-signed transaction and can submit failing copies with `skipPreflight`, which burns venue fees. Rate limits are keyed on the first X-Forwarded-For hop. |
| L5 | Low | Cargo.toml `default = ["devnet"]`, lib.rs:49-52,62-65 | A build with default features points the oracle owner at devnet, and the `preview` feature sets FALLBACK_DELAY=0. Either one silently breaks mainnet. |
| L6 | Low | ChainlinkFunctionsSettlementOracle.sol:167-194,214-226 | `requestSettlement` is permissionless, and an error response clears the pending request, so callers can drain LINK by retrying. |
| L7 | Low | market.js:211-216 | The desk has no limit on the long inventory it buys, only on its short. |
| I | Info | various | See the list at the end. |

## Checked and found sound

These are short so the next reviewer does not redo them.

- **Account substitution (Solana).** Everything is bound: `series` by `has_one config/long_mint/vault`, `lp_vault` by `has_one config/cash/share_mint/quoter`, `treasury` by `address = config.treasury`, and user token accounts by `token::mint = config.quote_mint` plus `token::authority`. PDAs are bound by `seeds` (position, vault_series, vault_long). A fake mint, vault, treasury, position or vault_long is rejected.
- **PDA seeds.** Every prefix is distinct and every seed component has a fixed width, so there are no collisions. A Fill position (`[pos, series, seller]`) cannot collide with a vault position (`[pos, series, lp_vault]`): the seller must sign, and `vault_buy` rejects `taker == lp_vault`.
- **Double settle, redeem, reclaim or collect.** `settled` guards both settle paths. `redeem` burns before it pays. `reclaim` zeroes `position.amount`. `vault_collect` zeroes `long/short/pos.amount` and decrements `open_series` once (`closed` flag). The existing test `vault_collect` twice confirms this. The EVM version mirrors it, and every mutating path has `nonReentrant`.
- **Solvency.** `payoff <= cap*units` for all three kinds, so `collateral - payoff` never underflows. The existing 300-seed fuzz checks escrow = OI × collateral.
- **Share inflation and first depositor.** Shares are minted 1:1 and only before `deposit_end`, while no trading can happen (`vault_sell/buy` require `now >= deposit_end`). Withdraws happen only after `epoch_end` with `open_series == 0`. A donation can only gift LPs. Nothing to exploit.
- **Oracle quote verification (Solana).** switchboard-on-demand 0.13.0 (`ix_sysvar.rs:42-120`, `quote_verifier.rs:480-555`) checks:
  - the Ed25519 program id;
  - that every offset's instruction index equals the verified index, so an offset pointing at another instruction cannot be spoofed;
  - that all signatures cover identical message bytes;
  - each signer against `queue.ed25519_oracle_signing_keys`;
  - the slothash;
  - the age of at most 150 slots.

  The program pins the queue by `address` and `owner = SB_PROGRAM` and binds `feed_id` per series. The gaps that remain are covered in M2.
- **EVM signatures.** The EIP-712 domain binds chainId and the contract address. Each (maker, nonce) is single use, and `cancelNonce` exists. Quotes from Hourly and HourlyVault cannot be replayed on each other (different domains and typehashes). ERC-1155 receiver reentrancy is blocked by `nonReentrant`.
- **Pause.** Pause blocks `fill`, `vault_sell/buy` and deposits on both chains. Exits (close, settle, redeem, reclaim, collect, withdraw) stay open by design.
- **Venue message pinning.** `submitUserTx` compares the exact serialized message and runs `verifySignatures()`. The user cannot change what the venue signed. Every instruction is built server side from (series, side, integer qty ≤ cap, owner). There is no user-controlled account list.

---

## Findings

### H1. The vault quoter can drain the vault with one signature (High)

**Where:**
- `lib.rs:573-635` (`vault_buy`: `premium` and `fee` come out of `cash` with no bound)
- `lib.rs:468-570` (`vault_sell`: no premium floor)
- `HourlyVault.sol:143-181` (`trade`; premium paid at line 176)

**Exploit:** The quoter is the venue's maker key, a hot key on the server (`market.js:203`). Whoever holds it, or a pricing bug such as NaN or a stale or zero fair value, can sign `vault_buy(qty=1, premium=cash/1.01)` with a colluding taker. The taker posts $1 of collateral and receives all the LP cash. The per-series cap only limits `qty*collateral`, not the premium. The reverse also works: `vault_sell` deep-ITM contracts at `premium=0`, spread across many series, because the cap applies per series and not in aggregate.

**Proof:** `security.rs::sr_h1_quoter_drains_vault_with_unbounded_vault_buy_premium` and `SecurityReview.t.sol::test_SR_H1_quoter_drains_vault_with_unbounded_premium`. With $1,000 of LP cash, the accomplice ends with $990 and the vault keeps ≤ $1.

**Fix:**
1. Bound premium on chain: `premium <= qty * collateral_per_contract`, since a long is never worth more than its collateral.
2. Add a per-epoch aggregate cap on premiums paid and on total collateral at risk, for example `Σ short*per + Σ premiums_paid <= deposits * max_epoch_bps`.
3. Optionally add a per-trade premium band that the admin sets at listing.
4. Keep the quoter key separate from the desk maker key.

### H2. The program admin key is hot on the server (High, operational)

**Where:**
- `venue.js:33` loads `keys.admin`.
- `venue.js:68,80` make it the fee payer of every transaction, including every user transaction.
- `keeper.js:52-58` uses it to sign `create_series` daily.
- `keeper.js` `createVault` (around line 191) uses it to sign vault creation weekly.

**Exploit:** A server compromise gives the attacker `set_paused`, `set_fee` (up to 5%), `set_settler` and `create_vault` with an attacker quoter, which leads to H1 against new deposits. It also allows `create_series` with any feed id, see M3. MAINNET.md section 4 says the config admin should be a multisig. With today's code, the keeper cannot list series under a multisig. In practice the admin key stays hot.

**Fix:** Split the roles on chain:
- `admin` (multisig): pause, fee, settler, quoter, treasury;
- `lister` (hot): `create_series` / `create_vault` only, with the quoter fixed per config;
- a separate fee-payer key that holds only SOL.

Add `set_admin` with a two-step transfer.

### M1. `init_config` can be front-run (Medium)

**Where:** `lib.rs:75-86` and `InitConfig` at `lib.rs:1008-1018`. Any signer can call it. The config PDA is a singleton (`[b"config"]`).

**Exploit:** MAINNET.md runs `solana program deploy` and then `bootstrap.js` in a separate step. A watcher can call `init_config` in between and become admin, settler and treasury, and choose the oracle queue. Only a program upgrade recovers from this.

**Proof:** `security.rs::sr_m1_anyone_can_front_run_init_config`.

**Fix:** Require `admin == program upgrade authority`. To do that, pass `program` and `program_data` and check `program_data.upgrade_authority_address == Some(admin)`. Alternatively hard-code the expected admin pubkey per cluster. In any case, deploy and init in the same script and check the config right after.

### M2. Settlement has no completeness check and trusts one oracle (Medium)

**Where:**
- `ornn.js:95-109`: the job is `MEAN` over `@.timestamp == d T20 || d T21`, with `minOracleSamples: 1` and `minJobResponses: 1`.
- `lib.rs:318-323`: takes `feed_value()` from the first signature and never checks `quote` signature count.
- EVM `SwitchboardSettlementOracle.sol:54-84`: same job, same gap.

**Exploit:**
1. **Missing or late print.** If the print for any window date is missing, or arrives after 23:00 UTC (expiry, `catalog.js:9`), the job returns the mean of the prints it found. Settlement is permissionless and the first call wins. A trader who sees that the missing print would hurt them settles immediately at the partial mean.
   - The Chainlink source (`evm/functions/settle.js`) already refuses when the last date is missing. The Switchboard path does not.
   - Neither path counts the prints in the middle of the window.
   - The Switchboard job does not deduplicate a date that has both a 20:00 and a 21:00 stamp, so that day would count twice.
2. **One signer.** One oracle on the queue, or one compromised Ornn HTTP response, sets the price, because `sig_count >= 1` is accepted.

**Fix:**
- Make the feed fail unless the number of matched prints equals `dates.length`. For example, publish a second feed with the count, or encode the count, and have `settle_oracle` require it.
- Deduplicate by date.
- Require `quote.signature_count() >= N` (N ≥ 2 on mainnet) and set `minOracleSamples` to match.
- Consider a short dispute or delay window, such as settlement allowed only from expiry + X hours.

### M3. Feed id trusted from crossbar (Medium)

**Where:** `keeper.js:39-47` writes `r.feedId` from `crossbar.storeOracleFeed` straight into `create_series`. The UI (`server.js` feed route) shows the local `oracleFeed()` definition, not the definition that hash actually commits to.

**Exploit:** A compromised or MITM'd crossbar endpoint returns the hash of a different job, for example one that returns a constant. Every new series then settles on that job, and users see a harmless definition.

**Fix:** Recompute the feed hash locally from the canonical encoding and assert it equals `r.feedId` before listing. Alternatively fetch the definition back by hash and deep-compare. Store the definition alongside the series so anyone can audit it.

### M4. Venue SOL drain through rent the venue pays for user-owned accounts (Medium)

**Where:**
- `venue.js:164-167` (`ataIx` with payer = admin);
- `market.js:167,205,217` (quote and long ATAs on every quote);
- `market.js:268` (shares ATA);
- `model.js:171-177` (minimum ask $0.01, fee rounds to 0).

**Exploit:** A user buys 1 deep-OTM digital for $0.01, and the venue creates and funds the user's long-mint ATA (about 0.00204 SOL). The user burns or transfers the token, then closes the ATA, and the rent goes to the user. The user pays only a 5,000-lamport fee. Net is about +0.002 SOL for each (series × wallet). Many series are listed every day. Position PDAs created for user sells cost the venue permanent rent for the same reason.

**Fix:**
- Let the user pay for their own ATAs: set the user as payer of `createAssociatedTokenAccountIdempotent`. If gasless onboarding matters, sponsor only the first quote ATA per wallet, tracked server side.
- Add a minimum premium or notional per trade (for example $1).
- Count sponsored rent per wallet and per IP.

### M5. Quotes on stale data after each print (Medium, economic)

**Where:**
- `ornn.js:18` (`REFRESH_MS` = 15 min);
- `ornn.js:64-69`: when a fetch fails, it silently returns the stale cache or the disk copy;
- `market.js:11`: 60 s price cache.

**Exploit:** The daily print lands at 20:00 or 21:00 UTC. For up to about 16 minutes, or indefinitely if Ornn errors, the desk and the vault quoter price the next-day digitals and the monthly averages on yesterday's data. A bot that polls Ornn picks off stale asks and bids, and the vault LPs take the loss.

**Fix:**
- Refresh every minute around print times.
- Stop quoting when `now - lastPrintTime` exceeds what the window expects, or when a fetch fails. Fail closed, never fall back to a stale cache for pricing.
- Drop the price cache when a new print appears.

### L1. Fallback settler can post any price (Low, trust)

**Where:** `lib.rs:333-340`, `Hourly.sol` `settle`. The settler key is loaded hot in `venue.js:33`. On EVM, `SwitchboardSettlementOracle.sol:18-25` documents that the oracle keys have expired, so every EVM series settles through this key.

**Fix:**
- Keep the settler cold (multisig).
- Emit a richer `evidence` field and bound the price, for example `price <= k × strike`.
- On EVM, do not launch until an oracle path is live.

### L2. Fee not covered by the maker's signature (Low)

**Where:** `Hourly.sol:386-397`. The fee is computed at fill time from `feeBps`. When `makerSells=false`, the maker is the buyer and pays a fee they never signed. Admin can raise `feeBps` up to 500.

**Proof:** `test_SR_L2_fee_not_bound_by_maker_signature`. The maker signed at 1% and paid 5%.

**Fix:** Add `maxFeeBps` to `Quote` and revert if `feeBps > q.maxFeeBps`. On Solana, pass `max_fee` as an argument that both parties sign.

### L3. Fee bypass and fee incidence (Low)

**Where:** `fee_for` (`lib.rs:797`) is a percentage of a premium the counterparties choose. Two parties can sign `premium=0` and settle off chain, or split the trade into lots where `premium*bps < 10_000` so the fee rounds to 0. In `vault_buy` (`lib.rs:621-635`) and the EVM vault-buy path, the LPs pay the fee out of `cash`.

**Fix:**
- If the fee matters, charge a floor based on notional: `max(fee_for(premium), qty*per*min_bps)`.
- Decide on purpose who pays the fee in `vault_buy`, and say so in the LP terms.

### L4. Fee-payer griefing and rate-limit key (Low)

**Where:**
- `venue.js:90`: `prepareUserTx` returns the venue-signed transaction to the client. The client can submit it itself with `skipPreflight`. Transactions that fail on chain (for example `/api/action` `close` with an invalid qty, `market.js:299-302`) still charge the venue about 6,000 lamports each.
- `server.js:31`: `ipOf` takes the first X-Forwarded-For hop. It is safe only if Caddy drops client-supplied XFF (Caddy ≥ 2.5 does this by default without `trusted_proxies`). Not checked live.

**Fix:**
- Simulate server side before signing, and refuse instructions that will fail (check position and balance first).
- Limit prepared transactions per wallet as well as per IP.
- Rate-limit on `req.socket.remoteAddress` when the request comes from Caddy.

### L5. Feature footguns (Low)

**Where:** `Cargo.toml` `default = ["devnet"]` sets `SB_PROGRAM` to the devnet PID. A mainnet build that forgets `--no-default-features` makes every `settle_oracle` fail, leaving only the trusted fallback. The `preview` feature sets `FALLBACK_DELAY = 0` (`lib.rs:62-65`).

**Fix:**
- Make mainnet the default, or add `compile_error!` when `devnet` and `preview` are both enabled.
- Add a `const` assertion, and a test that checks the built `.so` against the expected PID.

### L6. LINK drain through retries (Low)

**Where:** `ChainlinkFunctionsSettlementOracle.sol:214-226`. On an error response, `pendingOf` is cleared, so `requestSettlement` can be called again immediately. Around an Ornn outage or a late print, anyone can loop requests that each cost LINK.

**Fix:** Keep the `retryAfter` cooldown even after a failed fulfilment. Optionally require the caller to pay, or whitelist the keeper.

### L7. The desk's long inventory is unbounded (Low)

**Where:** `market.js:211-216` checks `makerMaxShort` only on user buys. User sells (desk buys) are capped at 500 per trade with no running total, so desk cash can be spent without limit on bids. This is especially costly together with M5.

**Fix:** Add a `makerMaxLong` limit per series and a daily notional cap.

### Info

- Series PDA seeds (`lib.rs:1039-1048`) and `seriesIdOf` on EVM leave out `period_start` and `feed_id`. Two listings that differ only by window or feed cannot coexist. Not exploitable because only admin lists.
- `Hourly.settleOracle` refunds ETH to `msg.sender` inside the oracle call, before `_applySettlement` (`Hourly.sol:335-341`, `SwitchboardSettlementOracle.sol:80-83`). `nonReentrant` makes this safe today. Moving the refund after the state write would be cleaner.
- EVM `admin` and `treasury` are immutable. If USDC blacklists the treasury, every fill with fee > 0 reverts until a redeploy. Consider a settable treasury.
- `Quote.taker = 0` (open quotes) can be taken by anyone, including from the mempool. The venue should always set `taker`.
- A vault's withdrawals stay locked (`lib.rs:734`, `HourlyVault.sol:215`) until every touched series is settled. If both the oracle and the settler fail, LP funds stay locked with no escape hatch. Consider an admin `settle` after a long delay, which already exists through the fallback, and document it.
- Long tokens sent directly to `vault_long`, or ERC-1155 tokens sent to HourlyVault (the hook accepts any transfer that comes through Hourly), are never redeemed. Only the sender loses.
- `LpVault.premiums` and `Series.period_start` are written but never enforced.

---

## Fixed (EVM side)

Regression tests: `evm/test/SecurityReview.t.sol` (13 tests, flipped from the old proofs) and `test_L6_*` in `evm/test/ChainlinkFunctions.t.sol`. Solana items (`program/`, `app/`) are not covered here.

- **H1 (EVM): fixed.** `HourlyVault.trade` now reverts with `PremiumOutOfBounds` unless the premium is at most 95% of `qty x collateralPerContract` when the vault buys, and at least 1% of it when the vault sells. `maxTradeBps` (default 10% of deposits) caps one trade, and `maxEpochBps` (default 50%, admin-settable within 1..10000) caps the sum of notional across all series. The quoter must not be the admin, and only the lister can create a vault. The old exploit ($990 for a $1 contract) now reverts.
- **H2 (EVM): fixed.** New `lister` role (constructor arg, admin can rotate with `setLister`) owns `createSeries` and `setVault`. `admin` can no longer list; it keeps `setFee`, `setSettler`, `setPaused`, `setMinPremium`, `setLister`. The settler and quoter are separate keys. Deploy scripts read `LISTER`. The admin must be a multisig at deployment for this to mean anything.
- **M1 analog (EVM): verified, no change needed beyond H2.** There is no initializer. Hourly and the vault set every role in the constructor, and the Chainlink adapter's `bind` is deployer-only and one-shot (`test_cl_bind_once_*`). `test_M1_no_initializer_exists` pins it.
- **L2: fixed.** `maxFeeBps` is in the EIP-712 `Quote` (and `VaultQuote`). The fill reverts with `FeeTooHigh` if the live fee is higher.
- **L3 (EVM): fixed.** `minPremium` (default 10,000 atoms = 0.01 USDC, admin-settable) is enforced in `fill`, `fillBatch` and `vaultFill`; below it the fill reverts with `PremiumTooLow`. This also covers the vault-buy path. Who pays the fee in vault-buy is unchanged (LPs); the LP terms should say so.
- **L6: fixed.** `requestSettlement` allows at most `MAX_ATTEMPTS` = 3 requests per series and enforces the `retryAfter` cooldown after every request, including after an error response. When the cap is reached the fallback settler settles after 72 h.
