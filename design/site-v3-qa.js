// QA for the site-v3 preview: sections at 1440 and 390, guess flow, share card, X link, seat request, Debt page, regressions.
const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const BASE = 'https://hourly-v3.34-177-105-21.sslip.io/', D = '/home/mehdi_quantum3labs_com/hourly-site-v3/shots/';
const SECTIONS = ['shero', 'problem', 'how', 'guess', 'board', 'seats', 'debt'];
(async () => {
  const b = await chromium.launch(), errs = [], bad = [], out = {};
  for (const [w, h, tag] of [[1440, 1000, 'd1440'], [390, 844, 'm390']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, acceptDownloads: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag} console: ${m.text()}`); });
    p.on('response', (r) => { if (r.status() >= 400) bad.push(`${tag} ${r.status()} ${r.url()}`); });
    await p.goto(BASE + '?ref=qa_test', { waitUntil: 'load' }); await p.waitForTimeout(2500);
    out[tag + ' scrollW'] = await p.evaluate(() => document.documentElement.scrollWidth);
    out[tag + ' nav'] = await p.innerText('.mn-nav');
    out[tag + ' seats'] = await p.innerText('#seats-claimed');
    out[tag + ' board'] = (await p.innerText('#board')).replace(/\s+/g, ' ').slice(0, 120);
    for (const s of SECTIONS) { const el = await p.$(s === 'shero' ? '.shero' : '#' + s); await el.scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await el.screenshot({ path: `${D}${tag}-${s}.png` }); }
    out[tag + ' video'] = await p.evaluate(() => { const v = document.querySelector('#l01'); return { src: !!v.src, paused: v.paused, muted: v.muted, ready: v.readyState }; });
    await p.screenshot({ path: `${D}${tag}-home-full.png`, fullPage: true });
    if (tag === 'd1440') {
      // guess flow
      await p.fill('#g-low', '2.60'); await p.fill('#g-high', '4.10'); await p.fill('#g-x', 'qa_tester');
      await p.click('#g-submit'); await p.waitForSelector('#g-result.open', { timeout: 15000 });
      out.result = (await p.innerText('#g-result')).replace(/\s+/g, ' ');
      out.xhref = await p.getAttribute('#g-xpost', 'href');
      const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#g-share')]);
      await dl.saveAs(D + 'guess-card.png'); out.card = dl.suggestedFilename();
      await p.screenshot({ path: D + 'd1440-guess-done.png' });
      await p.click('#g-submit'); await p.waitForTimeout(1500); out.dupe = await p.innerText('#g-err');
      // seat
      await p.fill('#s-name', 'QA Tester'); await p.fill('#s-co', 'QA Test Co'); await p.selectOption('#s-gpus', '64 to 511');
      await p.click('#seat-form button[type=submit]'); await p.waitForSelector('#s-ok.open', { timeout: 15000 });
      await p.waitForTimeout(800); out.seatsAfter = await p.innerText('#seats-claimed');
      // menubar to Debt, then back to Trade
      await p.click('.mn-nav [data-view="debt"]'); await p.waitForSelector('.debtpg .cards .card', { timeout: 15000 });
      out.debtUrl = p.url(); out.debtTitle = await p.title();
      await p.click('.mn-nav [data-view="desk"]'); await p.waitForTimeout(2500); out.tradeUrl = p.url(); out.tradeH1 = await p.innerText('h1');
      for (const v of ['index', 'house', 'docs']) { await p.click(`.mn-nav [data-view="${v}"]`); await p.waitForTimeout(2000); out[v] = (await p.innerText('h1')) + ' | ' + p.url(); }
    }
    // Debt page direct
    await p.goto(BASE + 'debt', { waitUntil: 'load' }); await p.waitForSelector('.debtpg .cards .card', { timeout: 15000 }); await p.waitForTimeout(800);
    out[tag + ' debt scrollW'] = await p.evaluate(() => document.documentElement.scrollWidth);
    out[tag + ' debt nav on'] = await p.innerText('.mn-nav .on');
    out[tag + ' debt cov'] = await p.innerText('#cov-v');
    await p.screenshot({ path: `${D}${tag}-debt-full.png`, fullPage: true });
    await p.click('[data-sim="cw55"]'); await p.waitForTimeout(2600);
    out[tag + ' sim'] = (await p.innerText('.out')).replace(/\s+/g, ' ');
    await p.screenshot({ path: `${D}${tag}-debt-sim.png` });
    if (tag === 'd1440') { const [dl2] = await Promise.all([p.waitForEvent('download'), p.click('#sim-dl')]); await dl2.saveAs(D + 'debt-sim-card.png'); }
    await ctx.close();
  }
  console.log(JSON.stringify(out, null, 1)); console.log('errors', errs); console.log('bad', bad);
  await b.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
