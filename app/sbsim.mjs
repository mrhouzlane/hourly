import { CrossbarClient } from "@switchboard-xyz/common";
const URL = "https://ornn-backend-api-135941626504.us-central1.run.app/api/gpu/H100%20SXM/index-history";
const cb = new CrossbarClient('https://crossbar.switchboardlabs.xyz', true);
const feeds = {
  latest: { name: "OCPI H100 latest", minJobResponses: 1, minOracleSamples: 1, maxJobRangePct: 0,
    jobs: [{ tasks: [ { httpTask: { url: URL } }, { jsonParseTask: { path: "$.data[-1:].index_value" } } ] }] },
  oneDay: { name: "OCPI H100 2026-10-03", minJobResponses: 1, minOracleSamples: 1, maxJobRangePct: 0,
    jobs: [{ tasks: [ { httpTask: { url: URL } }, { jsonParseTask: { path: "$.data[?(@.timestamp == '2026-10-03T20:00:00.000Z')].index_value" } } ] }] },
  sepMean: { name: "OCPI H100 Sep 2026 mean", minJobResponses: 1, minOracleSamples: 1, maxJobRangePct: 0,
    jobs: [{ tasks: [ { httpTask: { url: URL } }, { jsonParseTask: { path: "$.data[?(@.timestamp >= '2026-09-01' && @.timestamp < '2026-10-01')].index_value", aggregationMethod: 4 } } ] }] },
};
for (const [k, f] of Object.entries(feeds)) {
  try {
    const r = await cb.simulateFeed(f, false);
    console.log(k, JSON.stringify(r).slice(0, 400));
  } catch (e) { console.log(k, "ERR", String(e).slice(0,300), JSON.stringify(e.response?.data ?? e.cause ?? e.details ?? {}).slice(0,600)); }
}
