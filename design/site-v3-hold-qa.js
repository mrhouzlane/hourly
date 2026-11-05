// QA for the preview fixes: index hold (no index numbers on any view), Debt routes, single seat CTA, copy.
const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const D = '/home/mehdi_quantum3labs_com/hourly-site-v3/shots/hold/', B = 'https://hourly-v3.34-177-105-21.sslip.io/';
// latest H100 range and print values that must not render while the hold is on
const LEAK = /\$3\.48\b|\$3\.4821|\$3\.17\b|\$3\.82\b|\$3\.815|Hourly Index \$|onchain print|\bmid \$|sources\b.*\d|\bLow \$|\bHigh \$/;
(async () => {
  const b = await chromium.launch(), errs = [], bad = [];
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('response', (r) => { if (r.status() >= 400 && !/api\/(seats|quote)/.test(r.url())) bad.push(`${r.status()} ${r.url()}`); });
  for (const [path, name] of [['#index', 'index'], ['#trade', 'trade'], ['#docs', 'docs'], ['#house', 'house'], ['', 'home']]) {
    await p.goto(B + path, { waitUntil: 'load' }); await p.waitForTimeout(3000);
    const text = await p.innerText('#desk');
    const m = text.match(LEAK);
    console.log(name, 'h1:', await p.innerText('h1').catch(() => '-'), '| leak:', m ? JSON.stringify(m[0]) : 'none', '| closed/settle/predict:', /\b(closed|settle\w*|predict\w*|all you can lose)\b/i.test(text) ? 'FOUND' : 'none');
    await p.screenshot({ path: `${D}${name}.png`, fullPage: name !== 'home' });
  }
  // trade: exposure works on your own rate
  await p.goto(B + '#trade', { waitUntil: 'load' }); await p.waitForTimeout(3000);
  await p.fill('#x-rate', '2.10'); await p.waitForTimeout(400);
  console.log('exposure', (await p.innerText('.xr')).replace(/\s+/g, ' '));
  await p.click('#x-floor'); await p.waitForTimeout(2500);
  console.log('ticket', (await p.innerText('#ticket .body')).replace(/\s+/g, ' ').slice(0, 260));
  await p.screenshot({ path: `${D}trade-floor.png` });
  // debt routes
  for (const u of ['debt', 'debt/', '#debt']) {
    await p.goto(B + u, { waitUntil: 'load' });
    const ok = await p.waitForSelector('.debtpg .cards .card', { timeout: 15000 }).then(() => true).catch(() => false);
    console.log('route', u, '->', p.url(), ok ? 'Debt page' : 'NOT debt', '| nav on:', await p.innerText('.mn-nav .on').catch(() => '-'));
  }
  await p.screenshot({ path: `${D}debt-hash.png` });
  // single CTA: menubar on another view opens the seat form on home
  await p.goto(B + '#index', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  console.log('menubar CTA:', await p.innerText('#menubar .ra'));
  await p.click('#menubar .ra'); await p.waitForTimeout(800);
  console.log('after click: view', await p.evaluate(() => document.body.dataset.view), 'form open', await p.evaluate(() => !document.querySelector('#seat-panel').hidden), 'focus', await p.evaluate(() => document.activeElement.id));
  console.log('errors', errs, 'bad', bad); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
