// End-to-end check against a running server: faucet, buy (wallet-style signing),
// write (burner-style signature), portfolio. Usage: BASE=http://127.0.0.1:7989 node scripts/e2e.js
"use strict";
const { Keypair, Transaction } = require("@solana/web3.js");
const nacl = require("tweetnacl");
const BASE = process.env.BASE || "http://127.0.0.1:7989";
const api = async (p, body) => {
  const r = await fetch(`${BASE}/api/${p}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(`${p} ${r.status}: ${j.error}`);
  return j;
};
(async () => {
  const user = Keypair.generate();
  const owner = user.publicKey.toBase58();
  console.log("user", owner);
  const f = await api("faucet", { owner });
  console.log("faucet", f.amount, f.signature.slice(0, 16));
  const markets = await api("markets");
  const dig = markets.filter((m) => m.door === "predict" && m.status === "open" && m.model).sort((a, b) => Math.abs(a.model.ask - 0.5) - Math.abs(b.model.ask - 0.5))[0];
  const floor = markets.find((m) => m.door === "hedge" && m.title.startsWith("H100") && m.kind === "put");

  // 1) buy 10 YES, signing the full transaction like Wallet Standard signTransaction
  const q1 = await api("quote", { series: dig.id, side: "buy", qty: 10, owner });
  console.log("quote buy", q1.qty, "@", q1.price, "pay", q1.pay, "fee", q1.fee, "via", q1.legs[0].via);
  const tx = Transaction.from(Buffer.from(q1.tx, "base64"));
  tx.partialSign(user);
  const s1 = await api("submit", { id: q1.id, tx: tx.serialize().toString("base64") });
  console.log("filled", s1.signature.slice(0, 16));

  // 2) write 2 H100 November floors, signing only the message like a burner key
  const q2 = await api("quote", { series: floor.id, side: "sell", qty: 2, owner });
  console.log("quote sell", q2.qty, "@", q2.price, "premium", q2.premium, "collateral", q2.collateral);
  const sig = nacl.sign.detached(Buffer.from(q2.message, "base64"), user.secretKey);
  const s2 = await api("submit", { id: q2.id, signature: Buffer.from(sig).toString("base64") });
  console.log("written", s2.signature.slice(0, 16));

  // 3) replaying a used quote must fail
  try { await api("submit", { id: q2.id, signature: Buffer.from(sig).toString("base64") }); console.log("REPLAY ACCEPTED (bug)"); }
  catch (e) { console.log("replay rejected:", e.message); }

  // 4) a tampered transaction must fail
  const q3 = await api("quote", { series: dig.id, side: "buy", qty: 3, owner });
  const t3 = Transaction.from(Buffer.from(q3.tx, "base64"));
  t3.instructions[t3.instructions.length - 1].data[8] = 99; // change qty
  t3.partialSign(user);
  try { await api("submit", { id: q3.id, tx: t3.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64") }); console.log("TAMPER ACCEPTED (bug)"); }
  catch (e) { console.log("tamper rejected:", e.message); }

  const p = await api(`portfolio?owner=${owner}`);
  console.log("usdc", p.usdc);
  for (const r of p.rows) console.log(" ", r.title, "long", r.long, "short", r.short, "locked", r.lockedCollateral, "mark", r.markPerContract?.toFixed?.(3));
  const expectUsdc = 10000 - q1.pay - q1.fee - q2.lock + q2.receive;
  console.log("expected usdc", expectUsdc.toFixed(2), Math.abs(expectUsdc - p.usdc) < 0.000001 ? "MATCH" : "MISMATCH");
})().catch((e) => { console.error("E2E FAILED", e.message); process.exit(1); });
