// Home: a live index tape. One dense surface (the tape), everything else sparse.

const LAYERS = [
  ["01", "Price", "Built", "One daily price for what a chip earns per hour. Public index, oracle network, checked on chain."],
  ["02", "Hedge", "Built", "Floors for owners, caps for renters, collars, executed at a firm quote. Fully backed in escrow. No margin calls."],
  ["03", "Credit", "Next", "Lend against chips with the floor attached. Protected by the hedge, no liquidations."],
  ["04", "Benchmark", "Next", "Lenders, contracts and companies point at the same price. Earned, never declared."],
];
const FLOW = ["Request quote", "Execute", "Oracle signs", "Escrow pays"];

const spark = (h, w = 220, ht = 44) => {
  const v = h.map((x) => x[1]), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const pts = v.map((y, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(ht - 3 - ((y - lo) / r) * (ht - 6)).toFixed(1)}`);
  const last = pts[pts.length - 1].split(",");
  return `<svg viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" class="sp"><polyline points="${pts.join(" ")}" fill="none" stroke="#11120f" stroke-width="1.5" vector-effect="non-scaling-stroke"/><circle cx="${last[0]}" cy="${last[1]}" r="3" fill="#11120f"/></svg>`;
};
const sgn = (x) => (x == null ? "n/a" : `${x >= 0 ? "+" : "-"}${Math.abs(x * 100).toFixed(1)}%`);
const ORDER = ["H100_SXM", "H200", "B200", "A100_SXM4"];

export function homeView(index = []) {
  const rows = ORDER.map((c) => index.find((x) => x.code === c)).filter(Boolean);
  const tape = rows.length
    ? rows.map((r) => `<button class="trow" data-go="desk"><span class="tkr">${r.label}<small>$/GPU-hr</small></span><span class="tpx">${r.last.toFixed(2)}</span><span class="tch ${r.chg7 >= 0 ? "u" : "d"}">${sgn(r.chg7)}<small>7d</small></span><span class="tch ${r.chg30 >= 0 ? "u" : "d"}">${sgn(r.chg30)}<small>30d</small></span><span class="tsp">${spark(r.history)}</span><span class="tdt">${r.lastDate}</span></button>`).join("")
    : `<div class="trow"><span class="tkr">Index unavailable</span></div>`;
  return `<div class="home hft">
  <section class="hx">
    <div class="hxl"><span>Ornn OCPI · Solana · USDC</span><span class="lv"><i></i>UTC <b id="utc">--:--:--</b></span></div>
    <h1>The execution desk<br>for <em>AI compute.</em></h1>
    <p class="hsub">Hedge GPU-hour price risk. Request a firm price, execute by signature, settle on the oracle print. Every contract fully backed in USDC on Solana.</p>
    <div class="hcta2"><button class="lp" data-go="desk">Open the desk <i>↗</i></button></div>
  </section>
  <section class="tape"><div class="thead"><span>Ornn OCPI daily index</span><span>last / chg / 90d</span><span>${rows.length} series</span></div>${tape}</section>
  <section class="hflow">${FLOW.map((t, i) => `<div><b>${String(i + 1).padStart(2, "0")}</b>${t}</div>`).join("")}</section>
  <section class="hlay">${LAYERS.map(([n, t, s, d]) => `<article class="${s.toLowerCase()}"><b>${n}</b><h3>${t}</h3><span>${s}</span><p>${d}</p></article>`).join("")}</section>
  <section class="hfin"><button class="lp" data-go="desk">Open the desk <i>↗</i></button><small>Test money only. Not investment advice.</small></section>
  </div>`;
}

export function bindHome(go) {
  document.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  const u = document.getElementById("utc");
  const tick = () => { const el = document.getElementById("utc"); if (!el) return clearInterval(id); el.textContent = new Date().toISOString().slice(11, 19); };
  const id = setInterval(tick, 1000); tick();
}
