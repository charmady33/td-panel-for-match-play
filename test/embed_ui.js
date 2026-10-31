const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 1400 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  F.qual.status = 'completed';
  F.finalsA.players = []; F.finalsA.seeding = 'random';     // empty finals, random seeding (like A Finals for test2)
  // a B qualifier (9th in qualifying order) is checked in to A as a backup
  const bPick = F.standings.slice().sort((a, b) => a.position - b.position)[8].playerId;
  if (process.env.CAP) { const top = F.standings.slice().sort((a, b) => a.position - b.position).slice(0, 8).map(r => r.playerId); F.finalsA.players = top.map((id, i) => ({ ...F.qual.players.find(p => p.playerId === id), tournamentPlayer: { status: 'active', seed: i + 1, labels: [] } })); }
  if (process.env.DONEJOB) { F.finalsA.players = []; }
  if (process.env.MOVEUP) F.finalsA.players = [{ ...F.qual.players.find(p => p.playerId === bPick), tournamentPlayer: { status: 'active', seed: 9, labels: [] } }];
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: [] }); if (p.match(/\/games$/)) return json({ data: [], meta: { last_page: 1 } }); return json({ data: [] }); });
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><div><div class="mb-2 flex"><button>Add players</button><button>Add from qualifying</button></div><div class="mt-2 text-right"><button>MP Ratings</button><button>IFPA rankings</button></div></div></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280073/players');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't', open: false })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(6000);
  const read = () => page.evaluate(() => { const h = document.getElementById('tdp-embed'); if (!h) return 'NO CHECK-IN'; return [...h.shadowRoot.querySelectorAll('table')].map(t => [...t.querySelectorAll('tr')].map(tr => [...tr.children].map(c => c.querySelector('input') ? (c.querySelector('input').checked ? '[x]' : '[ ]') : c.innerText.trim()).join(' | ')).join('\n')).join('\n---\n') + '\n' + [...h.shadowRoot.querySelectorAll('[data-act=more]')].map(b => b.innerText).join(', ') + '\n' + [...h.shadowRoot.querySelectorAll('.small')].map(x => x.innerText).filter(t => /Seeding/.test(t)).join(''); });
  console.log(await read());
  if (process.env.CAP) {
    const st = () => page.evaluate(() => { const r = document.getElementById('tdp-embed').shadowRoot; return { disabled: [...r.querySelectorAll('input.ck')].filter(c => c.disabled).length, total: r.querySelectorAll('input.ck').length, note: [...r.querySelectorAll('.callout')].map(c => c.innerText).join(' | '), badge: [...r.querySelectorAll('.badge')].map(b => b.innerText).join(', ') }; });
    console.log('CAP full:', JSON.stringify(await st()));
    await page.evaluate(() => { const c = document.getElementById('tdp-embed').shadowRoot.querySelector('input.ck'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(100);
    console.log('CAP after untick:', JSON.stringify(await st()));
    await browser.close(); return;
  }
  if (process.env.DONEJOB) {
    const ids = await page.evaluate(() => TDP.finals.plan(TDP.data.D)[0].picks.slice(0, 2).map(r => r.playerId));
    await page.evaluate(ids => { const j = { title: 'Finals check-in', startedAt: Date.now() - 5000, done: true, doneAt: Date.now(), owner: TDP.tabId, steps: [{ tid: 280073, page: 'players', op: 'addPlayers', args: { ids } }], i: 1, log: [] }; localStorage.setItem('tdp:job', JSON.stringify(j)); window.dispatchEvent(new StorageEvent('storage', { key: 'tdp:job', newValue: JSON.stringify(j) })); }, ids);
    await page.waitForTimeout(300);
    console.log('DONEJOB rows:', await page.evaluate(() => [...document.getElementById('tdp-embed').shadowRoot.querySelectorAll('tr')].slice(1, 4).map(t => t.innerText.replace(/\s+/g, ' ')).join(' / ')));
    await browser.close(); return;
  }
  await page.evaluate(() => document.getElementById('tdp-embed').shadowRoot.querySelector('[data-act=more]').click()); await page.waitForTimeout(300);
  console.log('after Show more, backup rows:', await page.evaluate(() => [...document.getElementById('tdp-embed').shadowRoot.querySelectorAll('tr.back')].length));
  // tick the first player: row status should change at once
  await page.evaluate(() => { const c = document.getElementById('tdp-embed').shadowRoot.querySelector('input.ck'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(100);
  // tick a second one too, then check the Confirm bar; reload: still waiting
  await page.evaluate(() => { const c = document.getElementById('tdp-embed').shadowRoot.querySelectorAll('input.ck')[1]; c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(300);
  const st = () => page.evaluate(() => { const r = document.getElementById('tdp-embed').shadowRoot; return { bar: (r.querySelector('.cbar') || {}).innerText, rows: [...r.querySelectorAll('tr.pend')].map(t => t.innerText.replace(/\s+/g, ' ')) }; });
  console.log('after 2 ticks:', JSON.stringify(await st()));
  console.log('job started?', await page.evaluate(() => !!TDP.jobs.get()));
  await page.reload(); await page.addScriptTag({ content: bundle }); await page.waitForTimeout(5000);
  console.log('after reload:', JSON.stringify(await st()));
  await page.screenshot({ path: process.argv[2] + '/checkin.png' });
  console.log('errors', errors);
  await browser.close();
})();
