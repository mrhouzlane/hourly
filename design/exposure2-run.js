const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const BASE = 'https://hourly-v3.34-177-105-21.sslip.io/', D = '/home/mehdi_quantum3labs_com/hourly-v3/design/exposure2/';
const t = (p, s) => p.innerText(s).then((x) => x.replace(/\s+/g, ' ').trim());
(async () => {
  const b = await chromium.launch(), errs = []; let sub = null;
  const p = await b.newPage({ viewport: { width: 1440, height: 1100 } });
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('response', async (r) => { if (/\/api\/submit$/.test(new URL(r.url()).pathname)) { try { sub = { status: r.status(), body: await r.json() }; } catch (_) {} } });
  await p.goto(BASE + '#trade', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
  console.log('picker default:', await t(p, '#x-pick'));
  await p.fill('#x-gpus', '64'); await p.fill('#x-ends', '2026-12-15');
  console.log('rent at Mid:', await t(p, '.xr'));
  await p.click('[data-rp="custom"]'); await p.fill('#x-rate', '2.10'); await p.waitForTimeout(300);
  console.log('rent at $2.10:', await t(p, '.xr'));
  await p.screenshot({ path: D + '1-before.png' });
  await p.click('#x-floor'); await p.waitForTimeout(2500);
  console.log('ticket after:', await t(p, '#ticket .body'));
  await p.screenshot({ path: D + '2-after.png' });
  // live link: change GPUs and contract end
  await p.fill('#x-gpus', '20'); await p.waitForTimeout(1200);
  console.log('linked, 20 GPUs:', await t(p, '#ticket .lnk'), '|', await t(p, '#ticket .pp'));
  await p.fill('#x-ends', '2026-11-20'); await p.waitForTimeout(1500);
  console.log('linked, ends Nov 20:', await t(p, '#ticket .body'));
  await p.fill('#x-ends', '2026-12-15'); await p.fill('#x-gpus', '64'); await p.waitForTimeout(1500);
  // hand edit, then relink
  const other = await p.$('#ticket [data-hs]:not(.on)'); await other.click(); await p.waitForTimeout(400);
  console.log('hand edit:', await t(p, '#ticket .lnk'));
  await p.screenshot({ path: D + '3-edited.png' });
  await p.click('#relink'); await p.waitForTimeout(1500);
  console.log('relinked:', await t(p, '#ticket .lnk'), '|', await t(p, '#ticket .strk .on'));
  // Buy
  await p.click('#hedge-go'); await p.waitForSelector('.modal [data-burner]'); await p.click('.modal [data-burner]');
  await p.waitForSelector('.modal #ok', { timeout: 180000 }); console.log('confirm:', await t(p, '.modal'));
  await p.screenshot({ path: D + '4-confirm.png' });
  await p.click('.modal #ok');
  await p.waitForFunction(() => { const m = document.querySelector('.modal'); return m && /Bought|Not sent/.test(m.innerText); }, null, { timeout: 180000 });
  console.log('result:', await t(p, '.modal')); console.log('link:', await p.getAttribute('.modal a', 'href').catch(() => null));
  await p.screenshot({ path: D + '5-bought.png' });
  console.log('submit', JSON.stringify(sub).slice(0, 300));
  const m = await b.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(BASE + '#trade', { waitUntil: 'networkidle' }); await m.waitForTimeout(2500);
  console.log('mobile order exp before ticket:', await m.evaluate(() => document.querySelector('#exp').getBoundingClientRect().top < document.querySelector('#ticket').getBoundingClientRect().top), 'scrollW', await m.evaluate(() => document.documentElement.scrollWidth));
  await m.screenshot({ path: D + '6-mobile.png', fullPage: true });
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
