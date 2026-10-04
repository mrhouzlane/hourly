// Hourly venue server: API + static app. Runs behind Caddy at /hourly.
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const { Worker } = require("worker_threads");
const venue = require("./engine/venue");
const chain = require("./engine/chain");
const ornn = require("./engine/ornn");
const model = require("./engine/model");
const market = require("./engine/market");
const keeper = require("./engine/keeper");

const PORT = Number(process.env.PORT || 7988);
const PUBLIC = path.join(__dirname, "public");
const FAUCET_USD = 10_000;
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- rate limits ----------
const buckets = new Map();
function allow(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key) || { n: 0, reset: now + windowMs };
  if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
  b.n++;
  buckets.set(key, b);
  return b.n <= max;
}
setInterval(() => { const now = Date.now(); for (const [k, b] of buckets) if (now > b.reset) buckets.delete(k); }, 60_000).unref();

const ipOf = (req) => (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

// ---------- backtest off the main thread ----------
let backtest = { at: null, result: null };
function runBacktest() {
  const w = new Worker(`
    const { parentPort } = require("worker_threads");
    const ornn = require(${JSON.stringify(path.join(__dirname, "engine", "ornn.js"))});
    const model = require(${JSON.stringify(path.join(__dirname, "engine", "model.js"))});
    (async () => {
      const all = {};
      for (const c of Object.keys(ornn.GPUS)) all[c] = (await ornn.get(c)).points;
      parentPort.postMessage(model.backtest(all));
    })().catch((e) => parentPort.postMessage({ error: String(e) }));
  `, { eval: true });
  w.on("message", (m) => { if (!m.error) backtest = { at: new Date().toISOString(), result: m }; else log("backtest error", m.error); });
  w.on("error", (e) => log("backtest worker error", e.message));
}

// ---------- index summary ----------
async function indexSummary() {
  const out = [];
  for (const [code, g] of Object.entries(ornn.GPUS)) {
    const { points } = await ornn.get(code);
    const last = points[points.length - 1];
    const ago = (n) => points[Math.max(0, points.length - 1 - n)];
    let cal = null;
    try { cal = model.calibrate(points); } catch (_) { /* too short */ }
    out.push({
      code, label: g.label, ornnName: g.ornn,
      last: last.v, lastDate: last.date,
      chg7: last.v / ago(7).v - 1, chg30: last.v / ago(30).v - 1, chg90: last.v / points[0].v - 1,
      history: points.map((p) => [p.date, p.v]),
      levelVol: cal ? cal.annualLevelVol : null, halfLifeDays: cal ? cal.halfLifeDays : null,
      source: ornn.urlFor(code),
    });
  }
  return out;
}

// ---------- http plumbing ----------
function send(res, status, body, headers = {}) {
  const data = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": typeof body === "object" && !Buffer.isBuffer(body) ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...headers,
  });
  res.end(data);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(venue.httpError(413, "body too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (_) { reject(venue.httpError(400, "bad JSON")); }
    });
    req.on("error", reject);
  });
}

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json", ".woff2": "font/woff2" };
function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === "/" || p === "") p = "/index.html";
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC)) return send(res, 403, "forbidden");
  fs.readFile(file, (err, data) => {
    if (err) {
      // single page: unknown paths get the app
      if (!path.extname(p)) return serveStatic(req, res, "/index.html");
      return send(res, 404, "not found");
    }
    const ext = path.extname(file);
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": ext === ".html" ? "no-cache" : "public, max-age=300" });
    res.end(data);
  });
}

