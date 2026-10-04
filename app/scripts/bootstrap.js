// One-time venue setup on a cluster where the program is already deployed:
// test USDC mint, program config, maker inventory, first listings.
// Usage: CLUSTER=devnet node scripts/bootstrap.js
"use strict";
const { PublicKey } = require("@solana/web3.js");
const chain = require("../engine/chain");
const venue = require("../engine/venue");
const keeper = require("../engine/keeper");
const ornn = require("../engine/ornn");

(async () => {
  const sol = (await venue.conn.getBalance(venue.keys.admin.publicKey)) / 1e9;
  console.log(`cluster ${venue.CLUSTER} rpc ${venue.RPC_URL}`);
  console.log(`program ${chain.PROGRAM_ID.toBase58()} admin ${venue.keys.admin.publicKey.toBase58()} balance ${sol} SOL`);
  const prog = await venue.conn.getAccountInfo(chain.PROGRAM_ID);
  if (!prog || !prog.executable) throw new Error("program is not deployed on this cluster");

  if (!venue.state.quoteMint) {
    venue.state.quoteMint = (await venue.createQuoteMint()).toBase58();
    venue.save();
    console.log("created test USDC mint", venue.state.quoteMint);
  }
  const quoteMint = new PublicKey(venue.state.quoteMint);

  let cfg = await venue.readConfig();
  if (!cfg) {
    await venue.send([chain.initConfig({
      admin: venue.keys.admin.publicKey, settler: venue.keys.settler.publicKey,
      oracleQueue: venue.ORACLE_QUEUE, quoteMint,
    })], []);
    cfg = await venue.readConfig();
    console.log("config initialised");
  }
  if (!cfg.quoteMint.equals(quoteMint)) throw new Error(`config quote mint ${cfg.quoteMint} != state ${quoteMint}`);
  console.log("config", { admin: cfg.admin.toBase58(), settler: cfg.settler.toBase58(), oracleQueue: cfg.oracleQueue.toBase58() });

  await keeper.restockMaker();
  console.log(await ornn.refreshAll());
  const n = await keeper.rollListings();
  console.log(`listed ${n} new markets; total ${Object.keys(venue.state.series).length}`);
  const sol2 = (await venue.conn.getBalance(venue.keys.admin.publicKey)) / 1e9;
  console.log(`admin balance now ${sol2} SOL (spent ${(sol - sol2).toFixed(4)})`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
