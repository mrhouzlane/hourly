# Hourly: market structure research

Run date: 2026-10-04. Every factual claim is tagged VERIFIED (URL, date seen) or UNVERIFIED (what blocked it). Nothing here is filled from memory.

Status: IN PROGRESS (checkpointed after each section).

## A. Underlyings that could be listed

### A1. What Ornn publishes, and what is readable with no key

Method: downloaded data.ornn.com (redirects to /preview), its Next.js JS chunks, the Mintlify docs index (data.ornn.com/docs/llms.txt) and the OpenAPI spec (data.ornn.com/docs/openapi.yaml), then called every candidate endpoint with curl and no key on 2026-10-04 (~17:20 UTC).

**Index families (VERIFIED, data.ornn.com/pricing and data.ornn.com/docs/access-tiers.md, seen 2026-10-04):** Compute Price Index (OCPI), Forward Curves, Memory Index (DRAM, flash, modules), Token Price Index (OTPI, $/Mtok by lab), Token Volume Index, Workload Cost Index, LLM Coding Analytics ("Coding Activity Index"), Model Frontier, Compute Buyers, Power Markets, Datacenter Sites.

**Tiers (VERIFIED, data.ornn.com/pricing, 2026-10-04):** Index = free; Premium = $500/month (all GPUs, memory, coding, workload, all-time daily history, daily API keys, live forward curves for five GPUs); Full = custom (B300/GB200/GB300 forwards, hourly indices, hourly API keys, exports). Public rate limit is 60 requests/minute/IP (VERIFIED, data.ornn.com/docs/rate-limits.md).

**Documented API host (VERIFIED, openapi.yaml `servers: https://api.ornnai.com`, 2026-10-04):** the OpenAPI spec marks these routes `security: []` (public): `/api/gpu/{gpuName}`, `/api/daily-index/all`, `/api/daily-index`, `/api/daily-index/{gpuName}/previous`, `/api/gpu/{gpuName}/index-history`, `/api/h100-history`, `/api/day-index`, `/api/otpi`, `/api/gpu-types`, `/api/gpu-types-free`, `/api/token-types`, `/api/token-types-free`, `/api/memory-types`, `/api/llm-coding/products`, `/health`. Everything else needs `Authorization: Bearer sk_prem_...` or `sk_live_...`. The index-history route the project uses is therefore a **documented public endpoint** ("Get a public daily series"). The Cloud Run host and api.ornnai.com returned identical payloads for every route I tried. Ornn's own H100 market page links its "Free JSON" button to the Cloud Run URL (VERIFIED, href in data.ornn.com/markets/h100-sxm HTML, 2026-10-04).

Working no-key URLs, with a sample value (all VERIFIED by curl, 2026-10-04):

| What | URL | Sample |
|---|---|---|
| OCPI daily history, 92 points, `access: public-3mo` | https://api.ornnai.com/api/gpu/H100%20SXM/index-history (same on https://ornn-backend-api-135941626504.us-central1.run.app/api/gpu/H100%20SXM/index-history and https://data.ornn.com/api/public-index/gpu/H100%20SXM/index-history) | 2026-10-03T20:00Z = 2.64 $/GPU-hr; first point 2026-07-04 = 2.55 |
| Same for H200, B200, A100 SXM4, RTX 5090 | replace the GPU name | 2026-10-03: H200 6.05, B200 7.81, A100 SXM4 0.90, RTX 5090 0.60 |
| Latest daily print, all GPUs | https://api.ornnai.com/api/daily-index/all | date 2026-10-03T20:00Z, 5 GPUs |
| Current (intraday) value, one GPU | https://api.ornnai.com/api/gpu/H100%20SXM | 2.67, last_updated 2026-10-04T17:04:03Z; B200 7.55 |
| OTPI, latest day, 4 free labs | https://api.ornnai.com/api/otpi (also data.ornn.com/api/public-index/otpi) | anthropic 1.1552 $/Mtok, openai 0.4047, google 0.6293, deepseek 0.0489 (date 2026-10-03, computedAt 2026-10-04T12:03Z) |
| OTPI history, `access: public-1mo` | https://api.ornnai.com/api/otpi?lab=anthropic&startDate=2026-06-01&endDate=2026-10-04 | 30 rows, 2026-09-04 (1.3883) to 2026-10-03 (1.1552); a wider range is clipped to 1 month |
| Forward curve shape (site route, not the API) | https://data.ornn.com/api/public-index/forward-shape | B300 only, normalised: 1M 100, 6M 65.4, 1Y 56.7, 3Y 42.5, 5Y 37.5 (`source: shape`, not $ marks) |
| Memory catalog only | https://api.ornnai.com/api/memory-types | 14 parts (7 DRAM, 4 flash, 3 modules), no prices |
| Coding catalog only | https://api.ornnai.com/api/llm-coding/products | 13 products (e.g. cc-prs, codex-prs, cc-vs-codex), no values |

