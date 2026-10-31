const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const q = F.qual; q.arenaAssignment = 'manual_banks'; q.status = 'started';
  q.banks = [0, 1, 2].map(b => ({ bankId: 900 + b, name: 'Bank ' + (b + 1), status: 'active', arenaIds: [q.arenas[b * 2].arenaId, q.arenas[b * 2 + 1].arenaId] }));
  F.rounds.forEach(r => { r.status = 'completed'; }); F.rounds.push({ roundId: 3, name: 'Round 3', index: 2, status: 'started' });
  let gid = 500; const games = [];
  for (let set = 0; set < 2; set++) for (let idx = 0; idx < 2; idx++) games.push({ gameId: gid++, roundId: 3, arenaId: set === 0 ? q.arenas[idx].arenaId : null, bankId: set === 0 ? 900 : null, set, index: idx, status: 'started', bye: false, playerIds: [600000 + set * 4, 600001 + set * 4, 600002 + set * 4, 600003 + set * 4], suggestions: [] });
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: q, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds }); if (p.match(/\/games$/)) return json({ data: u.searchParams.get('round') === '3' ? games : [], meta: { last_page: 1 } }); return json({ data: [] }); });
  const grp = n => `<div class="card" style="background:#fff;margin:12px 0"><div style="display:flex;justify-content:space-between"><span></span><button class="act">Actions</button></div><table><thead><tr><th>Group ${n}${n === 1 ? ' - Bank 1' : ''}</th><th>Tot.</th></tr></thead><tbody><tr><td>a</td><td>0</td></tr></tbody></table></div>`;
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div><div><button>Display round…</button><button>Refresh</button><button>Start next round</button></div>${grp(1)}${grp(2)}</main>
  <script>document.querySelectorAll('.act').forEach(b => b.onclick = () => { const m = document.createElement('div'); m.setAttribute('role', 'menu'); m.innerHTML = '<div role=menuitem><button>Assign bank</button></div>'; m.querySelector('button').onclick = () => { m.remove(); const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.id = 'mpdlg'; d.innerHTML = 'Assign bank dialog <label><input type=checkbox>Bank 1</label><button>Update arenas</button>'; document.body.appendChild(d); }; document.body.appendChild(m); });</script></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051/matches');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); console.log('loaded'); await page.waitForTimeout(6000); console.log('waited');
  console.log('buttons:', await page.evaluate(() => [...document.querySelectorAll('[data-tdp=abtn]')].map(b => b.closest('th').innerText)));
  console.log('direct:', await page.evaluate(async () => { try { await TDP.mp.openAssign(2); return 'ok'; } catch (e) { return 'ERR ' + e.message; } }));
  // our Assign Bank/Order window: bank dropdown (Random bank first), order boxes; bad order caught on Save
  await page.evaluate(() => { document.getElementById('mpdlg') && document.getElementById('mpdlg').remove(); TDP.jobs.start = async (t, s) => { window.__job = { t, s }; }; document.querySelector('[data-tdp=abtn]').click(); }); await page.waitForTimeout(500);
  const R = () => document.getElementById('tdp-bankorder').shadowRoot;
  console.log('window:', await page.evaluate(() => { const r = document.getElementById('tdp-bankorder').shadowRoot; return r.querySelector('.dh').innerText + ' | banks: ' + [...r.querySelectorAll('select option')].map(o => o.text + (o.disabled ? ' (grey)' : '')).join(', ') + ' | players: ' + r.querySelectorAll('input[data-p]').length; }));
  // order boxes: click = 1…4 list, typing a digit replaces, others shift, last one fills itself
  const ord = () => page.evaluate(() => [...document.getElementById('tdp-bankorder').shadowRoot.querySelectorAll('input[data-p]')].map(i => i.value || '_').join(''));
  const box = k => page.locator('#tdp-bankorder input[data-p]').nth(k);
  await box(0).click(); console.log('list on click:', await page.evaluate(() => [...document.getElementById('tdp-bankorder').shadowRoot.querySelectorAll('[data-pick]')].map(b => b.textContent).join('')));
  await page.locator('#tdp-bankorder [data-pick="1"]').click(); console.log('A picks 1:', await ord());
  await box(1).click(); await page.keyboard.type('2'); console.log('B types 2:', await ord());
  await box(2).click(); await page.keyboard.type('x9'); console.log('C types x9 (ignored):', await ord());
  await page.keyboard.type('3'); console.log('C types 3 (D fills itself):', await ord());
  await box(0).click(); await page.keyboard.type('4'); console.log('A types 4 (others shift):', await ord());
  await box(1).click(); await page.locator('#tdp-bankorder .dh').click(); await page.waitForTimeout(100); console.log('B clicked then away (kept):', await ord(), '| list closed:', await page.evaluate(() => !document.getElementById('tdp-bankorder') || !document.getElementById('tdp-bankorder').shadowRoot.querySelector('.pm')));
  // Tab: number then Tab moves to the next player's box; the list only shows free numbers
  await page.evaluate(() => { const r = document.getElementById('tdp-bankorder'); r && r.shadowRoot.querySelector('[data-act=close]').click(); }); await page.evaluate(() => { window.__job = null; });
  await page.evaluate(() => document.querySelector('[data-tdp=abtn]').click()); await page.waitForTimeout(300);
  await box(0).click(); await page.keyboard.type('1'); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
  console.log('after 1 + Tab: focus on box', await page.evaluate(() => { const r = document.getElementById('tdp-bankorder').shadowRoot; return [...r.querySelectorAll('input[data-p]')].indexOf(r.activeElement); }), '| list:', await page.evaluate(() => [...document.getElementById('tdp-bankorder').shadowRoot.querySelectorAll('[data-pick]')].map(b => b.textContent).join('')));
  await page.keyboard.type('3'); await page.keyboard.press('Tab'); await page.waitForTimeout(150); await page.keyboard.type('2');
  console.log('typed 1,3,2 with Tab:', await ord());
  // bank: games in the dropdown and listed under it
  await page.evaluate(() => { const r = document.getElementById('tdp-bankorder').shadowRoot, s = r.querySelector('[data-f=bank]'); s.value = s.options[2].value; s.dispatchEvent(new Event('change', { bubbles: true })); });
  console.log('bank option:', await page.evaluate(() => document.getElementById('tdp-bankorder').shadowRoot.querySelector('[data-f=bank]').options[2].text), '| listed:', await page.evaluate(() => [...document.getElementById('tdp-bankorder').shadowRoot.querySelectorAll('ol li b')].map(b => b.textContent).join(' / ')));
  await page.screenshot({ path: process.argv[2] + '/bankorder.png' });
  console.log('save:', await page.evaluate(async () => { const r = document.getElementById('tdp-bankorder'); if (!r) return 'window closed by background click'; r.shadowRoot.querySelector('[data-act=save]').click(); await new Promise(x => setTimeout(x, 200)); return JSON.stringify(window.__job && window.__job.s.map(x => x.op + ' ' + JSON.stringify(x.args))); }));
  console.log('no order (still saves):', await page.evaluate(async () => { window.__job = null; document.querySelector('[data-tdp=abtn]').click(); await new Promise(x => setTimeout(x, 200)); const r = document.getElementById('tdp-bankorder').shadowRoot; r.querySelector('[data-act=save]').click(); await new Promise(x => setTimeout(x, 200)); return JSON.stringify(window.__job && window.__job.s.map(x => x.op)); }));
  console.log('status line:', await page.evaluate(() => (document.getElementById('tdp-auto') ? document.getElementById('tdp-auto').shadowRoot.textContent : 'none').replace(/\s+/g, ' ').slice(-200)));
  await page.screenshot({ path: process.argv[2] + '/groups.png' });
  console.log('errors', errors); await browser.close();
})();
