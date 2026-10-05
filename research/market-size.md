# Hourly: market size and venue ceiling

Run date: 2026-10-05. Purpose: an honest ceiling and a first milestone, not a pitch. Tags: VERIFIED-fetched means I opened the page or API this run and read the figure. UNVERIFIED means a search snippet only, a blocked page, or a number whose origin I could not see. Forecasts are labeled as such. Actuals are company-reported.

Blocked or unreadable this run: cnbc.com (403, several articles), iea.org (403), grandviewresearch.com (403), balticexchange.com (challenge page), openrouter.ai/rankings (page fetched but charts are JS, no totals readable), cmegroup.com (not re-fetched; press release seen only through search results), the ICE notice PDF (opened, but the extraction showed only the title, no contract terms), Nebius shareholder letter via WebFetch (corrupt; read instead with pdftotext from the saved PDF).

## 0. The fee, read from code (matters for the arithmetic)

- `program/programs/hourly/src/lib.rs` line 68: `MAX_FEE_BPS: u16 = 500` ("Protocol fee ceiling: 5% of premium"). Lines 143 to 145: admin `set_fee` is capped at 500. Line 240: `let fee = fee_for(premium, config.fee_bps)`, paid by the buyer on top of the premium. `fee_for` = premium x fee_bps / 10,000.
- The program does not hardcode 1%. The 1% is the config value: `app/engine/venue.js:41` has `feeBps: 100`, and tests use `FEE_BPS = 100 // 1% of premium`.
- So the fee is 1% of PREMIUM, not 1% of notional. Revenue = 1% x premium. Premium is a fraction of the collateral (notional) the option can pay out. This is the single most important modelling fact below. The same security review (docs/SECURITY_REVIEW.md:172) notes the fee can be raised to 5% by admin, which is a governance fact, not a plan.

## 1. GPU cloud / AI compute rental (underlying spend)

### Reported actuals

| Company | Figure | Period | Publisher | Status |
|---|---|---|---|---|
| CoreWeave | Revenue $2,575 million (Q2 2025: $1,212 million); backlog "approximately $104 billion as of June 30, 2026", plus $25 billion net new commitments in early Q3 | Q2 2026, released Aug 11 2026 | CoreWeave press release, https://investors.coreweave.com/news/news-details/2026/CoreWeave-Reports-Strong-Second-Quarter-2026-Results/default.aspx | VERIFIED-fetched |
| Nebius | Total revenue $582.3 million; Nebius AI cloud revenue $575 million; "ARR reached $3.0 billion" (ARR defined as last-month AI cloud revenue x 12) | Q2 2026, released Aug 12 2026 | Nebius, https://www.eqs-news.com/news/corporate/nebius-reports-second-quarter-2026-financial-results/16ee02af-2a07-42b5-9937-026f1767ff4c_en (revenue) and shareholder letter PDF https://assets.nebius.com/assets/a6ecfd85-a6cb-4967-8ef7-9a25bd261f9c/SHLQ226.pdf (ARR, read via pdftotext) | VERIFIED-fetched |
| Together AI | "hit $1B in annualized revenue in February 2026"; about 60 to 70% GPU server rental, 30 to 40% API | Feb 2026 | Sacra (third-party estimate), https://sacra.com/c/together-ai/ | VERIFIED-fetched as a Sacra claim; not company-reported |
| Lambda | "more than $1.5B in full-year 2026 revenue" expected (management projection per Sacra); 2025 about $700M (estimate) | FY2026 projection | Sacra, https://sacra.com/c/lambda-labs/ | VERIFIED-fetched as a Sacra claim; forecast, not actual |
| AWS, Azure, Google Cloud | AWS $42.2B, Google Cloud $24.8B quarterly; Azure "$100 billion annualized" | Q2 2026 | Search snippets from aggregators | UNVERIFIED (not fetched; also not GPU-only, so not used in the sizing) |

