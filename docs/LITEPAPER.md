# Hourly litepaper

Options and yes/no markets on the rental price of AI chips. Draft of 2026-10-05.

This paper describes what the code does today, what is tested, and what is blocked. It is not investment, legal or tax advice. Every number is computed from the repository's code this run, cited to a page fetched this run, or marked UNVERIFIED. Audit trail: `docs/LITEPAPER_SOURCES.md`. Examples regenerate with `node docs/litepaper-numbers.js`.

## Status

| Component | Status |
|---|---|
| Solana program (options, digitals, RFQ fills, vaults, settlement) | Built. 14 Rust tests pass this run (3 unit, 9 lifecycle including a 300-seed fuzz, 2 security). Not audited externally. Not deployed on any public cluster. |
| Oracle settlement (`settle_oracle`) | Built. Only rejection paths tested; the success path has never run on a chain. |
| Backup settler (72 hours) | Built and tested. Hot key on the server (finding L1, open). |
| Pricing model and backtest | Built. Backtest reproduced this run (section 3). Validated to 14 days only. |
| Venue app (keeper, desk, API, UI) | Built. Wallet end to end 7 of 7, API match, load run per HANDOFF.md (not re-run). Private local validator, burner wallet only. |
| EVM port | Built. 51 Foundry tests pass, 9 skipped (need a forked chain). Not deployed. No working EVM oracle today. |
| Ornn data licence | Blocked. Unsigned. Blocks real money. |
| Devnet deployment | Blocked. Needs about 10 devnet SOL (HANDOFF.md). |
| Mainnet | Blocked. Entity, jurisdiction blocking, multisig, funding, paid RPC, external audit. |

## 1. Vision

An AI chip is rented by the hour, and the price moves. On Ornn's published index the H100 was $2.59 per GPU-hour on 4 October 2026, 10.4 percent lower than 30 days earlier (data.ornn.com/markets/h100-sxm, fetched 2026-10-05). The owner of a GPU, or a lender who financed it, loses when rent falls while debt and power bills stay fixed. The renter, an AI company with a training run or inference bill, loses when it rises. A third group has a view on where the price goes and wants a defined-loss way to express it. None of them can easily buy or sell a tailored contract today. Index futures are planned or just launching (CME with Silicon Data, ICE with Ornn; press release and exchange notice fetched this session), but futures are linear and sized for institutions. Yes/no questions on the same index already trade on Kalshi and Polymarket (`research/market-structure.md`, fetched 2026-10-04, not re-fetched). Hourly does not claim to be first.

Hourly offers, on one index:

- **Trade.** Yes/no questions on a single day's print, for example "Will the H100 print above $2.60 on Friday?"
- **Protect.** A floor for owners, a cap for renters, or both, on the monthly average, sized like an exchange future (one GPU for every hour of the month).
- **Earn.** Weekly pools where anyone deposits USDC and a quoter sells this protection with capped exposure.

Every contract is fully collateralized in escrow: no margin calls, no liquidation.

**After AI chips.** The pattern is a resource rented by the hour, with a transparent daily third-party price and holders on both sides. Section 6 rates candidates; several fail on data access, not technology.

## 2. How the price is made

### The index

Hourly settles on the Ornn Compute Price Index, OCPI, for four chips: H100 SXM, H200, B200 and A100 SXM4 (`app/engine/ornn.js`, lines 11 to 17). Ornn's methodology page says each index is "the volume-weighted winsorized mean of executed transaction prices for a given GPU type over a rolling one-hour window" (data.ornn.com/methodology, fetched 2026-10-05). Winsorized means extreme prices are pulled in to a boundary rather than dropped. Only on-demand rentals count. The market page states the index is "settled daily at 4:00 PM ET" (data.ornn.com/markets/h100-sxm, fetched 2026-10-05). A print is therefore stamped 20:00 UTC in summer and 21:00 UTC in winter; the code accepts both stamps (`PRINT_HOURS = ["20", "21"]`).

