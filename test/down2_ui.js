// 0.25.0 (items 91, 96): a machine goes down under a game being played, no banks -> the window with Best (default),
// Random and pick; Apply moves the game
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const out = process.argv[2] || '.';
const q = F.qual; q.status = 'started'; q.arenaAssignment = 'automatic'; q.banks = [];
q.arenas.forEach(a => { a.tournamentArena = { status: 'active' }; });
const r2 = F.games.filter(g => g.roundId === 2);
const g = r2.find(x => x.set === 3) || r2[r2.length - 1]; g.status = 'started'; g.resultPositions = [null, null, null, null]; g.duration = null;
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: q, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds }); if (p.match(/\/games$/)) return json({ data: F.games, meta: { last_page: 1 } }); return json({ data: [] }); });
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><main><a href="/tournaments/280051/edit">Edit</a><h1>q</h1><div>matches</div></main></body></html>' }));
  await page.goto('https://app.matchplay.events/tournaments/280051/matches');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(4000);
  const downName = await page.evaluate(id => { TDP.jobs.start = async (t, s) => { window.__job = { t, s }; }; const a = TDP.data.D.t.arenas.find(x => x.arenaId === id); a.tournamentArena.status = 'inactive'; TDP.smart.downCheck(); return a.name; }, g.arenaId);
  await page.waitForTimeout(1500);
  console.log('down:', downName, '| window:', await page.evaluate(() => { const h = document.getElementById('tdp-downpv'); return h ? h.shadowRoot.querySelector('.dlg').innerText.replace(/\n+/g, ' | ').slice(0, 400) : 'none'; }));
  console.log('options:', await page.evaluate(() => { const s = document.getElementById('tdp-downpv').shadowRoot.querySelector('select[data-l]'); return [...s.options].slice(0, 4).map(o => (o.selected ? '*' : '') + o.text).join(' / '); }));
  await page.screenshot({ path: out + '/down-loose.png' });
  await page.evaluate(() => document.getElementById('tdp-downpv').shadowRoot.querySelector('[data-act=apply]').click()); await page.waitForTimeout(300);
  console.log('job:', await page.evaluate(() => JSON.stringify(window.__job && window.__job.s.map(x => x.op + ' ' + JSON.stringify(x.args.items || x.args.changes)))));
  console.log('errors', errors); await browser.close();
})();
