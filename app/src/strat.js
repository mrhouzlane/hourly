// Rule backtest on the daily Ornn print. Moves in the index only: no premium, fee or fill is modelled.
export const PRESETS = [
  { id: "dip", name: "Buy the dip", text: (r) => `When ${r.label} falls ${r.pct}% in ${r.lb} days, bet Higher for ${r.hold} days`, rule: { trig: "drop", lb: 7, pct: 5, side: "higher", hold: 7 } },
  { id: "run", name: "Cap the run-up", text: (r) => `When ${r.label} rises ${r.pct}% in ${r.lb} days, lock my bill with Higher for ${r.hold} days`, rule: { trig: "rise", lb: 7, pct: 5, side: "higher", hold: 7 } },
  { id: "fade", name: "Fade the spike", text: (r) => `When ${r.label} rises ${r.pct}% in ${r.lb} days, bet Lower for ${r.hold} days`, rule: { trig: "rise", lb: 7, pct: 5, side: "lower", hold: 7 } },
];
const fires = (v, i, r) => {
  if (i < r.lb) return false;
  const x = v[i] / v[i - r.lb] - 1;
  return r.trig === "drop" ? x <= -r.pct / 100 : x >= r.pct / 100;
};
export function firesNow(hist, r) { const v = hist.map((p) => p[1]); return fires(v, v.length - 1, r); }
export function backtest(hist, r, split = 60) {
  const v = hist.map((p) => p[1]), n = v.length;
  const all = [], base = [];
  for (let i = r.lb; i + r.hold < n; i++) {
    const m = v[i + r.hold] / v[i] - 1, win = r.side === "higher" ? m > 0 : m <= 0;
    base.push(win);
    if (fires(v, i, r)) { all.push({ i, m, win }); i += r.hold; }
  }
  const sum = (a) => ({ n: a.length, hit: a.length ? a.filter((x) => x.win).length / a.length : null, avg: a.length ? a.reduce((s, x) => s + x.m, 0) / a.length : null });
  const train = all.filter((x) => x.i < split), test = all.filter((x) => x.i >= split);
  const bh = base.length ? base.filter(Boolean).length / base.length : null;
  const T = test.length;
  let verdict = "thin";
  if (all.length >= 5 && T >= 3) verdict = test.filter((x) => x.win).length / T >= 0.5 && sum(train).hit >= 0.5 ? "held" : "failed";
  return { days: n, all: sum(all), train: sum(train), test: sum(test), base: bh, verdict };
}
export const ruleText = (r, label) => PRESETS.find((p) => p.id === r.id).text({ ...r, label });
export const encode = (s) => [s.id, s.gpu, s.lb, s.pct, s.hold].join(".");
export function decode(str) {
  const [id, gpu, lb, pct, hold] = String(str || "").split(".");
  const p = PRESETS.find((x) => x.id === id); if (!p || !gpu) return null;
  const n = (x, d, lo, hi) => { const k = Number(x); return Number.isFinite(k) ? Math.min(hi, Math.max(lo, k)) : d; };
  return { id, gpu, ...p.rule, lb: n(lb, 7, 2, 30), pct: n(pct, 5, 1, 30), hold: n(hold, 7, 1, 14) };
}
