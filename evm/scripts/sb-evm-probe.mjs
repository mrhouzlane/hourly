// Probe: can crossbar serve EVM-verifiable updates for the custom Ornn window feed?
// Run from the main app dir's node_modules: NODE_PATH not needed, we import by absolute path.
import { createRequire } from "module";
const APP = process.env.APP_DIR || "/home/mehdi_quantum3labs_com/compute-options/app";
const require = createRequire(APP + "/package.json");
const { CrossbarClient } = require("@switchboard-xyz/common");
const ornn = require(new URL("../../app/engine/ornn.js", import.meta.url).pathname);
const URL_ = "https://crossbar.switchboardlabs.xyz";
const cb = new CrossbarClient(URL_, true);
const feed = ornn.oracleFeed("H100_SXM", ["2026-10-02", "2026-10-03"]);
const out = {};
const step = async (name, fn) => {
  try { const r = await fn(); out[name] = { ok: true, r }; }
  catch (e) { out[name] = { ok: false, err: String(e.message || e), data: e.response?.data }; }
  console.log("==", name, JSON.stringify(out[name], null, 0).slice(0, 1500));
};
let feedId;
await step("storeOracleFeed", async () => { const s = await cb.storeOracleFeed(feed); feedId = s.feedId; return s; });
for (const network of ["testnet", "mainnet"]) {
  await step(`fetchOracleQuote(${network})`, () => cb.fetchOracleQuote([feedId], network));
  await step(`fetchV2Update(evm,${network})`, () => cb.fetchV2Update([feedId], { chain: "evm", network, use_timestamp: true }));
}
for (const chainId of [421614, 84532]) {
  await step(`fetchEVMResults(${chainId})`, () => cb.fetchEVMResults({ chainId, aggregatorIds: [feedId] }));
}
