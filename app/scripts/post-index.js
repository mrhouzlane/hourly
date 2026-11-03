// Post Hourly Index daily prints to Solana devnet as Memo transactions, signed by the publisher key.
// Idempotent: skips (chip, day) already in state/index-posts.json. Usage: node scripts/post-index.js [days=30]
"use strict";
const fs = require("fs");
const path = require("path");
const { Connection, Keypair, Transaction, TransactionInstruction, PublicKey, sendAndConfirmTransaction } = require("@solana/web3.js");
const RPC = process.env.RPC_URL || "https://api.devnet.solana.com";
const KEYS = process.env.KEYS_DIR || "/home/mehdi_quantum3labs_com/compute-options/keys";
const STATE = path.join(__dirname, "..", "state");
const MEMO = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const DAYS = Number(process.argv[2] || 30);
const rpcFetch = async (url, opts) => { let r; for (let i = 0; i < 7; i++) { r = await fetch(url, opts); if (r.status !== 429) return r; await new Promise((s) => setTimeout(s, Math.min(8000, 400 * 2 ** i))); } return r; };
const conn = new Connection(RPC, { commitment: "confirmed", fetch: rpcFetch, disableRetryOnRateLimit: true });
const pub = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path.join(KEYS, "publisher.json"), "utf8"))));
(async () => {
  const data = JSON.parse(fs.readFileSync(path.join(STATE, "index-prints.json"), "utf8"));
  const postsFile = path.join(STATE, "index-posts.json");
  const posts = fs.existsSync(postsFile) ? JSON.parse(fs.readFileSync(postsFile, "utf8")) : { publisher: pub.publicKey.toBase58(), chips: {} };
  let n = 0;
  for (const [gpu, days] of Object.entries(data.chips)) {
    posts.chips[gpu] = posts.chips[gpu] || {};
    for (const d of days.filter((x) => x.value !== null).slice(-DAYS)) {
      if (posts.chips[gpu][d.day]) continue;
      const memo = JSON.stringify({ index: "hourly", method: data.method.version, gpu, day: d.day, usd_hr: d.value, sources: d.n_providers, inputs_sha256: d.inputs_sha256 });
      const tx = new Transaction().add(new TransactionInstruction({ programId: MEMO, keys: [{ pubkey: pub.publicKey, isSigner: true, isWritable: false }], data: Buffer.from(memo, "utf8") }));
      const sig = await sendAndConfirmTransaction(conn, tx, [pub], { commitment: "confirmed" });
      const st = (await conn.getSignatureStatus(sig)).value;
      posts.chips[gpu][d.day] = { sig, slot: st && st.slot, postedAt: new Date().toISOString(), value: d.value, inputs_sha256: d.inputs_sha256 };
      fs.writeFileSync(postsFile, JSON.stringify(posts, null, 1));
      n++; console.log(gpu, d.day, d.value, "slot", st && st.slot, sig.slice(0, 12));
    }
  }
  console.log("posted", n, "publisher", pub.publicKey.toBase58());
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