Gated (returned 401 "API key required" with no key, VERIFIED 2026-10-04): `/api/memory-index`, `/api/memory/{id}/history`, `/api/forward`, `/api/workload`, `/api/llm-coding/index`, `/api/gpu/{gpu}/history-range`, `/volume-metrics`, `/volatility`, `/api/power/markets`. RTX PRO 6000 WS index-history returns "requires an API key". B300/GB200 return "Invalid GPU type" (no spot index, forwards only).

Discrepancies to know about (VERIFIED, 2026-10-04): the docs say the free tier covers 4 GPUs (access-tiers.md, price-index.md), but the live API and /pricing serve 5 including RTX 5090. The docs also list RTX PRO 6000 WS as tracked, and the live `/api/gpu-types` lists 6 GPUs.

**How the print is made (VERIFIED, data.ornn.com/methodology and docs/price-index.md, 2026-10-04):** each hourly value is a volume-weighted, winsorized mean of executed on-demand rental transactions in a rolling one-hour window; the winsorization percentile is not published. The daily value is "the aggregated daily average of the hourly values". The market page says it is "settled daily at 4:00 PM ET" (stamped 20:00Z). Ornn "does not restate historical index values" except for falsification or material calculation errors, and advises settlement users to keep their own records. Market Disruption Events fall back to the last Tier-1 value. Ornn states that "Neither Ornn nor any affiliate trades in or makes markets in products indexed to OCPI", while its affiliate rents compute (compute.ornn.com) against the same index.

**Licence, the load-bearing risk (VERIFIED, quoted from data.ornn.com/terms, effective May 29 2026, and data.ornn.com/premium-data-use, effective Aug 19 2026, both public, seen 2026-10-04):**
- Terms of Use, applying to all users including the free tier: "No Company Data may be used for external publication, republication, redistribution, resale, syndication, sublicensing, disclosure, benchmarking, settlement, reference, valuation, model training, product development, or other commercial exploitation unless expressly authorized in advance by the Company in a separate written agreement." They also bar making Company Data available through any "trading system, financial product".
- Premium Data Use Addendum: Premium users may not "create ... any index, benchmark, reference rate, price assessment, oracle, net asset value, or settlement product that uses Company Data as an input" or "use Company Data in listed derivatives, structured products, tokens, or similar instruments without a separate written index or redistribution license". Its public-prints carve-out lets "headline values ... be used, displayed, and referenced subject to attribution", but it does not mention settlement.
- The project's progress.md says the addendum is "behind paywall". It is not: the page is public.

**Licensees visible today (VERIFIED, 2026-10-04):** ICE (notice below), Kalshi and Polymarket both settle live markets on Ornn (Section D). Whether they hold written licences is UNVERIFIED (no public licence text found).

### A2. Other compute price sources

