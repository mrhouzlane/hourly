// Every devnet flow through the real UI. Usage: node full-run.js <base> <outdir>
const { chromium } = require('/home/mehdi_quantum3labs_com/raise-room/node_modules/playwright');
const fs = require('fs');
const [BASE, D] = [process.argv[2], process.argv[3]];
const res = [], txs = {};
const step = (n, ok, d = '') => { res.push({ n, ok, d }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  ${d}`); };
(async () => {
  const st = await (await fetch(BASE + 'api/status')).json();
  step('api/status devnet + rpcOk', st.cluster === 'devnet' && st.rpcOk, `cluster=${st.cluster} rpcOk=${st.rpcOk}`);
  for (const p of ['api/index', 'api/agent/brief', 'llms.txt']) { const r = await fetch(BASE + p); step(`GET ${p}`, r.ok, String(r.status)); }
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } }), p = await ctx.newPage();
  const errs = []; let last = null;
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('response', async (r) => { const u = new URL(r.url()).pathname; if (/\/api\/(submit|faucet)$/.test(u) && r.status() === 200) { try { const j = await r.json(); last = j.signature || j.tx; } catch (_) {} } });
  const ok = async (name) => { await p.waitForSelector('.modal .btn.default:has-text("OK")', { timeout: 240000 }); const t = (await p.innerText('.modal')).replace(/\s+/g, ' '); await p.screenshot({ path: `${D}/${name}.png` }); await p.click('.modal .btn.default'); return t; };
  // 1. Floor ticket
  await p.goto(BASE + '#trade', { waitUntil: 'networkidle' }); await p.waitForTimeout(2000);
  await p.click('.side [data-side="lower"]'); await p.click('[data-amt="20"]');
  await p.click('#t-go'); await p.click('.modal [data-burner]');
  await p.waitForSelector('#t-sign', { timeout: 240000 }); await p.screenshot({ path: `${D}/floor-firm.png` }); last = null;
  await p.click('#t-sign'); let t = await ok('floor-placed'); txs.floor = last;
  step('Ticket: Floor trade fills', /Placed/.test(t) && !!last, last || t.slice(0, 120));
  // 2. Cap via One tap
  await p.waitForTimeout(2000); await p.click('[data-mode="tap"]'); await p.waitForTimeout(800); await p.click('[data-tamt="10"]');
  await p.screenshot({ path: `${D}/tap.png` });
  await p.click('[data-tap][data-tside="higher"]');
  await p.waitForSelector('#t-sign', { timeout: 240000 }); last = null; await p.click('#t-sign'); t = await ok('cap-placed'); txs.cap = last;
  step('One tap: Cap trade fills', /Placed/.test(t) && !!last, last || t.slice(0, 120));
  // 3. Lock a month (Floor)
  await p.waitForTimeout(2000); await p.click('[data-mode="lock"]'); await p.waitForTimeout(800); await p.screenshot({ path: `${D}/lock.png` });
  await p.click('#hedge-go'); await p.waitForSelector('.modal #ok', { timeout: 240000 }); last = null; await p.click('.modal #ok');
  t = await ok('lock-placed'); txs.lock = last;
  step('Lock a month: Floor fills', /Locked/.test(t) && !!last, last || t.slice(0, 120));
  // 4. Portfolio
  await p.waitForTimeout(4000); await p.click('[data-mode="ticket"]'); await p.waitForTimeout(3000);
  const pos = await p.innerText('.pos'); await p.screenshot({ path: `${D}/positions.png`, fullPage: true });
  step('Portfolio shows positions', /floor/i.test(pos) && /cap/i.test(pos), pos.replace(/\s+/g, ' ').slice(0, 200));
  // 5. House deposit
  await p.click('#menubar [data-view="house"]'); await p.waitForTimeout(2500);
  await p.click('#hdep-go'); await p.waitForSelector('.modal #ok'); await p.fill('.modal #hdep', '100'); last = null; await p.click('.modal #ok');
  t = await ok('deposit'); txs.deposit = last;
  step('House: vault deposit', /Deposited/.test(t) && !!last, last || t.slice(0, 120));
  await ctx.close();
  // 6. Add test USDC button on a restored burner (no auto fund)
  const c2 = await b.newContext({ viewport: { width: 1440, height: 1000 } }), q = await c2.newPage();
  q.on('response', async (r) => { if (/\/api\/faucet$/.test(new URL(r.url()).pathname) && r.status() === 200) { try { txs.faucet = (await r.json()).signature; } catch (_) {} } });
  await q.goto(BASE, { waitUntil: 'domcontentloaded' });
  await q.evaluate(() => { const k = crypto.getRandomValues(new Uint8Array(32)); localStorage.setItem('hourly.wallet', '__burner__'); localStorage.removeItem('hourly.burner'); });
  await q.goto(BASE + '#trade', { waitUntil: 'networkidle' }); await q.waitForSelector('#pf-faucet', { timeout: 60000 });
  await q.click('#pf-faucet'); await q.waitForSelector('.modal .btn.default', { timeout: 120000 });
  const ft = (await q.innerText('.modal')).replace(/\s+/g, ' '); await q.screenshot({ path: `${D}/add-usdc.png` });
  step('Add test USDC funds the wallet', /Added test USDC/.test(ft) && !!txs.faucet, txs.faucet || ft.slice(0, 120));
  step('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));
  await b.close();
  fs.writeFileSync(`${D}/txs.json`, JSON.stringify(txs, null, 2));
  console.log(JSON.stringify(txs, null, 2));
  console.log(`${res.filter((r) => r.ok).length}/${res.length} passed`);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
