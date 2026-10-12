import { char } from "./chars.mjs";
import { homeView, bindHome } from "./home.js";
// Hourly, System 7 edition. One decision per screen; the chart shows your
// level and your date as you pick them. Bundled by esbuild into public/mac.js.
import { getWallets } from "@wallet-standard/app";
import nacl from "tweetnacl";
import * as ST from "./strat.js";
import bs58 from "bs58";

// ---------- utils ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const b64 = (u8) => { let s = ""; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const odo = (t) => `<span class="odo" aria-label="${t}">${[...t].map((ch, i, a) => `<i class="${i === a.length - 1 && /\d/.test(ch) ? "hot" : ""}${/[\d]/.test(ch) ? "" : " sep"}" aria-hidden="true">${ch}</i>`).join("")}</span>`;
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
// referral: ?ref=<wallet> on arrival is remembered and sent with every quote
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
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}

// ---------- state ----------
const S = {
  status: null, index: [], markets: [], vaults: [], activity: null, portfolio: null, stake: null, wallet: null, earnTab: "vault",
  view: /[?&]t=/.test(location.search) ? "desk" : /[?&]docs=1/.test(location.search) ? "docs" : /[?&]cap=/.test(location.search) ? "hedge" : "home",
  t: { step: 1, gpu: "H100_SXM", side: null, strike: null, seriesId: null, amount: 10, quote: null, hl: 0 },
  hedge: { gpu: "H100_SXM", role: "own", collar: false, win: null, more: false, qty: 1 },
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

// ---------- the mascot: blinks, breathes, and watches your cursor ----------
const mascot = (cls = "") => `<svg class="mascot ${cls}" viewBox="0 0 120 130" aria-hidden="true">
  <circle cx="60" cy="68" r="48" fill="#2f6bff"/>
  <circle cx="60" cy="68" r="48" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
  <circle cx="60" cy="68" r="40" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="2.2 18.9" stroke-dashoffset="1.1" transform="rotate(-90 60 68)"/>
  <g class="hand h"><line x1="60" y1="68" x2="60" y2="46" stroke="#fff" stroke-width="5" stroke-linecap="round"/></g>
  <g class="hand m"><line x1="60" y1="68" x2="60" y2="36" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></g>
  <circle cx="60" cy="68" r="4.5" fill="#fff"/>
  <g class="brows"><path d="M29,46 L52,41" stroke="#1f1e21" stroke-width="7.5" stroke-linecap="round"/><path d="M68,41 L91,46" stroke="#1f1e21" stroke-width="7.5" stroke-linecap="round"/></g>
  <g class="glasses"><path d="M55,68 q5,-5 10,0" stroke="#1f1e21" stroke-width="4" fill="none" stroke-linecap="round"/>
    <path d="M28,66 L19,61 M92,66 L101,61" stroke="#1f1e21" stroke-width="4" stroke-linecap="round"/>
    <g class="eyes"><circle cx="42" cy="69" r="14" fill="#fff" stroke="#1f1e21" stroke-width="4.5"/><circle cx="78" cy="69" r="14" fill="#fff" stroke="#1f1e21" stroke-width="4.5"/>
    <g class="pupil"><circle cx="42" cy="69" r="5.5" fill="#1f1e21"/><circle cx="78" cy="69" r="5.5" fill="#1f1e21"/><circle cx="44" cy="67" r="1.9" fill="#fff"/><circle cx="80" cy="67" r="1.9" fill="#fff"/></g></g></g>
  <path class="mouth" d="M47,96 q13,11 26,0" stroke="#1f1e21" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M54,100 q6,7 12,0" fill="#ff7a8a" opacity=".0"/></svg>`;
function tickClocks() {
  const d = new Date(), mm = d.getMinutes() * 6 + d.getSeconds() * 0.1, hh = (d.getHours() % 12) * 30 + d.getMinutes() * 0.5;
  for (const m of document.querySelectorAll(".mascot")) { m.style.setProperty("--mm", mm.toFixed(1)); m.style.setProperty("--hh", hh.toFixed(1)); }
}
setInterval(tickClocks, 1000);
document.addEventListener("pointermove", (e) => {
  for (const m of document.querySelectorAll(".mascot")) {
    const r = m.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy) || 1, k = Math.min(3.2, d / 60);
    m.style.setProperty("--dx", ((dx / d) * k).toFixed(2)); m.style.setProperty("--dy", ((dy / d) * k).toFixed(2));
  }
});
// numbers glide to their new value
function tween(el, to, fmt, ms = 520) {
  if (!el) return;
  const from = Number(el.dataset.v ?? to); el.dataset.v = to;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = (now) => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 4); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
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
    if (bb) bb.addEventListener("click", async () => { await setWallet(burnerWallet()); close(); await autoFund(); if (after) after(); });
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
    <button data-view="home" class="brand" title="Hourly: Trade" aria-label="Hourly"><img src="mark.svg" alt="H">ourly</button>
    ${[["desk", "Trade"], ["house", "House"], ["docs", "Docs"]].map(([v, l]) => `<button data-view="${v}" class="${S.view === v ? "on" : ""}">${l}</button>`).join("")}
        <span class="spacer"></span>
    <button id="wallet-btn">${S.wallet ? `${S.wallet.address.slice(0, 4)}…${S.wallet.address.slice(-4)}` : "Connect"}</button>`;
  slidePill($("#menubar"), "menu");
  $$("#menubar [data-view]").forEach((b) => b.addEventListener("click", () => {
    S.view = b.dataset.view; renderMenu(); render();
  }));
  $("#wallet-btn").addEventListener("click", () => {
    if (!S.wallet) return walletPicker(() => {});
    dialog(`<div class="icon">◆</div><b>${esc(S.wallet.name)}</b><p class="mono">${esc(S.wallet.address)}</p>
      <div class="actions"><button class="btn default" id="dc">Disconnect</button></div>`,
    (m, close) => { $("#dc", m).addEventListener("click", async () => { await S.wallet.disconnect(); await setWallet(null); close(); }); });
  });
}

function windowShell(title, body) {
  return `<section class="window"><div class="titlebar"><span class="sq"><i></i><i></i><i></i></span><span class="tt">HOURLY / ${esc(title).toUpperCase()}</span><span class="ar">↗</span></div>${body}</section>`;
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

// ---------- the assets: AI chips, drawn as chips ----------
// Specs are the public vendor figures (architecture, memory); prices come live from the index.
const CHIPS = {
  H100_SXM: { maker: "NVIDIA", arch: "Hopper", mem: "80GB HBM3", tag: "The workhorse of the AI boom", uses: ["Training", "Inference"], hue: "#2f6bff", hbm: 3, dies: 1 },
  H200: { maker: "NVIDIA", arch: "Hopper", mem: "141GB HBM3e", tag: "More memory for bigger models", uses: ["LLM serving", "Long context"], hue: "#4d8dff", hbm: 3, dies: 1 },
  B200: { maker: "NVIDIA", arch: "Blackwell", mem: "192GB HBM3e", tag: "The new frontier-model chip", uses: ["Frontier training", "Reasoning"], hue: "#18b6ff", hbm: 4, dies: 2 },
  A100_SXM4: { maker: "NVIDIA", arch: "Ampere", mem: "80GB HBM2e", tag: "The veteran, now the cheap tier", uses: ["Fine-tuning", "Batch jobs"], hue: "#7f95c9", hbm: 3, dies: 1 },
};
function chipArt(code) {
  // each chip drawn from its own facts: die count, die size, and memory stacks filled by capacity
  const c = CHIPS[code] || CHIPS.H100_SXM, id = `ca${code}`;
  const gb = { H100_SXM: 80, H200: 141, B200: 192, A100_SXM4: 80 }[code] || 80, fill = gb / 192;
  const n = c.dies === 2 ? 4 : 3, bw = c.dies === 2 ? 6 : 7, gap = 3;
  const stack = (x0) => Array.from({ length: n }, (_, i) => {
    const x = x0 + i * (bw + gap), h = 46, y = 17, fh = Math.max(4, h * fill);
    return `<rect x="${x}" y="${y}" width="${bw}" height="${h}" rx="1.5" class="hbm"/><rect x="${x}" y="${y + h - fh}" width="${bw}" height="${fh}" rx="1.5" class="hbmf"/>`;
  }).join("");
  const wL = n * (bw + gap) - gap, xR = 120 - 10 - wL;
  const die = c.dies === 2
    ? `<rect x="46" y="22" width="13" height="36" rx="3" class="die"/><rect x="61" y="22" width="13" height="36" rx="3" class="die"/><rect x="59" y="36" width="2" height="8" class="link"/>`
    : code === "A100_SXM4" ? `<rect x="44" y="26" width="32" height="28" rx="3" class="die"/>` : `<rect x="40" y="22" width="40" height="36" rx="3" class="die"/>`;
  return `<svg viewBox="0 0 120 80" class="chipart" style="--h:${c.hue}" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.hue}"/><stop offset="1" stop-color="#0a1250"/></linearGradient></defs>
    <rect x="3" y="3" width="114" height="74" rx="8" class="pkg"/>
    ${stack(10)}${stack(xR)}${die.replace(/class="die"/g, `class="die" fill="url(#${id})"`)}
    <text x="60" y="${c.dies === 2 ? 74 : 44}" text-anchor="middle" class="gbt" ${c.dies === 2 ? 'fill="#9fb2e8"' : ""}>${gb}GB</text></svg>`;
}
const spark = (h) => {
  const v = h.slice(-30).map((p) => p[1]), lo = Math.min(...v), hi = Math.max(...v) || 1, w = 100, ht = 26;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * w).toFixed(1)},${(ht - 2 - ((x - lo) / (hi - lo || 1)) * (ht - 4)).toFixed(1)}`);
  return `<svg viewBox="0 0 ${w} ${ht}" class="spark" preserveAspectRatio="none"><polyline points="${pts.join(" ")}" /></svg>`;
};
function marqueeHtml() {
  const item = (g) => `<span class="mq">${chipArt(g.code).replace('class="chipart"', 'class="chipart mini"')}<b>${esc(g.label)}</b><i>$${g.last.toFixed(2)}<small>/hr</small></i><em class="${g.chg7 >= 0 ? "up" : "dn"}">${g.chg7 >= 0 ? "▲" : "▼"} ${(Math.abs(g.chg7) * 100).toFixed(1)}%</em></span>`;
  const row = GPU_ORDER.map((c) => S.index.find((x) => x.code === c)).filter(Boolean).map(item).join("");
  return `<div class="marquee" aria-label="Live chip rental prices"><div class="mqtrack">${row}${row}${row}${row}</div></div>`;
}
function assetsHtml() {
  const cards = GPU_ORDER.map((c) => S.index.find((x) => x.code === c)).filter(Boolean).map((g) => {
    const k = CHIPS[g.code] || {};
    return `<button class="asset ${S.t.gpu === g.code ? "on" : ""}" data-asset="${g.code}" style="--h:${k.hue || "#2f6bff"}">
      <div class="art">${chipArt(g.code)}</div>
      <div class="ah"><b>${esc(g.label)}</b></div>
      <div class="ap"><span class="pr">$${g.last.toFixed(2)}<small>/hr</small></span><em class="${g.chg7 >= 0 ? "up" : "dn"}">${g.chg7 >= 0 ? "▲" : "▼"} ${(Math.abs(g.chg7) * 100).toFixed(1)}%</em></div></button>`;
  }).join("");
  return `<section class="assets"><div class="agrid">${cards}</div></section>`;
}
function explainHtml() {
  const ic = {
    chip: '<rect x="8" y="8" width="24" height="24" rx="4"/><path d="M14 4v4M20 4v4M26 4v4M14 32v4M20 32v4M26 32v4M4 14h4M4 20h4M4 26h4M32 14h4M32 20h4M32 26h4"/><rect x="15" y="15" width="10" height="10" rx="2"/>',
    index: '<path d="M6 32V20M14 32V12M22 32V22M30 32V6M36 32H4"/>',
    eye: '<path d="M3 20s6-11 17-11 17 11 17 11-6 11-17 11S3 20 3 20z"/><circle cx="20" cy="20" r="5"/>',
    lock: '<rect x="8" y="17" width="24" height="17" rx="3"/><path d="M13 17v-5a7 7 0 0 1 14 0v5"/><circle cx="20" cy="26" r="2"/>',
  };
  const nodes = [
    ["chip", "Chip rent", "One price per chip, per hour"],
    ["index", "Daily print", "Ornn's index sets the number"],
    ["eye", "Oracle", "Signed and checked on-chain"],
    ["lock", "USDC escrow", "Every contract fully backed"],
  ];
  return `<section class="explain"><div class="flow">
      <div class="rail"><i></i><b class="pk p1"></b><b class="pk p2"></b></div>
      <div class="fnodes">${nodes.map(([i, k, v], n) => `<div class="fnode" style="--i:${n}">
        <div class="orb"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ic[i]}</svg></div>
        <b>${k}</b><p>${v}</p></div>`).join("")}</div></div></section>`;
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
const STEP_NAMES = ["Pick", "Price", "Day", "Amount", "Confirm"];

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
        <p class="read"><i>✦</i>${esc(readLine(t.gpu))}</p>
      </div>
    </div>`);
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
    const ks = levelsFor(t.gpu), last = lastPrint(t.gpu) || 0;
    const atm = ks.length ? ks.reduce((p, k) => (Math.abs(k - last) < Math.abs(p - last) ? k : p)) : null;
    const m = atm !== null ? seriesNear(t.gpu, atm) : null;
    const sides = [
      { key: "higher", glyph: "▲", t: "Higher", cls: "up" },
      { key: "lower", glyph: "▼", t: "Lower", cls: "dn" },
    ];
    const ph = m ? m.model.probItm : 0.5;
    return `<h2>Will ${g} cost more or less than $${(atm ?? last).toFixed(2)} an hour tomorrow?</h2>
      <div class="split"><i style="width:${Math.round(ph * 100)}%"></i></div>
      <div class="options pm">${sides.map((o) => {
        const c = o.key === "higher" ? ph : 1 - ph;
        return `<button class="opt ${o.cls} ${sides.indexOf(o) === t.hl ? "hl" : ""}" data-opt="${o.key}"><span class="glyph">${o.glyph}</span><span class="t">${o.t}</span><span class="big">${pct(c)}</span><span class="r">${m ? `${cents(sideUnit(m, o.key))} to win $1` : ""}</span></button>`;
      }).join("")}</div>
      <p class="how">Pick a side, then a price and a day. If you're right when the day ends, each contract pays $1.</p>`;
  }
  const row = (i, label, m, k) => {
    const ch = m ? sideChance(m, t.side) : 0;
    return `<button class="opt row2 ${t.side === "higher" ? "up" : "dn"} ${i === t.hl ? "hl" : ""}" data-opt="${k}" style="--p:${Math.round(ch * 100)}%"><span class="t">${label}</span><span class="ch"><b>${pct(ch)}</b><small>${m ? cents(sideUnit(m, t.side)) : ""}</small></span></button>`;
  };
  if (t.step === 2) {
    const ks = levelsFor(t.gpu);
    return `<h2>${t.side === "higher" ? "Higher" : "Lower"} than what price?</h2><p class="lead small">Bigger number = more likely.</p>
      <div class="options pm2">${ks.map((k, i) => row(i, `${t.side === "higher" ? "Above" : "At or below"} $${k.toFixed(2)}`, seriesNear(t.gpu, k), k)).join("")}</div>`;
  }
  if (t.step === 3) {
    const ms = datesFor(t.gpu, t.strike);
    return `<h2>On which day?</h2><p class="lead small">${g} ${t.side === "higher" ? "above" : "at or below"} $${t.strike.toFixed(2)}</p>
      <div class="options pm2">${ms.map((m, i) => row(i, day(m.windowEnd), m, m.id)).join("")}</div>`;
  }
  const m = S.markets.find((x) => x.id === t.seriesId);
  if (!m) return "<p>That market just closed. Pick another date.</p>";
  const unit = sideUnit(m, t.side);
  const qty = Math.max(0, Math.floor(t.amount / (unit * (t.side === "higher" ? 1.01 : 1))));
  const verb = t.side === "higher" ? "above" : "at or below";
  if (t.step === 4) {
    return `<h2>How much?</h2><p class="lead small">${g} ${verb} $${m.strike.toFixed(2)} on ${day(m.windowEnd)}</p>
      <div class="amtcard">
        <div class="amount"><span>$</span><input id="amt" inputmode="decimal" value="${t.amount}" aria-label="Amount in USDC"></div>
        <div class="chips">${[5, 20, 50, 100].map((v) => `<button class="pillchip ${t.amount === v ? "on" : ""}" data-amt="${v}">$${v}</button>`).join("")}</div>
      </div>
      <div class="payline"><span>You get if right</span><b id="win" data-v="${qty}">${usd(qty)}</b></div>
      <div class="payline soft"><span>Chance</span><b>${pct(sideChance(m, t.side))}</b></div>
      <button class="cta" id="to-review" ${qty > 0 ? "" : "disabled"}><span>Review</span><i>→</i></button>`;
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

let CH = null; // geometry for the crosshair
const CHS = { W: 560, H: 300 }; // viewBox, the desk sets a wider one
const smooth = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
function chartSvg() {
  const t = S.t;
  const g = S.index.find((x) => x.code === t.gpu);
  if (!g) return "";
  const hist = g.history.slice(-(t.range || 30));
  const m = t.seriesId ? S.markets.find((x) => x.id === t.seriesId) : null;
  const dateM = m || (t.step === 3 && datesFor(t.gpu, t.strike)[t.hl]) || null;
  const { W, H } = CHS, L = 10, R = 64, T = 16, B = 28;
  const t0 = Date.parse(`${hist[0][0]}T00:00:00Z`);
  const lastT = Date.parse(`${hist[hist.length - 1][0]}T00:00:00Z`);
  const endT = dateM ? Date.parse(`${dateM.windowEnd}T00:00:00Z`) : lastT + Math.max(3, hist.length * 0.18) * 86400e3;
  const vals = hist.map((p) => p[1]);
  const lv = t.strike !== null ? t.strike : (t.step === 2 && t.side ? (levelsFor(t.gpu)[t.hl] ?? null) : null);
  if (lv !== null) vals.push(lv);
  if (dateM && dateM.model) vals.push(dateM.model.settleP10, dateM.model.settleP90);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const lastV = hist[hist.length - 1][1]; const span = Math.max(hi - lo, lastV * 0.14); const mid0 = (hi + lo) / 2; lo = mid0 - span / 2; hi = mid0 + span / 2; const pad = span * 0.18; lo -= pad; hi += pad;
  const X = (ms) => L + ((ms - t0) / (endT - t0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = hist.map((p) => [X(Date.parse(`${p[0]}T00:00:00Z`)), Y(p[1])]);
  const line = smooth(pts), lp = pts[pts.length - 1], base = H - B;
  const area = `${line} L${lp[0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`;
  CH = { pts, hist, W, H };
  let zone = "", fan = "", lvl = "", grid = "";
  let tagP = lp[1], tagL = lv !== null && t.side ? Y(lv) : null;
  if (tagL !== null && Math.abs(tagL - tagP) < 20) { const mid = (tagL + tagP) / 2, sg = tagL >= tagP ? 1 : -1; tagP = mid - 10 * sg; tagL = mid + 10 * sg; }
  for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4, y = Y(v); grid += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="gl"/><text x="${W - R + 8}" y="${y + 3}" class="ax">$${v.toFixed(2)}</text>`; }
  if (lv !== null && t.side) {
    const yl = Y(lv), up = t.side === "higher";
    zone = `<rect class="zone" x="${L}" y="${up ? T : yl}" width="${W - L - R}" height="${Math.max(0, up ? yl - T : base - yl)}" fill="url(#${up ? "zu" : "zd"})"/>`;
    lvl = `<line class="lvl" x1="${L}" x2="${W - R}" y1="${yl}" y2="${yl}"/><rect x="${W - R + 2}" y="${tagL - 9}" width="58" height="18" class="lvlbox"/><text x="${W - R + 31}" y="${tagL + 4}" text-anchor="middle" class="lvltx">$${lv.toFixed(2)}</text>`;
  }
  let xd = null;
  if (dateM) {
    xd = X(Date.parse(`${dateM.windowEnd}T00:00:00Z`));
    if (dateM.model) {
      const a = Y(dateM.model.settleP90), b = Y(dateM.model.settleP10), c = Y(dateM.model.settleP50);
      const steps = 8, up = [], dn = [];
      for (let i = 0; i <= steps; i++) { const f = i / steps, r = Math.sqrt(f), x = lp[0] + (xd - lp[0]) * f; up.push([x, lp[1] + (a - lp[1]) * r]); dn.push([x, lp[1] + (b - lp[1]) * r]); }
      const fp = `M${up.map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" L")} L${dn.reverse().map((q) => q.map((n) => n.toFixed(1)).join(",")).join(" L")} Z`;
      fan = `<g class="fan"><path d="${fp}" fill="url(#fg)"/><path d="M${lp[0].toFixed(1)},${lp[1].toFixed(1)} L${xd.toFixed(1)},${c.toFixed(1)}" class="mid"/><circle cx="${xd.toFixed(1)}" cy="${c.toFixed(1)}" r="4" class="pin"/></g>`;
    }
    fan += `<line x1="${xd}" x2="${xd}" y1="${T}" y2="${base}" class="dl"/><text x="${xd}" y="${H - 8}" text-anchor="end" class="ax">${day(dateM.windowEnd)}</text>`;
  }
  const first = hist[0][0].slice(5);
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Recent prints with your level and date">
    <defs>
      <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--hz-paper)" stop-opacity=".45"/><stop offset="1" stop-color="var(--hz-paper)" stop-opacity="0"/></linearGradient>
      <linearGradient id="zu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--hz-signal)" stop-opacity=".02"/><stop offset="1" stop-color="var(--hz-signal)" stop-opacity=".5"/></linearGradient>
      <linearGradient id="zd" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="var(--hz-signal)" stop-opacity=".02"/><stop offset="1" stop-color="var(--hz-signal)" stop-opacity=".5"/></linearGradient>
      <linearGradient id="fg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="var(--hz-paper)" stop-opacity=".05"/><stop offset="1" stop-color="var(--hz-paper)" stop-opacity=".4"/></linearGradient>
      <clipPath id="cl"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>
    </defs>
    ${grid}${zone}
    <path d="${area}" fill="url(#ag)" class="area"/>
    ${fan}${lvl}
    <path d="${line}" class="ln" pathLength="1"/>
    <circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="9" class="halo"/><circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="4" class="live"/>
    <rect x="${W - R + 2}" y="${(tagP - 9).toFixed(1)}" width="58" height="18" class="ptag"/><text x="${W - R + 31}" y="${(tagP + 4).toFixed(1)}" text-anchor="middle" class="ptagt">$${hist[hist.length - 1][1].toFixed(2)}</text>
    <text x="${L}" y="${H - 8}" class="ax">${first}</text>
    <line class="xh" x1="0" x2="0" y1="${T}" y2="${base}"/><circle class="xd" r="4.5" cx="-10" cy="-10"/>
  </svg><div class="tip" hidden></div>`;
}
function bindChart() {
  const box = $("#chart");
  if (!box || !CH) return;
  box.onpointermove = (e) => {
    const svg = $("svg", box); if (!svg) return;
    const r = svg.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * CH.W;
    let best = 0; CH.pts.forEach((p, i) => { if (Math.abs(p[0] - x) < Math.abs(CH.pts[best][0] - x)) best = i; });
    const p = CH.pts[best], h = CH.hist[best];
    const xh = $(".xh", svg), xd = $(".xd", svg), tip = $(".tip", box);
    xh.setAttribute("x1", p[0]); xh.setAttribute("x2", p[0]); xh.style.opacity = 1;
    xd.setAttribute("cx", p[0]); xd.setAttribute("cy", p[1]); xd.style.opacity = 1;
    tip.hidden = false; tip.innerHTML = `<span>${day(h[0])}</span><b>$${h[1].toFixed(2)}</b>`;
    tip.style.left = `${Math.min(80, Math.max(20, (p[0] / CH.W) * 100))}%`; tip.style.top = `${(p[1] / CH.H) * 100}%`;
  };
  box.onpointerleave = () => { const svg = $("svg", box); if (!svg) return; $(".xh", svg).style.opacity = 0; $(".xd", svg).style.opacity = 0; $(".tip", box).hidden = true; };
}

function refreshChart() { const c = $("#chart"); if (c) { c.innerHTML = chartSvg(); bindChart(); } }

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
  const tc = $("#to-chain"); if (tc) tc.addEventListener("click", (e) => { e.preventDefault(); S.view = "chain"; renderMenu(); render(); });
  bindChart();
  $$("[data-rng]").forEach((b) => b.addEventListener("click", () => { S.t.range = Number(b.dataset.rng); $$("[data-rng]").forEach((x) => x.classList.toggle("on", x === b)); refreshChart(); }));
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
    tween($("#win"), qty, usd);
    $("#to-review").disabled = qty <= 0;
    $$("[data-amt]").forEach((b) => b.classList.toggle("on", Number(b.dataset.amt) === S.t.amount));
  };
  input.addEventListener("input", update);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !$("#to-review").disabled) { e.preventDefault(); $("#to-review").click(); } });
  $$("[data-amt]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.amt; update(); }));
  $("#to-review").addEventListener("click", (e) => ensureWallet(() => goStep(5, e.target)));
  $("#win").dataset.v = 0;
  update();
  input.focus(); input.select();
}

