# design-v3 progress (checkpoint)
Branch design-v3 from 58797fa. Refs: ~/hourlyv1..v10.png (v1 home full, v2 hero, v3 ticket, v4 one tap, v5 lock month, v6 index, v7 house, v8 docs, v9 access form, v10 mobile home).
Decisions (Mehdi 2026-11-03): match screenshots (white on blue), new POST /api/access stored on VM, cut Spencer quote + SEBI line + "price per $1 payout", orb cropped from v2.
Worktree ~/hourly-v3 (design-v3), preview server :7994 devnet KEEPER=off. Live tree stays on devnet-e2e.
- [ ] tokens/css  - [ ] menu/ribbon/footer  - [ ] home + access form  - [ ] trade 3 modes  - [ ] index  - [ ] house  - [ ] docs  - [ ] /quick redirect  - [ ] compare shots  - [ ] e2e
2026-11-03 restart per Mehdi: screenshots ONLY. New entry src/v3.js + public/v3.css; index.html loads only those. mac.js untouched (rollback). Server: POST /api/access (state/access-requests.jsonl), /quick 302 -> ./?mode=tap. shoot.js + sbs.py -> design/compare/<page>.png.
- [x] home pass 1 (bg fixed-attachment bug fixed)  - [ ] desk/tap/lock  - [ ] index  - [ ] house  - [ ] docs  - [ ] access  - [ ] mobile  - [ ] e2e  - [ ] commit
2026-11-03 09:10 Mehdi: new source = design/hourly-clean/ (NOT on VM; only shots h11,h12,h222,h423,h444,h5555,h666,h66666 arrived -> design/clean-shots/). Rebuilding from these shots in src/v3.js + public/v3.css. Floor=lower, Cap=higher on daily ticket. Then 1440+390 shots vs clean-shots, burner trade on devnet via 7994, explorer link. Don't touch 7992 or /hourly.
