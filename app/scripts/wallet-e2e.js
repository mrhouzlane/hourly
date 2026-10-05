// Drives the real UI in headless Chromium with an injected Wallet Standard wallet
// (the same interface Phantom, Solflare, Backpack and MetaMask expose). Signing is
// done in Node with a funded test key. Usage: BASE=http://127.0.0.1:7991 node scripts/wallet-e2e.js
"use strict";
process.env.CLUSTER = process.env.CLUSTER || "localnet";
process.env.RPC_URL = process.env.RPC_URL || "http://127.0.0.1:18899";
const { chromium } = require("/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright");
const { Keypair, Transaction } = require("@solana/web3.js");
const venue = require("../engine/venue");
const BASE = process.env.BASE || "http://127.0.0.1:7991/";
const SHOTS = process.env.SHOTS || "/home/mehdi_quantum3labs_com/compute-options/shots";
(async () => {
  const kp = Keypair.generate();
  await venue.mintQuote(kp.publicKey, 3_000);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], signed = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.exposeFunction("__hourlySign", (bytes, chain) => {
    const tx = Transaction.from(Buffer.from(bytes));
    tx.partialSign(kp);
    signed.push(chain);
    return Array.from(tx.serialize({ requireAllSignatures: false, verifySignatures: false }));
  });
  await page.addInitScript(({ address, pk }) => {
    const account = { address, publicKey: new Uint8Array(pk), chains: ["solana:localnet", "solana:devnet", "solana:mainnet"], features: ["solana:signTransaction"] };
    const wallet = {
      version: "1.0.0", name: "Test Wallet", icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=",
      chains: account.chains, accounts: [account],
      features: {
        "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
        "standard:disconnect": { version: "1.0.0", disconnect: async () => {} },
        "standard:events": { version: "1.0.0", on: () => () => {} },
        "solana:signTransaction": {
          version: "1.0.0", supportedTransactionVersions: ["legacy", 0],
          signTransaction: async (...inputs) => Promise.all(inputs.map(async (i) => ({ signedTransaction: new Uint8Array(await window.__hourlySign(Array.from(i.transaction), i.chain)) }))),
        },
      },
    };
    const reg = ({ register }) => register(wallet);
    window.addEventListener("wallet-standard:app-ready", (e) => reg(e.detail));
    try { window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: reg })); } catch (_) {}
  }, { address: kp.publicKey.toBase58(), pk: Array.from(kp.publicKey.toBytes()) });

  const step = async (name, fn) => { try { await fn(); console.log("PASS", name); } catch (e) { console.log("FAIL", name, e.message.split("\n")[0]); } };
  const okDialog = async () => { await page.waitForSelector(".modal .btn.default", { timeout: 60000 }); const t = await page.textContent(".modal"); await page.click(".modal .btn.default"); return t; };
  await page.goto(BASE, { waitUntil: "networkidle" });
  await step("wallet appears in picker and connects", async () => {
    await page.click("#wallet-btn");
    await page.waitForSelector("[data-w]", { timeout: 5000 });
    await page.click("[data-w]");
    await page.waitForFunction((a) => document.querySelector("#wallet-btn").textContent.startsWith(a.slice(0, 4)), kp.publicKey.toBase58(), { timeout: 5000 });
  });
  const wizard = (side, label) => step(label, async () => {
    await page.screenshot({ path: `${SHOTS}/after-connect.png` });
    await page.click('#menubar [data-view="trade"]');
    await page.click(`[data-opt="${side}"]`);
    await page.click("[data-opt]");            // first level
    await page.click("[data-opt]");            // first date
    await page.fill("#amt", "6");
    await page.click("#to-review");
    await page.waitForFunction(() => document.querySelector("#sign") && !document.querySelector("#sign").disabled, null, { timeout: 20000 });
    await page.click("#sign");
    const t = await okDialog();
    if (!/Done/.test(t)) throw new Error(t);
  });
  await wizard("higher", "wizard: higher via wallet signature");
  await wizard("lower", "wizard: lower via wallet signature");
  await step("hedge collar via wallet", async () => {
    await page.click('#menubar [data-view="hedge"]');
    await page.check("#collar");
    await page.click("#hedge-go");
    await page.waitForSelector(".modal #ok", { timeout: 20000 });
    await page.click(".modal #ok");
    const t = await okDialog(); if (!/Protected/.test(t)) throw new Error(t);
  });
  await step("vault deposit via wallet", async () => {
    await page.click('#menubar [data-view="earn"]');
    await page.fill("#dep", "100");
    await page.click("#dep-go");
    const t = await okDialog(); if (!/Deposited/.test(t)) throw new Error(t);
  });
  await step("portfolio shows positions and vault", async () => {
    await page.click('#menubar [data-view="portfolio"]');
    await page.waitForTimeout(1500);
    const txt = await page.textContent("#desk");
    if (!/long/.test(txt) || !/short/.test(txt) || !/Vault/.test(txt)) throw new Error(txt.slice(0, 200));
  });
  await step("activity shows this wallet's trades", async () => {
    await page.click('#menubar [data-view="activity"]');
    await page.waitForTimeout(800);
    const txt = await page.textContent("#desk");
    if (!/put \$/.test(txt)) throw new Error("no trade sentences");
  });
  await page.click('#menubar [data-view="portfolio"]'); await page.waitForTimeout(800); await page.screenshot({ path: `${SHOTS}/wallet-portfolio.png`, fullPage: true });
  console.log("signatures by chain:", JSON.stringify(signed));
  console.log(errors.length ? "page errors: " + errors.join(" | ") : "no page errors");
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error("WALLET E2E FAILED", e); process.exit(1); });
