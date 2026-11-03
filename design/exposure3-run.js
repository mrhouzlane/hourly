const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const BASE = 'https://hourly-v3.34-177-105-21.sslip.io/', D = '/home/mehdi_quantum3labs_com/hourly-v3/design/exposure3/';
const t = (p, s) => p.innerText(s).then((x) => x.replace(/\s+/g, ' ').trim());
(async () => {
  const b = await chromium.launch(), errs = [];
  const p = await b.newPage({ viewport: { width: 1440, height: 1100 } }); p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '#trade', { waitUntil: 'networkidle' }); await p.waitForTimeout(3500);
  console.log('on load exposure:', await t(p, '#exp .body'));
  await p.screenshot({ path: D + '1-load.png' });
  await p.click('#x-floor'); await p.waitForTimeout(2500);
  console.log('after floor:', await t(p, '#ticket .body'));
  await p.screenshot({ path: D + '2-after-floor.png' });
  // pricing check on the daily ticket
  await p.click('[data-mode="ticket"]'); await p.waitForTimeout(500);
  for (const [k, side] of [['3.1', 'lower'], ['3.1', 'higher'], ['3.4', 'lower'], ['3.4', 'higher']]) {
    await p.click(`#ticket [data-side="${side}"]`); await p.click(`#ticket [data-k="${k}"]`); await p.waitForTimeout(200);
    const d = await p.$('#ticket [data-d]'); if (d) await d.click(); await p.waitForTimeout(200);
    await p.fill('#amt', '10'); await p.dispatchEvent('#amt', 'input'); await p.waitForTimeout(200);
    console.log(`ticket ${side === 'lower' ? 'Floor' : 'Cap'} $${k} ${await t(p, '#ticket .dates .on')} $10:`, await t(p, '#ticket .pp'));
    if (k === '3.1' && side === 'lower') await p.screenshot({ path: D + '3-ticket-310-floor.png' });
  }
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(BASE + '#trade', { waitUntil: 'networkidle' }); await m.waitForTimeout(3000);
  console.log('mobile scrollW', await m.evaluate(() => document.documentElement.scrollWidth), 'exp first', await m.evaluate(() => document.querySelector('#exp').getBoundingClientRect().top < document.querySelector('#ticket').getBoundingClientRect().top));
  await m.screenshot({ path: D + '4-mobile.png', fullPage: true });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
