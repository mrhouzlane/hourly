const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const BASE = 'https://hourly-v3.34-177-105-21.sslip.io/', D = '/home/mehdi_quantum3labs_com/hourly-v3/design/range/';
(async () => {
  const b = await chromium.launch(), errs = [];
  for (const [w, h, tag] of [[1440, 1000, 'desk'], [390, 844, 'mob']]) {
    const p = await b.newPage({ viewport: { width: w, height: h } }); p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(BASE + '#index', { waitUntil: 'networkidle' }); await p.waitForTimeout(3000);
    for (const c of ['H100_SXM', 'H200']) {
      await p.click(`.ixbig .seg [data-ix="${c}"]`); await p.waitForTimeout(1200);
      console.log(tag, c, (await p.innerText('.ixbig .num')).replace(/\s+/g, ' '), '|', (await p.innerText('.ixg.deals')).replace(/\s+/g, ' ').slice(0, 80));
      await p.screenshot({ path: `${D}${tag}-${c}.png`, fullPage: true });
    }
    console.log(tag, 'footer:', await p.innerText('#botbar'), '| not found on page:', (await p.content()).includes('not found'));
  }
  console.log('errors', errs); await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
