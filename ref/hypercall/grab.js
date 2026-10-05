const { chromium } = require("/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  for (const u of ["https://hypercall.xyz/", "https://hypercall.xyz/scenarios", "https://app.hypercall.xyz/scenarios"]) {
    try {
      const r = await p.goto(u, { waitUntil: "networkidle", timeout: 30000 });
      await p.waitForTimeout(2500);
      const name = u.replace(/[^a-z]/gi, "_");
      await p.screenshot({ path: `${name}.png` });
      const txt = (await p.evaluate(() => document.body.innerText)).slice(0, 300).replace(/\n+/g, " | ");
      console.log(u, r && r.status(), p.url(), "::", txt);
    } catch (e) { console.log(u, "ERR", e.message.split("\n")[0]); }
  }
  await b.close();
})();
