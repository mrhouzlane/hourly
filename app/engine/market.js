// Market service: joins on-chain series with listing metadata, live index data
// and model prices, and turns a user's request into a co-signable RFQ fill.
"use strict";
const { PublicKey } = require("@solana/web3.js");
const chain = require("./chain");
const ornn = require("./ornn");
const model = require("./model");
const venue = require("./venue");
const { USD } = require("./catalog");

const PRICE_TTL_MS = 60_000;
const QUOTE_LIFETIME_S = 45;
const LIMITS = { predict: { maxQty: 500, makerMaxShort: 20_000 }, hedge: { maxQty: 50, makerMaxShort: 2_000 } };

let seriesCache = { at: 0, list: [] };
const priceCache = new Map(); // series -> { at, price }
const calCache = new Map(); // code -> { lastDate, cal }

async function calibration(code) {
  const { points } = await ornn.get(code);
  const lastDate = points[points.length - 1].date;
  const c = calCache.get(code);
  if (c && c.lastDate === lastDate) return { cal: c.cal, points };
  const cal = model.calibrate(points);
  calCache.set(code, { lastDate, cal });
  return { cal, points };
}

async function listSeries({ fresh = false } = {}) {
  if (!fresh && Date.now() - seriesCache.at < 15_000) return seriesCache.list;
  const onchain = await venue.readAllSeries();
  const reg = venue.state.series;
  const list = onchain
    .map((s) => ({ ...s, meta: reg[s.pubkey.toBase58()] || null }))
    .filter((s) => s.meta) // only series this venue listed and can describe
    .sort((a, b) => Number(a.expiry - b.expiry) || a.meta.title.localeCompare(b.meta.title));
  seriesCache = { at: Date.now(), list };
  return list;
}

async function price(s) {
  const key = s.pubkey.toBase58();
  const hit = priceCache.get(key);
  if (hit && Date.now() - hit.at < PRICE_TTL_MS) return hit.price;
  const { cal, points } = await calibration(s.underlying);
  const terms = { kind: s.kind, strike: Number(s.strike) / USD, cap: Number(s.cap) / USD, units: Number(s.units) };
  const r = model.priceSeries(cal, points, terms, s.meta.dates);
  const q = model.makerQuote(r.fair, r.maxPayoff);
  const p = { ...r, ...q, calibratedOn: cal.last.date };
  priceCache.set(key, { at: Date.now(), price: p });
  return p;
}

function statusOf(s, nowS) {
  if (s.settled) return "settled";
  if (nowS >= Number(s.expiry)) return "settling";
  return "open";
}

function view(s, p, nowS) {
  const m = s.meta;
  const strike = Number(s.strike) / USD;
  const cap = Number(s.cap) / USD;
  const units = Number(s.units);
  const out = {
    id: s.pubkey.toBase58(),
    door: m.door,
    title: m.title,
    underlying: s.underlying,
    gpu: ornn.GPUS[s.underlying]?.label || s.underlying,
    kind: s.kindName,
    strike, cap, units,
    maxPayoff: cap * units,
    collateralPerContract: cap * units,
    windowStart: m.dates[0],
    windowEnd: m.dates[m.dates.length - 1],
    windowDays: m.dates.length,
    expiry: Number(s.expiry),
    status: statusOf(s, nowS),
    openInterest: Number(s.openInterest),
    feedId: m.feedId,
    longMint: s.longMint.toBase58(),
    settled: s.settled ? {
      price: Number(s.settlePrice) / USD,
      payoffPerContract: Number(s.payoffPerContract) / USD,
      byOracle: s.settledByOracle,
      tx: (venue.state.settlements.find((x) => x.series === s.pubkey.toBase58()) || {}).tx || null,
    } : null,
  };
  if (p && out.status === "open") {
    out.model = {
      fair: p.fair, probItm: p.probItm, bid: p.bid, ask: p.ask,
      settleP10: p.settle.p10, settleP50: p.settle.p50, settleP90: p.settle.p90,
      observedPrints: p.observedPrints, futurePrints: p.futurePrints, calibratedOn: p.calibratedOn,
    };
  }
  return out;
}

