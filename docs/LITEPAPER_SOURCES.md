# Litepaper sources and claim audit

Date of audit: 2026-10-05. Status values: **code** (file:line read this run), **ran** (command executed this run), **fetched** (URL fetched this run, HTTP 200 unless noted), **doc** (stated in a repo document, not re-run), **UNVERIFIED** (could not be confirmed).

Reproduce the worked numbers: `node docs/litepaper-numbers.js` (reads cached Ornn history in `app/data/*.json`, 92 prints per chip, 2026-07-05 to 2026-10-04; the cache was refreshed from api.ornnai.com during this run and the last H100 print is 2.59).

## Program and venue parameters

| Claim | Status | Where |
|---|---|---|
| Fee 1 percent of premium (100 bps) | code | `app/engine/venue.js:41` (`feeBps: 100`) |
| Program fee cap 5 percent (500 bps) | code | `lib.rs:68` |
| Buyer pays fee on top of premium | code | `lib.rs:239` |
| Fee rounds down | code | `lib.rs:870-871` |
| Oracle grace 2 hours after expiry | code | `lib.rs:65`, `lib.rs:345`; keeper `keeper.js:14,160` |
| Backup settler after 72 hours | code | `lib.rs:73` (non-preview build); `keeper.js:13`; EVM `Hourly.sol:35` |
| Quote max age 150 slots ("about 60 s" is the code comment) | code | `lib.rs:77` |
| 18-decimal oracle value to 6-decimal atoms | code | `lib.rs:79`, `lib.rs:862` |
| Min oracle signatures set by admin, at least 1 | code | `lib.rs:99,137-141,365` |
| Payoff formulas (call, put, digital) | code | `lib.rs:878-892` |
| Put cap cannot exceed strike | code | `lib.rs:165-167` |
| Collateral = cap x units | code | `lib.rs:874-876` |
| Emergency pause leaves exits open | code (comment) and doc | `lib.rs:118-123`; SECURITY_REVIEW "Pause" |
| Vault cap 20 percent per market, 50 percent per epoch | code | `keeper.js:19-20`; enforced `lib.rs:539-543,656-660` |
| Vault price bounds 95 percent buy, 1 percent sell | code | `lib.rs:62-63,527-535` |
| Vault deposits before epoch start; series must expire within epoch; withdraw after epoch end and no open series | code | `lib.rs:486,527-529,807` |
| Epoch 1 starts Mon 2026-10-05 00:00 UTC, 7-day epochs | code | `keeper.js:17-18` |
| Venue seed $25,000 off mainnet, 0 on mainnet | code | `keeper.js:22` (removed from the paper for length) |
| Expiry 23:00 UTC | code | `catalog.js:9` |
| Print stamps 20:00 or 21:00 UTC | code | `ornn.js:20` |
| Window price = arithmetic mean of prints on window dates | code | `ornn.js` `windowMean` |
| Quoting halts 19:55 UTC on last window day | code | `market.js:80` |
| Strike steps 0.05 / 0.25 / 0.25 / 0.05 | code | `catalog.js:24` |
| Yes/no listing: next 3 days plus next Friday, 5 strikes | code | `catalog.js` `predictListings` |
| Hedge listing fractions and widths | code | `catalog.js:95-98` (H200 line 96: 0.85, 1.15, 1.0) |
| Units = hours in month (720 for 30 days) | code | `catalog.js` `monthly`; ran (`units: 720`) |
| Trade limits: 500 / 50 contracts per trade; desk short and long 20,000 / 2,000 | code | `market.js:13` |
| Minimum premium $0.50 | code | `market.js:15` |
| Desk half-spread 0.5 percent of max payoff plus 8 percent of fair | code | `model.js:172` |
| 20,000 paths; volatility scale 1.5 | code | `model.js:13,18` |
| Keeper fetches stored feed back and compares before listing | code | `keeper.js` `feedIdFor` |
| Keeper retries oracle settle 3 times, then fallback after 72 h | code | `keeper.js:169-176` |
| `settle_oracle` success path never run on a chain | code | `program/programs/hourly/tests/lifecycle.rs:332-335` shows only rejection assertions; no devnet deploy per HANDOFF.md |
| No geoblock in the app | code (absence) | grep of `app/server.js` found none; UNVERIFIED for the front end `app/public` |

## Worked numbers (all computed, `docs/litepaper-numbers.js`, output saved at run time)

