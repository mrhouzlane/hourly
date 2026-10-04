// Keeper: lists new markets, settles expired ones through the Switchboard
// oracle, and keeps the venue's maker stocked with test USDC.
"use strict";
const { PublicKey, Transaction } = require("@solana/web3.js");
const chain = require("./chain");
const ornn = require("./ornn");
const venue = require("./venue");
const market = require("./market");
const catalog = require("./catalog");

const CROSSBAR_URL = process.env.CROSSBAR_URL || "https://crossbar.switchboardlabs.xyz";
const FALLBACK_DELAY_S = 72 * 3600;
const MAKER_FLOOR_USD = 2_000_000;
const MAKER_TOPUP_USD = 5_000_000;

let sb = null; // lazy ESM imports
async function switchboard() {
  if (sb) return sb;
  const ondemand = await import("@switchboard-xyz/on-demand");
  const common = await import("@switchboard-xyz/common");
  const crossbar = new common.CrossbarClient(CROSSBAR_URL, false);
  const queue = venue.CLUSTER === "devnet" ? await ondemand.getDefaultDevnetQueue(venue.RPC_URL) : null;
  sb = { ondemand, crossbar, queue };
  return sb;
}

const log = (...a) => console.log(new Date().toISOString(), "[keeper]", ...a);

// Stores the feed definition with Switchboard (so anyone can fetch it by hash)
// and returns its 32-byte id.
async function feedIdFor(code, dates) {
  const { crossbar } = await switchboard();
  const feed = ornn.oracleFeed(code, dates);
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await crossbar.storeOracleFeed(feed);
      return Buffer.from(r.feedId.replace(/^0x/, ""), "hex");
    } catch (e) { lastErr = e; await sleep(1500 * (i + 1)); }
  }
  throw lastErr;
}

async function listOne(spec) {
  const quoteMint = new PublicKey(venue.state.quoteMint);
  const feedId = await feedIdFor(spec.underlying, spec.dates);
  const { ix, series } = chain.createSeries({
    admin: venue.keys.admin.publicKey, quoteMint, underlying: spec.underlying, kind: spec.kind,
    strike: spec.strike, cap: spec.cap, units: spec.units, periodStart: spec.periodStart, expiry: spec.expiry, feedId,
  });
  const id = series.toBase58();
  if (venue.state.series[id]) return null;
  const existing = await venue.conn.getAccountInfo(series);
  if (!existing) await venue.send([ix], []);
  venue.state.series[id] = { ...spec, strike: spec.strike, cap: spec.cap, feedId: `0x${feedId.toString("hex")}` };
  venue.save();
  log("listed", spec.title, id);
  return id;
}

async function lastPrints() {
  const out = {};
  let lastDate = null;
  for (const code of Object.keys(ornn.GPUS)) {
    const { points } = await ornn.get(code);
    const p = points[points.length - 1];
    out[code] = p.v;
    if (!lastDate || p.date > lastDate) lastDate = p.date;
  }
  return { last: out, lastDate };
}

function haveSimilar(spec) {
  return Object.values(venue.state.series).some((s) =>
    s.underlying === spec.underlying && s.kind === spec.kind && s.expiry === spec.expiry &&
    (s.door === "hedge" || s.strike === spec.strike));
}

async function rollListings() {
  const nowS = Math.floor(Date.now() / 1000);
  const { last } = await lastPrints();
  const today = new Date().toISOString().slice(0, 10);
  const specs = catalog.predictListings(last, today);
  const month = new Date();
  month.setUTCDate(1);
  month.setUTCMonth(month.getUTCMonth() + 1);
  specs.push(...catalog.hedgeListings(last, month.toISOString().slice(0, 7)));
  let n = 0;
  for (const spec of specs) {
    if (spec.expiry <= nowS + 3600) continue;
    if (haveSimilar(spec)) continue;
    try { if (await listOne(spec)) n++; } catch (e) { log("list failed", spec.title, e.message); }
  }
  return n;
}

