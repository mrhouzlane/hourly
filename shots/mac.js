const { chromium } = require("/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright");
const O = "/home/mehdi_quantum3labs_com/compute-options/shots";
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, vp] of [["d", { width: 1440, height: 1000 }], ["m", { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp });
    p.on("pageerror", (e) => errs.push(name + " " + e.message));
    p.on("console", (m) => { if (m.type() === "error") errs.push(name + " console " + m.text()); });
    await p.goto("http://127.0.0.1:7990/", { waitUntil: "networkidle" });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: `${O}/mac-${name}-1side.png`, fullPage: true });
    await p.keyboard.press("Enter"); await p.waitForTimeout(600);
    await p.screenshot({ path: `${O}/mac-${name}-2level.png`, fullPage: true });
    await p.keyboard.press("ArrowDown"); await p.keyboard.press("Enter"); await p.waitForTimeout(600);
    await p.screenshot({ path: `${O}/mac-${name}-3date.png`, fullPage: true });
    await p.keyboard.press("Enter"); await p.waitForTimeout(600);
    await p.screenshot({ path: `${O}/mac-${name}-4amount.png`, fullPage: true });
    for (const v of ["hedge", "earn", "activity"]) {
      await p.click(`#menubar [data-view=${v}]`); await p.waitForTimeout(500);
      await p.screenshot({ path: `${O}/mac-${name}-${v}.png`, fullPage: true });
    }
    console.log(name, "hscroll", await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    await p.close();
  }
  console.log(errs.length ? errs.join("\n") : "no errors");
  await b.close();
})();
