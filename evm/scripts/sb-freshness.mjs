// Read-only: when was ANY feed last updated on a deployed Switchboard EVM contract?
//   node evm/scripts/sb-freshness.mjs <rpc> <switchboard>
import { execFileSync } from "child_process";
const [rpc, sb] = process.argv.slice(2);
const CAST = process.env.CAST || `${process.env.HOME}/.foundry/bin/cast`;
const call = (...a) => execFileSync(CAST, ["call", sb, ...a, "--rpc-url", rpc], { encoding: "utf8" }).trim();
const total = Number(call("getActiveFeedCount()(uint256)").split(" ")[0]);
const ids = [];
for (let off = 0; off < total; off += 50) {
  const out = call("getActiveFeedIds(uint256,uint256)(bytes32[],uint256)", String(off), "50");
  ids.push(...out.split("\n")[0].replace(/[\[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean));
}
let newest = 0, newestId = null;
for (const id of ids) {
  try {
    const ts = Number(call("getLatestValue(bytes32)(int128,uint256,uint64)", id).split("\n")[1].split(" ")[0]);
    if (ts > newest) { newest = ts; newestId = id; }
  } catch (_) { /* skip */ }
}
console.log(JSON.stringify({ rpc, sb, activeFeeds: total, newestUpdate: new Date(newest * 1000).toISOString(), newestId, now: new Date().toISOString() }));
