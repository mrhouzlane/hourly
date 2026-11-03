// Hourly v3. White on blue, built from the v3 reference screenshots only.
// The wallet, burner, faucet, quote and sign plumbing is copied unchanged from mac.js
// (mac.js stays in the tree as the rollback). Bundled by esbuild into public/m/v3.js.
import { getWallets } from "@wallet-standard/app";
import nacl from "tweetnacl";
import bs58 from "bs58";

// ---------- utils (from mac.js) ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const b64 = (u8) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const usd = (n, dp = 2) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
const pct = (p) => `${Math.round(p * 100)}%`;
const pctSgn = (x, dp = 1) => (x >= 0 ? "+" : "") + (x * 100).toFixed(dp) + "%";
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const day = (d) => { const t = new Date(`${d}T00:00:00Z`); return `${DOW[t.getUTCDay()]} ${MON[t.getUTCMonth()]} ${t.getUTCDate()}`; };
const dayS = (sec) => day(new Date(sec * 1000).toISOString().slice(0, 10));
const today = () => new Date().toISOString().slice(0, 10);
const monthOf = (d) => MONTH[new Date(`${d}T00:00:00Z`).getUTCMonth()];
const monShort = (d) => MON[new Date(`${d}T00:00:00Z`).getUTCMonth()];
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
const refParam = () => { try { return new URLSearchParams(location.search).get("ref"); } catch (_) { return null; } };
const refFor = () => { const r = store.get("hourly.ref"); return r && S.wallet && r !== S.wallet.address ? r : undefined; };
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { /* private mode */ } },
};
async function api(path, body) {
  const res = await fetch(`api/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  let j = {};
  try { j = await res.json(); } catch (_) { /* empty */ }
  if (!res.ok) { const e = new Error(j.error || `Request failed (${res.status})`); e.fields = j.fields; throw e; }
  return j;
}

// ---------- state ----------
const VIEWS = ["home", "desk", "index", "house", "docs", "access"];
// "portfolio" kept so old links (the Colosseum submission points at #portfolio) land on Trade, where Positions live.
const HASH = { trade: "desk", index: "index", house: "house", docs: "docs", home: "home", access: "access", portfolio: "desk" };
const qs0 = (() => { try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(); } })();
const mode0 = ["ticket", "tap", "lock"].includes(qs0.get("mode")) ? qs0.get("mode") : null;
const S = {
  status: null, index: [], meta: null, markets: [], vaults: [], activity: null, portfolio: null, wallet: null,
  view: HASH[location.hash.slice(1)] || (mode0 || qs0.get("t") ? "desk" : qs0.get("cap") ? "desk" : "home"),
  mode: mode0 || (qs0.get("cap") ? "lock" : "ticket"),
  t: { gpu: "H100_SXM", side: "lower", strike: null, seriesId: null, amount: 10, quote: null, tapAmt: 5, tapDate: null },
  hedge: { gpu: "H100_SXM", role: "own", win: null, qty: 1 }, tapSide: "lower",
  pane: "chart", deskTab: "positions", range: 30, ixChip: "H100_SXM", ixRange: "all", hchip: null,
};
const GPU_ORDER = ["H100_SXM", "H200", "B200", "A100_SXM4"];
const chips = () => GPU_ORDER.map((c) => S.index.find((g) => g.code === c)).filter(Boolean);
const gpuLabel = (c) => (S.index.find((g) => g.code === c) || {}).label || c;
const lastPrint = (c) => (S.index.find((g) => g.code === c) || {}).last;
const feeMul = () => 1 + ((S.status && S.status.feeBps) || 0) / 10000;
const isTest = () => !(S.status && S.status.cluster === "mainnet");
const short = (h, a = 8, b = 8) => (h ? `${h.slice(0, a)}…${h.slice(-b)}` : "");

// ---------- wallets (unchanged from mac.js) ----------
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
    const { createSolanaClient } = await import("@metamask/connect-solana");
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
  render();
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
  m.innerHTML = `<div class="dialog win" role="dialog" aria-modal="true"><div class="win-h"><span class="dots"><i></i><i></i><i></i></span>Hourly<span class="r">Test money</span></div><div class="in">${html}</div></div>`;
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
      ${main ? "" : '<button class="wallet" data-burner>Burner wallet (test only)</button>'}
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
    if (bb) bb.addEventListener("click", async () => { await setWallet(burnerWallet()); close(); await autoFund(); if (after) after(); });
  });
}
function ensureWallet(then) { if (S.wallet) return then(); walletPicker(then); }
async function autoFund() {
  if (!S.wallet || S.wallet.kind !== "burner" || (S.status && S.status.cluster === "mainnet")) return;
  try { if (S.portfolio && S.portfolio.usdc > 0) return; await api("faucet", { owner: S.wallet.address }); await refreshPortfolio(); render(); } catch (_) { /* the panel offers the faucet button */ }
}
async function faucet() {
  try { const r = await api("faucet", { owner: S.wallet.address }); alertBox("✓", "Added test USDC.", `${usd(r.amount, 0)} is in your wallet.`, r.url); }
  catch (e) { alertBox("!", "Faucet", esc(e.message)); }
  await refreshPortfolio(); render();
}

// ---------- chrome ----------
const COIN = '<span class="coin">USDC on Solana devnet (test)</span>';
const go = (v) => { S.view = v; try { history.replaceState(null, "", `#${Object.keys(HASH).find((k) => HASH[k] === v) || v}`); } catch (_) { /* file */ } renderMenu(); render(); window.scrollTo(0, 0); if (v === "desk" && S.wallet) refreshPortfolio().then(() => { if (S.view === "desk" && !S.t.quote) render(); }); };
// a fill can take a few seconds to show in account reads; read the portfolio again shortly after
const refreshSoon = () => setTimeout(() => refreshPortfolio().then(() => { if (S.view === "desk" && !S.t.quote) render(); }), 4000);
function renderMenu() {
  const nav = [["desk", "Trade"], ["index", "Index"], ["house", "House"], ["docs", "Docs"]];
  const ra = S.view !== "home" && S.view !== "access";
  $("#menubar").innerHTML = `
    <button data-view="home" class="brand" aria-label="Hourly"><img src="mark.svg" alt="H">ourly</button>
    <div class="mn-nav">${nav.map(([v, l]) => `<button data-view="${v}" class="${S.view === v ? "on" : ""}">${l}</button>`).join("")}</div>
    <span class="spacer"></span>
    <span class="tag">${isTest() ? "Test money" : "Mainnet"}</span>
    ${S.wallet ? `<button id="wallet-btn" title="${esc(S.wallet.address)}">${S.wallet.address.slice(0, 4)}…${S.wallet.address.slice(-4)}</button>` : ""}
    ${ra ? '<button class="ra" data-ra>Request access</button>' : ""}`;
  $$("#menubar [data-view]").forEach((b) => b.addEventListener("click", () => go(b.dataset.view)));
  const wb = $("#wallet-btn"); if (wb) wb.addEventListener("click", walletMenu);
  const r = $("#menubar [data-ra]"); if (r) r.addEventListener("click", () => go("access"));
  const bb = $("#botbar");
  if (bb) bb.textContent = S.view === "index" ? "List prices, unsigned, not yet used to pay out any contract." : "Test money. Not audited.";
}
function walletMenu() {
  dialog(`<div class="icon">◆</div><b>${esc(S.wallet.name)}</b><p class="mono">${esc(S.wallet.address)}</p>
    <div class="actions"><button class="btn default" id="dc">Disconnect</button></div>`,
  (m, close) => { $("#dc", m).addEventListener("click", async () => { await S.wallet.disconnect(); await setWallet(null); close(); }); });
}
const win = (title, body, right = "", cls = "") => `<section class="win ${cls}"><div class="win-h"><span class="dots"><i></i><i></i><i></i></span>${title}<span class="r">${right}</span></div>${body}</section>`;

// ---------- charts ----------
function areaChart(hist, { W = 1150, H = 330, R = 74, B = 30, T = 22, L = 10 } = {}) {
  if (!hist || hist.length < 2) return "";
  const v = hist.map((p) => p[1]);
  let lo = Math.min(...v), hi = Math.max(...v);
  const pad = (hi - lo || hi * 0.05) * 0.08; lo -= pad; hi += pad;
  const X = (i) => L + (i / (hist.length - 1)) * (W - L - R), Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
  const line = hist.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(" ");
  let grid = "";
  for (let i = 0; i < 5; i++) { const y = hi - ((hi - lo) * i) / 4, yy = Y(y); grid += `<line x1="${L}" x2="${W - R}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="rgba(255,255,255,.16)"/><text x="${W - R + 10}" y="${(yy + 4).toFixed(1)}">${usd(y)}</text>`; }
  const xs = [0, Math.floor((hist.length - 1) / 2), hist.length - 1];
  const xl = xs.map((i, k) => `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${day(hist[i][0])}</text>`).join("");
  const lp = [X(hist.length - 1), Y(v[v.length - 1])];
  return `<svg class="axis" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daily prints">${grid}
    <path d="${line} L${lp[0].toFixed(1)},${H - B} L${L},${H - B} Z" fill="rgba(255,255,255,.13)"/>
    <path d="${line}" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="5" fill="#fff"/>${xl}</svg>`;
}
function spark(hist) {
  const v = hist.map((p) => p[1]); if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1, W = 250, H = 62;
  const X = (i) => 2 + (i / (v.length - 1)) * (W - 6), Y = (y) => 4 + (1 - (y - lo) / r) * (H - 8);
  const line = v.map((y, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(y).toFixed(1)}`).join(" ");
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${line} L${X(v.length - 1)},${H} L2,${H} Z" fill="rgba(255,255,255,.14)"/><path d="${line}" fill="none" stroke="#fff" stroke-width="1.6" vector-effect="non-scaling-stroke"/><circle cx="${X(v.length - 1)}" cy="${Y(v[v.length - 1])}" r="2.6" fill="#fff"/></svg>`;
}

// ---------- home ----------
function orbRing() {
  let t = "";
  for (let i = 0; i < 96; i++) {
    const a = (i / 96) * Math.PI * 2, big = i % 8 === 0, r1 = big ? 188 : 194, r2 = 202;
    t += `<line x1="${(220 + r1 * Math.cos(a)).toFixed(1)}" y1="${(220 + r1 * Math.sin(a)).toFixed(1)}" x2="${(220 + r2 * Math.cos(a)).toFixed(1)}" y2="${(220 + r2 * Math.sin(a)).toFixed(1)}" stroke="rgba(255,255,255,${big ? 0.7 : 0.4})" stroke-width="${big ? 1.6 : 1}"/>`;
  }
  for (const a of [-1.62, 0.12, 1.6, 3.2]) t += `<line x1="${(220 + 172 * Math.cos(a)).toFixed(1)}" y1="${(220 + 172 * Math.sin(a)).toFixed(1)}" x2="${(220 + 218 * Math.cos(a)).toFixed(1)}" y2="${(220 + 218 * Math.sin(a)).toFixed(1)}" stroke="rgba(255,255,255,.75)" stroke-width="1.6"/>`;
  return `<svg viewBox="0 0 440 440" aria-hidden="true"><circle cx="220" cy="220" r="180" fill="none" stroke="rgba(255,255,255,.2)" stroke-dasharray="1 5"/>${t}</svg>`;
}
function homeView() {
  return `<section class="hero">
    <div class="orb">${orbRing()}<img src="v3/orb.png" alt="" width="272" height="272"></div>
    <h1>Lock the price of compute.</h1>
    <p class="hs">Next month's GPU hour, in <span class="coin">USDC on Solana devnet</span>.</p>
    <button class="pill" data-go="access">Request access</button>
    <span class="tag">Test money</span>
  </section>`;
}
function bindHome() { $$("#desk [data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go))); }

// ---------- request access ----------
const ACC = { role: ["GPU owner", "Data center", "Reseller", "Renter"], chips: ["H100", "H200", "B200", "A100"], gpuCount: ["Under 64", "64 to 511", "512 to 4k", "4k plus"] };
const accState = { role: "", chips: [], gpuCount: "" };
function accessView() {
  const grp = (k, label, multi) => `<div class="fg" data-g="${k}"><span>${label}</span><div class="ch c4">${ACC[k].map((o) => `<button type="button" data-o="${esc(o)}" class="${(multi ? accState[k].includes(o) : accState[k] === o) ? "on" : ""}">${esc(o)}</button>`).join("")}</div></div>`;
  return `<div class="acc-top"><span class="tag">Test money</span></div>
  <form class="acc" id="access" novalidate>${win("Request access", `<div class="body">
    <div class="f2"><label class="fl"><span>Company</span><input name="company" autocomplete="organization"></label><label class="fl"><span>Work email</span><input name="email" type="email" autocomplete="email"></label></div>
    ${grp("role", "You are")}${grp("chips", "Chips", true)}${grp("gpuCount", "GPU count")}
    <div class="f2"><label class="fl"><span>Contract ends<i>optional</i></span><input name="contractEnds" type="date"></label><label class="fl"><span>GPUs it covers<i>optional</i></span><input name="gpusCovered" type="number" min="0" inputmode="numeric"></label></div>
    <button class="cta white" type="submit">Request access</button>
    <p class="msg" id="acc-msg"></p></div>`, "GPU owners first")}</form>`;
}
function bindAccess() {
  const f = $("#access"); if (!f) return;
  $$("[data-g]", f).forEach((g) => $$("[data-o]", g).forEach((b) => b.addEventListener("click", () => {
    const k = g.dataset.g, o = b.dataset.o;
    if (k === "chips") accState.chips = accState.chips.includes(o) ? accState.chips.filter((x) => x !== o) : [...accState.chips, o];
    else accState[k] = accState[k] === o ? "" : o;
    $$("[data-o]", g).forEach((x) => x.classList.toggle("on", k === "chips" ? accState.chips.includes(x.dataset.o) : accState[k] === x.dataset.o));
    g.classList.remove("bad");
  })));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(f), msg = $("#acc-msg");
    $$(".bad", f).forEach((x) => x.classList.remove("bad"));
    try {
      await api("access", { ...accState, company: fd.get("company"), email: fd.get("email"), contractEnds: fd.get("contractEnds"), gpusCovered: fd.get("gpusCovered") });
      msg.className = "msg ok"; msg.textContent = "Thank you. We will be in touch.";
      f.querySelector("button[type=submit]").disabled = true;
    } catch (err) {
      msg.className = "msg err"; msg.textContent = err.message;
      const map = { company: '[name="company"]', email: '[name="email"]', role: '[data-g="role"]', chips: '[data-g="chips"]', gpuCount: '[data-g="gpuCount"]' };
      (err.fields || []).forEach((k) => { const el = map[k] && f.querySelector(map[k]); if (el) el.classList.add("bad"); });
    }
  });
}

// ---------- trade: market helpers (from mac.js) ----------
// Floor maps to the existing "lower" side, Cap to "higher".
const SIDE_LABEL = { lower: "Floor", higher: "Cap" };
const predict = () => S.markets.filter((m) => m.door === "predict" && m.status === "open" && m.model);
const sideUnit = (m, side) => (side === "higher" ? m.model.ask : Math.max(0.01, 1 - m.model.bid));
function levelsFor(gpu) { return [...new Set(predict().filter((m) => m.underlying === gpu).map((m) => m.strike))].sort((a, b) => a - b); }
function datesFor(gpu, strike) { return predict().filter((m) => m.underlying === gpu && m.strike === strike).sort((a, b) => a.expiry - b.expiry); }
const mulFor = (side) => (side === "higher" ? feeMul() : 1);
const qtyFor = (m, side, amount) => Math.max(0, Math.floor(amount / (sideUnit(m, side) * mulFor(side))));
const premiumFor = (m, side, qty) => qty * sideUnit(m, side) * mulFor(side);
function hedgeWindows(code) {
  const live = S.markets.filter((m) => m.door === "hedge" && m.status === "open" && m.underlying === code && m.model);
  return [...new Set(live.map((m) => m.windowStart))].sort().filter((w) => live.some((m) => m.kind === "put" && m.windowStart === w) && live.some((m) => m.kind === "call" && m.windowStart === w));
}
function hedgePair(code, w0) {
  const wins = hedgeWindows(code);
  if (!wins.length) return null;
  const w = wins.includes(w0) ? w0 : wins[0];
  const live = S.markets.filter((m) => m.door === "hedge" && m.status === "open" && m.underlying === code && m.model && m.windowStart === w);
  const put = live.find((m) => m.kind === "put"), call = live.find((m) => m.kind === "call");
  return put && call ? { put, call } : null;
}
function applyDeepLink() {
  const v = qs0.get("t");
  if (!v || S.dl || !S.markets.length) return;
  const [gpu, side, strike, date, amt] = v.split("~");
  S.dl = true;
  if (!gpu || !GPU_ORDER.includes(gpu)) return;
  const m = predict().find((x) => x.underlying === gpu && x.strike === Number(strike) && x.windowEnd === date);
  S.t.gpu = gpu; S.t.side = side === "higher" ? "higher" : "lower"; S.t.amount = Math.min(1000, Math.max(1, Number(amt) || 10));
  if (m) { S.t.strike = m.strike; S.t.seriesId = m.id; }
}
function applyCapLink() {
  const v = qs0.get("cap");
  if (!v || S.dlc || !S.markets.length) return;
  S.dlc = true;
  const [gpu, w, qty] = v.split("~");
  if (!GPU_ORDER.includes(gpu)) return;
  S.hedge.gpu = gpu; S.hedge.role = "rent"; if (w) S.hedge.win = w;
  S.hedge.qty = Math.min(50, Math.max(1, Math.floor(Number(qty)) || 1));
}
function deskInit() {
  applyDeepLink(); applyCapLink();
  const t = S.t;
  if (!levelsFor(t.gpu).length) t.gpu = GPU_ORDER.find((c) => levelsFor(c).length) || t.gpu;
  // open on the strike the model prices nearest 50 cents per $1, so Floor and Cap both cost well below what they pay
  const ks = levelsFor(t.gpu), mid = (k) => { const m = datesFor(t.gpu, k)[0]; return m ? Math.abs(m.model.fair - 0.5) : 1; };
  if (!ks.includes(t.strike)) { t.strike = ks.length ? ks.reduce((p, k) => (mid(k) < mid(p) ? k : p)) : null; t.seriesId = null; }
  const ds = t.strike !== null ? datesFor(t.gpu, t.strike) : [];
  if (!ds.some((m) => m.id === t.seriesId)) { t.seriesId = ds[0] ? ds[0].id : null; t.quote = null; }
}
const curMarket = () => S.markets.find((x) => x.id === S.t.seriesId) || null;

// ---------- trade view ----------
function deskView() {
  deskInit();
  const code = S.mode === "lock" ? S.hedge.gpu : S.t.gpu;
  return `<div class="pg trade"><h1>Trade the ${esc(gpuLabel(code))} hour.</h1><div class="tgrid">${exposureWindow()}${ticketWindow()}</div>${positionsWindow()}</div>`;
}
// ---------- my exposure: inputs stay in this page only (never stored, never sent) ----------
const EXP = { gpus: "64", ends: "2026-12-15", rate: "", pick: "mid" };
const RATE_PICKS = [["low", "Low"], ["mid", "Mid, the index"], ["high", "High"]];
function expRate() { if (EXP.pick === "custom") return Number(EXP.rate); const ix = expIndex(); return ix && ix.range ? Math.round(ix.range[EXP.pick] * 100) / 100 : 0; }
const HOURS_MONTH = 730;
function expIndex() {
  const d = IXP.H100; if (!d) loadPrints("H100");
  const days = (d && d.days) || [];
  return [...days].reverse().find((x) => x.value !== null) || null;
}
function exposureWindow() {
  return `<section class="win exp" id="exp"><div class="win-h"><span class="dots"><i></i><i></i><i></i></span>My exposure<span class="r"><span class="tag">Test money</span></span></div><div class="body">
    <div class="f3"><label class="fl"><span>GPUs</span><input id="x-gpus" inputmode="numeric" value="${esc(EXP.gpus)}"></label><div class="fl"><span>Chip</span><button class="chipb on" type="button">H100</button></div></div>
    <label class="fl"><span>Contract ends</span><input id="x-ends" type="date" value="${esc(EXP.ends)}"></label>
    <div class="fl"><span>Your rate today</span><div id="x-pick">${pickHtml()}</div></div>
    <div id="x-out">${expOut()}</div></div></section>`;
}
function pickHtml() {
  const ix = expIndex();
  const opt = ([k, l]) => `<button type="button" data-rp="${k}" class="${EXP.pick === k ? "on" : ""}"><span>${l}</span><b>${ix && ix.range ? usd(ix.range[k]) : "--"}</b></button>`;
  const when = ix && ix.computed_at ? new Date(ix.computed_at) : null;
  const t = when ? `${when.getUTCDate()} ${when.toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${String(when.getUTCHours()).padStart(2, "0")}:${String(when.getUTCMinutes()).padStart(2, "0")} UTC` : "";
  return `<div class="rp">${RATE_PICKS.map(opt).join("")}<button type="button" data-rp="custom" class="cust ${EXP.pick === "custom" ? "on" : ""}"><span>Custom</span><b>$</b></button></div>
    ${EXP.pick === "custom" ? `<input id="x-rate" inputmode="decimal" placeholder="$ per GPU hour" value="${esc(EXP.rate)}">` : ""}
    <p class="xi">${ix ? `Hourly Index ${usd(ix.value)}, print at ${t}, ${ix.post ? `<a href="${esc(ix.post.url)}" target="_blank" rel="noopener">onchain print</a>` : "not yet posted"}.` : "Loading the Hourly Index."}</p>`;
}
function expOut() {
  const n = Math.floor(Number(EXP.gpus)), r = expRate(), ix = expIndex();
  const ready = n > 0 && r > 0;
  const rent = ready ? n * r * HOURS_MONTH : 0;
  return `<div class="xr"><div class="xh"><i>Rent at risk this month</i><b>${ready ? usd(rent, 0) : "--"}</b></div>
    <div class="xl"><span>If rent falls 10%</span><b>${ready ? `${usd(rent * 0.1, 0)} lost` : "--"}</b></div>
    <div class="xl"><span>If rent falls 20%</span><b>${ready ? `${usd(rent * 0.2, 0)} lost` : "--"}</b></div></div>
    <div class="xbtn"><button class="cta" id="x-floor" ${ready && ix ? "" : "disabled"}>Floor these hours</button><a href="#" id="x-hand">Request a quote by hand</a></div>
    <p class="st" id="x-st"></p>`;
}
function expChanged() { const o = $("#x-out"); if (o) { o.innerHTML = expOut(); bindExpOut(); } if (S.hedge.linked && S.mode === "lock") linkFloor(false); }
function bindPick() {
  $$("[data-rp]").forEach((b) => b.addEventListener("click", () => { EXP.pick = b.dataset.rp; $("#x-pick").innerHTML = pickHtml(); bindPick(); if (EXP.pick === "custom") { const i = $("#x-rate"); if (i) i.focus(); } expChanged(); }));
  const i = $("#x-rate"); if (i) i.addEventListener("input", () => { EXP.rate = i.value; expChanged(); });
}
function bindExposure() {
  const set = (id, k) => { const el = $(id); if (el) el.addEventListener("input", () => { EXP[k] = el.value; expChanged(); }); };
  set("#x-gpus", "gpus"); set("#x-ends", "ends");
  bindPick(); bindExpOut();
}
function bindExpOut() {
  const f = $("#x-floor"); if (f) f.addEventListener("click", () => linkFloor(true));
  const h = $("#x-hand"); if (h) h.addEventListener("click", (e) => { e.preventDefault(); handQuote(); });
}
// Fill the ticket from My exposure: Lock a month, Floor, strike = index minus 10%,
// expiry nearest the contract end, size = GPUs capped by what the House can back.
// While linked, every exposure edit re-runs this; a hand edit on the ticket unlinks it.
const CAPC = {};
function floorPick() {
  const ix = expIndex(), n = Math.floor(Number(EXP.gpus));
  const puts = S.markets.filter((m) => m.door === "hedge" && m.status === "open" && m.underlying === "H100_SXM" && m.kind === "put" && m.model);
  if (!ix || !puts.length || !(n > 0)) return null;
  const end = EXP.ends ? Date.parse(`${EXP.ends}T00:00:00Z`) : Date.now();
  const gap = (m) => { const a = Date.parse(`${m.windowStart}T00:00:00Z`), b = Date.parse(`${m.windowEnd}T23:59:59Z`); return end >= a && end <= b ? 0 : Math.min(Math.abs(end - a), Math.abs(end - b)); };
  const win = puts.slice().sort((x, y) => gap(x) - gap(y))[0].windowStart;
  if (!ix.range) return null;
  const target = Math.round(ix.range.mid * 0.9 * 100) / 100; // index Mid minus 10%
  const m = puts.filter((x) => x.windowStart === win).reduce((p, x) => (Math.abs(x.strike - target) < Math.abs(p.strike - target) ? x : p));
  return { m, win, target, n };
}
function capFor(c) { return c ? Math.min(c.maxPerTrade, c.vault && c.vault.contracts > 0 ? c.vault.contracts : c.desk) : 50; }
async function linkFloor(flash) {
  const st = $("#x-st"), pk = floorPick();
  if (!pk) { if (flash && st) st.textContent = "No month is open to floor right now."; return; }
  const { m, win, target, n } = pk;
  const apply = () => {
    const qty = Math.max(1, Math.min(n, capFor(CAPC[m.id])));
    Object.assign(S.hedge, { gpu: "H100_SXM", role: "own", win, sid: m.id, qty, target, asked: n, linked: true, edited: false });
    S.mode = "lock"; S.t.quote = null;
    renderTicket();
  };
  apply(); // instant, with the cached House size (or the 50 per trade limit)
  if (!(m.id in CAPC)) { try { CAPC[m.id] = await api(`capacity?series=${m.id}`); } catch (_) { CAPC[m.id] = null; } if (S.hedge.linked && S.hedge.sid === m.id) apply(); }
  if (st) st.textContent = "";
  if (!flash) return;
  const tk = $("#ticket"); if (tk) { tk.classList.remove("flash"); void tk.offsetWidth; tk.classList.add("flash"); if (innerWidth < 760) tk.scrollIntoView({ behavior: "smooth" }); }
}
function unlink() { if (S.hedge.linked) { S.hedge.linked = false; S.hedge.edited = true; } S.hedge.target = null; S.hedge.asked = null; }
const HAND_KEY = "hourly.handquotes";
function handQuote() {
  dialog(`<div class="icon">✎</div><b>Request a quote by hand</b><p class="small">Saved on this device only. Nothing is sent.</p>
    <div class="hq"><label>Owner<input id="hq-owner" autocomplete="organization"></label><label>Open hours<input id="hq-hours" inputmode="numeric" value="${Math.floor(Number(EXP.gpus)) > 0 ? Math.floor(Number(EXP.gpus)) * HOURS_MONTH : ""}"></label><label>Window<input id="hq-window" placeholder="Dec 1 to Dec 31"></label><label>Rate, $ per GPU hour<input id="hq-rate" inputmode="decimal" value="${expRate() > 0 ? expRate().toFixed(2) : ""}"></label></div>
    <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn default" id="hq-save">Save</button></div>`,
  (m, close) => $("#hq-save", m).addEventListener("click", () => {
    let list = []; try { list = JSON.parse(store.get(HAND_KEY) || "[]"); } catch (_) { list = []; }
    list.push({ at: new Date().toISOString(), owner: $("#hq-owner", m).value, hours: $("#hq-hours", m).value, window: $("#hq-window", m).value, rate: $("#hq-rate", m).value });
    store.set(HAND_KEY, JSON.stringify(list.slice(-50)));
    close(); alertBox("✓", "Saved.", `Quote request saved on this device (${list.length} saved).`);
  }));
}
function chipRow(codes, cur, attr) {
  return `<div class="lab">Chip</div><div>${codes.map((c) => `<button class="chipb ${c === cur ? "on" : ""}" ${attr}="${c}">${esc(gpuLabel(c))}</button>`).join("")}</div>`;
}
const sideRow = (side, attr = "data-side") => `<div class="side"><button ${attr}="lower" class="${side === "lower" ? "on" : ""}">Floor</button><button ${attr}="higher" class="${side === "higher" ? "on" : ""}">Cap</button></div>`;
function ticketWindow() {
  const modes = `<div class="modes">${[["ticket", "Ticket"], ["tap", "One tap"], ["lock", "Lock a month"]].map(([k, l]) => `<button data-mode="${k}" class="${S.mode === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  const body = S.mode === "lock" ? lockHtml() : S.t.quote ? firmHtml() : S.mode === "tap" ? tapHtml() : ticketHtml();
  return `<section class="win tk" id="ticket"><div class="win-h"><span class="dots"><i></i><i></i><i></i></span>Ticket<span class="r"><span class="tag">Test money</span></span></div><div class="body">${modes}${body}</div></section>`;
}
function ticketHtml() {
  const t = S.t, ks = levelsFor(t.gpu), ds = t.strike !== null ? datesFor(t.gpu, t.strike) : [], m = curMarket();
  const codes = GPU_ORDER.filter((c) => levelsFor(c).length);
  const head = `${chipRow(codes.length ? codes : [t.gpu], t.gpu, "data-gpu")}${sideRow(t.side)}
    <div class="lab">Strike</div><div class="ch c3 strk">${ks.map((k) => `<button data-k="${k}" class="${k === t.strike ? "on" : ""}">$${k.toFixed(2)}</button>`).join("")}</div>
    <div class="lab">Date</div><div class="ch c2 dates">${ds.map((x) => `<button data-d="${x.id}" class="${x.id === t.seriesId ? "on" : ""}">${day(x.windowEnd)}</button>`).join("")}</div>`;
  if (!m) return `${head}<p class="st">No open market here. Pick another price.</p>`;
  const qty = qtyFor(m, t.side, t.amount), prem = premiumFor(m, t.side, qty);
  return `${head}
    <div class="lab">Amount</div>
    <div class="amt"><label>$<input id="amt" inputmode="decimal" value="${t.amount}" aria-label="Amount in USDC"></label>${[5, 20, 50, 100].map((v) => `<button data-amt="${v}" class="${t.amount === v ? "on" : ""}">$${v}</button>`).join("")}</div>
    <div class="pp"><div><i>Premium</i><b id="prem">${usd(prem)}</b></div><div><i>Pays up to</i><b id="payu">${usd(qty)}</b></div></div>
    <button class="cta" id="t-go" ${qty > 0 ? "" : "disabled"}>${t.quoting ? "Getting a firm price" : "Get a firm price"}</button>
    <p class="st" id="t-st">${t.qerr ? esc(t.qerr) : ""}</p>`;
}
function tapHtml() {
  const t = S.t, ms = predict().filter((m) => m.underlying === t.gpu);
  const codes = GPU_ORDER.filter((c) => levelsFor(c).length);
  const dates = [...new Set(ms.map((m) => m.windowEnd))].sort();
  const head = chipRow(codes.length ? codes : [t.gpu], t.gpu, "data-gpu");
  if (!dates.length) return `${head}<p class="st">No open market here yet.</p>`;
  if (!dates.includes(t.tapDate)) t.tapDate = dates[0];
  const last = lastPrint(t.gpu) || 0;
  const rows = ms.filter((m) => m.windowEnd === t.tapDate).sort((a, b) => Math.abs(a.strike - last) - Math.abs(b.strike - last)).slice(0, 3).sort((a, b) => a.strike - b.strike);
  const btn = (m, side) => { const q = qtyFor(m, side, t.tapAmt); return `<button data-tap="${m.id}" data-tside="${side}" ${q > 0 ? "" : "disabled"}><span>${SIDE_LABEL[side]}</span><b>Premium ${usd(premiumFor(m, side, q))}</b><i>Pays up to ${usd(q)}</i></button>`; };
  return `${head}
    <div class="lab">Date</div><div class="ch c2 dates">${dates.map((d) => `<button data-tdate="${d}" class="${d === t.tapDate ? "on" : ""}">${day(d)}</button>`).join("")}</div>
    <div class="lab">Amount</div><div class="amt" style="grid-template-columns:repeat(3,auto);justify-content:start">${[5, 10, 25].map((v) => `<button data-tamt="${v}" class="${t.tapAmt === v ? "on" : ""}">$${v}</button>`).join("")}</div>
    <div class="taps">${rows.map((m) => `<div class="row"><div>Strike <b>$${m.strike.toFixed(2)}</b> · ${day(m.windowEnd)}</div><div class="bs">${btn(m, "lower")}${btn(m, "higher")}</div></div>`).join("")}</div>
    <p class="st" id="t-st">${t.qerr ? esc(t.qerr) : ""}</p>`;
}
function firmHtml() {
  const t = S.t, q = t.quote, m = curMarket(), up = t.side === "higher";
  const put = up ? q.pay + q.fee : q.lock - q.receive, left = Math.max(0, 40 - Math.round((Date.now() - t.quotedAt) / 1000));
  return `${chipRow([t.gpu], t.gpu, "data-x")}${sideRow(t.side, "data-x")}
    <div class="lab">Strike</div><span class="solo">$${m ? m.strike.toFixed(2) : ""} /hr</span>
    <div class="lab">Date</div><span class="solo">${m ? day(m.windowEnd) : ""}</span>
    <div class="pp"><div><i>Premium</i><b>${usd(put)}</b></div><div><i>Pays up to</i><b>${usd(q.legs[0].qty)}</b></div></div>
    <p class="firm">Firm price, held <b id="qtm">${left}s</b>. ${q.legs[0].qty} contracts${q.fee ? `, fee ${usd(q.fee)}` : ""}, filled by ${q.legs[0].via === "vault" ? "the weekly vault" : "the venue desk"}.</p>
    <button class="cta white" id="t-sign">Sign with wallet</button><button class="cta line" id="t-back">Change</button>
    <p class="st" id="t-st"></p>`;
}
function lockMarkets() {
  const h = S.hedge, codes = GPU_ORDER.filter((c) => hedgePair(c));
  if (!codes.length) return null;
  if (!codes.includes(h.gpu)) h.gpu = codes[0];
  const wins = hedgeWindows(h.gpu); if (!wins.includes(h.win)) h.win = wins[0];
  const kind = h.role === "own" ? "put" : "call";
  const list = S.markets.filter((m) => m.door === "hedge" && m.status === "open" && m.underlying === h.gpu && m.model && m.windowStart === h.win && m.kind === kind).sort((a, b) => a.strike - b.strike);
  let m = list.find((x) => x.id === h.sid);
  if (!m) { m = list[kind === "put" ? list.length - 1 : 0]; h.sid = m && m.id; }
  return { codes, list, m };
}
function lockHtml() {
  const h = S.hedge, side = h.role === "own" ? "lower" : "higher";
  const lm = lockMarkets();
  if (!lm || !lm.m) return `${chipRow([h.gpu], h.gpu, "data-hg")}${sideRow(side, "data-hrole")}<p class="st">No month is open to lock right now.</p>`;
  const { codes, list, m } = lm, own = h.role === "own", qn = h.qty || 1;
  const price = m.model.ask * feeMul(), prem = price * qn;
  const earns = own ? m.strike - price / m.units : null;
  const note = own && h.target && Math.abs(h.target - m.strike) > 0.001 ? `<p class="xi">Target $${h.target.toFixed(2)}, nearest listed strike $${m.strike.toFixed(2)}.</p>` : "";
  const capNote = h.asked && h.asked > qn ? `<p class="xi">${qn} of ${h.asked} GPUs, capped by what the House can back per trade.</p>` : "";
  return `${chipRow(codes, h.gpu, "data-hg")}${sideRow(side, "data-hrole")}
    <div class="lab">Strike</div><div class="ch c4 strk">${list.map((x) => `<button data-hs="${x.id}" class="${x.id === m.id ? "on" : ""}">$${x.strike.toFixed(2)}</button>`).join("")}</div>${note}
    <div class="lab">Date</div><span class="solo">${day(m.windowStart)} to ${day(m.windowEnd)}</span>
    <div class="lab">Amount</div><span class="solo">${qn} GPU${qn > 1 ? "s" : ""}, ${(qn * m.units).toLocaleString("en-US")} hours</span>${capNote}
    ${h.linked ? `<p class="lnk">Covering ${qn} GPU${qn > 1 ? "s" : ""} × ${HOURS_MONTH} h from My exposure</p>` : h.edited ? `<p class="lnk">Edited by hand <button class="mini" id="relink">Relink</button></p>` : ""}
    <div class="pp"><div><i>Premium</i><b>${usd(prem)}</b></div><div><i>Pays up to</i><b>${usd(m.maxPayoff * qn, 0)}</b></div></div>
    ${own ? `<p class="xe">Earns at least <b>${usd(earns)} per GPU hour</b>: strike minus Premium per hour.</p>` : ""}
    <button class="cta" id="hedge-go">Lock ${monthOf(m.windowStart)}</button>
    <p class="st" id="h-st"></p>`;
}
function positionsWindow() {
  if (!S.wallet) return "";
  const p = S.portfolio;
  const bal = `<div class="bal"><span>Balance <b>${p ? usd(p.usdc, 0) : "--"}</b></span><span>${p ? p.rows.filter((r) => r.status === "open" && (r.long || r.short)).length : "--"} open</span><span class="spacer"></span>${isTest() ? '<button class="mini" id="pf-faucet">Add test USDC</button>' : ""}</div>`;
  let body;
  if (!p) body = '<p class="empty">Loading.</p>';
  else {
    const rows = p.rows.map((r) => {
      const pred = r.door === "predict";
      const name = pred ? `${r.gpu} ${r.long && r.short ? "floor and cap" : r.short ? "floor" : "cap"} $${r.strike.toFixed(2)}` : `${r.gpu} ${monthOf(r.windowStart)} ${r.kind === "put" ? "floor" : "cap"} $${r.strike.toFixed(2)}`;
      const when = pred ? day(r.windowEnd) : monthOf(r.windowStart);
      const value = r.status === "settled" ? `paid out at $${r.settled.price.toFixed(4)}` : usd((r.markPerContract ?? 0) * (r.long - r.short));
      const rule = pred ? `Pays out on the third party index print for ${day(r.windowEnd)}, read by Switchboard. Not the Hourly Index yet.` : `Pays out on the third party index average for ${monthOf(r.windowStart)}, read by Switchboard. Not the Hourly Index yet.`;
      return `<tr><td>${esc(name)}<div class="muted">${when} · ${r.status === "open" ? `closes in ${countdown(r.tradingEnd)}` : r.status === "settled" ? "paid out" : esc(r.status)}</div><div class="muted rule">${rule}</div></td><td>${r.long ? `long ${r.long}` : ""} ${r.short ? `short ${r.short}` : ""}</td><td class="r">${value}</td><td class="r">${actions(r)}</td></tr>`;
    }).join("");
    const vrows = (p.vaults || []).map((v) => `<tr><td>Weekly vault, epoch ${v.epoch}<div class="muted">${esc(v.phase)}</div></td><td>${pct(v.share)}</td><td class="r">${usd(v.cashValue)}</td><td class="r">${v.phase === "withdrawable" ? `<button class="mini" data-vw="${v.epoch}">Withdraw</button>` : ""}</td></tr>`).join("");
    body = rows || vrows ? `<table class="tb"><tr><th>Position</th><th>Side</th><th class="r">Value</th><th></th></tr>${rows}${vrows}</table>` : '<p class="empty">Nothing yet. Your first ticket shows up here.</p>';
  }
  return win("Positions", bal + body, "", "pos");
}
function actions(r) {
  let a = "";
  if (r.status === "settled") {
    if (r.long > 0) a += `<button class="mini" data-act="redeem" data-s="${r.id}">Redeem ${usd(r.redeemable)}</button> `;
    if (r.short > 0) a += `<button class="mini" data-act="reclaim" data-s="${r.id}">Reclaim ${usd(r.reclaimable)}</button>`;
  } else { const both = Math.min(r.long, r.short); if (both > 0) a = `<button class="mini" data-act="close" data-s="${r.id}" data-q="${both}">Close ${both}</button>`; }
  return a;
}
function renderTicket() { const el = $("#ticket"); if (el) { el.outerHTML = ticketWindow(); bindTicket(); } }
function bindTicket() {
  const reset = () => { S.t.quote = null; S.t.qerr = null; };
  $$("[data-mode]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.mode !== S.mode) unlink(); S.mode = b.dataset.mode; reset(); render(); }));
  $$("#ticket [data-gpu]").forEach((b) => b.addEventListener("click", () => { S.t.gpu = b.dataset.gpu; S.t.strike = null; S.t.seriesId = null; reset(); render(); }));
  $$("[data-side]").forEach((b) => b.addEventListener("click", () => { S.t.side = b.dataset.side; reset(); renderTicket(); }));
  $$("[data-k]").forEach((b) => b.addEventListener("click", () => { S.t.strike = Number(b.dataset.k); S.t.seriesId = null; reset(); deskInit(); renderTicket(); }));
  $$("[data-d]").forEach((b) => b.addEventListener("click", () => { S.t.seriesId = b.dataset.d; reset(); renderTicket(); }));
  const input = $("#amt");
  if (input) {
    const update = () => {
      S.t.amount = Math.max(0, Number(input.value) || 0);
      const m = curMarket(); if (!m) return;
      const qty = qtyFor(m, S.t.side, S.t.amount);
      $("#prem").textContent = usd(premiumFor(m, S.t.side, qty)); $("#payu").textContent = usd(qty);
      const g = $("#t-go"); if (g) g.disabled = qty <= 0;
      $$("[data-amt]").forEach((b) => b.classList.toggle("on", Number(b.dataset.amt) === S.t.amount));
    };
    input.addEventListener("input", update);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const g = $("#t-go"); if (g && !g.disabled) g.click(); } });
    $$("[data-amt]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.amt; update(); }));
  }
  const g = $("#t-go"); if (g) g.addEventListener("click", () => ensureWallet(deskQuote));
  $$("[data-tdate]").forEach((b) => b.addEventListener("click", () => { S.t.tapDate = b.dataset.tdate; reset(); renderTicket(); }));
  $$("[data-tamt]").forEach((b) => b.addEventListener("click", () => { S.t.tapAmt = Number(b.dataset.tamt); reset(); renderTicket(); }));
  $$("[data-tap]").forEach((b) => b.addEventListener("click", () => {
    const m = S.markets.find((x) => x.id === b.dataset.tap); if (!m) return;
    S.t.side = b.dataset.tside; S.t.strike = m.strike; S.t.seriesId = m.id; S.t.amount = S.t.tapAmt;
    ensureWallet(deskQuote);
  }));
  const sign = $("#t-sign"); if (sign) sign.addEventListener("click", deskSign);
  const back = $("#t-back"); if (back) back.addEventListener("click", () => { S.t.quote = null; renderTicket(); });
  $$("[data-hrole]").forEach((b) => b.addEventListener("click", () => { S.hedge.role = b.dataset.hrole === "lower" ? "own" : "rent"; S.hedge.sid = null; unlink(); renderTicket(); }));
  $$("[data-hs]").forEach((b) => b.addEventListener("click", () => { S.hedge.sid = b.dataset.hs; unlink(); renderTicket(); }));
  $$("[data-hg]").forEach((b) => b.addEventListener("click", () => { S.hedge.gpu = b.dataset.hg; S.hedge.qty = 1; unlink(); render(); }));
  const rl = $("#relink"); if (rl) rl.addEventListener("click", () => linkFloor(true));
  const hg = $("#hedge-go"); if (hg) hg.addEventListener("click", () => ensureWallet(lockQuote));
}
// unchanged from mac.js deskQuote / deskSign
async function deskQuote() {
  const t = S.t, m = curMarket();
  if (!m || !S.wallet) return;
  const qty = qtyFor(m, t.side, t.amount); if (qty <= 0) return;
  t.quoting = true; t.qerr = null; renderTicket();
  try {
    t.quote = await api("quote", { owner: S.wallet.address, ref: refFor(), legs: [{ series: m.id, side: t.side === "higher" ? "buy" : "sell", qty }] });
    t.quotedAt = Date.now();
  } catch (e) { t.quote = null; t.qerr = e.message; }
  t.quoting = false; renderTicket();
  if (t.qerr && /faucet/i.test(t.qerr)) {
    const st = $("#t-st");
    if (st) { st.innerHTML = `${esc(t.qerr)} <button id="fz">Add test USDC</button>`; $("#fz").addEventListener("click", async () => { await faucet(); deskQuote(); }); }
  }
}
async function deskSign() {
  const t = S.t;
  if (!t.quote) return;
  if (Date.now() - t.quotedAt > 40_000) { t.quote = null; return deskQuote(); }
  const b = $("#t-sign"); b.disabled = true; b.textContent = S.wallet.kind === "burner" ? "Signing" : "Approve in your wallet";
  try {
    const r = await signAndSubmit(t.quote);
    const m = curMarket();
    const q = t.quote, paid = t.side === "higher" ? q.pay + q.fee : q.lock - q.receive;
    alertBox("✓", "Bought.", `${esc(gpuLabel(t.gpu))} ${SIDE_LABEL[t.side].toLowerCase()} at $${m.strike.toFixed(2)} on ${day(m.windowEnd)}. Premium ${usd(paid)}, pays up to ${usd(q.legs[0].qty)}. It's in your positions.`, r.url);
    t.quote = null;
    await Promise.all([refreshMarkets(), refreshPortfolio(), refreshActivity()]); refreshSoon();
    render();
  } catch (e) { t.qerr = e.message || "The wallet declined."; t.quote = null; renderTicket(); }
}
// same quote and sign flow as mac.js bindHedge, on the chosen strike and size
async function lockQuote() {
  const lm = lockMarkets(); if (!lm || !lm.m) return;
  const m = lm.m, qty = S.hedge.qty || 1, own = S.hedge.role === "own";
  const st = $("#h-st"), gb = $("#hedge-go");
  try {
    st.textContent = "Getting a firm price.";
    const q = await api("quote", { owner: S.wallet.address, ref: refFor(), legs: [{ series: m.id, side: "buy", qty }] });
    dialog(`<div class="icon">?</div><b>Confirm</b>
      <div class="lines">
        <div><span>${own ? "Floor" : "Cap"} ${esc(m.gpu)} ${monthOf(m.windowStart)} at $${m.strike.toFixed(2)}, ${qty} GPU${qty > 1 ? "s" : ""}</span></div>
        ${q.fee ? `<div><span>Fee</span><span>${usd(q.fee)}</span></div>` : ""}
        <div class="big2"><span>Premium</span><span>${usd(q.pay + (q.fee || 0) - (q.receive || 0))}</span></div>
        <div><span>Pays up to</span><span>${usd(m.maxPayoff * qty, 0)}</span></div>
      </div>
      <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn default" id="ok">Sign with wallet</button></div>`,
    (dm, close) => $("#ok", dm).addEventListener("click", async () => {
      close();
      try { const r = await signAndSubmit(q); alertBox("✓", "Bought.", `${own ? "Floor" : "Cap"} on ${qty} ${esc(m.gpu)} GPU${qty > 1 ? "s" : ""} for ${monthOf(m.windowStart)} at $${m.strike.toFixed(2)}. Premium ${usd(q.pay + (q.fee || 0))}, pays up to ${usd(m.maxPayoff * qty, 0)}. It's in your positions.`, r.url); await Promise.all([refreshMarkets(), refreshPortfolio(), refreshActivity()]); refreshSoon(); render(); }
      catch (e) { alertBox("!", "Not sent.", esc(e.message)); }
    }));
    st.textContent = "";
  } catch (e) {
    if (/faucet/i.test(e.message) && !gb._funded && S.wallet.kind === "burner") { gb._funded = true; await autoFund(); return lockQuote(); }
    st.textContent = e.message;
  }
}
setInterval(() => {
  if (S.view !== "desk" || !S.t.quote) return;
  const left = 40 - Math.round((Date.now() - S.t.quotedAt) / 1000);
  if (left <= 0) { S.t.quote = null; S.t.qerr = "That price expired. Get a fresh one."; renderTicket(); return; }
  const el = $("#qtm"); if (el) el.textContent = `${left}s`;
}, 1000);
function bindPortfolio() {
  const f = $("#pf-faucet"); if (f) f.addEventListener("click", faucet);
  $$("[data-act]").forEach((b) => b.addEventListener("click", async () => {
    try { const r = await signAndSubmit(await api("action", { type: b.dataset.act, series: b.dataset.s, owner: S.wallet.address, qty: b.dataset.q ? Number(b.dataset.q) : undefined })); alertBox("✓", "Done.", "Your positions are updated.", r.url); }
    catch (e) { alertBox("!", "Not sent.", esc(e.message)); }
    await refreshPortfolio(); render();
  }));
  $$("[data-vw]").forEach((b) => b.addEventListener("click", async () => {
    try { const r = await signAndSubmit(await api("vault", { type: "withdraw", epoch: Number(b.dataset.vw), owner: S.wallet.address })); alertBox("✓", "Withdrawn.", "The USDC is in your wallet.", r.url); }
    catch (e) { alertBox("!", "Not sent.", esc(e.message)); }
    await refreshPortfolio(); render();
  }));
}
function bindDesk() { bindExposure(); bindTicket(); bindPortfolio(); }

// ---------- index ----------
// Prints come from the index engine (offchain sources); each print's Memo post on devnet is the onchain part.
const IXP = {};
async function loadPrints(label) {
  if (IXP[label]) return;
  IXP[label] = { loading: true };
  try { IXP[label] = await api(`index/prints?gpu=${encodeURIComponent(label)}`); } catch (e) { IXP[label] = { error: e.message }; }
  if (S.view === "index") render();
  else if (S.view === "desk") { const pk = $("#x-pick"); if (pk) { pk.innerHTML = pickHtml(); bindPick(); } const o = $("#x-out"); if (o) { o.innerHTML = expOut(); bindExpOut(); } }
}
const utcTime = (iso) => (iso ? `${iso.slice(11, 16)} UTC` : "");
const shortKey = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : "");
const exAddr = (a) => `https://explorer.solana.com/address/${a}?cluster=devnet`;
function onchainLink(d) {
  return d.post ? `<a href="${esc(d.post.url)}" target="_blank" rel="noopener">posted on Solana, slot ${d.post.slot}</a>` : '<span class="tag ghost">offchain</span>';
}
function sourcesHtml(d, data) {
  const m = data.method || {}, w = m.winsorize_pct || [10, 90], b = d.bounds || [];
  const rows = (d.providers || []).map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${usd(x.usd_hr, 4)}</td><td>${x.fetched_at ? `${day(x.fetched_at.slice(0, 10))} ${utcTime(x.fetched_at)}` : ""}</td><td>${x.clamped ? `clamped to ${usd(x.usd_hr > (b[1] || 0) ? b[1] : b[0], 2)}` : ""}</td></tr>`).join("");
  return `<div class="src">
    <table class="tb"><tr><th>Source</th><th class="r">Price per GPU hour</th><th>Read at</th><th>Note</th></tr>${rows}</table>
    <p><b>Rule.</b> Each source counts once: the median of its on demand list prices. Values outside the ${w[0]}th to ${w[1]}th percentile are clamped to the edge${b.length ? ` (${usd(b[0])} to ${usd(b[1])})` : ""}, not dropped. The print is the equal weight average of the ${d.n_providers} sources. Hyperscalers are excluded. At least ${m.min_providers || 5} sources per print. Method ${esc(m.version || "")}.</p>
    <p><b>Input hash.</b> <span class="mono">sha256 ${esc(d.inputs_sha256 || "")}</span></p>
    <p><b>Publisher key.</b> ${data.publisher ? `<a href="${exAddr(data.publisher)}" target="_blank" rel="noopener" class="mono">${esc(data.publisher)}</a>` : "none"}. The sources are offchain; the posted print is onchain.</p>
  </div>`;
}
const rangeTxt = (r) => (r ? `${usd(r.low)} to ${usd(r.high)}, mid ${usd(r.mid)}, ${r.n} sources` : "no print");
const lastRanged = (days) => [...(days || [])].reverse().find((x) => x.value !== null && x.range) || null;
// Band chart: shaded 25th to 75th percentile, a line for the median. Missing days break the band.
function rangeChart(days, { W = 1150, H = 330, R = 74, B = 30, T = 22, L = 10, axis = true } = {}) {
  if (!days || days.length < 2) return "";
  const pts = days.map((d) => (d.value !== null && d.range ? d.range : null));
  const ok = pts.filter(Boolean); if (ok.length < 2) return "";
  let lo = Math.min(...ok.map((r) => r.low)), hi = Math.max(...ok.map((r) => r.high));
  const pad = (hi - lo || hi * 0.05) * 0.08; lo -= pad; hi += pad;
  const X = (i) => L + (i / (days.length - 1)) * (W - L - R), Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
  const segs = []; let cur = [];
  pts.forEach((r, i) => { if (r) cur.push([i, r]); else if (cur.length) { segs.push(cur); cur = []; } });
  if (cur.length) segs.push(cur);
  const lone = segs.filter((sg) => sg.length === 1).map(([[i, r]]) => `<line x1="${X(i).toFixed(1)}" x2="${X(i).toFixed(1)}" y1="${Y(r.high).toFixed(1)}" y2="${Y(r.low).toFixed(1)}" stroke="rgba(255,255,255,.35)" stroke-width="${axis ? 6 : 3}" ${axis ? "" : 'vector-effect="non-scaling-stroke"'}/>`).join("");
  const band = segs.filter((sg) => sg.length > 1).map((sg) => `M${sg.map(([i, r]) => `${X(i).toFixed(1)},${Y(r.high).toFixed(1)}`).join(" L")} L${sg.slice().reverse().map(([i, r]) => `${X(i).toFixed(1)},${Y(r.low).toFixed(1)}`).join(" L")} Z`).join(" ");
  const mid = segs.map((sg) => `M${sg.map(([i, r]) => `${X(i).toFixed(1)},${Y(r.mid).toFixed(1)}`).join(" L")}`).join(" ");
  let grid = "", xl = "";
  if (axis) {
    for (let i = 0; i < 5; i++) { const y = hi - ((hi - lo) * i) / 4, yy = Y(y); grid += `<line x1="${L}" x2="${W - R}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}" stroke="rgba(255,255,255,.16)"/><text x="${W - R + 10}" y="${(yy + 4).toFixed(1)}">${usd(y)}</text>`; }
    xl = [0, Math.floor((days.length - 1) / 2), days.length - 1].map((i, k) => `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${k === 0 ? "start" : k === 2 ? "end" : "middle"}">${day(days[i].day)}</text>`).join("");
  }
  const li = pts.map((r, i) => (r ? i : -1)).filter((i) => i >= 0).pop();
  return `<svg class="axis" viewBox="0 0 ${W} ${H}" ${axis ? "" : 'preserveAspectRatio="none"'} role="img" aria-label="Daily range, low to high, with the mid">${grid}
    <path d="${band}" fill="rgba(255,255,255,.18)"/>${lone}
    <path d="${mid}" fill="none" stroke="#fff" stroke-width="${axis ? 2 : 1.6}" stroke-linejoin="round" ${axis ? "" : 'vector-effect="non-scaling-stroke"'}/>
    ${axis ? `<circle cx="${X(li).toFixed(1)}" cy="${Y(pts[li].mid).toFixed(1)}" r="5" fill="#fff"/>` : ""}${xl}</svg>`;
}
function indexView() {
  const cs = chips();
  const g = S.index.find((x) => x.code === S.ixChip) || cs[0];
  if (!g) return '<div class="pg"><h1>Hourly Index</h1></div>';
  cs.forEach((c) => { if (!IXP[c.label]) loadPrints(c.label); });
  const data = IXP[g.label], days = (data && data.days) || [];
  const last = lastRanged(days);
  const panel = `<div class="ixg">${cs.map((c) => { const d = IXP[c.label], l = d && lastRanged(d.days);
    return `<button class="ixc ${c.code === g.code ? "on" : ""}" data-ix="${c.code}"><div class="h"><b>${esc(c.label)}</b><span>${l ? usd(l.range.mid) : "--"}<small>index</small></span></div>
      ${d && d.days ? rangeChart(d.days.slice(-90), { W: 250, H: 62, R: 2, B: 3, T: 3, L: 2, axis: false }) : '<svg viewBox="0 0 250 62"></svg>'}
      <div class="c">${l ? `${usd(l.range.low)} to ${usd(l.range.high)}, ${l.range.n} sources` : d && d.error ? esc(d.error) : "Loading."}</div></button>`; }).join("")}</div>
    <div class="ixg deals">${cs.map((c) => { const d = IXP[c.label], td = (d && d.termDeals) || [];
      return `<div class="ixc"><div class="h"><b>${esc(c.label)}</b><i>Term deals</i></div><div class="c">${td.length ? td.map((x) => `${usd(x.usd_hr)} for ${esc(x.term)}, <a href="${esc(x.source_url)}" target="_blank" rel="noopener">source</a>`).join("<br>") : "No deals yet"}</div></div>`; }).join("")}</div>`;
  const seg = `<span class="seg">${cs.map((c) => `<button data-ix="${c.code}" class="${c.code === g.code ? "on" : ""}">${esc(c.label)}</button>`).join("")}</span>`;
  const rg = S.ixRange === "all" ? days : days.slice(-Number(S.ixRange));
  const big = last ? `<section class="win ixbig"><div class="bh">${seg}<span class="seg">${[["30", "30d"], ["90", "90d"], ["all", "All"]].map(([k, l]) => `<button data-ixr="${k}" class="${S.ixRange === k ? "on" : ""}">${l}</button>`).join("")}</span></div>
      <button class="num rng" id="ix-open" aria-expanded="${S.ixOpen ? "true" : "false"}"><b>${esc(g.label)}</b> ${usd(last.range.low)} to ${usd(last.range.high)}<small>mid ${usd(last.range.mid)}, the Hourly Index, ${last.range.n} sources</small></button>
      <p class="when">Print for ${day(last.day)}, computed ${day(last.computed_at.slice(0, 10))} ${utcTime(last.computed_at)}. Mid is the Hourly Index print. Low and High are the 25th and 75th percentile of the sources. ${onchainLink(last)}</p>
      ${rangeChart(rg, innerWidth < 760 ? { W: 560, H: 300, R: 58 } : {})}
      <p class="hint">${S.ixOpen ? "Where this range comes from:" : "Click the range to see each source."}</p>
      ${S.ixOpen ? sourcesHtml(last, data) : ""}</section>` : `<section class="win ixbig"><div class="bh">${seg}</div><p class="when">${data && data.error ? esc(data.error) : "Loading prints."}</p></section>`;
  const recent = days.slice(-30).reverse().map((d) => (d.value === null || !d.range)
    ? `<tr class="gap"><td>${day(d.day)}</td><td colspan="5">no print</td></tr>`
    : `<tr><td>${day(d.day)}</td><td class="r">${usd(d.range.low)}</td><td class="r">${usd(d.range.mid)}</td><td class="r">${usd(d.range.high)}</td><td class="r">${d.range.n}</td><td>${d.post ? `<a href="${esc(d.post.url)}" target="_blank" rel="noopener">slot ${d.post.slot}</a>` : '<span class="tag ghost">offchain</span>'}</td></tr>`).join("");
  return `<div class="pg">
    <h1>Hourly Index</h1>
    <p class="sub">USD per GPU hour, as a range across sources. One print a day per chip.</p>
    ${panel}
    ${big}
    ${win(`Recent prints, ${esc(g.label)}`, `<table class="tb"><tr><th>Day</th><th class="r">Low</th><th class="r">Mid</th><th class="r">High</th><th class="r">Sources</th><th>Onchain</th></tr>${recent}</table>`, "Daily, gaps shown", "big")}
  </div>`;
}
function bindIndex() {
  $$("[data-ix]").forEach((b) => b.addEventListener("click", () => { S.ixChip = b.dataset.ix; render(); }));
  $$("[data-ixr]").forEach((b) => b.addEventListener("click", () => { S.ixRange = b.dataset.ixr; render(); }));
  const o = $("#ix-open"); if (o) o.addEventListener("click", () => { S.ixOpen = !S.ixOpen; render(); });
}

