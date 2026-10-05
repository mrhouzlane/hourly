# Hourly handoff (written 2026-10-05)

## Goal
Hourly: options and yes/no markets on the rental price of AI chips (Ornn OCPI index: H100 SXM, H200, B200, A100), Solana program with Switchboard oracle settlement, weekly LP vaults, EVM port. Colosseum Crypto World's Fair entry, due 2026-10-12. Mehdi wants a real, wallet-connected, trader-friendly app (Mac System 7 look, Hypercall-style wizard + social feed), mainnet-ready, stress tested. Standalone, not Stormbit.

## Live now
- UI: http://34.177.105.21/hourly/ (port 7990, Caddy route, cron `app/run.sh` every 5 min). Runs on a PRIVATE local validator (port 18899, ledger `preview-ledger/`), burner wallet only. Phantom/MetaMask need a public cluster.
- Repo: github.com/mrhouzlane/hourly (PRIVATE, master). Last commit cd33354.
- Old UI kept at `/hourly/classic.html`.

## Done
- Solana program `program/programs/hourly/src/lib.rs` (id givjbTiAfcwKbKhr5kztwgkkNGZj3E8eEceKnvio8Bf): fully collateralized call/put spreads + digitals, RFQ fill, 1% fee, pause, set_admin/lister/min_oracle_sigs, Switchboard `settle_oracle` (2h grace), 72h backup settler, weekly LP vaults (price bounds 1%..95% of max payoff, per-series 20% + epoch 50% caps). Tests: `cargo test -p hourly` (lifecycle, vault, pause, set_admin, security, 300-seed fuzz; `FUZZ_SEEDS=n`).
- Security review `docs/SECURITY_REVIEW.md`: H1,H2,M1-M5,L2-L7 fixed (L1,L3 open by design). Mainnet build: `HOURLY_INIT_AUTHORITY=<deployer> cargo build-sbf --manifest-path programs/hourly/Cargo.toml`; devnet/preview need `--features devnet` / `preview,devnet`.
- Venue app `app/`: engine/{ornn,model,catalog,market,keeper,venue,chain,feed}.js, server.js, scripts/{bootstrap,e2e,load,wallet-e2e,maker-example}.js. Key roles: admin, lister, payer, maker, settler in `keys/` (gitignored, devnet-only).
- UI `app/src/mac.js` + `public/mac.css` (build: `cd app && npm run build`): 5-step wizard (side, level, date, amount, review) with live chart, keyboard control, zoom-rect motion; Hedge builder; Earn (vaults); Activity feed (`/api/activity`, pseudonymous, P&L from real fills); Portfolio. Chicago font public domain.
- EVM port `evm/` (51 forge tests; `PATH=$HOME/.foundry/bin:$PATH forge test`). No EVM oracle works today: Switchboard oracle registrations expired (only their admin can refresh), Chainlink Functions shut down. Backup settler is the only EVM path.
- Tests last run: wallet-e2e 7/7 PASS on Mac UI, API e2e match, load 200/200, escrow consistent.
- Research: `research/market-structure.md`, `research/investors-and-colosseum.md`. Video: `~/scratchpad/hourly-video/out.mp4` (rejected as "no tension, no story": redo after app final). Docs: `docs/{MAINNET,OUTREACH,SUBMISSION,SECURITY_REVIEW}.md`.

## Blocked on Mehdi
1. Devnet SOL: 10 devnet SOL to admin `G9A1tg5zgxMZg4EsoeBt8Yi5hEfwXsAEiu8zEqcAMxMT` (faucets rate-limit the VM; devnet-pow needs libssl-dev, no sudo). Then: deploy `program/target/deploy/hourly.so` (default build is MAINNET-safe: for devnet build with `--features devnet`), `CLUSTER=devnet node app/scripts/bootstrap.js`, set `app/.env` CLUSTER=devnet, restart.
2. Send Ornn licence email (data@ornn.com) and Switchboard Discord note: drafts in `docs/OUTREACH.md`. Ornn Terms bar settlement use without a signed agreement: BLOCKS real-money mainnet.
3. Mainnet needs: entity + US geo-block, Squads multisig, funds, paid RPC, external audit.
4. Submission details (team, location, logo) for `docs/SUBMISSION.md`; decide repo public vs private before submitting.

## Next steps
- Screenshot-verify the Mac UI review step (step 5) and portfolio; mobile checked for steps 1-4.
- After devnet: verify Phantom/MetaMask/Solflare connect on the public site; record pitch + demo videos; redo launch video with tension/story.
- Prediction strikes now 5 per date per GPU; keeper lists them every 2 min.

## Gotchas
- Preview program built with `--features preview,devnet` (settles at expiry, no oracle). Do not deploy that build to a public cluster.
- Never `pkill`; kill by port PID (`ss -ltnp | grep :7990`). Caddy conf edits: backup, `docker exec heatedge-caddy caddy validate`, `docker restart heatedge-caddy`.
- crossbar.switchboard.xyz has no DNS: use crossbar.switchboardlabs.xyz. Ornn endpoint: api.ornnai.com (documented).
- Ports: 7990 ours; 7988 fintask, 7993 owed are NOT ours.
- State: `app/state/localnet.json` (preview). Tests use `STATE_FILE` override and a copy at /tmp.
- Style rules from Mehdi: no em/en dashes, taste = subtraction, verify UI by screenshot, caveman terse replies.
