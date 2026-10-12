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
const LIMITS = { predict: { maxQty: 500, makerMaxShort: 20_000, makerMaxLong: 20_000 }, hedge: { maxQty: 50, makerMaxShort: 2_000, makerMaxLong: 2_000 } };
// Smallest trade the venue co-signs: stops rent farming with dust trades (the venue pays account rent).
const MIN_PREMIUM_USD = 0.5;
// New token accounts the venue will pay rent for, per wallet per day.
const MAX_NEW_ACCOUNTS_PER_DAY = 12;
const newAccounts = new Map(); // wallet -> { day, n }
function chargeNewAccounts(user, n) {
  const day = new Date().toISOString().slice(0, 10);
  const k = user.toBase58();
  const c = newAccounts.get(k);
  const cur = c && c.day === day ? c.n : 0;
  if (cur + n > MAX_NEW_ACCOUNTS_PER_DAY) throw venue.httpError(429, "Too many new positions from this wallet today.");
  newAccounts.set(k, { day, n: cur + n });
}
// Ornn prints at 4pm New York (20:00 or 21:00 UTC). From 19:55 UTC until the
// day's print is in our data, every market's price is about to move: no quotes.
async function printPending(code) {
  const now = new Date();
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (minutes < 19 * 60 + 55) return false;
  const today = now.toISOString().slice(0, 10);
  const { points } = await ornn.get(code, { maxAgeMs: 120_000 });
  return points[points.length - 1].date < today && minutes < 23 * 60 + 30;
}

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

// The venue stops quoting at 19:55 UTC on the window's last day: Ornn's
// 4pm New York print lands at 20:00 or 21:00 UTC, and nobody should be able
// to trade against the desk once the answer is public.
const CUTOFF_S = 19 * 3600 + 55 * 60;
function tradingEnd(s) {
  const last = s.meta.dates[s.meta.dates.length - 1];
  return Math.min(Number(s.expiry), Math.floor(Date.parse(`${last}T00:00:00Z`) / 1000) + CUTOFF_S);
}

function statusOf(s, nowS) {
  if (s.settled) return "settled";
  if (nowS >= Number(s.expiry)) return "settling";
  if (nowS >= tradingEnd(s)) return "closed";
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
    tradingEnd: tradingEnd(s),
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
      dist: p.dist,
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
    if (!s.settled && nowS < tradingEnd(s)) {
      try { p = await price(s); } catch (_) { p = null; }
    }
    out.push(view(s, p, nowS));
  }
  return out;
}

function vaultPhase(d, nowS) {
  if (nowS < Number(d.depositEnd)) return "deposits";
  if (nowS < Number(d.epochEnd)) return "trading";
  return d.openSeries > 0 ? "settling" : "withdrawable";
}

// The weekly vault trading now, if this series settles inside its epoch.
function tradingVaultFor(s, nowS) {
  for (const v of Object.values(venue.state.vaults || {})) {
    if (nowS >= v.depositEnd && nowS < v.epochEnd && Number(s.expiry) <= v.epochEnd) return v;
  }
  return null;
}

async function vaultRoom(v, s) {
  const [va, vsa] = await venue.conn.getMultipleAccountsInfo([new PublicKey(v.pubkey), chain.vaultSeriesPda(v.pubkey, s.pubkey)]);
  if (!va) return null;
  const d = chain.decodeLpVault(va.data);
  const vs = vsa ? chain.decodeVaultSeries(vsa.data) : { short: 0n, long: 0n };
  const cash = BigInt((await venue.conn.getTokenAccountBalance(d.cash)).value.amount);
  return { capAtoms: (d.deposits * BigInt(d.maxSeriesBps)) / 10_000n, short: vs.short, long: vs.long, cash };
}

// A referral is any other valid wallet; self-referrals and venue keys are dropped.
function refOf(ref, user) {
  if (!ref) return null;
  let r;
  try { r = new PublicKey(String(ref)); } catch (_) { return null; }
  if (r.equals(user)) return null;
  if ([venue.keys.maker, venue.keys.admin, venue.keys.payer, venue.keys.lister].some((k) => k && r.equals(k.publicKey))) return null;
  return r.toBase58();
}
const feeOf = (premiumAtoms) => (premiumAtoms * BigInt(venue.state.feeBps || 0)) / 10_000n;

