// Hourly, System 7 edition. One decision per screen; the chart shows your
// level and your date as you pick them. Bundled by esbuild into public/mac.js.
import { getWallets } from "@wallet-standard/app";
import nacl from "tweetnacl";
import bs58 from "bs58";

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
    <button data-view="about" class="brand" title="About Hourly">Hourly</button>
    ${[["trade", "Trade"], ["hedge", "Protect & Earn"]]
      .map(([k, t]) => `<button data-view="${k}" class="${S.view === k || (k === "hedge" && S.view === "earn") ? "on" : ""}">${t}</button>`).join("")}
    <span class="spacer"></span>
    <button id="wallet-btn">${S.wallet ? `${S.wallet.address.slice(0, 4)}…${S.wallet.address.slice(-4)}` : "Connect"}</button>`;
  slidePill($("#menubar"), "menu");
  $$("#menubar [data-view]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.view === "about") return aboutBox();
    S.view = b.dataset.view; renderMenu(); render();
  }));
  $("#wallet-btn").addEventListener("click", () => {
    if (!S.wallet) return walletPicker();
    dialog(`<div class="icon">◆</div><b>${esc(S.wallet.name)}</b><p class="mono">${esc(S.wallet.address)}</p>
      <div class="actions"><button class="btn" id="mt">My trades</button><button class="btn default" id="dc">Disconnect</button></div>`,
    (m, close) => { $("#mt", m).addEventListener("click", () => { close(); S.view = "portfolio"; renderMenu(); render(); }); $("#dc", m).addEventListener("click", async () => { await S.wallet.disconnect(); await setWallet(null); close(); }); });
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
    const sides = [
      { key: "higher", glyph: "▲", t: "Higher", s: `${g} costs more` },
      { key: "lower", glyph: "▼", t: "Lower", s: `${g} costs less` },
    ];
    return `<h2>${g}: higher or lower?</h2>
      <div class="options">${sides.map((o, i) => `<button class="opt ${i === t.hl ? "hl" : ""}" data-opt="${o.key}"><span class="glyph">${o.glyph}</span><span><div class="t">${esc(o.t)}</div><div class="s">${o.s}</div></span><span></span></button>`).join("")}</div>`;
  }
  if (t.step === 2) {
    const ks = levelsFor(t.gpu);
    return `<h2>Higher or lower than what price?</h2>
      <div class="options">${ks.map((k, i) => {
        const m = seriesNear(t.gpu, k);
        const ch = m ? sideChance(m, t.side) : 0;
        return `<button class="opt ${i === t.hl ? "hl" : ""}" data-opt="${k}"><span class="glyph">$</span><span><div class="t">${t.side === "higher" ? "Above" : "At or below"} $${k.toFixed(2)}</div><div class="s">${pct(ch)} chance</div></span><span class="r">${m ? cents(sideUnit(m, t.side)) : ""}<small>per $1</small></span></button>`;
      }).join("")}</div>`;
  }
  if (t.step === 3) {
    const ms = datesFor(t.gpu, t.strike);
    return `<h2>On which day?</h2>
      <div class="options">${ms.map((m, i) => `<button class="opt ${i === t.hl ? "hl" : ""}" data-opt="${m.id}"><span class="glyph">◷</span><span><div class="t">${day(m.windowEnd)}</div><div class="s">${pct(sideChance(m, t.side))} chance</div></span><span class="r">${cents(sideUnit(m, t.side))}<small>per $1</small></span></button>`).join("")}</div>`;
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
const smooth = (pts) => pts.map((p, i) => {
  if (!i) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  const a = pts[i - 2] || pts[i - 1], b = pts[i - 1], c = p, d = pts[i + 1] || c;
  const c1 = [b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6], c2 = [c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6];
  return `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${c[0].toFixed(1)},${c[1].toFixed(1)}`;
}).join(" ");
function chartSvg() {
  const t = S.t;
  const g = S.index.find((x) => x.code === t.gpu);
  if (!g) return "";
  const hist = g.history.slice(-(t.range || 30));
  const m = t.seriesId ? S.markets.find((x) => x.id === t.seriesId) : null;
  const dateM = m || (t.step === 3 && datesFor(t.gpu, t.strike)[t.hl]) || null;
  const W = 560, H = 300, L = 10, R = 64, T = 16, B = 28;
  const t0 = Date.parse(`${hist[0][0]}T00:00:00Z`);
  const lastT = Date.parse(`${hist[hist.length - 1][0]}T00:00:00Z`);
  const endT = dateM ? Date.parse(`${dateM.windowEnd}T00:00:00Z`) : lastT + Math.max(3, hist.length * 0.18) * 86400e3;
  const vals = hist.map((p) => p[1]);
  const lv = t.strike !== null ? t.strike : (t.step === 2 && t.side ? (levelsFor(t.gpu)[t.hl] ?? null) : null);
  if (lv !== null) vals.push(lv);
  if (dateM && dateM.model) vals.push(dateM.model.settleP10, dateM.model.settleP90);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.14 || 0.1; lo -= pad; hi += pad;
  const X = (ms) => L + ((ms - t0) / (endT - t0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const pts = hist.map((p) => [X(Date.parse(`${p[0]}T00:00:00Z`)), Y(p[1])]);
  const line = smooth(pts), lp = pts[pts.length - 1], base = H - B;
  const area = `${line} L${lp[0].toFixed(1)},${base} L${pts[0][0].toFixed(1)},${base} Z`;
  CH = { pts, hist, W, H };
  let zone = "", fan = "", lvl = "", grid = "";
  for (let i = 0; i <= 4; i++) { const v = lo + ((hi - lo) * i) / 4, y = Y(v); grid += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" class="gl"/><text x="${W - R + 8}" y="${y + 3}" class="ax">$${v.toFixed(2)}</text>`; }
  if (lv !== null && t.side) {
    const yl = Y(lv), up = t.side === "higher";
    zone = `<rect class="zone" x="${L}" y="${up ? T : yl}" width="${W - L - R}" height="${Math.max(0, up ? yl - T : base - yl)}" fill="url(#${up ? "zu" : "zd"})"/>`;
    lvl = `<line class="lvl" x1="${L}" x2="${W - R}" y1="${yl}" y2="${yl}"/><rect x="${W - R + 2}" y="${yl - 9}" width="58" height="18" class="lvlbox"/><text x="${W - R + 31}" y="${yl + 4}" text-anchor="middle" class="lvltx">$${lv.toFixed(2)}</text>`;
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
      <linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fa0ff" stop-opacity=".45"/><stop offset="1" stop-color="#6fa0ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="zu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2f6bff" stop-opacity=".02"/><stop offset="1" stop-color="#2f6bff" stop-opacity=".5"/></linearGradient>
      <linearGradient id="zd" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#2f6bff" stop-opacity=".02"/><stop offset="1" stop-color="#2f6bff" stop-opacity=".5"/></linearGradient>
      <linearGradient id="fg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9fc0ff" stop-opacity=".05"/><stop offset="1" stop-color="#9fc0ff" stop-opacity=".4"/></linearGradient>
      <clipPath id="cl"><rect x="0" y="0" width="${W}" height="${H}"/></clipPath>
    </defs>
    ${grid}${zone}
    <path d="${area}" fill="url(#ag)" class="area"/>
    ${fan}${lvl}
    <path d="${line}" class="ln" pathLength="1"/>
    <circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="9" class="halo"/><circle cx="${lp[0].toFixed(1)}" cy="${lp[1].toFixed(1)}" r="4" class="live"/>
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
const XGLYPH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.9 2H22l-7.2 8.2L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.7-8.8L1.5 2h6.8l4.7 6.2L18.9 2z"/></svg>';
const xShare = (text) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(location.origin + location.pathname)}`;
const hueOf = (name) => { let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
function activityView() {
  const a = S.activity;
  if (!a) return windowShell("Activity", '<div class="wbody">Loading.</div>');
  const st = a.stats[S.feedWin];
  const hi = st.higherPct;
  const test = a.cluster !== "devnet" && a.cluster !== "mainnet";
  const xh = S.status && S.status.xHandle;
  // the crowd: which way each chip is leaning, from real fills
  const crowd = GPU_ORDER.map((code) => {
    const t = a.trades.filter((x) => x.underlying === code);
    const up = t.filter((x) => x.direction === "higher").reduce((n, x) => n + x.cost, 0), dn = t.filter((x) => x.direction === "lower").reduce((n, x) => n + x.cost, 0);
    return { code, n: t.length, p: up + dn > 0 ? up / (up + dn) : null };
  });
  const card = (x) => {
    const said = x.sentence.startsWith(x.name) ? x.sentence.slice(x.name.length + 1) : x.sentence;
    const post = `${x.headline}. I'm in for ${usd(x.cost)} on Hourly, trading the price of AI compute.`;
    return `<article class="tcard"><header><span class="av" style="--hu:${hueOf(x.name)}">${esc(initials(x.name))}</span><div><b>${esc(x.name)}</b><span>@${esc(x.name.replace(/\./g, "_"))} · ${ago(x.at)}</span></div>
      <a class="xs" href="${xShare(post)}" target="_blank" rel="noopener" title="Share on X" aria-label="Share on X">${XGLYPH}</a></header>
      <p>${esc(said)}</p>
      <footer><span class="dir ${x.direction}">${x.direction === "higher" ? "▲ higher" : "▼ lower"}</span><span class="amt">${usd(x.cost)}</span>${x.door === "predict" && x.open ? `<button class="btn" data-copy="${esc(x.series)}" data-side="${x.direction}">Copy trade</button>` : ""}</footer></article>`;
  };
  return windowShell("The wall", `
    <div class="crowd">${crowd.map((c) => `<div class="cw"><div class="cwh"><b>${esc(gpuLabel(c.code))}</b><span>${c.n ? (c.p >= .5 ? `${pct(c.p)} higher` : `${pct(1 - c.p)} lower`) : "quiet"}</span></div>
      <div class="cbar ${c.p === null ? "idle" : ""}"><i style="width:${c.p === null ? 0 : Math.round(c.p * 100)}%"></i></div></div>`).join("")}</div>
    <div class="feed">
      <div class="wall">${a.trades.length ? a.trades.slice(0, 12).map(card).join("") : "<p>No calls yet. Be the first.</p>"}
        ${test ? '<p class="small muted">Test chain: includes our own test trades.</p>' : ""}</div>
      <aside>
        <div class="seg">${["1h", "24h", "7d"].map((w) => `<button data-fw="${w}" class="${w === S.feedWin ? "on" : ""}">${w}</button>`).join("")}</div>
        <div class="trio"><div><b>${st.bets}</b><span>calls</span></div><div><b>${usd(st.onTable, 0)}</b><span>on the line</span></div><div><b>${st.traders}</b><span>traders</span></div></div>
        ${hi !== null ? `<div class="meter"><span style="width:${Math.round(hi * 100)}%"></span></div><div class="small row" style="justify-content:space-between"><span>${pct(hi)} higher</span><span>${pct(1 - hi)} lower</span></div>` : ""}
        <h3>Sharp money</h3>
        <div class="list">${a.leaders.length ? a.leaders.slice(0, 5).map((p, i) => `<div><span><i class="rk">${i + 1}</i>${esc(p.name)}</span><span>${p.pnl >= 0 ? "+" : ""}${usd(p.pnl)}</span></div>`).join("") : "<div><span>Nobody yet.</span></div>"}</div>
        <a class="xcta" href="${xShare("My call on AI chip rental prices, on Hourly.")}" target="_blank" rel="noopener">${XGLYPH}<span>Post your call on X</span></a>
        ${xh ? `<a class="xcta ghost" href="https://x.com/${esc(xh)}" target="_blank" rel="noopener">${XGLYPH}<span>Follow @${esc(xh)}</span></a>` : ""}
      </aside>
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
  const gs = GPU_ORDER.map((c) => S.index.find((x) => x.code === c)).filter(Boolean);
  const sug = [["H100_SXM", "higher"], ["H200", "higher"], ["B200", "lower"], ["A100_SXM4", "lower"]]
    .filter(([c]) => S.index.find((x) => x.code === c))
    .map(([c, d]) => `<button class="sug" data-sug="${c}" data-dir="${d}">${esc(gpuLabel(c))}<em>${d === "higher" ? "↑ higher" : "↓ lower"}</em></button>`).join("");
  return `<header class="hero">
    ${mascot("big")}
    <h1>Bet on the price of <span class="serif">AI chips.</span></h1>
    <p class="sub">Will renting an H100 cost more or less tomorrow? Pick a side. Get paid if you're right.</p>
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
function liveHtml() {
  const a = S.activity, rows = a ? a.trades.slice(0, 14) : [];
  const row = (x) => {
    const can = x.door === "predict" && x.open;
    return `<${can ? "button" : "div"} class="lrow" ${can ? `data-copy="${esc(x.series)}" data-side="${x.direction}" title="Copy this trade"` : ""}>
      <span class="av" style="--hu:${hueOf(x.name)}">${esc(initials(x.name))}</span>
      <span class="lt"><b>${esc(x.name)}</b><em>${esc(x.gpu)} <i class="${x.direction}">${x.direction === "higher" ? "▲ higher" : "▼ lower"}</i></em></span>
      <span class="la">${usd(x.cost)}<small>${ago(x.at)}</small></span></${can ? "button" : "div"}>`;
  };
  return `<aside class="live"><div class="lh"><b><i class="ldot"></i>Live calls</b><button class="lall" data-view-go="activity">All</button></div>
    <div class="lbody">${rows.length ? rows.map(row).join("") : '<p class="muted">No calls yet.</p>'}</div>
    <div class="lf"><a class="xcta" href="${xShare("My call on AI chip rental prices, on Hourly.")}" target="_blank" rel="noopener">${XGLYPH}<span>Post your call</span></a></div></aside>`;
}
function render() {
  const sub = () => `<div class="subtabs"><button data-sub="hedge" class="${S.view === "hedge" ? "on" : ""}">Protect</button><button data-sub="earn" class="${S.view === "earn" ? "on" : ""}">Earn</button></div>`;
  const views = { trade: tradeView, chain: chainView, hedge: () => sub() + hedgeView(), earn: () => sub() + earnView(), activity: activityView, portfolio: portfolioView };
  $("#desk").innerHTML = S.view === "trade" ? `<div class="shell"><div class="main">${heroHtml()}${views.trade()}</div>${liveHtml()}</div>` : views[S.view]();
  document.body.classList.toggle("fit", S.view === "trade");
  $$("[data-home]").forEach((b) => b.addEventListener("click", () => { S.view = "trade"; renderMenu(); render(); }));
  ({ trade: bindTrade, chain: bindChain, hedge: bindHedge, earn: bindEarn, activity: bindActivity, portfolio: bindPortfolio })[S.view]();
  slidePill($(".steps"), "steps");
  $$("[data-view-go]").forEach((b) => b.addEventListener("click", () => { S.view = b.dataset.viewGo; renderMenu(); render(); }));
  if (S.view === "trade") bindActivity();
  $$("[data-sub]").forEach((b) => b.addEventListener("click", () => { S.view = b.dataset.sub; renderMenu(); render(); }));
  $$("[data-sug]").forEach((b) => b.addEventListener("click", () => startFrom(b.dataset.sug, b.dataset.dir)));
  const go = $("#go"); if (go) go.addEventListener("click", () => startFrom(S.t.gpu, null));
  $$("[data-asset]").forEach((b) => b.addEventListener("click", () => {
    S.t = { ...S.t, gpu: b.dataset.asset, step: 1, side: null, strike: null, seriesId: null, quote: null, hl: 0, dir: "back" };
    render(); const w = $(".window"); if (w) w.scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  tickClocks();
}

async function refreshMarkets() {
  try { const [m, v] = await Promise.all([api("markets"), api("vaults").catch(() => [])]); S.markets = m; S.vaults = v; } catch (_) { /* keep last */ }
}
async function refreshPortfolio() { if (!S.wallet) { S.portfolio = null; return; } try { S.portfolio = await api(`portfolio?owner=${S.wallet.address}`); } catch (_) { /* keep */ } }
async function refreshActivity() { try { S.activity = await api("activity"); } catch (_) { /* keep */ } }

(async function main() {
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
  if (!document.querySelector(".modal") && !(S.view === "trade" && S.t.step >= 4)) { renderMenu(); render(); }
  store.set("hourly.boot", JSON.stringify({ status: S.status, index: S.index, markets: S.markets, vaults: S.vaults, activity: S.activity }));
  (window.requestIdleCallback || setTimeout)(() => registerMetaMask());
  await restoreWallet();
  setInterval(async () => {
    if (document.querySelector(".modal") || (S.view === "trade" && S.t.step >= 4)) return;
    await Promise.all([refreshMarkets(), refreshActivity()]);
    if (S.view !== "trade" || S.t.step <= 3) { renderMenu(); render(); }
  }, 30_000);
})();
