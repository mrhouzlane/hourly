const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const D = '/home/mehdi_quantum3labs_com/hourly-site-v3/shots/home2/';
(async () => {
  const b = await chromium.launch(), errs = [];
  for (const [w, h, tag] of [[1440, 1000, 'd1440'], [390, 844, 'm390']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => errs.push(tag + ' ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(tag + ' ' + m.text()); });
    await p.goto('https://hourly-v3.34-177-105-21.sslip.io/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
    await p.screenshot({ path: `${D}${tag}-1-hero.png` });
    await p.click('.hero [data-seats]'); await p.waitForTimeout(1200);
    console.log(tag, 'seats in view', await p.$eval('#seats', (e) => Math.round(e.getBoundingClientRect().top)), 'focus', await p.evaluate(() => document.activeElement.id), 'scrollW', await p.evaluate(() => document.documentElement.scrollWidth));
    await p.screenshot({ path: `${D}${tag}-2-after-click.png` });
    const im = await p.screenshot({ path: `${D}${tag}-full.png`, fullPage: true });
  }
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
