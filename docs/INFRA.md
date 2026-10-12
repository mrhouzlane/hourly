# Hourly infrastructure: liquidity, trading, incentives

Written 2026-10-10. Status of each part is marked **live** (in the code and running on the local validator), **proposed** (designed here, not built) or **UNVERIFIED** (a number from a pasted page, not checked live).

Reference points: Derive's market maker program and broker levels, schema's write-up of Papertrade. Every Derive and Papertrade figure below is UNVERIFIED: it comes from pages pasted into the session on 2026-10-10, not from a live read.

## 1. What Hourly is, and why "compute first"

Hourly is a venue where one hour of an AI chip has a tradable price. The underlying is Ornn's daily rental index for H100 SXM, H200, B200 and A100. Contracts are floors (puts), caps (calls) and yes/no markets on the mean of the daily prints over a window. Every contract is fully collateralised in escrow on a Solana program; there is no margin, no funding and no liquidation. Settlement is a Switchboard oracle that averages Ornn's prints, with a 72 hour admin fallback.

"Compute first" means the risk exists before the venue does. GPU owners are long the rental price with every idle hour. AI labs and inference shops are short it with every contract they sign. Lenders who take GPUs as collateral are long it twice. None of them has a floor or a cap today; CME lists institutional futures and Kalshi and Polymarket list yes/no bets. Hourly starts from those three users and builds the trading surface around their hedge, not around a perp.

Why trade here rather than elsewhere:

- The hedger gets a floor or a cap that cannot be liquidated on the way to settlement.
- The underwriter gets paid premium against a risk that is uncorrelated with crypto beta.
- The speculator gets the only clean short on "GPU rent goes down" that is not an NVDA position.

## 2. How liquidity attaches (three rails)

### Rail 1: the weekly underwriting vault (live)

`LpVault` on chain, one per 7 day epoch. Deposits open for a week, then the vault trades for a week, then settles and becomes withdrawable. Caps: at most 20% of deposits at risk in any one market, at most 50% across the epoch (`engine/keeper.js`, `VAULT_CAP_BPS`, `VAULT_EPOCH_BPS`). The venue seeds each vault so it trades from day one; on the local validator epoch 2 holds $25,900 of test USDC of which $25,000 is the seed. Every RFQ leg is routed to the vault first if it has room, otherwise to the venue desk (`engine/market.js`, `quote`).

### Rail 2: the venue desk (live)

One maker key co-signs fills the vault cannot take. Risk limits on the hedge door: 50 contracts per trade, 2,000 net short and 2,000 net long per market. Prices come from the model (two-factor, 20,000 paths, volatility scaled 1.5) with a maker spread of half = 0.5% of max payoff plus 8% of fair (`engine/model.js`, `makerQuote`). Quotes live 45 seconds. No quotes from 19:55 UTC until the day's Ornn print lands.

### Rail 3: outside quoters and natural writers (proposed)

Two sources Derive uses and Hourly does not yet.

**Quoter program.** Outside makers register a key and receive every RFQ. A maker's response counts if it arrives within 2 seconds and is inside the vault's own spread. Score per RFQ = 1 point for responding in time + 1 point per 10 bps of price improvement against the model mid, counted only on filled or inside-spread responses. Scores never count raw volume, so a maker cannot climb by trading with itself. Each epoch a budget from treasury fee income is paid pro rata by score. There is no token; the budget is USDC. Derive pays its makers in DRV by volume and RFQ scores reward response speed and price improvement (UNVERIFIED).

**Natural writers.** Any wallet can already write a contract: post full collateral, receive the bid. The proposed step is to make this the default for GPU operators: a fleet operator writes caps against revenue it already earns, a covered call on compute. Today collateral is USDC; a later version can accept a claim on contracted rental revenue once a lender such as USD.AI or GAIB underwrites that claim.

## 3. How people trade (the RFQ flow)

