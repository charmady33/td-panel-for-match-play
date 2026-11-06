// items 101/102/104: auto close + start never starts a round twice (this tab lagging behind Match Play), "Start now"
// on the countdown, and every earlier round's games before games are picked (a deleted round's left out)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
F.games.filter(g => g.roundId === 2).forEach(g => { g.status = 'completed'; g.duration = g.duration || 600; g.resultPositions = g.playerIds; });
const stale = JSON.parse(JSON.stringify(F.rounds));   // what the tab saw: round 2 still open
const fresh = JSON.parse(JSON.stringify(F.rounds)); fresh[1].status = 'completed'; fresh.push({ roundId: 3, name: 'Round 3', index: 2, status: 'started', createdAt: new Date().toISOString(), completedAt: null });
let roundsNow = stale;
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: roundsNow });
    if (p.match(/\/games$/)) { const r = u.searchParams.get('round'); return json({ data: F.games.filter(x => !r || x.roundId === +r), meta: { last_page: 1 } }); }
    return json({ data: [] }); });
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div><div><button>Refresh</button><button>Close round</button></div><div><h3>Round 2</h3><button>Actions</button></div></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051/matches');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(4000);
  await page.evaluate(() => { TDP.jobs.start = async (t, s) => { window.__job = { t, s }; }; });
  const toast = () => page.evaluate(() => { const h = document.getElementById('tdp-host'); const b = h && h.shadowRoot.querySelector('[data-act=toastNow]'); return b ? b.closest('.toast').innerText.replace(/\s+/g, ' ') : null; });
  // A: Match Play already has round 3 (this tab still shows round 2 open, all approved): nothing starts
  roundsNow = fresh;
  await page.evaluate(async () => { await TDP.saveT(280051, { auto: true, roundType: '' }); TDP.data.refresh(); });
  await page.waitForTimeout(3000);
  const a = { toast: await toast(), job: await page.evaluate(() => window.__job ? window.__job.t : null), tabSees: await page.evaluate(() => TDP.data.D.rounds.map(r => r.roundId + ':' + r.status).join(' ')) };
  console.log('A tab behind Match Play:', JSON.stringify(a), a.toast === null && a.job === null ? 'OK (nothing started)' : 'WRONG');
  // B: round 2 really is the newest: countdown with Start now -> the task starts at once, Start next round only after round 2
  await page.evaluate(async () => { await TDP.saveT(280051, { auto: false }); }); roundsNow = stale;
  await page.evaluate(async () => { await TDP.data.refresh(true); await TDP.saveT(280051, { auto: true }); TDP.data.refresh(true); });
  await page.waitForFunction(() => { const h = document.getElementById('tdp-host'); return h && h.shadowRoot.querySelector('[data-act=toastNow]'); }, null, { timeout: 15000 }).catch(() => {});
  const tt = await toast(), t0 = Date.now();
  await page.evaluate(() => document.getElementById('tdp-host').shadowRoot.querySelector('[data-act=toastNow]').click());
  await page.waitForFunction(() => window.__job, null, { timeout: 5000 }).catch(() => {});
  const job = await page.evaluate(() => window.__job && window.__job.s.map(x => x.op + ' ' + JSON.stringify(x.args)));
  const okB = tt && /Start now/.test(tt) && job && Date.now() - t0 < 3000 && job.some(x => /startNextRound.*"after":2/.test(x));
  console.log('B countdown:', tt, '| job:', JSON.stringify(job), '|', okB ? 'OK' : 'WRONG');
  // 102: only round 2 + a deleted round's games in memory -> ensureHistory brings round 1 back and drops the deleted one
  const h = await page.evaluate(async () => { const D = TDP.data.D; D.games = D.games.filter(g => g.roundId === 2).concat([{ gameId: 1, roundId: 99, arenaId: 126380, set: 0, index: 0, playerIds: [600000] }]); await TDP.data.ensureHistory(280051); return [...new Set(D.games.map(g => g.roundId))].sort().join(','); });
  console.log('102 rounds with games after ensureHistory:', h, h === '1,2' ? 'OK' : 'WRONG');
  console.log('errors', errors);
  await browser.close();
})();
