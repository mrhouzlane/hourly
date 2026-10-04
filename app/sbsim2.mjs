import { CrossbarClient } from "@switchboard-xyz/common";
const URL = "https://ornn-backend-api-135941626504.us-central1.run.app/api/gpu/H100%20SXM/index-history";
const cb = new CrossbarClient('https://crossbar.switchboardlabs.xyz', false);
const mk = (name, tasks) => ({ name, minJobResponses: 1, minOracleSamples: 1, maxJobRangePct: 0, jobs: [{ tasks }] });
const day = d => `$.data[?(@.timestamp == '${d}T20:00:00.000Z')].index_value`;
const tests = {
  last7mean: mk("last7 mean", [{ httpTask: { url: URL } }, { jsonParseTask: { path: "$.data[-7:].index_value", aggregationMethod: 4 } }]),
  regexSep: mk("regex sep", [{ httpTask: { url: URL } }, { jsonParseTask: { path: "$.data[?(@.timestamp =~ /^2026-09-.*/)].index_value", aggregationMethod: 4 } }]),
  orDays: mk("or days", [{ httpTask: { url: URL } }, { jsonParseTask: { path: "$.data[?(@.timestamp == '2026-10-02T20:00:00.000Z' || @.timestamp == '2026-10-03T20:00:00.000Z')].index_value", aggregationMethod: 4 } }]),
  addDays: mk("add days", [{ httpTask: { url: URL } }, { jsonParseTask: { path: day("2026-10-02") } },
     { addTask: { job: { tasks: [{ httpTask: { url: URL } }, { jsonParseTask: { path: day("2026-10-03") } }] } } },
     { divideTask: { scalar: 2 } }]),
};
for (const [k, f] of Object.entries(tests)) {
  try { const r = await cb.simulateFeed(f, false); console.log(k, JSON.stringify(r.results)); }
  catch (e) { console.log(k, "ERR", String(e).slice(0, 200)); }
}
