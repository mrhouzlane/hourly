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
