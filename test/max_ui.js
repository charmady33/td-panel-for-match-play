// items 105-112: max match play. Mock Matches tab (Active / Remaining games cards, Create matches + its window, the
// waiting list). Checks: round options gone, Auto create box + the two number boxes, auto create only when it should,
// "Waiting for" note, progress "x of 10", Fill random results count, the Create matches driver (made / No games created).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const TID = 282684, DUR = 4;
const players = Array.from({ length: 8 }, (_, i) => ({ playerId: 700 + i, name: 'Player ' + (i + 1), tournamentPlayer: { status: 'active', labels: [] } }));
const arenas = Array.from({ length: 6 }, (_, i) => ({ arenaId: 900 + i, name: 'Game ' + (i + 1), categoryId: 2, tournamentArena: { status: 'active' } }));
const T0 = { tournamentId: TID, name: 'max test', status: 'started', type: 'max_matchplay', test: true, organizerId: 22114, maxMatchplayDuration: DUR, maxMatchplayMaxActive: 0, arenaAssignment: 'balanced', players, arenas, banks: [], linkedTournaments: [], playoffsCutoffs: [] };
let gid = 1;
const G = (a, b, arena, status) => ({ gameId: gid++, roundId: 0, set: 0, index: gid, tournamentId: TID, arenaId: 900 + arena, status, playerIds: [700 + a, 700 + b], resultPositions: status === 'completed' ? [700 + a, 700 + b] : [null, null], bye: false, startedAt: new Date().toISOString(), duration: status === 'completed' ? 600 : null, suggestions: [] });
let games = [];
function scenario(k) {
  gid = 1;
  if (k === 'pairable') {   // 2 active; 4 waiting (P1-P4), P1-P2 and P3-P4 played, P1-P3 not yet
    games = [G(0, 1, 0, 'completed'), G(2, 3, 1, 'completed'), G(4, 5, 2, 'started'), G(6, 7, 3, 'started')];
  } else if (k === 'stuck') {   // waiting P1,P2 have played each other
    games = [G(0, 1, 0, 'completed'), G(2, 3, 1, 'started'), G(4, 5, 2, 'started'), G(6, 7, 3, 'started')];
  } else if (k === 'end') {   // P1-P6 played all 4 (P1..P6 round robin pieces), P7 3 + playing, P8 2 waiting with only rematches
    const done = [[0, 1], [2, 3], [4, 5], [0, 2], [1, 3], [4, 6], [0, 3], [1, 2], [5, 6], [0, 4], [1, 5], [2, 4], [3, 5], [7, 0], [7, 1]];
    games = done.map(([a, b], i) => G(a, b, i % 6, 'completed')).concat([G(6, 3, 4, 'started')]);
  }
}
scenario('pairable');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: { userId: 22114, name: 'Clark McCoy' } });
    if (p === `/api/tournaments/${TID}`) return json({ data: T0 });
    if (p.match(/\/rounds$/)) return json({ data: [] }); if (p.match(/\/standings$/)) return json([]);
    if (p.match(/\/games$/)) return json({ data: games });
    return json({ data: [] }); });
  const HTML = () => {
    const act = games.filter(g => g.status === 'started'), playing = new Set(act.flatMap(g => g.playerIds));
    return `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/${TID}/edit">Edit</a><h1>max test</h1><div>Max match play</div>
    <div style="display:flex;gap:12px"><div><dl><dt>Active games</dt><dd id="ag">${act.length}</dd></dl></div><div><dl><dt>Remaining games</dt><dd>7</dd></dl></div></div>
    <div><div><button id="cm">Create matches</button><button>Refresh</button></div></div>
    <div id="cards">${act.map(g => `<div class="overflow-hidden shadow"><h3><a href="/tournaments/${TID}/arenas/${g.arenaId}">Game ${g.arenaId - 899}</a></h3><ul><li><div><a href="/tournaments/${TID}/players/${g.playerIds[0]}">Player ${g.playerIds[0] - 699}</a></div></li><li><div><a href="/tournaments/${TID}/players/${g.playerIds[1]}">Player ${g.playerIds[1] - 699}</a></div></li></ul><button>Enter results</button><a href="/tournaments/${TID}/matches/${g.gameId}">View details</a></div>`).join('')}</div>
    <h4>1 match</h4><ul id="wl">${players.map(p => `<li><div><a href="/tournaments/${TID}/players/${p.playerId}">${p.name}</a></div><div class="text-xs"><span>${playing.has(p.playerId) ? 'Currently playing' : 'Last match 2 minutes ago'}</span></div></li>`).join('')}</ul></main>
    <template id="tpl"><div role="dialog"><h2>Create matches</h2><label>Number of matches<select name="gameLimit" id="gameLimit"><option value="0">No limit</option><option value="1">1 match</option></select></label><select id="categoryId" name="categoryId"><option value="0">All arenas</option><option value="4">Category A</option></select><label><input type="checkbox"> Emergency valve: Force matches to be created</label><button>Cancel</button><button id="go">Create matches</button></div></template>
    <template id="none"><div role="dialog"><h2>No games created</h2><p>Games can't be created. No players could be paired with each other.</p><button>Okay</button></div></template>
    <script>
      document.getElementById('cm').onclick = () => { document.body.appendChild(document.getElementById('tpl').content.cloneNode(true)); const d = document.querySelector('[role=dialog]'); d.querySelector('#go').onclick = () => { window.__made = { limit: d.querySelector('#gameLimit').value, cat: d.querySelector('#categoryId').value, valve: d.querySelector('input[type=checkbox]').checked }; d.remove(); if (window.__noneNext) setTimeout(() => { document.body.appendChild(document.getElementById('none').content.cloneNode(true)); const n = document.querySelector('[role=dialog]'); n.querySelector('button').onclick = () => n.remove(); }, 300); }; };
    </script></body></html>`;
  };
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML() }));
  await page.goto(`https://app.matchplay.events/tournaments/${TID}/matches`);
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(4000);
  await page.evaluate(() => { window.__jobs = []; TDP.jobs.start = async (t, s) => { window.__jobs.push({ t, s: s.map(x => x.op + ' ' + JSON.stringify(x.args)) }); }; });
  const shadow = (id, sel) => page.evaluate(([id, sel]) => { const h = document.getElementById(id); const e = h && h.shadowRoot.querySelector(sel); return e ? e.innerText.replace(/\s+/g, ' ') : null; }, [id, sel]);
  let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
  // 105: the round options are gone; Auto create box instead
  const box = await shadow('tdp-auto', '.card');
  ok(box && /Auto create matches/.test(box) && !/Auto close round/.test(box) && !/New rounds use/.test(box), '105/106 box: ' + box);
  ok(/Fill random results/.test(box || ''), '108 fill row in the box (test tournament)');
  ok(!!(await shadow('tdp-max-below', 'label')) && !!(await shadow('tdp-max-stop', 'label')), '106 boxes under Active / Remaining: ' + (await shadow('tdp-max-below', 'label')) + ' | ' + (await shadow('tdp-max-stop', 'label')));
  // 109 progress on the waiting list
  const prog = await page.evaluate(() => [...document.querySelectorAll('#wl [data-tdp=prog]')].map(s => s.textContent).join('|'));
  ok(/ · 1 of 4/.test(prog) && / · 0 of 4/.test(prog), '109 progress: ' + prog);
  // 106 off by default: nothing created
  await page.evaluate(() => TDP.maxmp.tick(TDP.data.D)); await page.waitForTimeout(300);
  ok((await page.evaluate(() => window.__jobs.length)) === 0, '106 off by default: no job');
  // on, N=3: 2 active < 3, waiting P1-P4 with a new pair -> job
  await page.evaluate(async () => { await TDP.saveT(282684, { maxAuto: true, maxBelow: 3, maxStop: 0 }); await TDP.maxmp.tick(TDP.data.D); });
  ok((await page.evaluate(() => JSON.stringify(window.__jobs))).includes('createMatches'), '106 below N with a pair -> Create matches job: ' + await page.evaluate(() => JSON.stringify(window.__jobs)));
  // N=2: 2 active, not below -> nothing
  await page.evaluate(async () => { window.__jobs = []; await TDP.saveT(282684, { maxBelow: 2 }); await new Promise(r => setTimeout(r, 8100)); await TDP.maxmp.tick(TDP.data.D); });
  ok((await page.evaluate(() => window.__jobs.length)) === 0, '106 at N: no job');
  // stop at remaining: stop = 99 -> nothing
  await page.evaluate(async () => { await TDP.saveT(282684, { maxBelow: 5, maxStop: 99 }); await TDP.maxmp.tick(TDP.data.D); });
  ok((await page.evaluate(() => window.__jobs.length)) === 0, '106 remaining <= stop: no job · ' + await shadow('tdp-auto', '.card'));
  // stuck: the only 2 waiting played each other -> nothing
  scenario('stuck');
  await page.evaluate(async () => { await TDP.saveT(282684, { maxBelow: 5, maxStop: 0 }); await TDP.data.refresh(true); await TDP.maxmp.tick(TDP.data.D); });
  ok((await page.evaluate(() => window.__jobs.length)) === 0, '106 waiting players played each other: no job · ' + await shadow('tdp-auto', '.card'));
  // 107: end of the event - the Waiting for note
  scenario('end');
  await page.evaluate(async () => { await TDP.data.refresh(true); TDP.inpage.render(); });
  await page.waitForTimeout(300);
  const note = await shadow('tdp-auto', '.card');
  ok(/Waiting for 2 players/.test(note || '') && /Player 7 \(2 of 4, playing now\)/.test(note || '') && /Player 8 \(2 of 4, waiting - only rematches left\)/.test(note || ''), '107 note: ' + note);
  // 108: fill count
  await page.evaluate(async () => { window.__jobs = []; const h = document.getElementById('tdp-auto').shadowRoot; const i = h.querySelector('[data-f=maxFillN]'); i.value = '1'; i.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 200)); h.querySelector('[data-act=maxFill]').click(); await new Promise(r => setTimeout(r, 300)); });
  ok((await page.evaluate(() => JSON.stringify(window.__jobs))).includes('fillMax {\\"tid\\":282684,\\"count\\":1}'), '108 fill job: ' + await page.evaluate(() => JSON.stringify(window.__jobs)));
  // 110: a machine goes down under an active game -> the down-machine window, rows by player names
  T0.arenas[4].tournamentArena = { status: 'inactive' };
  await page.evaluate(async () => { await TDP.data.refresh(true); await TDP.smart.downCheck(); await new Promise(r => setTimeout(r, 500)); });
  const dpv = await shadow('tdp-downpv', 'table');
  ok(/Player 7 vs Player 4/.test(dpv || '') && /Best/.test(dpv || ''), '110 down window: ' + dpv);
  // the Create matches driver: made, then "No games created"
  const r1 = await page.evaluate(async () => { const r = await TDP.mp.createMatches(); return { r, made: window.__made }; });
  ok(r1.r === true && r1.made.limit === '0' && r1.made.cat === '0' && r1.made.valve === false, 'driver made: ' + JSON.stringify(r1));
  const r2 = await page.evaluate(async () => { window.__noneNext = true; const r = await TDP.mp.createMatches(); return { r, open: !!document.querySelector('[role=dialog]') }; });
  ok(r2.r === false && !r2.open, 'driver No games created -> false, popup closed: ' + JSON.stringify(r2));
  console.log('errors', errors);
  console.log(fails ? `${fails} FAILED` : 'all passed');
  await browser.close();
  if (fails) process.exit(1);
})();
