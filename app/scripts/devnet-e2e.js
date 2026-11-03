// Devnet end to end in the real UI: burner wallet, test USDC, one H100 floor (put) trade,
// then the payout from the Switchboard price. Nothing is mocked: every step reads devnet.
// Usage: BASE=http://127.0.0.1:7992/ node scripts/devnet-e2e.js   (app started with CLUSTER=devnet)
// Writes every tx signature to ../devnet-txs.json with a Solana Explorer devnet link.
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright");

const BASE = process.env.BASE || "http://127.0.0.1:7992/";
const OUT = path.join(__dirname, "..", "..", "devnet-txs.json");
const SHOTS = process.env.SHOTS || path.join(__dirname, "..", "..", "shots");
const explorer = (sig) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

const results = [];
function step(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  " + detail : ""}`);
}
const api = async (p, opts) => (await fetch(new URL(`api/${p}`, BASE), opts)).json();

(async () => {
  const txs = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
  const record = (what, sig) => { txs.push({ what, sig, url: explorer(sig), at: new Date().toISOString() }); fs.writeFileSync(OUT, JSON.stringify(txs, null, 2)); };

  const status = await api("status");
  step("app is on devnet with a reachable RPC", status.cluster === "devnet" && status.rpcOk, `cluster=${status.cluster} rpcOk=${status.rpcOk}`);
  if (status.cluster !== "devnet") process.exit(2);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (r) => {
    if (!/\/api\/(faucet|submit)$/.test(new URL(r.url()).pathname) || r.status() !== 200) return;
    try { const j = await r.json(); const sig = j.signature || j.tx; if (sig) record(r.url().endsWith("faucet") ? "faucet" : "trade", sig); } catch (_) { /* not json */ }
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click("text=CONNECT >> nth=0");
  await page.click("text=/burner wallet/i");
  await page.waitForTimeout(1500);
  const addr = (await page.innerText("header, body")).match(/[1-9A-HJ-NP-Za-km-z]{4}…[1-9A-HJ-NP-Za-km-z]{4}/);
  step("burner wallet connects", !!addr, addr ? addr[0] : "no wallet chip");

  await page.click("text=TRADE >> nth=0");
  await page.waitForTimeout(4000);
  // A fresh burner is funded on connect; the button is the fallback when that did not land.
  const readBalance = async () => Number(((await page.innerText("body")).match(/Balance\s+\$([\d,]+)/) || [, "0"])[1].replace(/,/g, ""));
  let balance = await readBalance();
  if (!balance) {
    await page.click("text=ADD TEST USDC");
    await page.waitForTimeout(8000);
    const ok = page.locator('button:has-text("OK")');
    if (await ok.count()) await ok.first().click();
    balance = await readBalance();
  }
  step("test USDC lands in the wallet", balance > 0, `balance $${balance}`);
  await page.screenshot({ path: path.join(SHOTS, "devnet-1-funded.png") });

  // Step 4 needs a listed H100 floor near the current print, 2 to 3 days out.
  const markets = await api("markets");
  const list = Array.isArray(markets) ? markets : markets.markets || [];
  const puts = list.filter((m) => /H100/.test(m.gpu || m.underlying || "") && /(below|floor|lower)/i.test(m.title || m.side || m.kind || ""));
  step("an H100 floor market is listed on devnet", puts.length > 0, `${list.length} markets listed, ${puts.length} H100 floors`);

  if (puts.length) {
    await page.click("text=▼ LOWER");
    await page.locator("button", { hasText: "¢" }).first().click();
    await page.click("text=$20 >> nth=0");
    await page.click("text=GET A FIRM PRICE");
    await page.waitForTimeout(8000);
    const sign = page.locator('button:has-text("SIGN")');
    step("firm price returned", (await sign.count()) > 0);
    if (await sign.count()) {
      await sign.first().click();
      await page.waitForTimeout(20000);
      const placed = /Placed\./.test(await page.innerText("body"));
      step("trade signed with the burner wallet and confirmed", placed);
    }
    await page.screenshot({ path: path.join(SHOTS, "devnet-2-trade.png") });
    // Step 5 (payout) needs expiry plus a Switchboard update; run scripts/devnet-e2e.js again after expiry.
    const settled = (status.settlements || []).filter((s) => s.via === "oracle" || s.oracle);
    step("a market paid out from a Switchboard price", settled.length > 0, `${settled.length} oracle payouts so far`);
  }

  step("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed. Tx log: ${OUT}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
