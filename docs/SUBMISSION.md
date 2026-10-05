# Colosseum Crypto World's Fair submission (draft)

Due 2026-10-12. Brackets = facts only Mehdi has.

**Project name:** Hourly

**One line:** Options on the rental price of AI chips, settled on Solana by oracle.

**Description.** Renting an Nvidia H100 cost $2.64 an hour on Ornn's October 3 print, and H200 rose 50% in three months. GPU clouds lose when rental prices fall and AI companies lose when they rise. CME lists plain futures for institutions; Kalshi and Polymarket list yes/no bets. Nobody offers floors, caps or collars on compute, or lets anyone underwrite them. Hourly does: GPU owners floor their revenue, renters cap their cost, traders call the daily print, and anyone can deposit USDC into a weekly vault that sells this protection and earns the premium. Every contract is fully backed in escrow and settled by a Switchboard oracle that averages Ornn's index; the Solana program checks the oracle signatures and the feed fixed at listing.

**Blockchain integrations.**
- Solana program (Anchor 1.1): fully collateralized options, RFQ fills co-signed by maker and taker, weekly underwriting vaults with per-market caps, 1% protocol fee, pause switch.
- Switchboard On-Demand: custom feed that averages Ornn's daily prints; verified on Solana devnet and mainnet queues.
- Wallet Standard: Phantom, Solflare, Backpack, MetaMask (via MetaMask Connect Solana).
- EVM port (Solidity, EIP-712 quotes) with Switchboard and Chainlink Functions adapters; settlement pending live oracle support on EVM.

**Proof it works.** 11 Solana program tests plus a 300-seed fuzz (escrow equals open interest times collateral at every step; no USDC created or lost). 37 EVM tests. 500 concurrent trades from 100 users with zero failures. A real-browser wallet test passes connect, buy, write, collar, vault deposit and close.

**Links.**
- App: http://34.177.105.21/hourly/ [move to devnet once SOL arrives; add domain if any]
- Repo: https://github.com/mrhouzlane/hourly [private: make public or add judges before submitting]
- Pitch video (2 to 3 min): [to record]
- Demo video (3 min max): [to record from the devnet app]

**Go-to-market.** Start with the people who lose money when GPU prices move: GPU-backed lenders (USD.AI, GAIB) need floors on their collateral; GPU clouds need floors on revenue; AI startups need caps on compute bills. Vault depositors fund the other side. Daily prediction questions bring traders and price discovery. Revenue: 1% of premium.

**Team.** [Mehdi Rhouzlane: background] [location] [others]

**Known limits, stated plainly.** Ornn's terms require a settlement licence before real money (request sent: [date]). Not audited; internal review in docs/SECURITY_REVIEW.md. Backup settler key can act only if the oracle is silent for 72 hours.
