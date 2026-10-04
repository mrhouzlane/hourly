# Hourly

Options on the rental price of AI chips, settled on Solana by oracle.

An hour of an Nvidia H100 rented for $2.64 on October 3, 2026, according to Ornn's Compute Price Index of transacted rental prices. Over the previous three months the same index moved H200 from $4.02 to $6.05 and B200 from $5.14 to $7.81. GPU owners lose when that price falls. AI companies that rent compute lose when it rises. CME scheduled its first rental-index futures on H100 and B200 for October 5, 2026, monthly and cash settled, pending regulatory review. None of the announced venues (CME, ICE with Ornn, Architect) offers options on the price, and our search found no on-chain market for it.

Hourly is that market:

- **Predict.** Yes or no on a single day's print, such as "Will the H100 print above $2.70 on Fri Oct 9?" A winning contract pays $1.
- **Hedge.** Floors and caps on a month's average, sized like the exchange futures: one contract covers one GPU for every hour of the month. A GPU owner can buy a floor, a renter can buy a cap, and a collar does both in one transaction.

Every contract is fully backed by USDC in escrow at the moment it trades. When a market closes, Switchboard oracles average the index prints in its window and sign the result, and the program checks those signatures before paying out.

## How it works

```
 Ornn OCPI (daily print, 4pm New York)
        |
        v
 Switchboard On-Demand feed, one per settlement window
   httpTask: Ornn index history
   jsonParseTask: the window's prints, MEAN
        |  signed quote (Ed25519)
        v
 hourly program on Solana
   settle_oracle: verifies oracle signatures against the pinned
   Switchboard queue and the feed hash stored at listing
        |
        v
 escrow vault pays longs, returns the rest to writers
```

### The program (`program/programs/hourly`)

| Instruction | Who signs | What it does |
|---|---|---|
| `init_config` | admin | Sets the quote mint, the backup settler key and the Switchboard queue. |
| `create_series` | admin | Lists a series: underlying, kind, strike, width, hours per contract, window, expiry, feed hash. Creates its long-token mint and USDC vault. |
| `fill` | buyer and seller | One RFQ trade. The seller's collateral moves to the vault, the buyer's premium moves to the seller, and the buyer receives long tokens, all in one instruction. |
| `close` | writer | Before settlement, burns long tokens against the writer's own short position and returns collateral. |
| `settle_oracle` | anyone | Settles from a Switchboard quote whose feed hash matches the series. |
| `settle` | backup settler | Allowed only 72 hours after expiry, if no oracle settlement happened. |
| `redeem` | long holder | Burns long tokens for the settled payoff. |
| `reclaim` | writer | Takes back collateral minus what the longs are owed. |

Payoffs are bounded, so every contract is fully collateralized:

- call: `min(max(S - K, 0), width) x hours`
- put: `min(max(K - S, 0), width) x hours`
- digital: `width if S > K, else 0`

`S` is the mean of the window's daily prints. Prices are in USDC atoms per GPU-hour.

### The venue (`app/`)

- `engine/ornn.js` fetches the index and builds the oracle feed for a window. The feed definition is deterministic, so anyone can rebuild it and get the same hash.
- `engine/model.js` prices contracts with a two-factor model fitted on the index itself: fast day-to-day noise that mean-reverts, and a slow level that drifts. It simulates the window average, including prints already observed. A live backtest reports how often real prints land inside the model's 80% band.
- `engine/market.js` turns a request into an RFQ fill that the venue's maker co-signs. Multi-leg quotes such as collars settle atomically. The exact message bytes are pinned, so a wallet cannot alter what the venue signed.
- `engine/keeper.js` lists new markets every day, settles expired ones through Switchboard with retries, and uses the backup settler only after 72 hours.
- `public/` and `src/client.js` are the web app. It connects any Wallet Standard wallet (Phantom, Solflare, Backpack) or a burner key. The venue pays every fee and rent, so users need no SOL.

`fill` needs no venue key. `app/scripts/maker-example.js` shows an independent market maker selling contracts to a trader directly through the program.

## Run it

Requirements: Rust with the Solana toolchain (solana-cli 3.1, anchor-cli 1.1), Node 20.

```bash
# program: build and run the LiteSVM tests
cd program && anchor build && cargo test -p hourly

# venue against a local validator
solana-test-validator --rpc-port 18899 &
solana program deploy program/target/deploy/hourly.so --program-id keys/program.json --keypair keys/admin.json --url http://127.0.0.1:18899
cd app && npm install && npm run build
CLUSTER=localnet RPC_URL=http://127.0.0.1:18899 node scripts/bootstrap.js
CLUSTER=localnet RPC_URL=http://127.0.0.1:18899 PORT=7990 node server.js

# end-to-end check: faucet, buy, write, replay and tamper rejection
BASE=http://127.0.0.1:7990 node scripts/e2e.js
```

On devnet, set `CLUSTER=devnet` and `RPC_URL=https://api.devnet.solana.com`.

## What has been checked

| Check | Result |
|---|---|
| Program tests (LiteSVM) | 7 pass: full lifecycle for each payoff, close, and every rejection asserted by its exact error code |
| End-to-end on a local chain | faucet, buy with wallet-style signing, write with burner-style signing, replay rejected, tampered transaction rejected, balances exact to the cent |
| Atomic collar | two fills in one 1,080-byte transaction, balances exact |
| Oracle feed | Switchboard computes the September 2026 H100 mean as 2.829333, equal to the mean of Ornn's 30 prints |
| Oracle quote | a Switchboard devnet oracle signed a quote for a custom Ornn feed; it carries the stored feed hash and the value 2.715, equal to the local mean |
| Model | at 3, 7 and 14 days, 79 to 81% of real prints land inside the 80% band; 7-day at-the-money Brier score 0.224 against 0.250 for a coin |

Not yet checked: a full `settle_oracle` transaction on devnet, which needs the devnet deployment.

## Known limits

- The backup settler is a trusted key. It can act only if the oracle is silent for 72 hours after expiry.
- Settlement reads a single data source, Ornn's public index-history endpoint, which is not a documented API. Ornn's licence for using the index as a settlement reference has not been confirmed.
- Devnet settlement asks for one oracle signature. Production should require several.
- Listing is admin-only. Trading is permissionless.
- The model has 92 days of history to learn from. Its calibration is measured live and shown in the app.
- Nothing here has been audited. Devnet and test USDC only.

## Sources

- Hackathon dates and judging: [colosseum.com/hackathon](https://www.colosseum.com/hackathon), [colosseum.com/worldsfair](https://colosseum.com/worldsfair)
- CME and Silicon Data H100 and B200 rental-index futures, October 5, 2026: [PR Newswire](https://www.prnewswire.com/news-releases/cme-group-and-silicon-data-to-launch-compute-futures-on-october-5-to-unlock-new-way-to-hedge-ai-risks-302848593.html)
- ICE and Ornn OCPI futures, no listing date: [ICE Futures U.S. notice, September 29, 2026](https://www.ice.com/publicdocs/futures_us/exchange_notices/ICE_Futures_US_Exchange_Notice_ORNN_Compute_4Q2026_20260929.pdf)
- Ornn Compute Price Index: [data.ornn.com](https://data.ornn.com/)
- Switchboard On-Demand: [docs.switchboard.xyz](https://docs.switchboard.xyz/)