async function markets() {
  const nowS = Math.floor(Date.now() / 1000);
  const list = await listSeries();
  const out = [];
  for (const s of list) {
    let p = null;
    if (!s.settled && nowS < Number(s.expiry)) {
      try { p = await price(s); } catch (_) { p = null; }
    }
    out.push(view(s, p, nowS));
  }
  return out;
}

// A quote is one or more legs filled atomically in one transaction.
// side: "buy" = user buys the contract from the venue's maker (pays ask);
//       "sell" = user writes the contract to the maker (posts collateral, receives bid).
async function quote({ legs, seriesId, side, qty, owner }) {
  if (!legs) legs = [{ series: seriesId, side, qty }];
  if (!Array.isArray(legs) || legs.length < 1 || legs.length > 2) throw venue.httpError(400, "one or two legs per quote");
  let user;
  try { user = new PublicKey(owner); } catch (_) { throw venue.httpError(400, "bad wallet address"); }
  if (user.equals(venue.keys.maker.publicKey) || user.equals(venue.keys.admin.publicKey)) throw venue.httpError(400, "venue keys cannot trade");
  const list = await listSeries();
  const nowS = Math.floor(Date.now() / 1000);
  const quoteMint = new PublicKey(venue.state.quoteMint);
  const maker = venue.keys.maker.publicKey;
  const ixs = [venue.ataIx(quoteMint, user).ix];
  const outLegs = [];
  let payAtoms = 0n, receiveAtoms = 0n, lockAtoms = 0n;
  const seen = new Set();
  for (const leg of legs) {
    if (!["buy", "sell"].includes(leg.side)) throw venue.httpError(400, "side must be buy or sell");
    const q = Number(leg.qty);
    if (!Number.isInteger(q) || q <= 0) throw venue.httpError(400, "quantity must be a whole number above zero");
    const s = list.find((x) => x.pubkey.toBase58() === leg.series);
    if (!s) throw venue.httpError(404, "unknown market");
    if (seen.has(leg.series)) throw venue.httpError(400, "two legs on the same market");
    seen.add(leg.series);
    if (s.settled || nowS >= Number(s.expiry) - 60) throw venue.httpError(409, "This market is closed for trading.");
    const lim = LIMITS[s.meta.door];
    if (q > lim.maxQty) throw venue.httpError(400, `Maximum ${lim.maxQty} contracts per trade here.`);
    const p = await price(s);
    const unit = leg.side === "buy" ? p.ask : p.bid;
    if (leg.side === "sell" && unit <= 0) throw venue.httpError(409, "The desk has no bid on this contract right now.");
    const premiumAtoms = BigInt(Math.round(unit * q * USD));
    const collateralAtoms = BigInt(s.cap) * BigInt(s.units) * BigInt(q);
    if (leg.side === "buy") {
      payAtoms += premiumAtoms;
      const makerPos = (await venue.positions(maker, [s.pubkey]))[s.pubkey.toBase58()] || 0n;
      if (makerPos + BigInt(q) > BigInt(lim.makerMaxShort)) throw venue.httpError(409, "The desk is at its risk limit on this market.");
    } else {
      receiveAtoms += premiumAtoms;
      lockAtoms += collateralAtoms;
    }
    const buyer = leg.side === "buy" ? user : maker;
    const seller = leg.side === "buy" ? maker : user;
    ixs.push(venue.ataIx(chain.longMintPda(s.pubkey), buyer).ix);
    ixs.push(chain.fill({
      payer: venue.keys.admin.publicKey, buyer, seller, series: s.pubkey, quoteMint,
      qty: q, premium: premiumAtoms, quoteExpiry: nowS + QUOTE_LIFETIME_S,
    }));
    outLegs.push({
      series: leg.series, title: s.meta.title, side: leg.side, qty: q, price: unit,
      premium: Number(premiumAtoms) / USD, collateral: leg.side === "sell" ? Number(collateralAtoms) / USD : 0,
      model: { fair: p.fair, bid: p.bid, ask: p.ask },
    });
  }
  // the program moves the seller's collateral before the buyer's premium, so a
  // writer needs the full collateral up front even if premium comes back in
  const userBal = (await venue.tokenBalances(user, [quoteMint.toBase58()]))[quoteMint.toBase58()] || 0n;
  const need = payAtoms + lockAtoms;
  if (userBal < need) {
    throw venue.httpError(402, lockAtoms > 0n
      ? `This trade needs $${(Number(need) / USD).toLocaleString("en-US", { maximumFractionDigits: 2 })} of test USDC, including collateral. Use the faucet or trade fewer.`
      : "Not enough test USDC. Use the faucet first.");
  }
  const first = outLegs[0];
  const meta = {
    kind: "fill", series: first.series, side: first.side, qty: first.qty, price: first.price, title: outLegs.map((l) => l.title).join(" + "),
    legs: outLegs, pay: Number(payAtoms) / USD, receive: Number(receiveAtoms) / USD, lock: Number(lockAtoms) / USD,
    premium: first.premium, collateral: first.collateral, user: user.toBase58(),
  };
  const prepared = await venue.prepareUserTx({ ixs, user, venueSigners: [venue.keys.maker], meta, units: 110_000 * outLegs.length + 30_000 });
  return { ...prepared, ...meta, expiresIn: QUOTE_LIFETIME_S };
}

