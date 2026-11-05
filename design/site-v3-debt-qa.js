const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const URL = 'https://hourly-v3.34-177-105-21.sslip.io/debt', D = '/home/mehdi_quantum3labs_com/hourly-site-v3/shots/debt2/';
(async () => {
  const b = await chromium.launch(), errs = [], out = {};
  for (const [w, h, tag] of [[1440, 1000, 'd1440'], [390, 844, 'm390']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => errs.push(tag + ' ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(tag + ' ' + m.text()); });
    await p.goto(URL, { waitUntil: 'load' }); await p.waitForSelector('#cards .card'); await p.waitForTimeout(1200);
    out[tag + ' first view cards'] = await p.$$eval('#cards .card .who', (e) => e.map((x) => x.innerText.replace(/\s+/g, ' ')));
    out[tag + ' more visible px'] = await p.$eval('#more', (e) => e.getBoundingClientRect().height); out[tag + ' see all top'] = await p.$eval('#btn-more', (e) => Math.round(e.getBoundingClientRect().top));
    out[tag + ' tiles'] = (await p.innerText('.tiles')).replace(/\s+/g, ' ');
    out[tag + ' firmus meta'] = (await p.innerText('#cards .card:first-child')).replace(/\s+/g, ' ');
    out[tag + ' order'] = await p.$$eval('.debtpg > section, .debtpg > .two, .debtpg > .dcta', (e) => e.map((x) => x.id || x.className));
    out[tag + ' scrollW'] = await p.evaluate(() => document.documentElement.scrollWidth);
    await p.screenshot({ path: `${D}${tag}-first-view.png` });
    await p.click('#btn-more'); await p.waitForTimeout(400);
    out[tag + ' expanded'] = await p.$$eval('#more .card', (e) => e.length) ;
    out[tag + ' btn'] = await p.innerText('#btn-more');
    await p.screenshot({ path: `${D}${tag}-expanded-full.png`, fullPage: true });
    const wall = await p.$('#wall'); await wall.scrollIntoViewIfNeeded(); await wall.screenshot({ path: `${D}${tag}-wall.png` });
    await p.click('#cards [data-sim="firm"]'); await p.waitForTimeout(2600);
    out[tag + ' sim'] = (await p.innerText('#sim .pb')).replace(/\s+/g, ' ').slice(0, 400);
    await p.screenshot({ path: `${D}${tag}-sim.png` });
  }
  console.log(JSON.stringify(out, null, 1)); console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