Annualizing CoreWeave Q2 x 4 gives $10.3 billion (my arithmetic, a run-rate, not a forecast). CoreWeave plus Nebius ARR = $13.3 billion (mixed definitions, shown only as scale).

### Analyst forecasts of "GPU-as-a-service" market size (2026)

| Publisher | 2026 size | Status |
|---|---|---|
| Fortune Business Insights, last updated Sep 14 2026 | USD 8.66 billion (2025: 6.07; 2034 forecast: 162.54; CAGR 44.3%) https://www.fortunebusinessinsights.com/gpu-as-a-service-market-107797 | VERIFIED-fetched, forecast |
| Spheron blog | "GPU rental is estimated at $52.04 billion in 2026, up from $34.62 billion in 2025", $198.74 billion by 2031. The underlying analyst is not named on the page. https://www.spheron.network/blog/compute-futures-cme-gpu-contracts-ai-buyers/ | VERIFIED-fetched; origin of the estimate UNVERIFIED |
| Polaris, Grand View, Mordor, Precedence, Straits, Next MSC, MarkWide | USD 4.90, 5.13, 7.38, 6.10, 10.26, 11.10, 12.7 billion | UNVERIFIED (search snippet list only; Grand View returned 403) |

Reading it plainly: the analyst GPUaaS figures ($5 to $13 billion) are below what CoreWeave alone reports on a run-rate basis ($10.3 billion). The $52 billion figure is larger but its source is invisible. Treat the true 2026 spend as unknown within roughly $10 billion to $52 billion, and note the difference is definitional (what counts as rental vs hyperscaler cloud).

Context, not rental: hyperscaler 2026 capex plan of about $725 billion (Amazon about 200, Microsoft about 190, Alphabet 175 to 185, Meta 115 to 135) is UNVERIFIED (aiweekly.co and others via search snippet; CNBC returned 403). It is chip and building spend, not rental price exposure.

## 2. Inference / token spend

| Item | Figure | Period | Publisher | Status |
|---|---|---|---|---|
| Anthropic run rate | "$65 billion at the end of July 2026" (earlier: $9B end of 2025, $47B May 2026) | Jul 2026 | pondero.ai summary citing TechCrunch/Bloomberg, https://pondero.ai/news/2026-08-18-anthropic-65b-revenue-run-rate/ ; CNBC original returned 403 | VERIFIED-fetched as a secondary summary; primary UNVERIFIED |
| OpenAI run rate | "nearly $70 billion", per Axios sources | Sep 30 2026 | Quartz via Yahoo Finance, https://finance.yahoo.com/markets/stocks/articles/openai-q3-2026-revenue-run-171727199.html | VERIFIED-fetched; a sourced leak, not a filing |
| Conflict | The pondero page gives OpenAI "$40 billion" in August. The two are different dates and both secondary. | | | flagged |
| API share | Neither page says how much is API vs subscription | | | not available |
| OpenRouter volume | "25 trillion tokens per week" (self-reported, May 2026); annualized revenue "surpassed 50 million euro" (reports, unconfirmed) https://www.trendingtopics.eu/openrouter-investment-capitalg-others/ . "over 90 trillion" per week mid-2026, via truefoundry, https://cryptobriefing.com/openrouter-9000x-token-usage-growth/ | May and Aug 2026 | as stated | VERIFIED-fetched as claims by those outlets. 126.2 trillion per week (Sept) is a snippet: UNVERIFIED. No dollar token spend total readable. |

Important caveat: run rates are total company revenue (subscriptions plus API). Inference revenue is what labs earn; it is not the same as the GPU rental that serves it, and most of it is not paid in an index-linked price.

## 3. Adjacent: power and memory

