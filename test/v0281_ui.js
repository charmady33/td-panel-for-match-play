// 0.28.1: Stats → Rounds "Max est." counts machine waits (item 107); one round picked shows each game's "Est."
// (item 108); Stats → Plays "Games played" row adds up each column (item 106).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
// round 1: groups 1 and 2 both start on the same machine (group 2 has to wait for it)
const r1 = F.games.filter(g => g.roundId === 1);
const g10 = r1.find(g => g.set === 0 && g.index === 0), g20 = r1.find(g => g.set === 1 && g.index === 0);
g20.arenaId = g10.arenaId;
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) fails++; };
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
  const rows1 = r1.slice().sort((a, b) => (a.index - b.index) || (a.set - b.set)).map((g, i) => `<tr><td>#${i + 1}</td><td>${am[g.arenaId]}</td><td>0:10</td><td>0:03</td><td>4</td></tr>`).join('');
  const ROUND = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div><table><thead><tr><th>#</th><th>Arena</th><th>Duration</th><th>Duration/player</th><th>Player count</th></tr></thead><tbody>${rows1}</tbody></table></main></body></html>`;
  const ALL = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div><table><thead><tr><th>Round</th><th>Created</th><th>Duration</th><th>Game count</th></tr></thead><tbody><tr><td>Round 1</td><td>x</td><td>0:55</td><td>14</td></tr><tr><td>Round 2</td><td>x</td><td>0:45</td><td>14</td></tr><tr><td>Total</td><td></td><td>1:40</td><td>28</td></tr></tbody></table></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: route.request().url().includes('roundId=') ? ROUND : ALL }));
  const rowsText = () => page.evaluate(() => [...document.querySelectorAll('main tr')].map(tr => [...tr.children].map(c => c.innerText.trim()).join(' | ')).join('\n'));
  // all rounds
  await page.goto('https://app.matchplay.events/tournaments/280051/stats/rounds');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(6000);
  console.log('all rounds:\n' + await rowsText());
  const info = await page.evaluate(([a, b]) => {
    const D = TDP.data.D, est = TDP.timers.groupEst(D, 1);
    return { est, have: D.games.filter(g => g.roundId === 1).length };
  }, [g10.arenaId, g20.arenaId]);
  console.log('round 1 group estimates', JSON.stringify(info.est), 'games', info.have);
  ok(info.est['1'] > 0 && info.est['0'] > 0, 'round 1 has group estimates (older round fetched)');
  const all = await rowsText();
  ok(/Round 1 \| x \| 0:55 \| \d+ min/.test(all), 'Round 1 Max est. filled');
  ok(/Total \|\s*\| 1:40 \| \d+ min/.test(all), 'Total filled');
  // one round
  await page.goto('https://app.matchplay.events/tournaments/280051/stats/rounds?roundId=1');
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(6000);
  const one = await rowsText(); console.log('round 1 picked:\n' + one);
  ok(/^# \| Arena \| Duration \| Est\./m.test(one), 'header says Est.');
  ok(one.split('\n').slice(1).every(l => /\| \d+ min \|/.test(l)), 'every game row has its estimate');
  const titles = await page.evaluate(() => [...document.querySelectorAll('td[data-tdp="timer"]')].map(td => td.title));
  console.log('titles', titles.slice(0, 3));
  // group 1: Eye Of The Tiger 10 + Far Out 9 = 19; group 2 waits for Eye Of The Tiger (10 + 1 min) then 10 + 9 = 30
  ok(titles[0] === 'Group 1: 19 min estimated' && titles[1].startsWith('Group 2: 30 min estimated'), "group 2's estimate counts its wait for the shared machine");
  ok(titles.some(t => /Max est\./.test(t)) && titles.every(t => /^Group \d+: \d+ min estimated/.test(t)), 'hover shows the group and marks the longest');
  console.log('errors', errors); ok(!errors.length, 'no page errors');
  await browser.close();
  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
