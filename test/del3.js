// full delete run against a copy of Matchplay's delete window (title, "Are you sure", "Delete tournament permanently")
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const mk = (id, name, st, test, extra) => ({ tournamentId: id, name, status: st, test, organizerId: F.me.userId, startUtc: '2026-10-25T10:00:00Z', ...extra });
  const T = { 11: mk(11, 'test3', 'completed', true), 12: mk(12, 'Finals for test3', 'completed', true), 13: mk(13, 'Real Saturday', 'completed', false) };
  const deleted = new Set();
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = (d, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if (p === '/api/tournaments') return json({ data: Object.values(T).filter(t => !deleted.has(t.tournamentId)), meta: { last_page: 1 } });
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return deleted.has(+m[1]) ? json({ message: 'Not found' }, 404) : json({ data: T[m[1]] });
    return json({ data: [] }); });
  await page.route('https://app.matchplay.events/delete/**', route => { deleted.add(+route.request().url().split('/').pop()); route.fulfill({ status: 200, body: 'ok' }); });
  const ORG = `<!doctype html><html><head><meta charset=utf-8></head><body><main><div><div class="mb-2 flex justify-end items-center"><div><button>Status…</button></div></div><ul><li>list</li></ul></div></main></body></html>`;
  const OV = id => `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:20px"><h1>${T[id].name}</h1><div>Group match play</div><span>${T[id].test ? 'Test' : ''}</span> <div>some overview text to make the main area long enough for the extension to think the page is drawn.</div>
    <button id=more>More…</button><div id=menu style="display:none" role=menu><div role=menuitem><button id=delmi>Delete tournament</button></div></div></main>
    <script>more.onclick=()=>{menu.style.display='block'}; delmi.onclick=()=>{menu.style.display='none'; const d=document.createElement('div'); d.setAttribute('role','dialog'); d.innerHTML='<h3>Delete tournament</h3><p>Are you sure you want to delete ${T[id].name}? This is a permanent choice. You will not be able to bring your tournament back later.</p><button class=c>Cancel</button><button class=x style="background:red;color:#fff">Delete tournament permanently</button>'; document.body.appendChild(d); d.querySelector('.c').onclick=()=>d.remove(); d.querySelector('.x').onclick=async()=>{ await fetch('/delete/${id}'); d.remove(); const t=document.createElement('div'); t.innerHTML='<span>Tournament deleted</span>'; document.body.appendChild(t); setTimeout(()=>{ location.href='/tournaments/organized'; },300); }; };</script></body></html>`;
  await page.route('https://app.matchplay.events/tournaments/**', route => { const m = route.request().url().match(/tournaments\/(\d+)/); route.fulfill({ status: 200, contentType: 'text/html', body: m ? OV(m[1]) : ORG }); });
  await page.goto('https://app.matchplay.events/tournaments/organized');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  page.on('load', () => { page.addScriptTag({ content: bundle }).catch(() => {}); });
  page.on('framenavigated', f => { if (f !== page.mainFrame()) f.waitForLoadState('domcontentloaded').then(() => f.addScriptTag({ content: bundle })).catch(() => {}); });
  const samples = []; setInterval(() => page.evaluate(() => { const j = window.TDP && TDP.jobs.get(); return j ? `${j.runner} i=${j.i} ${j.sub ? j.sub.text : ''} | ${j.log.slice(-2).join(' / ')}` : 'none'; }).then(v => { if (samples[samples.length - 1] !== v) samples.push(v); }).catch(() => {}), 500);
  process.on('exit', () => console.log('timeline:\n ' + samples.join('\n ')));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(3000);
  if (process.env.DRY) {   // open Matchplay's window, check the button, cancel
    await page.goto('https://app.matchplay.events/tournaments/11'); await page.waitForTimeout(3000);
    console.log('dry run:', await page.evaluate(async () => { try { return await TDP.mp.deleteTournament('test3', { dryRun: true }); } catch (e) { return 'ERR ' + e.message; } }), '| deleted:', [...deleted]);
    await browser.close(); return;
  }
  await page.evaluate(() => document.getElementById('tdp-deltest').shadowRoot.querySelector('[data-act=open]').click()); await page.waitForTimeout(2500);
  await page.evaluate(() => { const r = document.getElementById('tdp-deltest-dlg').shadowRoot; const i = r.querySelector('[data-f=typed]'); i.value = 'DELETE'; i.dispatchEvent(new Event('input', { bubbles: true })); r.querySelector('[data-act=go]').click(); });
  for (let k = 0; k < 60; k++) { await page.waitForTimeout(1000); const st = await page.evaluate(() => { const j = window.TDP && TDP.jobs.get(); return j ? (j.done ? 'done' : j.error ? 'error ' + j.error : 'run') : 'none'; }).catch(() => 'nav'); if (/done|error/.test(st)) { console.log('job', st, 'after', k, 's'); break; } }
  await page.waitForTimeout(3000);
  console.log('deleted on server:', [...deleted]);
  console.log('card:', await page.evaluate(() => { const h = document.getElementById('tdp-deltest'); return h ? h.shadowRoot.textContent.replace(/\s+/g, ' ').slice(-300) : 'none'; }).catch(e => e.message));
  console.log('page:', page.url(), 'errors', errors);
  await page.screenshot({ path: process.argv[2] + '/del2.png' });
  await browser.close();
})();
