// Run settle.js in Chainlink's local Deno sandbox (functions-toolkit simulateScript)
// against the LIVE Ornn API, and compare with app/engine/ornn.js windowMean on
// the same live data. Also prints the source keccak and the feed id the
// adapter would assign, so they can be checked against the contract.
//
// Usage (from evm/functions):
//   PATH=../.tools:$PATH node simulate.mjs [CODE] [START] [END]
//   default: H100_SXM 2026-09-01 2026-09-30
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { simulateScript, decodeResult, ReturnType } from "@chainlink/functions-toolkit";
import { ethers } from "ethers";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const ornn = require(path.join(here, "../../app/engine/ornn.js"));

const [code = "H100_SXM", start = "2026-09-01", end = "2026-09-30"] = process.argv.slice(2);
const gpu = ornn.GPUS[code].ornn;
const dates = ornn.datesBetween(start, end);
const source = readFileSync(path.join(here, "settle.js"), "utf8");

// 1. Chainlink sandbox, live API, Functions service limits from
//    https://docs.chain.link/chainlink-functions/resources/service-limits
const sim = await simulateScript({
  source,
  args: [gpu, ...dates],
  maxOnChainResponseBytes: 256,
  maxExecutionTimeMs: 10_000,
  maxMemoryUsageMb: 128,
  numAllowedQueries: 5,
  maxQueryDurationMs: 9_000,
  maxQueryUrlLength: 2048,
  maxQueryRequestBytes: 30 * 1024,
  maxQueryResponseBytes: 2 * 1024 * 1024,
});
if (sim.errorString) {
  console.log("simulation error:", sim.errorString);
  console.log(sim.capturedTerminalOutput);
  process.exit(1);
}
const simAtoms = decodeResult(sim.responseBytesHexstring, ReturnType.uint256);

// 2. Local reference: app/engine/ornn.js windowMean on a fresh fetch of the
//    same endpoint (points shaped like ornn.js parse(); fetched here rather than
//    through ornn.get so the app's on-disk cache is not rewritten).
const res = await fetch(ornn.urlFor(code), { signal: AbortSignal.timeout(20000) });
if (!res.ok) throw new Error(`ornn HTTP ${res.status}`);
const points = (await res.json()).data
  .filter((p) => typeof p.index_value === "number" && p.index_value > 0 && typeof p.timestamp === "string")
  .map((p) => ({ t: p.timestamp, date: p.timestamp.slice(0, 10), v: p.index_value }));
const w = ornn.windowMean(points, dates);
const localAtoms = BigInt(Math.round(w.mean * 1e6));

// 3. What the adapter commits to on-chain
const sourceHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(source));
const feedId = ethers.utils.keccak256(
  ethers.utils.defaultAbiCoder.encode(["bytes32", "string", "string[]"], [sourceHash, gpu, dates]),
);
const requestBytes = Buffer.byteLength(source) + Buffer.byteLength(JSON.stringify([gpu, ...dates]));

console.log(`window          ${code} (${gpu}) ${start}..${end}, ${dates.length} dates`);
console.log(`fetched         ${new Date().toISOString()} from ${ornn.urlFor(code)}`);
console.log(`local mean      ${w.mean} over ${w.count} prints -> ${localAtoms} atoms (ornn.js windowMean)`);
console.log(`functions sim   ${sim.responseBytesHexstring} -> ${simAtoms} atoms (simulateScript, Deno sandbox)`);
console.log(`match           ${simAtoms === localAtoms}`);
console.log(`sourceHash      ${sourceHash}`);
console.log(`feedId          ${feedId}`);
console.log(`request approx  ${requestBytes} bytes of source+args (limit 30 KB)`);
if (simAtoms !== localAtoms) process.exit(2);
