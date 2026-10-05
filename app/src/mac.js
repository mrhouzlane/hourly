// Hourly, System 7 edition. One decision per screen; the chart shows your
// level and your date as you pick them. Bundled by esbuild into public/mac.js.
import { getWallets } from "@wallet-standard/app";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { createSolanaClient } from "@metamask/connect-solana";

// ---------- utils ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const b64 = (u8) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const usd = (n, dp = 2) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const cents = (p) => `${Math.round(p * 100)}¢`;
const pct = (p) => `${Math.round(p * 100)}%`;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const day = (d) => { const t = new Date(`${d}T00:00:00Z`); return `${DOW[t.getUTCDay()]} ${MON[t.getUTCMonth()]} ${t.getUTCDate()}`; };
const monthOf = (d) => MONTH[new Date(`${d}T00:00:00Z`).getUTCMonth()];
function countdown(t) {
  const s = t - Date.now() / 1000;
  if (s <= 0) return "closed";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${Math.max(1, m)}m`;
}
function ago(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
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
const S = {
  status: null, index: [], markets: [], vaults: [], activity: null, portfolio: null, wallet: null,
  view: "trade",
  t: { step: 1, gpu: "H100_SXM", side: null, strike: null, seriesId: null, amount: 10, quote: null, hl: 0 },
  hedge: { gpu: "H100_SXM", role: "own", collar: false },
  feedWin: "24h",
};
const GPU_ORDER = ["H100_SXM", "H200", "B200", "A100_SXM4"];
const gpuLabel = (c) => (S.index.find((g) => g.code === c) || {}).label || c;
const lastPrint = (c) => (S.index.find((g) => g.code === c) || {}).last;

// ---------- wallets (Wallet Standard: Phantom, Solflare, Backpack, MetaMask) ----------
const walletsApi = getWallets();
const chainId = () => (S.status && S.status.walletChain) || "solana:localnet";
const externalWalletsAllowed = () => !!(S.status && S.status.walletChain);
function standardWallets() {
  return walletsApi.get().filter((w) => w.features["standard:connect"] && w.features["solana:signTransaction"] && (w.chains || []).some((c) => c.startsWith("solana:")));
}
async function registerMetaMask() {
  const net = S.status && S.status.cluster;
  if (!["devnet", "mainnet"].includes(net)) return;
  try {
    await createSolanaClient({
      dapp: { name: "Hourly", url: location.origin },
      api: { supportedNetworks: { [net]: net === "mainnet" ? "https://api.mainnet-beta.solana.com" : "https://api.devnet.solana.com" } },
      analytics: { enabled: false },
    });
  } catch (_) { /* MetaMask absent */ }
}
function burnerWallet() {
  let sk = store.get("hourly.burner");
  if (!sk) { sk = b64(nacl.sign.keyPair().secretKey); store.set("hourly.burner", sk); }
  const secret = fromB64(sk);
  return { kind: "burner", name: "Burner", address: bs58.encode(secret.slice(32)), signMessage: (m) => nacl.sign.detached(m, secret), disconnect: async () => {} };
}
async function connectStandard(w, silent = false) {
  const { accounts } = await w.features["standard:connect"].connect(silent ? { silent: true } : undefined);
  const account = accounts && accounts[0];
  if (!account) throw new Error("No account was shared.");
  return {
    kind: "standard", name: w.name, icon: w.icon, address: account.address,
    signTx: async (bytes) => (await w.features["solana:signTransaction"].signTransaction({ account, transaction: bytes, chain: chainId() }))[0].signedTransaction,
    disconnect: async () => { try { await w.features["standard:disconnect"]?.disconnect(); } catch (_) { /* ignore */ } },
  };
}
async function setWallet(w) {
  S.wallet = w;
  if (w) store.set("hourly.wallet", w.kind === "burner" ? "__burner__" : w.name); else store.del("hourly.wallet");
  renderMenu();
  await refreshPortfolio();
  if (S.view === "portfolio") render();
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
  document.body.classList.add("busy");
  try {
    if (w.kind === "burner") return await api("submit", { id: prepared.id, signature: b64(w.signMessage(fromB64(prepared.message))) });
    return await api("submit", { id: prepared.id, tx: b64(await w.signTx(fromB64(prepared.tx))) });
  } finally { document.body.classList.remove("busy"); }
}

// ---------- dialogs ----------
function dialog(html, onMount) {
  const m = document.createElement("div");
  m.className = "modal";
  m.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><div class="in">${html}</div></div>`;
  document.body.appendChild(m);
  const close = () => m.remove();
  m.addEventListener("click", (e) => { if (e.target === m || e.target.closest("[data-close]")) close(); });
  const onKey = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  if (onMount) onMount(m, close);
  return close;
}
function alertBox(icon, title, text, link) {
  dialog(`<div class="icon">${icon}</div><b>${esc(title)}</b><p>${text}</p>${link ? `<p><a href="${esc(link)}" target="_blank" rel="noopener">View the transaction</a></p>` : ""}<div class="actions"><button class="btn default" data-close>OK</button></div>`);
}
function walletPicker(after) {
  const ws = externalWalletsAllowed() ? standardWallets() : [];
  const main = S.status && S.status.cluster === "mainnet";
  dialog(`<div class="icon">◆</div><b>Connect a wallet</b>
    <p class="small">The venue pays every network fee. You only sign.</p>
    <div class="wallets">
      ${ws.map((w, i) => `<button class="wallet" data-w="${i}"><img src="${esc(w.icon)}" alt="">${esc(w.name)}</button>`).join("")}
      ${main ? "" : '<button class="wallet" data-burner><span class="av" style="width:22px;height:22px"></span>Burner wallet (test only)</button>'}
    </div>
    <p class="small">${externalWalletsAllowed() ? (ws.length ? "Phantom, Solflare, Backpack and MetaMask work here." : "No Solana wallet found. Install Phantom, Solflare, Backpack or MetaMask.") : "This preview runs on a private test chain. Use the burner wallet."}</p>
    <p class="status small" id="w-st"></p>
    <div class="actions"><button class="btn" data-close>Cancel</button></div>`,
  (m, close) => {
    $$("[data-w]", m).forEach((b) => b.addEventListener("click", async () => {
      $("#w-st", m).textContent = "Waiting for your wallet.";
      try { await setWallet(await connectStandard(ws[Number(b.dataset.w)])); close(); if (after) after(); }
      catch (e) { $("#w-st", m).textContent = e.message || "Declined."; }
    }));
    const bb = $("[data-burner]", m);
    if (bb) bb.addEventListener("click", async () => { await setWallet(burnerWallet()); close(); if (after) after(); });
  });
}
function ensureWallet(then) { if (S.wallet) return then(); walletPicker(then); }

// sliding pill under the active tab, kept across re-renders so it glides
const PILLS = {};
function slidePill(box, key) {
  const on = box && box.querySelector(".on");
  if (!on) return;
  const pill = document.createElement("span");
  pill.className = "pill";
  box.prepend(pill);
  const to = { x: on.offsetLeft, y: on.offsetTop, w: on.offsetWidth, h: on.offsetHeight };
  const from = PILLS[key] || to;
  PILLS[key] = to;
  const set = (v) => { pill.style.width = `${v.w}px`; pill.style.height = `${v.h}px`; pill.style.transform = `translate(${v.x}px,${v.y}px)`; };
  pill.style.transition = "none"; set(from);
  requestAnimationFrame(() => requestAnimationFrame(() => { pill.style.transition = ""; set(to); }));
}