async function fetchQuote() {
  const t = S.t;
  const m = S.markets.find((x) => x.id === t.seriesId);
  if (!m || !S.wallet) return;
  const qty = Math.max(1, Math.floor(t.amount / (sideUnit(m, t.side) * (t.side === "higher" ? 1.01 : 1))));
  try {
    t.quote = await api("quote", { owner: S.wallet.address, ref: refFor(), legs: [{ series: m.id, side: t.side === "higher" ? "buy" : "sell", qty }] });
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
  const ticks = rows.map((m) => `<line x1="${X(m.strike)}" x2="${X(m.strike)}" y1="${H - 14}" y2="${H - 8}" stroke="var(--hz-signal)"/>`).join("");
  const m = rows[cur];
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="strip" aria-label="Where the model expects the print to land">
    <g class="bars">${bars}</g>${ticks}
    <line x1="${X(spot)}" x2="${X(spot)}" y1="0" y2="${H - 14}" stroke="var(--hz-paper)" stroke-dasharray="2 3"/>
    ${m ? `<line class="curline" x1="${X(m.strike)}" x2="${X(m.strike)}" y1="0" y2="${H - 6}" stroke="var(--hz-signal)" stroke-width="2"/>` : ""}
    <line x1="0" x2="${W}" y1="${H - 14}" y2="${H - 14}" stroke="var(--hz-ink-3)"/></svg>`;
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
// months with both a put and a call open for this GPU, earliest first
function hedgeWindows(code) {
  const live = S.markets.filter((m) => m.door === "hedge" && m.status === "open" && m.underlying === code && m.model);
  return [...new Set(live.map((m) => m.windowStart))].sort().filter((w) => live.some((m) => m.kind === "put" && m.windowStart === w) && live.some((m) => m.kind === "call" && m.windowStart === w));
}
function hedgePair(code, win) {
  const wins = hedgeWindows(code);
  if (!wins.length) return null;
  const w = wins.includes(win) ? win : wins[0];
  const live = S.markets.filter((m) => m.door === "hedge" && m.status === "open" && m.underlying === code && m.model && m.windowStart === w);
  const put = live.find((m) => m.kind === "put"), call = live.find((m) => m.kind === "call");
  return put && call ? { put, call } : null;
}
const CHART = { W: 560, H: 500, L: 56, R: 12, T: 28, B: 34 };
function hedgeModel(put, call, role, collar, price) {
  const own = role === "own", d = (own ? put : call).model.dist, u = put.units;
  const today = lastPrint(put.underlying) || put.strike;
  const xlo = Math.min(d ? d.lo : Infinity, put.strike - put.cap * 1.3, today), xhi = Math.max(d ? d.hi : -Infinity, call.strike + call.cap * 1.3, today);
  const payAt = (s) => own
    ? Math.min(Math.max(put.strike - s, 0), put.cap) * put.units - (collar ? Math.min(Math.max(s - call.strike, 0), call.cap) * call.units : 0)
    : Math.min(Math.max(s - call.strike, 0), call.cap) * call.units;
  const none = (s) => s * u;
  const withIt = (s) => own ? s * u + payAt(s) - price : s * u - payAt(s) + price;
  // break-even: first average price where protection stops beating going without
  let be = null;
  for (let i = 0, prev = null; i <= 400; i++) {
    const s = xlo + ((xhi - xlo) * i) / 400, diff = own ? withIt(s) - none(s) : none(s) - withIt(s);
    if (prev !== null && prev > 0 && diff <= 0) { be = s; break; }
    prev = diff;
  }
  let chance = null;
  if (d) {
    const bw = (d.hi - d.lo) / d.bins.length, tot = d.bins.reduce((a, b) => a + b, 0) || 1;
    const k = own ? put.strike : call.strike;
    chance = d.bins.reduce((a, b, i) => { const c = d.lo + (i + 0.5) * bw; return a + ((own ? c < k : c > k) ? b : 0); }, 0) / tot;
  }
  return { own, d, u, today, xlo, xhi, payAt, none, withIt, be, chance, put, call, collar, price };
}
function scrubHtml(m, s) {
  const lab = m.own ? ["Without protection", "With protection"] : ["Without a cap", "With the cap"];
  const pay = m.payAt(s);
  return `<div class="sc-h">If ${monthOf(m.put.windowStart)} averages <b>$${s.toFixed(2)}</b> an hour</div>
    <div class="sc-g"><div><span>${lab[0]}</span><b>${usd(m.none(s), 0)}</b></div><div><span>${lab[1]}</span><b class="hi">${usd(m.withIt(s), 0)}</b></div><div><span>Protection pays</span><b>${pay > 0 ? "+" + usd(pay, 0) : "$0"}</b></div></div>`;
}
function hedgeChart(m) {
  const { put, call, own, d, today, xlo, xhi, none, withIt, payAt } = m;
  const { W, H, L, R, T, B } = CHART, pw = W - L - R, base = H - B, ph = base - T;
  const xs = [...new Set([xlo, put.strike - put.cap, put.strike, call.strike, call.strike + call.cap, xhi])].sort((a, b) => a - b);
  const vals = xs.flatMap((s) => [none(s), withIt(s)]);
  let ylo = Math.min(...vals), yhi = Math.max(...vals); const pad = (yhi - ylo) * 0.12; ylo -= pad; yhi += pad;
  const X = (v) => L + ((v - xlo) / (xhi - xlo)) * pw, Y = (v) => T + (1 - (v - ylo) / (yhi - ylo)) * ph;
  const pts = (f) => xs.map((s) => `${X(s).toFixed(1)},${Y(f(s)).toFixed(1)}`);
  const area = `M${pts(withIt).join(" L")} L${pts(none).reverse().join(" L")} Z`;
  const k = own ? put.strike : call.strike, far = own ? put.strike - put.cap : call.strike + call.cap;
  let bars = "";
  if (d) {
    const bw = (d.hi - d.lo) / d.bins.length, mx = Math.max(...d.bins) || 1;
    bars = d.bins.map((b, i) => { const c = d.lo + (i + 0.5) * bw, hit = own ? c < k : c > k, h = (b / mx) * 70; return `<rect x="${X(d.lo + i * bw).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${Math.max(1, X(d.lo + bw) - X(d.lo) - 1).toFixed(1)}" height="${h.toFixed(1)}" fill="${hit ? "var(--hz-signal)" : "var(--hz-paper)"}" opacity="${hit ? ".6" : ".2"}"/>`; }).join("");
  }
  const yt = [0, 1, 2, 3].map((i) => ylo + ((yhi - ylo) * i) / 3);
  const grid = yt.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--hz-paper)" opacity=".14"/><text x="${L - 8}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">$${Math.round(v).toLocaleString("en-US")}</text>`).join("");
  const zx0 = Math.min(X(k), X(far)), zw = Math.abs(X(k) - X(far));
  const be = m.be === null ? "" : `<line x1="${X(m.be).toFixed(1)}" x2="${X(m.be).toFixed(1)}" y1="${T}" y2="${base}" stroke="var(--hz-paper)" opacity=".35" stroke-dasharray="2 3"/><circle cx="${X(m.be).toFixed(1)}" cy="${Y(withIt(m.be)).toFixed(1)}" r="4" fill="none" stroke="var(--hz-paper)" stroke-width="1.5"/><text x="${X(m.be).toFixed(1)}" y="${(Y(withIt(m.be)) - 10).toFixed(1)}" text-anchor="${own ? "end" : "start"}">break-even $${m.be.toFixed(2)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" id="hchart" data-ylo="${ylo}" data-yhi="${yhi}" role="img" aria-label="${own ? "Revenue" : "Cost"} against the month's average price, with and without protection">
    <rect x="${zx0.toFixed(1)}" y="${T}" width="${zw.toFixed(1)}" height="${base - T}" fill="var(--hz-signal)" opacity=".1"/>
    ${grid}${bars}
    <path d="${area}" fill="var(--hz-signal)" opacity=".3"/>
    <path d="M${pts(none).join(" L")}" fill="none" stroke="var(--hz-paper)" stroke-width="2" stroke-dasharray="5 4" opacity=".8"/>
    <path d="M${pts(withIt).join(" L")}" fill="none" stroke="var(--hz-signal)" stroke-width="3.5" stroke-linejoin="round"/>
    ${be}
    <line x1="${X(today).toFixed(1)}" x2="${X(today).toFixed(1)}" y1="${T}" y2="${base}" stroke="var(--hz-paper)" stroke-dasharray="1 3"/>
    <text x="${(X(today) + (own ? 7 : -7)).toFixed(1)}" y="${T + 12}" text-anchor="${own ? "start" : "end"}">today $${today.toFixed(2)}</text>
    <text x="${(zx0 + zw / 2).toFixed(1)}" y="${T + 12}" text-anchor="middle" fill="var(--hz-signal)">pays here</text>
    <line x1="${X(k).toFixed(1)}" x2="${X(k).toFixed(1)}" y1="${base}" y2="${base + 5}" stroke="var(--hz-paper)"/>
    <text x="${X(k).toFixed(1)}" y="${H - 14}" text-anchor="middle">${own ? "floor" : "cap"} $${k.toFixed(2)}</text>
    <text x="${L}" y="${H - 14}" text-anchor="start">$${xlo.toFixed(2)}</text>
    <text x="${W - R}" y="${H - 2}" text-anchor="end">month average, $ per GPU hour</text>
    <g id="hx" opacity="0"><line id="hx-l" y1="${T}" y2="${base}" stroke="var(--hz-paper)"/><circle id="hx-a" r="4.5" fill="var(--hz-paper)"/><circle id="hx-b" r="5" fill="var(--hz-signal)" stroke="var(--hz-black)" stroke-width="2"/></g>
    <rect id="hx-hit" x="${L}" y="${T}" width="${pw}" height="${base - T}" fill="transparent"/>
    <text x="${L}" y="12" fill="var(--hz-signal)">━ with protection</text><text x="${L + 190}" y="12">┅ without</text>
  </svg>`;
}
function protectionRows() {
  const p = S.portfolio;
  if (!S.wallet) return '<p class="small">Connect a wallet to see your protections.</p>';
  if (!p) return '<p class="small">Loading.</p>';
  const title = (r) => `${r.gpu} ${monthOf(r.windowStart)} ${r.kind === "put" ? "floor" : "cap"} at $${r.strike.toFixed(2)}`;
  const rows = p.rows.filter((r) => r.door === "hedge").map((r) => {
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
    return `<div class="prow"><div class="pt"><b>${esc(title(r))}</b><span class="small">${r.status === "open" ? `settles in ${countdown(r.tradingEnd)}` : esc(r.status)}</span></div><span class="tag ${r.short ? "sold" : "held"}">${r.short ? "sold" : "held"}</span><div class="pv"><span class="lab">VALUE</span><b>${value}</b></div><div class="pa">${act}</div></div>`;
  }).join("");
  return `<div class="pbar"><div class="small"><b>${usd(p.usdc)}</b> USDC in ${esc(S.wallet.name)}</div>${S.status && S.status.cluster !== "mainnet" ? '<button class="btn" id="pf-faucet">Add 10,000 test USDC</button>' : ""}</div>
    ${rows ? `<div class="plist">${rows}</div>` : '<p class="small">Nothing yet. Your first protection shows up here.</p>'}`;
}
const CHART_GLYPH = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 14l5-6 4 4 7-8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function hedgeView() {
  applyCapLink();
  const codes = GPU_ORDER.filter((c) => hedgePair(c));
  if (!codes.length) return '<section class="app"><p class="small">No protections are open right now.</p></section>';
  const h = S.hedge;
  if (!codes.includes(h.gpu)) h.gpu = codes[0];
  const wins = hedgeWindows(h.gpu);
  if (!wins.includes(h.win)) h.win = wins[0];
  const { put, call } = hedgePair(h.gpu, h.win);
  const own = h.role === "own", month = monthOf(put.windowStart), g = put.gpu, u = put.units, qn = h.qty || 1;
  const collar = own && h.collar;
  const feeMul = 1 + ((S.status && S.status.feeBps) || 0) / 10000;
  const price = (own ? (collar ? put.model.ask - call.model.bid : put.model.ask) : call.model.ask) * feeMul;
  const k = own ? put.strike : call.strike, far = own ? put.strike - put.cap : call.strike + call.cap, maxPay = own ? put.maxPayoff : call.maxPayoff;
  const m = S._hm = hedgeModel(put, call, h.role, collar, price);
  const now = lastPrint(h.gpu);
  const delta = now ? (k - now) / now : null;
  const rule = own
    ? `Average below $${k.toFixed(2)}? You get the gap, down to $${far.toFixed(2)}. Above it, you keep the gain.`
    : `Average above $${k.toFixed(2)}? You get the gap, up to $${far.toFixed(2)}. Below it, you keep the saving.`;
  const days = (t) => Math.max(0, Math.round((t - Date.now() / 1000) / 86400));
  const winOf = (w) => S.markets.find((x) => x.door === "hedge" && x.underlying === h.gpu && x.windowStart === w) || put;
  return `<section class="app">
    <header class="ahead">
      <span class="abrand"><img src="mark.svg" alt="">Hourly</span>
      <div class="aview" role="group" aria-label="View"><button data-more="0" class="${h.more ? "" : "on"}" aria-label="Price">$</button><button data-more="1" class="${h.more ? "on" : ""}" aria-label="Chart">${CHART_GLYPH}</button></div>
    </header>
    <div class="gchips">${codes.map((c) => `<button data-hg="${c}" class="${c === h.gpu ? "on" : ""}">${esc(gpuLabel(c))}</button>`).join("")}</div>
    <div class="atitle"><b>${esc(g)} rent, per hour</b><span>Current: ${now ? usd(now) : "n/a"}</span></div>
    <div class="flip" role="group" aria-label="Your side"><button data-role="own" class="${own ? "on" : ""}">Floor<small>I earn from GPUs</small></button><button data-role="rent" class="${own ? "" : "on"}">Cap<small>I pay to rent GPUs</small></button></div>
    <div class="mchips">${wins.map((w) => `<button data-win="${w}" class="${w === h.win ? "on" : ""}">${monthOf(w)}<i>${days(winOf(w).tradingEnd)}d</i></button>`).join("")}</div>
    <div class="level ${own ? "own" : "rent"}">
      <span class="llab">${own ? "Floor" : "Cap"} <i title="${esc(rule)}">i</i></span>
      <div class="lnum">$${k.toFixed(2)}</div>
      <div class="ldelta">${delta === null ? "" : `${Math.abs(delta * 100).toFixed(1)}% ${delta < 0 ? "below" : "above"} today`}</div>
      <div class="lrows"><div><span>You pay once</span><b>${usd(price * qn)}</b></div><div><span>Get up to</span><b>${usd(maxPay * qn, 0)}</b></div></div>
    </div>
    ${h.more ? `<section class="afold">
      <div class="chips">${m.chance === null ? "" : `<span>Model chance it pays: <b>${Math.round(m.chance * 100)}%</b></span>`}${m.be === null ? "" : `<span>Break-even: <b>$${m.be.toFixed(2)}</b></span>`}</div>
      <div class="scrub" id="scrub">${scrubHtml(m, m.today)}</div>
      <div class="chart">${hedgeChart(m)}</div>
      <p class="small">Move over the chart to try a price.</p></section>` : `<p class="arule">${rule}</p>`}
    ${own ? `<label class="sw"><span>Pay less: give up gains above $${call.strike.toFixed(2)}</span><input type="checkbox" id="collar" ${collar ? "checked" : ""}><i></i></label>` : ""}
    <div class="acta">
      <button class="cta" id="hedge-go">${own ? "Protect" : "Cap"} ${month} for ${usd(price * qn)}</button>
      <p class="fine">One-time price for ${qn} GPU${qn > 1 ? "s" : ""}, all ${u} hours of the month. Settles in ${countdown(put.tradingEnd)}.</p>
      <p class="status" id="h-st"></p>
    </div>
    <section class="wbody mine"><h3>Your protections</h3>${protectionRows()}</section>
  </section>`;
}
function bindHedge() {
  $$("[data-hg]").forEach((b) => b.addEventListener("click", () => { S.hedge.gpu = b.dataset.hg; S.hedge.qty = 1; render(); }));
  $$("[data-role]").forEach((b) => b.addEventListener("click", () => { S.hedge.role = b.dataset.role; render(); }));
  $$("[data-win]").forEach((b) => b.addEventListener("click", () => { S.hedge.win = b.dataset.win; render(); }));
  $$("[data-more]").forEach((b) => b.addEventListener("click", () => { S.hedge.more = b.dataset.more === "1"; render(); }));
  const cb = $("#collar"); if (cb) cb.addEventListener("change", () => { S.hedge.collar = cb.checked; render(); });
  const svg = $("#hchart"), m = S._hm;
  if (svg && m) {
    const { W, H, L, R, T, B } = CHART, pw = W - L - R, ph = H - B - T, xlo = m.xlo, xhi = m.xhi;
    const ylo = +svg.dataset.ylo, yhi = +svg.dataset.yhi, Y = (v) => T + (1 - (v - ylo) / (yhi - ylo)) * ph;
    const g = $("#hx", svg), hit = $("#hx-hit", svg);
    const move = (e) => {
      const r = svg.getBoundingClientRect(), px = Math.min(Math.max(((e.clientX - r.left) / r.width) * W, L), L + pw);
      const s = xlo + ((px - L) / pw) * (xhi - xlo);
      g.setAttribute("opacity", 1);
      $("#hx-l", svg).setAttribute("x1", px); $("#hx-l", svg).setAttribute("x2", px);
      $("#hx-a", svg).setAttribute("cx", px); $("#hx-a", svg).setAttribute("cy", Y(m.none(s)));
      $("#hx-b", svg).setAttribute("cx", px); $("#hx-b", svg).setAttribute("cy", Y(m.withIt(s)));
      $("#scrub").innerHTML = scrubHtml(m, s);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerleave", () => { g.setAttribute("opacity", 0); $("#scrub").innerHTML = scrubHtml(m, m.today); });
  }
  bindPortfolio();
  const go = $("#hedge-go");
  if (go) go.addEventListener("click", () => ensureWallet(async () => {
    const { put, call } = hedgePair(S.hedge.gpu, S.hedge.win);
    const own = S.hedge.role === "own";
    const legs = own ? [{ series: put.id, side: "buy", qty: S.hedge.qty || 1 }, ...(S.hedge.collar ? [{ series: call.id, side: "sell", qty: S.hedge.qty || 1 }] : [])] : [{ series: call.id, side: "buy", qty: S.hedge.qty || 1 }];
    const st = $("#h-st");
    try {
      st.textContent = "Getting a firm price.";
      const q = await api("quote", { owner: S.wallet.address, ref: refFor(), legs });
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
        try { const r = await signAndSubmit(q); alertBox("✓", own ? "Protected." : "Rate capped.", `${esc(put.gpu)} ${monthOf(put.windowStart)} is in your portfolio.`, r.url); await Promise.all([refreshMarkets(), refreshPortfolio(), refreshActivity()]); render(); }
        catch (e) { alertBox("!", "Not sent.", esc(e.message)); }
      }));
      st.textContent = "";
    } catch (e) {
      if (/faucet/i.test(e.message) && !go._funded && S.wallet.kind === "burner") { go._funded = true; await autoFund(); go.click(); return; }
      st.textContent = e.message;
    }
  }));
}