// ---------- house ----------
function houseView() {
  const vs = S.vaults.slice().sort((a, b) => a.epoch - b.epoch);
  const cur = vs.find((v) => v.phase === "trading") || vs[vs.length - 1];
  const prem = vs.reduce((a, v) => a + v.premiums, 0), open = vs.reduce((a, v) => a + v.openSeries, 0);
  const rows = vs.map((v) => `<tr><td>${v.epoch}</td><td>${dayS(v.epochEnd)}</td><td>${esc(v.phase)}</td><td class="r">${usd(v.deposits, 0)}</td><td class="r">${v.cashAccount ? `<a href="${exAddr(v.cashAccount)}" target="_blank" rel="noopener">${usd(v.cash)}</a>` : usd(v.cash)}</td><td class="r">${usd(v.premiums)}</td><td class="r">${usd(v.venueSeed, 0)}</td></tr>`).join("");
  const dep = vs.filter((v) => v.phase === "deposits").sort((a, b) => a.epoch - b.epoch)[0];
  return `<div class="pg">
    <h1>The House</h1>
    <p class="sub">The other side of every ticket, backed by a weekly vault.</p>
    <div class="kp"><div><i>Epoch ${cur ? cur.epoch : ""} deposits</i><b>${cur ? usd(cur.deposits, 0) : "$0"}</b></div><div><i>Premium in, all epochs</i><b>${usd(prem)}</b></div><div><i>Open series</i><b>${open}</b></div></div>
    ${win("Weekly vault", `<table class="tb"><tr><th>Epoch</th><th>Ends</th><th>Phase</th><th class="r">Deposits</th><th class="r">Collateral held</th><th class="r">Premium</th><th class="r">Seeded by us</th></tr>${rows}</table>`, '<span class="tag ghost">Seeded by us</span>', "vault")}
    ${dep ? `<p class="coll">Collateral held, epoch ${dep.epoch}: <b>${usd(dep.cash)}</b>, <a href="${exAddr(dep.cashAccount)}" target="_blank" rel="noopener">onchain account ${shortKey(dep.cashAccount)}</a>. <span class="tag ghost">Seeded by us</span></p>` : ""}
    <div class="dep"><button class="cta" id="hdep-go">Deposit test USDC</button><p class="st" id="hd-st"></p></div>
  </div>`;
}

