// Load test against a running server on a test chain: N users trade concurrently.
// Funds users directly with the test mint (faucet is rate limited), then each user
// quotes, signs and submits K trades. Reports latency, failures and chain consistency.
"use strict";
process.env.CLUSTER = process.env.CLUSTER || "localnet";
process.env.RPC_URL = process.env.RPC_URL || "http://127.0.0.1:18899";
process.env.KEEPER = "off";
const { Keypair, Transaction, PublicKey } = require("@solana/web3.js");
const venue = require("../engine/venue");
const BASE = process.env.BASE || "http://127.0.0.1:7990";
const N = Number(process.env.USERS || 25), K = Number(process.env.TRADES || 4);
const api = async (p, body, ip) => {
  const r = await fetch(`${BASE}/api/${p}`, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`${p} ${r.status} ${j.error}`); return j;
};
(async () => {
  const markets = (await api("markets", null, "10.0.0.1")).filter((m) => m.status === "open" && m.model);
  const users = Array.from({ length: N }, () => Keypair.generate());
  for (const u of users) await venue.mintQuote(u.publicKey, 5_000);
  const lat = [], errs = {};
  let ok = 0;
  const t0 = Date.now();
  await Promise.all(users.map(async (u, i) => {
    const ip = `10.1.${Math.floor(i / 250)}.${i % 250}`;
    for (let k = 0; k < K; k++) {
      const m = markets[(i + k) % markets.length];
      const side = m.door === "hedge" ? "buy" : (k % 2 ? "sell" : "buy");
      const s = Date.now();
      try {
        const q = await api("quote", { owner: u.publicKey.toBase58(), legs: [{ series: m.id, side, qty: m.door === "hedge" ? 1 : Math.max(3, Math.ceil(0.6 / Math.max(0.01, side === "buy" ? m.model.ask : m.model.bid))) }] }, ip);
        const tx = Transaction.from(Buffer.from(q.tx, "base64")); tx.partialSign(u);
        await api("submit", { id: q.id, tx: tx.serialize().toString("base64") }, ip);
        ok++; lat.push(Date.now() - s);
      } catch (e) { const key = e.message.slice(0, 70); errs[key] = (errs[key] || 0) + 1; }
    }
  }));
  lat.sort((a, b) => a - b);
  const p = (x) => lat[Math.min(lat.length - 1, Math.floor(x * lat.length))];
  console.log(`trades ok ${ok}/${N * K} in ${((Date.now() - t0) / 1000).toFixed(1)} s; latency p50 ${p(0.5)} ms p95 ${p(0.95)} ms max ${lat[lat.length - 1]} ms`);
  console.log("errors", errs);
  // consistency: escrow balance = OI x collateral for every series
  let bad = 0;
  for (const s of await venue.readAllSeries()) {
    const bal = BigInt((await venue.conn.getTokenAccountBalance(s.vault)).value.amount);
    if (bal !== s.openInterest * s.cap * s.units) { bad++; console.log("MISMATCH", s.pubkey.toBase58()); }
  }
  console.log(`escrow consistency: ${bad ? bad + " mismatches" : "all series match OI x collateral"}`);
  process.exit(0);
})().catch((e) => { console.error("LOAD FAILED", e); process.exit(1); });
