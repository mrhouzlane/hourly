const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const { execFileSync } = require('child_process');
const D = '/home/mehdi_quantum3labs_com/hourly-site-v3/shots/home4/', B = 'https://hourly-v3.34-177-105-21.sslip.io/';
(async () => {
  const b = await chromium.launch(), errs = [];
  for (const [w, h, tag] of [[1440, 1000, 'd1440'], [390, 844, 'm390']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => errs.push(tag + ' ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(tag + ' ' + m.text()); });
    await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(2500);
    console.log(tag, 'sections', await p.$$eval('#desk .site > section', (e) => e.map((x) => x.id)), 'h1', await p.$$eval('h1', (e) => e.length), 'form hidden', await p.$eval('#seat-form', (e) => e.getBoundingClientRect().height === 0), 'scrollW', await p.evaluate(() => document.documentElement.scrollWidth));
    await p.screenshot({ path: `${D}${tag}-1-first-view.png` });
    await p.click('#s-open'); await p.waitForTimeout(500);
    await p.screenshot({ path: `${D}${tag}-2-form-open.png` });
    if (tag === 'd1440') {
      await p.fill('#s-name', 'QA'); await p.fill('#s-co', 'QA Board Co'); await p.selectOption('#s-gpus', '64 to 511'); await p.check('#s-show');
      await p.click('#seat-form button[type=submit]'); await p.waitForSelector('#s-ok', { state: 'visible' });
      console.log('count after', await p.innerText('#seats-claimed'));
      console.log(execFileSync('node', ['/home/mehdi_quantum3labs_com/hourly-site-v3/repo/app/scripts/approve-founder.js']).toString().trim());
      console.log(execFileSync('node', ['/home/mehdi_quantum3labs_com/hourly-site-v3/repo/app/scripts/approve-founder.js', 'QA Board Co']).toString().trim());
      await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(2000);
      console.log('board', (await p.innerText('#board-rows')).replace(/\s+/g, ' '));
      const bd = await p.$('#board'); await bd.scrollIntoViewIfNeeded(); await bd.screenshot({ path: `${D}${tag}-3-board-approved.png` });
    }
    await p.screenshot({ path: `${D}${tag}-full.png`, fullPage: true });
  }
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
