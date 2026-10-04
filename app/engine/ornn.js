// Ornn Compute Price Index (OCPI): fetch, cache and window math.
// Source: Ornn's public index-history endpoint (no key, trailing 3 months of
// daily prints). Each print is stamped at the 4pm New York settlement time.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE = "https://api.ornnai.com/api/gpu"; // documented public endpoint, no key, 60 req/min
// On-chain underlying code -> Ornn GPU name
const GPUS = {
  H100_SXM: { ornn: "H100 SXM", label: "H100" },
  H200: { ornn: "H200", label: "H200" },
  B200: { ornn: "B200", label: "B200" },
  A100_SXM4: { ornn: "A100 SXM4", label: "A100" },
};
const DATA_DIR = path.join(__dirname, "..", "data");
const REFRESH_MS = 15 * 60 * 1000;
// 4pm New York is 20:00 UTC in summer and 21:00 UTC in winter.
const PRINT_HOURS = ["20", "21"];

const urlFor = (code) => `${BASE}/${encodeURIComponent(GPUS[code].ornn)}/index-history`;
const cache = {}; // code -> { fetchedAt, raw, points: [{t, date, v}] }

function parse(raw) {
  const j = JSON.parse(raw);
  if (!j.success || !Array.isArray(j.data)) throw new Error("ornn: unexpected payload");
  return j.data
    .filter((p) => typeof p.index_value === "number" && p.index_value > 0 && typeof p.timestamp === "string")
    .map((p) => ({ t: p.timestamp, date: p.timestamp.slice(0, 10), v: p.index_value }))
    .sort((a, b) => (a.t < b.t ? -1 : 1));
}

async function fetchCode(code) {
  const res = await fetch(urlFor(code), { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`ornn ${code}: HTTP ${res.status}`);
  const raw = await res.text();
  const points = parse(raw);
  if (!points.length) throw new Error(`ornn ${code}: empty history`);
  cache[code] = { fetchedAt: Date.now(), raw, points };
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, `${code}.json`), raw);
  } catch (_) { /* cache to disk is best effort */ }
  return cache[code];
}

function loadDisk(code) {
  try {
    const raw = fs.readFileSync(path.join(DATA_DIR, `${code}.json`), "utf8");
    cache[code] = { fetchedAt: 0, raw, points: parse(raw) };
  } catch (_) { /* nothing on disk */ }
}

async function refreshAll() {
  const out = {};
  for (const code of Object.keys(GPUS)) {
    try { await fetchCode(code); out[code] = "ok"; }
    catch (e) { if (!cache[code]) loadDisk(code); out[code] = String(e.message || e); }
  }
  return out;
}

async function get(code, { maxAgeMs = REFRESH_MS } = {}) {
  if (!GPUS[code]) throw new Error(`unknown underlying ${code}`);
  const c = cache[code];
  if (c && Date.now() - c.fetchedAt < maxAgeMs) return c;
  try { return await fetchCode(code); }
  catch (e) { if (!cache[code]) loadDisk(code); if (cache[code]) return cache[code]; throw e; }
}

// ---------- settlement window ----------
// A window is a list of calendar dates (YYYY-MM-DD). The settlement price is
// the arithmetic mean of every print whose timestamp falls on those dates at
// one of PRINT_HOURS. The Switchboard job encodes exactly the same rule.
function datesBetween(startDate, endDate) {
  const out = [];
  for (let d = new Date(`${startDate}T00:00:00Z`); d <= new Date(`${endDate}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

const stampsFor = (dates) => dates.flatMap((d) => PRINT_HOURS.map((h) => `${d}T${h}:00:00.000Z`));

function windowMean(points, dates) {
  const want = new Set(stampsFor(dates));
  const hits = points.filter((p) => want.has(p.t));
  if (!hits.length) return { mean: null, count: 0, hits };
  return { mean: hits.reduce((a, p) => a + p.v, 0) / hits.length, count: hits.length, hits };
}

// The Switchboard On-Demand feed whose value is the window mean.
// Its definition is deterministic, so anyone can rebuild it and get the same hash.
function oracleFeed(code, dates) {
  const clauses = stampsFor(dates).map((s) => `@.timestamp == '${s}'`);
  return {
    name: `OCPI ${GPUS[code].ornn} mean ${dates[0]}..${dates[dates.length - 1]}`,
    minJobResponses: 1,
    minOracleSamples: 1,
    maxJobRangePct: 0,
    jobs: [{
      tasks: [
        { httpTask: { url: urlFor(code) } },
        { jsonParseTask: { path: `$.data[?(${clauses.join(" || ")})].index_value`, aggregationMethod: 4 } },
      ],
    }],
  };
}

const sha256 = (s) => crypto.createHash("sha256").update(s).digest();

module.exports = { GPUS, PRINT_HOURS, urlFor, refreshAll, get, datesBetween, stampsFor, windowMean, oracleFeed, sha256 };
