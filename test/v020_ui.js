// 0.20.0 (item 69): Match Play's own page data (its store) is read first - the group's Assign Bank/Order button shows
// at once even with a slow API, page changes redraw without the API, and a page without usable data falls back to it.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const pageJs = fs.readFileSync(path.join(__dirname, '../src/page.js'), 'utf8');
const NOSTORE = process.env.NOSTORE === '1';
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const q = F.qual; q.arenaAssignment = 'manual_banks'; q.status = 'started'; q.test = true;
  q.banks = [0, 1, 2].map(b => ({ bankId: 900 + b, tournamentId: 280051, name: 'Bank ' + (b + 1), status: 'active', arenaIds: [q.arenas[b * 2].arenaId, q.arenas[b * 2 + 1].arenaId] }));
  F.rounds.forEach(r => { r.status = 'completed'; r.tournamentId = 280051; }); F.rounds.push({ roundId: 3, tournamentId: 280051, name: 'Round 3', index: 2, status: 'started' });
  let gid = 500; const games = [];
  for (let set = 0; set < 2; set++) for (let idx = 0; idx < 2; idx++) games.push({ gameId: gid++, tournamentId: 280051, roundId: 3, arenaId: set === 0 ? q.arenas[idx].arenaId : null, bankId: set === 0 ? 900 : null, set, index: idx, status: 'started', bye: false, playerIds: [600000 + set * 4, 600001 + set * 4, 600002 + set * 4, 600003 + set * 4], resultPositions: [null, null, null, null], suggestions: [] });
  const calls = [];
  await page.route('https://api.matchplay.events/**', async route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    calls.push(p + u.search); await new Promise(r => setTimeout(r, 2500));   // a slow API
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: q, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds }); if (p.match(/\/games$/)) return json({ data: u.searchParams.get('round') === '3' ? games : [], meta: { last_page: 1 } }); return json({ data: [] }); });
  // Match Play's store, in its own shapes
  const S = {
    tournaments: { tournaments: { 280051: (({ players, arenas, banks, linkedTournaments, ...t }) => ({ ...t, managers: [] }))(q) } },
    players: { players: Object.fromEntries(q.players.map(({ tournamentPlayer, ...p }) => [p.playerId, p])) },
    tournamentPlayers: { tournaments: { 280051: q.players.map(p => p.playerId) }, tournamentPlayers: Object.fromEntries(q.players.map(p => [`280051-${p.playerId}`, { tournamentId: 280051, playerId: p.playerId, ...p.tournamentPlayer }])) },
    arenas: { arenas: Object.fromEntries(q.arenas.map(({ tournamentArena, ...a }) => [a.arenaId, a])) },
    tournamentArenas: { tournaments: { 280051: q.arenas.map(a => a.arenaId) }, tournamentArenas: Object.fromEntries(q.arenas.map(a => [`280051-${a.arenaId}`, { tournamentId: 280051, arenaId: a.arenaId, ...a.tournamentArena }])) },
    banks: { banks: Object.fromEntries(q.banks.map(b => [b.bankId, b])) },
    rounds: { rounds: Object.fromEntries(F.rounds.map(r => [r.roundId, r])) },
    games: { games: Object.fromEntries(games.map(g => [g.gameId, g])) },
    standings: { standings: {} }, tournamentStandings: { tournamentStandings: {} },
    linkedTournaments: { playoff: { 280051: q.linkedTournaments }, qualifying: {} },
    bootData: { bootData: { currentUserId: F.me.userId, firstName: 'Clark', lastName: 'McCoy' } },
  };
  const grp = n => `<div class="card" style="background:#fff;margin:12px 0"><table><thead><tr><th>Group ${n}</th><th>Tot.</th></tr></thead><tbody><tr><td>a</td><td>0</td></tr></tbody></table></div>`;
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><div id="app"><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div><div><button>Display round…</button><button>Refresh</button><button>Start next round</button></div>${grp(1)}${grp(2)}</main></div></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051/matches');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  if (!NOSTORE) await page.evaluate(st => {   // a React root holding a Redux-like store
    let state = st; const subs = new Set();
    window.__store = { getState: () => state, subscribe: f => { subs.add(f); return () => subs.delete(f); }, set: fn => { state = fn(state); subs.forEach(f => f()); } };
    document.getElementById('app')['__reactContainer$test'] = { memoizedProps: {}, child: { memoizedProps: { store: window.__store } } };
  }, S);
  await page.addScriptTag({ content: pageJs });
  const t0 = Date.now();
  await page.addScriptTag({ content: bundle });
  await page.waitForFunction(() => document.querySelector('[data-tdp=abtn]'), null, { timeout: 30000 });
  const ms = Date.now() - t0;
  console.log(`Assign Bank/Order shown after ${ms} ms (API answers take 2.5 s each)`, NOSTORE ? '' : (ms < 2000 ? 'OK' : 'SLOW'));
  console.log('button on:', await page.evaluate(() => [...document.querySelectorAll('[data-tdp=abtn]')].map(b => b.closest('th').innerText)));
  await page.waitForTimeout(8000);
  const g3 = () => calls.filter(c => /games\?round=3/.test(c)).length;
  console.log('API calls for round 3 games:', g3(), NOSTORE ? '(no page data: from the API)' : '(expect 0: the page has them)');
  if (!NOSTORE) {
    // Match Play's page changes: group 2 gets a bank -> the button goes, no API call
    const before = calls.length;
    await page.evaluate(() => window.__store.set(s => ({ ...s, games: { games: Object.fromEntries(Object.values(s.games.games).map(g => [g.gameId, g.set === 1 ? { ...g, bankId: 901, arenaId: 1 } : g])) } })));
    await page.waitForFunction(() => !document.querySelector('[data-tdp=abtn]'), null, { timeout: 3000 }).then(() => console.log('page change: button gone straight away OK'), () => console.log('page change: button still there FAIL'));
    console.log('API calls for that change:', calls.length - before);
    // a new round appears on the page (e.g. started on a phone)
    await page.evaluate(() => window.__store.set(s => ({ ...s, rounds: { rounds: { ...s.rounds.rounds, 4: { roundId: 4, tournamentId: 280051, name: 'Round 4', index: 3, status: 'started', createdAt: new Date().toISOString() } } } })));
    await page.waitForTimeout(600);
    console.log('rounds seen:', await page.evaluate(() => TDP.data.D.rounds.map(r => r.name).join(', ')));
    console.log('roundGames from page:', await page.evaluate(async () => (await TDP.data.roundGames(280051, 3)).length), '| shared copy:', await page.evaluate(async () => { const o = await TDP.page.shared(280051); return o ? o.t.name : 'none'; }));
  }
  console.log('errors', errors); await browser.close();
})();
