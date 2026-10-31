// 0.19.0: a machine in a bank goes down -> preview window (best fit picked, TD can pick another) -> Apply; Banks tab
// ⚠ when two banks share a machine at the same game number, with Fix.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const out = process.argv[2] || '.';
const T = F.finalsA;
T.status = 'started';
const ids = T.arenas.map(a => a.arenaId);
T.banks = [{ bankId: 1, name: 'Bank 1', status: 'active', arenaIds: [ids[0], ids[1], ids[2]] }, { bankId: 2, name: 'Bank 2', status: 'active', arenaIds: [ids[3], ids[0], ids[4]] }, { bankId: 3, name: 'Bank 3', status: 'active', arenaIds: [ids[5], ids[6], ids[7]] }];
T.arenas.forEach(a => { a.tournamentArena = { status: 'active' }; });
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: T, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json([]); if (p.match(/\/rounds$/)) return json({ data: [] }); if (p.match(/\/games$/)) return json({ data: [], meta: { last_page: 1 } });
    return json({ data: [] }); });
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280073/edit">Edit</a><h1>A Finals</h1><div>Group elimination bracket</div><div class="justify-between"><button>Add bank</button></div><div class="grid">banks</div></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280073/banks');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(4000);
  // no clash yet
  console.log('clash row before:', await page.evaluate(() => { const h = document.getElementById('tdp-bankbar'); return h ? /⚠/.test(h.shadowRoot.textContent) : 'no bar'; }));
  // the first game goes down (it's in Bank 1 game 1 and Bank 2 game 2)
  await page.evaluate(async () => { TDP.jobs.start = async (t, s) => { window.__job = { t, s }; }; TDP.data.D.t.arenas[0].tournamentArena.status = 'inactive'; await TDP.smart.downCheck(); });
  await page.waitForTimeout(1500);
  const pv = await page.evaluate(() => { const h = document.getElementById('tdp-downpv'); return h ? h.shadowRoot.querySelector('.dlg').innerText.replace(/\n+/g, ' | ').slice(0, 500) : 'no window'; });
  console.log('preview:', pv);
  // pick the 2nd option for the first bank, then Apply
  await page.evaluate(() => { const r = document.getElementById('tdp-downpv').shadowRoot, s = r.querySelector('select[data-k="0"]'); s.value = s.options[1].value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: out + '/downpv.png' });
  await page.evaluate(() => document.getElementById('tdp-downpv').shadowRoot.querySelector('[data-act=apply]').click());
  await page.waitForTimeout(300);
  console.log('job:', await page.evaluate(() => JSON.stringify(window.__job && window.__job.s[0].args.changes.map(c => [c.bank, c.down, '->', c.repl, c.arenas.join('>')]))));
  // a clash: Bank 3 gets the 2nd game of Bank 1 at game 2
  await page.evaluate(() => { const D = TDP.data.D; D.t.arenas[0].tournamentArena.status = 'active'; D.t.banks[2].arenaIds[1] = D.t.banks[0].arenaIds[1]; TDP.inpage.render(); });
  await page.waitForTimeout(300);
  console.log('clash row:', await page.evaluate(() => { const h = document.getElementById('tdp-bankbar'); const t = h ? h.shadowRoot.textContent : ''; return (t.match(/⚠[^-]*/) || ['none'])[0]; }));
  await page.evaluate(() => { window.__job = null; document.getElementById('tdp-bankbar').shadowRoot.querySelector('[data-act=clashfix]').click(); });
  await page.waitForTimeout(300);
  console.log('fix job:', await page.evaluate(() => JSON.stringify(window.__job && window.__job.s.map(x => x.op))));
  console.log('errors', errors);
  await browser.close();
})();