// ---------- menu bar ----------
function renderMenu() {
  const g = S.index.find((x) => x.code === "H100_SXM");
  $("#menubar").innerHTML = `
    <button data-view="about" title="About Hourly"><img class="logo" src="mark.svg" alt=""></button>
    ${[["trade", "Trade"], ["chain", "Chain"], ["hedge", "Hedge"], ["earn", "Earn"], ["activity", "Activity"], ["portfolio", "Portfolio"]]
      .map(([k, t]) => `<button data-view="${k}" class="${S.view === k ? "on" : ""}">${t}</button>`).join("")}
    <span class="spacer"></span>
    <span class="ticker">${g ? `H100 <b>$${g.last.toFixed(2)}</b>/hr` : ""}</span>
    <button id="wallet-btn">${S.wallet ? `${S.wallet.address.slice(0, 4)}…${S.wallet.address.slice(-4)}` : "Connect"}</button>`;
  slidePill($("#menubar"), "menu");
  $$("#menubar [data-view]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.view === "about") return aboutBox();
    S.view = b.dataset.view; renderMenu(); render();
  }));
  $("#wallet-btn").addEventListener("click", () => {
    if (!S.wallet) return walletPicker();
    dialog(`<div class="icon">◆</div><b>${esc(S.wallet.name)}</b><p class="mono">${esc(S.wallet.address)}</p>
      <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn default" id="dc">Disconnect</button></div>`,
    (m, close) => $("#dc", m).addEventListener("click", async () => { await S.wallet.disconnect(); await setWallet(null); close(); }));
  });
}

function windowShell(title, body) {
  return `<section class="window"><div class="titlebar"><span class="sq"><button class="closebox" aria-label="Close" data-home></button><i></i><i></i></span><span class="tt">HOURLY / ${esc(title).toUpperCase()}</span><span class="ar">↗</span></div>${body}</section>`;
}

