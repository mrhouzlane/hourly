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
  const view = async (v) => { await page.click(`#menubar [data-view="${v}"]:not(.brand)`); await page.waitForTimeout(300); };
  await step("protect: toggles change the level card and button", async () => {
    await view("hedge");
    await page.click('[data-role="rent"]'); await page.waitForTimeout(200);
    if (!/^Cap/.test(await page.textContent(".level .llab"))) throw new Error("rent label");
    if (!/^Cap /.test(await page.textContent("#hedge-go"))) throw new Error("rent button");
    await page.click('[data-role="own"]'); await page.waitForTimeout(200);
    if (!/^Floor/.test(await page.textContent(".level .llab"))) throw new Error("own label");
    await page.click('[data-more="1"]'); await page.waitForSelector(".afold .chart svg", { timeout: 5000 });
    await page.click('[data-more="0"]'); await page.waitForTimeout(200);
  });
  await step("protect: execute", async () => {
    await page.click("#hedge-go");
    await page.waitForSelector("#ok", { timeout: 20000 });
    await page.click("#ok");
    const t = await okDialog(); if (!/Protected/.test(t)) throw new Error(t.slice(0, 80));
  });
  await step("your protections lists the new position", async () => {
    await page.waitForSelector(".mine .prow", { timeout: 15000 });
  });
  await step("activity renders chips and cards", async () => {
    await view("activity");
    await page.waitForSelector(".chips .chip", { timeout: 5000 });
    await page.waitForSelector(".tcard", { timeout: 5000 });
  });
  await step("earn: vault, quoters and refer tabs render", async () => {
    await view("earn");
    await page.waitForSelector("#dep-go", { timeout: 5000 });
    await page.waitForSelector(".stake .srow", { timeout: 5000 });
    await page.click('[data-et="quoters"]'); await page.waitForSelector(".qrow", { timeout: 5000 });
    await page.click('[data-et="refer"]'); await page.waitForSelector(".reflink code", { timeout: 5000 });
    const link = await page.textContent(".reflink code"); if (!link.includes(`ref=${kp.publicKey.toBase58()}`)) throw new Error("ref link");
    await page.screenshot({ path: `${SHOTS}/wallet-refer.png`, fullPage: true });
    await page.click('[data-et="vault"]'); await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/wallet-earn.png`, fullPage: true });
    await view("activity");
  });
  await page.screenshot({ path: `${SHOTS}/wallet-activity.png`, fullPage: true });
  await page.screenshot({ path: `${SHOTS}/wallet-portfolio.png`, fullPage: true });
  console.log("signatures by chain:", JSON.stringify(signed));
  console.log(errors.length ? "page errors: " + errors.join(" | ") : "no page errors");
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error("WALLET E2E FAILED", e); process.exit(1); });
