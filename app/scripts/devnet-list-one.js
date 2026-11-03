// One-shot devnet listing for the demo: one H100 market two days out at the money,
// the maker funded with test USDC, and this week's vault seeded by the venue ("seeded by us").
"use strict";
const venue = require("../engine/venue");
const keeper = require("../engine/keeper");
const catalog = require("../engine/catalog");
const ornn = require("../engine/ornn");
(async () => {
  if (venue.CLUSTER !== "devnet") throw new Error("devnet only");
  await ornn.refreshAll();
  const { points } = await ornn.get("H100_SXM");
  const last = points[points.length - 1];
  const date = catalog.addDays(new Date().toISOString().slice(0, 10), 2);
  const spec = catalog.predictListings({ H100_SXM: last.v }, new Date().toISOString().slice(0, 10))
    .filter((s) => s.dates[0] === date)
    .sort((a, b) => Math.abs(Number(a.strike) / 1e6 - last.v) - Math.abs(Number(b.strike) / 1e6 - last.v))[0];
  console.log("last print", last.date, last.v, "listing", spec.title);
  const id = await keeper.listOne(spec);
  console.log("series", id, venue.state.series[id] && venue.state.series[id].feedId);
  await keeper.restockMaker();
  await keeper.ensureVaults();
  console.log("vaults", JSON.stringify(venue.state.vaults));
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
