// QA for the home first view: request a seat (left) and the seat count with the Hourly Founding Board (right).
const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const D = '/home/mehdi_quantum3labs_com/hourly-site-v3/shots/home8/', B = 'https://hourly-v3.34-177-105-21.sslip.io/', tag0 = process.argv[2] || 'empty';
(async () => {
  const b = await chromium.launch(), errs = [];
  for (const [w, h, tag] of [[1440, 900, 'd1440'], [1280, 800, 'd1280'], [390, 844, 'm390']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => errs.push(tag + ' ' + e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(tag + ' ' + m.text()); });
    await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(2500);
    const g = await p.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
      return { ask: r('#seats'), form: r('#seat-form'), go: r('#s-go'), side: r('.rail'), board: r('#board'), vh: innerHeight, vw: innerWidth, scrollW: document.documentElement.scrollWidth, ticksOn: document.querySelectorAll('#ticks i.on').length, formVisible: !!document.querySelector('#s-name').offsetParent };
    });
    console.log(tag0, tag, JSON.stringify(g), 'pager', await p.$eval('#board-pager', (e) => e.hidden ? 'hidden' : e.innerText.replace(/\s+/g, ' ')));
    await p.screenshot({ path: `${D}${tag0}-${tag}-first.png` });
    if (tag0 === 'full' && tag === 'd1440') { await p.click('#pg-next'); await p.waitForTimeout(500); console.log('page2', (await p.innerText('#board-pager')).replace(/\s+/g, ' ')); await p.screenshot({ path: `${D}${tag0}-${tag}-page2.png` }); }
    if (tag0 === 'empty') await p.screenshot({ path: `${D}${tag0}-${tag}-full.png`, fullPage: true });
  }
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
