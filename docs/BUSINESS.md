# Hourly: business plan to $200K ARR at launch

Status: draft 2026-10-11. Hourly only, not Stormbit. Every number is tagged.

## Angle

Hourly is the permissionless, small-ticket, on-chain way to hedge or bet on what an AI chip costs to rent per hour. Institutions are building the big-ticket version (ICE with Ornn, CME with Silicon Data). That leaves the long tail open: AI startups, agents, inference resellers and Solana traders who will never open a futures account. We win exposure by being the free "go-to chips dashboard" (H100, H200, B200, A100 rent, vol, curve) and earn revenue where the dashboard becomes a hedge.

## Load-bearing facts

| Fact | Status |
|---|---|
| ICE and Ornn announced GPU compute futures on 2026-05-19, subject to regulatory approval; H100 contract ticker HPR, monthly, cash-settled on hourly OCPI prices | live-verified this session (ice.com listing, ICE press) |
| CME and Silicon Data announced H100 and B200 rental index futures, launch planned 2026-10-05, subject to review | live-verified announcement; actual go-live UNVERIFIED |
| Architect AX (Bermuda) lists GPU and DRAM rental perps using Ornn data (announced Jan 2026) | live-verified once (secondary source), UNVERIFIED primary |
| Ornn raised $33M seed led by a16z | live-verified (secondary news) |
| Demand for hedging exists: H100 1-yr rental rose about 40% in 5 months (SemiAnalysis via a vendor blog) | UNVERIFIED, vendor blog |
| Solana Frontier hackathon had 2,857 submissions; Drift lost about $286M in April 2026 | live-verified once, single secondary source |
| Platform fee is 100 bps of premium (`feeBps` default in `engine/venue.js:41`) | from-file, UNVERIFIED on a live cluster |
| House edge +6c per $1 on open H100 tickets | test flow on localnet only, NOT demand |
| Real AI buyers will pay for rent hedges | ASSUMED, zero evidence yet |
| Legal status of cash-settled binary options on a commodity index for US and EU users | UNVERIFIED, needs counsel before mainnet marketing |

## Revenue math (arithmetic, not forecast)

- Fee only: $200K / 1% = $20M of premium per year, about $55K per day. Not reachable from retail alone in the first year.
- Realistic mix to reach a $200K run-rate:
  1. Agent and data API subscriptions: 15 teams at $500/mo = $90K.
  2. Hedge desk for AI teams (design partners paying a platform fee on premium plus a setup fee): 3 partners, $6M premium each at 1% = $180K per year gross; target $60K in the first year.
  3. House underwriting spread, shared with vault depositors: target $50K, only once edge is measured on real flow.
- Total target $200K run-rate. This is a target, not a prediction. The 15 and 3 are the numbers to falsify first.

## Wedge against the institutions

- They need accounts, clearing, size. We need a wallet and $1.
- They list monthly futures. We list daily and weekly digital tickets that fit an inference budget.
- Agent-native: `/api/agent/brief` and `/api/agent/prepare` already give an AI agent a read-only quote and a ready-to-sign deep link.

## Exposure plan

Solana traders
1. Colosseum submission 2026-10-13 14:59 SGT, with a 60-second demo (ship-video skill).
2. Devnet then mainnet with real Phantom flow, public leaderboard of settled tickets.
3. Weekly "rent move" post: one chart, one settled result, one link. No price claims we cannot settle.

AI users
1. Public chips dashboard as the free product; every chip page links a deep-link ticket.
2. MCP and agent API listing so coding agents and inference orchestrators can read rent and prepare a hedge.
3. Direct outreach to 30 inference resellers and GPU-heavy startups. Ask: try the dashboard, hedge $100 of next month's rent.

## 30-day gates (kill or continue)

- Week 1: devnet live, Phantom tested end to end. Needs about 10 devnet SOL (blocked on Mehdi).
- Week 2: 30 outreach DMs, 5 calls, 1 design partner willing to hedge real rent.
- Week 3: 100 real settled tickets from non-team wallets.
- Week 4: 1 paying API customer. If zero design partners and zero paying customers, Hourly stays a hackathon project and we stop spending.

## Risks

- Regulation of binary options on a commodity index (UNVERIFIED, needs counsel).
- Oracle: depends on Ornn OCPI access and Switchboard settlement; terms of Ornn data use UNVERIFIED.
- Liquidity: the House is the only counterparty; a one-sided book (56 higher, 0 lower today) is directional risk, not income.
- CME and ICE could ship retail-friendly products.

## Open decisions for Mehdi

1. First paying customer: AI team hedging rent, trader, or API subscriber. Recommendation: AI team, because Hourly's identity is compute.
2. Send 10 devnet SOL and the Privy App ID.
3. Counsel before any mainnet marketing.

Sources:
- https://www.ice.com/products/83050006/Ornn-Compute-Price-Index-OCPI-H100-Future
- https://finance.yahoo.com/markets/options/articles/ice-ornn-launch-gpu-compute-142609556.html
- https://letsdatascience.com/news/cme-and-silicon-data-launch-compute-futures-market-d1063e44
- https://www.financemagnates.com/institutional-forex/cme-group-says-it-will-launch-first-regulated-compute-futures-contracts/
- https://blog.colosseum.com/announcing-the-winners-of-the-solana-frontier-hackathon/
