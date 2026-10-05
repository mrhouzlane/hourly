// Which oracle keys does crossbar sign EVM updates with right now?
// Fetches a few fresh fetchV2Update(chain=evm) responses per network for the
// Ornn window feed and prints the signer address and queue for each.
//   node evm/scripts/sb-signers.mjs
// Compare the addresses with each EVM queue's registered keys:
//   bash evm/scripts/sb-queue-keys.sh <rpc> <switchboard>
import { createRequire } from "module";
const here = new URL(".", import.meta.url).pathname;
const APP = process.env.APP_DIR || here + "../../app";
const require = createRequire(APP + "/package.json");
const { CrossbarClient } = require("@switchboard-xyz/common");
const ornn = require(here + "../../app/engine/ornn.js");
const cb = new CrossbarClient(process.env.CROSSBAR_URL || "https://crossbar.switchboardlabs.xyz", false);
const { feedId } = await cb.storeOracleFeed(ornn.oracleFeed("H100_SXM", ["2026-10-02", "2026-10-03"]));
console.log("feedId", feedId);
for (const network of ["mainnet", "testnet"]) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await cb.fetchV2Update([feedId], { chain: "evm", network, use_timestamp: true });
      const who = (r.oracleResponses || []).map((o) => "0x" + o.ethAddress + " queue " + o.feedResponses?.[0]?.queue_pubkey);
      console.log(network, new Date(r.timestamp * 1000).toISOString(), r.medianResponses?.[0]?.value, who.join(" | "));
    } catch (e) {
      console.log(network, "ERR", e.message);
    }
  }
}
