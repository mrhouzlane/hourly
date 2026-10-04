// Pricing model for options on a GPU rental index.
//
// The index has two clocks, both measured on Ornn's own history:
//   fast: day-to-day noise that mean-reverts within days (AR(1) on log price)
//   slow: a level that drifts by regime (random walk on the 7-day mean)
// log S_t = L_t + u_t, with L a driftless-in-price random walk and u an AR(1).
// Contracts settle on the mean of daily prints over a window, so we simulate
// daily paths, average the window (using prints already observed), and take the
// expected payoff. No interest rate on devnet. This is a model price, not a
// market price: the maker quotes around it with a spread.
"use strict";

const PATHS = 20000;
// Raw two-factor estimates were too confident out of sample (an 80% band held
// about 62% of later prints). Scaling both volatilities by 1.5 restores about 80%
// at 3, 7 and 14 day horizons on Ornn's Jul to Oct 2026 history. backtest()
// recomputes that coverage live so the claim is never stale.
const VOL_SCALE = 1.5;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalPair(rand) {
  let u = 0;
  while (u === 0) u = rand();
  const v = rand();
  const r = Math.sqrt(-2 * Math.log(u));
  return [r * Math.cos(2 * Math.PI * v), r * Math.sin(2 * Math.PI * v)];
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function sd(a) {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / Math.max(1, a.length - 1));
}

// points: [{t, date, v}] sorted ascending, one per day
function calibrate(points, { volScale = VOL_SCALE } = {}) {
  const x = points.map((p) => Math.log(p.v));
  const n = x.length;
  if (n < 30) throw new Error("need at least 30 daily prints to calibrate");
  // slow level: 7-day trailing mean of log price
  const lvl = [];
  for (let i = 6; i < n; i++) lvl.push(mean(x.slice(i - 6, i + 1)));
  const lag = 14;
  const dl = [];
  for (let i = 0; i + lag < lvl.length; i++) dl.push(lvl[i + lag] - lvl[i]);
  const sigmaL = (sd(dl) / Math.sqrt(lag)) * volScale; // per day
  // fast part: deviation of log price from its trailing level
  const dev = [];
  for (let i = 6; i < n; i++) dev.push(x[i] - lvl[i - 6]);
  const d0 = dev.slice(0, -1), d1 = dev.slice(1);
  const m0 = mean(d0), m1 = mean(d1);
  let num = 0, den = 0;
  for (let i = 0; i < d0.length; i++) { num += (d0[i] - m0) * (d1[i] - m1); den += (d0[i] - m0) ** 2; }
  let b = den > 0 ? num / den : 0;
  b = Math.min(0.95, Math.max(0, b));
  const sigmaU = sd(dev) * volScale;
  const L0 = lvl[lvl.length - 1];
  const u0 = x[n - 1] - L0;
  return {
    sigmaL, b, sigmaU, L0, u0,
    halfLifeDays: b > 0 ? Math.log(0.5) / Math.log(b) : 0,
    annualLevelVol: sigmaL * Math.sqrt(365),
    last: points[n - 1],
    nPoints: n,
    volScale,
  };
}

const DAY = 86400000;

