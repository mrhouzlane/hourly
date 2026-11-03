// One burner wallet trade through the new UI on the hourly-v3 preview (devnet). Screenshot per step.
const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const BASE = 'https://hourly-v3.34-177-105-21.sslip.io/', D = '/home/mehdi_quantum3labs_com/hourly-v3/design/compare/trade-run/';
(async () => {
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errs = []; let sig = null, url = null;
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('response', async (r) => { if (/\/api\/submit$/.test(new URL(r.url()).pathname) && r.status() === 200) { try { const j = await r.json(); sig = j.signature || j.tx; url = j.url; } catch (_) {} } });
  await p.goto(BASE + '#trade', { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  await p.click('.side button:has-text("Floor")'); await p.click('[data-amt="20"]');
  await p.screenshot({ path: D + '1-ticket.png' });
  await p.click('#t-go'); await p.waitForSelector('.modal [data-burner]'); await p.screenshot({ path: D + '2-connect.png' });
  await p.click('.modal [data-burner]');
  await p.waitForSelector('#t-sign', { timeout: 180000 }); await p.screenshot({ path: D + '3-firm-price.png' });
  await p.click('#t-sign');
  await p.waitForSelector('.modal .btn.default', { timeout: 180000 }); await p.waitForTimeout(500);
  console.log('dialog:', (await p.innerText('.modal')).replace(/\s+/g, ' '));
  await p.screenshot({ path: D + '4-placed.png' });
  await p.click('.modal .btn.default'); await p.waitForTimeout(3000); await p.screenshot({ path: D + '5-positions.png', fullPage: true });
  console.log('sig', sig, url); console.log('page errors', errs);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
