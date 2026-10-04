// Any market maker can trade on Hourly without the venue's server or keys.
// The program's `fill` instruction only needs the buyer's and seller's
// signatures; here an independent maker sells YES contracts to a trader and
// pays its own fees. Uses only the public program interface (engine/chain.js).
//
// Usage on the preview chain:
//   BASE=http://127.0.0.1:7990 RPC_URL=http://127.0.0.1:18899 node scripts/maker-example.js
"use strict";
const { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const spl = require("@solana/spl-token");
const chain = require("../engine/chain");

const BASE = process.env.BASE || "http://127.0.0.1:7990";
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:18899";
const conn = new Connection(RPC_URL, "confirmed");
const api = async (p, body) => {
  const r = await fetch(`${BASE}/api/${p}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(`${p}: ${j.error}`);
  return j;
};

(async () => {
  const status = await api("status");
  const quoteMint = new PublicKey(status.quoteMint);
  const maker = Keypair.generate();
  const trader = Keypair.generate();

  // fund both: SOL for the maker's fees (local chain only), test USDC from the public faucet
  if (status.cluster !== "devnet") {
    const sig = await conn.requestAirdrop(maker.publicKey, LAMPORTS_PER_SOL);
    await conn.confirmTransaction(sig, "confirmed");
  }
  await api("faucet", { owner: maker.publicKey.toBase58() });
  await api("faucet", { owner: trader.publicKey.toBase58() });

  // pick a live prediction market from the public list
  const markets = await api("markets");
  const m = markets.find((x) => x.door === "predict" && x.status === "open");
  const series = new PublicKey(m.id);
  const longMint = chain.longMintPda(series);

  // the maker's own price, agreed off-chain with the trader: 40 cents a contract
  const qty = 25, priceCents = 40;
  const premium = BigInt(qty * priceCents * 10_000);
  const tx = new Transaction().add(
    spl.createAssociatedTokenAccountIdempotentInstruction(maker.publicKey, chain.ata(longMint, trader.publicKey), trader.publicKey, longMint),
    chain.fill({
      payer: maker.publicKey, buyer: trader.publicKey, seller: maker.publicKey, series, quoteMint, treasury: new PublicKey(status.treasury),
      qty, premium, quoteExpiry: Math.floor(Date.now() / 1000) + 60,
    }),
  );
  tx.feePayer = maker.publicKey;
  tx.recentBlockhash = (await conn.getLatestBlockhash("confirmed")).blockhash;
  tx.sign(maker, trader); // in practice the trader signs in their own wallet
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction(sig, "confirmed");

  const p = await api(`portfolio?owner=${trader.publicKey.toBase58()}`);
  const row = p.rows.find((r) => r.id === m.id);
  console.log(`independent maker ${maker.publicKey.toBase58().slice(0, 8)} sold ${qty} YES on "${m.title}" at ${priceCents} cents`);
  console.log(`trader now holds ${row ? row.long : 0} contracts and ${p.usdc} test USDC (paid ${Number(premium) / 1e6})`);
  console.log(`tx ${sig}`);
})().catch((e) => { console.error("FAILED", e.message); process.exit(1); });
