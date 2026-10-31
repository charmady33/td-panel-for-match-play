// 0.16.1: "New rounds use" dropdown, redo of a round started elsewhere (game time / category), live events refresh,
// Start next round window opens with the default.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const out = process.argv[2] || '.';
// round 3 just started "on a phone": games with Matchplay's random arenas, no scores
const now = Date.now();
F.rounds.forEach(r => { r.status = 'completed'; });
F.rounds.push({ roundId: 3, name: 'Round 3', index: 2, status: 'started', createdAt: new Date(now - 60e3).toISOString().replace('T', ' ').replace(/\.\d+Z/, 'Z'), completedAt: null });
const r2 = F.games.filter(g => g.roundId === 2);
let gid = 900;
for (const g of r2) F.games.push({ ...g, gameId: gid++, roundId: 3, status: 'started', resultPositions: [], resultPoints: [], suggestions: [], duration: null, startedAt: new Date(now - 60e3).toISOString() });
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {   // a fake Matchplay real-time socket the test can push events through
    window.__sockets = [];
    window.WebSocket = class { constructor(u) { this.url = u; this.readyState = 0; this.sent = []; window.__sockets.push(this); setTimeout(() => { this.readyState = 1; this.onmessage && this.onmessage({ data: JSON.stringify({ event: 'pusher:connection_established', data: '{"socket_id":"1.1","activity_timeout":30}' }) }); }, 50); }
      send(m) { this.sent.push(JSON.parse(m)); } close() { this.readyState = 3; } };
  });
  let gameCalls = 0;
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds });
    if (p.match(/\/games$/)) { gameCalls++; const r = u.searchParams.get('round'); return json({ data: F.games.filter(x => !r || x.roundId === +r), meta: { last_page: 1 } }); }
    return json({ data: [] }); });
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div><div><div><button>Refresh</button><button id="snr">Start next round</button></div></div><div><h3>Round 3</h3><button>Actions</button></div></main>
    <template id="tpl"><div id="dlg" role="dialog"><h2>Start next round</h2><select id="categoryId" name="categoryId"><option value="0">Any category</option><option value="-1">Don't draw arenas</option><option value="1">Electro-mechanical</option><option value="2">Solid state</option><option value="3">DMD</option></select><label><input type="checkbox" checked> Publish round immediately (recommended)</label><button>Start round</button><button>Cancel</button></div></template>
    <script>document.getElementById('snr').onclick = () => { document.body.appendChild(document.getElementById('tpl').content.cloneNode(true)); };</script></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051/matches');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(5000);
  console.log('subscribed:', await page.evaluate(() => window.__sockets.map(s => s.sent.filter(m => m.event === 'pusher:subscribe').map(m => m.data.channel).join(',')).join(' | ')));
  // the dropdown
  const opts = await page.evaluate(() => { const s = document.getElementById('tdp-auto').shadowRoot.querySelector('[data-act=roundType]'); return s ? [...s.options].map(o => o.value).join(',') : 'none'; });
  console.log('dropdown:', opts);
  // choose game time; the rounds already there (1-3) are left alone
  await page.evaluate(async () => { const s = document.getElementById('tdp-auto').shadowRoot.querySelector('[data-act=roundType]'); s.value = 'smart'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(500);
  console.log('saved:', await page.evaluate(() => JSON.stringify({ t: TDP.tstate[280051].roundType, known: TDP.tstate[280051].knownRounds })));
  // pretend round 3 is new (started on a phone after picking the default), then a live event arrives
  let calls0 = gameCalls;
  await page.evaluate(async () => { await TDP.saveT(280051, { knownRounds: [1, 2], localStartAt: 0 }); TDP.jobs.start = async (t, s) => { window.__job = { t, s }; }; });
  const t0 = Date.now();
  await page.evaluate(() => { const s = window.__sockets[window.__sockets.length - 1]; s.onmessage({ data: JSON.stringify({ event: 'App\\Events\\RoundCreatedOrUpdated', channel: 'tournaments.280051', data: '{"roundId":3}' }) }); });
  await page.waitForFunction(() => window.__job, null, { timeout: 15000 }).catch(() => {});
  console.log(`redo job after ${Date.now() - t0} ms:`, await page.evaluate(() => JSON.stringify(window.__job && { t: window.__job.t, s: window.__job.s.map(x => x.op + ' ' + JSON.stringify(x.args)) })), '| games fetched again:', gameCalls > calls0);
  // category default: clear + assign arenas EM
  await page.evaluate(async () => { window.__job = null; await TDP.saveT(280051, { knownRounds: [1, 2], roundType: 'cat2' }); await TDP.rounds.guard(async () => true); });
  console.log('category redo:', await page.evaluate(() => JSON.stringify(window.__job && window.__job.s.map(x => x.op + ' ' + JSON.stringify(x.args)))));
  // a round with a score already: left alone
  await page.evaluate(async () => { window.__job = null; }); F.games.filter(g => g.roundId === 3)[0].suggestions = [{ createdAt: new Date().toISOString() }];
  await page.evaluate(async () => { await TDP.saveT(280051, { knownRounds: [1, 2] }); await TDP.data.refresh(true); await TDP.rounds.guard(async () => true); });
  console.log('with a score:', await page.evaluate(() => JSON.stringify(window.__job)), '(null = left alone)');
  // the Start next round window opens with the default (Solid state)
  await page.click('#snr'); await page.waitForTimeout(800);
  console.log('start window picks:', await page.evaluate(() => document.getElementById('categoryId').value));
  console.log('errors', errors);
  await browser.close();
})();
