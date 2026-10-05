// Reproduces every worked number in docs/LITEPAPER.md from the repo's own engine.
// Run: node docs/litepaper-numbers.js   (reads app/data/*.json, the cached Ornn history)
"use strict";
const path = require("path");
const app = path.join(__dirname, "..", "app", "engine");
const ornn = require(path.join(app, "ornn"));
const model = require(path.join(app, "model"));
const catalog = require(path.join(app, "catalog"));
const fs = require("fs");

const load = (code) => {
  const raw = fs.readFileSync(path.join(__dirname, "..", "app", "data", `${code}.json`), "utf8");
  const j = JSON.parse(raw);
  return j.data.filter((p) => p.index_value > 0).map((p) => ({ t: p.timestamp, date: p.timestamp.slice(0, 10), v: p.index_value })).sort((a, b) => (a.t < b.t ? -1 : 1));
};
const pts = load("H100_SXM");
const last = pts[pts.length - 1];
console.log("H100 prints:", pts.length, "first", pts[0].t, "last", last.t, last.v);
const cal = model.calibrate(pts);
console.log("calibration", JSON.stringify({ sigmaL: cal.sigmaL, b: cal.b, sigmaU: cal.sigmaU, halfLifeDays: cal.halfLifeDays, annualLevelVol: cal.annualLevelVol, volScale: cal.volScale }));

// ---- Example 1: digital (yes/no) ----
const date = "2026-10-09";
const atm = Math.round(last.v / 0.05) * 0.05;
const strike = Number(atm.toFixed(2));
const dg = catalog.digital("H100_SXM", date, strike);
const terms = { kind: dg.kind, strike, cap: dg.cap / 1e6, units: dg.units };
const r = model.priceSeries(cal, pts, terms, dg.dates);
const q = model.makerQuote(r.fair, r.maxPayoff);
console.log("EX1 digital", dg.title, "strike", strike, "fair", r.fair, "probItm", r.probItm, "p10/50/90", r.settle, "quote", q);
const qty = 100, fee = 0.01;
const premium = q.ask * qty, feeUsd = premium * fee;
console.log("EX1 buy 100 yes: premium", premium, "fee", feeUsd, "total", premium + feeUsd, "wins pays", 100 * 1, "profit if win", 100 - premium - feeUsd, "loss if lose", premium + feeUsd);
console.log("EX1 writer (sells 100 at bid", q.bid, ") posts collateral", 100 * 1, "receives", q.bid * 100);

// ---- Example 2: monthly floor (put spread) and cap (call spread), November ----
const spec = catalog.hedgeListings({ H100_SXM: last.v }, "2026-11").filter((s) => s.underlying === "H100_SXM");
for (const s of spec) {
  const t = { kind: s.kind, strike: s.strike / 1e6, cap: s.cap / 1e6, units: s.units };
  const rr = model.priceSeries(cal, pts, t, s.dates);
  const qq = model.makerQuote(rr.fair, rr.maxPayoff);
  console.log("EX2", s.title, JSON.stringify({ units: s.units, days: s.dates.length, strike: t.strike, width: t.cap, maxPayoff: rr.maxPayoff, fair: rr.fair, probItm: rr.probItm, bid: qq.bid, ask: qq.ask, p10: rr.settle.p10, p50: rr.settle.p50, p90: rr.settle.p90 }));
  s._t = t; s._q = qq; s._r = rr;
}
const put = spec.find((s) => s.kind === 1), call = spec.find((s) => s.kind === 0);
// payoff table for 1 contract = 1 GPU for the month
const grid = [];
for (let p = 1.8; p <= 3.41; p += 0.2) grid.push(Number(p.toFixed(2)));
console.log("payoff table, one contract (1 GPU, 720 hours)");
for (const p of grid) {
  const pp = model.payoffUsd(1, put._t.strike, put._t.cap, put._t.units, p);
  const pc = model.payoffUsd(0, call._t.strike, call._t.cap, call._t.units, p);
  console.log(" avg", p, "floor pays", pp.toFixed(2), "cap pays", pc.toFixed(2));
}
// owner of 1 GPU for the month: revenue = 720 * avg; floor premium = put ask
const hours = put._t.units;
console.log("owner hedged revenue (1 GPU, with floor bought at ask+1% fee):");
const floorCost = put._q.ask * 1.01;
for (const p of [1.8, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0]) {
  const unh = hours * p, pay = model.payoffUsd(1, put._t.strike, put._t.cap, hours, p);
  console.log(" avg", p, "unhedged", unh.toFixed(2), "hedged", (unh + pay - floorCost).toFixed(2));
}
// collar: buy floor, sell cap (renter perspective is reverse; show owner collar)
const capBid = call._q.bid;
console.log("owner collar: buy floor ask", put._q.ask, "+fee", (put._q.ask * 0.01).toFixed(2), "sell cap bid", capBid, "net cost", (floorCost - capBid).toFixed(2), "collateral posted for cap leg", call._r.maxPayoff);

// ---- Example 3: vault caps ----
const dep = 10000, serBps = 2000, epBps = 5000;
const perPut = put._r.maxPayoff, perDig = 1;
console.log("EX3 vault", dep, "per-series cap $", dep * serBps / 1e4, "epoch cap $", dep * epBps / 1e4, "put contracts max", Math.floor(dep * serBps / 1e4 / perPut), "digitals max", Math.floor(dep * serBps / 1e4 / perDig));
console.log("vault price bounds on a $1 digital: buy at most", 0.95, "sell at least", 0.01, "on a put spread: buy at most", 0.95 * perPut, "sell at least", 0.01 * perPut);

// ---- ASCII payoff diagrams ----
function plot(fn, lo, hi, w = 41, h = 9, label) {
  const ys = []; for (let i = 0; i < w; i++) ys.push(fn(lo + (hi - lo) * i / (w - 1)));
  const mx = Math.max(...ys) || 1;
  const rows = [];
  for (let r2 = h - 1; r2 >= 0; r2--) {
    let line = "";
    for (let i = 0; i < w; i++) line += Math.round(ys[i] / mx * (h - 1)) === r2 ? "*" : (r2 === 0 ? "-" : " ");
    rows.push(line);
  }
  console.log(label + " (y max " + mx.toFixed(2) + ", x " + lo + " to " + hi + ")\n" + rows.join("\n"));
}
plot((s) => model.payoffUsd(2, strike, 1, 1, s), strike - 0.3, strike + 0.3, 41, 5, "digital");
plot((s) => model.payoffUsd(1, put._t.strike, put._t.cap, 1, s), put._t.strike - 0.8, put._t.strike + 0.4, 41, 6, "put spread per hour");
plot((s) => model.payoffUsd(0, call._t.strike, call._t.cap, 1, s), call._t.strike - 0.4, call._t.strike + 0.8, 41, 6, "call spread per hour");

// ---- backtest, as the model reports it ----
const all = { H100_SXM: pts, H200: load("H200"), B200: load("B200"), A100_SXM4: load("A100_SXM4") };
console.log("backtest", JSON.stringify(model.backtest(all)));
