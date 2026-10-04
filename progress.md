# Hourly: options on the GPU hour (Colosseum Crypto World's Fair entry)

Standalone project, NOT Stormbit (Mehdi has not said to connect them). Working name "Hourly" is my pick.
Deadline: submissions due 2026-10-12 (verified colosseum.com/worldsfair).

## Load-bearing facts (status as of 2026-10-04)
- Ornn OCPI index history API, public, no key: LIVE-VERIFIED 2026-10-04
  https://ornn-backend-api-135941626504.us-central1.run.app/api/gpu/<GPU>/index-history  (access=public-3mo, 92 daily points, 20:00Z stamps)
  H100 SXM 2.64 (10-03), H200 6.05, B200 7.81, A100 SXM4 0.90
- Ornn licence for using OCPI as a settlement reference in third-party derivatives: UNVERIFIED (Premium Data Use Addendum behind paywall)
- CME H100/B200 rental index futures launch 2026-10-05, no options: verified (CME/PRN release)
- ICE OCPI futures: no listing date, CFTC comment period open (ICE notice 2026-09-29): verified
- Toolchain: solana-cli 3.1.10, anchor-cli 1.1.2, cargo-build-sbf, node 20: verified. NO keypair existed.

## Design
- Anchor program: fully collateralized, bounded-payoff series (call spread, put, digital) on an index,
  RFQ fill = taker + maker both sign one tx, premium and collateral move atomically.
- Settlement: settler key posts the contract-period AVERAGE of daily OCPI (same convention as ICE HPR),
  plus sha256 of the raw Ornn JSON as evidence. Centralized settler = disclosed cut.
- Pricing: OU on log index calibrated on the 92 days, Monte Carlo on the arithmetic average. Model price, labelled.
- App: Node server :7988 behind Caddy /hourly. Two doors: Predict (digital) and Hedge (collar).
- Devnet test USDC mint we control (faucet in app). Labelled as test money.

## Stages
- [ ] 1 program + tests
- [ ] 2 devnet deploy
- [ ] 3 index + pricing engine
- [ ] 4 server + maker + settler
- [ ] 5 web UI, deployed /hourly, screenshot-verified
- [ ] 6 submission kit: README, GTM, pitch + demo scripts

## Checkpoint 2026-10-04 ~17:00 UTC
- [x] 1 program + tests: 7 tests pass (exact error codes). Commits 027c09a, 23b9c56.
- Oracle settlement: settle_oracle verifies a Switchboard On-Demand quote (pinned devnet queue
  EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7, owner Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2),
  feed hash stored per series. Trusted settler = fallback after 72h.
- LIVE-VERIFIED: Switchboard crossbar simulate reads Ornn; MEAN over OR-of-timestamps filter
  matches local mean exactly (Sep H100 2.829333, 30 days, with 20:00 and 21:00 stamps).
- LIVE-VERIFIED: devnet oracle signed a quote for a custom Ornn feed (fetchQuoteIx -> Ed25519 ix).
- crossbar.switchboard.xyz has NO DNS record (checked 8.8.8.8); use https://crossbar.switchboardlabs.xyz.
  Crossbar returns transient 502s: keeper must retry.
- BLOCKED: devnet SOL. Faucet rate-limits this VM. Asked Mehdi for ~6 SOL to admin
  G9A1tg5zgxMZg4EsoeBt8Yi5hEfwXsAEiu8zEqcAMxMT. Keys in ~/compute-options/keys (gitignored).
- Build gotchas: anchor-spl needs token_2022 + token_2022_extensions features; Box large accounts
  (stack overflow in fill); pin solana-program to 3.0.0 (cargo update --precise); getrandom custom stub.

## Checkpoint 2026-10-04 ~17:15 UTC
- [x] 3 index + pricing engine (two-factor, vol x1.5, live backtest with Brier)
- [x] 4 server + maker + keeper (oracle settle w/ retries, 72h fallback, daily roll, restock)
- [x] 5 web UI: wallet-standard + burner, predict/hedge, atomic collar, portfolio. Screenshot-verified desktop+mobile.
- [x] Preview LIVE http://34.177.105.21/hourly/ (:7990, private chain, cron run.sh). Caddy backup caddy-docker.conf.bak-hourly-20261004171134
- [ ] 2 devnet deploy: BLOCKED on SOL (asked Mehdi again 17:05)
- [ ] 6 submission kit: README, GTM, pitch + demo scripts, third-party maker example

## Checkpoint 2026-10-04 ~17:30 UTC
- Markets UI redesigned on Mehdi's note ("ui nice but not for the markets"): headline question + strike/cone chart, ladder by GPU, hedge builder with payout over model distribution. Screenshot-verified desktop + phone.
- Trading cutoff 19:55 UTC on the window's last day (print lands 20:00/21:00 UTC); found by lifecycle test.
- Preview chain runs the `preview` build (backup settles at expiry, labelled preview). Lifecycle list/trade/settle/redeem/reclaim verified on a scratch chain, balances exact.
- devnet-pow: compiles only with libssl-dev (no sudo) AND needs >= 5000 lamports to start. Dead end without Mehdi's SOL.
- Running in background: launch video (ship-video fork), research agents -> research/market-structure.md, research/investors-and-colosseum.md
- NEXT (batched program change after research): protocol fee to treasury, liquidity design (LP vault or resting offers), then fresh preview chain.

## Checkpoint 2026-10-04 ~17:50 UTC
- Program v2: 1% protocol fee to treasury (cap 5%), weekly underwriting vaults (deposit, vault_sell/vault_buy under 20% per-series cap, collect, pro-rata withdraw). 9 tests pass. opt-level s -> 572 KB.
- Devnet SOL need raised to ~10 (deploy peak ~8). Still 0.
- Preview chain reset onto v2: vaults epoch 1 (trades Oct 5 to 11) + epoch 2, venue seed $25k each.
- Vault routing verified on scratch chain via app code: desk during deposits, vault after, cap overflow -> desk, settle+collect, LP withdraw exact (507.58 on 500).
- Video: ~/scratchpad/hourly-video/out.mp4 (32 s, 1080p), stray "A" and invented $2.55 fixed.
- Research: research/investors-and-colosseum.md done (pitch = compute as commodity, not AI traders). market-structure.md still running.
