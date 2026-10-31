const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  [1,2,3,4].forEach((i,k)=>{F.standings[i].position=2+k;F.standings[i].manualTiebreakerGroup=7;});   // 2-5 resolved
  F.finalsA.bracketSize = 8; F.finalsB.bracketSize = 8;
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds }); if (p.match(/\/games$/)) return json({ data: F.games, meta: { last_page: 1 } }); return json({ data: [] }); });
  const STAND = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><div class="flex flex-col" style="display:flex;flex-direction:column"><div><div><div><table>${F.standings.slice(0,22).map(s=>`<tr><td>${s.position}</td><td><a href="/tournaments/280051/players/${s.playerId}">P${s.playerId}</a></td><td>${Number(s.points)} pts.</td></tr>`).join('')}</table></div></div></div></div></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => { const u = new URL(route.request().url()); if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"data":[],"meta":{"last_page":1}}' }); route.fulfill({ status: 200, contentType: 'text/html', body: STAND }); });
  await page.goto('https://app.matchplay.events/tournaments/280051/standings');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't', open: false })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(6000);
  console.log(await page.evaluate(() => { const ts = TDP.finals.qualifyingTies(TDP.data.D, TDP.finals.plan(TDP.data.D)); return ts.map(t => `${t.kind}@${t.pos} [${t.players.length}] spots ${t.spots}: ${t.why}`).join('\n') + '\nOTHER: ' + ts.other.map(o => o.pos + '[' + o.players.length + ']').join(', '); }));
  console.log('tags on Matchplay table:', await page.evaluate(() => document.querySelectorAll('main table [data-tdp=note]').length), '| tags on elig table:', await page.evaluate(() => document.getElementById('tdp-elig').shadowRoot.querySelectorAll('[data-act=tb]').length));
  await page.screenshot({ path: out + '/st.png', fullPage: true });
  await page.evaluate(() => document.getElementById('tdp-elig').shadowRoot.querySelector('[data-act=tb]').click());
  await page.waitForTimeout(500); await page.screenshot({ path: out + '/st-window.png' });
  console.log('window:', await page.evaluate(() => document.getElementById('tdp-tb').shadowRoot.querySelector('.dlg').innerText.slice(0, 700)));
  console.log('errors', errors);
  await browser.close();
})();
