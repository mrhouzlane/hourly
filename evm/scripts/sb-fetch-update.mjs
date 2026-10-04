// Fetch an EVM-encoded Switchboard update for an Ornn window feed and save it
// as a fixture: evm/test/fixtures/sb-<network>.json
//   node evm/scripts/sb-fetch-update.mjs testnet H100_SXM 2026-10-02,2026-10-03
// Uses @switchboard-xyz/common from app/node_modules (APP_DIR overrides).
import { createRequire } from "module";
import fs from "fs";
const here = new URL(".", import.meta.url).pathname;
const APP = process.env.APP_DIR || here + "../../app";
const require = createRequire(APP + "/package.json");
const { CrossbarClient } = require("@switchboard-xyz/common");
const ornn = require(here + "../../app/engine/ornn.js");
const network = process.argv[2] || "testnet";
const code = process.argv[3] || "H100_SXM";
const dates = (process.argv[4] || "2026-10-02,2026-10-03").split(",");
// crossbar.switchboard.xyz has no DNS from this host; the labs domain works.
const cb = new CrossbarClient(process.env.CROSSBAR_URL || "https://crossbar.switchboardlabs.xyz", false);
const feed = ornn.oracleFeed(code, dates);
const { feedId } = await cb.storeOracleFeed(feed);
const r = await cb.fetchV2Update([feedId], { chain: "evm", network, use_timestamp: true });
const fx = {
  network, code, dates, feedId, fetchedAt: new Date().toISOString(), timestamp: r.timestamp,
  median: r.medianResponses,
  oracles: (r.oracleResponses || []).map((o) => ({ ethAddress: o.ethAddress, queue: o.feedResponses?.[0]?.queue_pubkey })),
  encoded: r.encoded, responseKeys: Object.keys(r),
};
const dir = here + "../test/fixtures/";
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(dir + `sb-${network}.json`, JSON.stringify(fx, null, 2) + "\n");
console.log(JSON.stringify({ ...fx, encoded: fx.encoded ? fx.encoded.slice(0, 80) + "... len " + fx.encoded.length : fx.encoded }, null, 2));