// A quote is one or more legs filled atomically in one transaction.
// side: "buy" = user buys the contract (pays ask plus the protocol fee);
//       "sell" = user writes the contract (posts collateral, receives bid).
// Each leg is routed to the weekly underwriting vault when it has room under
// its on-chain cap, otherwise to the venue's desk.
async function quote({ legs, seriesId, side, qty, owner, ref }) {
  if (!legs) legs = [{ series: seriesId, side, qty }];
  if (!Array.isArray(legs) || legs.length < 1 || legs.length > 2) throw venue.httpError(400, "one or two legs per quote");
  let user;
  try { user = new PublicKey(owner); } catch (_) { throw venue.httpError(400, "bad wallet address"); }
  if ([venue.keys.maker, venue.keys.admin, venue.keys.payer, venue.keys.lister].some((k) => user.equals(k.publicKey))) throw venue.httpError(400, "venue keys cannot trade");
  const list = await listSeries();
  const nowS = Math.floor(Date.now() / 1000);
  const quoteMint = new PublicKey(venue.state.quoteMint);
  const treasury = new PublicKey(venue.state.treasury);
  const maker = venue.keys.maker.publicKey;
  const ixs = [venue.ataIx(quoteMint, user).ix];
  const outLegs = [];
  let payAtoms = 0n, feeAtoms = 0n, receiveAtoms = 0n, lockAtoms = 0n;
  const seen = new Set();
  for (const leg of legs) {
    if (!["buy", "sell"].includes(leg.side)) throw venue.httpError(400, "side must be buy or sell");
    const q = Number(leg.qty);
    if (!Number.isInteger(q) || q <= 0) throw venue.httpError(400, "quantity must be a whole number above zero");
    const s = list.find((x) => x.pubkey.toBase58() === leg.series);
    if (!s) throw venue.httpError(404, "unknown market");
    if (seen.has(leg.series)) throw venue.httpError(400, "two legs on the same market");
    seen.add(leg.series);
    if (s.settled || nowS >= tradingEnd(s)) throw venue.httpError(409, "Trading has closed on this market. The print is due.");
    if (await printPending(s.underlying)) throw venue.httpError(409, "Prices refresh after today's 4pm New York print. Try again shortly.");
    const lim = LIMITS[s.meta.door];
    if (q > lim.maxQty) throw venue.httpError(400, `Maximum ${lim.maxQty} contracts per trade here.`);
    const p = await price(s);
    const unit = leg.side === "buy" ? p.ask : p.bid;
    if (leg.side === "sell" && unit <= 0) throw venue.httpError(409, "The desk has no bid on this contract right now.");
    const premiumAtoms = BigInt(Math.round(unit * q * USD));
    if (Number(premiumAtoms) / USD < MIN_PREMIUM_USD) throw venue.httpError(400, `Minimum trade is $${MIN_PREMIUM_USD.toFixed(2)} of premium.`);
    const fee = feeOf(premiumAtoms);
    const per = BigInt(s.cap) * BigInt(s.units);
    const collateralAtoms = per * BigInt(q);

    // route: weekly vault if it has room, else the desk
    let via = "desk";
    const v = tradingVaultFor(s, nowS);
    if (v) {
      const room = await vaultRoom(v, s);
      if (room) {
        const ok = leg.side === "buy"
          ? (room.short + BigInt(q)) * per <= room.capAtoms && room.cash >= collateralAtoms
          : (room.long + BigInt(q)) * per <= room.capAtoms && room.cash >= premiumAtoms + fee;
        if (ok) via = "vault";
      }
    }
    if (via === "vault") {
      const args = { payer: venue.keys.payer.publicKey, quoter: maker, taker: user, epoch: v.epoch, series: s.pubkey, quoteMint, treasury, qty: q, premium: premiumAtoms, quoteExpiry: nowS + QUOTE_LIFETIME_S };
      if (leg.side === "buy") {
        ixs.push(venue.ataIx(chain.longMintPda(s.pubkey), user).ix);
        ixs.push(chain.vaultSell(args));
      } else {
        ixs.push(chain.vaultBuy(args));
      }
    } else {
      if (leg.side === "buy") {
        const makerPos = (await venue.positions(maker, [s.pubkey]))[s.pubkey.toBase58()] || 0n;
        if (makerPos + BigInt(q) > BigInt(lim.makerMaxShort)) throw venue.httpError(409, "The desk is at its risk limit on this market.");
      }
      if (leg.side === "sell") {
        const longs = (await venue.tokenBalances(maker, [chain.longMintPda(s.pubkey).toBase58()]))[chain.longMintPda(s.pubkey).toBase58()] || 0n;
        if (longs + BigInt(q) > BigInt(lim.makerMaxLong)) throw venue.httpError(409, "The desk is at its risk limit on this market.");
      }
      const buyer = leg.side === "buy" ? user : maker;
      const seller = leg.side === "buy" ? maker : user;
      ixs.push(venue.ataIx(chain.longMintPda(s.pubkey), buyer).ix);
      ixs.push(chain.fill({
        payer: venue.keys.payer.publicKey, buyer, seller, series: s.pubkey, quoteMint, treasury,
        qty: q, premium: premiumAtoms, quoteExpiry: nowS + QUOTE_LIFETIME_S,
      }));
    }
    if (leg.side === "buy") { payAtoms += premiumAtoms; feeAtoms += fee; }
    else { receiveAtoms += premiumAtoms; lockAtoms += collateralAtoms; }
    outLegs.push({
      series: leg.series, title: s.meta.title, side: leg.side, qty: q, price: unit, via,
      premium: Number(premiumAtoms) / USD, fee: leg.side === "buy" ? Number(fee) / USD : 0,
      collateral: leg.side === "sell" ? Number(collateralAtoms) / USD : 0,
      model: { fair: p.fair, bid: p.bid, ask: p.ask },
    });
  }
  // the program moves the seller's collateral before the buyer's premium, so a
  // writer needs the full collateral up front even if premium comes back in
  const userBal = (await venue.tokenBalances(user, [quoteMint.toBase58()]))[quoteMint.toBase58()] || 0n;
  const need = payAtoms + feeAtoms + lockAtoms;
  if (userBal < need) {
    throw venue.httpError(402, lockAtoms > 0n
      ? `This trade needs $${(Number(need) / USD).toLocaleString("en-US", { maximumFractionDigits: 2 })} of test USDC, including collateral. Use the faucet or trade fewer.`
      : "Not enough test USDC. Use the faucet first.");
  }
  const first = outLegs[0];
  const meta = {
    kind: "fill", series: first.series, side: first.side, qty: first.qty, price: first.price, title: outLegs.map((l) => l.title).join(" + "),
    legs: outLegs, pay: Number(payAtoms) / USD, fee: Number(feeAtoms) / USD, receive: Number(receiveAtoms) / USD, lock: Number(lockAtoms) / USD,
    premium: first.premium, collateral: first.collateral, user: user.toBase58(),
    ref: refOf(ref, user),
  };
  // count accounts this transaction would create for the user (rent paid by the venue)
  const wanted = [chain.ata(quoteMint, user), ...outLegs.filter((l) => l.side === "buy").map((l) => chain.ata(chain.longMintPda(l.series), user))];
  const infos = await venue.conn.getMultipleAccountsInfo(wanted);
  const fresh = infos.filter((a) => !a).length;
  if (fresh) chargeNewAccounts(user, fresh);
  const prepared = await venue.prepareUserTx({ ixs, user, venueSigners: [venue.keys.maker], meta, units: 140_000 * outLegs.length + 40_000 });
  return { ...prepared, ...meta, expiresIn: QUOTE_LIFETIME_S };
}