Live: connect a Wallet Standard wallet, pick a chip, pick floor or cap, pick the month, press one button. The server prepares a transaction with the venue's maker signature already on it; the user signs; the program moves premium and collateral atomically. Two legs can fill in one transaction (a collar). Minimum trade is $0.50 of premium, maximum 50 contracts on the hedge door.

Proposed: **broker levels** for the distribution partners who own the users. A GPU marketplace or reseller embeds "protect this rental" with a referral code in the URL. The broker earns a share of protocol fees on referred premium, in five levels by 28 day referred premium. Derive's levels run 10% to 50% by 28 day volume or stDRV held (UNVERIFIED). Proposed thresholds, to be set at launch: $10k, $100k, $1M, $10M of referred premium per 28 days for 10%, 20%, 30%, 40%, 50%. A builder fee on top lets a partner add its own margin per fill. Nothing here is on chain before 2026-10-13.

## 4. The new incentive: the insured own the insurer (proposed)

Papertrade mints its token to the player who loses (UNVERIFIED: 100 PAPER per $1 lost, declining as the house grows). The hedging equivalent of a loser is the operator whose floor expired worthless: they paid for insurance they did not need. Hourly turns that premium into ownership of the pool that collected it.

**Rule.** At the end of each epoch, for every wallet, sum the premium paid on contracts that settled with zero payoff: call it X_w, and the total across all wallets X_e. The vault's realised spread for the epoch is P_e = premium collected minus payouts made. Half of P_e, when positive, is the mutual budget B_e. Each wallet is minted shares of the next epoch's vault worth B_e × X_w / X_e. The rate per expired dollar is further scaled by (D0 / (D0 + D_e))², where D_e is the vault's deposits and D0 = $1,000,000, so the rate declines as the vault grows, the same shape as Papertrade's curve.

**Why it cannot be farmed.** A wallet that buys both the floor and the cap (a strangle) and lets both expire has paid 2 × (fair + half) and contributed that whole amount to X_e and to P_e. Because B_e is at most half of P_e and P_e is at most X_e, the rate is at most 0.5: the farmer recovers at most half of the house edge on its own trade and never the trade itself. Papertrade's hedged farming (UNVERIFIED: about 8x cheaper than the degen route) exists because its mint rate is fixed per dollar lost; Hourly's is bounded by realised profit each epoch, so the vault can never pay out more mutual shares than it earned.

**Fee flip.** Papertrade charges no notional fee and takes a haircut on wins (UNVERIFIED: 12% to 28% depending on move size). For a hedge product that haircut is far too large, but the shape is right. Proposed: cut the 1% premium fee to 0 and take 2% of in-the-money payouts at redeem. Expected treasury income is about the same (premium is fair plus spread, payout expectation is fair), the hedger's entry cost falls, and the winner pays while the loser is minted equity. This is a program change (`fee_for` moves from `fill` to `redeem`) and is not scheduled before 2026-10-13.

**What a user sees.** A card under Activity, "Your stake": expired premium this epoch, the rate this epoch, shares that would be minted, and the share of next week's vault that gives. On the test chain the card is computed from this wallet's fills and the live vault deposits, and it is labelled as a proposal.

## 5. Risks, stated plainly

- **Strangle farming.** Bounded at half the house edge per the rule above; still worth monitoring per wallet.
- **Index manipulation.** Ornn's print is a third party daily index; contracts settle on the window mean, which raises the cost of moving one day. Papertrade's equivalent is Hyperliquid mid manipulation (UNVERIFIED).
- **Single relayer.** The venue maker key co-signs every fill, as Papertrade's relayer does. If it is down, nothing trades; funds in escrow are unaffected. Rail 3 reduces this once outside quoters sign their own fills.
- **Print front-running.** The 19:55 UTC cutoff exists; it assumes Ornn does not leak early.
- **Licence.** Ornn's terms require a settlement licence before real money. Request drafted in docs/OUTREACH.md, not yet sent, so not granted.
- **Audit.** None. Internal review in `docs/SECURITY_REVIEW.md`.
