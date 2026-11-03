// Near-the-money H100 daily markets for the demo (both sides priced well below what they pay).
"use strict";
const keeper = require("../engine/keeper");
const catalog = require("../engine/catalog");
const venue = require("../engine/venue");
(async () => {
  if (venue.CLUSTER !== "devnet") throw new Error("devnet only");
  for (const date of (process.argv[2] || "2026-11-05,2026-11-06").split(","))
    for (const k of (process.argv[3] || "3.10,3.20").split(",").map(Number)) {
      const spec = catalog.digital("H100_SXM", date, k);
      console.log("listed", spec.title, await keeper.listOne(spec));
    }
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