const weekLabel = (a, b) => `${day(new Date(a * 1000).toISOString().slice(0, 10))} to ${day(new Date((b - 86400) * 1000).toISOString().slice(0, 10))}`;
function earnView() {
  const open = S.vaults.filter((v) => v.phase === "deposits").sort((a, b) => a.epoch - b.epoch)[0];
  const live = S.vaults.find((v) => v.phase === "trading");
  const tab = S.earnTab;
  const seg = `<div class="seg etabs">${[["vault", "Vault"], ["quoters", "Quoters"], ["refer", "Refer"]].map(([k, l]) => `<button data-et="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}</div>`;
  let body = "";
  if (tab === "vault") {
    const mine = S.portfolio && S.portfolio.vaults ? S.portfolio.vaults : [];
    const mv = open && mine.find((v) => v.epoch === open.epoch);
    body = `
      ${open ? `<div class="level earnlvl"><div class="llab">Underwrite next week</div><div class="lnum">${usd(open.deposits, 0)}</div><div class="ldelta">in the vault, ${usd(open.venueSeed, 0)} of it ours. Closes in ${countdown(open.depositEnd)}.</div>
        <div class="lrows"><div><span>per market</span><b>${Math.round(open.capBps / 100)}% max</b></div><div><span>per week</span><b>50% max</b></div></div></div>
      <div class="ecard"><h3>Deposit</h3><p class="lead">Your USDC sells that week's floors and caps. You keep the premium and pay the winners. Withdraw after the week settles.</p>
        <div class="dep"><span>$</span><input id="dep" inputmode="decimal" value="1000"></div>
        <button class="cta" id="dep-go">Deposit for ${esc(weekLabel(open.depositEnd, open.epochEnd))}</button><p class="status" id="d-st"></p>
        ${mv ? `<div class="st-srow"><span>Your share</span><b>${pct(mv.share)} · ${usd(mv.cashValue)}</b></div>` : ""}</div>` : `<div class="ecard"><h3>Next week's vault</h3><p>Opens soon.</p></div>`}
      ${live ? `<div class="ecard"><h3>Trading now</h3><p class="lead">${esc(weekLabel(live.depositEnd, live.epochEnd))}</p>
        <div class="st-srow"><span>Deposited</span><b>${usd(live.deposits, 0)}</b></div>
        <div class="st-srow"><span>Premium collected</span><b>${usd(live.premiums)}</b></div>
        <div class="st-srow"><span>Markets open</span><b>${live.openSeries}</b></div>
        <div class="st-srow"><span>Premium so far, before payouts</span><b>${pct(live.deposits ? live.premiums / live.deposits : 0)}</b></div></div>` : ""}
      ${stakeCard()}`;
  } else if (tab === "quoters") {
    const qs = (S.activity && S.activity.quoters) || [];
    const rows = qs.map((q, i) => `<div class="qrow"><i>${i + 1}</i><div><b>${esc(q.name)}</b><span>${q.fills} fill${q.fills === 1 ? "" : "s"} · ${q.wallets} wallet${q.wallets === 1 ? "" : "s"}</span></div><div class="qr"><b>${usd(q.premium)}</b><span>${pct(q.share)}</span></div></div>`).join("");
    body = `
      <div class="ecard"><h3>Who filled this week's RFQs</h3><p class="lead">Every trade is a 45 second RFQ. The weekly vault takes it first, the venue desk takes the rest.</p>${rows || "<p>No fills in 7 days.</p>"}</div>
      <div class="ecard"><h3>Quoter program</h3><p class="lead">Outside makers will answer the same RFQs. Score = 1 point for answering inside 2 seconds, plus 1 point per 10 bps of price improvement on the model mid. Volume scores nothing. Each epoch's budget comes from fee income and is paid by score.</p>
        <div class="st-srow"><span>Answer window</span><b>2 s</b></div>
        <div class="st-srow"><span>Price improvement</span><b>1 pt per 10 bps</b></div>
        <div class="st-srow"><span>Paid in</span><b>USDC, no token</b></div>
        <button class="cta" disabled>Register a quoter key</button><p class="small muted">Proposed. Opens after launch.</p></div>`;
  } else {
    const k = S.stake && S.stake.broker;
    const link = S.wallet ? `${location.origin}${location.pathname}?ref=${S.wallet.address}` : "";
    const ladder = (k ? k.levels : [{ min: 10_000, share: 0.1 }, { min: 100_000, share: 0.2 }, { min: 1_000_000, share: 0.3 }, { min: 10_000_000, share: 0.4 }, { min: 100_000_000, share: 0.5 }]);
    body = `
      <div class="level earnlvl"><div class="llab">Broker level</div><div class="lnum">${k ? k.level : 0}</div><div class="ldelta">${k ? `${pct(k.feeShare)} of fees on premium you refer` : "Connect to see yours"}</div>
        <div class="lrows"><div><span>referred, 28d</span><b>${usd(k ? k.referred : 0, 0)}</b></div><div><span>traders</span><b>${k ? k.traders : 0}</b></div></div>
        ${k && k.next ? `<div class="lprog"><span style="width:${Math.round(k.progress * 100)}%"></span></div><div class="ldelta">${usd(Math.max(0, k.next.min - k.referred), 0)} more to level ${k.level + 1}, ${pct(k.next.share)}</div>` : ""}</div>
      <div class="ecard"><h3>Your link</h3><p class="lead">Anyone who protects a rental through it counts as yours. GPU marketplaces and resellers embed it.</p>
        ${S.wallet ? `<div class="reflink"><code>${esc(link)}</code><button class="mini" id="ref-copy">Copy</button></div>` : `<button class="cta" id="ref-connect">Connect to get a link</button>`}</div>
      <div class="ecard"><h3>Levels</h3>${ladder.map((l, i) => `<div class="st-srow"><span>Level ${i + 1} · ${usd(l.min, 0)}+ referred in 28 days</span><b>${pct(l.share)}</b></div>`).join("")}<p class="small muted">Proposed. Referrals are recorded now; fee share pays after launch.</p></div>`;
  }
  return `<section class="app earn">
    <header class="ahead"><span class="abrand"><img src="mark.svg" alt="">Hourly</span></header>
    ${seg}${body}</section>`;
}
function bindEarn() {
  $$("[data-et]").forEach((b) => b.addEventListener("click", () => { S.earnTab = b.dataset.et; render(); }));
  const rc = $("#ref-copy");
  if (rc) rc.addEventListener("click", async () => { try { await navigator.clipboard.writeText($(".reflink code").textContent); rc.textContent = "Copied"; } catch (_) { rc.textContent = "Select it"; } });
  const rcn = $("#ref-connect");
  if (rcn) rcn.addEventListener("click", () => ensureWallet(() => render()));
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
const XGLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-7.2 8.2L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.7-8.8L1.5 2h6.8l4.7 6.2L18.9 2z"/></svg>';
const xShare = (text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.origin + location.pathname)}`;
const hueOf = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const sparkSvg = (h, w = 120, ht = 34) => {
  if (!h || h.length < 2) return "";
  const v = h.map((x) => x[1]), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1;
  const P = v.map((y, i) => `${((i / (v.length - 1)) * (w - 6) + 3).toFixed(1)},${(ht - 4 - ((y - lo) / r) * (ht - 8)).toFixed(1)}`);
  const last = P[P.length - 1].split(",");
  return `<svg viewBox="0 0 ${w} ${ht}" class="spark" aria-hidden="true"><path d="M${P.join(" L")} L${w - 3},${ht} L3,${ht} Z" fill="var(--hz-black)" opacity=".08"/><path d="M${P.join(" L")}" fill="none" stroke="var(--hz-black)" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="3.2" fill="var(--hz-signal)"/></svg>`;
};
function flowChart(trades) {
  const days = 7, now = Date.now(), W = 300, H = 90, bw = W / days;
  const sum = Array.from({ length: days }, () => ({ floor: 0, cap: 0 }));
  trades.forEach((t) => { const k = Math.floor((now - new Date(t.at).getTime()) / 864e5); if (k >= 0 && k < days) sum[days - 1 - k][t.kind === "put" ? "floor" : "cap"] += t.cost; });
  const mx = Math.max(1, ...sum.map((d) => d.floor + d.cap));
  const bars = sum.map((d, i) => { const hf = (d.floor / mx) * (H - 22), hc = (d.cap / mx) * (H - 22), x = i * bw + 5; return `<rect x="${x}" y="${H - 14 - hf}" width="${bw - 10}" height="${hf}" fill="var(--hz-black)"/><rect x="${x}" y="${H - 14 - hf - hc}" width="${bw - 10}" height="${hc}" fill="var(--hz-signal)"/><text x="${x + (bw - 10) / 2}" y="${H - 2}" text-anchor="middle">${["S", "M", "T", "W", "T", "F", "S"][new Date(now - (days - 1 - i) * 864e5).getDay()]}</text>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="flow" role="img" aria-label="Premium paid per day, last seven days">${bars}</svg>`;
}
function activityView() {
  const a = S.activity;
  if (!a) return windowShell("Activity", '<div class="wbody">Loading.</div>');
  const hours = { "1h": 1, "24h": 24, "7d": 168 }[S.feedWin];
  const all = a.trades.filter((x) => x.door === "hedge");
  const inWin = all.filter((x) => Date.now() - new Date(x.at).getTime() <= hours * 36e5);
  const floors = inWin.filter((x) => x.kind === "put").reduce((n, x) => n + x.cost, 0), caps = inWin.filter((x) => x.kind === "call").reduce((n, x) => n + x.cost, 0);
  const fl = floors + caps > 0 ? floors / (floors + caps) : null;
  const test = a.cluster !== "devnet" && a.cluster !== "mainnet";
  const xh = S.status && S.status.xHandle;
  const chips = S.index.filter((g) => GPU_ORDER.includes(g.code)).map((g) => {
    const t = inWin.filter((x) => x.underlying === g.code), f = t.filter((x) => x.kind === "put").length;
    const c = g.chg30;
    return `<div class="chip"><div class="ch"><b>${esc(g.label)}</b><span>${usd(g.last)}</span></div>${sparkSvg(g.history)}
      <div class="cs"><span class="${c >= 0 ? "up" : "dn"}">${c >= 0 ? "+" : ""}${(c * 100).toFixed(1)}% 30d</span><span>${t.length ? `${f} floor${f === 1 ? "" : "s"}, ${t.length - f} cap${t.length - f === 1 ? "" : "s"}` : "no protections"}</span></div></div>`;
  }).join("");
  const card = (x) => {
    const post = `${x.headline}. Locked in on Hourly, protecting the price of AI compute.`;
    return `<article class="tcard"><header><span class="av" style="--hu:${hueOf(x.name)}">${esc(initials(x.name))}</span><div><b>${esc(x.name)}</b><span>${ago(x.at)}</span></div>
      <a class="xs" href="${xShare(post)}" target="_blank" rel="noopener" title="Share on X" aria-label="Share on X">${XGLYPH}</a></header>
      <p>${esc(x.headline)}</p>
      <footer><span class="dir ${x.kind === "put" ? "lower" : "higher"}">${x.kind === "put" ? "floor" : "cap"} · ${x.side === "sell" ? "sold" : "bought"}</span><span class="amt">${usd(x.cost)}</span></footer></article>`;
  };
  return `<section class="app act">
    <header class="ahead"><span class="abrand"><img src="mark.svg" alt="">Hourly</span></header>
    <div class="chips">${chips}</div>
    <div class="feed">
      <div class="wall">${all.length ? all.slice(0, 12).map(card).join("") : "<p>No protections yet. Be the first.</p>"}
        ${test ? '<p class="small muted">Test chain: includes our own test trades.</p>' : ""}</div>
      <aside>
        <div class="seg">${["1h", "24h", "7d"].map((w) => `<button data-fw="${w}" class="${w === S.feedWin ? "on" : ""}">${w}</button>`).join("")}</div>
        <div class="trio"><div><b>${inWin.length}</b><span>protections</span></div><div><b>${usd(inWin.reduce((n, x) => n + x.cost, 0), 0)}</b><span>premium</span></div><div><b>${new Set(inWin.map((x) => x.name)).size}</b><span>wallets</span></div></div>
        ${fl !== null ? `<div class="meter"><span style="width:${Math.round(fl * 100)}%"></span></div><div class="small row" style="justify-content:space-between"><span>${pct(fl)} floors</span><span>${pct(1 - fl)} caps</span></div>` : ""}
        <h3>Premium per day</h3>${flowChart(all)}
        <div class="small row" style="justify-content:space-between"><span class="lg k">floors</span><span class="lg o">caps</span></div>
        <a class="xcta" href="${xShare("Locking in the price of AI compute, on Hourly.")}" target="_blank" rel="noopener">${XGLYPH}<span>Post it on X</span></a>
        ${xh ? `<a class="xcta ghost" href="https://x.com/${esc(xh)}" target="_blank" rel="noopener">${XGLYPH}<span>Follow @${esc(xh)}</span></a>` : ""}
      </aside>
    </div></section>`;
}
// Proposed mechanism, docs/INFRA.md section 4: premium that expired unused
// mints shares of next week's vault. Numbers come from this wallet's fills and
// the live vault; the mint itself is not on chain.
function stakeCard() {
  const k = S.stake;
  const body = !S.wallet
    ? `<p>Connect to see it.</p>`
    : !k ? `<p>Loading.</p>`
    : `<div class="st-srow"><span>Premium that expired unused</span><b>${usd(k.expired)}</b></div>
       <div class="st-srow"><span>Rate this epoch</span><b>${(k.rate * 100).toFixed(1)}¢ per $1</b></div>
       <div class="st-srow"><span>Vault shares you would mint</span><b>${usd(k.shares)}</b></div>
       <div class="st-srow"><span>Of ${k.epoch ? `week ${k.epoch}` : "next week"}'s vault</span><b>${k.share < 0.0005 && k.share > 0 ? "<0.1%" : pct(k.share)}</b></div>
       ${k.open > 0 ? `<p class="small muted">${usd(k.open)} of your premium is still open. It counts when its market settles.</p>` : ""}`;
  return `<div class="stake"><h3>Your stake</h3><p class="lead">Insurance you did not need buys you a piece of the insurer.</p>${body}<p class="small muted">Proposed. Not on chain yet.</p></div>`;
}
function bindActivity() {
  $$("[data-fw]").forEach((b) => b.addEventListener("click", () => { S.feedWin = b.dataset.fw; render(); }));
}

// ---------- portfolio ----------
// A fresh burner on a test chain gets test USDC without a click. Silent, best effort (the faucet may rate-limit).
async function autoFund() {
  if (!S.wallet || S.wallet.kind !== "burner" || (S.status && S.status.cluster === "mainnet")) return;
  try { if (S.portfolio && S.portfolio.usdc > 0) return; await api("faucet", { owner: S.wallet.address }); await refreshPortfolio(); render(); } catch (_) { /* the ticket offers the faucet button */ }
}
async function faucet() {
  try { const r = await api("faucet", { owner: S.wallet.address }); alertBox("✓", "Added test USDC.", `${usd(r.amount, 0)} is in your wallet.`, r.url); }
  catch (e) { alertBox("!", "Faucet", esc(e.message)); }
  await refreshPortfolio(); render();
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

// ---------- trading desk: chart left, ticket right, positions below ----------
// Papertrade-style layout on Hourly's engine. One market at a time; the chart
// shows the level and the date the ticket has picked.
function tradeLink() {
  const t = S.t, m = S.markets.find((x) => x.id === t.seriesId);
  return m ? `${location.origin}${location.pathname}?t=${t.gpu}~${t.side}~${m.strike}~${m.windowEnd}~${t.amount}` : "";
}
function applyDeepLink() {
  let v; try { v = new URLSearchParams(location.search).get("t"); } catch (_) { return; }
  if (!v || S.dl || !S.markets.length) return;
  const [gpu, side, strike, date, amt] = v.split("~");
  S.dl = true;
  if (!gpu || !GPU_ORDER.includes(gpu)) return;
  const m = predict().find((x) => x.underlying === gpu && x.strike === Number(strike) && x.windowEnd === date);
  S.t.gpu = gpu; S.t.side = side === "lower" ? "lower" : "higher"; S.t.amount = Math.min(1000, Math.max(1, Number(amt) || 10));
  if (m) { S.t.strike = m.strike; S.t.seriesId = m.id; }
}
// /freeze hands off here: ?cap=<CHIP>~<YYYY-MM-01>~<contracts>
function applyCapLink() {
  let v; try { v = new URLSearchParams(location.search).get("cap"); } catch (_) { return; }
  if (!v || S.dlc || !S.markets.length) return;
  S.dlc = true;
  const [gpu, win, qty] = v.split("~");
  if (!GPU_ORDER.includes(gpu)) return;
  S.hedge.gpu = gpu; S.hedge.role = "rent"; S.hedge.collar = false;
  if (win) S.hedge.win = win;
  S.hedge.qty = Math.min(50, Math.max(1, Math.floor(Number(qty)) || 1));
}
function deskInit() {
  applyDeepLink();
  const t = S.t;
  if (!levelsFor(t.gpu).length) t.gpu = GPU_ORDER.find((c) => levelsFor(c).length) || t.gpu;
  if (!t.side) t.side = "higher";
  const ks = levelsFor(t.gpu), last = lastPrint(t.gpu) || 0;
  if (!ks.includes(t.strike)) { t.strike = ks.length ? ks.reduce((p, k) => (Math.abs(k - last) < Math.abs(p - last) ? k : p)) : null; t.seriesId = null; }
  const ds = t.strike !== null ? datesFor(t.gpu, t.strike) : [];
  if (!ds.some((m) => m.id === t.seriesId)) { t.seriesId = ds[0] ? ds[0].id : null; t.quote = null; }
}
const deskQty = (m) => Math.max(0, Math.floor(S.t.amount / (sideUnit(m, S.t.side) * (S.t.side === "higher" ? 1.01 : 1))));
function deskStats(g) {
  const ms = predict().filter((m) => m.underlying === g.code);
  const oi = ms.reduce((n, m) => n + (m.openInterest || 0), 0);
  const tr = ((S.activity && S.activity.trades) || []).filter((x) => x.underlying === g.code && Date.now() - Date.parse(x.at) < 7 * 864e5);
  const prem = tr.reduce((n, x) => n + x.cost, 0);
  const q = ((S.activity && S.activity.quoters) || []).length;
  return [["Last print", g.lastDate ? day(g.lastDate) : ""], ["Open interest", oi.toLocaleString("en-US")], ["7d premium", usd(prem, 0)], ["Markets", String(ms.length)], ["Quoters", String(q)]];
}
function ticketHtml() {
  const t = S.t, g = gpuLabel(t.gpu), up = t.side === "higher";
  const ks = levelsFor(t.gpu), ds = t.strike !== null ? datesFor(t.gpu, t.strike) : [];
  const m = S.markets.find((x) => x.id === t.seriesId) || null;
  const p = S.wallet ? S.portfolio : null;
  const openN = p ? p.rows.filter((r) => r.status === "open" && (r.long || r.short)).length : 0;
  const locked = p ? p.rows.reduce((n, r) => n + (r.lockedCollateral || 0), 0) : 0;
  const eq = `<div class="teq"><span>Balance <b>${p ? usd(p.usdc, 0) : "--"}</b></span><span>${p ? openN : "--"} open</span></div>`;
  const toggle = `<div class="tside" role="group" aria-label="Side"><button data-side="higher" class="up ${up ? "on" : ""}">▲ Higher</button><button data-side="lower" class="dn ${up ? "" : "on"}">▼ Lower</button></div>`;
  const row = (k, lab, mm, sel, attr) => { const ch = mm ? sideChance(mm, t.side) : 0; return `<button class="trow ${sel ? "on" : ""}" ${attr}="${k}" style="--ch:${Math.round(ch * 100)}%" title="${pct(ch)} chance"><span>${lab}</span><small>${mm ? cents(sideUnit(mm, t.side)) : ""}</small></button>`; };
  const strikes = `<div class="tlab">${up ? "Rents above" : "Rents at or below"}<i>bar = chance</i></div><div class="trows">${ks.map((k) => row(k, `$${k.toFixed(2)}`, seriesNear(t.gpu, k), k === t.strike, "data-k")).join("")}</div>`;
  const dates = `<div class="tlab">On</div><div class="tdays">${ds.map((x) => `<button class="${x.id === t.seriesId ? "on" : ""}" data-d="${x.id}">${day(x.windowEnd).replace(/ (Oct|Nov|Dec|Sep|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug)/, "")}</button>`).join("")}</div>`;
  if (!m) return `<aside class="ticket ${up ? "tup" : "tdn"}" id="ticket">${eq}${toggle}${strikes}${dates}<p class="tfine">No open market here. Pick another price.</p></aside>`;
  const unit = sideUnit(m, t.side), qty = deskQty(m), verb = up ? "above" : "at or below", q = t.quote;
  let bottom;
  if (q) {
    const put = up ? q.pay + q.fee : q.lock - q.receive;
    const left = Math.max(0, 40 - Math.round((Date.now() - t.quotedAt) / 1000));
    bottom = `<div class="tq ${up ? "up" : "dn"}">
      <p>You put in <b>${usd(put)}</b>. If ${esc(g)} rents ${verb} $${m.strike.toFixed(2)} on ${day(m.windowEnd)}, you get <b>${usd(q.legs[0].qty)}</b>. If not, nothing.</p>
      <div class="tlines"><div><span>Contracts</span><b>${q.legs[0].qty}</b></div><div><span>Price</span><b>${cents(up ? q.legs[0].price : 1 - q.legs[0].price)} per $1</b></div>${q.fee ? `<div><span>Fee</span><b>${usd(q.fee)}</b></div>` : ""}<div><span>Filled by</span><b>${q.legs[0].via === "vault" ? "weekly vault" : "venue desk"}</b></div><div><span>Firm for</span><b id="qtm">${left}s</b></div></div>
      <button class="tcta ${up ? "up" : "dn"}" id="t-sign">Sign with wallet</button><button class="tback" id="t-back">Change</button></div>`;
  } else {
    bottom = `<div class="tlab">Amount</div>
      <div class="tamt"><span>$</span><input id="amt" inputmode="decimal" value="${t.amount}" aria-label="Amount in USDC"><div class="tchips">${[5, 20, 50, 100].map((v) => `<button data-amt="${v}" class="${t.amount === v ? "on" : ""}">$${v}</button>`).join("")}</div></div>
      <div class="thero"><div><i>You pay at most</i><b id="loss">${usd(t.amount)}</b></div><div class="w"><i>You get if right</i><b id="win" data-v="${qty}">${usd(qty)}</b></div></div>
      <div class="tlines"><div><span>Implied chance</span><b>${pct(sideChance(m, t.side))}</b></div><div><span>Price per $1 payout</span><b>${cents(unit)}</b></div><div><span>Contracts</span><b id="qty">${qty}</b></div><div><span>Fee</span><b>${up ? "1%" : "none"}</b></div><div><span>Max loss</span><b>${up ? "price paid" : "locked collateral"}</b></div><div><span>Payout</span><b>escrowed up front</b></div><div><span>Other side</span><b>vault, else desk</b></div></div>
      <button class="tcta ${S.wallet ? (up ? "up" : "dn") : "gold"}" id="t-go" ${qty > 0 || !S.wallet ? "" : "disabled"}>${S.wallet ? (t.quoting ? "Getting a firm price" : "Get a firm price") : "Connect wallet"}</button>
      <p class="status tst" id="t-st">${t.qerr ? esc(t.qerr) : ""}</p>
      <div class="tshare"><button id="t-copy">Copy link to this trade</button><a target="_blank" rel="noopener" href="${xShare(`${g} ${verb} $${m.strike.toFixed(2)} on ${day(m.windowEnd)}: ${pct(sideChance(m, t.side))} chance, ${cents(unit)} per $1.`).replace(encodeURIComponent(location.origin + location.pathname), encodeURIComponent(tradeLink()))}">Post it</a></div>`;
  }
  return `<aside class="ticket ${up ? "tup" : "tdn"}" id="ticket">${eq}${toggle}${strikes}${dates}${bottom}</aside>`;
}
function tapeMarquee() {
  const tr = ((S.activity && S.activity.trades) || []).slice(0, 14);
  if (!tr.length) return "";
  const chip = (x) => { const u = x.direction === "higher" || x.kind === "call"; return `<span class="tkc ${u ? "up" : "dn"}">${u ? "▲" : "▼"} ${esc(x.gpu || x.underlying)} ${usd(x.cost, 0)}</span>`; };
  const row = tr.map(chip).join("");
  return `<div class="tape" aria-label="Recent trades"><div class="mqtrack">${row}${row}</div></div>`;
}
function deskPositions() {
  const tab = S.deskTab || "positions";
  const test = S.status && S.status.cluster !== "mainnet";
  const tabs = `<div class="ttabs">${[["positions", "Positions"], ["tape", "Tape"], ["settled", "Settled"]].map(([k, l]) => `<button data-tt="${k}" class="${tab === k ? "on" : ""}">${l}</button>`).join("")}<span class="spacer"></span>${S.wallet && test ? '<button class="mini" id="pf-faucet">Add test USDC</button>' : ""}</div>`;
  let body;
  if (tab === "tape") {
    const tr = (S.activity && S.activity.trades) || [];
    body = tr.length ? `<table class="ptab"><tr><th>When</th><th>Who</th><th>Trade</th><th class="r">Premium</th><th class="r">Result</th></tr>${tr.slice(0, 30).map((x) => `<tr><td>${ago(x.at)}</td><td>${esc(x.name)}</td><td>${esc(x.headline)}</td><td class="r">${usd(x.cost)}</td><td class="r">${x.settled ? (x.pnl >= 0 ? `<span class="up">+${usd(x.pnl)}</span>` : `<span class="dn">${usd(x.pnl)}</span>`) : "open"}</td></tr>`).join("")}</table>` : '<p class="tempty">No trades yet.</p>';
  } else if (tab === "settled") {
    const rs = S.wallet && S.portfolio ? S.portfolio.rows.filter((r) => r.status === "settled") : [];
    body = !S.wallet ? '<p class="tempty">Connect wallet to see what settled for you.</p>' : rs.length ? `<table class="ptab"><tr><th>Market</th><th class="r">Settled at</th><th class="r">Payout</th></tr>${rs.map((r) => `<tr><td><b>${esc(r.gpu)} ${r.door === "predict" ? `$${r.strike.toFixed(2)} on ${day(r.windowEnd)}` : `${monthOf(r.windowStart)} ${r.kind === "put" ? "floor" : "cap"} $${r.strike.toFixed(2)}`}</b></td><td class="r">$${r.settled.price.toFixed(4)}</td><td class="r">${usd(r.long > 0 ? r.redeemable : r.reclaimable || 0)}</td></tr>`).join("")}</table>` : '<p class="tempty">Nothing settled yet.</p>';
  } else if (!S.wallet) {
    body = '<p class="tempty">Connect wallet to view your positions. <button class="mini" id="pf-connect">Connect</button></p>';
  } else if (!S.portfolio) {
    body = '<p class="tempty">Loading.</p>';
  } else {
    const p = S.portfolio;
    const rows = p.rows.map((r) => {
      const pred = r.door === "predict";
      const title = pred ? `${r.gpu} ${r.short > r.long ? "at or below" : "above"} $${r.strike.toFixed(2)}` : `${r.gpu} ${monthOf(r.windowStart)} ${r.kind === "put" ? "floor" : "cap"} at $${r.strike.toFixed(2)}`;
      const when = pred ? day(r.windowEnd) : monthOf(r.windowStart), dirUp = pred ? r.long >= r.short : r.kind === "call";
      let value, act = "";
      if (r.status === "settled") {
        value = `settled $${r.settled.price.toFixed(4)}`;
        if (r.long > 0) act += `<button class="mini" data-act="redeem" data-s="${r.id}">Redeem ${usd(r.redeemable)}</button> `;
        if (r.short > 0) act += `<button class="mini" data-act="reclaim" data-s="${r.id}">Reclaim ${usd(r.reclaimable)}</button>`;
      } else {
        value = usd((r.markPerContract ?? 0) * (r.long - r.short));
        const both = Math.min(r.long, r.short);
        if (both > 0) act = `<button class="mini" data-act="close" data-s="${r.id}" data-q="${both}">Close ${both}</button>`;
      }
      return `<tr><td><b>${esc(title)}</b><div class="muted">${when} · ${r.status === "open" ? `closes in ${countdown(r.tradingEnd)}` : esc(r.status)}</div></td><td><span class="${dirUp ? "up" : "dn"}">${dirUp ? "▲" : "▼"} ${r.long ? `long ${r.long}` : ""} ${r.short ? `short ${r.short}` : ""}</span></td><td class="r">${value}${r.short ? `<div class="muted">${usd(r.lockedCollateral, 0)} locked</div>` : ""}</td><td class="r">${act}</td></tr>`;
    }).join("");
    const vrows = (p.vaults || []).map((v) => `<tr><td><b>Vault, ${esc(weekLabel(v.depositEnd, v.epochEnd))}</b><div class="muted">${esc(v.phase)}</div></td><td>${pct(v.share)} of it</td><td class="r">${usd(v.cashValue)}</td><td class="r">${v.phase === "withdrawable" ? `<button class="mini" data-vw="${v.epoch}">Withdraw</button>` : ""}</td></tr>`).join("");
    body = rows || vrows ? `<table class="ptab"><tr><th>Market</th><th>Side</th><th class="r">Value</th><th></th></tr>${rows}${vrows}</table>` : '<p class="tempty">Nothing yet. Your first trade shows up here.</p>';
  }
  return `<section class="tpos">${tabs}${body}</section>`;
}
const logRet = (h) => h.slice(1).map((p, i) => Math.log(p[1] / h[i][1]));
function intelRow(g) {
  const h = g.history || [], last = h.length ? h[h.length - 1][1] : g.last;
  const r = logRet(h.slice(-31)), mean = r.reduce((a, b) => a + b, 0) / (r.length || 1);
  const vol = r.length > 5 ? Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1)) * Math.sqrt(365) : null;
  const w30 = h.slice(-30).map((p) => p[1]), hi90 = Math.max(...h.slice(-90).map((p) => p[1]));
  return { g, last, vol, lo: Math.min(...w30), hi: Math.max(...w30), dd: last / hi90 - 1, n: h.length, month: vol === null ? null : last * vol * Math.sqrt(30 / 365) };
}
function intelSpark(h) {
  const v = h.slice(-90).map((p) => p[1]); if (v.length < 2) return "";
  const lo = Math.min(...v), hi = Math.max(...v), W = 120, H = 28, d = hi - lo || 1;
  const pts = v.map((y, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - 2 - (y - lo) / d * (H - 4)).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;
}
const pctSgn = (x) => (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + "%";
function intelHtml() {
  const rows = GPU_ORDER.map((c) => S.index.find((x) => x.code === c)).filter(Boolean).map(intelRow);
  if (!rows.length) return '<p class="tempty">Loading the index.</p>';
  const body = rows.map((r) => `<tr class="${r.g.code === S.t.gpu ? "sel" : ""}" data-gpu="${r.g.code}"><td><b>${esc(r.g.label)}</b></td><td class="r">${usd(r.last)}</td><td class="r"><span class="${r.g.chg7 >= 0 ? "up" : "dn"}">${pctSgn(r.g.chg7)}</span></td><td class="r"><span class="${r.g.chg30 >= 0 ? "up" : "dn"}">${pctSgn(r.g.chg30)}</span></td><td class="r"><span class="${r.g.chg90 >= 0 ? "up" : "dn"}">${pctSgn(r.g.chg90)}</span></td><td class="r">${usd(r.lo)} to ${usd(r.hi)}</td><td class="r">${r.vol === null ? "n/a" : (r.vol * 100).toFixed(0) + "%"}</td><td class="r">${r.month === null ? "n/a" : "±" + usd(r.month)}</td><td class="r"><span class="${r.dd >= -0.005 ? "" : "dn"}">${pctSgn(r.dd)}</span></td><td class="r sp">${intelSpark(r.g.history || [])}</td></tr>`).join("");
  const h100 = rows.find((r) => r.g.code === "H100_SXM"), h200 = rows.find((r) => r.g.code === "H200"), b200 = rows.find((r) => r.g.code === "B200");
  const ratio = (a, b, n) => (a && b ? `${n} ${(a.last / b.last).toFixed(2)}x` : "");
  const first = (rows[0].g.history || [])[0], lastd = rows[0].g.lastDate;
  return `<div class="tintel"><table class="ptab"><tr><th>Chip</th><th class="r">Rent now</th><th class="r">7d</th><th class="r">30d</th><th class="r">90d</th><th class="r">30d range</th><th class="r">Realised vol</th><th class="r">1 month, 1σ</th><th class="r">From 90d high</th><th class="r">90d</th></tr>${body}</table>
    <p class="tfine">${[ratio(h200, h100, "H200 / H100"), ratio(b200, h100, "B200 / H100")].filter(Boolean).join(" · ")}${first ? ` · ${rows[0].n} daily prints from ${day(first[0])} to ${day(lastd)}` : ""}</p>
    <p class="tfine">Source: Ornn OCPI daily prints. Realised vol is the standard deviation of daily log changes over 30 days, times √365. "1 month, 1σ" is rent times that vol over 30 days: a size of past moves, not a forecast.</p></div>`;
}
const VENUES = [
  { name: "Hourly (this page)", where: "Solana", kind: "Monthly caps, daily higher or lower, on the Ornn index", status: "Test money", can: "Trade on a private test network. Settlement by Switchboard oracle is not yet proven on devnet. No mainnet.", url: "https://github.com/mrhouzlane/hourly", checked: "12 Oct" },
  { name: "Polymarket", where: "On-chain", kind: "Bracket binaries on the Ornn index", status: "Live", can: "Bet on where Ornn H100 settles end of Oct, Nov, 2026. H200, B200, A100 also open.", url: "https://polymarket.com/event/gpu-rental-prices-h100-end-of-october", checked: "12 Oct" },
  { name: "Bitget H100USDT, B200USDT", where: "Exchange", kind: "Perp, 10x, funding every 8h", status: "Live", can: "Trade 24/7. H100 last 2.638, 24h volume about $135k.", url: "https://www.bitget.com/support/articles/12560603894397", checked: "12 Oct" },
  { name: "Kalshi", where: "Regulated exchange", kind: "Binaries", status: "Yearly max only", can: "Weekly and monthly series are finalized. Yearly-max GPU markets are open. Index source not named in the rules text.", url: "https://api.elections.kalshi.com/trade-api/v2/markets", checked: "12 Oct" },
  { name: "Ornn", where: "Off-chain", kind: "Index plus rental marketplace", status: "Index live", can: "Read the index free. Reserve or rent nodes after sign-in. No futures on its own pages.", url: "https://data.ornn.com", checked: "12 Oct" },
  { name: "Silicon Data", where: "Off-chain", kind: "Index only", status: "Index live", can: "Buy the data. No tradable product on the page.", url: "https://www.silicondata.com/products/silicon-index", checked: "12 Oct" },
  { name: "CME / NYMEX, Silicon Data H100 and B200", where: "Off-chain", kind: "Futures", status: "Under CFTC review", can: "Nothing yet. CFTC letter extends the review to 9 Nov 2026. That is a review deadline, not a launch date.", url: "https://www.cftc.gov/filings/documents/2026/orgdcmnymexcompcontr260921.pdf", checked: "12 Oct" },
  { name: "ICE x Ornn", where: "Off-chain", kind: "Futures", status: "Announced 19 May", can: "Nothing yet. Subject to regulatory approval, no date.", url: "https://ir.theice.com/press/news-details/2026/ICE-and-Ornn-to-Launch-GPU-Compute-Futures-Contracts/default.aspx", checked: "12 Oct" },
  { name: "Architect AX", where: "Off-chain", kind: "Perps on Ornn indexes", status: "Announced 21 Jan", can: "Nothing confirmed live. Pending approval.", url: "https://www.prnewswire.com/news-releases/architect-financial-technologies-partners-with-compute-index-provider-ornn-to-launch-exchange-traded-futures-on-gpu-and-ram-prices-302666613.html", checked: "12 Oct" },
  { name: "Nodal x Compute Desk", where: "Off-chain", kind: "Futures", status: "Announced 3 Sep", can: "Nothing yet. Planned this year, subject to compliance.", url: "https://www.nodalexchange.com/wp-content/uploads/Nodal-Exchange-and-Compute-Desk-to-launch-Compute-Futures-Contracts-Sep-3-2026.pdf", checked: "12 Oct" },
  { name: "ICE x NATIVX", where: "Off-chain", kind: "Futures on the COIL index", status: "Announced 1 Jul", can: "Nothing yet. Later in 2026, approvals pending.", url: "https://ir.theice.com/press/news-details/2026/ICE-and-NATIVX-to-Launch-Energy-Normalized-Compute-Futures-Contracts/default.aspx", checked: "12 Oct" },
  { name: "Hyperliquid compute perps", where: "On-chain", kind: "Perp", status: "Delisted", can: "Nothing. Open interest 0, stale mark.", url: "https://api.hyperliquid.xyz/info", checked: "12 Oct" },
  { name: "Vast.ai", where: "Off-chain", kind: "Spot rental, reserved 1, 3, 6 months", status: "Live", can: "Rent on demand or reserve at a discount. No price hedge.", url: "https://vast.ai/pricing", checked: "12 Oct" },
  { name: "Akash, Aethir", where: "On-chain / credits", kind: "Spot rental", status: "Live", can: "Rent. No forward or hedge product on their pages.", url: "https://akash.network", checked: "12 Oct" },
  { name: "Compute Labs, io.net", where: "Claimed Solana", kind: "Unknown", status: "UNVERIFIED", can: "Pages blocked when read. Nothing confirmed.", url: "https://www.computelabs.ai", checked: "12 Oct" },
];
function venuesHtml() {
  if (!VENUES.length) return '<p class="tempty">Venue list not published yet.</p>';
  const row = (v) => `<tr><td><b>${esc(v.name)}</b></td><td>${esc(v.where)}</td><td>${esc(v.kind)}</td><td>${esc(v.status)}</td><td>${esc(v.can)}</td><td class="r"><a target="_blank" rel="noopener" href="${esc(v.url)}">source</a> <span class="muted">${esc(v.checked)}</span></td></tr>`;
  return `<div class="tvenues"><table class="ptab"><tr><th>Venue</th><th>Where</th><th>Instrument</th><th>Status</th><th>What you can do today</th><th class="r">Checked</th></tr>${VENUES.map(row).join("")}</table>
    <p class="tfine">Read on 12 Oct 2026, each row from its own source. UNVERIFIED means the page could not be opened. No Solana GPU-price derivative was found, but two Solana-linked pages were blocked.</p></div>`;
}
function deskView() {
  deskInit();
  const t = S.t, g = S.index.find((x) => x.code === t.gpu);
  if (!g) return '<section class="tdesk"><p class="tempty">Loading the index.</p></section>';
  const pane = S.pane || "chart";
  CHS.W = 1100; CHS.H = innerWidth > 980 ? Math.max(240, Math.min(460, innerHeight - 440)) : 300;
  const pills = GPU_ORDER.map((c) => S.index.find((x) => x.code === c)).filter(Boolean).map((x) => `<button class="apill ${x.code === t.gpu ? "on" : ""}" data-gpu="${x.code}"><b>${esc(x.label)}</b><span>${usd(x.last)}</span><em class="${x.chg7 >= 0 ? "up" : "dn"}">${x.chg7 >= 0 ? "+" : ""}${(x.chg7 * 100).toFixed(2)}%</em></button>`).join("");
  const ir = intelRow(g), ds = deskStats(g);
  const stats = [["30d vol", ir.vol === null ? "n/a" : (ir.vol * 100).toFixed(0) + "%"], ds[1], ds[2], ds[4]].map(([k, v]) => `<span class="spill"><i>${k}</i><b>${v}</b></span>`).join("");
  const rng = [30, 60, 90].map((n) => `<button data-rng="${n}" class="${(t.range || 30) === n ? "on" : ""}">${n}d</button>`).join("");
  const panes = [["chart", "Chart"], ["intel", "Chip intel"], ["venues", "Venues"]].map(([k, l]) => `<button data-pane="${k}" class="${pane === k ? "on" : ""}">${l}</button>`).join("");
  const head = `<div class="thead"><div class="tpanes">${panes}</div>${pane === "chart" ? `<span class="tname">${esc(g.label)}<small>rent per hour, Ornn daily print</small></span><span class="tpx">${usd(g.last)}</span><div class="seg trng">${rng}</div>` : ""}</div>`;
  const body = pane === "intel" ? intelHtml() : pane === "venues" ? venuesHtml() : `<div class="chart" id="chart">${chartSvg()}</div><p class="tread">${esc(readLine(t.gpu))}</p>`;
  return `<section class="tdesk">
    <div class="tmain">
      <div class="tbar"><div class="apills">${pills}</div><div class="spills">${stats}</div></div>
      <div class="tchart tpane-${pane}">${head}<div class="tbody">${body}</div></div>
      ${deskPositions()}
    </div>
    ${ticketHtml()}
  </section>`;
}
function renderTicket() { const el = $("#ticket"); if (el) { el.outerHTML = ticketHtml(); bindTicket(); } }
function bindTicket() {
  const reset = () => { S.t.quote = null; S.t.qerr = null; };
  $$("[data-side]").forEach((b) => b.addEventListener("click", () => { S.t.side = b.dataset.side; reset(); render(); }));
  $$("[data-k]").forEach((b) => b.addEventListener("click", () => { S.t.strike = Number(b.dataset.k); S.t.seriesId = null; reset(); render(); }));
  $$("[data-d]").forEach((b) => b.addEventListener("click", () => { S.t.seriesId = b.dataset.d; reset(); render(); }));
  const input = $("#amt");
  if (input) {
    const update = () => {
      S.t.amount = Math.max(0, Number(input.value) || 0);
      const m = S.markets.find((x) => x.id === S.t.seriesId); if (!m) return;
      const qty = deskQty(m);
      tween($("#win"), qty, usd); $("#qty").textContent = qty; $("#loss").textContent = usd(S.t.amount);
      const go = $("#t-go"); if (go && S.wallet) go.disabled = qty <= 0;
      $$("[data-amt]").forEach((b) => b.classList.toggle("on", Number(b.dataset.amt) === S.t.amount));
    };
    input.addEventListener("input", update);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const go = $("#t-go"); if (go && !go.disabled) go.click(); } });
    $$("[data-amt]").forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.amt; update(); }));
  }
  const go = $("#t-go"); if (go) go.addEventListener("click", () => ensureWallet(deskQuote));
  const cp = $("#t-copy"); if (cp) cp.addEventListener("click", () => { try { navigator.clipboard.writeText(tradeLink()); } catch (_) { /* no clipboard */ } cp.textContent = "Copied"; });
  const sign = $("#t-sign"); if (sign) sign.addEventListener("click", deskSign);
  const back = $("#t-back"); if (back) back.addEventListener("click", () => { S.t.quote = null; renderTicket(); });
}
async function deskQuote() {
  const t = S.t, m = S.markets.find((x) => x.id === t.seriesId);
  if (!m || !S.wallet) return;
  const qty = deskQty(m); if (qty <= 0) return;
  t.quoting = true; t.qerr = null; renderTicket();
  try {
    t.quote = await api("quote", { owner: S.wallet.address, ref: refFor(), legs: [{ series: m.id, side: t.side === "higher" ? "buy" : "sell", qty }] });
    t.quotedAt = Date.now();
  } catch (e) { t.quote = null; t.qerr = e.message; }
  t.quoting = false; renderTicket();
  if (t.qerr && /faucet/i.test(t.qerr)) {
    const st = $("#t-st");
    if (st) { st.innerHTML = `${esc(t.qerr)} <button class="mini" id="fz">Add test USDC</button>`; $("#fz").addEventListener("click", async () => { await faucet(); deskQuote(); }); }
  }
}
async function deskSign() {
  const t = S.t;
  if (!t.quote) return;
  if (Date.now() - t.quotedAt > 40_000) { t.quote = null; return deskQuote(); }
  const b = $("#t-sign"); b.disabled = true; b.textContent = S.wallet.kind === "burner" ? "Signing" : "Approve in your wallet";
  try {
    const r = await signAndSubmit(t.quote);
    const m = S.markets.find((x) => x.id === t.seriesId);
    alertBox("✓", "Placed.", `${esc(gpuLabel(t.gpu))} ${t.side === "higher" ? "above" : "at or below"} $${m.strike.toFixed(2)} on ${day(m.windowEnd)}. It's in your positions.`, r.url);
    t.quote = null;
    await Promise.all([refreshMarkets(), refreshPortfolio(), refreshActivity()]);
    render();
  } catch (e) { t.qerr = e.message || "The wallet declined."; t.quote = null; renderTicket(); }
}
setInterval(() => {
  if (S.view !== "desk" || !S.t.quote) return;
  const left = 40 - Math.round((Date.now() - S.t.quotedAt) / 1000);
  if (left <= 0) { S.t.quote = null; S.t.qerr = "That price expired. Get a fresh one."; renderTicket(); return; }
  const el = $("#qtm"); if (el) el.textContent = `${left}s`;
}, 1000);
function bindDesk() {
  bindChart();
  $$("[data-gpu]").forEach((b) => b.addEventListener("click", () => { S.t.gpu = b.dataset.gpu; S.t.strike = null; S.t.seriesId = null; S.t.quote = null; S.t.qerr = null; render(); }));
  $$("[data-rng]").forEach((b) => b.addEventListener("click", () => { S.t.range = Number(b.dataset.rng); $$("[data-rng]").forEach((x) => x.classList.toggle("on", x === b)); refreshChart(); }));
  $$("[data-tt]").forEach((b) => b.addEventListener("click", () => { S.deskTab = b.dataset.tt; render(); }));
  $$("[data-pane]").forEach((b) => b.addEventListener("click", () => { S.pane = b.dataset.pane; render(); }));
  $$(".tintel tr[data-gpu]").forEach((r) => r.addEventListener("click", () => { S.t.gpu = r.dataset.gpu; S.t.strike = null; S.t.seriesId = null; S.t.quote = null; S.t.qerr = null; S.pane = "chart"; render(); }));
  bindTicket(); bindPortfolio();
}

