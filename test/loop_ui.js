// 0.24.1: Standings tab (cutoff bar + ties box at the same spot) - TD Panel's blocks settle: no non-stop redraw
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const q = F.qual; q.status = 'started'; q.playoffsCutoffs = [{ index: 0, value: 8, text: 'A FINALS CUTOFF', color: 'green' }, { index: 1, value: 8, text: 'B FINALS CUTOFF', color: 'fuchsia' }];
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 700 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: q, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds }); if (p.match(/\/games$/)) return json({ data: F.games, meta: { last_page: 1 } }); return json({ data: [] }); });
  const rows = F.standings.map(s => `<tr><td>${s.position}</td><td>${(q.players.find(p => p.playerId === s.playerId) || {}).name}</td><td>${s.points}</td></tr>`).join('');
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="height:700px;overflow:auto"><div class="mx-auto"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div class="border-b pt-4"><nav><a class="border-b-2" href="/tournaments/280051">Overview</a><a href="/tournaments/280051/players">Players</a><a href="/tournaments/280051/standings" aria-current="page">Standings</a></nav></div><div><button>Refresh</button></div><div class="flex flex-col"><div><table>${rows}</table></div></div><div style="height:2000px"></div></div></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051/standings');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(6000);
  const r = await page.evaluate(async () => {
    let n = 0; const mo = new MutationObserver(ms => { n += ms.length; }); mo.observe(document.body, { childList: true, subtree: true });
    const m = document.querySelector('main'); m.scrollTop = 900; await new Promise(x => setTimeout(x, 3000)); mo.disconnect();
    return { mutationsIn3s: n, scrollTop: Math.round(m.scrollTop), blocks: ['tdp-cut-bar', 'tdp-ties-standings', 'tdp-elig'].filter(id => document.getElementById(id)) };
  });
  console.log('settled:', JSON.stringify(r), r.mutationsIn3s < 20 && r.scrollTop >= 800 ? 'OK' : 'LOOPING');
  console.log('errors', errors); await browser.close();
})();
