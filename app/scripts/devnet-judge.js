// Burner wallet trade on the devnet site, one screenshot per step, then the fill on Solana Explorer.
"use strict";
const fs = require("fs");
const path = require("path");
const { chromium } = require("/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright");
const BASE = process.env.BASE || "https://hourly-devnet.34-177-105-21.sslip.io/";
const DIR = path.join(__dirname, "..", "..", "shots", "judge");
const OUT = path.join(__dirname, "..", "..", "devnet-txs.json");
(async () => {
  const txs = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; let tradeSig = null;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", async (r) => {
    const p = new URL(r.url()).pathname;
    if (!/\/api\/(faucet|submit)$/.test(p) || r.status() !== 200) return;
    try {
      const j = await r.json(); const sig = j.signature || j.tx; if (!sig) return;
      const what = p.endsWith("faucet") ? "faucet" : "trade";
      if (what === "trade") tradeSig = sig;
      txs.push({ what, sig, url: `https://explorer.solana.com/tx/${sig}?cluster=devnet`, at: new Date().toISOString() });
      fs.writeFileSync(OUT, JSON.stringify(txs, null, 2));
    } catch (_) {}
  });
  const shot = (n) => page.screenshot({ path: path.join(DIR, n) });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click("text=CONNECT >> nth=0");
  await page.click("text=/burner wallet/i");
  await page.waitForTimeout(2000);
  await page.click("text=TRADE >> nth=0");
  await page.waitForTimeout(5000);
  const bal = async () => Number(((await page.innerText("body")).match(/Balance\s+\$([\d,]+)/) || [, "0"])[1].replace(/,/g, ""));
  if (!(await bal())) {
    await page.click("text=ADD TEST USDC"); await page.waitForTimeout(10000);
    const ok = page.locator('button:has-text("OK")'); if (await ok.count()) await ok.first().click();
  }
  console.log("balance", await bal());
  await shot("1-wallet-funded.png");
  await page.click("text=▲ HIGHER");
  await page.waitForTimeout(800);
  await page.locator("button", { hasText: "¢" }).first().click();
  await page.click("text=$20 >> nth=0");
  await shot("2-market-ticket.png");
  await page.click("text=GET A FIRM PRICE");
  await page.waitForTimeout(8000);
  await shot("3-firm-price.png");
  const sign = page.locator('button:has-text("SIGN")');
  if (!(await sign.count())) throw new Error("no SIGN button after firm price: " + (await page.innerText("body")).slice(0, 400));
  await sign.first().click();
  await page.waitForTimeout(20000);
  console.log("placed", /Placed\./.test(await page.innerText("body")), "sig", tradeSig);
  await shot("4-signed-placed.png");
  if (tradeSig) {
    const ex = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    await ex.goto(`https://explorer.solana.com/tx/${tradeSig}?cluster=devnet`, { waitUntil: "networkidle", timeout: 60000 });
    await ex.waitForTimeout(6000);
    await ex.screenshot({ path: path.join(DIR, "5-explorer-fill.png") });
    console.log("explorer", (await ex.innerText("body")).match(/Result\s*\n?\s*\w+/)?.[0]);
  }
  console.log("page errors", errors.length, errors.slice(0, 2));
  await browser.close();
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