// ---------- strategies ----------
const stratKey = "hourly.strats";
const stratLoad = () => { try { return JSON.parse(store.get(stratKey) || "[]").map(ST.decode).filter(Boolean); } catch (_) { return []; } };
const stratSave = (a) => store.set(stratKey, JSON.stringify(a.map(ST.encode)));
function stratInit() {
  if (S.st) return;
  S.st = { cur: { ...ST.PRESETS[0].rule, id: ST.PRESETS[0].id, gpu: "H100_SXM" }, saved: stratLoad() };
  const shared = ST.decode(new URLSearchParams(location.search).get("s"));
  if (shared) { S.st.cur = shared; S.view = "strat"; }
}
const stratHist = (c) => ((S.index.find((x) => x.code === c) || {}).history) || [];
function verdictHtml(b) {
  const f = (x) => (x.hit === null ? "no trades" : `${pct(x.hit)} right, ${x.n} trade${x.n === 1 ? "" : "s"}`);
  const v = { held: ["held", "Held on the sealed last 32 days"], failed: ["failed", "Did not hold on the sealed last 32 days"], thin: ["thin", "Too few trades to judge"] }[b.verdict];
  return `<div class="st-sverd ${v[0]}"><b>${v[1]}</b><span>${b.days} daily prints only. Index moves, no premium or fees. Not a forecast.</span></div>
    <div class="st-sgrid"><div><i>First 60 days</i><b>${f(b.train)}</b></div><div><i>Sealed last 32</i><b>${f(b.test)}</b></div><div><i>All days</i><b>${f(b.all)}</b></div><div><i>Always bet this side</i><b>${b.base === null ? "n/a" : pct(b.base) + " right"}</b></div></div>`;
}
function stratCard(r, i) {
  const lab = gpuLabel(r.gpu), b = ST.backtest(stratHist(r.gpu), r), now = ST.firesNow(stratHist(r.gpu), r);
  return `<div class="st-scard ${now ? "fire" : ""}"><p>${esc(ST.ruleText(r, lab))}</p>
    <div class="st-srow"><span class="st-sflag ${b.verdict}">${b.verdict === "held" ? "Held" : b.verdict === "failed" ? "Failed" : "Thin"}</span><span>${now ? "Fires today" : "Not firing today"}</span>
    ${now ? `<button class="mini" data-prep="${i}">Prepare trade</button>` : ""}<button class="mini ghost" data-del="${i}">Remove</button></div></div>`;
}
function stratView() {
  stratInit();
  const c = S.st.cur, lab = gpuLabel(c.gpu), hist = stratHist(c.gpu);
  if (!hist.length) return '<section class="strat"><p class="tempty">Loading the index.</p></section>';
  const b = ST.backtest(hist, c), now = ST.firesNow(hist, c);
  const sel = (k, opts) => `<select data-sf="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(c[k]) === String(v) ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const share = `${location.origin}${location.pathname}?s=${ST.encode(c)}`;
  return `<section class="strat">
    <div class="st-shead"><h2>Strategies</h2><p>Pick a rule. It is tested on the last ${hist.length} daily prints with the final 32 days sealed. When it fires, it prepares the trade and you approve it. Nothing trades on its own.</p></div>
    <div class="st-spre">${ST.PRESETS.map((p) => `<button data-pre="${p.id}" class="${c.id === p.id ? "on" : ""}"><b>${p.name}</b><span>${esc(p.text({ ...p.rule, label: "the price" }))}</span></button>`).join("")}</div>
    <div class="st-sedit"><span>When</span>${sel("gpu", GPU_ORDER.map((g) => [g, gpuLabel(g)]))}<span>${c.trig === "drop" ? "falls" : "rises"}</span>${sel("pct", [2, 3, 5, 8, 10, 15].map((x) => [x, x + "%"]))}<span>in</span>${sel("lb", [3, 7, 14, 21].map((x) => [x, x + " days"]))}<span>then bet ${c.side === "higher" ? "Higher" : "Lower"} for</span>${sel("hold", [3, 7, 10, 14].map((x) => [x, x + " days"]))}</div>
    <p class="st-sread">${esc(ST.ruleText(c, lab))}</p>
    ${verdictHtml(b)}
    <div class="st-sact"><span class="${now ? "fireon" : ""}">${now ? "This rule fires today." : "This rule is not firing today."}</span>
      ${now ? '<button class="btn default" id="s-prep">Prepare trade</button>' : ""}<button class="btn" id="s-save">Watch this rule</button><button class="btn" id="s-copy">Copy link</button><a class="btn" target="_blank" rel="noopener" href="${xShare(`${ST.ruleText(c, lab)}. Tested on ${b.days} Ornn prints: ${b.verdict === "held" ? "held" : b.verdict === "failed" ? "failed" : "too few trades to judge"} on the sealed last 32 days.`).replace(encodeURIComponent(location.origin + location.pathname), encodeURIComponent(share))}">Post it</a></div>
    ${S.st.saved.length ? `<h3>Watching</h3><div class="st-slist">${S.st.saved.map(stratCard).join("")}</div>` : ""}
  </section>`;
}
function stratPrep(r) {
  const t = S.t, ks = levelsFor(r.gpu);
  t.gpu = r.gpu; t.side = r.side; t.strike = null; t.seriesId = null; t.quote = null; t.qerr = null;
  S.view = "desk"; renderMenu(); render();
  alertBox("→", "Trade ready to review.", `${esc(ST.ruleText(r, gpuLabel(r.gpu)))}. Pick the level and size, then get a firm price. You approve it.`);
  void ks;
}
function bindStrat() {
  const c = S.st.cur;
  $$("[data-pre]").forEach((b) => b.addEventListener("click", () => { const p = ST.PRESETS.find((x) => x.id === b.dataset.pre); S.st.cur = { ...p.rule, id: p.id, gpu: c.gpu }; render(); }));
  $$("[data-sf]").forEach((e) => e.addEventListener("change", () => { const k = e.dataset.sf; c[k] = k === "gpu" ? e.value : Number(e.value); render(); }));
  const prep = $("#s-prep"); if (prep) prep.addEventListener("click", () => stratPrep(c));
  $("#s-save").addEventListener("click", () => { if (!S.st.saved.some((x) => ST.encode(x) === ST.encode(c))) S.st.saved.push({ ...c }); stratSave(S.st.saved); render(); });
  $("#s-copy").addEventListener("click", () => { const u = `${location.origin}${location.pathname}?s=${ST.encode(c)}`; try { navigator.clipboard.writeText(u); } catch (_) { /* no clipboard */ } $("#s-copy").textContent = "Copied"; });
  $$("[data-prep]").forEach((b) => b.addEventListener("click", () => stratPrep(S.st.saved[Number(b.dataset.prep)])));
  $$("[data-del]").forEach((b) => b.addEventListener("click", () => { S.st.saved.splice(Number(b.dataset.del), 1); stratSave(S.st.saved); render(); }));
}

// ---------- about ----------
function aboutBox() {
  const st = S.status || {};
  const bt = st.backtest && st.backtest.result ? st.backtest.result.find((r) => r.horizonDays === 7) : null;
  dialog(`<div class="icon"><img class="logo" src="mark.svg" alt=""></div><b>Hourly</b>
    <p>A brokerage desk for AI compute price risk: firm quotes on GPU-hour floors, caps and collars. Every contract is fully backed in USDC and settled by a Switchboard oracle that averages Ornn's daily print. The Solana program checks the oracle's signatures before it pays anyone.</p>
    ${bt ? `<p class="small">Model check, out of sample: ${pct(bt.coverage)} of prints landed inside its 80% range 7 days out. Brier ${bt.brier.toFixed(3)} against ${bt.brierCoin.toFixed(3)} for a coin.</p>` : ""}
    <p class="small mono">program ${esc(st.programId || "")}<br>network ${esc(st.cluster || "")}</p>
    <p class="small">${st.cluster === "mainnet" ? "Not investment advice." : "Test money only. Not investment advice."}</p>
    <div class="actions"><button class="btn default" data-close>OK</button></div>`);
}

// ---------- render ----------
function heroHtml() {
  const gs = GPU_ORDER.map((c) => S.index.find((x) => x.code === c)).filter(Boolean);
  const sug = [["H100_SXM", "higher"], ["H200", "higher"], ["B200", "lower"], ["A100_SXM4", "lower"]]
    .filter(([c]) => S.index.find((x) => x.code === c))
    .map(([c, d]) => `<button class="sug" data-sug="${c}" data-dir="${d}">${esc(gpuLabel(c))}<em>${d === "higher" ? "↑ higher" : "↓ lower"}</em></button>`).join("");
  return `<header class="hero">
    <h1>Markets in the price of <span class="serif">AI chips.</span></h1>
    <p class="sub">Take a view on a daily rental print. Fully backed, settled by oracle. To hedge a month of GPU-hours, use Protect.</p>
  </header>${gs.length ? assetsHtml() : ""}`;
}
let tyTok = 0;
function typeLoop() {
  const el = $("#cq");
  if (!el) return;
  const tok = ++tyTok;
  const qs = GPU_ORDER.map((c) => S.index.find((x) => x.code === c)).filter(Boolean)
    .map((g) => `Will ${g.label} rent for more than $${g.last.toFixed(2)} an hour tomorrow?`);
  if (!qs.length) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = qs[0]; return; }
  let q = 0, i = 0, dir = 1;
  const tick = () => {
    if (tok !== tyTok || !document.body.contains(el)) return;
    const txt = qs[q % qs.length];
    i += dir;
    el.textContent = txt.slice(0, i);
    if (i >= txt.length) { dir = -1; return setTimeout(tick, 2200); }
    if (i <= 0) { dir = 1; q++; return setTimeout(tick, 350); }
    setTimeout(tick, dir > 0 ? 38 : 16);
  };
  tick();
}
function startFrom(gpu, side) {
  S.t = { ...S.t, gpu, step: side ? 2 : 1, side: side || null, strike: null, seriesId: null, quote: null, hl: 0, dir: "back" };
  render();
  const w = $(".window"); if (w) w.scrollIntoView({ behavior: "smooth", block: "start" });
}
function crowdLean(code) {
  const t = ((S.activity && S.activity.trades) || []).filter((x) => x.underlying === code);
  const up = t.filter((x) => x.direction === "higher").reduce((n, x) => n + x.cost, 0), dn = t.filter((x) => x.direction === "lower").reduce((n, x) => n + x.cost, 0);
  return { n: t.length, p: up + dn > 0 ? up / (up + dn) : null };
}
function readLine(code) {
  const g = S.index.find((x) => x.code === code);
  if (!g) return "";
  const c = crowdLean(code);
  const mv = `${g.chg7 >= 0 ? "up" : "down"} ${(Math.abs(g.chg7) * 100).toFixed(1)}% this week at $${g.last.toFixed(2)}`;
  const lean = c.p === null ? "No one has called it yet." : `${pct(c.p >= 0.5 ? c.p : 1 - c.p)} of the money says ${c.p >= 0.5 ? "higher" : "lower"}.`;
  return `${g.label} is ${mv}. ${lean}`;
}
function liveHtml() {
  const a = S.activity, last = a && a.trades[0];
  const rows = GPU_ORDER.filter((c) => S.index.find((x) => x.code === c)).map((c, i) => {
    const l = crowdLean(c), g = S.index.find((x) => x.code === c);
    const hi = l.p === null ? null : l.p >= 0.5;
    return `<button class="crow2 ${S.t.gpu === c ? "on" : ""}" data-pick="${c}"><span class="rank">${i + 1}</span><span class="cav">${char(c)}</span>
      <span class="ct"><b>${esc(g.label)}</b><em>${l.n ? `${l.n} call${l.n > 1 ? "s" : ""}` : "quiet"}</em></span>
      <span class="cl ${hi === null ? "" : hi ? "up" : "dn"}">${l.p === null ? "n/a" : `${pct(hi ? l.p : 1 - l.p)}`}<small>${l.p === null ? "" : hi ? "higher" : "lower"}</small></span></button>`;
  }).join("");
  const lc = last ? `<div class="lastcall"><span class="lk">Latest call</span><p>${esc(last.sentence)}</p><div class="lr"><span class="dir ${last.direction}">${last.direction === "higher" ? "▲ Higher" : "▼ Lower"}</span>${last.door === "predict" && last.open ? `<button class="mini" data-copy="${esc(last.series)}" data-side="${last.direction}">Copy trade</button>` : ""}<a class="mini ghost" href="${xShare(`${last.headline}. Trading AI chip prices on Hourly.`)}" target="_blank" rel="noopener">${XGLYPH}</a></div></div>` : "";
  return `<aside class="live"><div class="lh"><h3>What the crowd thinks</h3><button class="lall" data-view-go="activity">All calls</button></div>
    <div class="lbody">${rows}</div>${lc}</aside>`;
}
let THESIS = null;
function thesisView() {
  if (!THESIS) {
    fetch("thesis.json").then((r) => r.json()).then((j) => { THESIS = j; if (S.view === "thesis") render(); }).catch(() => { THESIS = { title: "Thesis", toc: [], html: "<p>The thesis is not published yet.</p>" }; if (S.view === "thesis") render(); });
    return '<div class="thesis"><p class="muted">Loading.</p></div>';
  }
  return `<div class="thesis"><nav class="toc"><b>Contents</b>${THESIS.toc.map(([id, t], i) => `<a href="#${id}" data-toc="${id}"><i>${String(i + 1).padStart(2, "0")}</i>${esc(t)}</a>`).join("")}</nav>
    <article class="doc"><div class="dkick"><span>Research note</span><span>Hourly · Ornn OCPI · Solana</span></div><h1>${esc(THESIS.title)}</h1><div class="dmeta"><span>Status<b>Draft, test money</b></span><span>Sections<b>${THESIS.toc.length}</b></span><span>Data<b>Ornn OCPI daily</b></span></div>${THESIS.html}</article></div>`;
}
function bindThesis() {
  $$("[data-toc]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); const t = document.getElementById(a.dataset.toc); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }));
}
// ---------- house ----------
// The House is whoever takes the other side of every ticket. All numbers are
// computed here from the live activity feed and markets; nothing is invented.
// Trades are test flow on the current cluster.
function houseBook() {
  const tr = (S.activity && S.activity.trades) || [];
  const dg = tr.filter((x) => x.kind === "digital" && x.side === "buy");
  const open = dg.filter((x) => x.open), done = dg.filter((x) => x.settled).sort((a, b) => new Date(a.at) - new Date(b.at));
  const chips = {};
  const win = (x, P) => ((x.direction === "higher" ? P > x.strike : P <= x.strike) ? 1 : 0);
  open.forEach((x) => {
    const g = S.index.find((i) => i.code === x.underlying); if (!g) return;
    const m = S.markets.find((k) => k.id === x.series);
    const pHigher = m && m.model ? m.model.probItm : null;
    const pWin = pHigher == null ? null : (x.direction === "higher" ? pHigher : 1 - pHigher);
    const c = chips[x.gpu] || (chips[x.gpu] = { gpu: x.gpu, last: g.last, qty: 0, hi: 0, lo: 0, prem: 0, exp: 0, expOk: true, list: [] });
    c.qty += x.qty; c[x.direction === "higher" ? "hi" : "lo"] += x.qty; c.prem += x.cost;
    if (pWin == null) c.expOk = false; else c.exp += x.qty * pWin;
    c.list.push(x);
  });
  const rows = Object.values(chips).sort((a, b) => b.qty - a.qty);
  const tot = rows.reduce((a, c) => ({ qty: a.qty + c.qty, prem: a.prem + c.prem, exp: a.exp + c.exp, ok: a.ok && c.expOk }), { qty: 0, prem: 0, exp: 0, ok: true });
  const shocks = [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2].map((sh) => {
    let pnl = 0;
    rows.forEach((c) => c.list.forEach((x) => { pnl += x.cost - x.qty * win(x, c.last * (1 + sh)); }));
    return { sh, pnl };
  });
  const SH = [-0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2];
  rows.forEach((c) => { c.sh = SH.map((sh) => c.list.reduce((a, x) => a + x.cost - x.qty * win(x, c.last * (1 + sh)), 0)); });
  const ladder = {};
  open.forEach((x) => { const d = x.windowEnd; const e = ladder[d] || (ladder[d] = { d, qty: 0, prem: 0 }); e.qty += x.qty; e.prem += x.cost; });
  const exp = Object.values(ladder).sort((a, b) => a.d.localeCompare(b.d));
  let run = 0;
  const curve = done.map((x) => { run += -x.pnl; return { at: x.at, v: run }; });
  const buyersWon = done.filter((x) => x.pnl > 0).length;
  const nowS = Date.now() / 1000;
  const exps = open.map((x) => { const m = S.markets.find((k) => k.id === x.series); return m && m.expiry > nowS ? m.expiry : null; }).filter(Boolean);
  return { rows, tot, shocks, SH, exp, curve, done, buyersWon, openN: open.length, nextExp: exps.length ? Math.min(...exps) : null, win };
}
const sgn = (n) => (n >= 0 ? "+" : "-") + usd(Math.abs(n));
function shockSvg(sh) {
  const W = 560, H = 190, pad = 26, mx = Math.max(1, ...sh.map((d) => Math.abs(d.pnl))), bw = (W - pad * 2) / sh.length, mid = H / 2 - 6;
  const bars = sh.map((d, i) => {
    const h = (Math.abs(d.pnl) / mx) * (mid - 20), x = pad + i * bw + 6, y = d.pnl >= 0 ? mid - h : mid;
    return `<rect x="${x}" y="${y}" width="${bw - 12}" height="${Math.max(1, h)}" rx="2" fill="${d.pnl >= 0 ? "var(--dk-up)" : "var(--dk-dn)"}"/><text x="${x + (bw - 12) / 2}" y="${d.pnl >= 0 ? y - 5 : y + h + 12}" text-anchor="middle" class="hs-v">${sgn(d.pnl).replace(".00", "")}</text><text x="${x + (bw - 12) / 2}" y="${H - 4}" text-anchor="middle" class="hs-x${d.sh === 0 ? " now" : ""}">${d.sh > 0 ? "+" : ""}${Math.round(d.sh * 100)}%</text>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="hs-svg"><line x1="${pad}" x2="${W - pad}" y1="${mid}" y2="${mid}" stroke="var(--dk-bd)"/>${bars}</svg>`;
}
function curveSvg(c) {
  if (c.length < 2) return '<p class="hs-n">Not enough settled trades to draw a record.</p>';
  const W = 560, H = 150, v = c.map((d) => d.v), lo = Math.min(0, ...v), hi = Math.max(0, ...v), r = hi - lo || 1;
  const X = (i) => 8 + (i / (c.length - 1)) * (W - 16), Y = (y) => 10 + (1 - (y - lo) / r) * (H - 24);
  const pts = c.map((d, i) => `${X(i).toFixed(1)},${Y(d.v).toFixed(1)}`).join(" L");
  return `<svg viewBox="0 0 ${W} ${H}" class="hs-svg"><line x1="8" x2="${W - 8}" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--dk-bd)" stroke-dasharray="3 3"/><path d="M${pts}" fill="none" stroke="#151515" stroke-width="1.8" stroke-linejoin="round"/><circle cx="${X(c.length - 1)}" cy="${Y(v[v.length - 1])}" r="3.4" fill="#ff5a1f"/></svg>`;
}
function heatHtml(b) {
  if (!b.rows.length) return '<p class="hs-n">No open tickets.</p>';
  const mx = Math.max(1, ...b.rows.flatMap((c) => c.sh.map(Math.abs)));
  const head = b.SH.map((x) => `<th class="${x === 0 ? "now" : ""}">${x > 0 ? "+" : ""}${Math.round(x * 100)}%</th>`).join("");
  const rows = b.rows.map((c) => `<tr><th class="hm-c">${esc(c.gpu)}</th>${c.sh.map((v) => `<td style="background:${v >= 0 ? `rgba(45,95,58,${(0.1 + 0.55 * Math.abs(v) / mx).toFixed(2)})` : `rgba(139,32,32,${(0.1 + 0.55 * Math.abs(v) / mx).toFixed(2)})`}">${sgn(v).replace(".00", "")}</td>`).join("")}</tr>`).join("");
  return `<table class="hs-hm"><tr><th></th>${head}</tr>${rows}</table>`;
}
// The ruler is the Hourly mark: 60 ticks, one per minute.
const ruler = (n = 60) => `<div class="hs-rule">${Array.from({ length: n }, (_, i) => `<i class="${i % 5 === 0 ? "m" : ""}"></i>`).join("")}</div>`;
function dialSvg(b) {
  const R = 78, C = 100, left = b.nextExp ? Math.max(0, b.nextExp - Date.now() / 1000) : 0, f = b.nextExp ? 1 - Math.min(1, left / 86400) : 0;
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2 - Math.PI / 2, big = i % 5 === 0, r1 = R - (big ? 12 : 7), on = i / 60 < f;
    return `<line x1="${(C + Math.cos(a) * r1).toFixed(1)}" y1="${(C + Math.sin(a) * r1).toFixed(1)}" x2="${(C + Math.cos(a) * R).toFixed(1)}" y2="${(C + Math.sin(a) * R).toFixed(1)}" stroke="${on ? "#ff5a1f" : "#4a4a46"}" stroke-width="${big ? 2.2 : 1.2}" stroke-linecap="round"/>`;
  }).join("");
  const t = b.nextExp ? countdown(b.nextExp) : "none";
  return `<svg viewBox="0 0 200 200" class="hs-dial">${ticks}<text x="100" y="92" text-anchor="middle" class="d-l">NEXT EXPIRY</text><text x="100" y="116" text-anchor="middle" class="d-v">${esc(t)}</text><text x="100" y="134" text-anchor="middle" class="d-l">${b.openN} open</text></svg>`;
}
function payoffSvg(c, b) {
  const W = 780, H = 310, L = 50, Rr = 18, T = 22, B = 40;
  const ks = c.list.map((x) => x.strike), last = c.last;
  const lo = Math.min(last * 0.75, ...ks) * 0.98, hi = Math.max(last * 1.25, ...ks) * 1.02;
  const N = 260, pts = Array.from({ length: N + 1 }, (_, i) => { const P = lo + ((hi - lo) * i) / N; return [P, c.list.reduce((a, x) => a + x.cost - x.qty * b.win(x, P), 0)]; });
  const mx = Math.max(1, ...pts.map((q) => Math.abs(q[1]))) * 1.2;
  const X = (P) => L + ((P - lo) / (hi - lo)) * (W - L - Rr), Y = (v) => T + (1 - (v + mx) / (2 * mx)) * (H - T - B), y0 = Y(0);
  const line = pts.map((q, i) => `${i ? "L" : "M"}${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join(" ");
  const area = `${line} L${X(hi)},${y0} L${X(lo)},${y0} Z`;
  const grid = [-1, -0.5, 0, 0.5, 1].map((k) => `<line x1="${L}" x2="${W - Rr}" y1="${Y(k * mx * 0.83)}" y2="${Y(k * mx * 0.83)}" stroke="${k === 0 ? "#151515" : "#e6e3dc"}" stroke-width="${k === 0 ? 1.2 : 1}"/><text x="${L - 8}" y="${Y(k * mx * 0.83) + 4}" text-anchor="end" class="hs-ax">${k === 0 ? "$0" : sgn(k * mx * 0.83).replace(".00", "")}</text>`).join("");
  const xs = [0.8, 0.9, 1, 1.1, 1.2].map((k) => `<text x="${X(last * k)}" y="${H - 20}" text-anchor="middle" class="hs-ax">${usd(last * k)}</text>`).join("");
  const strikes = [...new Set(ks)].map((k) => `<path d="M${X(k)},${H - 36} l-5,9 h10 z" fill="#151515"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="hs-svg"><defs><clipPath id="cu"><rect x="0" y="0" width="${W}" height="${y0}"/></clipPath><clipPath id="cd"><rect x="0" y="${y0}" width="${W}" height="${H}"/></clipPath></defs>
    ${grid}<path d="${area}" fill="rgba(45,95,58,.28)" clip-path="url(#cu)"/><path d="${area}" fill="rgba(139,32,32,.26)" clip-path="url(#cd)"/>
    <path d="${line}" fill="none" stroke="#151515" stroke-width="2.2" stroke-linejoin="round"/>
    ${xs}${strikes}
    <line x1="${X(last)}" x2="${X(last)}" y1="${T - 6}" y2="${H - B + 4}" stroke="#ff5a1f" stroke-width="1.6" stroke-dasharray="4 4"/>
    <rect x="${X(last) - 34}" y="${T - 20}" width="68" height="18" rx="4" fill="#ff5a1f"/><text x="${X(last)}" y="${T - 7}" text-anchor="middle" class="hs-tag">NOW ${usd(last)}</text></svg>`;
}
function expiryStrip(b) {
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.now() + i * 864e5).toISOString().slice(0, 10); return b.exp.find((e) => e.d === d) || { d, qty: 0, prem: 0 }; });
  const mx = Math.max(1, ...days.map((e) => e.qty));
  return `<div class="hs-strip">${days.map((e) => `<div class="hs-col"><b>${e.qty ? usd(e.qty, 0) : ""}</b><div class="hs-tower"><i class="p" style="height:${(e.prem / mx) * 100}%"></i><i class="r" style="height:${(Math.max(0, e.qty - e.prem) / mx) * 100}%"></i></div><span>${esc(day(e.d).slice(0, 7))}</span></div>`).join("")}</div><div class="hs-key"><i class="p"></i>premium kept <i class="r"></i>at risk</div>`;
}
function recordSvg(b) {
  const c = b.curve; if (c.length < 2) return '<p class="hs-n">Too few settled tickets.</p>';
  const W = 560, H = 170, v = c.map((d) => d.v), lo = Math.min(0, ...v), hi = Math.max(0, ...v), r = hi - lo || 1;
  const X = (i) => 10 + (i / (c.length - 1)) * (W - 20), Y = (y) => 12 + (1 - (y - lo) / r) * (H - 28);
  const path = c.map((d, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(d.v).toFixed(1)}`).join(" ");
  const dots = c.map((d, i) => { const prev = i ? c[i - 1].v : 0, up = d.v - prev >= 0; return `<circle cx="${X(i).toFixed(1)}" cy="${Y(d.v).toFixed(1)}" r="4" fill="${up ? "var(--dk-up)" : "var(--dk-dn)"}" stroke="#fff" stroke-width="1.5"/>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" class="hs-svg"><line x1="10" x2="${W - 10}" y1="${Y(0)}" y2="${Y(0)}" stroke="#151515" stroke-width="1"/><path d="${path} L${X(c.length - 1)},${Y(0)} L${X(0)},${Y(0)} Z" fill="rgba(21,21,21,.06)"/><path d="${path}" fill="none" stroke="#151515" stroke-width="2" stroke-linejoin="round"/>${dots}</svg>`;
}
function donutSvg(qs) {
  const C = 2 * Math.PI * 42; let off = 0;
  const arcs = qs.filter((q) => q.share > 0).map((q, i) => { const len = q.share * C, el = `<circle cx="60" cy="60" r="42" fill="none" stroke="${i ? "#ff5a1f" : "#151515"}" stroke-width="14" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"/>`; off += len; return el; }).join("");
  const top = qs[0];
  return `<svg viewBox="0 0 120 120" class="hs-donut"><circle cx="60" cy="60" r="42" fill="none" stroke="#eceae4" stroke-width="14"/>${arcs}<text x="60" y="58" text-anchor="middle" class="dn-v">${top ? pct(top.share) : "0%"}</text><text x="60" y="74" text-anchor="middle" class="dn-l">${top ? esc(top.name.replace("Venue ", "").toLowerCase()) : ""}</text></svg>`;
}
const rvol = (h) => { const r = h.slice(1).map((d, i) => Math.log(d[1] / h[i][1])), m = r.reduce((a, x) => a + x, 0) / (r.length || 1); return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, r.length - 1)) * Math.sqrt(365); };
const hsSpark = (h, up) => { const v = h.map((d) => d[1]), lo = Math.min(...v), hi = Math.max(...v), r = hi - lo || 1; return `<svg viewBox="0 0 100 28" class="hs-sp2"><path d="${v.map((y, i) => `${i ? "L" : "M"}${((i / (v.length - 1)) * 100).toFixed(1)},${(26 - ((y - lo) / r) * 24).toFixed(1)}`).join(" ")}" fill="none" stroke="${up ? "var(--dk-up)" : "var(--dk-dn)"}" stroke-width="1.5"/></svg>`; };
function chipBoard(b) {
  return `<div class="hs-board">${S.index.map((g) => {
    const c = b.rows.find((r) => r.gpu === g.label), h = g.history.slice(-30), on = g.label === S.hchip, ch = (n) => `<span class="${n >= 0 ? "up" : "dn"}">${n >= 0 ? "+" : ""}${(n * 100).toFixed(1)}%</span>`;
    return `<button class="hs-chipc ${on ? "on" : ""}" data-hc="${esc(g.label)}"><div class="t"><b>${esc(g.label)}</b><i>${usd(g.last)}<small>/hr</small></i></div>${hsSpark(h, g.chg30 >= 0)}<div class="m"><span>7d ${ch(g.chg7)}</span><span>30d ${ch(g.chg30)}</span><span>vol ${(rvol(g.history.slice(-30)) * 100).toFixed(0)}%</span></div><div class="x">${c ? `${c.qty} contracts open · House ${c.lo - c.hi >= 0 ? "long" : "short"} rent` : "no open tickets"}</div></button>`;
  }).join("")}</div>`;
}
function rentSvg(g, list) {
  const h = g.history.slice(-60), W = 780, H = 260, L = 12, R = 56, T = 14, B = 24, v = h.map((d) => d[1]), ks = list.map((x) => x.strike);
  const lo = Math.min(...v, ...ks) * 0.985, hi = Math.max(...v, ...ks) * 1.015;
  const X = (i) => L + (i / (h.length - 1)) * (W - L - R), Y = (y) => T + (1 - (y - lo) / (hi - lo)) * (H - T - B);
  const line = h.map((d, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(d[1]).toFixed(1)}`).join(" ");
  const grid = [0, 1, 2, 3, 4].map((i) => { const y = lo + ((hi - lo) * i) / 4; return `<line x1="${L}" x2="${W - R}" y1="${Y(y)}" y2="${Y(y)}" stroke="#ecebe6"/><text x="${W - R + 8}" y="${Y(y) + 3}" class="hs-ax">${usd(y)}</text>`; }).join("");
  const agg = {}; list.forEach((x) => { const k = `${x.strike}|${x.direction}`; (agg[k] = agg[k] || { s: x.strike, d: x.direction, q: 0 }).q += x.qty; });
  const kl = Object.values(agg).map((k) => `<line x1="${L}" x2="${W - R}" y1="${Y(k.s)}" y2="${Y(k.s)}" stroke="#ff5a1f" stroke-dasharray="4 4"/><rect x="${W - R + 2}" y="${Y(k.s) - 9}" width="52" height="18" rx="4" fill="#ff5a1f"/><text x="${W - R + 28}" y="${Y(k.s) + 4}" text-anchor="middle" class="hs-tag">${usd(k.s)}</text><rect x="${L + 4}" y="${Y(k.s) + 6}" width="${String(k.q + k.d).length * 7 + 56}" height="18" rx="4" fill="#fff"/><text x="${L + 10}" y="${Y(k.s) + 19}" class="hs-ax">${k.q} ${k.d} sold</text>`).join("");
  const lp = [X(h.length - 1), Y(v[v.length - 1])];
  return `<svg viewBox="0 0 ${W} ${H}" class="hs-svg">${grid}${kl}<path d="${line}" fill="none" stroke="#151515" stroke-width="1.6" stroke-linejoin="round"/><circle cx="${lp[0]}" cy="${lp[1]}" r="4" fill="#151515"/><text x="${L}" y="${H - 6}" class="hs-ax">${h[0][0].slice(5)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="hs-ax">${h[h.length - 1][0].slice(5)}</text></svg>`;
}
function edgeTable(list) {
  if (!list.length) return '<p class="hs-n">No open tickets on this chip.</p>';
  const grp = {}; list.forEach((x) => { const k = `${x.series}|${x.price}`; if (grp[k]) grp[k].qty += x.qty; else grp[k] = { ...x }; });
  const rows = Object.values(grp).map((x) => {
    const m = S.markets.find((k) => k.id === x.series), pH = m && m.model ? m.model.probItm : null, pW = pH == null ? null : x.direction === "higher" ? pH : 1 - pH, e = pW == null ? null : x.price - pW;
    return `<tr><td>${x.direction === "higher" ? "Above" : "Below"} ${usd(x.strike)}</td><td>${esc(day(x.windowEnd))}</td><td>${x.qty}</td><td>${Math.round(x.price * 100)}¢</td><td>${pW == null ? "n/a" : Math.round(pW * 100) + "¢"}</td><td class="${e == null ? "" : e >= 0 ? "up" : "dn"}">${e == null ? "n/a" : (e >= 0 ? "+" : "") + Math.round(e * 100) + "¢"}</td></tr>`;
  }).join("");
  return `<table class="hs-tb"><tr><th>Ticket sold</th><th>Expires</th><th>Qty</th><th>Buyer paid</th><th>Model fair</th><th>House edge</th></tr>${rows}</table><p class="hs-n">Edge = price the buyer paid minus the model chance they win, per $1. Positive means the House was paid more than fair.</p>`;
}
function houseView() {
  const b = houseBook();
  if (!S.hchip || !S.index.find((g) => g.label === S.hchip)) S.hchip = (b.rows[0] && b.rows[0].gpu) || (S.index[0] && S.index[0].label);
  const g = S.index.find((x) => x.label === S.hchip), chip = b.rows.find((c) => c.gpu === S.hchip), list = chip ? chip.list : [];
  const live = S.vaults.find((v) => v.phase === "trading");
  const next = S.vaults.filter((v) => v.phase === "deposits").sort((a, c) => a.epoch - c.epoch)[0];
  const v = live && live.deposits ? live : next || live;
  const qs = (S.activity && S.activity.quoters) || [];
  const expPnl = b.tot.ok && b.tot.qty ? b.tot.prem - b.tot.exp : null;
  const worst = b.shocks.reduce((a, d) => (d.pnl < a.pnl ? d : a), b.shocks[0] || { pnl: 0 });
  const net = b.rows.reduce((a, c) => a + c.lo - c.hi, 0);
  const kp = (k, val, cls) => `<div class="hs-k"><i>${k}</i><b class="${cls || ""}">${val}</b></div>`;
  const tot = chip ? chip.hi + chip.lo : 0;
  const split = chip ? `<div class="hs-split"><span>Labs hedging up <b>${chip.hi}</b></span><div class="hs-sp"><i style="width:${tot ? (chip.hi / tot) * 100 : 50}%"></i></div><span><b>${chip.lo}</b> Owners hedging down</span></div>` : "";
  const dep = next ? `<div class="hs-dep"><div class="hs-dr"><span>$</span><input id="hdep" inputmode="decimal" value="1000"><button id="hdep-go">Underwrite</button></div><small id="hd-st">${esc(weekLabel(next.depositEnd, next.epochEnd))} · closes in ${countdown(next.depositEnd)}</small></div>` : "";
  const fills = qs.map((q) => `<div class="hs-fl"><i style="background:${q.via === "vault" ? "#ff5a1f" : "#151515"}"></i><span>${esc(q.name)}</span><b>${q.fills}</b></div>`).join("");
  return `<section class="hse">
    <div class="hs-h"><h1>The House</h1><p>The counterparty on every GPU rent ticket. Buyers bet on where the hourly price of renting one AI chip lands (H100, H200, B200, A100, Ornn index). The House sells those tickets and keeps the premium.</p></div>
    ${chipBoard(b)}
    <div class="hs-kpis">${kp("Expected result", expPnl == null ? "n/a" : sgn(expPnl), expPnl != null && expPnl < 0 ? "dn" : "up")}${kp("Worst case", sgn(worst.pnl), worst.pnl < 0 ? "dn" : "up")}${kp("Max it pays", usd(b.tot.qty, 0))}${kp("Premium in", usd(b.tot.prem))}${kp("Net rent exposure", net === 0 ? "flat" : `${Math.abs(net)} ${net > 0 ? "long" : "short"}`)}${kp("Next expiry", b.nextExp ? countdown(b.nextExp) : "none")}</div>
    <div class="hs-card"><div class="hs-ch"><h3>${esc(S.hchip)} rent per hour and the strikes sold</h3><span class="hs-chip">${g ? usd(g.last) : ""} now</span></div>${g ? rentSvg(g, list) : ""}${split}</div>
    <div class="hs-grid">
      <div class="hs-card hs-w2"><div class="hs-ch"><h3>House result at expiry, ${esc(S.hchip)}</h3></div>${chip ? payoffSvg(chip, b) : '<p class="hs-n">No open tickets.</p>'}</div>
      <div class="hs-card"><div class="hs-ch"><h3>Tickets sold, ${esc(S.hchip)}</h3></div>${edgeTable(list)}</div>
      <div class="hs-card"><div class="hs-ch"><h3>If rent moves, every chip</h3></div>${heatHtml(b)}</div>
      <div class="hs-card"><div class="hs-ch"><h3>Risk by expiry day</h3></div>${expiryStrip(b)}</div>
      <div class="hs-card"><div class="hs-ch"><h3>Settled record</h3><span class="hs-chip">${b.done.length - b.buyersWon} won · ${b.buyersWon} lost</span></div>${recordSvg(b)}</div>
      <div class="hs-card hs-row"><div><div class="hs-ch"><h3>Who fills</h3></div>${donutSvg(qs)}</div><div class="hs-fls">${fills}</div></div>
      <div class="hs-card"><div class="hs-ch"><h3>Weekly vault</h3><span class="hs-chip">${v ? (v.phase === "trading" ? "trading" : "open") : ""}</span></div>${v ? `<div class="hs-vl"><b>${usd(v.cash, 0)}</b><span>held · ${usd(v.venueSeed, 0)} ours · ${Math.round(v.capBps / 100)}% cap per market</span></div>` : ""}${dep}</div>
    </div>
    <p class="hs-foot">Digital tickets only. Test flow on ${esc((S.status && S.status.cluster) || "test")}. Hedger split is read from ticket direction, not the wallet. Too few settled tickets to call an edge.</p>
  </section>`;
}
function bindHouse() {
  $$("[data-hc]").forEach((x) => x.addEventListener("click", () => { S.hchip = x.dataset.hc; render(); }));
  const hd = $("#hdep-go");
  if (!hd) return;
  hd.addEventListener("click", () => ensureWallet(async () => {
    const nx = S.vaults.filter((v) => v.phase === "deposits").sort((a, b) => a.epoch - b.epoch)[0], st = $("#hd-st");
    if (!nx) return;
    try {
      st.textContent = "Approve the deposit in your wallet.";
      const r = await signAndSubmit(await api("vault", { type: "deposit", epoch: nx.epoch, owner: S.wallet.address, amount: Number($("#hdep").value) }));
      alertBox("✓", "Deposited.", "Your share of the vault is in your portfolio.", r.url);
      await Promise.all([refreshMarkets(), refreshPortfolio()]); render();
    } catch (e) {
      st.innerHTML = esc(e.message);
      if (/faucet/i.test(e.message)) { st.innerHTML += ' <button class="mini" id="fz">Add test USDC</button>'; $("#fz").addEventListener("click", faucet); }
    }
  }));
}

// ---------- home + docs ----------
const NARRATIVE = "Lock the price of compute.";
function hmCap() {
  const m = (S.markets || []).filter((x) => x.door === "hedge" && x.kind === "call" && x.status === "open" && x.model && x.units)
    .sort((a, b) => (a.windowStart < b.windowStart ? -1 : a.windowStart > b.windowStart ? 1 : (a.underlying === "H100_SXM" ? -1 : b.underlying === "H100_SXM" ? 1 : 0)))[0];
  if (!m) return "";
  const g = (S.index || []).find((x) => x.code === m.underlying), name = g ? g.label : m.underlying;
  const mo = new Date(m.windowStart + "T00:00:00Z").toLocaleString("en-US", { month: "long", timeZone: "UTC" });
  const per = m.model.ask * 1.01, ceil = m.strike + per / m.units, usd = (n, d = 2) => "$" + n.toFixed(d);
  return `<div class="hm-x">
    <p class="hm-xk">A real quote, live from the desk</p>
    <p class="hm-xl">A team renting 1 ${esc(name)} all of ${mo} pays at most <b>${usd(ceil)}</b> per GPU-hour. It pays <b>${usd(per)}</b> once. If the monthly average rent rises above <b>${usd(m.strike)}</b>, the gap is paid back, up to <b>${usd(m.cap)}</b> an hour.</p>
    <p class="hm-xf">Who takes the other side: the weekly vault, else Hourly's own desk. Why not a perp: no margin, no liquidation. The full payout is in escrow before you pay and your loss is capped at the price paid.</p>
  </div>`;
}
function hmView() {
  const chips = S.index.map((g) => `<button class="hm-chip" data-go="desk" data-gpu="${g.code}"><b>${esc(g.label)}</b><span>$${g.last.toFixed(2)}<i>/hr</i></span></button>`).join("");
  return `<section class="hm">
    <p class="hm-k">Price protection for AI chip rent</p>
    <h1>${NARRATIVE}</h1>
    <p class="hm-s">Hourly shows what an AI chip costs to rent, by the hour, and lets you fix next week's price. Fully backed, settled on Solana.</p>
    <div class="hm-a"><button class="hm-b on" data-go="desk">Trade</button><a class="hm-b" href="freeze">Cap your GPU bill</a><button class="hm-b" data-go="docs">Docs</button></div>
    <div class="hm-r">${chips}</div>
    ${hmCap()}
  </section>`;
}
function bindHm() {
  $$("[data-go]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.gpu) { S.t.gpu = b.dataset.gpu; S.t.strike = null; S.t.seriesId = null; S.t.quote = null; }
    S.view = b.dataset.go; renderMenu(); render(); window.scrollTo(0, 0);
  }));
}
function docsView() {
  const fee = S.status && S.status.feeBps != null ? `${(S.status.feeBps / 100).toFixed(1)}% of premium` : "a small share of premium";
  const live = S.status && S.status.cluster === "mainnet-beta" ? "real USDC" : `test money on ${esc((S.status && S.status.cluster) || "a test cluster")}`;
  return `<article class="dc">
    <h1>Docs</h1>
    <p class="dc-l">${NARRATIVE} Renting an AI chip has a price per hour. It moves. Hourly lets you bet on it or hedge it.</p>
    <h2>How a ticket works</h2>
    <ol><li>Pick a chip (H100, H200, B200, A100) and a rent level.</li><li>Choose <b>higher</b> or <b>lower</b> than that level on the settle date.</li><li>Get a firm price. You approve it in your wallet.</li><li>An oracle averages the Ornn index at expiry. The program pays the winner from escrow.</li></ol>
    <h2>Cap your GPU bill</h2>
    <p>If you rent GPUs, <a href="freeze">Cap</a> shows the most you would pay per GPU-hour next month. Say how many GPUs you rent and for how many hours a day. You pay once. If the monthly average rent rises above the cap price, you are paid the gap, up to a limit. If it stays below, you lose only what you paid. The full payout sits in escrow before you pay.</p>
    <h2>The House</h2>
    <p>The House is the counterparty on every ticket. Anyone can underwrite it through the weekly vault and earn the premium. The House page shows its risk and edge per chip.</p>
    <h2>For agents</h2>
    <p>Read quotes, then hand the user a link. No agent can move funds.</p>
    <pre>GET /hourly/api/agent/brief
GET /hourly/api/agent/prepare?chip=H100_SXM&amp;side=higher&amp;strike=2.65&amp;date=2026-10-11&amp;amount=10
/hourly/llms.txt</pre>
    <h2>Fees and limits</h2>
    <ul><li>Fee: ${fee}.</li><li>Money in use: ${live}.</li><li>Every ticket is fully collateralised in escrow.</li><li>Cap trades are limited to 50 GPUs each.</li><li>Not audited. Ornn needs a settlement licence before real money.</li></ul>
  </article>`;
}

