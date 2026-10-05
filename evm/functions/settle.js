// Chainlink Functions source: Hourly settlement price for one series.
//
// args[0]   = Ornn GPU name exactly as Ornn spells it (e.g. "H100 SXM")
// args[1..] = window dates, YYYY-MM-DD, in order
// returns   = uint256, window mean in 6-decimal USDC atoms per GPU-hour
//
// Same rule as app/engine/ornn.js windowMean/stampsFor: the arithmetic mean of
// every print stamped <date>T20:00:00.000Z or <date>T21:00:00.000Z (4pm New
// York in summer and winter) for the window dates. Values are parsed as exact
// decimals and the mean is rounded half up to 1e-6, like HourlyMath.sbValueToAtoms.
//
// Extra guard, not in windowMean: the last window date must already have a
// print, so a request made before the final print fails and can be retried
// instead of settling on a partial window. On a complete window the result is
// identical to windowMean.
//
// This file is hashed on-chain at listing (ChainlinkFunctionsSettlementOracle):
// changing a single byte changes the feed id, so do not reformat it.

const PRINT_HOURS = ["20", "21"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

if (args.length < 2) throw Error("args: gpu, date...");
const gpu = args[0];
const dates = args.slice(1);
for (const d of dates) if (!DATE_RE.test(d)) throw Error("bad date " + d);

const res = await Functions.makeHttpRequest({
  url: "https://api.ornnai.com/api/gpu/" + encodeURIComponent(gpu) + "/index-history",
  timeout: 9000,
});
if (res.error || res.status !== 200) throw Error("ornn http " + res.status);
const body = res.data;
if (!body || body.success !== true || !Array.isArray(body.data)) throw Error("ornn payload");

// exact decimal -> integer with 18 decimals, no floating point
const SCALE = 18;
function toE18(x) {
  if (typeof x !== "number" || !(x > 0) || !isFinite(x)) return null;
  let s = String(x);
  if (/e/i.test(s)) s = x.toFixed(SCALE);
  const [i, f = ""] = s.split(".");
  if (f.length > SCALE) return null;
  return BigInt(i) * 10n ** 18n + BigInt((f + "0".repeat(SCALE)).slice(0, SCALE));
}

const want = new Set();
for (const d of dates) for (const h of PRINT_HOURS) want.add(d + "T" + h + ":00:00.000Z");
const last = dates[dates.length - 1];

let sum = 0n;
let n = 0n;
let lastSeen = false;
const seen = new Set();
for (const p of body.data) {
  if (typeof p.timestamp !== "string" || !want.has(p.timestamp) || seen.has(p.timestamp)) continue;
  const v = toE18(p.index_value);
  if (v === null) continue;
  seen.add(p.timestamp);
  sum += v;
  n += 1n;
  if (p.timestamp.slice(0, 10) === last) lastSeen = true;
}
if (n === 0n) throw Error("no prints in window");
if (!lastSeen) throw Error("window incomplete");

// mean in atoms (1e6), rounded half up: sum / (n * 1e12)
const den = n * 10n ** 12n;
const atoms = (sum + den / 2n) / den;
return Functions.encodeUint256(atoms);