| Claim | Status |
|---|---|
| H100 calibration: level vol 35.4 percent a year, AR(1) 0.535, half-life 1.1 days | ran |
| Example 1: strike 2.60, expiry 2026-10-09, fair 0.6934, bid 0.63, ask 0.75, p10/p50/p90 2.46/2.70/2.96 | ran |
| Example 1 arithmetic (75.00, 0.75, 75.75, +24.25, +63, -37) | computed by hand from the above; correct |
| Example 2: November floor 2.35 / $0.50, cap 2.95 / $0.50, 720 units, collateral $360 | ran |
| Floor fair 10.64, bid 7.98, ask 13.29, 11.8 percent in the money; cap fair 30.21, bid 25.99, ask 34.42, 21.3 percent | ran |
| Window-average percentiles 2.32 / 2.70 / 3.12 | ran |
| Payoff points ($360, $252, $108; $36, $180, $324) | ran |
| Owner revenue table and collar credit 12.57 | ran |
| Vault example ($2,000 and $5,000 caps, 5 contracts) | ran (`floor(2000/360)=5`) |
| Backtest coverage 79.1 / 80.6 / 79.6 percent; Brier 0.2345 / 0.2241 / 0.2534 vs 0.25; n = 196 / 180 / 152 | ran |
| The 1.5 volatility scale was fitted on the same history | code comment `model.js:14-17` |

## Tests

| Claim | Status |
|---|---|
| 14 Rust tests pass (3 unit, 9 lifecycle incl. 300-seed fuzz, 2 security) | ran: `cargo test -p hourly --offline` |
| 51 Foundry tests pass, 9 skipped | ran: `forge test` in `evm/` (skips need `SB_FORK=1`) |
| Wallet end to end 7 of 7, API e2e match, load, escrow consistent | doc (HANDOFF.md); not re-run. HANDOFF says "load 200/200"; MAINNET.md and SUBMISSION.md say 500 concurrent trades from 100 users. The two documents disagree; which run is current is UNVERIFIED. |
| SUBMISSION.md says "37 EVM tests" and "11 program tests" | doc, stale; superseded by this run's counts |

## Security review and status

| Claim | Status |
|---|---|
| Findings H1, H2, M1 to M5, L1 to L7 and which are fixed | doc: `docs/SECURITY_REVIEW.md` (Fixed sections) |
| L1 and L3 open by design | doc: SECURITY_REVIEW last bullet and HANDOFF.md |
| M2 completeness check (print count, duplicate dates) not listed as fixed | doc (absence). Whether the code now has one is UNVERIFIED; not traced in `ornn.js:oracleFeed` (the job still uses an OR of timestamps and `minJobResponses: 1`). |
| Mainnet oracle signed an Ornn-based quote on 2026-10-04, value 2.715 | doc: `docs/MAINNET.md`, `evm/README.md`; not re-run |
| EVM oracle keys expired; no working EVM oracle | doc: `evm/SWITCHBOARD_EVM.md`; not re-run |
| Chainlink Functions deprecated | doc: `evm/README.md` quotes docs.chain.link; not re-fetched |
| Devnet SOL, Ornn licence email, multisig, entity, audit are open | doc: HANDOFF.md, MAINNET.md |

## Ornn and market sources (fetched this run)

| Claim | Status | URL |
|---|---|---|
| Index = volume-weighted winsorized mean of executed prices over a rolling one-hour window; on-demand only; no restating except stated cases; keep own records; Market Disruption Events | fetched | https://data.ornn.com/methodology |
| "settled daily at 4:00 PM ET"; H100 $2.59 on 2026-10-04; 1 day -1.9 percent, 30 days -10.4 percent | fetched | https://data.ornn.com/markets/h100-sxm |
| Terms bar "settlement, reference" without a separate written agreement | fetched | https://data.ornn.com/terms |
| Premium $500 per month; Index tier free | fetched | https://data.ornn.com/pricing (not used in the paper) |
| Public history: 92 prints each for four chips, 2026-07-05 to 2026-10-04 | ran (node fetch against the endpoint) | https://api.ornnai.com/api/gpu/H100%20SXM/index-history and the other three |
| Six GPUs listed incl. RTX 5090 and RTX PRO 6000 WS | fetched | https://api.ornnai.com/api/gpu-types |
| Token index: four labs for 2026-10-03, access "public-1mo" | fetched | https://api.ornnai.com/api/otpi |
| Power markets need a key (401) | fetched | https://api.ornnai.com/api/power/markets |
| ICE OCPI futures: contract size = hours in the month, settle on average of daily prices, $0.001 tick, pending CFTC comment period | fetched (PDF) | https://www.ice.com/publicdocs/futures_us/exchange_notices/ICE_Futures_US_Exchange_Notice_ORNN_Compute_4Q2026_20260929.pdf |
| CME and Silicon Data compute futures planned for October 5, 2026, pending regulatory review | fetched | https://www.prnewswire.com/news-releases/cme-group-and-silicon-data-to-launch-compute-futures-on-october-5-to-unlock-new-way-to-hedge-ai-risks-302848593.html |
| Kalshi and Polymarket list Ornn-settled GPU markets; thin liquidity; delisted HIP-3 H100 perps | doc (`research/market-structure.md`, fetched by an earlier run on 2026-10-04); not re-fetched this run |

