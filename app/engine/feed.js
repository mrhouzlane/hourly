// Social feed: what people are trading, in plain sentences, with profit and
// loss computed from real fills (settled payoffs, or the model mark while open).
// Wallets show as stable pseudonyms; nothing here is invented.
"use strict";
const crypto = require("crypto");
const venue = require("./venue");
const market = require("./market");
const ornn = require("./ornn");

const ADJ = ["calm", "bold", "quiet", "rapid", "patient", "keen", "silent", "bright", "early", "loyal", "wild", "careful", "humble", "steady", "lucky", "sharp"];
const NOUN = ["owl", "bear", "bull", "dip", "swing", "hedge", "yield", "bid", "wick", "dolphin", "range", "momentum", "lynx", "heron", "fox", "otter"];
function pseudonym(wallet) {
  const h = crypto.createHash("sha256").update(String(wallet)).digest();
  return `${ADJ[h[0] % ADJ.length]}_${NOUN[h[1] % NOUN.length]}.${h[2].toString(16).padStart(2, "0")}`;
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const day = (d) => { const t = new Date(`${d}T00:00:00Z`); return `${DOW[t.getUTCDay()]} ${MON[t.getUTCMonth()]} ${t.getUTCDate()}`; };
const usd = (n) => `$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function describe(f, m) {
  const gpu = m.gpu;
  if (m.door === "predict") {
    const higher = f.side === "buy";
    return {
      direction: higher ? "higher" : "lower",
      headline: `${gpu} ${higher ? "above" : "at or below"} $${m.strike.toFixed(2)} on ${day(m.windowEnd)}`,
    };
  }
  const month = MONTH[new Date(`${m.windowStart}T00:00:00Z`).getUTCMonth()];
  const isFloor = m.kind === "put";
  const higher = (f.side === "buy") !== isFloor;
  const what = isFloor ? `floor at $${m.strike.toFixed(2)}` : `cap at $${m.strike.toFixed(2)}`;
  return { direction: higher ? "higher" : "lower", headline: `${gpu} ${month} ${what}` };
}

async function build() {
  const series = await market.markets();
  const byId = new Map(series.map((m) => [m.id, m]));
  const now = Date.now();
  const rows = [];
  for (const f of venue.state.fills || []) {
    if (!f.user) continue;
    const m = byId.get(f.series);
    if (!m) continue;
    const d = describe(f, m);
    const cost = f.side === "buy" ? (f.premium || f.price * f.qty) + (f.fee || 0) : (f.collateral || 0) - (f.premium || f.price * f.qty);
    let mark = null;
    if (m.settled) mark = m.settled.payoffPerContract;
    else if (m.model) mark = m.model.fair;
    const premium = f.premium || f.price * f.qty;
    const pnl = mark === null ? 0 : f.side === "buy" ? f.qty * mark - premium - (f.fee || 0) : premium - f.qty * mark;
    const name = pseudonym(f.user);
    const verb = f.side === "buy" ? "put" : "risked";
    rows.push({
      at: f.at, ms: Date.parse(f.at), name, wallet: f.user, series: f.series, side: f.side, qty: f.qty, price: f.price,
      door: m.door, gpu: m.gpu, underlying: m.underlying, strike: m.strike, windowEnd: m.windowEnd, kind: m.kind,
      direction: d.direction, headline: d.headline, cost, pnl, settled: !!m.settled, open: m.status === "open",
      sentence: `${name} ${verb} ${usd(cost)} on ${d.headline}.`, url: venue.explorer(f.tx),
    });
  }
  rows.sort((a, b) => b.ms - a.ms);

  const windowStats = (ms) => {
    const r = rows.filter((x) => now - x.ms <= ms);
    const higher = r.filter((x) => x.direction === "higher").length;
    return {
      bets: r.length, onTable: r.reduce((a, x) => a + x.cost, 0), traders: new Set(r.map((x) => x.wallet)).size,
      higherPct: r.length ? higher / r.length : null,
    };
  };
  const sumBy = (list) => {
    const m = new Map();
    for (const x of list) {
      const e = m.get(x.wallet) || { name: x.name, pnl: 0, trades: 0 };
      e.pnl += x.pnl; e.trades += 1; m.set(x.wallet, e);
    }
    return [...m.values()];
  };
  const hot = sumBy(rows.filter((x) => now - x.ms <= 86400e3)).sort((a, b) => b.pnl - a.pnl).slice(0, 9);
  const leaders = sumBy(rows.filter((x) => now - x.ms <= 7 * 86400e3)).sort((a, b) => b.pnl - a.pnl).slice(0, 5);
  return {
    cluster: venue.CLUSTER,
    trades: rows.slice(0, 60).map(({ ms, wallet, ...rest }) => rest),
    stats: { "1h": windowStats(3600e3), "24h": windowStats(86400e3), "7d": windowStats(7 * 86400e3) },
    hot, leaders,
  };
}

module.exports = { build, pseudonym };
