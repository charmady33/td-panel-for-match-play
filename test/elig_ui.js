const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  F.qual.players[0].tournamentPlayer.labels = ['Sponsor'];   // a label that must be kept
  F.qual.players[1].tournamentPlayer.labels = ['B Ineligible'];  // an old-style label
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds }); if (p.match(/\/games$/)) return json({ data: F.games, meta: { last_page: 1 } }); return json({ data: [] }); });
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><div class="flex"><button>Add players</button><button>Actions</button></div><div class="shadow"><table>${F.qual.players.map(p => `<tr><td><a href="/tournaments/280051/players/${p.playerId}">${p.name}</a></td></tr>`).join('')}</table></div></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051/players');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't', open: false })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(6000);
  console.log('bar:', await page.evaluate(() => { const h = document.getElementById('tdp-elig-bar'); return h ? h.shadowRoot.textContent.replace(/\s+/g, ' ').trim().slice(-160) : 'none'; }));
  // ranks "just loaded", then the task's after-step reopens the window with the cut typed before
  await page.evaluate(async () => { const r = [288,1500,2100,800,3000,1020,4000,1976,1832,284]; await TDP.saveT(280051, { ranks: Object.fromEntries(TDP.data.D.qual.players.slice(0, 10).map((p, i) => [p.playerId, r[i]])) }); await TDP.jobs.afterHandlers.elig({ what: 'elig', cuts: { B: 1000 }, shown: 1 }); });
  await page.waitForTimeout(800);
  console.log('reopened window:', await page.evaluate(() => { const h = document.getElementById('tdp-elig-dlg'); return h ? h.shadowRoot.querySelector('.db').innerText.replace(/\n+/g, ' | ').slice(0, 700) : 'not open'; }));
  console.log('B cut box:', await page.evaluate(() => document.getElementById('tdp-elig-dlg').shadowRoot.querySelector('[data-cut=B]').value));
  await page.screenshot({ path: process.argv[2] + '/elig.png' });
  console.log('errors', errors);
  await browser.close();
})();