| Source | What it is | Openly readable? | Status |
|---|---|---|---|
| Silicon Data (SDH100RT, plus a B200 rental index) | Daily rental index; CME futures underlying | Page shows a headline value ($2.78/GPU-hr Neo-Cloud, "as of October 4, 2026", +2.2% 7d). No free API: portal (7-day trial), Bloomberg ticker SDH100RT, paid API, distributors | VERIFIED, https://www.silicondata.com/products/silicon-index/h100, 2026-10-04 (via WebFetch summary) |
| SemiAnalysis GPU Spot-Contract Composite | Hourly $/GPU-hr composite, Bloomberg SAH100SC | Charts free on the page; data through sales@semianalysis.com | VERIFIED page and ticker, https://gpu-index.semianalysis.com/, 2026-10-04. The headline number the fetch returned ($2.82, labelled Apr 2026) may be stale or misread: UNVERIFIED |
| SF Compute | Live order book for GPU clusters (node-hour limit prices, fills) | Order book API is "public, anonymized" but needs a Bearer token (account). sfcompute.com/prices now redirects to the homepage | VERIFIED, https://docs.sfcompute.com/preview/orderbook.md, 2026-10-04 |
| getdeploying.com GPU Rental Price Index | Weekly, median on-demand list price across providers (per search snippet) | Blocked: Cloudflare JS challenge (403) for both WebFetch and curl | UNVERIFIED, construction known from a search snippet only |
| Akash Network | On-chain GPU marketplace stats | Open JSON, no key: https://console-api.akash.network/v1/gpu-prices. H100 SXM5 weighted average $2.72, 68 GPUs total, 7 available | VERIFIED, 2026-10-04. Provider bids on a small pool, not a settled index |
| Vast.ai | Marketplace asks | Open, no key: `PUT https://console.vast.ai/api/v0/search/asks/`. 18 rentable H100 SXM offers, median $3.52/GPU-hr | VERIFIED, 2026-10-04. Listings, not transactions |
| Others surfaced by search (aimultiple.com/gpu-index, Mercatus GPU Index, fabryka.ai gpu-price-index.vercel.app, gpusmith) | Listing-price trackers | Not fetched | UNVERIFIED |