async function settleOracle(s) {
  const { crossbar, queue } = await switchboard();
  if (!queue) throw new Error("oracle settlement needs devnet");
  const meta = venue.state.series[s.pubkey.toBase58()];
  const feed = ornn.oracleFeed(s.underlying, meta.dates);
  // instructionIdx 0: the program checks the Ed25519 offsets point at index 0
  const quoteIx = await queue.fetchQuoteIx(crossbar, [feed], { numSignatures: 1, instructionIdx: 0 });
  const settleIx = chain.settleOracle({ series: s.pubkey, queue: venue.ORACLE_QUEUE, quoteIxIndex: 0 });
  const tx = new Transaction().add(quoteIx, ...venue.computeIxs(400_000), settleIx);
  tx.feePayer = venue.keys.admin.publicKey;
  const { blockhash, lastValidBlockHeight } = await venue.conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(venue.keys.admin);
  const sig = await venue.conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 5 });
  const res = await venue.conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  if (res.value.err) throw new Error(`settle_oracle ${sig} failed: ${JSON.stringify(res.value.err)}`);
  return sig;
}

async function settleFallback(s) {
  const meta = venue.state.series[s.pubkey.toBase58()];
  const c = await ornn.get(s.underlying, { maxAgeMs: 0 });
  const w = ornn.windowMean(c.points, meta.dates);
  if (w.mean === null) throw new Error("no prints in window");
  const price = BigInt(Math.round(w.mean * 1e6));
  const evidence = ornn.sha256(c.raw);
  return venue.send([chain.settleFallback({ settler: venue.keys.settler.publicKey, series: s.pubkey, price, evidence })], [venue.keys.settler]);
}

async function settleDue() {
  const nowS = Math.floor(Date.now() / 1000);
  const list = await market.listSeries({ fresh: true });
  for (const s of list) {
    if (s.settled || nowS < Number(s.expiry)) continue;
    const id = s.pubkey.toBase58();
    let sig = null, how = null;
    if (venue.CLUSTER !== "devnet") {
      // preview chain: no Switchboard there; the preview build lets the backup key settle at expiry
      try { sig = await settleFallback(s); how = "preview"; }
      catch (e) { log("preview settle failed", id, String(e.message || e).slice(0, 200)); }
      if (sig) { venue.state.settlements.push({ series: id, tx: sig, how, at: new Date().toISOString() }); venue.save(); log("settled", id, how, sig); }
      continue;
    }
    for (let i = 0; i < 3 && !sig; i++) {
      try { sig = await settleOracle(s); how = "oracle"; }
      catch (e) { log("oracle settle attempt failed", id, String(e.message || e).slice(0, 200)); await sleep(3000 * (i + 1)); }
    }
    if (!sig && nowS >= Number(s.expiry) + FALLBACK_DELAY_S) {
      try { sig = await settleFallback(s); how = "fallback"; }
      catch (e) { log("fallback settle failed", id, e.message); }
    }
    if (sig) {
      venue.state.settlements.push({ series: id, tx: sig, how, at: new Date().toISOString() });
      venue.save();
      log("settled", id, how, sig);
    }
  }
}

async function restockMaker() {
  const mint = venue.state.quoteMint;
  const bal = (await venue.tokenBalances(venue.keys.maker.publicKey, [mint]))[mint] || 0n;
  if (Number(bal) / 1e6 < MAKER_FLOOR_USD) {
    await venue.mintQuote(venue.keys.maker.publicKey, MAKER_TOPUP_USD);
    log("maker restocked");
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    await ornn.refreshAll();
    await settleDue();
    await rollListings();
    await restockMaker();
  } catch (e) {
    log("tick error", e.message);
  } finally {
    running = false;
  }
}

function start(intervalMs = 120_000) {
  setTimeout(tick, 5_000);
  return setInterval(tick, intervalMs);
}

module.exports = { start, tick, rollListings, settleDue, settleOracle, settleFallback, listOne, feedIdFor, restockMaker };