const routes = {
  "GET /api/health": async () => ({ ok: true, cluster: venue.CLUSTER, time: new Date().toISOString() }),

  "GET /api/status": async () => {
    const cfg = await venue.readConfig();
    return {
      cluster: venue.CLUSTER,
      rpc: venue.CLUSTER === "devnet" ? venue.RPC_URL : "local validator",
      programId: chain.PROGRAM_ID.toBase58(),
      programUrl: venue.explorerAddr(chain.PROGRAM_ID.toBase58()),
      quoteMint: venue.state.quoteMint,
      quoteMintUrl: venue.state.quoteMint ? venue.explorerAddr(venue.state.quoteMint) : null,
      oracleQueue: venue.ORACLE_QUEUE.toBase58(),
      config: cfg ? { admin: cfg.admin.toBase58(), settler: cfg.settler.toBase58(), oracleQueue: cfg.oracleQueue.toBase58() } : null,
      maker: venue.keys.maker.publicKey.toBase58(),
      fallbackDelayHours: 72,
      feeBps: venue.state.feeBps,
      treasury: venue.state.treasury,
      volScale: model.VOL_SCALE,
      backtest,
      settlements: venue.state.settlements.slice(-50).reverse().map((s) => ({ ...s, url: venue.explorer(s.tx) })),
      fills: venue.state.fills.slice(-50).reverse().map((f) => ({ ...f, url: venue.explorer(f.tx) })),
    };
  },

  "GET /api/index": async () => indexSummary(),
  "GET /api/markets": async () => market.markets(),

  "GET /api/portfolio": async (req, url) => market.portfolio(url.searchParams.get("owner")),

  "GET /api/feed": async (req, url) => {
    const id = url.searchParams.get("series");
    const meta = venue.state.series[id];
    if (!meta) throw venue.httpError(404, "unknown market");
    return {
      series: id, feedId: meta.feedId, definition: ornn.oracleFeed(meta.underlying, meta.dates),
      crossbarUrl: `https://crossbar.switchboardlabs.xyz/v2/fetch/${meta.feedId.replace(/^0x/, "")}`,
      rule: "Mean of the Ornn OCPI daily prints stamped on the window dates (4pm New York). Computed by Switchboard oracles; the program checks the oracle signatures and this feed hash.",
    };
  },

  "POST /api/quote": async (req, url, body, ip) => {
    if (!allow(`q:${ip}`, 40, 60_000)) throw venue.httpError(429, "Too many quotes. Wait a minute.");
    return market.quote({ legs: body.legs, seriesId: body.series, side: body.side, qty: body.qty, owner: body.owner });
  },

  "GET /api/vaults": async () => {
    const nowS = Math.floor(Date.now() / 1000);
    const list = await keeper.readVaults();
    return list.map((v) => ({ ...v, phase: market.vaultPhase({ depositEnd: v.depositEnd, epochEnd: v.epochEnd, openSeries: v.openSeries }, nowS) }));
  },

  "POST /api/vault": async (req, url, body, ip) => {
    if (!allow(`v:${ip}`, 20, 60_000)) throw venue.httpError(429, "Too many requests. Wait a minute.");
    return market.vaultAction({ type: body.type, epoch: Number(body.epoch), owner: body.owner, amount: body.amount });
  },

  "POST /api/action": async (req, url, body, ip) => {
    if (!allow(`a:${ip}`, 20, 60_000)) throw venue.httpError(429, "Too many requests. Wait a minute.");
    return market.action({ type: body.type, seriesId: body.series, owner: body.owner, qty: body.qty });
  },

  "POST /api/submit": async (req, url, body, ip) => {
    if (!allow(`s:${ip}`, 30, 60_000)) throw venue.httpError(429, "Too many submissions. Wait a minute.");
    const r = await venue.submitUserTx({ id: body.id, tx: body.tx, signature: body.signature });
    if (r.meta.kind === "fill") {
      for (const l of r.meta.legs || []) venue.state.fills.push({ tx: r.signature, at: new Date().toISOString(), series: l.series, side: l.side, qty: l.qty, price: l.price, title: l.title });
      venue.state.fills = venue.state.fills.slice(-500);
      venue.save();
    }
    log("submitted", r.meta.kind, r.meta.series, r.signature);
    return { signature: r.signature, url: venue.explorer(r.signature), meta: r.meta };
  },

  "POST /api/faucet": async (req, url, body, ip) => {
    let owner;
    try { owner = new (require("@solana/web3.js").PublicKey)(body.owner); } catch (_) { throw venue.httpError(400, "bad wallet address"); }
    if (!allow(`fi:${ip}`, 6, 3_600_000)) throw venue.httpError(429, "Faucet limit reached for this network. Try again in an hour.");
    if (!allow(`fo:${owner.toBase58()}`, 1, 20 * 60_000)) throw venue.httpError(429, "This wallet already claimed recently. Try again in 20 minutes.");
    const sig = await venue.mintQuote(owner, FAUCET_USD);
    log("faucet", owner.toBase58(), sig);
    return { amount: FAUCET_USD, signature: sig, url: venue.explorer(sig) };
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const key = `${req.method} ${url.pathname}`;
  const handler = routes[key];
  if (!handler) {
    if (url.pathname.startsWith("/api/")) return send(res, 404, { error: "not found" });
    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "method not allowed");
    return serveStatic(req, res, url.pathname);
  }
  const ip = ipOf(req);
  try {
    const body = req.method === "POST" ? await readBody(req) : null;
    const out = await handler(req, url, body, ip);
    send(res, 200, out);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) log("error", key, e.stack || e.message);
    send(res, status, { error: status >= 500 ? `Server error: ${String(e.message || e).slice(0, 200)}` : e.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  log(`hourly listening on 127.0.0.1:${PORT} cluster=${venue.CLUSTER} program=${chain.PROGRAM_ID.toBase58()}`);
  runBacktest();
  setInterval(runBacktest, 6 * 3600_000).unref();
  if (process.env.KEEPER !== "off") keeper.start();
});
