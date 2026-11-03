// Our own index: reads the Hourly index API (research-grade daily prints) and
// returns points in the same shape as ornn.get. Display only. Markets and the
// oracle feed still settle on Ornn prints (engine/ornn.js) until a signed,
// rights-cleared print exists.
"use strict";
const fs = require("fs");
const path = require("path");

const BASE = process.env.INDEX_API || "http://127.0.0.1:7991";
const API_CODE = { H100_SXM: "H100", H200: "H200", B200: "B200", A100_SXM4: "A100" };
const DISK = path.join(__dirname, "..", "data", "hourlyindex.json");
const REFRESH_MS = 15 * 60 * 1000;
const cache = {}; // code -> { fetchedAt, meta, points: [{t, date, v}] }

function shape(code, j) {
  const prints = (j.prints || []).filter((p) => p.status === "ok" && typeof p.value === "number" && p.value > 0);
  if (!prints.length) throw new Error(`index ${code}: no ok prints`);
  const points = prints.map((p) => ({ t: `${p.day}T20:00:00.000Z`, date: p.day, v: p.value }));
  const last = prints[prints.length - 1];
  const sigs = prints.filter((p) => p.signature).length;
  return {
    fetchedAt: Date.now(), points,
    meta: {
      mode: j.mode, settlementGrade: !!j.settlement_grade, methodVersion: last.method_version,
      providers: last.n_providers, signedPrints: sigs, prints: prints.length,
      inputsSha256: last.inputs_sha256, attribution: j.attribution,
    },
  };
}

function saveDisk() {
  try { fs.writeFileSync(DISK, JSON.stringify(cache)); } catch (_) { /* best effort */ }
}
function loadDisk() {
  try { Object.assign(cache, JSON.parse(fs.readFileSync(DISK, "utf8"))); } catch (_) { /* none */ }
}

async function get(code) {
  const api = API_CODE[code];
  if (!api) throw new Error(`unknown underlying ${code}`);
  const c = cache[code];
  if (c && Date.now() - c.fetchedAt < REFRESH_MS) return c;
  try {
    const res = await fetch(`${BASE}/v1/index/${api}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`index ${code}: HTTP ${res.status}`);
    cache[code] = shape(code, await res.json());
    saveDisk();
    return cache[code];
  } catch (e) {
    if (!cache[code]) loadDisk();
    if (cache[code]) return { ...cache[code], stale: true };
    throw e;
  }
}

module.exports = { get, API_CODE };