// Post-trade actions a user signs: redeem a settled long, reclaim collateral,
// or close a short against longs before settlement.
async function action({ type, seriesId, owner, qty }) {
  let user;
  try { user = new PublicKey(owner); } catch (_) { throw venue.httpError(400, "bad wallet address"); }
  const list = await listSeries({ fresh: true });
  const s = list.find((x) => x.pubkey.toBase58() === seriesId);
  if (!s) throw venue.httpError(404, "unknown market");
  const quoteMint = new PublicKey(venue.state.quoteMint);
  const ixs = [venue.ataIx(quoteMint, user).ix];
  if (type === "redeem") {
    if (!s.settled) throw venue.httpError(409, "Not settled yet.");
    const bal = (await venue.tokenBalances(user, [s.longMint.toBase58()]))[s.longMint.toBase58()] || 0n;
    const n = qty ? BigInt(qty) : bal;
    if (n <= 0n || n > bal) throw venue.httpError(400, "Nothing to redeem.");
    ixs.push(chain.redeem({ holder: user, series: s.pubkey, quoteMint, qty: n }));
  } else if (type === "reclaim") {
    if (!s.settled) throw venue.httpError(409, "Not settled yet.");
    ixs.push(chain.reclaim({ writer: user, series: s.pubkey, quoteMint }));
  } else if (type === "close") {
    const n = BigInt(qty || 0);
    if (n <= 0n) throw venue.httpError(400, "quantity required");
    ixs.push(chain.close({ writer: user, series: s.pubkey, quoteMint, qty: n }));
  } else {
    throw venue.httpError(400, "unknown action");
  }
  const meta = { kind: type, series: seriesId, user: user.toBase58(), title: s.meta.title };
  return { ...(await venue.prepareUserTx({ ixs, user, meta, units: 100_000 })), ...meta };
}

async function portfolio(owner) {
  let user;
  try { user = new PublicKey(owner); } catch (_) { throw venue.httpError(400, "bad wallet address"); }
  const list = await listSeries();
  const quoteMint = venue.state.quoteMint;
  const bals = await venue.tokenBalances(user, [quoteMint]);
  const pos = await venue.positions(user, list.map((s) => s.pubkey));
  const nowS = Math.floor(Date.now() / 1000);
  const rows = [];
  for (const s of list) {
    const id = s.pubkey.toBase58();
    const long = Number(bals[s.longMint.toBase58()] || 0n);
    const short = Number(pos[id] || 0n);
    if (!long && !short) continue;
    let p = null;
    if (!s.settled && nowS < Number(s.expiry)) { try { p = await price(s); } catch (_) { /* no mark */ } }
    const v = view(s, p, nowS);
    const per = s.settled ? Number(s.payoffPerContract) / USD : null;
    rows.push({
      ...v, long, short,
      markPerContract: p ? p.fair : per,
      redeemable: s.settled ? long * per : 0,
      reclaimable: s.settled ? short * (v.collateralPerContract - per) : 0,
      lockedCollateral: short * v.collateralPerContract,
    });
  }
  return { owner: user.toBase58(), usdc: Number(bals[quoteMint] || 0n) / USD, rows };
}

module.exports = { listSeries, markets, quote, action, portfolio, price, calibration };
