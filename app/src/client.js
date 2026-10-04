// Hourly web client. Bundled by esbuild into public/app.js.
import { getWallets } from "@wallet-standard/app";
import nacl from "tweetnacl";
import bs58 from "bs58";

// ---------- tiny utils ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const b64 = (u8) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const usd = (n, dp = 2) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const cents = (p) => `${Math.round(p * 100)}¢`;
const pct = (p, dp = 0) => `${(p * 100).toFixed(dp)}%`;
const signed = (p) => `${p >= 0 ? "+" : "-"}${Math.abs(p * 100).toFixed(1)}%`;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayLabel = (d) => { const t = new Date(`${d}T00:00:00Z`); return `${DOW[t.getUTCDay()]} ${MON[t.getUTCMonth()]} ${t.getUTCDate()}`; };
const monthLabel = (d) => MONTH[new Date(`${d}T00:00:00Z`).getUTCMonth()];
function countdown(expiry) {
  const s = expiry - Date.now() / 1000;
  if (s <= 0) return "closed";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { /* private mode */ } },
};

async function api(path, body) {
  const res = await fetch(`api/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  let j = {};
  try { j = await res.json(); } catch (_) { /* empty */ }
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

// ---------- state ----------
const S = { index: [], markets: [], status: null, gpu: "H100_SXM", door: "predict", wallet: null, portfolio: null };
const chainId = () => (S.status && S.status.cluster === "devnet" ? "solana:devnet" : "solana:localnet");

// ---------- wallets ----------
const walletsApi = getWallets();
function standardWallets() {
  return walletsApi.get().filter((w) =>
    w.features["standard:connect"] && w.features["solana:signTransaction"] && (w.chains || []).some((c) => c.startsWith("solana:")));
}

function burnerWallet() {
  let sk = store.get("hourly.burner");
  if (!sk) { sk = b64(nacl.sign.keyPair().secretKey); store.set("hourly.burner", sk); }
  const secret = fromB64(sk);
  return {
    kind: "burner", name: "Burner wallet", icon: null,
    address: bs58.encode(secret.slice(32)),
    signMessage: (msg) => nacl.sign.detached(msg, secret),
    disconnect: async () => {},
  };
}

async function connectStandard(w, silent = false) {
  const { accounts } = await w.features["standard:connect"].connect(silent ? { silent: true } : undefined);
  const account = accounts && accounts[0];
  if (!account) throw new Error("No account was shared.");
  return {
    kind: "standard", name: w.name, icon: w.icon, address: account.address,
    signTx: async (bytes) => {
      const [out] = await w.features["solana:signTransaction"].signTransaction({ account, transaction: bytes, chain: chainId() });
      return out.signedTransaction;
    },
    disconnect: async () => { try { await w.features["standard:disconnect"]?.disconnect(); } catch (_) { /* ignore */ } },
  };
}

async function setWallet(w) {
  S.wallet = w;
  if (w) store.set("hourly.wallet", w.kind === "burner" ? "__burner__" : w.name); else store.del("hourly.wallet");
  renderNav();
  await refreshPortfolio();
}

async function restoreWallet() {
  const saved = store.get("hourly.wallet");
  if (!saved) return;
  if (saved === "__burner__") return setWallet(burnerWallet());
  const tryOne = async () => {
    const w = standardWallets().find((x) => x.name === saved);
    if (!w) return false;
    try { await setWallet(await connectStandard(w, true)); } catch (_) { /* needs a click */ }
    return true;
  };
  if (!(await tryOne())) walletsApi.on("register", () => { if (!S.wallet) tryOne(); });
}

async function signAndSubmit(prepared) {
  const w = S.wallet;
  if (!w) throw new Error("Connect a wallet first.");
  if (w.kind === "burner") {
    const sig = w.signMessage(fromB64(prepared.message));
    return api("submit", { id: prepared.id, signature: b64(sig) });
  }
  const signedBytes = await w.signTx(fromB64(prepared.tx));
  return api("submit", { id: prepared.id, tx: b64(signedBytes) });
}

// ---------- sheet ----------
const sheet = $("#sheet");
function openSheet(html) {
  $("#sheet-body").innerHTML = html;
  sheet.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeSheet() {
  sheet.hidden = true;
  document.body.style.overflow = "";
  ticket = null;
}
sheet.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });

function walletPicker(after) {
  const ws = standardWallets();
  const devnet = S.status && S.status.cluster === "devnet";
  const list = (devnet ? ws : []).map((w, i) => `<button class="wallet-btn" type="button" data-w="${i}"><img src="${esc(w.icon)}" alt="">${esc(w.name)}</button>`).join("");
  openSheet(`
    <h3 id="sheet-title">Connect a wallet</h3>
    <p class="lead">Hourly runs on Solana devnet with test USDC. The venue pays every network fee, so you need no SOL.</p>
    <div class="wallets">
      ${list}
      <button class="wallet-btn" type="button" data-burner><span class="burner-dot"></span>Burner wallet for this browser</button>
    </div>
    <p class="hint">${devnet
      ? (ws.length ? "Set your wallet to Devnet before signing. In Phantom: Settings, Developer Settings, Testnet Mode." : "No Solana wallet found. Install Phantom, Solflare or Backpack, or use a burner.")
      : "This is a local test network. Use the burner wallet."}</p>
    <p class="status" id="w-status"></p>`);
  $$("[data-w]").forEach((b) => b.addEventListener("click", async () => {
    const st = $("#w-status");
    st.className = "status"; st.textContent = "Waiting for your wallet.";
    try { await setWallet(await connectStandard(ws[Number(b.dataset.w)])); closeSheet(); if (after) after(); }
    catch (e) { st.className = "status err"; st.textContent = e.message || "Connection was declined."; }
  }));
  $("[data-burner]").addEventListener("click", async () => { await setWallet(burnerWallet()); closeSheet(); if (after) after(); });
}

function walletMenu() {
  const w = S.wallet;
  openSheet(`
    <h3 id="sheet-title">${esc(w.name)}</h3>
    <p class="lead mono">${esc(w.address)}</p>
    ${w.kind === "burner" ? '<p class="hint">This key lives only in this browser. Use it for testing, never for real funds.</p>' : ""}
    <button class="pill go" type="button" id="w-out">Disconnect</button>`);
  $("#w-out").addEventListener("click", async () => { await w.disconnect(); await setWallet(null); closeSheet(); });
}

// ---------- nav ----------
function renderNav() {
  const b = $("#connect");
  b.textContent = S.wallet ? `${S.wallet.address.slice(0, 4)}...${S.wallet.address.slice(-4)}` : "Connect";
}
$("#connect").addEventListener("click", () => (S.wallet ? walletMenu() : walletPicker()));

// ---------- hero ----------
function renderGpus() {
  $("#gpus").innerHTML = S.index.map((g) => `<button type="button" role="tab" data-g="${g.code}" class="${g.code === S.gpu ? "on" : ""}">${esc(g.label)}</button>`).join("");
  $$("#gpus button").forEach((b) => b.addEventListener("click", () => { S.gpu = b.dataset.g; renderHero(); }));
}

function renderHero() {
  renderGpus();
  const g = S.index.find((x) => x.code === S.gpu);
  if (!g) return;
  $("#big").innerHTML = `$${g.last.toFixed(2)}<small>per hour</small>`;
  $("#big-note").textContent = `${g.label} rental, ${dayLabel(g.lastDate)} print. ${signed(g.chg30)} in 30 days, ${signed(g.chg90)} in 90.`;
  drawCurve(g.history);
}

// Monotone cubic (Fritsch-Carlson): smooth, but never overshoots a real print.
function smoothPath(pts) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = [], dy = [], m = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); dy.push(pts[i + 1][1] - pts[i][1]); m.push(dy[i] / dx[i]); }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
  t.push(m[n - 2]);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + h * t[i]).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - h * t[i + 1]).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

function drawCurve(history) {
  const el = $("#curve");
  const W = 1000, H = 260, pad = 12;
  const vals = history.map((h) => h[1]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const pts = history.map((h, i) => [pad + (i / (history.length - 1)) * (W - 2 * pad), pad + (1 - (h[1] - lo) / span) * (H - 2 * pad - 20) + 10]);
  const line = smoothPath(pts);
  const area = `${line} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z`;
  const last = pts[pts.length - 1];
  el.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${history.length} daily prints">
      <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#97faf6" stop-opacity="0.45"/><stop offset="1" stop-color="#97faf6" stop-opacity="0"/></linearGradient></defs>
      <path d="${area}" fill="url(#fade)"/>
      <path d="${line}" fill="none" stroke="#16181a" stroke-width="1.4" vector-effect="non-scaling-stroke" stroke-linecap="round"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#16181a"/>
      <line id="cross" x1="0" x2="0" y1="0" y2="${H}" stroke="#d5dce2" stroke-width="1" vector-effect="non-scaling-stroke" opacity="0"/>
    </svg>
    <div class="tip" hidden></div>`;
  const svg = $("svg", el), tip = $(".tip", el), cross = $("#cross", el);
  const move = (clientX) => {
    const r = svg.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let i = Math.round(((x - pad) / (W - 2 * pad)) * (history.length - 1));
    i = Math.max(0, Math.min(history.length - 1, i));
    const p = pts[i];
    cross.setAttribute("x1", p[0]); cross.setAttribute("x2", p[0]); cross.setAttribute("opacity", 1);
    tip.hidden = false;
    tip.style.left = `${(p[0] / W) * r.width}px`;
    tip.style.top = `${(p[1] / H) * r.height}px`;
    tip.textContent = `${dayLabel(history[i][0])}  $${history[i][1].toFixed(2)}`;
  };
  svg.addEventListener("mousemove", (e) => move(e.clientX));
  svg.addEventListener("touchmove", (e) => move(e.touches[0].clientX), { passive: true });
  svg.addEventListener("mouseleave", () => { tip.hidden = true; cross.setAttribute("opacity", 0); });
}

// ---------- markets ----------
$$(".switch button[data-door]").forEach((b) => b.addEventListener("click", () => {
  S.door = b.dataset.door;
  $$(".switch button[data-door]").forEach((x) => x.classList.toggle("on", x === b));
  renderMarkets();
}));

function question(m) {
  return `Will the ${m.gpu} print above $${m.strike.toFixed(2)} on ${dayLabel(m.windowEnd)}?`;
}

const GPU_ORDER = ["H100_SXM", "H200", "B200", "A100_SXM4"];
const lastPrint = (code) => { const g = S.index.find((x) => x.code === code); return g ? g.last : null; };
const historyOf = (code) => { const g = S.index.find((x) => x.code === code); return g ? g.history : []; };

function renderMarkets() {
  if (S.door === "predict") renderPredict(); else renderHedge();
}

// ----- predict: one headline question, then a ladder grouped by GPU -----
function featuredMarket(live) {
  const h = live.filter((m) => m.underlying === "H100_SXM" && m.model);
  if (!h.length) return live.find((m) => m.model) || null;
  const minExp = Math.min(...h.map((m) => m.expiry));
  const soon = h.filter((m) => m.expiry === minExp);
  const last = lastPrint("H100_SXM") || 0;
  return soon.sort((a, b) => Math.abs(a.strike - last) - Math.abs(b.strike - last))[0];
}

function featureChart(m) {
  const hist = historyOf(m.underlying).slice(-21);
  if (hist.length < 2 || !m.model) return "";
  const W = 560, H = 240, padL = 8, padR = 64, padT = 16, padB = 28;
  const t0 = Date.parse(`${hist[0][0]}T00:00:00Z`);
  const tEnd = Date.parse(`${m.windowEnd}T00:00:00Z`);
  const span = Math.max(1, tEnd - t0);
  const vals = hist.map((p) => p[1]).concat([m.model.settleP10, m.model.settleP90, m.strike]);
  const lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.12 || 0.1;
  const y0 = lo - pad, y1 = hi + pad;
  const X = (d) => padL + ((Date.parse(`${d}T00:00:00Z`) - t0) / span) * (W - padL - padR);
  const Y = (v) => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);
  const pts = hist.map((p) => [X(p[0]), Y(p[1])]);
  const last = pts[pts.length - 1];
  const xe = X(m.windowEnd);
  const cone = `M${last[0]},${last[1]} L${xe},${Y(m.model.settleP90)} L${xe},${Y(m.model.settleP10)} Z`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Recent prints, strike and the model's 80% range">
    <path d="${cone}" fill="#97faf6" fill-opacity="0.45"/>
    <line x1="${padL}" x2="${W - padR}" y1="${Y(m.strike)}" y2="${Y(m.strike)}" stroke="#8d9ca9" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/>
    <text x="${W - padR + 8}" y="${Y(m.strike) + 4}" class="ax">$${m.strike.toFixed(2)}</text>
    <path d="${smoothPath(pts)}" fill="none" stroke="#16181a" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="#16181a"/>
    <line x1="${xe}" x2="${xe}" y1="${Y(m.model.settleP90)}" y2="${Y(m.model.settleP10)}" stroke="#16181a" stroke-width="1" vector-effect="non-scaling-stroke"/>
    <text x="${padL}" y="${H - 6}" class="ax">${dayLabel(hist[0][0])}</text>
    <text x="${xe}" y="${H - 6}" class="ax" text-anchor="middle">${dayLabel(m.windowEnd)}</text>
  </svg>`;
}

function chanceBar(p) {
  return `<span class="bar"><span style="width:${Math.max(2, Math.round(p * 100))}%"></span></span>`;
}

function renderPredict() {
  const list = $("#market-list");
  const live = S.markets.filter((m) => m.door === "predict" && m.status !== "settled");
  $("#door-note").textContent = "Yes or no on one day's price. A winning contract pays $1.";
  if (!live.length) { list.innerHTML = '<p class="empty">No open questions right now. New ones list every day.</p>'; return; }
  const f = featuredMarket(live);
  let html = "";
  if (f && f.model) {
    const noPrice = Math.max(0.01, 1 - f.model.bid);
    html += `<div class="feature">
      <div class="feature-text">
        <div class="label muted">Closes in ${countdown(f.expiry)}</div>
        <h3>${esc(question(f))}</h3>
        <div class="feature-num">${pct(f.model.probItm)}<small>chance, by the venue's model</small></div>
        <div class="feature-yn">
          <button class="pill big-pill" type="button" data-trade="${f.id}" data-side="yes">Yes ${cents(f.model.ask)}</button>
          <button class="pill big-pill" type="button" data-trade="${f.id}" data-side="no">No ${cents(noPrice)}</button>
        </div>
        <p class="feature-note">Last print $${(lastPrint(f.underlying) || 0).toFixed(2)}. The shaded cone is the model's 80% range for ${dayLabel(f.windowEnd)}.</p>
      </div>
      <div class="feature-chart">${featureChart(f)}</div>
    </div>`;
  }
  const rest = live.filter((m) => !f || m.id !== f.id);
  const groups = GPU_ORDER.map((code) => [code, rest.filter((m) => m.underlying === code)]).filter(([, ms]) => ms.length);
  html += `<div class="ladder">${groups.map(([code, ms]) => {
    const label = ms[0].gpu;
    const lp = lastPrint(code);
    return `<div class="ladder-group">
      <div class="ladder-head"><span>${esc(label)}</span><span class="muted">${lp ? `last $${lp.toFixed(2)}` : ""}</span></div>
      ${ms.sort((a, b) => a.expiry - b.expiry || a.strike - b.strike).map((m) => {
        if (!m.model) return `<div class="lrow"><div class="lq">${dayLabel(m.windowEnd)}<span class="muted">above $${m.strike.toFixed(2)}</span></div><div class="lsettle muted">Settling</div></div>`;
        const noPrice = Math.max(0.01, 1 - m.model.bid);
        return `<div class="lrow">
          <div class="lq">${dayLabel(m.windowEnd)}<span class="muted">above $${m.strike.toFixed(2)}</span></div>
          ${chanceBar(m.model.probItm)}
          <div class="lp">${pct(m.model.probItm)}</div>
          <button class="pill small py" type="button" data-trade="${m.id}" data-side="yes">Yes ${cents(m.model.ask)}</button>
          <button class="pill small pn" type="button" data-trade="${m.id}" data-side="no">No ${cents(noPrice)}</button>
        </div>`;
      }).join("")}
    </div>`;
  }).join("")}</div>`;
  list.innerHTML = html;
  $$("[data-trade]").forEach((b) => b.addEventListener("click", () => startPredict(b.dataset.trade, b.dataset.side)));
}

// ----- hedge: one builder -----
S.hedgeGpu = "H100_SXM";
S.hedgeRole = "own";
S.collar = false;

function hedgePair(code) {
  const live = S.markets.filter((m) => m.door === "hedge" && m.status === "open" && m.underlying === code && m.model);
  const put = live.find((m) => m.kind === "put"), call = live.find((m) => m.kind === "call");
  return put && call ? { put, call } : null;
}

function hedgeChart(pair, role, collar) {
  const { put, call } = pair;
  const d = (role === "own" ? put : call).model.dist;
  if (!d) return "";
  const today = lastPrint(put.underlying) || put.strike;
  const xlo = Math.min(d.lo, put.strike - put.cap * 1.3, today), xhi = Math.max(d.hi, call.strike + call.cap * 1.3, today);
  const W = 560, H = 240, padT = 22, padB = 30;
  const X = (v) => ((v - xlo) / (xhi - xlo)) * W;
  const base = H - padB;
  // model distribution of the month's average
  const bw = (d.hi - d.lo) / d.bins.length;
  const dens = d.bins.map((b, i) => [X(d.lo + (i + 0.5) * bw), base - b * (base - padT) * 0.9]);
  const densPath = `M${X(d.lo)},${base} ${dens.map((p) => `L${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ")} L${X(d.hi)},${base} Z`;
  // payoff per contract, scaled so the max payout sits near the top
  const maxPay = Math.max(put.maxPayoff, call.maxPayoff);
  const Yp = (v) => base - (v / maxPay) * (base - padT) * 0.85;
  const payAt = (s) => {
    let v = 0;
    if (role === "own") { v += Math.min(Math.max(put.strike - s, 0), put.cap) * put.units; if (collar) v -= Math.min(Math.max(s - call.strike, 0), call.cap) * call.units; }
    else v += Math.min(Math.max(s - call.strike, 0), call.cap) * call.units;
    return v;
  };
  const xs = [xlo, put.strike - put.cap, put.strike, call.strike, call.strike + call.cap, xhi].sort((a, b) => a - b);
  const pay = xs.map((s) => `${X(s).toFixed(1)},${Math.min(H - 4, Yp(payAt(s))).toFixed(1)}`).join(" L");
  const k = role === "own" ? put.strike : call.strike;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Payout against the month's average price, over the model's distribution">
    <path d="${densPath}" fill="#97faf6" fill-opacity="0.5"/>
    <line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#d5dce2" vector-effect="non-scaling-stroke"/>
    <path d="M${pay}" fill="none" stroke="#16181a" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <line x1="${X(today)}" x2="${X(today)}" y1="${padT - 8}" y2="${base}" stroke="#8d9ca9" stroke-dasharray="3 5" vector-effect="non-scaling-stroke"/>
    <text x="${X(today)}" y="${padT - 12}" class="ax" text-anchor="middle">today $${today.toFixed(2)}</text>
    <text x="${X(k)}" y="${H - 8}" class="ax" text-anchor="middle">$${k.toFixed(2)}</text>
    ${role === "own" && collar ? `<text x="${X(call.strike)}" y="${H - 8}" class="ax" text-anchor="middle">$${call.strike.toFixed(2)}</text>` : ""}
  </svg>`;
}

function renderHedge() {
  const list = $("#market-list");
  $("#door-note").textContent = "Floors and caps on a month's average rental price. One contract covers one GPU for every hour of the month and pays in USDC.";
  const codes = GPU_ORDER.filter((c) => hedgePair(c));
  if (!codes.length) { list.innerHTML = '<p class="empty">No hedges open right now.</p>'; return; }
  if (!codes.includes(S.hedgeGpu)) S.hedgeGpu = codes[0];
  const pair = hedgePair(S.hedgeGpu);
  const { put, call } = pair;
  const month = monthLabel(put.windowStart);
  const own = S.hedgeRole === "own";
  const pm = put.model, cm = call.model;
  let headline, price, priceNote, lines;
  if (own) {
    headline = `Floor your ${month} ${put.gpu} revenue at $${put.strike.toFixed(2)} an hour.`;
    if (S.collar) {
      price = usd(pm.ask - cm.bid);
      priceNote = `net per GPU-month: pay ${usd(pm.ask)} for the floor, receive ${usd(cm.bid)} for the $${call.strike.toFixed(2)} cap`;
      lines = [`Locks ${usd(call.maxPayoff, 0)} per contract until settlement.`, `Gives up revenue above $${call.strike.toFixed(2)} an hour, up to $${(call.strike + call.cap).toFixed(2)}.`];
    } else {
      price = usd(pm.ask);
      priceNote = `per GPU-month, ${put.units} hours of ${month}`;
      lines = [`Pays up to ${usd(put.maxPayoff, 0)} if ${month} averages $${(put.strike - put.cap).toFixed(2)} or less.`, `Model chance it pays: ${pct(pm.probItm)}.`];
    }
  } else {
    headline = `Cap your ${month} ${call.gpu} cost at $${call.strike.toFixed(2)} an hour.`;
    price = usd(cm.ask);
    priceNote = `per GPU-month, ${call.units} hours of ${month}`;
    lines = [`Pays up to ${usd(call.maxPayoff, 0)} if ${month} averages $${(call.strike + call.cap).toFixed(2)} or more.`, `Model chance it pays: ${pct(cm.probItm)}.`];
  }
  list.innerHTML = `
    <div class="builder-controls">
      <div class="gpus left" role="tablist" aria-label="GPU">${codes.map((c) => { const p = hedgePair(c); return `<button type="button" data-hg="${c}" class="${c === S.hedgeGpu ? "on" : ""}">${esc(p.put.gpu)}</button>`; }).join("")}</div>
      <div class="switch small-switch" role="tablist" aria-label="Role">
        <button type="button" data-role="own" class="${own ? "on" : ""}">I own GPUs</button>
        <button type="button" data-role="rent" class="${own ? "" : "on"}">I rent GPUs</button>
      </div>
    </div>
    <div class="builder">
      <div class="builder-text">
        <h3>${esc(headline)}</h3>
        <div class="feature-num">${price}<small>${esc(priceNote)}</small></div>
        ${lines.map((l) => `<p class="builder-line">${esc(l)}</p>`).join("")}
        ${own ? `<label class="toggle"><input type="checkbox" id="collar" ${S.collar ? "checked" : ""}><span>Pay for it by selling the $${call.strike.toFixed(2)} cap</span></label>` : ""}
        <button class="pill dark go-wide" type="button" id="hedge-go">${own ? `Protect ${month}` : `Cap ${month}`}</button>
      </div>
      <div class="builder-chart">${hedgeChart(pair, S.hedgeRole, own && S.collar)}<p class="feature-note">Line: payout per contract against ${month}'s average price. Shade: where the model expects that average to land.</p></div>
    </div>`;
  $$("[data-hg]").forEach((b) => b.addEventListener("click", () => { S.hedgeGpu = b.dataset.hg; renderHedge(); }));
  $$("[data-role]").forEach((b) => b.addEventListener("click", () => { S.hedgeRole = b.dataset.role; renderHedge(); }));
  const c = $("#collar");
  if (c) c.addEventListener("change", () => { S.collar = c.checked; renderHedge(); });
  $("#hedge-go").addEventListener("click", () => startHedge(own ? (S.collar ? "collar" : "floor") : "cap", put.id, call.id));
}

// ---------- ticket ----------
let ticket = null; // { title, lead, legs: [{id, side}], qty, maxQty, quote, explain(q) }

function startPredict(id, side) {
  const m = S.markets.find((x) => x.id === id);
  if (!m) return;
  const yes = side === "yes";
  ticket = {
    title: `${yes ? "Yes" : "No"}: ${question(m)}`,
    lead: yes
      ? "You buy contracts that pay $1 each if the print is above the strike."
      : "You write contracts against the market maker: you post $1 each and keep it if the print is at or below the strike.",
    legs: [{ id, side: yes ? "buy" : "sell" }], qty: 10, maxQty: 500,
    explain: (q) => {
      const n = q.legs[0].qty;
      return yes
        ? [["Price", `${cents(q.legs[0].price)} each`], ["You pay", usd(q.pay)], ["Pays if yes", usd(n)]]
        : [["You post", usd(q.lock)], ["You receive now", usd(q.receive)], ["Net cost", usd(q.lock - q.receive)], ["You get back if no", usd(n)]];
    },
  };
  ensureWallet(renderTicket);
}

function startHedge(kind, putId, callId) {
  const put = S.markets.find((x) => x.id === putId), call = S.markets.find((x) => x.id === callId);
  if (!put || !call) return;
  const month = monthLabel(put.windowStart);
  const cfg = {
    floor: { title: `${put.gpu} ${month} floor at $${put.strike.toFixed(2)}`, lead: `For GPU owners. If ${put.gpu} rents for less than $${put.strike.toFixed(2)} on average in ${month}, this pays the difference on ${put.units} hours, up to ${usd(put.maxPayoff, 0)} per contract.`, legs: [{ id: putId, side: "buy" }] },
    cap: { title: `${call.gpu} ${month} cap at $${call.strike.toFixed(2)}`, lead: `For GPU renters. If ${call.gpu} rents for more than $${call.strike.toFixed(2)} on average in ${month}, this pays the difference on ${call.units} hours, up to ${usd(call.maxPayoff, 0)} per contract.`, legs: [{ id: callId, side: "buy" }] },
    collar: { title: `${put.gpu} ${month} collar, $${put.strike.toFixed(2)} to $${call.strike.toFixed(2)}`, lead: `Buy the floor and pay for it by selling the cap, in one transaction. Your ${month} revenue is protected below $${put.strike.toFixed(2)} and you give up upside above $${call.strike.toFixed(2)}.`, legs: [{ id: putId, side: "buy" }, { id: callId, side: "sell" }] },
  }[kind];
  ticket = {
    ...cfg, qty: 1, maxQty: 50,
    explain: (q) => {
      const rows = [];
      for (const l of q.legs) rows.push([l.side === "buy" ? `Buy ${l.title.split(" (")[0]}` : `Sell ${l.title.split(" (")[0]}`, `${usd(l.price)} each`]);
      if (q.pay) rows.push(["You pay", usd(q.pay)]);
      if (q.receive) rows.push(["You receive", usd(q.receive)]);
      if (q.lock) rows.push(["Locked until settlement", usd(q.lock, 0)]);
      if (q.pay && q.receive) rows.push(["Net premium", usd(q.pay - q.receive)]);
      return rows;
    },
  };
  ensureWallet(renderTicket);
}

function ensureWallet(then) {
  if (S.wallet) return then();
  walletPicker(then);
}

let quoteTimer = null;
function renderTicket() {
  if (!ticket) return;
  openSheet(`
    <h3 id="sheet-title">${esc(ticket.title)}</h3>
    <p class="lead">${esc(ticket.lead)}</p>
    <div class="stepper">
      <button type="button" data-step="-1" aria-label="Fewer">-</button>
      <input id="qty" inputmode="numeric" value="${ticket.qty}" aria-label="Contracts">
      <button type="button" data-step="1" aria-label="More">+</button>
      <span class="label muted">contracts</span>
    </div>
    <div class="lines" id="lines"><div><span>Quote</span><span>Fetching</span></div></div>
    <button class="pill dark go" type="button" id="go" disabled>Sign in wallet</button>
    <p class="status" id="t-status"></p>`);
  const qty = $("#qty");
  const set = (n) => { ticket.qty = Math.max(1, Math.min(ticket.maxQty, n || 1)); qty.value = ticket.qty; requote(); };
  $$("[data-step]").forEach((b) => b.addEventListener("click", () => set(ticket.qty + Number(b.dataset.step))));
  qty.addEventListener("change", () => set(parseInt(qty.value, 10)));
  $("#go").addEventListener("click", execute);
  requote();
}

async function requote() {
  if (!ticket) return;
  clearTimeout(quoteTimer);
  const t = ticket;
  const go = $("#go"), st = $("#t-status");
  go.disabled = true;
  st.className = "status"; st.textContent = "";
  try {
    const q = await api("quote", { owner: S.wallet.address, legs: t.legs.map((l) => ({ series: l.id, side: l.side, qty: t.qty })) });
    if (ticket !== t) return;
    t.quote = q;
    t.quotedAt = Date.now();
    $("#lines").innerHTML = t.explain(q).map(([a, b], i, arr) => `<div class="${i === arr.length - 1 ? "strong" : ""}"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join("");
    go.disabled = false;
    // firm for 45 seconds on chain; refresh a little before
    quoteTimer = setTimeout(() => { if (ticket === t && !t.busy) requote(); }, 35_000);
  } catch (e) {
    if (ticket !== t) return;
    $("#lines").innerHTML = "";
    st.className = "status err";
    st.textContent = e.message;
    if (/faucet/i.test(e.message)) {
      st.innerHTML = `${esc(e.message)} <button class="pill small" type="button" id="t-faucet">Add test USDC</button>`;
      $("#t-faucet").addEventListener("click", async () => { await faucet(); requote(); });
    }
  }
}

async function execute() {
  const t = ticket;
  if (!t || !t.quote) return;
  if (Date.now() - t.quotedAt > 40_000) return requote();
  clearTimeout(quoteTimer);
  t.busy = true;
  const go = $("#go"), st = $("#t-status");
  go.disabled = true;
  st.className = "status";
  st.textContent = S.wallet.kind === "burner" ? "Signing." : "Approve the transaction in your wallet.";
  try {
    const r = await signAndSubmit(t.quote);
    st.innerHTML = r.url ? `Done. <a href="${esc(r.url)}" target="_blank" rel="noopener">View the transaction</a>` : "Done. Settled on the preview chain.";
    go.textContent = "Close";
    go.disabled = false;
    go.onclick = closeSheet;
    go.removeEventListener("click", execute);
    await Promise.all([refreshMarkets(), refreshPortfolio(), refreshStatus()]);
  } catch (e) {
    t.busy = false;
    st.className = "status err";
    st.textContent = e.message || "The wallet declined.";
    go.disabled = false;
  }
}

// ---------- portfolio ----------
async function faucet() {
  const st = $("#pf-status");
  if (st) { st.className = "status"; st.textContent = "Minting test USDC."; }
  try {
    const r = await api("faucet", { owner: S.wallet.address });
    if (st) st.innerHTML = `Added ${usd(r.amount, 0)} test USDC.${r.url ? ` <a href="${esc(r.url)}" target="_blank" rel="noopener">View</a>` : ""}`;
  } catch (e) {
    if (st) { st.className = "status err"; st.textContent = e.message; } else alert(e.message);
  }
  await refreshPortfolio();
}

function positionTitle(r) {
  if (r.door === "predict") return question(r);
  return `${r.gpu} ${monthLabel(r.windowStart)} ${r.kind === "put" ? "floor" : "cap"} at $${r.strike.toFixed(2)}`;
}

async function refreshPortfolio() {
  const body = $("#portfolio-body");
  if (!S.wallet) { S.portfolio = null; body.innerHTML = '<p class="empty">Connect a wallet to see your positions and claim test USDC.</p>'; return; }
  try { S.portfolio = await api(`portfolio?owner=${S.wallet.address}`); } catch (e) { body.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const p = S.portfolio;
  const rows = p.rows.map((r) => {
    const pos = [r.long ? `Long ${r.long}` : "", r.short ? `Short ${r.short}` : ""].filter(Boolean).join(", ");
    let value = "", act = "";
    if (r.status === "settled") {
      value = `Settled at $${r.settled.price.toFixed(4)}`;
      if (r.redeemable > 0 || r.long > 0) act += `<button class="pill small" type="button" data-act="redeem" data-s="${r.id}">Redeem ${usd(r.redeemable)}</button>`;
      if (r.short > 0) act += `<button class="pill small" type="button" data-act="reclaim" data-s="${r.id}">Reclaim ${usd(r.reclaimable)}</button>`;
    } else {
      const mark = r.markPerContract ?? 0;
      value = r.long ? usd(mark * r.long) : `${usd(-mark * r.short)}<div class="m">${usd(r.lockedCollateral, 0)} locked</div>`;
    }
    const when = r.status === "settled" ? "Settled" : r.status === "settling" ? "Settling now" : `Closes in ${countdown(r.expiry)}`;
    return `<div class="pf-row"><div><div class="t">${esc(positionTitle(r))}</div><div class="m">${when}</div></div><div>${pos}</div><div class="v">${value}</div><div class="act">${act}</div></div>`;
  }).join("");
  body.innerHTML = `
    <div class="pf-top">
      <div class="pf-bal">${usd(p.usdc)}<small>Test USDC in ${esc(S.wallet.name.toLowerCase())}</small></div>
      <button class="pill" type="button" id="pf-faucet">Add 10,000 test USDC</button>
    </div>
    <p class="status" id="pf-status"></p>
    ${p.rows.length ? `<div class="pf-row pf-head"><div>Market</div><div>Position</div><div class="v">Value</div><div class="act"></div></div>${rows}` : '<p class="empty">No positions yet. Pick a market above.</p>'}`;
  $("#pf-faucet").addEventListener("click", faucet);
  $$("[data-act]").forEach((b) => b.addEventListener("click", () => runAction(b.dataset.act, b.dataset.s, b)));
}

async function runAction(type, series, btn) {
  const st = $("#pf-status");
  btn.disabled = true;
  st.className = "status";
  st.textContent = S.wallet.kind === "burner" ? "Signing." : "Approve in your wallet.";
  try {
    const prepared = await api("action", { type, series, owner: S.wallet.address });
    const r = await signAndSubmit(prepared);
    st.innerHTML = r.url ? `Done. <a href="${esc(r.url)}" target="_blank" rel="noopener">View the transaction</a>` : "Done.";
    await refreshPortfolio();
  } catch (e) {
    st.className = "status err";
    st.textContent = e.message;
    btn.disabled = false;
  }
}

// ---------- settlement ----------
function renderSettlement() {
  const st = S.status;
  if (!st) return;
  const bt = st.backtest && st.backtest.result ? st.backtest.result.find((r) => r.horizonDays === 7) : null;
  const escrow = S.markets.filter((m) => m.status !== "settled").reduce((a, m) => a + m.openInterest * m.collateralPerContract, 0);
  const byOracle = S.markets.filter((m) => m.settled && m.settled.byOracle).length;
  const tiles = [
    [bt ? pct(bt.coverage) : "...", "of prints landed inside the model's 80% band, 7 days out"],
    [bt ? bt.brier.toFixed(3) : "...", `7-day Brier score on at-the-money calls. A coin scores ${bt ? bt.brierCoin.toFixed(3) : "0.250"}`],
    [usd(escrow, 0), "test USDC held in escrow"],
    [String(byOracle), "markets settled by oracle"],
  ];
  $("#tiles").innerHTML = tiles.map(([n, l]) => `<div class="tile"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div></div>`).join("");
  const settled = S.markets.filter((m) => m.settled).sort((a, b) => b.expiry - a.expiry).slice(0, 8);
  const fills = (st.fills || []).slice(0, 8);
  const titleOf = (id, fallback) => { const m = S.markets.find((x) => x.id === id); return m ? (m.door === "predict" ? question(m) : positionTitle(m)) : fallback; };
  $("#ledger").innerHTML = `
    <div><h3>Recent settlements</h3><ul>${settled.length ? settled.map((m) => `<li><span>${esc(titleOf(m.id, m.title))}</span><span>${(() => { const u = st.settlements.find((s) => s.series === m.id)?.url; return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">$${m.settled.price.toFixed(4)}</a>` : `$${m.settled.price.toFixed(4)}`; })()} ${m.settled.byOracle ? "oracle" : "backup"}</span></li>`).join("") : `<li><span>${st.cluster === "devnet" ? "The first markets settle after the next 4pm New York print." : "Oracle settlement runs on devnet. This preview chain trades but does not settle."}</span></li>`}</ul></div>
    <div><h3>Recent trades</h3><ul>${fills.length ? fills.map((f) => `<li><span>${esc(titleOf(f.series, f.title))}</span><span>${(() => { const t = `${f.side === "buy" ? "Bought" : "Sold"} ${f.qty} at ${f.price < 1 ? cents(f.price) : usd(f.price)}`; return f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${t}</a>` : t; })()}</span></li>`).join("") : "<li><span>No trades yet.</span></li>"}</ul></div>`;
  $("#footer-line").textContent = st.cluster === "devnet"
    ? "Solana devnet. Test USDC has no value. Not an offer or investment advice. Index data from Ornn, oracle by Switchboard."
    : "Preview on a private test chain while the devnet launch is pending. Test USDC has no value. Not an offer or investment advice. Index data from Ornn, oracle by Switchboard.";
  const link = (u, t) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t || ""));
  $("#footer-ids").innerHTML = `Program ${link(st.programUrl, st.programId)}<br>Test USDC ${link(st.quoteMintUrl, st.quoteMint)}<br>Switchboard queue ${esc(st.oracleQueue)}<br>Network ${esc(st.cluster === "devnet" ? "Solana devnet" : "private preview chain, devnet launch pending")}`;
}

// ---------- refresh loops ----------
async function refreshIndex() { try { S.index = await api("index"); renderHero(); } catch (_) { /* keep last */ } }
async function refreshMarkets() { try { S.markets = await api("markets"); renderMarkets(); renderSettlement(); } catch (e) { $("#market-list").innerHTML = `<p class="empty">${esc(e.message)}</p>`; } }
async function refreshStatus() { try { S.status = await api("status"); renderSettlement(); } catch (_) { /* keep last */ } }

// ---------- motion ----------
function reveal() {
  const els = $$(".section, .three > div, .tiles, .ledger");
  els.forEach((e) => e.classList.add("rise"));
  if (!("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
  const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }), { threshold: 0.08 });
  els.forEach((e) => io.observe(e));
}

(async function main() {
  reveal();
  await refreshStatus();
  await Promise.all([refreshIndex(), refreshMarkets()]);
  await restoreWallet();
  setInterval(refreshMarkets, 30_000);
  setInterval(refreshStatus, 60_000);
  setInterval(() => { if (S.wallet && !ticket) refreshPortfolio(); }, 20_000);
  setInterval(refreshIndex, 15 * 60_000);
})();