function render() {
  if (!["home", "desk", "house", "docs", "hedge"].includes(S.view)) S.view = "desk";
  const views = { home: hmView, docs: docsView, desk: deskView, house: houseView, strat: stratView, hedge: hedgeView, activity: activityView, earn: earnView };
  CHS.W = 560; CHS.H = 300;
  $("#desk").innerHTML = views[S.view]();
  document.body.classList.remove("fit", "onhome", "onnote");
  document.body.classList.add("dk");
  document.body.classList.toggle("onhm", S.view === "home" || S.view === "docs");
  document.body.classList.toggle("ondesk", S.view === "desk" || S.view === "strat" || S.view === "house");
  document.body.classList.toggle("onterm", S.view === "desk");
  ({ home: bindHm, docs: () => {}, desk: bindDesk, house: bindHouse, strat: bindStrat, hedge: bindHedge, activity: bindActivity, earn: bindEarn })[S.view]();
  tickClocks();
}

async function refreshMarkets() {
  try { const [m, v] = await Promise.all([api("markets"), api("vaults").catch(() => [])]); S.markets = m; S.vaults = v; } catch (_) { /* keep last */ }
}
async function refreshPortfolio() { if (!S.wallet) { S.portfolio = null; S.stake = null; return; } try { [S.portfolio, S.stake] = await Promise.all([api(`portfolio?owner=${S.wallet.address}`), api(`stake?owner=${S.wallet.address}`).catch(() => null)]); } catch (_) { /* keep */ } }
async function refreshActivity() { try { S.activity = await api("activity"); } catch (_) { /* keep */ } }

(async function main() {
  const rp = refParam(); if (rp) store.set("hourly.ref", rp);
  // paint from the last visit right away, then refresh everything in parallel
  try {
    const c = JSON.parse(store.get("hourly.boot") || "null");
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
  store.set("hourly.boot", JSON.stringify({ status: S.status, index: S.index, markets: S.markets, vaults: S.vaults, activity: S.activity }));
  (window.requestIdleCallback || setTimeout)(() => registerMetaMask());
  await restoreWallet();
  setInterval(async () => {
    if (document.querySelector(".modal")) return;
    if (S.view === "desk" && (S.t.quote || S.t.quoting || (document.activeElement && document.activeElement.id === "amt"))) return;
    await Promise.all([refreshMarkets(), refreshActivity(), api("index").then((i) => { if (i && i.length) S.index = i; }).catch(() => {})]);
    renderMenu(); render();
  }, 30_000);
})();
