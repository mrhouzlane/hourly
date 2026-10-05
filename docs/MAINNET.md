# Mainnet launch runbook

Status: everything below marked BUILT is in the repo and tested. Items marked OPERATOR need a human decision, money or a signature.

## Before any real deposit (OPERATOR)

1. **Ornn licence.** Ornn's public Terms bar using its data for settlement or derivatives without a signed agreement. Get it signed first.
2. **Legal entity and geography.** Decide the launching entity and block restricted jurisdictions (at least the US) at the front end and in the terms of use.
3. **Independent review.** The program holds user funds. Get at least one external review before raising caps.
4. **Keys.** Create fresh mainnet keys; never reuse the devnet keys in `keys/`.
   - Upgrade authority and config admin: a Squads multisig or hardware wallet.
   - Settler (backup only, 72 h after expiry): separate key.
   - Maker/quoter: hot key on the server, funded only with what the desk may lose.
5. **Funding.** About 5 SOL for program rent and fees (program is 575 KB, deploy peak about 8 SOL while the buffer exists). Real USDC for the desk and any vault seed.
6. **RPC.** A paid Solana RPC (the public endpoint rate-limits; the load test shows 5 to 6 reads per quote).

## Build and deploy (BUILT)

```bash
cd program
HOURLY_INIT_AUTHORITY=<deployer pubkey> cargo build-sbf --manifest-path programs/hourly/Cargo.toml --sbf-out-dir target/mainnet
# default features = mainnet; only <deployer> can call init_config
solana program deploy target/mainnet/hourly.so --program-id <mainnet-program-keypair> \
  --keypair <deployer> --url <paid-rpc>
# then move upgrade authority to the multisig
solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <MULTISIG>
```

The mainnet build pins the oracle queue owner to Switchboard's mainnet program
`SBondMDrcV3K4kxZR1HNVT7osZxAHVHgYXL5Ze1oMUv`; the venue uses the default mainnet queue
`A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w`. A mainnet oracle signed a quote for the
Ornn feed on 2026-10-04 (value 2.715, feed hash matched).

Note: the program id is set by `declare_id!` in `lib.rs`. A new mainnet program id needs
`declare_id!` and `Anchor.toml` updated and a rebuild.

```bash
cd app
CLUSTER=mainnet RPC_URL=<paid-rpc> KEYS_DIR=<mainnet-keys> VENUE_SEED_USD=0 MIN_ORACLE_SIGS=<n> node scripts/bootstrap.js
# KEYS_DIR holds admin (init only, then hand config admin to the multisig), lister, payer, maker, settler
# .env: CLUSTER=mainnet, RPC_URL=<paid-rpc>, KEYS_DIR=<mainnet-keys>, PORT=...
```

On mainnet the venue uses real USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), never mints, has no faucet, hides the burner wallet, and seeds vaults only if `VENUE_SEED_USD` is set.

## Day-one limits (BUILT, tune in code)

- Per trade: 500 prediction contracts, 50 hedge contracts (`LIMITS` in `engine/market.js`).
- Desk short limit per market: 20,000 prediction, 2,000 hedge contracts.
- Vault: at most 20% of deposits at risk in one market (`VAULT_CAP_BPS`).
- Fee: 1% of premium, program cap 5%.
- Emergency: `set_paused(true)` stops new fills and deposits; settlement, redemption and withdrawals keep working.

## Stress evidence (BUILT)

- Program: 10 deterministic tests plus a 300-seed fuzz of random trading, closing, settlement and payout checking escrow = open interest x collateral at every step and zero USDC created or lost.
- Venue: 500 concurrent trades from 100 users on a test chain, 0 failures, escrow consistent on every series.
- Lifecycle through the venue code: list, trade, settle, redeem, reclaim; vault deposit, routed trades, collect, pro-rata withdraw; all balances exact.

## Go-live check

1. `GET /api/status` shows cluster mainnet, the mainnet program id and the treasury.
2. A $1 trade from an operator wallet in Phantom and in MetaMask, both sides.
3. Pause and unpause once from the multisig.
4. Watch the first oracle settlement land, then raise limits.
