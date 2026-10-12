# Colosseum Crypto World's Fair submission (draft)

Due Mon 2026-10-13 14:59 SGT. Brackets = facts only Mehdi has. Every claim below must be re-checked against a live run before submitting (Tests re-run 2026-10-11, see Proof. Still UNVERIFIED: the Switchboard devnet and mainnet queue claim, the browser wallet test, the load test).

**Project name:** Hourly

**One line:** Options on the rental price of AI chips, settled on Solana by oracle.

**Description.** Renting an Nvidia H100 cost $2.64 an hour on Ornn's October 3 print, and H200 rose 32% in three months ($4.47 on Jul 11 to $5.91 on Oct 10, Ornn public history). GPU clouds lose when rental prices fall and AI companies lose when they rise. Today the live ways to bet on it are yes/no markets on Kalshi and Polymarket and perps on Bitget and Hyperliquid; CME and ICE futures are still awaiting CFTC review. I found no one offering a loss-capped option, a floor, cap or collar, on compute, or lets anyone underwrite them. Hourly does: GPU owners floor their revenue, renters cap their cost, traders call the daily print, and anyone can deposit USDC into a weekly vault that sells this protection and earns the premium. Every contract is fully backed in escrow and settled by a Switchboard oracle that averages Ornn's index; the Solana program checks the oracle signatures and the feed fixed at listing.

**Blockchain integrations.**
- Solana program (Anchor 1.1): fully collateralized options, RFQ fills co-signed by maker and taker, weekly underwriting vaults with per-market caps, 1% protocol fee, pause switch.
- Switchboard On-Demand: custom feed that averages Ornn's daily prints; feed built; queue verification [re-check before submitting].
- Wallet Standard: Phantom, Solflare, Backpack, MetaMask (via MetaMask Connect Solana).
- EVM port (Solidity, EIP-712 quotes) with Switchboard and Chainlink Functions adapters; settlement pending live oracle support on EVM.

**Proof it works.** Run 2026-10-11 on the local validator: 14 Solana program tests pass (lifecycle, security, math), including a 300-seed fuzz where escrow stays solvent and no USDC is created or lost. 51 EVM tests pass, 0 fail (9 skipped). An API end-to-end run passes faucet, quote, buy, write, replay rejection, tamper rejection and a balance match. Not re-run today, so not claimed: the load test and the browser wallet test.

**Links.**
- App: http://34.177.105.21/hourly/ [move to devnet once SOL arrives; add domain if any]
- Repo: https://github.com/mrhouzlane/hourly [private: make public or add judges before submitting]
- Pitch video (2 to 3 min): [to record]
- Demo video (3 min max): [to record from the devnet app]

**Go-to-market.** Start with the people who lose money when GPU prices move: GPU-backed lenders (USD.AI, GAIB) need floors on their collateral; GPU clouds need floors on revenue; AI startups need caps on compute bills. Vault depositors fund the other side. Daily prediction questions bring traders and price discovery. Revenue: 1% of premium.

**Team.** [Mehdi Rhouzlane: background] [location] [others]

**Known limits, stated plainly.** Test money only. Ornn's data terms for on-chain settlement use are unconfirmed, and no licence request has been sent yet; real money waits on that answer. Not audited; internal review in docs/SECURITY_REVIEW.md. Backup settler key can act only if the oracle is silent for 72 hours.