// Simulates the window mean. `dates` = window dates (YYYY-MM-DD). Prints already
// observed are used as-is; future dates are simulated from the last print.
function simulateWindow(cal, points, dates, { paths = PATHS, seed = 7 } = {}) {
  const byDate = new Map(points.map((p) => [p.date, p.v]));
  const lastDate = cal.last.date;
  const observed = [];
  const future = [];
  for (const d of dates) {
    if (d <= lastDate) { if (byDate.has(d)) observed.push(byDate.get(d)); }
    else future.push(d);
  }
  const obsSum = observed.reduce((a, v) => a + v, 0);
  const total = observed.length + future.length;
  if (!total) return { means: [], observed: 0, future: 0 };
  if (!future.length) {
    return { means: new Float64Array(paths).fill(obsSum / observed.length), observed: observed.length, future: 0 };
  }
  const t0 = Date.parse(`${lastDate}T00:00:00Z`);
  const stepIdx = future.map((d) => Math.round((Date.parse(`${d}T00:00:00Z`) - t0) / DAY));
  const horizon = stepIdx[stepIdx.length - 1];
  const want = new Set(stepIdx);
  const rand = mulberry32(seed);
  const eSd = cal.sigmaU * Math.sqrt(Math.max(0, 1 - cal.b * cal.b));
  const drift = -0.5 * cal.sigmaL * cal.sigmaL;
  const means = new Float64Array(paths);
  for (let p = 0; p < paths; p++) {
    let L = cal.L0, u = cal.u0, sum = obsSum;
    for (let k = 1; k <= horizon; k++) {
      const [z1, z2] = normalPair(rand);
      L += drift + cal.sigmaL * z1;
      u = cal.b * u + eSd * z2;
      if (want.has(k)) sum += Math.exp(L + u + 0); // print for that day
    }
    means[p] = sum / total;
  }
  return { means, observed: observed.length, future: future.length };
}

// Payoff per contract in USD, matching the program exactly (per-hour payoff x units).
function payoffUsd(kind, strike, cap, units, s) {
  if (kind === 0) return Math.min(Math.max(s - strike, 0), cap) * units;
  if (kind === 1) return Math.min(Math.max(strike - s, 0), cap) * units;
  return s > strike ? cap * units : 0;
}

function quantile(sorted, q) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

// series: { kind, strike, cap, units } in USD units (not atoms)
function priceSeries(cal, points, series, dates) {
  const sim = simulateWindow(cal, points, dates);
  const m = sim.means;
  let pay = 0, itm = 0;
  for (let i = 0; i < m.length; i++) {
    const v = payoffUsd(series.kind, series.strike, series.cap, series.units, m[i]);
    pay += v;
    if (v > 0) itm++;
  }
  const sorted = Float64Array.from(m).sort();
  return {
    fair: m.length ? pay / m.length : 0,
    probItm: m.length ? itm / m.length : 0,
    maxPayoff: series.cap * series.units,
    settle: {
      p10: quantile(sorted, 0.1), p50: quantile(sorted, 0.5), p90: quantile(sorted, 0.9),
    },
    observedPrints: sim.observed,
    futurePrints: sim.future,
  };
}

// The venue's maker quotes around model fair value: half a percent of the
// contract's max payoff plus 8% of fair value on each side.
function makerQuote(fair, maxPayoff) {
  const half = 0.005 * maxPayoff + 0.08 * fair;
  const round = (v) => Math.round(v * 100) / 100; // cents per contract
  let bid = round(Math.max(0, fair - half));
  let ask = round(Math.min(maxPayoff, fair + half));
  if (ask <= bid) ask = round(Math.min(maxPayoff, bid + 0.01));
  return { bid, ask, mid: round(fair) };
}

// Out-of-sample check: from each day, forecast the print h days later and count
// how often it lands inside the model's 80% band.
function backtest(seriesByCode, horizons = [3, 7, 14], minHistory = 40) {
  const out = [];
  for (const h of horizons) {
    let inside = 0, below = 0, above = 0, n = 0;
    for (const points of Object.values(seriesByCode)) {
      for (let i = minHistory; i + h < points.length; i++) {
        const hist = points.slice(0, i + 1);
        const c = calibrate(hist);
        const target = points[i + h];
        const r = priceSeries(c, hist, { kind: 2, strike: 0, cap: 1, units: 1 }, [target.date]);
        if (target.v < r.settle.p10) below++; else if (target.v > r.settle.p90) above++; else inside++;
        n++;
      }
    }
    out.push({ horizonDays: h, coverage: n ? inside / n : null, below: n ? below / n : null, above: n ? above / n : null, n });
  }
  return out;
}

module.exports = { VOL_SCALE, backtest, calibrate, simulateWindow, priceSeries, payoffUsd, makerQuote, mulberry32 };