## Candidate-asset sources (section 6)

| Claim | Status | URL or note |
|---|---|---|
| Silicon Data homepage lists MI300X, B300, RAM and LLM Token indices | fetched | https://www.silicondata.com/ |
| Silicon Data access is paid | doc only (earlier research); UNVERIFIED this run |
| Google TPU on-demand list prices per chip-hour | fetched | https://cloud.google.com/tpu/pricing |
| AWS Trainium public price source | UNVERIFIED: none fetched |
| OpenRouter model list, 466 models with per-token prices | fetched and parsed | https://openrouter.ai/api/v1/models |
| Artificial Analysis API needs a free key, attribution, 1,000 requests a day | fetched | https://artificialanalysis.ai/api-reference |
| TrendForce DRAM spot page public, DDR5 16Gb session average 58.067, updated 2026-10-05 14:40 GMT+8 | fetched | https://www.trendforce.com/price/dram/dram_spot |
| TrendForce terms on settlement or redistribution | UNVERIFIED: not checked |
| Ornn memory price history needs a key | doc only (earlier research); UNVERIFIED this run |
| No public HBM price source | UNVERIFIED: absence from limited search |
| Akash GPU prices open JSON: H100 SXM5 median 2.55, 68 total, 11 available; A100 SXM4 median 1.84 | fetched | https://console-api.akash.network/v1/gpu-prices |
| AWS spot advisor file has savings and interruption bands, no prices | fetched | https://spot-bid-advisor.s3.amazonaws.com/spot-advisor-data.json |
| AWS spot price history needs credentials | UNVERIFIED: general knowledge, not tested |
| CAISO OASIS returns day-ahead LMP CSV with no key; first row 2026-10-03 07:00 UTC, node TH_NP15_GEN-APND, 66.12302 | fetched | https://oasis.caiso.com/oasisapi/SingleZip?resultformat=6&queryname=PRC_LMP&version=1&startdatetime=20261003T07:00-0000&enddatetime=20261003T09:00-0000&market_run_id=DAM&node=TH_NP15_GEN-APND |
| EIA API needs a free key | fetched (HTTP 403 `API_KEY_MISSING`) | https://api.eia.gov/v2/electricity/rto/region-data/data/ |
| ERCOT public page blocked | fetched (HTTP 403, Incapsula) | https://www.ercot.com/content/cdr/html/real_time_spp.html |
| PJM Data Miner | UNVERIFIED: `www.pjm.com` and `dataminer2.pjm.com` did not resolve from this VM |
| Existing deep electricity hedging markets | UNVERIFIED: general knowledge, not fetched |
| LevelTen publishes quarterly P25 PPA indices, detail behind a form | fetched | https://www.leveltenenergy.com/ppa |
| LevelTen Q1 2026 solar P25 $64.49 per MWh | removed from the paper (search snippet only: UNVERIFIED) |
| Colocation: wholesale average $196 per kW per month, built from CBRE, JLL, operator quotes | fetched (derived aggregator) | https://coloprice.com/index/ ; CBRE page HTTP 403 |
| IP transit: lowest 100 GigE $0.03 per Mbps per month in Q2 2026; 17 percent a year decline Q2 2023 to Q2 2026 | fetched | https://resources.telegeography.com/ip-transit-price-erosion-significant-regional-differences-remain |
| Cloud egress price benchmark | UNVERIFIED: none found |
| Viability ratings | judgment, not measurable; stated as such in the paper |

## Claims marked UNVERIFIED in the paper

1. Whether a print-completeness check now exists in the oracle path (finding M2).
2. Which load-test figure is current (200 vs 500 trades).
3. Silicon Data access terms and Ornn memory data access (earlier research only).
4. RTX PRO 6000 index-history needing a key (earlier research only).
5. TrendForce settlement or redistribution terms.
6. Trainium price source; HBM price source; cloud egress benchmark.
7. PJM data access; existence of deep electricity hedging markets (general knowledge).
8. Whether geoblocking would satisfy any regulator; tax treatment.
9. Kalshi and Polymarket market detail (earlier run, not re-fetched).
