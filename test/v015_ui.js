// 0.15.0: Matches tab group estimate + game timers, Stats → Rounds "Max est.", on/off switch, no optional ties box.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const out = process.argv[2] || '.';
// round 2: group 1's second game still being played, started 3 minutes ago
const now = Date.now();
F.games.forEach(g => { if (g.roundId === 2) g.startedAt = new Date(now - 20 * 60e3).toISOString(); });
const g4 = F.games.find(g => g.roundId === 2 && g.set === 0 && g.index === 1); g4.status = 'started'; g4.duration = null; g4.suggestions = [];
const g2 = F.games.find(g => g.roundId === 2 && g.set === 0 && g.index === 0); g2.duration = 17 * 60;
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds });
    if (p.match(/\/games$/)) { const r = u.searchParams.get('round'); return json({ data: F.games.filter(x => !r || x.roundId === +r), meta: { last_page: 1 } }); }
    return json({ data: [] }); });
  const am = Object.fromEntries(F.qual.arenas.map(a => [a.arenaId, a.name]));
  const group = (set) => { const gs = F.games.filter(g => g.roundId === 2 && g.set === set).sort((a, b) => a.index - b.index); const ps = gs[0].playerIds;
    return `<table><thead><tr><th class="truncate">Group ${set + 1}</th><th>Tot.</th>${gs.map(g => `<th><div class="truncate">${am[g.arenaId] || 'Game'}</div></th>`).join('')}</tr></thead><tbody>${ps.map(p => `<tr><th><a href="/tournaments/280051/players/${p}">P${p}</a></th><td>0</td>${gs.map(() => '<td>P1</td>').join('')}</tr>`).join('')}<tr><td>Actions</td><td></td>${gs.map(g => `<td><button>Results</button><a href="/tournaments/280051/matches/${g.gameId}">Details</a></td>`).join('')}</tr></tbody></table>`; };
  const MATCHES = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div><div>Round 2</div>${group(0)}${group(1)}</main></body></html>`;
  const STATS = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div><table><thead><tr><th>Round</th><th>Created</th><th>Duration</th><th>Game count</th></tr></thead><tbody><tr><td>Total</td><td></td><td>1:40</td><td>28</td></tr><tr><td>Average</td><td></td><td>0:50</td><td>14</td></tr><tr><td>Round 1</td><td>x</td><td>0:55</td><td>14</td></tr><tr><td>Round 2</td><td>x</td><td>0:45</td><td>14</td></tr></tbody></table></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: route.request().url().includes('/stats') ? STATS : MATCHES }));
  await page.goto('https://app.matchplay.events/tournaments/280051/matches');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(6000);
  const heads = () => page.evaluate(() => [...document.querySelectorAll('main thead tr')].map(tr => [...tr.children].map(th => th.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ')).join('\n'));
  const h1 = await heads(); await page.waitForTimeout(2100); const h2 = await heads();
  console.log('matches heads:\n' + h1 + '\n(2 s later)\n' + h2);
  console.log('saved est:', JSON.stringify(await page.evaluate(() => TDP.tstate[280051].est)));
  await page.screenshot({ path: out + '/timers.png' });
  // the estimate doesn't change later (times change -> saved value stays)
  const keep = await page.evaluate(() => { const r = TDP.timers.groupEst(TDP.data.D, 2); return JSON.stringify(r); });
  console.log('again:', keep);
  // on/off
  await page.evaluate(() => { TDP.settings.off = true; TDP.sharedListeners.forEach(f => f()); }); await page.waitForTimeout(800);
  console.log('off: our elements left =', await page.evaluate(() => document.querySelectorAll('[data-tdp], [id^="tdp-"]').length));
  await page.evaluate(() => { TDP.settings.off = false; TDP.sharedListeners.forEach(f => f()); }); await page.waitForTimeout(4000);
  console.log('on again: timers =', await page.evaluate(() => document.querySelectorAll('[data-tdp="timer"]').length));
  // stats
  await page.evaluate(() => { history.pushState(null, '', '/tournaments/280051/stats/rounds'); });
  await page.goto('https://app.matchplay.events/tournaments/280051/stats/rounds');
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(6000);
  console.log('stats:\n' + await page.evaluate(() => [...document.querySelectorAll('main tr')].map(tr => [...tr.children].map(c => c.innerText.trim()).join(' | ')).join('\n')));
  console.log('errors', errors);
  await browser.close();
})();
