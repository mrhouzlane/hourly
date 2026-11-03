// Screenshot v3 pages from the preview URL. Usage: node shoot.js <base> <outdir> [pages]
// pages: home,desk,tap,lock,index,house,docs,access,m-home
const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const [base, out, list] = [process.argv[2], process.argv[3], (process.argv[4] || 'home,trade,tap,lock,access,index,house,docs,m-home,m-trade,m-tap,m-lock,m-access,m-index,m-house,m-docs').split(',')];
const GO = { home: ['home'], trade: ['desk', 'ticket'], tap: ['desk', 'tap'], lock: ['desk', 'lock'], index: ['index'], house: ['house'], docs: ['docs'], access: ['access'] };
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const pg of list) {
    const mobile = pg.startsWith('m-');
    const p = await b.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 } });
    p.on('pageerror', (e) => errs.push(`${pg}: ${e.message}`));
    await p.goto(base, { waitUntil: 'networkidle' });
    await p.evaluate(([v, m]) => window.__hourlyGo(v, m), GO[pg.replace(/^m-/, '')]);
    await p.waitForTimeout(2500);
    await p.addStyleTag({ content: '*{animation-play-state:paused!important}' });
    await p.screenshot({ path: `${out}/${pg}.png`, fullPage: pg.replace(/^m-/, '') === 'docs' || mobile });
    await p.close();
  }
  console.log('page errors', errs.length, errs.slice(0, 4));
  await b.close();
})();
