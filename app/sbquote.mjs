import * as sb from "@switchboard-xyz/on-demand";
import { CrossbarClient } from "@switchboard-xyz/common";
const URL = "https://ornn-backend-api-135941626504.us-central1.run.app/api/gpu/H100%20SXM/index-history";
const cb = new CrossbarClient('https://crossbar.switchboardlabs.xyz', true);
cb.setNetwork?.("devnet");
const feed = { name: "OCPI H100 Oct2-3 mean", minJobResponses: 1, minOracleSamples: 1, maxJobRangePct: 0,
  jobs: [{ tasks: [{ httpTask: { url: URL } }, { jsonParseTask: { path: "$.data[?(@.timestamp == '2026-10-02T20:00:00.000Z' || @.timestamp == '2026-10-03T20:00:00.000Z')].index_value", aggregationMethod: 4 } }] }] };
console.log("devnet PID", sb.ON_DEMAND_DEVNET_PID.toBase58(), "queue", sb.ON_DEMAND_DEVNET_QUEUE.toBase58());
const queue = await sb.getDefaultDevnetQueue("https://api.devnet.solana.com");
console.log("queue loaded", queue.pubkey.toBase58());
try {
  const stored = await cb.storeOracleFeed(feed);
  console.log("stored", JSON.stringify(stored).slice(0, 300));
} catch (e) { console.log("store ERR", String(e).slice(0, 300)); }
try {
  const ix = await queue.fetchQuoteIx(cb, [feed], { numSignatures: 1, variableOverrides: {} });
  console.log("quote ix program", ix.programId.toBase58(), "data bytes", ix.data.length, "keys", ix.keys.length);
} catch (e) { console.log("quote ERR", String(e).slice(0, 500)); }
