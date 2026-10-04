const { chromium } = require("/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto("http://127.0.0.1:7990/", { waitUntil: "networkidle" });
  await p.evaluate(() => document.querySelectorAll(".rise").forEach((e) => e.classList.add("in"))); await p.waitForTimeout(900);
  await p.click(".switch button[data-door=earn]"); await p.waitForTimeout(500);
  await (await p.$("#markets")).screenshot({ path: "/home/mehdi_quantum3labs_com/compute-options/shots/earn.png" });
  console.log(errs.length ? errs.join("\n") : "no errors"); await b.close();
})();