// unchanged from mac.js bindHouse deposit flow, amount asked in a dialog
function bindHouse() {
  const hd = $("#hdep-go");
  if (hd) hd.addEventListener("click", () => ensureWallet(() => {
    const nx = S.vaults.filter((v) => v.phase === "deposits").sort((a, b) => a.epoch - b.epoch)[0], st = $("#hd-st");
    if (!nx) { st.textContent = "No vault is taking deposits right now."; return; }
    dialog(`<div class="icon">$</div><b>Deposit, epoch ${nx.epoch}</b><p class="small">Deposits close ${dayS(nx.depositEnd)}. Test USDC only.</p><p><input id="hdep" inputmode="decimal" value="1000" aria-label="Amount in USDC"></p><div class="actions"><button class="btn" data-close>Cancel</button><button class="btn default" id="ok">Sign with wallet</button></div>`,
      (m, close) => $("#ok", m).addEventListener("click", async () => {
        const amount = Number($("#hdep", m).value); close();
        try {
          st.textContent = "Approve the deposit in your wallet.";
          const r = await signAndSubmit(await api("vault", { type: "deposit", epoch: nx.epoch, owner: S.wallet.address, amount }));
          st.textContent = "";
          alertBox("✓", "Deposited.", "Your share of the vault is in your positions.", r.url);
          await Promise.all([refreshMarkets(), refreshPortfolio()]); render();
        } catch (e) {
          st.innerHTML = esc(e.message);
          if (/faucet/i.test(e.message)) { st.innerHTML += ' <button id="fz">Add test USDC</button>'; $("#fz").addEventListener("click", faucet); }
        }
      }));
  }));
}

