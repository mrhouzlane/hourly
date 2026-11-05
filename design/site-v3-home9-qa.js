// QA for hero v2: closed, form open, done, at 1280x800 (same as the reference shots) and 390x844; board hidden when empty.
const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const D = '/home/mehdi_quantum3labs_com/hourly-site-v3/shots/home9/', B = 'https://hourly-v3.34-177-105-21.sslip.io/';
(async () => {
  const b = await chromium.launch(), errs = [];
  for (const [w, h, tag] of [[1280, 800, 'd1280'], [1440, 900, 'd1440'], [390, 844, 'm390']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    p.on('pageerror', (e) => errs.push(tag + ' ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/400/.test(m.text())) errs.push(tag + ' ' + m.text()); });
    await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(2500);
    const g = await p.evaluate(() => ({ boardShown: !document.querySelector('#board').hidden, formShown: !document.querySelector('#seat-panel').hidden, h1: document.querySelector('h1').innerText, seat: document.querySelector('.seatline').innerText, scrollW: document.documentElement.scrollWidth }));
    console.log(tag, 'closed', JSON.stringify(g));
    await p.screenshot({ path: `${D}${tag}-1-closed.png` });
    await p.click('#open-seat'); await p.waitForTimeout(600);
    console.log(tag, 'open', JSON.stringify(await p.evaluate(() => ({ cta: !document.querySelector('#cta2').hidden, chips: !document.querySelector('#chips2').hidden, form: !document.querySelector('#seat-panel').hidden, focus: document.activeElement.id, gpus: document.querySelector('#s-gpus').value }))));
    await p.screenshot({ path: `${D}${tag}-2-open.png` });
    if (tag === 'd1280') {
      await p.fill('#s-name', 'QA'); await p.selectOption('#s-gpus', '64 to 511'); await p.click('#s-go'); await p.waitForTimeout(500);
      console.log('no email ->', await p.innerText('#s-err'));
      await p.fill('#s-email', 'qa@example.com'); await p.click('#s-go'); await p.waitForSelector('#s-ok:not([hidden])');
      await p.waitForTimeout(700); console.log('done', (await p.innerText('#s-ok')).replace(/\s+/g, ' '), '| seatline', await p.innerText('.seatline'));
      await p.screenshot({ path: `${D}${tag}-3-done.png` });
    }
    await p.goto(B, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    await p.click('#how-link'); await p.waitForTimeout(1200);
    console.log(tag, 'how top', await p.$eval('#how', (e) => Math.round(e.getBoundingClientRect().top)));
    await p.screenshot({ path: `${D}${tag}-4-how.png` });
  }
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