- Power, volume only: IEA "Key Questions on Energy and AI" (April 2026) as reported by Sardina Systems: data centre consumption "almost 500 TWh" in 2025 to "950 TWh" in 2030. https://www.sardinasystems.com/news/ais-electricity-problem-or-what-the-latest-data-actually-shows/ . VERIFIED-fetched as a secondary report; iea.org returned 403. A dollar power-cost figure was NOT obtained from any named source, so I do not size power spend in dollars. UNVERIFIED.
- Memory: SK hynix Q2 2026 revenue 79.3187 trillion won, operating profit 60.5426 trillion won, 76% margin (VERIFIED-fetched, https://news.skhynix.com/en/q2-2026-business-results/). That page gives no HBM revenue figure. HBM market size claims ($54.6 billion Bank of America 2026, $58 billion, Counterpoint share 50/33/18) are search snippets: UNVERIFIED. No DRAM total market size was obtained.
- Hourly relevance: Ornn publishes a memory and token price index (research/market-structure.md, VERIFIED 2026-10-04 there), but nothing in this run shows hedger demand there.

## 4. Existing price-risk venues and analogues

### Compute venues (what I re-fetched today, 2026-10-05)

| Venue | Finding | Status |
|---|---|---|
| Kalshi GPU series | Summed `volume_fp` and `open_interest_fp` over 19 GPU series (1,124 markets) via https://api.elections.kalshi.com/trade-api/v2/events: 3.25 million contracts traded lifetime on markets the API still returns, 1.75 million contracts open interest (includes inactive-market remnants; contracts pay $1, so notional is at most $1 each, actual dollars lower). Lower bound, older events no longer return nested markets. | VERIFIED-fetched (API) |
| Kalshi vs Polymarket early period | Fortune: "$4.4M in notional volume through July 27 against $285K on Polymarket", attributed to Allium research, and "hourly prices can fluctuate as much as 137% over the course of a year". https://fortune.com/2026/08/12/kalshi-compute-futures-cme-intercontinental/ | VERIFIED-fetched |
| Polymarket GPU events | 40 events, lifetime volume $2.60 million, 16 open events with $503k volume and $52.8k open interest (gamma-api.polymarket.com public-search) | VERIFIED-fetched (API) |
| CME / Silicon Data | Launch date was October 5 2026 (today), each contract "a month's worth of rent", pending regulatory review (CME press release, via search result listing; Spheron page). No first-day volume or open interest published or found. cmegroup.com not re-fetched. | Launch terms VERIFIED via fetched Spheron page and search listing; volume NOT AVAILABLE |
| ICE / Ornn OCPI | ICE exchange notice dated Sep 29 2026 opened this run; extraction showed only the title. Contract size (hours in the month), $0.001 tick, 24 months, pending CFTC comment period come from yesterday's market-structure.md (VERIFIED there on 2026-10-04); not re-confirmed today. No volume or open interest found. | partly VERIFIED, volume NOT AVAILABLE |
| Hyperliquid on-chain H100 perps | `xyz:H100` still `isDelisted: true`, day notional volume 0.0, open interest 0.0 (metaAndAssetCtxs, dex xyz, today). `xyz:DRAM` is the Roundhill memory ETF perp (per yesterday's file) and shows 24h notional $21.46 million, open interest 1.91 million (units as returned). `para:H100` and `io:DRAM` not re-fetched today. | VERIFIED-fetched (xyz) |
| Bitget H100USDT / B200USDT | From market-structure.md only: H100 24h volume $283,170 on 2026-10-04; B200 $3,463. Not re-fetched. | from-file, UNVERIFIED today |

Reading: the venues that exist have traded single-digit millions of dollars in total, over roughly three months, against a rental market of at least $10 billion a year. One delisted on-chain perp attracted zero open interest.

### Analogues for scale (paper volume vs physical)

- Dry bulk FFAs (freight): "just under 1.3m lots, equivalent to nearly 1.3bn tonnes of freight in the first half of 2021", and "based on data from the UN Conference on Trade and Development for seaborne coal, iron ore and grain shipments, 2020 FFAs represented 48.5% of the market, up from 42.5% the year before", with mid-2021 near 80% of physical trade. Lloyd's List, https://www.lloydslist.com/LL1137477/Dry-bulk-FFA-volumes-surge-to-fresh-high . VERIFIED-fetched. Units are tonnes of cargo, so this is a volume ratio, not dollars; and it is a decades-old, mature market with commodity hedgers on both sides.
- European power: EEX reports European power derivatives of 9,330.3 TWh in 2025 (+11%) and EEX Group global power 13,493.7 TWh. https://mondovisione.com/media-and-resources/news/annual-volumes-2025-eex-group-markets-reinforce-leading-position-with-records-a-2026113/ . VERIFIED-fetched. I did not fetch European consumption, so I CANNOT state the ratio. The churn definition ("ratio between the volume of all trades in all timeframes executed in a given market and its total demand") and a regulator minimum of 3 (ACER/CEER 2015 report) are from https://emissions-euets.com/internal-electricity-market-glossary/954-churn-rate (VERIFIED-fetched; the same page says there is "no consensus" on the level).
- Promoter claim, not an analogue: Kalshi CEO says compute futures will reach "10-15 times the size of the underlying spot market" and compute "will be a $10 trillion industry by 2030" (Fortune, fetched). This is a CEO forecast, and it conflicts with the evidence above: observed GPU paper notional is about 0.06% of annual rental spend (section 5).
- First-year ratios for early power, freight or electricity futures markets: NOT obtained. I have only mature-market ratios, so there is no cited analogue for a venue in its first 90 days.

## 5. Sizing table

Inputs and labels.
- S = underlying annual GPU rental spend. Low $10.3 billion = CoreWeave Q2 2026 x 4 (VERIFIED actual, run-rate). Base and High $52.04 billion = the Spheron-quoted estimate (origin UNVERIFIED). Chosen to span reported to estimated.
- M = notional traded (all venues) as a multiple of S.
  - Observed today: (Kalshi 3.25M contracts + Polymarket $2.60M) / $10.3B = 5.8M / 10.3B = 0.00057, accumulated over about three months across all venues. Low case uses 0.001 (ASSUMPTION, rounded up from the observed 0.00057).
  - Base 0.05 (ASSUMPTION, no analogue; between observed and mature).
  - High 0.485 (cited analogue: dry bulk FFAs reached 48.5% of physical cargo in 2020, after about two decades; a mature-market level, applied here only as an upper bound).
- Share = Hourly's share of all compute-price notional. 2%, 10%, 25% (ASSUMPTION; today CME, ICE, Kalshi, Polymarket, Bitget all exist).
- Premium ratio = premium as % of collateral notional. 5%, 10%, 20% (ASSUMPTION; depends on strike distance and vol; Ornn quotes show one-year hourly price swings up to 137% per Allium via Fortune, which argues for high premiums).
- Take = 1% fee x premium ratio (fee read from code).
- Hedgeable share of S is not applied separately: the multiple M is applied to total spend S, and I show it as a check. Contracted backlog is a reason to expect low hedgeable share: CoreWeave backlog $104 billion (VERIFIED) is contracted revenue. What fraction of it floats with spot is UNVERIFIED and not disclosed on the page I read.

| Case | S | M | Notional, all venues = S x M | Hourly share | Hourly notional | Take (1% x premium ratio) | Hourly fee revenue per year |
|---|---|---|---|---|---|---|---|
| Low | $10.3B | 0.001 | $10.3M | 2% | $0.21M | 0.050% (5% premium) | about $103 |
| Base | $52.04B | 0.05 | $2.60B | 10% | $260M | 0.100% (10% premium) | about $260,200 |
| High | $52.04B | 0.485 | $25.2B | 25% | $6.31B | 0.200% (20% premium) | about $12.6M |

Arithmetic example, Base: 52.04e9 x 0.05 = 2.602e9; x 0.10 = 2.602e8; x (0.01 x 0.10 = 0.001) = 2.602e5 dollars.

Required annual Hourly notional for a revenue target:
| Target | At 0.05% take | At 0.10% take | At 0.20% take |
|---|---|---|---|
| $10M | $20B | $10B | $5B |
| $50M | $100B | $50B | $25B |

For scale: the total GPU paper volume found across Kalshi and Polymarket is about $5.8 million. The $10M revenue case needs Hourly alone to do at least 850 times that, every year (5e9 / 5.8e6 = 862 at the most generous take).

Does this support a $1 billion company? Unproven, and on current evidence unsupported. Only the High case reaches $10M of fee revenue, and it needs a mature-market FFA-style paper ratio, a $52 billion rental base, a 25% share of all venues, and 20% premiums at once. The Base case gives about $0.26M a year. A $1 billion valuation needs on the order of tens of millions of revenue under any normal multiple (my judgment, not a cited figure), and no case here shows that outside High. The honest label is: not disproven because the market is two quarters old and the exchanges launched today, but nothing measured supports it.

Three facts that would change the answer:
1. First-quarter open interest and volume on CME (Silicon Data) and ICE (Ornn) futures. If it reaches billions of notional per month with named neocloud or lender hedgers, M moves from 0.001 toward the FFA range. If it stays near Kalshi's scale, the Low case holds.
2. The share of neocloud and lender revenue that is spot-linked rather than fixed in contracts like CoreWeave's $104 billion backlog, plus evidence anyone hedges with options (no source found mentions options on CME or ICE contracts). This sets the true hedgeable base.
3. Realized premium-to-collateral ratios and whether takers pay them: the 1% fee is on premium, so the premium ratio moves revenue 4x within my own range. Also whether an Ornn data license and a reliable Switchboard oracle path exist for settlement at scale.

## 6. First milestone (90 days)

Anchor: Polymarket's whole GPU category has done $2.60 million lifetime across 40 events (16 open, $503k), and Kalshi's has done 3.25 million contracts. A launch cannot credibly beat established venues in a quarter.

A credible 90-day target (JUDGMENT, anchored to the figures above, not a forecast):
- Notional: $1 million to $3 million cumulative collateral-notional filled, which is roughly the size of Polymarket's 16 open events' volume to its lifetime volume. At a 10% premium ratio this is $100k to $300k of premium and $1,000 to $3,000 of fees.
- Users: 100 to 300 unique funded wallets, 20 to 50 who trade at least twice, and at least one market maker or vault quoting two-sided on a daily series.
- Product gates to watch rather than revenue: fill rate on quoted series, spread vs Kalshi's same-day strikes, and settlement on the oracle with zero disputes.
- A signal that would say stop: if after 90 days the filled notional is under $250k and nearly all of it comes from the team's own wallets.

## 7. Claims audit

| Claim | Number | URL | Date / period | Status |
|---|---|---|---|---|
| Hourly fee is on premium, 100 bps default, max 500 | 1%, 5% | program/programs/hourly/src/lib.rs:68,143,240; app/engine/venue.js:41 | code read 2026-10-05 | VERIFIED-fetched (local code) |
| CoreWeave Q2 revenue | $2,575M | investors.coreweave.com (link above) | Q2 2026 | VERIFIED-fetched |
| CoreWeave backlog | about $104B; +$25B early Q3 | same | Jun 30 2026 | VERIFIED-fetched |
| Nebius Q2 revenue | $582.3M | eqs-news.com link above | Q2 2026 | VERIFIED-fetched |
| Nebius ARR | $3.0B | assets.nebius.com SHLQ226.pdf | end June 2026 | VERIFIED-fetched |
| Nebius FY2026 ARR guidance $7 to 9B | $7B to $9B | search snippet | 2026 | UNVERIFIED (not in my PDF read) |
| Together AI annualized revenue | $1B, 60 to 70% rental | sacra.com/c/together-ai/ | Feb 2026 | VERIFIED-fetched (third party) |
| Lambda FY2026 expectation | >$1.5B | sacra.com/c/lambda-labs/ | Aug 2026 | VERIFIED-fetched; forecast |
| AWS / Azure / Google Cloud Q2 2026 | $42.2B / $100B annualized / $24.8B | search snippets | Q2 2026 | UNVERIFIED |
| GPUaaS market, Fortune BI | $8.66B (2026) | fortunebusinessinsights.com link | updated Sep 14 2026 | VERIFIED-fetched; forecast |
| GPU rental estimate, Spheron | $52.04B (2026) | spheron.network link | undated | VERIFIED-fetched; origin UNVERIFIED |
| Other GPUaaS analyst sizes | $4.90B to $12.7B | search snippet | 2026 | UNVERIFIED |
| Hyperscaler capex 2026 | about $725B | aiweekly.co snippet | 2026 | UNVERIFIED |
| Anthropic run rate | $65B | pondero.ai link | Jul 2026 | VERIFIED-fetched (secondary) |
| OpenAI run rate | nearly $70B | finance.yahoo.com link | Sep 30 2026 | VERIFIED-fetched (leak via Axios) |
| OpenRouter tokens | 25T/week; 90T+/week | trendingtopics.eu; cryptobriefing.com | May; Aug 2026 | VERIFIED-fetched as claims |
| OpenRouter 126.2T/week; $100M+ spend | | search snippet | Sep 2026 | UNVERIFIED |
| IEA data centre electricity | about 500 TWh (2025), 950 TWh (2030) | sardinasystems.com | Apr 2026 report | VERIFIED-fetched (secondary); iea.org 403 |
| Power cost in dollars | none | | | NOT OBTAINED |
| SK hynix Q2 revenue | 79.3187T won | news.skhynix.com link | Q2 2026 | VERIFIED-fetched |
| HBM market $54.6B / $58B | | search snippet | 2026 | UNVERIFIED |
| Kalshi GPU series volume | 3.25M contracts; OI 1.75M | api.elections.kalshi.com | 2026-10-05 | VERIFIED-fetched |
| Kalshi $4.4M vs Polymarket $285K | | fortune.com link | through Jul 27 2026 | VERIFIED-fetched |
| Polymarket GPU lifetime volume | $2.60M, 40 events; open $503k | gamma-api.polymarket.com | 2026-10-05 | VERIFIED-fetched |
| CME launch Oct 5, month of rent | | spheron.network; CME release via search | Aug 2026 | VERIFIED as announced; first-day volume NOT AVAILABLE |
| ICE Ornn OCPI futures | contract terms | ICE notice PDF (title only read today) | Sep 29 2026 | UNVERIFIED today; from-file 2026-10-04 |
| Hyperliquid xyz:H100 | delisted, 0 volume, 0 OI | api.hyperliquid.xyz/info | 2026-10-05 | VERIFIED-fetched |
| Bitget H100USDT volume | $283,170 24h | api.bitget.com | 2026-10-04 | from-file, UNVERIFIED today |
| Dry bulk FFA vs physical | 48.5% (2020), near 80% (mid-2021) | lloydslist.com link | 2020 to 2021 | VERIFIED-fetched; tonnes basis |
| EEX European power derivatives | 9,330.3 TWh | mondovisione.com link | 2025 | VERIFIED-fetched |
| European power consumption / churn ratio | | | | NOT OBTAINED |
| Churn minimum of 3 | | emissions-euets.com | ACER/CEER 2015 | VERIFIED-fetched |
| Kalshi CEO 10 to 15x; $10T by 2030 | | fortune.com link | Aug 2026 | VERIFIED-fetched; promoter claim |
| First-year ratios of early power/freight futures | | | | NOT OBTAINED |
| Sizing assumptions (M, share, premium ratio, hedgeable share) | | | | ASSUMPTION, labeled in section 5 |
| 90-day target | | | | JUDGMENT |