// ---------- docs ----------
function docsView() {
  const st = S.status || {}, bt = (st.backtest && st.backtest.result) || [], fee = st.feeBps || 0;
  const m0 = predict()[0];
  const ex = m0 ? `chip=${m0.underlying}&side=higher&strike=${m0.strike}&date=${m0.windowEnd}&amount=10` : "chip=H100_SXM&side=higher&strike=3.40&date=2026-11-05&amount=10";
  const nav = [["tickets", "Tickets"], ["why-onchain", "Why onchain"], ["the-index", "The Index"], ["the-house", "The House"], ["agents", "For agents"], ["fees", "Fees and limits"], ["model", "Model check"], ["onchain", "Onchain"]];
  return `<div class="pg">
    <h1>Docs</h1>
    <p class="sub">How Hourly works, in short.</p>
    <div class="docs"><nav>${nav.map(([k, l]) => `<a href="#${k}" data-jump="${k}">${l}</a>`).join("")}</nav><div>
      <section><h2 id="tickets">Tickets<small>01</small></h2>
        <ul><li><b>Ticket:</b> a floor or a cap at a strike, for one day's print.</li><li><b>One tap:</b> the same ticket, with set amounts.</li><li><b>Lock a month:</b> a floor or a cap on a month's average, for one GPU.</li></ul>
        <p>You pay the Premium up front. That is all you can lose. What it pays up to sits in escrow from the moment it trades.</p></section>
      <section><h2 id="why-onchain">Why onchain<small>02</small></h2>
        <p>Sources are offchain. The print, the payout rule and the collateral are onchain and can't be changed after you pay. Every contract is fully backed in escrow, so neither side needs to trust the other.</p></section>
      <section><h2 id="the-index">The Index<small>03</small></h2>
        <p>One daily print per chip, from public rental list prices. Each print carries its method version and an input hash, so anyone can recompute it. Method <span class="tag ghost">v0 draft</span>, every print <span class="tag ghost">unsigned</span>. Not yet used to pay out any contract.</p></section>
      <section><h2 id="the-house">The House<small>04</small></h2>
        <p>The House is the other side of every ticket. Anyone can back it through the weekly vault and earn the Premium. Today every vault is <span class="tag ghost">seeded by us</span>.</p></section>
      <section><h2 id="agents">For agents<small>05</small></h2>
        <p>Agents read quotes and hand the user a link to sign. No agent can move funds.</p>
        <section class="win"><pre>GET /hourly/api/agent/brief
GET /hourly/api/agent/prepare?${esc(ex)}
    /hourly/llms.txt</pre></section></section>
      <section><h2 id="fees">Fees and limits<small>06</small></h2>
        <ul><li>Fee: ${fee / 100}% of Premium.</li><li>Fully backed in escrow, in ${COIN}.</li><li>Cap trades: up to 50 GPUs each.</li><li>Test money only. Not audited.</li></ul></section>
      <section><h2 id="model">Model check<small>07</small></h2>
        <p>Pricing model against past prints, run ${st.backtest ? day(st.backtest.at.slice(0, 10)) : "n/a"}. Lower error is better. Baseline quotes every strike at half.</p>
        ${bt.length ? `<section class="win"><table class="tb"><tr><th>Horizon</th><th class="r">Prints</th><th class="r">Coverage</th><th class="r">Error</th><th class="r">Baseline</th></tr>${bt.map((r) => `<tr><td>${r.horizonDays} days</td><td class="r">${r.n}</td><td class="r">${pct(r.coverage)}</td><td class="r">${r.brier.toFixed(3)}</td><td class="r">${r.brierCoin.toFixed(3)}</td></tr>`).join("")}</table></section>` : ""}</section>
      <section><h2 id="onchain">Onchain<small>08</small></h2>
        <p>Solana devnet, test money only.</p>
        <section class="win"><pre><span class="c">program      </span>${esc(st.programId || "")}
<span class="c">quote mint   </span>${esc(st.quoteMint || "")}  <span class="c">test USDC</span>
<span class="c">oracle queue </span>${esc(st.oracleQueue || "")}</pre></section></section>
    </div></div>
  </div>`;
}
function bindDocs() {
  $$("#desk [data-jump]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); const el = document.getElementById(a.dataset.jump); if (el) el.scrollIntoView({ behavior: "smooth" }); }));
}

// ---------- render loop ----------
function render() {
  if (!VIEWS.includes(S.view)) S.view = "desk";
  const views = { home: homeView, desk: deskView, index: indexView, house: houseView, docs: docsView, access: accessView };
  $("#desk").innerHTML = views[S.view]();
  document.body.dataset.view = S.view;
  ({ home: bindHome, desk: bindDesk, index: bindIndex, house: bindHouse, docs: bindDocs, access: bindAccess })[S.view]();
}
async function refreshMarkets() {
  try { const [m, v] = await Promise.all([api("markets"), api("vaults").catch(() => [])]); S.markets = m; S.vaults = v; } catch (_) { /* keep last */ }
}
async function refreshPortfolio() { if (!S.wallet) { S.portfolio = null; return; } try { S.portfolio = await api(`portfolio?owner=${S.wallet.address}`); } catch (_) { /* keep */ } }
async function refreshActivity() { try { S.activity = await api("activity"); } catch (_) { /* keep */ } }
window.__hourlyGo = (v, mode) => { if (mode) S.mode = mode; go(v); };
window.addEventListener("hashchange", () => { const v = HASH[location.hash.slice(1)]; if (v && v !== S.view) { S.view = v; renderMenu(); render(); } });

(async function main() {
  const rp = refParam(); if (rp) store.set("hourly.ref", rp);
  try {
    const c = JSON.parse(store.get("hourly.cleanboot") || "null");
    if (c && c.index && c.index.length) { Object.assign(S, { status: c.status, index: c.index, markets: c.markets || [], vaults: c.vaults || [], activity: c.activity }); renderMenu(); render(); }
  } catch (_) { /* stale cache is optional */ }
  const [st, ix, mk, vl, ac] = await Promise.all([
    api("status").catch(() => null), api("index").catch(() => null), api("markets").catch(() => null), api("vaults").catch(() => []), api("activity").catch(() => null),
  ]);
  if (st) S.status = st;
  S.index = ix || S.index || [];
  if (mk) S.markets = mk;
  S.vaults = vl || S.vaults;
  if (ac) S.activity = ac;
  if (!document.querySelector(".modal")) { renderMenu(); render(); }
  store.set("hourly.cleanboot", JSON.stringify({ status: S.status, index: S.index, markets: S.markets, vaults: S.vaults, activity: S.activity }));
  (window.requestIdleCallback || setTimeout)(() => registerMetaMask());
  await restoreWallet();
  if (location.hash === "#portfolio") { refreshPortfolio().then(() => { if (S.view === "desk") { render(); const el = document.querySelector(".pos"); if (el) el.scrollIntoView(); } }); }
  let last = "", tick = 0;
  const busy = () => document.hidden || document.querySelector(".modal") || S.t.quote || S.t.quoting || (document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName));
  setInterval(async () => {
    if (busy() || !["desk", "house", "index"].includes(S.view)) return;
    const slow = ++tick % 4 === 0;
    await Promise.all([api("markets").then((m) => { S.markets = m; }).catch(() => {}), slow && S.view === "house" ? api("vaults").then((v) => { S.vaults = v; }).catch(() => {}) : null, slow ? refreshPortfolio() : null]);
    if (busy()) return;
    const sig = JSON.stringify([S.markets, S.vaults, S.portfolio]);
    if (sig === last) return;
    const first = last === ""; last = sig;
    if (!first) { const y = window.scrollY; render(); window.scrollTo(0, y); }
  }, 10_000);
})();