The daily history is public without a key at `api.ornnai.com/api/gpu/{name}/index-history`, trailing three months. A call this session returned 92 points per chip, 2026-07-05 to 2026-10-04.

Ornn says past values are not restated except in specific cases, and that settlement users should keep their own records (methodology page).

### The licence gap

Ornn's public Terms of Use bar using its data for "settlement, reference" or inside a "financial product" without "a separate written agreement" (data.ornn.com/terms, fetched 2026-10-05). A draft request to data@ornn.com is in `docs/OUTREACH.md`; HANDOFF.md lists sending it as open. **No licence exists. Real-money settlement on Ornn data is blocked until one is signed.** Everything runs on test money today.

### How Hourly reads the index

Each contract has a settlement window: a list of calendar dates. The settlement price is the arithmetic mean of every print stamped at 20:00 or 21:00 UTC on those dates (`windowMean` in `ornn.js`). A daily yes/no market has a one-date window. A monthly contract has every date in the month. Contracts expire at 23:00 UTC on the last date (`EXPIRY_HOUR_UTC = 23` in `catalog.js`). Trading on a market stops at 19:55 UTC on its last date, before the print can be known (`CUTOFF_S` in `market.js`).

### The Switchboard oracle path

Settlement on Solana is done by an oracle, not by Hourly. Switchboard is a network of oracle operators. For each series the keeper stores a feed definition with Switchboard (fetch the Ornn history URL, keep the window's timestamps, take the mean; `oracleFeed`). The definition's 32-byte hash is written into the series at listing, and the keeper fetches the stored definition back and compares it before listing (`feedIdFor`; fix M3).

After expiry, anyone can call `settle_oracle` with a signed quote. The program (`lib.rs`, lines 341 to 379):

1. requires the time to be at least 2 hours after expiry (`ORACLE_GRACE = 2 * 3600`), so a late print is included;
2. verifies the quote against the pinned Switchboard queue, rejecting quotes older than 150 slots (`MAX_QUOTE_AGE_SLOTS`, about 60 seconds by the code's comment);
3. requires at least `min_oracle_sigs` signatures, a setting the admin controls (minimum 1);
4. finds the feed whose id equals the series' stored feed id;
5. converts the 18-decimal oracle value to 6-decimal USDC atoms and computes the payoff.

### If the oracle fails

- A failed oracle transaction is retried three times per cycle by the keeper (`settleDue`). Settlement is permissionless, so anyone can also submit it.
- **72 hours after expiry** a backup settler key may post a price (`FALLBACK_DELAY = 72 * 3600`; the same constant exists in the EVM contract). The keeper posts the window mean from Ornn data with a hash of the raw response as evidence (`settleFallback`). This key is a trust assumption: it can post any price. Finding L1 leaves it open by design, and it is a hot key today.
- If both fail, positions stay unsettled and a vault's LPs cannot withdraw until every series it touched is settled (`vault_withdraw` requires `open_series == 0`). The review notes no further escape hatch.
- Emergency pause stops new fills and deposits only. Exits, settlement, redemption and withdrawals keep working.

### Built versus blocked

- **Built:** feed definition, on-chain verification, keeper loop. Switchboard signed a quote for an Ornn-based feed on the mainnet queue on 2026-10-04, value 2.715, feed hash matching (`docs/MAINNET.md`; not re-run today).
- **Not yet run:** the success path of `settle_oracle` on a chain. Tests prove only that it rejects a wrong queue and a missing quote (`lifecycle.rs`, lines 332 to 335). No public deployment exists.
- **Blocked on EVM:** the oracle signing keys on Switchboard's EVM queues have expired and only Switchboard can refresh them (`evm/SWITCHBOARD_EVM.md`). Chainlink Functions is deprecated by Chainlink. The only EVM path today is the 72-hour backup settler.
- **Open:** finding M2 listed no check that every print in the window was found. The fix list records the grace and the signature count only. Whether a completeness check exists is UNVERIFIED.

## 3. How the options work

### Three contract types

- **Digital (yes/no).** Pays `cap` per unit if the settlement price is above the strike, otherwise nothing. Daily markets use cap $1 and one unit, so a contract pays $1 or $0.
- **Call spread.** Pays `min(max(price - strike, 0), cap)` per hour. It gains as the price rises above the strike, up to a ceiling.
- **Put spread.** Pays `min(max(strike - price, 0), cap)` per hour. It gains as the price falls below the strike, up to a ceiling. The cap cannot exceed the strike.

Spreads replace plain calls because a plain call has unlimited payoff and cannot be fully backed. The worst case is fixed at listing: collateral = cap x units per contract.

### Full collateralization

The seller (writer) locks the maximum payoff in escrow. The buyer pays the premium to the seller and receives a token. At settlement the holder burns the token and receives the payoff; the writer reclaims the rest. A writer can close early by burning tokens against their own position. Because payoff never exceeds collateral, escrow cannot run short. A 300-seed fuzz test checks that escrow equals open interest times collateral at every step and no USDC is created or lost (`fuzz_escrow_always_solvent_and_usdc_conserved`, passing this run).

### Listing grid

Source: `catalog.js`.

- **Yes/no markets:** per chip, the next three days and the next Friday, five strikes each (last print rounded to a step, plus and minus two steps). Step: $0.05 for H100 and A100, $0.25 for H200 and B200.
- **Monthly hedges:** one floor and one cap per chip for the coming month, at set fractions of the last print (H100 floor 0.90, cap 1.13, width $0.50; H200 0.85 and 1.15, $1.00; B200 0.90 and 1.12, $1.00; A100 0.90 and 1.15, $0.20).
- **Sizing:** units equal the hours in the month (720 for 30 days), the same convention as ICE's planned OCPI futures (exchange notice dated 2026-09-29, fetched this session).

### Prices

The desk and vault quote around a model price (`model.js`): log price as a slow level plus a fast part that reverts within days, calibrated on the last 92 prints, 20,000 simulated paths of the window average, volatility scaled by 1.5. The bid-ask half-spread is 0.5 percent of maximum payoff plus 8 percent of fair value.

The fee is 1 percent of premium (cap 5 percent in the program), paid by the buyer on top (`fill`). The venue refuses trades under $0.50 of premium and limits one trade to 500 yes/no or 50 monthly contracts.

H100 calibration today: last print 2.59, level volatility 35.4 percent a year, fast part half-life 1.1 days.

### Example 1: a yes/no market

Question: will the H100 print on Friday 9 October 2026 be above $2.60? (The last print is 2.59, rounded to the $0.05 grid.)

From 20,000 simulated paths the model gives a 69.3 percent chance of "yes", with the print's 10th, 50th and 90th percentiles at $2.46, $2.70 and $2.96. Half-spread = 0.005 x $1 + 0.08 x 0.6934 = $0.0605, so the desk quotes $0.63 bid and $0.75 ask.

A buyer takes 100 "yes" contracts at the ask: premium 100 x $0.75 = $75.00, fee 1 percent = $0.75, total $75.75. If the print is above $2.60, the buyer receives 100 x $1 = $100 and nets +$24.25. Otherwise the buyer loses $75.75. The buyer needs a better than 75.75 percent chance of "yes" to break even, against the model's 69.3 percent. A writer selling the same 100 at the bid locks $100 and receives $63: +$63 if the print is at or below $2.60, -$37 if above.

```
Digital payoff, one contract (strike $2.60)
$1 |                    ********************
   |
   |
   |
$0 |*********************--------------------
    2.30                2.60              2.90   price
```

### Example 2: a monthly floor and cap

November 2026, H100. Listed floor: November average below $2.35, $0.50 wide. Listed cap: average above $2.95, $0.50 wide. One contract covers 720 hours, so maximum payoff and collateral are 720 x $0.50 = $360.

| | Floor (put spread) | Cap (call spread) |
|---|---|---|
| Model fair value | $10.64 | $30.21 |
| Chance of paying anything | 11.8 percent | 21.3 percent |
| Bid and ask | $7.98 and $13.29 | $25.99 and $34.42 |
| Fee on a purchase at the ask | $0.13 | $0.34 |

The model's November average has 10th, 50th and 90th percentiles of $2.32, $2.70 and $3.12. The cap costs more mainly because its strike ($2.95) is closer to the median than the floor's ($2.35).

```
Put spread (floor), $ per hour          Call spread (cap), $ per hour
$0.50 ********                                              ********
              ****                                      ****
                  ***                                ***
                     ****                        ****
$0.00 -------------------***********      ***********-------------------
      1.65 (price) 2.65                    2.65 (price) 3.65
      flat to 1.85, zero from 2.35         zero to 2.95, flat from 3.45
```

At averages of 1.80, 2.00 and 2.20 one floor pays $360, $252 and $108. At 3.00, 3.20 and 3.40 one cap pays $36, $180 and $324. Both pay $0 in between.

**An owner of one GPU.** Revenue is 720 hours times the average price. Buying the floor at the ask plus fee costs $13.29 + $0.13 = $13.42.

| November average | Unhedged revenue | Revenue with floor |
|---|---|---|
| 1.80 | $1,296.00 | $1,642.58 |
| 2.00 | $1,440.00 | $1,678.58 |
| 2.20 | $1,584.00 | $1,678.58 |
| 2.60 | $1,872.00 | $1,858.58 |
| 3.00 | $2,160.00 | $2,146.58 |

Between averages of $1.85 and $2.35 the floor holds revenue at $1,678.58. Below $1.85 the $360 limit is reached and revenue falls again. The $13.42 is paid in every outcome. A renter mirrors this with the cap.

**A collar.** The venue accepts two legs in one transaction. An owner who buys the floor ($13.42 with fee) and sells the cap at the bid ($25.99) takes a net credit of $12.57 on these model quotes, gives up upside above $2.95, and must lock $360 for the cap leg. Quotes differ from the live desk.

### Settlement

Expiry is 23:00 UTC on the last date; oracle settlement opens at 01:00 UTC. Each token then redeems for the payoff per hour times units. The program sets no deadline on claims.

### How well does the price model do

`model.backtest` forecasts later prints from only earlier data and counts how often the print lands inside the model's 80 percent band. The Brier score is for at-the-money yes/no questions. All four chips, same 92-print history:

| Horizon | Samples | Inside 80% band | Brier score (model) | Brier score (coin flip at 0.25) |
|---|---|---|---|---|
| 3 days | 196 | 79.1% | 0.2345 | 0.25 |
| 7 days | 180 | 80.6% | 0.2241 | 0.25 |
| 14 days | 152 | 79.6% | 0.2534 | 0.25 |

Lower Brier is better. The model beats a coin at 3 and 7 days and does not at 14. Two cautions: the volatility scale of 1.5 was chosen on this same history, so coverage near 80 percent is partly by construction, and the monthly examples above project 30 days or more, beyond the tested range.

## 4. Products

**Trade (predict).** Yes/no questions on one day's print, price from $0.01 to $1.00 per contract. For people with a view on the compute market who want a defined loss. It is the entry point, not the pitch.

**Protect (hedge).** Monthly floors and caps sized as one GPU for each hour of the month, plus the two-leg collar. For GPU owners and cloud operators (floor), AI companies with compute budgets (cap), and lenders whose collateral is hardware (floor).

**Earn (weekly vaults).** A vault takes USDC deposits before a week begins. Epoch 1 starts Monday 2026-10-05 00:00 UTC and each epoch lasts seven days (`keeper.js`). During the week the venue's quoter trades the vault's money against users, within on-chain limits:

- At most **20 percent** of deposits at risk in one market (`VAULT_CAP_BPS = 2000`).
- At most **50 percent** at risk across all markets in the epoch (`VAULT_EPOCH_BPS = 5000`).
- The quoter may not pay more than **95 percent** of a contract's maximum payoff when the vault buys, nor sell for less than **1 percent** when it sells (`VAULT_MAX_BUY_BPS`, `VAULT_MIN_SELL_BPS`). This is the fix for the High finding H1.
- Only series that expire inside the epoch can be traded, so monthly hedges mostly go to the desk and the vaults mainly carry daily yes/no markets.

Example: a $10,000 vault allows $2,000 at risk per market (2,000 yes/no contracts, or 5 monthly floors at $360 in a month-end week) and $5,000 across the week. Shares are minted one-to-one. Once the week has ended and every touched series is settled and collected, each share redeems its pro rata slice of the vault's cash (`vault_withdraw`). The vault can lose money; the caps bound it per week. When the vault buys, the LPs bear the 1 percent fee (finding L3, open by design). Earn is for people who accept losing part of a deposit for premium income.

**Activity feed.** A pseudonymous log of trades, with profit and loss from real fills (settled payoff, or the model mark while open). Names are hashed from the wallet address.

## 5. Risks and limits

**Oracle.** Settlement depends on Switchboard and on Ornn's public endpoint staying available and unchanged. If Ornn changes its format or removes the free history, the feed breaks. If a daily print is missing, the feed averages the prints it finds (finding M2; whether closed is UNVERIFIED). The fallback settler can post any price after 72 hours. On EVM no oracle works today.

**Index licence.** Unsigned, per section 2. Settlement also inherits Ornn's "Market Disruption Event" rules, which carry values forward when data is thin.

**Liquidity.** There is no deep market maker. The desk is the venue's own quoter, limited to 20,000 short yes/no contracts and 2,000 short monthly contracts per market (`market.js`). Comparable GPU markets elsewhere are thin, and two earlier on-chain H100 perps were delisted with zero open interest (research/market-structure.md, 2026-10-04).

**Model risk.** The model rests on 92 points, is tuned on the data it is tested on, and extends past its tested range for monthly contracts. A quote is a model price with a spread, not a market consensus. The desk refreshes Ornn data in minutes (finding M5, mitigated by the 19:55 UTC halt).

**Smart-contract risk.** Not audited externally. The internal review (`docs/SECURITY_REVIEW.md`, 2026-10-05) found 2 High issues (a quoter-drain and a hot admin key), 5 Medium and 7 Low. The Solana fixes listed are H1, H2, M1 to M5, L4, L5 and L7; EVM fixes cover H1, H2, L2, L3 and L6. **L1 and L3 remain open by design:**

- L1: the backup settler key can post any price 72 hours after expiry, and it is a hot key on the server.
- L3: two parties could sign a zero-premium trade and skip the fee; only the venue's $0.50 minimum blocks this, not the program.

The admin must be a multisig for the role split to matter; that is not set up. One server also holds hot lister, payer and maker keys.

**Regulatory (no legal advice).** These are open decisions, not conclusions. Event contracts and swaps on a commodity-style index may attract financial regulation; Kalshi is CFTC-registered and gates users, and others exclude US persons (research file). Whether geoblocking is enough is UNVERIFIED and needs counsel. The runbook lists entity, US geoblock and terms of use as pre-launch tasks (`docs/MAINNET.md`); none was found in `app/server.js`. Tax treatment is not analyzed.

## 6. Roadmap and what is next

Near term: (1) devnet deployment, which unlocks the first real `settle_oracle` run; (2) the Ornn licence; (3) wallet checks on the public site; (4) entity, geoblock, multisig and an external audit before any mainnet deposit.

### Candidates after AI chips

Viability weighs a public settleable source, real exposure on both sides, and a price an option can cover. It is my judgment, not a measurement. Sources below were fetched on 2026-10-05 unless noted.

| Candidate | Who hedges | Source checked | Viability |
|---|---|---|---|
| **A. More GPUs on Ornn** (RTX 5090, RTX PRO 6000 WS) | Small clouds, marketplaces | `api.ornnai.com/api/gpu-types` lists both. RTX PRO 6000 history needs a key per earlier research (UNVERIFIED now). | Medium for RTX 5090: same code, same licence talk, few hedgers |
| **B. Other accelerators** (MI300X, B300) | Neoclouds on AMD or Blackwell Ultra | silicondata.com homepage lists MI300X and B300 indices. Paid access per earlier research (UNVERIFIED now). | Low to medium: data belongs to CME's partner |
| **C. TPU, Trainium** | Labs renting them | cloud.google.com/tpu/pricing shows list prices per chip-hour, set by Google, not transacted. No Trainium source fetched: UNVERIFIED. | Low: list prices rarely move |
| **D. Price per million tokens** (and its reciprocal, tokens per dollar) | AI apps with inference bills, labs | `api.ornnai.com/api/otpi` returned four labs for 2026-10-03, public history limited to one month. `openrouter.ai/api/v1/models` is open (466 models, per-token prices). Artificial Analysis needs a free key plus attribution. | Medium: best data fit and same machinery. Prices change in discrete cuts, so yes/no suits better than options. |
| **E. HBM and DRAM spot** | Module makers, server builders | trendforce.com/price/dram/dram_spot is public (DDR5 16Gb session average 58.067, update 2026-10-05). Terms on settlement use not checked: UNVERIFIED. No public HBM price found. | Low to medium for DDR; low for HBM |
| **F. Cloud GPU spot per provider** | Spot bidders | `console-api.akash.network/v1/gpu-prices` is open: H100 SXM5 median $2.55, 68 GPUs, 11 available. AWS's public spot advisor gives savings bands, not prices; price history needs credentials (not tested). | Low: pools small enough for one buyer to move |
| **G. Data-center electricity** | Operators, large loads | CAISO OASIS served day-ahead prices as CSV with no key (node TH_NP15_GEN-APND, 2026-10-03 07:00 UTC, $66.12 per MWh). EIA's API needs a free key. ERCOT returned 403; PJM's host did not resolve from this VM: UNVERIFIED. | Medium on data, low on novelty: deep power hedging already exists elsewhere (general knowledge: UNVERIFIED) |
| **H. PPA prices** | Developers, corporate buyers | leveltenenergy.com/ppa publishes quarterly P25 indices; detail sits behind a form. | Low: quarterly, bilateral, long-dated |
| **I. Colocation $/kW/month** | Operators, tenants | coloprice.com states a $196 per kW per month wholesale average, built from CBRE, JLL and operator quotes. CBRE's page returned 403. | Low: quarterly and derived |
| **J. Bandwidth, egress** | CDNs, data movers | resources.telegeography.com: Q2 2026 lowest 100 GigE transit $0.03 per Mbps per month, falling 17 percent a year. Data paid. No egress benchmark found. | Low: one-way price trend |
| **K. Ornn forward curves** | Capacity planners | Gated; 401 in earlier research | Unavailable until licensed |

The plausible next step is D: same provider, same listing machinery. Anything resting on a proprietary index has the blocker chips have today.

## 7. Glossary

- **Index.** A published number summarizing a price, here Ornn's OCPI in dollars per GPU-hour.
- **Strike.** The price level a contract is measured against.
- **Digital (yes/no).** A contract that pays a fixed amount if the price ends above the strike and nothing otherwise.
- **Call spread (cap).** Pays more as price rises above the strike, up to a ceiling. Protects a renter.
- **Put spread (floor).** Pays more as price falls below the strike, up to a ceiling. Protects an owner.
- **Fee.** The protocol's share, 1 percent of premium, paid by the buyer on top.
- **Collateral.** Money the seller locks so the payoff can always be paid. It equals the maximum payoff.
- **Expiry.** The moment a contract stops trading and awaits its price (23:00 UTC on the last date).
- **Settlement.** Fixing the final price and the payoff.
- **Oracle.** A service that brings an outside number on chain with signatures, here Switchboard.
- **Backup settler.** A key allowed to post the price only 72 hours after expiry if the oracle did not.
- **Vault.** A pool of deposits that underwrites contracts for one week.
- **Fully collateralized.** No one can owe more than they have locked.
