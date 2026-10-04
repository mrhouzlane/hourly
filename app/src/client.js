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
$$(".switch button").forEach((b) => b.addEventListener("click", () => {
  S.door = b.dataset.door;
  $$(".switch button").forEach((x) => x.classList.toggle("on", x === b));
  renderMarkets();
}));

function question(m) {
  return `Will the ${m.gpu} print above $${m.strike.toFixed(2)} on ${dayLabel(m.windowEnd)}?`;
}

function renderMarkets() {
  const list = $("#market-list");
  const live = S.markets.filter((m) => m.door === S.door && m.status !== "settled");
  if (S.door === "predict") {
    $("#door-note").textContent = "Yes or no on a single day's price. A winning contract pays $1. Prices come from the venue's market maker and move with the index.";
    if (!live.length) { list.innerHTML = '<p class="empty">No open questions right now. New ones list every day.</p>'; return; }
    list.innerHTML = live.map((m) => {
      const md = m.model;
      if (!md) return `<div class="row"><div><div class="q">${esc(question(m))}</div><div class="q-meta">Settling. The oracle reads the print after 4pm New York.</div></div></div>`;
      const noPrice = Math.max(0.01, 1 - md.bid);
      return `<div class="row">
        <div><div class="q">${esc(question(m))}</div><div class="q-meta">Closes in ${countdown(m.expiry)}.${m.openInterest ? ` ${m.openInterest.toLocaleString()} contracts open.` : ""}</div></div>
        <div class="yn">
          <div class="chance">${pct(md.probItm)}<small>model</small></div>
          <button class="pill" type="button" data-trade="${m.id}" data-side="yes">Yes<b>${cents(md.ask)}</b></button>
          <button class="pill" type="button" data-trade="${m.id}" data-side="no">No<b>${cents(noPrice)}</b></button>
        </div>
      </div>`;
    }).join("");
  } else {
    $("#door-note").textContent = "Floors and caps on a month's average rental price. One contract covers one GPU for every hour of the month, like the exchange-listed futures, and pays in USDC.";
    const byGpu = {};
    for (const m of live) (byGpu[m.underlying] = byGpu[m.underlying] || {})[m.kind] = m;
    const order = ["H100_SXM", "H200", "B200", "A100_SXM4"];
    const blocks = order.filter((c) => byGpu[c] && byGpu[c].put && byGpu[c].call).map((c) => hedgeBlock(byGpu[c].put, byGpu[c].call));
    list.innerHTML = blocks.length
      ? `<div class="hedge-grid">${blocks.join("")}</div><p class="fine">Floors and caps are spreads: each pays at most its width times the hours in the month, so every contract is fully backed by USDC in escrow. Selling a cap locks that maximum until settlement.</p>`
      : '<p class="empty">No hedges open right now.</p>';
  }
  $$("[data-trade]").forEach((b) => b.addEventListener("click", () => startPredict(b.dataset.trade, b.dataset.side)));
  $$("[data-hedge]").forEach((b) => b.addEventListener("click", () => startHedge(b.dataset.hedge, b.dataset.put, b.dataset.call)));
}

function payoffSvg(put, call) {
  const lo = put.strike - put.cap * 1.6, hi = call.strike + call.cap * 1.6;
  const W = 400, H = 64;
  const x = (s) => ((s - lo) / (hi - lo)) * W;
  const maxP = Math.max(put.cap, call.cap);
  const y = (v) => H - 6 - (v / maxP) * (H - 14);
  const putPts = [[lo, put.cap], [put.strike - put.cap, put.cap], [put.strike, 0], [hi, 0]];
  const callPts = [[lo, 0], [call.strike, 0], [call.strike + call.cap, call.cap], [hi, call.cap]];
  const d = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <line x1="0" x2="${W}" y1="${H - 6}" y2="${H - 6}" stroke="#d5dce2" vector-effect="non-scaling-stroke"/>
    <path d="${d(putPts)}" fill="none" stroke="#16181a" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
    <path d="${d(callPts)}" fill="none" stroke="#8d9ca9" stroke-width="1.4" vector-effect="non-scaling-stroke"/>
  </svg>`;
}

function hedgeBlock(put, call) {
  const hours = put.units;
  const pm = put.model, cm = call.model;
  if (!pm || !cm) return "";
  return `<div class="hedge">
    <div class="hedge-head"><h3>${esc(put.gpu)}</h3><span>${monthLabel(put.windowStart)} average, ${hours} GPU-hours</span></div>
    <div class="legs">
      <div class="leg"><div class="label">Floor $${put.strike.toFixed(2)}</div><div class="num">${usd(pm.ask)}</div><div class="small">Pays up to ${usd(put.maxPayoff, 0)} if the month averages $${(put.strike - put.cap).toFixed(2)} or less.</div></div>
      <div class="leg"><div class="label">Cap $${call.strike.toFixed(2)}</div><div class="num">${usd(cm.ask)}</div><div class="small">Pays up to ${usd(call.maxPayoff, 0)} if the month averages $${(call.strike + call.cap).toFixed(2)} or more.</div></div>
    </div>
    <div class="payoff">${payoffSvg(put, call)}</div>
    <div class="actions">
      <button class="pill small" type="button" data-hedge="floor" data-put="${put.id}" data-call="${call.id}">I own GPUs: buy the floor</button>
      <button class="pill small" type="button" data-hedge="cap" data-put="${put.id}" data-call="${call.id}">I rent GPUs: buy the cap</button>
      <button class="pill small" type="button" data-hedge="collar" data-put="${put.id}" data-call="${call.id}">Collar</button>
    </div>
  </div>`;
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