// ---------- classic zoom rectangles (Finder open/close motion) ----------
function zoom(fromEl, toEl) {
  if (!fromEl || !toEl || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  const N = 6;
  for (let i = 1; i <= N; i++) {
    const r = document.createElement("div");
    r.className = "zoomrect";
    const f = i / N;
    Object.assign(r.style, {
      left: `${a.left + (b.left - a.left) * f}px`, top: `${a.top + (b.top - a.top) * f}px`,
      width: `${a.width + (b.width - a.width) * f}px`, height: `${a.height + (b.height - a.height) * f}px`,
      opacity: "0",
    });
    document.body.appendChild(r);
    setTimeout(() => { r.style.opacity = "1"; }, i * 28);
    setTimeout(() => r.remove(), i * 28 + 90);
  }
}

// ---------- trade wizard ----------
const predict = () => S.markets.filter((m) => m.door === "predict" && m.status === "open" && m.model);
const sideUnit = (m, side) => (side === "higher" ? m.model.ask : Math.max(0.01, 1 - m.model.bid));
const sideChance = (m, side) => (side === "higher" ? m.model.probItm : 1 - m.model.probItm);
function levelsFor(gpu) {
  const ms = predict().filter((m) => m.underlying === gpu);
  return [...new Set(ms.map((m) => m.strike))].sort((a, b) => a - b);
}
function datesFor(gpu, strike) {
  return predict().filter((m) => m.underlying === gpu && m.strike === strike).sort((a, b) => a.expiry - b.expiry);
}
function seriesNear(gpu, strike) {
  // the soonest market at this level, used for the chance shown on the level step
  return datesFor(gpu, strike)[0] || null;
}
const STEP_NAMES = ["Side", "Level", "Date", "Amount", "Review"];

function tradeView() {
  const t = S.t;
  const steps = STEP_NAMES.map((n, i) => {
    const k = i + 1;
    const reachable = k <= t.step || (k === 2 && t.side) || (k === 3 && t.strike !== null) || (k === 4 && t.seriesId) || (k === 5 && t.seriesId && t.amount > 0);
    return `<button data-step="${k}" class="${k === t.step ? "on" : k < t.step ? "done" : ""}" ${reachable ? "" : "disabled"}><i>${k < t.step ? "✓" : k}</i>${n}</button>`;
  }).join("");
  return windowShell("New Trade", `
    <div class="steps">${steps}</div>
    <div class="wizard">
      <div class="panel"><div id="step" class="enter ${t.dir === "back" ? "back" : ""}">${stepHtml()}</div></div>
      <div class="chartpane">
        <div class="quote"><span>${esc(gpuLabel(t.gpu))} rental, per hour</span><span class="px">${lastPrint(t.gpu) ? `$${lastPrint(t.gpu).toFixed(2)}` : ""}</span></div>
        <div class="chart" id="chart">${chartSvg()}</div>
        <div class="small muted">${chartCaption()}</div>
      </div>
    </div>
    <div class="hint"><span><kbd>↑</kbd> <kbd>↓</kbd> choose</span><span><kbd>Enter</kbd> pick</span><span><kbd>Esc</kbd> back</span><span class="spacer"></span><span>Settled by oracle on Ornn's 4pm New York print</span></div>`);
}

function optionsList() {
  const t = S.t;
  if (t.step === 1) return [{ key: "higher" }, { key: "lower" }];
  if (t.step === 2) return levelsFor(t.gpu).map((k) => ({ key: k }));
  if (t.step === 3) return datesFor(t.gpu, t.strike).map((m) => ({ key: m.id }));
  return [];
}

function stepHtml() {
  const t = S.t, g = gpuLabel(t.gpu);
  if (t.step === 1) {
    const sides = [
      { key: "higher", glyph: "▲", t: `${g} rents higher`, s: "than a price you pick, on a day you pick" },
      { key: "lower", glyph: "▼", t: `${g} rents lower`, s: "than a price you pick, on a day you pick" },
    ];
    return `<h2>Pick your side</h2>
      <div class="seg gpu-pick">${GPU_ORDER.filter((c) => levelsFor(c).length).map((c) => `<button data-gpu="${c}" class="${c === t.gpu ? "on" : ""}">${esc(gpuLabel(c))}</button>`).join("")}</div>
      <div class="options">${sides.map((o, i) => `<button class="opt ${i === t.hl ? "hl" : ""}" data-opt="${o.key}"><span class="glyph">${o.glyph}</span><span><div class="t">${esc(o.t)}</div><div class="s">${o.s}</div></span><span></span></button>`).join("")}</div>`;
  }
  if (t.step === 2) {
    const ks = levelsFor(t.gpu);
    return `<h2>Pick your level</h2><p class="lead small">${g} last printed $${(lastPrint(t.gpu) || 0).toFixed(2)}. You win if it ends ${t.side === "higher" ? "above" : "at or below"} your level.</p>
      <div class="options">${ks.map((k, i) => {
        const m = seriesNear(t.gpu, k);
        const ch = m ? sideChance(m, t.side) : 0;
        return `<button class="opt ${i === t.hl ? "hl" : ""}" data-opt="${k}"><span class="glyph">$</span><span><div class="t">${t.side === "higher" ? "Above" : "At or below"} $${k.toFixed(2)}</div><div class="s">${pct(ch)} chance on ${m ? day(m.windowEnd) : ""}<span class="bar1"><span style="width:${Math.round(ch * 100)}%"></span></span></div></span><span class="r">${m ? cents(sideUnit(m, t.side)) : ""}<small>per $1</small></span></button>`;
      }).join("")}</div>`;
  }
  if (t.step === 3) {
    const ms = datesFor(t.gpu, t.strike);
    return `<h2>Pick your date</h2><p class="lead small">The 4pm New York print on that day decides it.</p>
      <div class="options">${ms.map((m, i) => `<button class="opt ${i === t.hl ? "hl" : ""}" data-opt="${m.id}"><span class="glyph">◷</span><span><div class="t">${day(m.windowEnd)}</div><div class="s">${pct(sideChance(m, t.side))} chance · trading closes in ${countdown(m.tradingEnd)}</div></span><span class="r">${cents(sideUnit(m, t.side))}<small>per $1</small></span></button>`).join("")}</div>`;
  }
  const m = S.markets.find((x) => x.id === t.seriesId);
  if (!m) return "<p>That market just closed. Pick another date.</p>";
  const unit = sideUnit(m, t.side);
  const qty = Math.max(0, Math.floor(t.amount / (unit * (t.side === "higher" ? 1.01 : 1))));
  const verb = t.side === "higher" ? "above" : "at or below";
  if (t.step === 4) {
    return `<h2>How much?</h2><p class="lead small">${g} ${verb} $${m.strike.toFixed(2)} on ${day(m.windowEnd)}, at ${cents(unit)} per $1.</p>
      <div class="amount">$<input id="amt" inputmode="decimal" value="${t.amount}" aria-label="Amount in USDC"></div>
      <div class="chips">${[5, 20, 50, 100].map((v) => `<button class="btn" data-amt="${v}">$${v}</button>`).join("")}</div>
      <div class="lines">
        <div><span>Contracts</span><span id="qty">${qty}</span></div>
        <div class="big"><span>You get if right</span><span id="win">${usd(qty)}</span></div>
        <div><span>Chance, by the venue's model</span><span>${pct(sideChance(m, t.side))}</span></div>
      </div>
      <div class="row" style="margin-top:16px"><button class="btn default" id="to-review" ${qty > 0 ? "" : "disabled"}>Review</button></div>`;
  }
  // step 5: review
  const q = t.quote;
  const put = q ? (t.side === "higher" ? q.pay + q.fee : q.lock - q.receive) : null;
  return `<h2>Review</h2>
    <p class="sentence">${q ? `You put in <b>${usd(put)}</b>. If ${esc(g)} rents ${verb} $${m.strike.toFixed(2)} on ${day(m.windowEnd)} at 4pm New York, you get <b>${usd(q.legs[0].qty)}</b>. If not, you get nothing.` : "Getting a firm price from the desk."}</p>
    <div class="lines">
      ${q ? `<div><span>Contracts</span><span>${q.legs[0].qty}</span></div>
      <div><span>Price</span><span>${cents(t.side === "higher" ? q.legs[0].price : 1 - q.legs[0].price)} per $1</span></div>
      ${q.fee ? `<div><span>Fee</span><span>${usd(q.fee)}</span></div>` : ""}
      <div><span>Filled by</span><span>${q.legs[0].via === "vault" ? "the weekly vault" : "the venue's desk"}</span></div>` : ""}
    </div>
    <div class="row" style="margin-top:18px"><button class="btn" id="back">Back</button><button class="btn default big" id="sign" ${q ? "" : "disabled"}>Sign with wallet</button></div>
    <p class="status" id="t-st"></p>`;
}

function chartCaption() {
  const t = S.t;
  if (t.step === 1) return "Last 30 daily prints. Pick a side and the chart shows your level and your date.";
  if (t.step === 2) return "The dashed line is your level. The pattern marks where you win.";
  return "The dotted line is your date. The bracket is the model's 80% range for that day.";
}

function chartSvg() {
  const t = S.t;
  const g = S.index.find((x) => x.code === t.gpu);
  if (!g) return "";
  const hist = g.history.slice(-30);
  const m = t.seriesId ? S.markets.find((x) => x.id === t.seriesId) : null;
  const dateM = m || (t.step === 3 && datesFor(t.gpu, t.strike)[t.hl]) || null;
  const W = 600, H = 300, L = 8, R = 70, T = 14, B = 26;
  const t0 = Date.parse(`${hist[0][0]}T00:00:00Z`);
  const lastT = Date.parse(`${hist[hist.length - 1][0]}T00:00:00Z`);
  const endT = dateM ? Date.parse(`${dateM.windowEnd}T00:00:00Z`) : lastT + 7 * 86400e3;
  const vals = hist.map((p) => p[1]);
  // on the level step the chart previews the highlighted row before you pick it
  const lv = t.strike !== null ? t.strike : (t.step === 2 && t.side ? (levelsFor(t.gpu)[t.hl] ?? null) : null);
  if (lv !== null) vals.push(lv);
  if (dateM && dateM.model) vals.push(dateM.model.settleP10, dateM.model.settleP90);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.12 || 0.1; lo -= pad; hi += pad;
  const X = (ms) => L + ((ms - t0) / (endT - t0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = hist.map((p) => [X(Date.parse(`${p[0]}T00:00:00Z`)), Y(p[1])]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const len = pts.reduce((a, p, i) => a + (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  let extra = "";
  if (lv !== null && t.side) {
    const yl = Y(lv);
    const winTop = t.side === "higher" ? T : yl, winH = t.side === "higher" ? yl - T : H - B - yl;
    extra += `<rect x="${L}" y="${winTop}" width="${W - L - R}" height="${Math.max(0, winH)}" fill="url(#dith)" opacity="0.55"/>`;
    extra += `<line x1="${L}" x2="${W - R}" y1="${yl}" y2="${yl}" stroke="#2f6bff" stroke-width="2" stroke-dasharray="6 4"/>`;
    extra += `<text x="${W - R + 6}" y="${yl + 4}">$${lv.toFixed(2)}</text>`;
  }
  if (dateM) {
    const xd = X(Date.parse(`${dateM.windowEnd}T00:00:00Z`));
    extra += `<line x1="${xd}" x2="${xd}" y1="${T}" y2="${H - B}" stroke="#dbe6ff" stroke-dasharray="1 3"/>`;
    extra += `<text x="${xd}" y="${H - 8}" text-anchor="end">${day(dateM.windowEnd)}</text>`;
    if (dateM.model) {
      const a = Y(dateM.model.settleP90), b = Y(dateM.model.settleP10);
      extra += `<path d="M${xd - 8},${a} H${xd} V${b} H${xd - 8}" fill="none" stroke="#dbe6ff" stroke-width="2"/>`;
    }
  }
  const lp = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Recent prints with your level and date">
    <defs><pattern id="dith" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#2f6bff"/><rect x="1" y="1" width="1" height="1" fill="#2f6bff"/></pattern></defs>
    ${extra}
    <path d="${path}" fill="none" stroke="#dbe6ff" stroke-width="2.5" stroke-dasharray="${len}" stroke-dashoffset="${len}" style="animation: draw .9s cubic-bezier(.22,1,.36,1) forwards"/>
    <rect class="live" x="${lp[0] - 3}" y="${lp[1] - 3}" width="6" height="6" fill="#6fa0ff"/>
    <text x="${L}" y="${H - 8}">${day(hist[0][0])}</text>
    <style>@keyframes draw{to{stroke-dashoffset:0}}</style>
  </svg>`;
}

function refreshChart() { const c = $("#chart"); if (c) c.innerHTML = chartSvg(); }

function goStep(k, fromEl) {
  const t = S.t;
  t.dir = k < t.step ? "back" : "fwd";
  t.step = k; t.hl = 0;
  if (k === 2) { const ks = levelsFor(t.gpu); const lp = lastPrint(t.gpu) || 0; t.hl = Math.max(0, ks.findIndex((x) => x >= lp)); }
  if (k <= 3) t.quote = null;
  render();
  if (k === 4) bindAmount();
  if (k === 5) fetchQuote();
}

function pick(key, el) {
  const t = S.t;
  if (t.step === 1) { t.side = key; t.strike = null; t.seriesId = null; return goStep(2, el); }
  if (t.step === 2) { t.strike = Number(key); t.seriesId = null; return goStep(3, el); }
  if (t.step === 3) { t.seriesId = key; return goStep(4, el); }
}

function bindTrade() {
  $$("[data-step]").forEach((b) => b.addEventListener("click", () => goStep(Number(b.dataset.step), b)));
  $$("[data-gpu]").forEach((b) => b.addEventListener("click", () => { S.t.gpu = b.dataset.gpu; S.t.strike = null; S.t.seriesId = null; render(); }));
  $$("[data-opt]").forEach((b, i) => {
    b.addEventListener("mouseenter", () => { S.t.hl = i; $$("[data-opt]").forEach((x, j) => x.classList.toggle("hl", j === i)); previewHover(); });
    b.addEventListener("click", () => pick(b.dataset.opt, b));
  });
  if (S.t.step === 4) bindAmount();
  const back = $("#back"); if (back) back.addEventListener("click", () => goStep(4, back));
  const sign = $("#sign"); if (sign) sign.addEventListener("click", () => ensureWallet(executeTrade));
}

function previewHover() {
  // the chart follows the highlighted option before you commit
  const t = S.t, opts = optionsList();
  if (t.step === 2 || t.step === 3) refreshChart();
}

function bindAmount() {
  const input = $("#amt");
  if (!input) return;
  const update = () => {
    S.t.amount = Math.max(0, Number(input.value) || 0);
    const m = S.markets.find((x) => x.id === S.t.seriesId);
    if (!m) return;
    const qty = Math.max(0, Math.floor(S.t.amount / (sideUnit(m, S.t.side) * (S.t.side === "higher" ? 1.01 : 1))));
    $("#qty").textContent = qty; $("#win").textContent = usd(qty);
    $("#to-review").disabled = qty <= 0;
  };
  input.addEventListener("input", update);
  $$("[data-amt]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.amt; update(); }));
  $("#to-review").addEventListener("click", (e) => ensureWallet(() => goStep(5, e.target)));
  input.focus(); input.select();
}

async function fetchQuote() {
  const t = S.t;
  const m = S.markets.find((x) => x.id === t.seriesId);
  if (!m || !S.wallet) return;
  const qty = Math.max(1, Math.floor(t.amount / (sideUnit(m, t.side) * (t.side === "higher" ? 1.01 : 1))));
  try {
    t.quote = await api("quote", { owner: S.wallet.address, legs: [{ series: m.id, side: t.side === "higher" ? "buy" : "sell", qty }] });
    t.quotedAt = Date.now();
  } catch (e) {
    t.quote = null;
    const st = $("#t-st"); if (st) { st.textContent = e.message; st.className = "status err"; }
    if (/faucet/i.test(e.message) && st) {
      st.innerHTML = `${esc(e.message)} <button class="btn" id="fz">Add test USDC</button>`;
      $("#fz").addEventListener("click", async () => { await faucet(); fetchQuote(); });
    }
    return;
  }
  if (S.view === "trade" && S.t.step === 5) { $("#step").innerHTML = stepHtml(); bindTrade(); }
}

async function executeTrade() {
  const t = S.t;
  if (!t.quote || Date.now() - t.quotedAt > 40_000) { await fetchQuote(); if (!t.quote) return; }
  const st = $("#t-st");
  st.className = "status"; st.textContent = S.wallet.kind === "burner" ? "Signing." : "Approve it in your wallet.";
  $("#sign").disabled = true;
  try {
    const r = await signAndSubmit(t.quote);
    const m = S.markets.find((x) => x.id === t.seriesId);
    alertBox("✓", "Done.", `${esc(gpuLabel(t.gpu))} ${t.side === "higher" ? "above" : "at or below"} $${m.strike.toFixed(2)} on ${day(m.windowEnd)}. It's in your portfolio.`, r.url);
    S.t = { ...S.t, step: 1, side: null, strike: null, seriesId: null, quote: null, hl: 0 };
    await Promise.all([refreshMarkets(), refreshPortfolio(), refreshActivity()]);
    render();
  } catch (e) {
    st.className = "status err"; st.textContent = e.message || "The wallet declined.";
    $("#sign").disabled = false;
  }
}

document.addEventListener("keydown", (e) => {
  if (S.view !== "trade" || document.querySelector(".modal")) return;
  if (e.target && e.target.tagName === "INPUT") { if (e.key === "Escape") goStep(S.t.step - 1); return; }
  const t = S.t, opts = optionsList();
  if (["ArrowDown", "ArrowRight"].includes(e.key) && opts.length) { t.hl = (t.hl + 1) % opts.length; e.preventDefault(); }
  else if (["ArrowUp", "ArrowLeft"].includes(e.key) && opts.length) { t.hl = (t.hl - 1 + opts.length) % opts.length; e.preventDefault(); }
  else if (e.key === "Enter" && opts[t.hl]) { e.preventDefault(); return pick(String(opts[t.hl].key), $$("[data-opt]")[t.hl]); }
  else if ((e.key === "Escape" || e.key === "Backspace") && t.step > 1) { e.preventDefault(); return goStep(t.step - 1); }
  else return;
  $$("[data-opt]").forEach((x, j) => x.classList.toggle("hl", j === t.hl));
  previewHover();
});

// ---------- option chain: every strike and date as a live ladder ----------
S.chain = { gpu: "H100_SXM", date: null, row: 0, side: "higher", prev: {} };
const chainDates = (gpu) => [...new Set(predict().filter((m) => m.underlying === gpu).map((m) => m.windowEnd))].sort();
function chainRows() {
  const c = S.chain;
  return predict().filter((m) => m.underlying === c.gpu && m.windowEnd === c.date).sort((a, b) => b.strike - a.strike);
}
function distStrip(rows, spot, cur) {
  const d = rows[0] && rows[0].model.dist;
  if (!d) return "";
  const W = 1000, H = 84, lo = d.lo, hi = d.hi, X = (v) => Math.max(0, Math.min(W, ((v - lo) / (hi - lo)) * W));
  const bw = W / d.bins.length;
  const bars = d.bins.map((b, i) => `<rect x="${(i * bw + 1).toFixed(1)}" y="${(H - 14 - b * (H - 24)).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(b * (H - 24)).toFixed(1)}"/>`).join("");
  const ticks = rows.map((m) => `<line x1="${X(m.strike)}" x2="${X(m.strike)}" y1="${H - 14}" y2="${H - 8}" stroke="#6fa0ff"/>`).join("");
  const m = rows[cur];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="strip" aria-label="Where the model expects the print to land">
    <g class="bars">${bars}</g>${ticks}
    <line x1="${X(spot)}" x2="${X(spot)}" y1="0" y2="${H - 14}" stroke="#fff" stroke-dasharray="2 3"/>
    ${m ? `<line class="curline" x1="${X(m.strike)}" x2="${X(m.strike)}" y1="0" y2="${H - 6}" stroke="#6fa0ff" stroke-width="2"/>` : ""}
    <line x1="0" x2="${W}" y1="${H - 14}" y2="${H - 14}" stroke="rgba(160,190,255,.5)"/></svg>`;
}
function chainView() {
  const c = S.chain, dates = chainDates(c.gpu);
  if (!dates.includes(c.date)) c.date = dates[0];
  const rows = chainRows(), spot = lastPrint(c.gpu) || 0;
  if (c.row >= rows.length) c.row = Math.max(0, rows.length - 1);
  const maxOI = Math.max(1, ...rows.map((m) => m.openInterest || 0));
  const next = {};
  const cell = (m, side, i) => {
    const px = sideUnit(m, side), ch = sideChance(m, side), key = `${m.id}:${side}`;
    next[key] = px;
    const was = c.prev[key], fl = was === undefined || was === px ? "" : px > was ? "up" : "dn";
    const cur = i === c.row && c.side === side ? " cur" : "";
    return `<button class="cell ${side === "lower" ? "lo" : "hi"}${cur} ${fl}" data-r="${i}" data-side="${side}" style="--p:${Math.round(ch * 100)}%">
      <span class="pr">${Math.round(px * 100)}<small>¢</small></span><span class="ch">${pct(ch)}</span></button>`;
  };
  let body = "", placed = false;
  const spotRow = `<div class="crow spot"><span class="lab">${esc(gpuLabel(c.gpu))} now</span><b>${usd(spot)}</b><span class="lab">live</span></div>`;
  rows.forEach((m, i) => {
    if (!placed && m.strike < spot) { body += spotRow; placed = true; }
    const oi = m.openInterest || 0;
    body += `<div class="crow ${i === c.row ? "cur" : ""}">
      ${cell(m, "lower", i)}
      <div class="mid"><b>${usd(m.strike)}</b><span class="oi" title="open interest, contracts"><i style="width:${Math.max(oi ? 8 : 0, (oi / maxOI) * 100)}%"></i></span><small>spread ${Math.round((m.model.ask - m.model.bid) * 100)}¢</small></div>
      ${cell(m, "higher", i)}</div>`;
  });
  if (!placed && rows.length) body += spotRow;
  c.prev = next;
  const sel = rows[c.row];
  return windowShell("Option chain", `
    <div class="chainbar">
      <div class="seg">${GPU_ORDER.map((g) => `<button data-cg="${g}" class="${g === c.gpu ? "on" : ""}">${esc((S.index.find((x) => x.code === g) || {}).label || g).split(" ")[0]}</button>`).join("")}</div>
      <div class="dates">${dates.map((d) => `<button data-cd="${d}" class="${d === c.date ? "on" : ""}">${day(d)}</button>`).join("")}</div>
    </div>
    <div class="stripbox"><div class="eyebrow">WHERE THE MODEL EXPECTS ${esc(gpuLabel(c.gpu)).toUpperCase()} TO PRINT / ${day(c.date).toUpperCase()}</div>${distStrip(rows, spot, c.row)}</div>
    <div class="chead"><span>Lower<small>price per $1 / chance</small></span><span>Strike</span><span>Higher<small>price per $1 / chance</small></span></div>
    <div class="ladder">${body || '<p class="muted" style="padding:20px">No open markets for this chip yet.</p>'}</div>
    <div class="hint"><span><kbd>↑</kbd> <kbd>↓</kbd> strike</span><span><kbd>←</kbd> <kbd>→</kbd> side</span><span><kbd>Enter</kbd> trade ${sel ? usd(sel.strike) : ""}</span><span class="spacer"></span><span>Prices are the venue's quote for a $1 payout. Bar = open interest.</span></div>`);
}
function chainOpen(m, side) {
  S.t = { ...S.t, gpu: m.underlying, side, strike: m.strike, seriesId: m.id, quote: null, hl: 0, step: 3 };
  S.view = "trade"; renderMenu(); goStep(4);
}
function bindChain() {
  const c = S.chain, rows = chainRows();
  $$("[data-cg]").forEach((b) => b.addEventListener("click", () => { c.gpu = b.dataset.cg; c.date = null; c.row = 0; render(); }));
  $$("[data-cd]").forEach((b) => b.addEventListener("click", () => { c.date = b.dataset.cd; c.row = 0; render(); }));
  $$(".cell").forEach((b) => {
    b.addEventListener("mouseenter", () => { c.row = Number(b.dataset.r); c.side = b.dataset.side; markChain(); });
    b.addEventListener("click", () => { const m = rows[Number(b.dataset.r)]; if (m) chainOpen(m, b.dataset.side); });
  });
}
function markChain() {
  const rows = chainRows(), c = S.chain;
  $$(".crow:not(.spot)").forEach((r, i) => r.classList.toggle("cur", i === c.row));
  $$(".cell").forEach((b) => b.classList.toggle("cur", Number(b.dataset.r) === c.row && b.dataset.side === c.side));
  const sv = $(".stripbox svg"); if (sv) sv.outerHTML = distStrip(rows, lastPrint(c.gpu) || 0, c.row).replace("<svg", '<svg data-live="1"');
}
document.addEventListener("keydown", (e) => {
  if (S.view !== "chain" || document.querySelector(".modal")) return;
  const c = S.chain, rows = chainRows();
  if (!rows.length) return;
  if (e.key === "ArrowDown") c.row = Math.min(rows.length - 1, c.row + 1);
  else if (e.key === "ArrowUp") c.row = Math.max(0, c.row - 1);
  else if (e.key === "ArrowLeft") c.side = "lower";
  else if (e.key === "ArrowRight") c.side = "higher";
  else if (e.key === "Enter") return chainOpen(rows[c.row], c.side);
  else return;
  e.preventDefault(); markChain();
});

// ---------- hedge ----------
function hedgePair(code) {
  const live = S.markets.filter((m) => m.door === "hedge" && m.status === "open" && m.underlying === code && m.model);
  const put = live.find((m) => m.kind === "put"), call = live.find((m) => m.kind === "call");
  return put && call ? { put, call } : null;
}
function hedgeChart(put, call, role, collar) {
  const d = (role === "own" ? put : call).model.dist;
  if (!d) return "";
  const today = lastPrint(put.underlying) || put.strike;
  const xlo = Math.min(d.lo, put.strike - put.cap * 1.3, today), xhi = Math.max(d.hi, call.strike + call.cap * 1.3, today);
  const W = 560, H = 260, T = 20, B = 30, X = (v) => ((v - xlo) / (xhi - xlo)) * W, base = H - B;
  const bw = (d.hi - d.lo) / d.bins.length;
  const bars = d.bins.map((b, i) => `<rect x="${X(d.lo + i * bw)}" y="${base - b * (base - T) * 0.9}" width="${Math.max(1, X(d.lo + bw) - X(d.lo))}" height="${b * (base - T) * 0.9}" fill="url(#dith)"/>`).join("");
  const maxPay = Math.max(put.maxPayoff, call.maxPayoff);
  const Yp = (v) => base - (v / maxPay) * (base - T) * 0.85;
  const payAt = (s) => role === "own"
    ? Math.min(Math.max(put.strike - s, 0), put.cap) * put.units - (collar ? Math.min(Math.max(s - call.strike, 0), call.cap) * call.units : 0)
    : Math.min(Math.max(s - call.strike, 0), call.cap) * call.units;
  const xs = [xlo, put.strike - put.cap, put.strike, call.strike, call.strike + call.cap, xhi].sort((a, b) => a - b);
  const path = xs.map((s, i) => `${i ? "L" : "M"}${X(s).toFixed(1)},${Math.min(H - 4, Yp(payAt(s))).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Payout against the month's average">
    <defs><pattern id="dith" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="#2f6bff"/><rect x="1" y="1" width="1" height="1" fill="#2f6bff"/></pattern></defs>
    ${bars}<line x1="0" x2="${W}" y1="${base}" y2="${base}" stroke="#dbe6ff"/>
    <path d="${path}" fill="none" stroke="#dbe6ff" stroke-width="3"/>
    <line x1="${X(today)}" x2="${X(today)}" y1="${T}" y2="${base}" stroke="#dbe6ff" stroke-dasharray="1 3"/>
    <text x="${X(today)}" y="${T - 6}" text-anchor="middle">today $${today.toFixed(2)}</text>
    <text x="${X(role === "own" ? put.strike : call.strike)}" y="${H - 10}" text-anchor="middle">$${(role === "own" ? put.strike : call.strike).toFixed(2)}</text>
  </svg>`;
}
function hedgeView() {
  const codes = GPU_ORDER.filter((c) => hedgePair(c));
  if (!codes.length) return windowShell("Hedge", '<div class="wbody">No hedges are open right now.</div>');
  const h = S.hedge;
  if (!codes.includes(h.gpu)) h.gpu = codes[0];
  const { put, call } = hedgePair(h.gpu);
  const own = h.role === "own", month = monthOf(put.windowStart), g = put.gpu;
  const price = own ? (h.collar ? put.model.ask - call.model.bid : put.model.ask) : call.model.ask;
  const lines = own
    ? (h.collar
      ? [`Pay ${usd(put.model.ask)} for the floor, receive ${usd(call.model.bid)} for the $${call.strike.toFixed(2)} cap.`, `Locks ${usd(call.maxPayoff, 0)} per contract until settlement.`]
      : [`Pays up to ${usd(put.maxPayoff, 0)} if ${month} averages $${(put.strike - put.cap).toFixed(2)} or less.`, `Model chance it pays: ${pct(put.model.probItm)}.`])
    : [`Pays up to ${usd(call.maxPayoff, 0)} if ${month} averages $${(call.strike + call.cap).toFixed(2)} or more.`, `Model chance it pays: ${pct(call.model.probItm)}.`];
  return windowShell(`Hedge ${month}`, `
    <div class="two">
      <div>
        <div class="seg">${codes.map((c) => `<button data-hg="${c}" class="${c === h.gpu ? "on" : ""}">${esc(gpuLabel(c))}</button>`).join("")}</div>
        <div class="row" style="margin-top:14px">
          <label class="check radio"><input type="radio" name="role" value="own" ${own ? "checked" : ""}>I own GPUs</label>
          <label class="check radio"><input type="radio" name="role" value="rent" ${own ? "" : "checked"}>I rent GPUs</label>
        </div>
        <h2 style="margin-top:18px">${own ? `Floor your ${month} ${g} revenue at $${put.strike.toFixed(2)} an hour.` : `Cap your ${month} ${g} cost at $${call.strike.toFixed(2)} an hour.`}</h2>
        <div class="num">${usd(price)}</div>
        <div class="small">${h.collar && own ? "net" : "per contract"}: one GPU, every hour of ${month} (${put.units} hours)</div>
        ${lines.map((l) => `<p class="small">${esc(l)}</p>`).join("")}
        ${own ? `<label class="check"><input type="checkbox" id="collar" ${h.collar ? "checked" : ""}>Pay for it by selling the $${call.strike.toFixed(2)} cap</label>` : ""}
        <div class="row" style="margin-top:16px"><button class="btn default big" id="hedge-go">${own ? `Protect ${month}` : `Cap ${month}`}</button></div>
        <p class="status" id="h-st"></p>
      </div>
      <div>
        <div class="chart" style="height:260px">${hedgeChart(put, call, h.role, own && h.collar)}</div>
        <p class="small">Line: what one contract pays against ${month}'s average price. Pattern: where the model expects that average to land.</p>
      </div>
    </div>`);
}
function bindHedge() {
  $$("[data-hg]").forEach((b) => b.addEventListener("click", () => { S.hedge.gpu = b.dataset.hg; render(); }));
  $$('input[name="role"]').forEach((r) => r.addEventListener("change", () => { S.hedge.role = r.value; render(); }));
  const c = $("#collar"); if (c) c.addEventListener("change", () => { S.hedge.collar = c.checked; render(); });
  const go = $("#hedge-go");
  if (go) go.addEventListener("click", () => ensureWallet(async () => {
    const { put, call } = hedgePair(S.hedge.gpu);
    const own = S.hedge.role === "own";
    const legs = own ? [{ series: put.id, side: "buy", qty: 1 }, ...(S.hedge.collar ? [{ series: call.id, side: "sell", qty: 1 }] : [])] : [{ series: call.id, side: "buy", qty: 1 }];
    const st = $("#h-st");
    try {
      st.textContent = "Getting a firm price.";
      const q = await api("quote", { owner: S.wallet.address, legs });
      dialog(`<div class="icon">?</div><b>Confirm</b>
        <div class="lines" style="clear:both">
          ${q.legs.map((l) => `<div><span>${l.side === "buy" ? "Buy" : "Sell"} ${esc(l.title.split(" (")[0])}</span><span>${usd(l.price)}</span></div>`).join("")}
          ${q.fee ? `<div><span>Fee</span><span>${usd(q.fee)}</span></div>` : ""}
          ${q.lock ? `<div><span>Locked until settlement</span><span>${usd(q.lock, 0)}</span></div>` : ""}
          <div class="big"><span>Net</span><span>${usd(q.pay + (q.fee || 0) - (q.receive || 0))}</span></div>
        </div>
        <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn default" id="ok">Sign with wallet</button></div>`,
      (m, close) => $("#ok", m).addEventListener("click", async () => {
        close();
        try { const r = await signAndSubmit(q); alertBox("✓", "Protected.", `${esc(put.gpu)} ${monthOf(put.windowStart)} is in your portfolio.`, r.url); await Promise.all([refreshMarkets(), refreshPortfolio(), refreshActivity()]); }
        catch (e) { alertBox("!", "Not sent.", esc(e.message)); }
      }));
      st.textContent = "";
    } catch (e) { st.textContent = e.message; }
  }));
}

// ---------- earn ----------
const weekLabel = (a, b) => `${day(new Date(a * 1000).toISOString().slice(0, 10))} to ${day(new Date((b - 86400) * 1000).toISOString().slice(0, 10))}`;
function earnView() {
  const open = S.vaults.filter((v) => v.phase === "deposits").sort((a, b) => a.epoch - b.epoch)[0];
  const live = S.vaults.find((v) => v.phase === "trading");
  return windowShell("Earn", `
    <div class="two">
      <div>
        ${open ? `<div class="small">Deposits close in ${countdown(open.depositEnd)}</div>
        <h2>Underwrite ${esc(weekLabel(open.depositEnd, open.epochEnd))}.</h2>
        <p class="small">Your USDC sells that week's GPU price questions to traders. You keep the premium and pay the winners. No market can use more than ${Math.round(open.capBps / 100)}% of the vault, and no more than half is ever at risk. Withdraw after the week settles.</p>
        <div class="num">${usd(open.deposits, 0)}</div><div class="small">in the vault, including the venue's own ${usd(open.venueSeed, 0)}</div>
        <div class="amount" style="font-size:28px">$<input id="dep" style="font-size:28px;width:160px" inputmode="decimal" value="1000"></div>
        <button class="btn default big" id="dep-go">Deposit</button><p class="status" id="d-st"></p>` : "<h2>Next week's vault opens soon.</h2>"}
      </div>
      <div>
        ${live ? `<div class="small">Trading now, ${esc(weekLabel(live.depositEnd, live.epochEnd))}</div>
        <div class="stats">
          <div class="stat"><div class="n">${usd(live.deposits, 0)}</div><div class="small">deposited</div></div>
          <div class="stat"><div class="n">${usd(live.premiums)}</div><div class="small">premium collected</div></div>
          <div class="stat"><div class="n">${live.openSeries}</div><div class="small">markets open</div></div>
          <div class="stat"><div class="n">${pct(live.deposits ? live.premiums / live.deposits : 0)}</div><div class="small">premium so far, before payouts</div></div>
        </div>` : "<p>No vault is trading yet.</p>"}
      </div>
    </div>`);
}
function bindEarn() {
  const go = $("#dep-go");
  if (!go) return;
  go.addEventListener("click", () => ensureWallet(async () => {
    const open = S.vaults.filter((v) => v.phase === "deposits").sort((a, b) => a.epoch - b.epoch)[0];
    const st = $("#d-st");
    try {
      st.textContent = "Approve the deposit in your wallet.";
      const r = await signAndSubmit(await api("vault", { type: "deposit", epoch: open.epoch, owner: S.wallet.address, amount: Number($("#dep").value) }));
      st.textContent = "";
      alertBox("✓", "Deposited.", "Your share of the vault is in your portfolio.", r.url);
      await Promise.all([refreshMarkets(), refreshPortfolio()]);
      render();
    } catch (e) {
      st.innerHTML = esc(e.message);
      if (/faucet/i.test(e.message)) { st.innerHTML += ' <button class="btn" id="fz">Add test USDC</button>'; $("#fz").addEventListener("click", faucet); }
    }
  }));
}

// ---------- activity ----------
const initials = (n) => n.split(/[_.]/).slice(0, 2).map((x) => x[0] || "").join("").toUpperCase();
function activityView() {
  const a = S.activity;
  if (!a) return windowShell("Activity", '<div class="wbody">Loading.</div>');
  const st = a.stats[S.feedWin];
  const hi = st.higherPct;
  return windowShell("What everyone is trading", `
    <div class="feed">
      <div>
        ${a.cluster !== "devnet" && a.cluster !== "mainnet" ? '<p class="small">Preview chain: these include our own test trades.</p>' : ""}
        ${a.trades.length ? a.trades.slice(0, 20).map((x) => `<div class="post"><div class="av">${esc(initials(x.name))}</div><div>
          <div class="who"><span>${esc(x.name)}</span><span>${ago(x.at)}</span></div>
          <div>${esc(x.sentence.startsWith(x.name) ? x.sentence.slice(x.name.length + 1) : x.sentence)}</div>
          <div class="card"><span>${esc(x.headline)}</span><span class="row">${usd(x.cost)}${x.door === "predict" && x.open ? ` <button class="btn" data-copy="${esc(x.series)}" data-side="${x.direction}">Copy</button>` : ""}</span></div>
        </div></div>`).join("") : "<p>No trades yet. Be the first.</p>"}
      </div>
      <div>
        <h3>Happening now</h3>
        <div class="seg">${["1h", "24h", "7d"].map((w) => `<button data-fw="${w}" class="${w === S.feedWin ? "on" : ""}">${w}</button>`).join("")}</div>
        <div class="stats">
          <div class="stat"><div class="n">${st.bets}</div><div class="small">bets</div></div>
          <div class="stat"><div class="n">${usd(st.onTable, 0)}</div><div class="small">on the table</div></div>
          <div class="stat"><div class="n">${st.traders}</div><div class="small">traders</div></div>
          <div class="stat"><div class="n">${hi === null ? "none" : pct(hi)}</div><div class="small">say higher</div></div>
        </div>
        ${hi !== null ? `<div class="meter"><span style="width:${Math.round(hi * 100)}%"></span></div><div class="small row" style="justify-content:space-between"><span>${pct(hi)} higher</span><span>${pct(1 - hi)} lower</span></div>` : ""}
        <h3>Hot today</h3>
        <div class="list">${a.hot.length ? a.hot.map((p) => `<div><span>${esc(p.name)}</span><span>${p.pnl >= 0 ? "+" : ""}${usd(p.pnl)}</span></div>`).join("") : "<div><span>Nobody yet today.</span></div>"}</div>
        <h3>Top profit, 7 days</h3>
        <div class="list">${a.leaders.length ? a.leaders.map((p) => `<div><span>${esc(p.name)}</span><span>${p.pnl >= 0 ? "+" : ""}${usd(p.pnl)}, ${p.trades} trades</span></div>`).join("") : "<div><span>Nobody yet.</span></div>"}</div>
      </div>
    </div>`);
}
function bindActivity() {
  $$("[data-fw]").forEach((b) => b.addEventListener("click", () => { S.feedWin = b.dataset.fw; render(); }));
  $$("[data-copy]").forEach((b) => b.addEventListener("click", () => {
    const m = S.markets.find((x) => x.id === b.dataset.copy);
    if (!m) return;
    S.t = { ...S.t, gpu: m.underlying, side: b.dataset.side, strike: m.strike, seriesId: m.id, quote: null, hl: 0 };
    S.view = "trade"; renderMenu(); goStep(4, b);
  }));
}

// ---------- portfolio ----------
async function faucet() {
  try { const r = await api("faucet", { owner: S.wallet.address }); alertBox("✓", "Added test USDC.", `${usd(r.amount, 0)} is in your wallet.`, r.url); }
  catch (e) { alertBox("!", "Faucet", esc(e.message)); }
  await refreshPortfolio(); if (S.view === "portfolio") render();
}
function portfolioView() {
  if (!S.wallet) return windowShell("Portfolio", '<div class="wbody"><p>Connect a wallet to see your positions.</p><button class="btn default" id="pf-connect">Connect</button></div>');
  const p = S.portfolio;
  if (!p) return windowShell("Portfolio", '<div class="wbody">Loading.</div>');
  const title = (r) => r.door === "predict" ? `${r.gpu} ${r.short > r.long ? "at or below" : "above"} $${r.strike.toFixed(2)} on ${day(r.windowEnd)}` : `${r.gpu} ${monthOf(r.windowStart)} ${r.kind === "put" ? "floor" : "cap"} at $${r.strike.toFixed(2)}`;
  const rows = p.rows.map((r) => {
    let value = "", act = "";
    if (r.status === "settled") {
      value = `settled $${r.settled.price.toFixed(4)}`;
      if (r.long > 0) act += `<button class="btn" data-act="redeem" data-s="${r.id}">Redeem ${usd(r.redeemable)}</button> `;
      if (r.short > 0) act += `<button class="btn" data-act="reclaim" data-s="${r.id}">Reclaim ${usd(r.reclaimable)}</button>`;
    } else {
      value = usd((r.markPerContract ?? 0) * (r.long - r.short));
      const both = Math.min(r.long, r.short);
      if (both > 0) act = `<button class="btn" data-act="close" data-s="${r.id}" data-q="${both}">Close ${both}</button>`;
    }
    return `<tr><td>${esc(title(r))}<div class="small muted">${r.status === "open" ? `closes in ${countdown(r.tradingEnd)}` : esc(r.status)}</div></td><td>${r.long ? `long ${r.long}` : ""} ${r.short ? `short ${r.short}` : ""}</td><td class="r">${value}${r.short ? `<div class="small">${usd(r.lockedCollateral, 0)} locked</div>` : ""}</td><td class="r">${act}</td></tr>`;
  }).join("");
  const vrows = (p.vaults || []).map((v) => `<tr><td>Vault, ${esc(weekLabel(v.depositEnd, v.epochEnd))}<div class="small muted">${esc(v.phase)}</div></td><td>${pct(v.share)} of it</td><td class="r">${usd(v.cashValue)}</td><td class="r">${v.phase === "withdrawable" ? `<button class="btn" data-vw="${v.epoch}">Withdraw</button>` : ""}</td></tr>`).join("");
  return windowShell("Portfolio", `<div class="wbody">
    <div class="row" style="justify-content:space-between"><div><div class="num">${usd(p.usdc)}</div><div class="small">USDC in ${esc(S.wallet.name)}</div></div>
    ${S.status && S.status.cluster !== "mainnet" ? '<button class="btn" id="pf-faucet">Add 10,000 test USDC</button>' : ""}</div>
    <table class="pf" style="margin-top:16px"><tr><th>Position</th><th></th><th class="r">Value</th><th></th></tr>${rows}${vrows || ""}${!rows && !vrows ? '<tr><td colspan="4">Nothing yet. Make your first trade.</td></tr>' : ""}</table>
    <p class="status" id="pf-st"></p></div>`);
}
function bindPortfolio() {
  const c = $("#pf-connect"); if (c) c.addEventListener("click", () => walletPicker());
  const f = $("#pf-faucet"); if (f) f.addEventListener("click", faucet);
  $$("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    try { const r = await signAndSubmit(await api("action", { type: b.dataset.act, series: b.dataset.s, owner: S.wallet.address, qty: b.dataset.q ? Number(b.dataset.q) : undefined })); alertBox("✓", "Done.", "Your portfolio is updated.", r.url); }
    catch (e) { alertBox("!", "Not sent.", esc(e.message)); }
    await refreshPortfolio(); render();
  }));
  $$("[data-vw]").forEach((b) => b.addEventListener("click", async () => {
    try { const r = await signAndSubmit(await api("vault", { type: "withdraw", epoch: Number(b.dataset.vw), owner: S.wallet.address })); alertBox("✓", "Withdrawn.", "The USDC is in your wallet.", r.url); }
    catch (e) { alertBox("!", "Not sent.", esc(e.message)); }
    await refreshPortfolio(); render();
  }));
}

// ---------- about ----------
function aboutBox() {
  const st = S.status || {};
  const bt = st.backtest && st.backtest.result ? st.backtest.result.find((r) => r.horizonDays === 7) : null;
  dialog(`<div class="icon"><img class="logo" src="mark.svg" alt=""></div><b>Hourly</b>
    <p>Options on the price of renting an AI chip. Every contract is fully backed in USDC and settled by a Switchboard oracle that averages Ornn's daily print. The Solana program checks the oracle's signatures before it pays anyone.</p>
    ${bt ? `<p class="small">Model check, out of sample: ${pct(bt.coverage)} of prints landed inside its 80% range 7 days out. Brier ${bt.brier.toFixed(3)} against ${bt.brierCoin.toFixed(3)} for a coin.</p>` : ""}
    <p class="small mono">program ${esc(st.programId || "")}<br>network ${esc(st.cluster || "")}</p>
    <p class="small">${st.cluster === "mainnet" ? "Not investment advice." : "Test money only. Not investment advice."}</p>
    <div class="actions"><button class="btn default" data-close>OK</button></div>`);
}

// ---------- render ----------
function heroHtml() {
  const g = S.index.find((x) => x.code === "H100_SXM");
  const bt = S.status && S.status.backtest && S.status.backtest.result ? S.status.backtest.result.find((r) => r.horizonDays === 7) : null;
  return `<header class="hero">
    <div class="eyebrow"><i class="pulse"></i>AI COMPUTE / DEFINED OUTCOMES</div>
    <div class="herorow">
      <h1>The price of a chip.<br>Your call.</h1>
      <div class="aside">Bet on what an hour of AI compute will cost, or lock in your own bill. Fully funded, settled by oracle on Solana.
        <div class="chiprow">${g ? `<span>H100 <b>$${g.last.toFixed(2)}</b>/hr</span>` : ""}${bt ? `<span>MODEL <b>${Math.round(bt.coverage * 100)}%</b> IN RANGE</span>` : ""}</div></div>
    </div></header>`;
}
function render() {
  const views = { trade: tradeView, chain: chainView, hedge: hedgeView, earn: earnView, activity: activityView, portfolio: portfolioView };
  $("#desk").innerHTML = (S.view === "trade" ? heroHtml() : "") + views[S.view]();
  $$("[data-home]").forEach((b) => b.addEventListener("click", () => { S.view = "trade"; renderMenu(); render(); }));
  ({ trade: bindTrade, chain: bindChain, hedge: bindHedge, earn: bindEarn, activity: bindActivity, portfolio: bindPortfolio })[S.view]();
  slidePill($(".steps"), "steps");
}

async function refreshMarkets() {
  try { const [m, v] = await Promise.all([api("markets"), api("vaults").catch(() => [])]); S.markets = m; S.vaults = v; } catch (_) { /* keep last */ }
}
async function refreshPortfolio() { if (!S.wallet) { S.portfolio = null; return; } try { S.portfolio = await api(`portfolio?owner=${S.wallet.address}`); } catch (_) { /* keep */ } }
async function refreshActivity() { try { S.activity = await api("activity"); } catch (_) { /* keep */ } }

(async function main() {
  try { S.status = await api("status"); } catch (_) { /* offline */ }
  registerMetaMask();
  try { S.index = await api("index"); } catch (_) { S.index = []; }
  await Promise.all([refreshMarkets(), refreshActivity()]);
  renderMenu();
  render();
  await restoreWallet();
  setInterval(async () => {
    if (document.querySelector(".modal") || (S.view === "trade" && S.t.step >= 4)) return;
    await Promise.all([refreshMarkets(), refreshActivity()]);
    if (S.view !== "trade" || S.t.step <= 3) { renderMenu(); render(); }
  }, 30_000);
})();
