# Outreach drafts (send from your own accounts)

## 1. Ornn: licence to settle on OCPI

To: data@ornn.com (also reachable at x.com/OrnnExchange)
Subject: Settling GPU options on OCPI: licence request

Hi Ornn team,

I'm building Hourly, an options venue on GPU rental prices on Solana. Contracts are floors, caps and yes/no questions on the OCPI daily print and monthly average, fully backed in USDC, settled by a Switchboard oracle reading your public index-history API.

Your terms require a signed agreement before OCPI is used as a settlement reference, so I'd like to set that up before any real-money launch. Today it runs on test networks only.

What would a settlement licence look like for you (pricing, attribution, any volume reporting you'd want back)? Happy to share the code and a demo.

Thanks,
Mehdi Rhouzlane

## 2. Switchboard: expired EVM oracle registrations

Where: Switchboard Discord, https://discord.gg/TJAv6ZYvPC (developer support channel)

Hi team, we settle custom Crossbar feeds on Solana fine (mainnet queue A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w). On EVM every update reverts "No valid signatures". From eth_call on the v2.0.0 contracts, the crossbar oracle keys' registrations are older than the 30-day window: Monad mainnet last refreshed 2026-05-28, Monad testnet 2026-08-07, HyperEVM 2025-12-10 (Arbitrum One legacy 2026-01-20). Could you refresh them? Also HyperEVM is missing signer 0x7983 and Monad testnet 0x2d38. Fork tests showing the same bytes settle once the key is fresh: happy to share.

## 3. Liquidity conversations (after devnet is public)

Targets from research/market-structure.md: USD.AI and GAIB (GPU-backed lenders who need price floors), Hyperbolic Labs (GPU cloud that backs ICE/Ornn futures), FalconX (quotes on-chain options). Ask: try the hedge on devnet, then talk about writing or buying size.
