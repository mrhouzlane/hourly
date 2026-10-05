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
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => document.querySelectorAll(".rise").forEach((e) => e.classList.add("in")));

  await step("wallet appears in picker and connects", async () => {
    await page.click("#connect");
    await page.waitForSelector("[data-w]", { timeout: 5000 });
    await page.click("[data-w]");
    await page.waitForFunction((a) => document.querySelector("#connect").textContent.startsWith(a.slice(0, 4)), kp.publicKey.toBase58(), { timeout: 5000 });
  });
  const trade = async (selector, label) => step(label, async () => {
    await page.click(selector);
    await page.waitForFunction(() => !document.querySelector("#go").disabled, null, { timeout: 20000 });
    await page.click("#go");
    await page.waitForFunction(() => /Done|err/.test(document.querySelector("#t-status").textContent + " " + document.querySelector("#t-status").className), null, { timeout: 60000 });
    const t = await page.textContent("#t-status");
    if (!/Done/.test(t)) throw new Error(t);
    await page.click("#go");
  });
  await trade("[data-trade][data-side=yes]", "buy YES via wallet signature");
  await trade("[data-trade][data-side=no]", "write NO via wallet signature");
  await step("hedge collar via wallet", async () => {
    await page.click(".switch button[data-door=hedge]");
    await page.check("#collar");
    await page.click("#hedge-go");
    await page.waitForFunction(() => !document.querySelector("#go").disabled, null, { timeout: 20000 });
    await page.click("#go");
    await page.waitForFunction(() => /Done|err/.test(document.querySelector("#t-status").textContent + " " + document.querySelector("#t-status").className), null, { timeout: 60000 });
    const t = await page.textContent("#t-status"); if (!/Done/.test(t)) throw new Error(t);
    await page.click("#go");
  });
  await step("vault deposit via wallet", async () => {
    await page.click(".switch button[data-door=earn]");
    await page.fill("#dep-amt", "100");
    await page.click("#dep-go");
    await page.waitForFunction(() => /Deposited|err/.test(document.querySelector("#dep-status").textContent + " " + document.querySelector("#dep-status").className), null, { timeout: 60000 });
    const t = await page.textContent("#dep-status"); if (!/Deposited/.test(t)) throw new Error(t);
  });
  await step("portfolio shows positions and vault", async () => {
    await page.waitForTimeout(1500);
    const txt = await page.textContent("#portfolio-body");
    if (!/Long/.test(txt) || !/Short/.test(txt) || !/Vault/.test(txt)) throw new Error(txt.slice(0, 200));
  });
  await step("close long against short via wallet", async () => {
    await page.click("[data-act=close]");
    await page.waitForFunction(() => /Done|err/.test(document.querySelector("#pf-status").textContent + " " + document.querySelector("#pf-status").className), null, { timeout: 60000 });
    const t = await page.textContent("#pf-status"); if (!/Done/.test(t)) throw new Error(t);
  });
  await (await page.$("#portfolio")).screenshot({ path: `${SHOTS}/wallet-portfolio.png` });
  console.log("signatures by chain:", JSON.stringify(signed));
  console.log(errors.length ? "page errors: " + errors.join(" | ") : "no page errors");
  await browser.close();
  process.exit(0);
})().catch((e) => { console.error("WALLET E2E FAILED", e); process.exit(1); });
