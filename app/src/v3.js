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
const HASH = { trade: "desk", index: "index", house: "house", docs: "docs", home: "home", access: "access" };
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
const go = (v) => { S.view = v; try { history.replaceState(null, "", `#${Object.keys(HASH).find((k) => HASH[k] === v) || v}`); } catch (_) { /* file */ } renderMenu(); render(); window.scrollTo(0, 0); };
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
  const ks = levelsFor(t.gpu), last = lastPrint(t.gpu) || 0;
  if (!ks.includes(t.strike)) { t.strike = ks.length ? ks.reduce((p, k) => (Math.abs(k - last) < Math.abs(p - last) ? k : p)) : null; t.seriesId = null; }
  const ds = t.strike !== null ? datesFor(t.gpu, t.strike) : [];
  if (!ds.some((m) => m.id === t.seriesId)) { t.seriesId = ds[0] ? ds[0].id : null; t.quote = null; }
}
const curMarket = () => S.markets.find((x) => x.id === S.t.seriesId) || null;

// ---------- trade view ----------
function deskView() {
  deskInit();
  const code = S.mode === "lock" ? S.hedge.gpu : S.t.gpu;
  return `<div class="pg trade"><h1>Trade the ${esc(gpuLabel(code))} hour.</h1>${ticketWindow()}${positionsWindow()}</div>`;
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
function lockHtml() {
  const h = S.hedge, codes = GPU_ORDER.filter((c) => hedgePair(c));
  const side = h.role === "own" ? "lower" : "higher";
  if (!codes.length) return `${chipRow([h.gpu], h.gpu, "data-hg")}${sideRow(side, "data-hrole")}<p class="st">No month is open to lock right now.</p>`;
  if (!codes.includes(h.gpu)) h.gpu = codes[0];
  const wins = hedgeWindows(h.gpu); if (!wins.includes(h.win)) h.win = wins[0];
  const { put, call } = hedgePair(h.gpu, h.win), own = h.role === "own", qn = h.qty || 1;
  const price = (own ? put.model.ask : call.model.ask) * feeMul();
  const k = own ? put.strike : call.strike, maxPay = own ? put.maxPayoff : call.maxPayoff;
  return `${chipRow(codes, h.gpu, "data-hg")}${sideRow(side, "data-hrole")}
    <div class="lab">Strike</div><span class="solo">$${k.toFixed(2)} /hr</span>
    <div class="lab">Date</div><span class="solo">${day(put.windowStart)} to ${day(put.windowEnd)}</span>
    <div class="lab">Amount</div><span class="solo">${qn} GPU, ${put.units} hours</span>
    <div class="pp"><div><i>Premium</i><b>${usd(price * qn)}</b></div><div><i>Pays up to</i><b>${usd(maxPay * qn)}</b></div></div>
    <button class="cta" id="hedge-go">Lock ${monthOf(put.windowStart)}</button>
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
      return `<tr><td>${esc(name)}<div class="muted">${when} · ${r.status === "open" ? `closes in ${countdown(r.tradingEnd)}` : r.status === "settled" ? "paid out" : esc(r.status)}</div></td><td>${r.long ? `long ${r.long}` : ""} ${r.short ? `short ${r.short}` : ""}</td><td class="r">${value}</td><td class="r">${actions(r)}</td></tr>`;
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
  $$("[data-mode]").forEach((b) => b.addEventListener("click", () => { S.mode = b.dataset.mode; reset(); render(); }));
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
  $$("[data-hrole]").forEach((b) => b.addEventListener("click", () => { S.hedge.role = b.dataset.hrole === "lower" ? "own" : "rent"; renderTicket(); }));
  $$("[data-hg]").forEach((b) => b.addEventListener("click", () => { S.hedge.gpu = b.dataset.hg; S.hedge.qty = 1; render(); }));
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
    alertBox("✓", "Placed.", `${esc(gpuLabel(t.gpu))} ${SIDE_LABEL[t.side].toLowerCase()} at $${m.strike.toFixed(2)} on ${day(m.windowEnd)}. It's in your positions.`, r.url);
    t.quote = null;
    await Promise.all([refreshMarkets(), refreshPortfolio(), refreshActivity()]);
    render();
  } catch (e) { t.qerr = e.message || "The wallet declined."; t.quote = null; renderTicket(); }
}
// unchanged from mac.js bindHedge quote and sign flow
async function lockQuote() {
  const { put, call } = hedgePair(S.hedge.gpu, S.hedge.win);
  const own = S.hedge.role === "own";
  const legs = own ? [{ series: put.id, side: "buy", qty: S.hedge.qty || 1 }] : [{ series: call.id, side: "buy", qty: S.hedge.qty || 1 }];
  const st = $("#h-st"), gb = $("#hedge-go");
  try {
    st.textContent = "Getting a firm price.";
    const q = await api("quote", { owner: S.wallet.address, ref: refFor(), legs });
    dialog(`<div class="icon">?</div><b>Confirm</b>
      <div class="lines">
        ${q.legs.map((l) => `<div><span>${l.side === "buy" ? "Buy" : "Sell"} ${esc(l.title.split(" (")[0])}</span><span>${usd(l.price)}</span></div>`).join("")}
        ${q.fee ? `<div><span>Fee</span><span>${usd(q.fee)}</span></div>` : ""}
        <div class="big2"><span>Premium</span><span>${usd(q.pay + (q.fee || 0) - (q.receive || 0))}</span></div>
      </div>
      <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn default" id="ok">Sign with wallet</button></div>`,
    (m, close) => $("#ok", m).addEventListener("click", async () => {
      close();
      try { const r = await signAndSubmit(q); alertBox("✓", "Locked.", `${esc(put.gpu)} ${monthOf(put.windowStart)} is in your positions.`, r.url); await Promise.all([refreshMarkets(), refreshPortfolio(), refreshActivity()]); render(); }
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
function bindDesk() { bindTicket(); bindPortfolio(); }

// ---------- index ----------
function indexView() {
  const g = S.index.find((x) => x.code === S.ixChip) || chips()[0];
  if (!g) return '<div class="pg"><h1>Hourly Index</h1></div>';
  const p = g.provenance || {}, hist = g.history || [];
  const h = S.ixRange === "all" ? hist : hist.slice(-Number(S.ixRange));
  return `<div class="pg">
    <h1>Hourly Index</h1>
    <p class="sub">USD per GPU hour. One print a day per chip.</p>
    <div class="strip"><span class="tag">Unsigned</span><span>Unsigned, ${p.signedPrints || 0} of ${p.prints || hist.length}</span></div>
    <div class="ixg">${chips().map((c) => `<div class="ixc"><div class="h"><b>${esc(c.label)}</b><span>${usd(c.last)}<small>/hr</small></span></div>${spark((c.history || []).slice(-90))}<div class="c">${pctSgn(c.chg30)} 30d</div></div>`).join("")}</div>
    <section class="win big"><div class="bh"><span class="seg">${chips().map((c) => `<button data-ix="${c.code}" class="${c.code === g.code ? "on" : ""}">${esc(c.label)}</button>`).join("")}</span><span class="px">${usd(g.last)}</span><span class="seg">${[["30", "30d"], ["90", "90d"], ["all", "All"]].map(([k, l]) => `<button data-ixr="${k}" class="${S.ixRange === k ? "on" : ""}">${l}</button>`).join("")}</span></div>
      ${areaChart(h)}</section>
  </div>`;
}
function bindIndex() {
  $$("[data-ix]").forEach((b) => b.addEventListener("click", () => { S.ixChip = b.dataset.ix; render(); }));
  $$("[data-ixr]").forEach((b) => b.addEventListener("click", () => { S.ixRange = b.dataset.ixr; render(); }));
}

// ---------- house ----------
function houseView() {
  const vs = S.vaults.slice().sort((a, b) => a.epoch - b.epoch);
  const cur = vs.find((v) => v.phase === "trading") || vs[vs.length - 1];
  const prem = vs.reduce((a, v) => a + v.premiums, 0), open = vs.reduce((a, v) => a + v.openSeries, 0);
  const rows = vs.map((v) => `<tr><td>${v.epoch}</td><td>${dayS(v.epochEnd)}</td><td>${esc(v.phase)}</td><td class="r">${usd(v.deposits, 0)}</td><td class="r">${usd(v.premiums)}</td><td class="r">${usd(v.venueSeed, 0)}</td></tr>`).join("");
  return `<div class="pg">
    <h1>The House</h1>
    <p class="sub">The other side of every ticket, backed by a weekly vault.</p>
    <div class="kp"><div><i>Epoch ${cur ? cur.epoch : ""} deposits</i><b>${cur ? usd(cur.deposits, 0) : "$0"}</b></div><div><i>Premium in, all epochs</i><b>${usd(prem)}</b></div><div><i>Open series</i><b>${open}</b></div></div>
    ${win("Weekly vault", `<table class="tb"><tr><th>Epoch</th><th>Ends</th><th>Phase</th><th class="r">Deposits</th><th class="r">Premium</th><th class="r">Seeded by us</th></tr>${rows}</table>`, '<span class="tag ghost">Seeded by us</span>', "vault")}
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
  const nav = [["tickets", "Tickets"], ["the-index", "The Index"], ["the-house", "The House"], ["agents", "For agents"], ["fees", "Fees and limits"], ["model", "Model check"], ["onchain", "Onchain"]];
  return `<div class="pg">
    <h1>Docs</h1>
    <p class="sub">How Hourly works, in short.</p>
    <div class="docs"><nav>${nav.map(([k, l]) => `<a href="#${k}" data-jump="${k}">${l}</a>`).join("")}</nav><div>
      <section><h2 id="tickets">Tickets<small>01</small></h2>
        <ul><li><b>Ticket:</b> a floor or a cap at a strike, for one day's print.</li><li><b>One tap:</b> the same ticket, with set amounts.</li><li><b>Lock a month:</b> a floor or a cap on a month's average, for one GPU.</li></ul>
        <p>You pay the Premium up front. That is all you can lose. What it pays up to sits in escrow from the moment it trades.</p></section>
      <section><h2 id="the-index">The Index<small>02</small></h2>
        <p>One daily print per chip, from public rental list prices. Each print carries its method version and an input hash, so anyone can recompute it. Method <span class="tag ghost">v0 draft</span>, every print <span class="tag ghost">unsigned</span>. Not yet used to pay out any contract.</p></section>
      <section><h2 id="the-house">The House<small>03</small></h2>
        <p>The House is the other side of every ticket. Anyone can back it through the weekly vault and earn the Premium. Today every vault is <span class="tag ghost">seeded by us</span>.</p></section>
      <section><h2 id="agents">For agents<small>04</small></h2>
        <p>Agents read quotes and hand the user a link to sign. No agent can move funds.</p>
        <section class="win"><pre>GET /hourly/api/agent/brief
GET /hourly/api/agent/prepare?${esc(ex)}
    /hourly/llms.txt</pre></section></section>
      <section><h2 id="fees">Fees and limits<small>05</small></h2>
        <ul><li>Fee: ${fee / 100}% of Premium.</li><li>Fully backed in escrow, in ${COIN}.</li><li>Cap trades: up to 50 GPUs each.</li><li>Test money only. Not audited.</li></ul></section>
      <section><h2 id="model">Model check<small>06</small></h2>
        <p>Pricing model against past prints, run ${st.backtest ? day(st.backtest.at.slice(0, 10)) : "n/a"}. Lower error is better. Baseline quotes every strike at half.</p>
        ${bt.length ? `<section class="win"><table class="tb"><tr><th>Horizon</th><th class="r">Prints</th><th class="r">Coverage</th><th class="r">Error</th><th class="r">Baseline</th></tr>${bt.map((r) => `<tr><td>${r.horizonDays} days</td><td class="r">${r.n}</td><td class="r">${pct(r.coverage)}</td><td class="r">${r.brier.toFixed(3)}</td><td class="r">${r.brierCoin.toFixed(3)}</td></tr>`).join("")}</table></section>` : ""}</section>
      <section><h2 id="onchain">Onchain<small>07</small></h2>
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
