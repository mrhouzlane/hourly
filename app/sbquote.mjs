import * as sb from "@switchboard-xyz/on-demand";
import { CrossbarClient } from "@switchboard-xyz/common";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ornn = require("./engine/ornn.js");
const cb = new CrossbarClient('https://crossbar.switchboardlabs.xyz', false);
const feed = ornn.oracleFeed("H100_SXM", ["2026-10-02", "2026-10-03"]);
const stored = await cb.storeOracleFeed(feed);
console.log("stored feedId", stored.feedId);
const queue = await sb.getDefaultDevnetQueue("https://api.devnet.solana.com");
for (const opts of [{ numSignatures: 1, instructionIdx: 0 }, { numSignatures: 1 }]) {
  const ix = await queue.fetchQuoteIx(cb, [feed], opts);
  const d = Buffer.from(ix.data);
  const idx = [4, 8, 14].map(o => d.readUInt16LE(o));
  const fid = Buffer.from(stored.feedId.replace(/^0x/, ""), "hex");
  const at = d.indexOf(fid);
  let val = null;
  if (at >= 0) { const lo = d.readBigUInt64LE(at + 32), hi = d.readBigInt64LE(at + 40); val = (hi << 64n) + lo; }
  console.log(JSON.stringify(opts), "sig/pk/msg ix indexes", idx, "feedId found at", at, "value(1e18)", val?.toString());
}
