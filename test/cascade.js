const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 1600 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: [] }); if (p.match(/\/games$/)) return json({ data: [], meta: { last_page: 1 } }); return json({ data: [] }); });
  const rows = F.standings.slice().sort((a, b) => a.position - b.position).map(s => `<tr><td>${s.position}</td><td><a href="/tournaments/280051/players/${s.playerId}">P${s.playerId}</a></td><td>${Number(s.points)} pts.</td><td>-</td></tr>`).join('');
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div><button>Refresh</button><div class="flex flex-col" style="display:flex;flex-direction:column"><div><div><table><thead><tr><th>#</th><th>Name</th><th>Points</th><th>Ties</th></tr></thead><tbody>${rows}</tbody></table></div></div></div></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051/standings');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(6000);
  const ties = await page.evaluate(() => TDP.finals.qualifyingTies(TDP.data.D, TDP.finals.plan(TDP.data.D)).map(t => ({ pos: t.pos, kind: t.kind, letter: t.letter, n: t.players.length, playing: t.playing.length, sitOut: t.sitOut, waitFor: t.waitFor && t.waitFor.pos })));
  console.log('ties', JSON.stringify(ties));
  const tbl = await page.evaluate(() => { const h = document.getElementById('tdp-elig'); return h ? [...h.shadowRoot.querySelectorAll('tr')].map(t => t.innerText.replace(/\s+/g, ' ').trim()).slice(0, 40).join('\n') : 'NO TABLE'; });
  console.log(tbl);
  console.log('chip:', await page.evaluate(() => { const c = document.getElementById('tdp-chip'); return c ? c.shadowRoot.textContent : 'none'; }));
  // open the B tie window if any
  const bKey = await page.evaluate(() => { const t = TDP.finals.qualifyingTies(TDP.data.D, TDP.finals.plan(TDP.data.D)).find(x => x.waitFor); return t ? TDP.ties.keyOf(t) : null; });
  if (bKey) { await page.evaluate(k => TDP.ties.openByKey(TDP.data.D, k), bKey); await page.waitForTimeout(300); console.log('B window:', await page.evaluate(() => document.getElementById('tdp-tb').shadowRoot.querySelector('.db').innerText.slice(0, 600))); }
  await page.screenshot({ path: process.argv[2] + '/cascade.png', fullPage: true });
  // bracket group tie: Break tie -> random game -> finish -> Save
  await page.evaluate(() => TDP.ties.close());
  const gtOut = await page.evaluate(async () => {
    const D = TDP.data.D, gt = { kind: 'final', group: 1, roundId: 77, pts: 15, place: 1, ids: [600001, 600002], players: ['a', 'b'], why: 'Final - 2 players tied on 15 for 1st and 2nd' };
    TDP.ties.openGroup(D, gt);
    const R = () => document.getElementById('tdp-tb').shadowRoot, click = async sel => { R().querySelector(sel).click(); await new Promise(r => setTimeout(r, 150)); };
    const first = R().querySelector('.db').innerText.slice(0, 200);
    await click('[data-act=gRandom]');
    const fins = [...R().querySelectorAll('[data-act=gName]')].map(b => b.dataset.p);
    await click(`[data-act=gName][data-p="${fins[1]}"]`);   // the last place fills itself (like Matchplay's Results window)
    await click('[data-act=gDone]');
    return { first, after: R().querySelector('.db').innerText.slice(-160), rec: TDP.ties.gRec(D, gt) };
  });
  console.log('group tie:', JSON.stringify(gtOut));
  console.log('errors', errors);
  await browser.close();
})();
