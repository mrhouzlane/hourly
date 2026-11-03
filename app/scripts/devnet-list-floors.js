// December H100 floors near 10% below the index, so the exposure screen can offer real strikes.
"use strict";
const keeper = require("../engine/keeper");
const catalog = require("../engine/catalog");
const venue = require("../engine/venue");
(async () => {
  if (venue.CLUSTER !== "devnet") throw new Error("devnet only");
  const month = process.argv[2] || "2026-12";
  for (const k of (process.argv[3] || "3.10,3.15,3.20").split(",").map(Number)) {
    const spec = catalog.monthly("H100_SXM", month, 1, k, 0.5);
    console.log("listed", spec.title, await keeper.listOne(spec));
  }
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
