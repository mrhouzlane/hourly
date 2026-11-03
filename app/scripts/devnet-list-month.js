// One-shot devnet listing for the demo: H100 floor and cap on next month's average (Lock a month).
"use strict";
const venue = require("../engine/venue");
const keeper = require("../engine/keeper");
const catalog = require("../engine/catalog");
const ornn = require("../engine/ornn");
(async () => {
  if (venue.CLUSTER !== "devnet") throw new Error("devnet only");
  const { points } = await ornn.get("H100_SXM");
  const last = points[points.length - 1].v;
  const m = new Date(); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() + 1);
  const specs = catalog.hedgeListings({ H100_SXM: last }, m.toISOString().slice(0, 7));
  for (const s of specs) console.log("listed", s.title, await keeper.listOne(s));
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