// LP actions: deposit into a vault before its week starts, withdraw after it settles.
async function vaultAction({ type, epoch, owner, amount }) {
  let user;
  try { user = new PublicKey(owner); } catch (_) { throw venue.httpError(400, "bad wallet address"); }
  const v = (venue.state.vaults || {})[epoch];
  if (!v) throw venue.httpError(404, "unknown vault");
  const nowS = Math.floor(Date.now() / 1000);
  const quoteMint = new PublicKey(venue.state.quoteMint);
  const shares = chain.sharesPda(v.pubkey);
  const ixs = [];
  if (type === "deposit") {
    if (nowS >= v.depositEnd) throw venue.httpError(409, "Deposits for this week are closed.");
    const usd = Number(amount);
    if (!(usd >= 1)) throw venue.httpError(400, "Deposit at least $1.");
    const atoms = BigInt(Math.round(usd * USD));
    const bal = (await venue.tokenBalances(user, [quoteMint.toBase58()]))[quoteMint.toBase58()] || 0n;
    if (bal < atoms) throw venue.httpError(402, "Not enough test USDC. Use the faucet first.");
    ixs.push(venue.ataIx(shares, user).ix, chain.vaultDeposit({ epoch: v.epoch, depositor: user, quoteMint, amount: atoms }));
  } else if (type === "withdraw") {
    const held = (await venue.tokenBalances(user, [shares.toBase58()]))[shares.toBase58()] || 0n;
    if (held <= 0n) throw venue.httpError(400, "No shares in this vault.");
    ixs.push(venue.ataIx(quoteMint, user).ix, chain.vaultWithdraw({ epoch: v.epoch, owner: user, quoteMint, shares: held }));
  } else {
    throw venue.httpError(400, "unknown vault action");
  }
  const meta = { kind: `vault-${type}`, epoch: v.epoch, user: user.toBase58(), amount: Number(amount) || null };
  return { ...(await venue.prepareUserTx({ ixs, user, meta, units: 120_000 })), ...meta };
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
  // vault shares: value = share of the vault's cash now; locked collateral returns after settlement
  const vaults = [];
  for (const v of Object.values(venue.state.vaults || {})) {
    const sm = chain.sharesPda(v.pubkey).toBase58();
    const held = (await venue.tokenBalances(user, [sm]))[sm] || 0n;
    if (held <= 0n) continue;
    const a = await venue.conn.getAccountInfo(new PublicKey(v.pubkey));
    if (!a) continue;
    const d = chain.decodeLpVault(a.data);
    const supply = BigInt((await venue.conn.getTokenSupply(d.shareMint)).value.amount);
    const cash = BigInt((await venue.conn.getTokenAccountBalance(d.cash)).value.amount);
    vaults.push({
      epoch: v.epoch, shares: Number(held) / USD, share: supply > 0n ? Number(held) / Number(supply) : 0,
      cashValue: supply > 0n ? Number((cash * held) / supply) / USD : 0,
      phase: vaultPhase(d, nowS),
      depositEnd: Number(d.depositEnd), epochEnd: Number(d.epochEnd),
    });
  }
  return { owner: user.toBase58(), usdc: Number(bals[quoteMint] || 0n) / USD, rows, vaults };
}

module.exports = { listSeries, markets, quote, action, vaultAction, vaultPhase, portfolio, price, calibration };