**Exchange contracts on these indices:**
- CME, Silicon Data H100 and B200 Rental Index Futures: launch October 5, 2026, "pending regulatory review", each contract "a month's worth of rent". The release names DRW as Silicon Data's backer, and options are not mentioned (VERIFIED, PR Newswire release dated Aug 11 2026, https://www.prnewswire.com/news-releases/cme-group-and-silicon-data-to-launch-compute-futures-on-october-5-to-unlock-new-way-to-hedge-ai-risks-302848593.html, seen 2026-10-04). cmegroup.com itself returned 403 to curl and timed out in WebFetch.
- ICE Futures U.S., OCPI H100 (HPR) and B200 (BKL): monthly, cash settled on the "average of the daily prices on OCPI ... for the contract month". Contract size is the number of hours in the month; quotes are in $0.001 per GPU-hour; up to 24 consecutive months; cleared at ICEU. No listing date, "pending completion of the request for comment period on compute futures by the Commodity Futures Trading Commission". From Oct 5 2026, ICE will show hypothetical daily settlements (VERIFIED, https://www.ice.com/publicdocs/futures_us/exchange_notices/ICE_Futures_US_Exchange_Notice_ORNN_Compute_4Q2026_20260929.pdf, notice dated Sep 29 2026, seen 2026-10-04).

## B. Who creates markets elsewhere

### B1. Polymarket
- **Who lists:** "Markets are created by the markets team with input from users and the community. While users cannot directly create their own markets, they are encouraged to suggest ideas" (VERIFIED, https://help.polymarket.com/en/articles/13364541-how-are-markets-created, 2026-10-04). The listing cost to a user is not applicable, because users cannot list.
- **What stops bad markets:** every market carries written rules (resolution source, end date, edge cases). Resolution runs through the UMA Optimistic Oracle: "Anyone can propose", with a bond of "typically $750 pUSD" and a 2-hour challenge period. A second dispute escalates to a UMA DVM token-holder vote of about 48 hours. Polymarket can add "Additional context" clarifications (VERIFIED, https://docs.polymarket.com/concepts/resolution.md, 2026-10-04).
- **Fees:** taker fee = C x feeRate x p x (1-p). feeRate is 0.04 for Tech and Finance, and makers are never charged. Maker rebates return 25% of taker fees in Tech and Finance (VERIFIED, https://docs.polymarket.com/trading/fees.md and /programs/maker-rebates.md, 2026-10-04).
- **GPU precedent:** Polymarket's H100 markets resolved on Silicon Data SDH100RT in February and April 2026, then on the "Ornn H100 Index" (dashboard.ornnai.com) from the May 31 series onward (VERIFIED, gamma-api.polymarket.com event descriptions, 2026-10-04).

### B2. Kalshi
- **Who lists:** Kalshi itself, as a CFTC-registered DCM, by self-certification. The GPU series all point to one generic contract, "Will <index> be <above/below/exactly/at least/between> <value> <in/at> <time period>?" (rulebook INDEXVALUE), self-certified under CFTC Reg 40.2(a) on November 26, 2025 and signed by Kalshi's Head of Markets. The filing says "A new Source Agency can be added via a Part 40 amendment" (VERIFIED, https://assets.kalshi.com/regulatory/product-certifications/INDEXVALUE.pdf, seen 2026-10-04).
- **What stops bad markets:** CFTC core-principle compliance, a Position Accountability Level of "$25,000 per strike, per Member", and series-level prohibitions: "Persons who are employed by any of the Source Agencies are not permitted to trade", along with anyone holding MNPI. For the GPU series that means Ornn staff (VERIFIED, INDEXVALUE.pdf and the series metadata from https://api.elections.kalshi.com/trade-api/v2/series, 2026-10-04).
- **Cost to list:** internal to Kalshi, not public (UNVERIFIED). GPU series fee type is `quadratic_with_maker_fees` (VERIFIED, series API).

### B3. Hyperliquid HIP-4 (outcomes) and HIP-3 (perps)
- **What HIP-4 is:** "Outcomes are fully collateralized contracts that settle within a fixed range ... useful for applications such as prediction markets and bounded options-like instruments". The first market was a recurring daily BTC binary settling at 06:00 UTC, and outcome fees are "currently zero" (VERIFIED, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets.md, 2026-10-04).
- **Templates and deployers:** "validators vote on outcome templates, which HIP-4 deployers use as the basis for permissionless deployments". A market that contradicts its template's `semanticRestriction` "is considered malformed and slashable". Deployers must keep their stake for at least 183 days. Standalone outcomes "may settle to any fraction (e.g. "0.66" for scalar payouts)". The deployer fee scale runs from 0 to 10 times the base fee, with the deployer getting the scale part (VERIFIED, https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/hip-4-deployer-actions.md, 2026-10-04). That page is still labelled "Testnet-only", but mainnet has live deployers (next point).
- **Live on mainnet (VERIFIED, `outcomeMeta` and `outcomeTemplates` on https://api.hyperliquid.xyz/info, 2026-10-04):** 28 validator-approved templates, including `binaryPriceExternal` ("must refer to a publicly verifiable price from an authoritative external feed", settled on a TWAP of that feed), `scalarPrice` (a linear payoff between low and high on a Hyperliquid perp, i.e. a call spread) and `aiModelHeadToHead`. There are 305 outcomes across 3 deployer venues: `out` (149), `txyz` (87), `skew` (61), plus 8 protocol outcomes.
- **Stake and slashing:** permissionless HIP-4 deployment requires 500,000 HYPE locked for six months. Validators can slash "for poorly defined markets, incorrect settlement, or failure to settle within one week". Each deployer starts with 100 outcome slots and may charge up to 50% (VERIFIED, The Block, https://www.theblock.co/post/408875/hyperliquid-hip-4-permissionless-deployment, published July 20 2026, via WebFetch). Outcome (venue `out`) states "HIP-4 deployment requires a stake of 500,000 HYPE, which Outcome holds" (VERIFIED, https://docs.outcome.xyz/outcome-architecture).
- **HIP-3:** 500k HYPE stake, kept at least 183 days after deployment. The deployer defines the oracle and contract spec and settles, and validators can slash up to 100% / 50% / 20% depending on harm. The docs warn: "Most price indices are not amenable as perp oracle sources" (VERIFIED, https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-3-builder-deployed-perpetuals.md, 2026-10-04).

### B4. Solana prediction markets in 2026
- **Drift BET:** Drift lost $295.4M in an April 1, 2026 exploit attributed to a North Korean group. It now operates as "Velocity, formerly Drift", and opened recovery claims paying about 1 cent per dollar (VERIFIED, The Block, Oct 2 2026, https://theblock.co/news/ecosystems/2026-10-02-drift-opens-exploit-recovery-claims-initial-payouts-just-over-1-user-losses-417581). docs.drift.trade now redirects to docs.velocity.exchange: "Velocity is a fork of Drift v2 ... a new program deployment, no onchain state carried over" (VERIFIED, curl 2026-10-04). Whether BET still runs is UNVERIFIED (app.drift.trade/bet is a JS shell; no market data reachable).
- **Kalshi on Solana:** Kalshi tokenized markets on Solana on Dec 1, 2025 with DFlow and Jupiter, using "a hybrid RFQ system [that] atomically executes trades onchain" (VERIFIED, https://news.kalshi.com/p/kalshi-solana-tokenized-predictions). Today DFlow's prediction-market API docs return 404, its production API returns 403 without a key, and its docs index describes spot trading plus "Proof" wallet identity verification (VERIFIED, pond.dflow.net, 2026-10-04). **Whether Kalshi's GPU series are tradable on Solana today is UNVERIFIED** (blocked by the API key).
- **Jupiter x Polymarket:** Jupiter embedded Polymarket in a "Prediction tab" on Solana (VERIFIED, Invezz via TradingView, Feb 1 2026). Whether the GPU markets are exposed there is UNVERIFIED.
- **World (world.xyz):** live July 1, 2026 inside Phantom (about 20M users). It is non-custodial, routes "orders to liquidity providers on Solana", settles through Chainlink Data Streams and pays out in CASH. It replaced Kalshi in Phantom for positions opened on or after June 1. "World has not published volume or liquidity figures" (VERIFIED, Yahoo Finance/BeInCrypto, July 2 2026). Who may create World markets is UNVERIFIED.
- PNP Exchange, Hedgehog and Triad are described as permissionless Solana prediction markets by search snippets only (UNVERIFIED, not fetched).

### B5. On-chain options venues
- **Derive:** the team lists ("speed-to-list has been Derive's edge"). V3 goes live Oct 6, 2026 with isolated "risk universes" (Prime, Mid-cap, Alt, RWA). The governance vote passed 99.18% from "just 12 votes", and at launch a Derive Foundation subsidiary multisig controls the protocol with a "6-of-8 path to bypass its timelock". Derive cleared about $14.2B of options notional in 2026 (VERIFIED, Bankless, Oct 1 2026, https://www.bankless.com/read/derive-v3-wants-to-be-the-engine-of-onchain-options). The live API shows 14 currencies with options, including XAUT (VERIFIED, `public/get_all_currencies` on api.lyra.finance, 2026-10-04).
- **Rysk:** the user picks asset, strike and expiry, and "the RFQ engine requests live bids from integrated makers". The maker side is "open to anyone interested in bidding" (onboarding via Telegram). Positions are fully collateralized and "physically settled" against a Stork oracle reference price (VERIFIED, https://docs.rysk.finance/getting-started/protocol-and-product/how-it-works, 2026-10-04). Who chooses the listed assets is not stated (UNVERIFIED, presumably the team).
- **Aevo:** exchange-listed. 2,866 active option instruments on BTC, ETH, SOL and HYPE (VERIFIED, https://api.aevo.xyz/markets?instrument_type=OPTION, 2026-10-04). No permissionless listing path found (UNVERIFIED).
- **Manifest x Dual Finance (Solana):** "options markets supporting calls and puts on any token", April 2026 (VERIFIED, https://solana.com/news/solana-ecosystem-roundup-april-2026). Who can create, bonds, settlement and oracle are UNVERIFIED (the SolanaFloor article had no mechanics).

## C. Who funds liquidity

### C1. How venues source liquidity in 2026

**Prediction markets**
- **Polymarket liquidity rewards:** resting limit orders earn daily rewards. Each market sets a minimum size, a maximum spread and a reward pool, scored on two-sided depth and closeness to the midpoint. The minimum payout is $1 (VERIFIED, https://docs.polymarket.com/programs/liquidity-rewards.md). Maker rebates are funded by taker fees (B1).
- **Polymarket GPU markets, measured:** 40 GPU-rental events, 38 settled on Ornn and 2 on Silicon Data. Lifetime volume is about $2.58M ($1.68M on the Ornn events). 16 events are open now, with $490k volume, $89k liquidity and $51.8k open interest. Summing `rewardsDailyRate` over their markets gives about $1,046 per day of LP rewards (unit assumed USDC/day). On the H100 end-of-October event, the $2.50 to $2.75 bracket quoted 0.24/0.25 while the tails were 0.005/0.076 (VERIFIED, gamma-api.polymarket.com, 2026-10-04).
- **Kalshi Liquidity Incentive Program:** Kalshi snapshots the book once per second. Orders count only if both sides reach a Target Size (100 to 20,000 contracts), and the program ends January 1, 2027. Non-U.S. users are ineligible for rewards (VERIFIED, https://help.kalshi.com/en/articles/13823851-liquidity-incentive-program, 2026-10-04).
- **Kalshi Liquidity Provider Program:** members under a Market Maker Agreement can become Designated Liquidity Providers for "Incentivized Series", chosen by an "auction" on the minimum reward they will accept. No GPU series appears on the current list. AI-adjacent "AI Share" series do (VERIFIED, https://help.kalshi.com/en/articles/15410219-liquidity-provider-program, 2026-10-04).
- **Kalshi GPU markets, measured:** across 19 Ornn-settled series (H100/H200/B200 weekly, monthly, monthly-average, quarterly, yearly, daily-print), about 3.25M contracts have traded since May to June 2026, with about 192k contracts of open interest on active markets ($1 notional each; contracts, not dollars). The busiest are the monthly-average series KXH200MS (596k), KXH100MS (361k) and KXB200MS (358k), and the daily-print series KXH200WS (557k), KXB200WS (431k) and KXH100WS (416k) (VERIFIED, `volume_fp`/`open_interest_fp` summed from https://api.elections.kalshi.com/trade-api/v2/events?series_ticker=..., 2026-10-04).

**Named firms (prediction markets and on-chain options)**
- Susquehanna International Group: Kalshi market maker "providing pricing and liquidity" (VERIFIED, CoinDesk, Aug 19 2026, https://www.coindesk.com/markets/2026/08/19/cantor-opens-kalshi-prediction-markets-to-thousands-of-institutional-clients). The same article says Cantor Fitzgerald brokers Kalshi block trades for about 3,000 institutional clients.
- Jump Trading: equity stakes in Kalshi and Polymarket in exchange for liquidity. The Polymarket stake "will depend on how much trading capacity Jump ultimately provides" (VERIFIED, Finance Magnates, Feb 9 2026).
- FalconX: "quoting across Derive's options markets; both the central limit orderbook and RFQ", with off-chain collateral represented on-chain as fxUSDC (VERIFIED, https://insights.derive.xyz/falconx-brings-institutional-liquidity-onchain/, Oct 9 2025). It also has a Kalshi partnership for institutional access and block trades (VERIFIED, falconx.io newsroom, May 5 2026).
- Derive opened RFQ quoting "to everyone" with maker rebates and rewards (VERIFIED, insights.derive.xyz, Dec 9 2025).
- DRW, Wintermute and Flow Traders building prediction-market desks: search snippets only (UNVERIFIED; CNBC Aug 19 2026 returned 403).
- HIP-4 outcome liquidity reportedly comes from individuals and small teams, with no known market-making firm found: an Arrakis analysis posted on X (UNVERIFIED, X blocked).

**LP vaults**
- Hyperliquid HLP: a "protocol vault that provides liquidity to Hyperliquid through multiple market making strategies, performs liquidations ... fully community-owned", with a 4-day deposit lock-up (VERIFIED, https://hyperliquid.gitbook.io/hyperliquid-docs/hypercore/vaults/protocol-vaults.md). Live account value is about $181.6M (VERIFIED, `vaultDetails` on api.hyperliquid.xyz, 2026-10-04). There is no evidence that HLP quotes HIP-4 outcomes (UNVERIFIED).
- Derive V3 adds "one-click vault deployments" and outside-team options-strategy vaults (VERIFIED, Bankless, Oct 1 2026). A Rysk market-making vault is mentioned only in a search snippet (UNVERIFIED).

### C2. Natural hedgers in compute
- **GPU-backed lenders (long GPU cash flows, so natural floor buyers):**
  - USD.AI (Permian Labs) makes "non-recourse GPU-backed loans" for H100, H200, B200 and GB300 servers: about 75% LTV, about 36-month amortizing, collateral held in a bankruptcy-remote SPV, a DSRA of about 10%, and borrowing "not publicly self-serve" (VERIFIED, https://docs.usd.ai/borrower/faq.md and /usdai/risks-and-mitigants.md, 2026-10-04). DefiLlama TVL is $334.3M on Arbitrum (VERIFIED, https://api.llama.fi/protocols, 2026-10-04).
  - GAIB tokenizes GPU financing. As of Q4 2025 it reported $50.4M of tokenized AI assets, over 2,000 cards (H100, H200, RTX6000) and 10+ NCP partners, including a $30M SIAM AI refinancing (VERIFIED, https://docs.gaib.ai/products/gaib-products/track-record-and-pipeline.md). DefiLlama TVL is $17.0M (VERIFIED, 2026-10-04).
- **Compute brokers and markets:**
  - SF Compute runs an order book for cluster time where tenants resell idle reserved capacity (VERIFIED, sfcompute.com and docs.sfcompute.com).
  - Compute Desk publishes indices for H100, H200, B200 and B300 and, with Architect, launched "ComputeConnect", an exchange-for-physical network linking compute futures on Architect's "American Innovation Exchange" DCM (pending regulatory review) to GPU delivery (VERIFIED, PR Newswire, July 8 2026).
  - Ornn's affiliate Ornn Compute reserves capacity "priced against this same settled index" and runs a resale secondary market (VERIFIED, data.ornn.com/markets/h100-sxm).
- **Named participants in exchange compute futures:**
  - ICE/Ornn (May 19 2026): the release quotes ICE (Trabue Bland), Ornn (Kush Bavaria) and **Hyperbolic Labs** (Jasper Zhang, a GPU cloud): "The GPU market today increasingly resembles a global commodity market" (VERIFIED, https://ir.theice.com/press/news-details/2026/ICE-and-Ornn-to-Launch-GPU-Compute-Futures-Contracts/default.aspx).
  - CME/Silicon Data (Aug 11 2026): names only DRW, as Silicon Data's backer (VERIFIED, PR Newswire).
  - Architect/Ornn (Jan 21 2026): customer categories only ("hedge funds, market makers, family offices, asset managers, insurance/reinsurance companies, and lenders") (VERIFIED, PR Newswire).
  - **No named neocloud or market maker is publicly reported as quoting CME, ICE or AX compute futures** (VERIFIED absence in the four releases above; not proof that none exist).
  - Nebius raising its H100 on-demand price on Oct 1 2026: search snippet only (UNVERIFIED).

## D. Competitors and adjacent projects

(pending)

## Implications for Hourly (INFERENCE, not verified fact)

(pending)
