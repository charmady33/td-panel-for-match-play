// 0.14.0 UI: Stats → Plays tab (sort), optional tie window, IFPA draw + vote "Change…", Matchplay-style results grid.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds });
    if (p.match(/\/games$/)) { const r = u.searchParams.get('round'); return json({ data: F.games.filter(x => !r || x.roundId === +r), meta: { last_page: 1 } }); }
    return json({ data: [] }); });
  const nav = ['rounds', 'arenas', 'players', 'round-points'].map((k, i) => `<a href="/tournaments/280051/stats/${k}" class="py-4 px-1 border-b-2 ${i === 0 ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-default'}">${['Rounds', 'Arenas', 'Players', 'Points/round'][i]}</a>`).join('');
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test</h1><div>Group match play</div>
    <div class="mx-auto"><div class="pb-6"></div><div class="border-b my-6"><nav class="-mb-px space-x-8">${nav}</nav></div><div class="mb-4"><select><option>All rounds</option></select></div><div class="space-y-6"><table><tr><td>Matchplay round stats</td></tr></table></div></div></main><script>document.addEventListener('click', e => { const a = e.target.closest('nav a'); if (a && !a.dataset.tdpPlays) { e.preventDefault(); history.pushState(null, '', a.getAttribute('href')); } });</script></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051/stats/rounds');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(5000);
  // Plays tab
  const tab = await page.evaluate(() => [...document.querySelectorAll('main nav a')].map(a => a.textContent + (a.className.includes('border-indigo-500') ? '*' : '')).join(' | '));
  console.log('tabs:', tab);
  await page.click('a[data-tdp-plays]'); await page.waitForTimeout(400);
  const R = () => page.evaluate(() => { const h = document.getElementById('tdp-plays'); return h ? [...h.shadowRoot.querySelectorAll('tr')].slice(0, 5).map(t => t.innerText.replace(/\s+/g, ' ').trim().slice(0, 140)).join('\n') : 'NO PLAYS'; });
  console.log('plays (by name):\n' + await R());
  console.log('hidden MP content:', await page.evaluate(() => [...document.querySelectorAll('.mb-4, .space-y-6')].map(e => e.style.display).join(',')), '| active:', await page.evaluate(() => [...document.querySelectorAll('main nav a')].filter(a => a.className.includes('border-indigo-500')).map(a => a.textContent).join(',')));
  await page.evaluate(() => document.getElementById('tdp-plays').shadowRoot.querySelector('[data-sort=rep]').click()); await page.waitForTimeout(300);
  console.log('sorted by repeats:\n' + await R());
  await page.screenshot({ path: out + '/plays.png' });
  // back to a Matchplay sub-tab
  await page.evaluate(() => document.querySelector('main nav a').click()); await page.waitForTimeout(300);
  console.log('after leaving:', await page.evaluate(() => !!document.getElementById('tdp-plays')), await page.evaluate(() => [...document.querySelectorAll('.mb-4, .space-y-6')].map(e => e.style.display || 'shown').join(',')));
  // optional tie: open, h2h-or-game options, grey badge
  const opt = await page.evaluate(async () => {
    const D = TDP.data.D, list = TDP.finals.qualifyingTies(D, TDP.finals.plan(D)); const o = (list.other || [])[0]; if (!o) return 'no optional ties';
    TDP.ties.openByKey(D, TDP.ties.keyOf(o)); await new Promise(r => setTimeout(r, 200));
    return document.getElementById('tdp-tb').shadowRoot.querySelector('.dlg').innerText.slice(0, 260);
  });
  console.log('optional window:', opt.replace(/\n+/g, ' | '));
  // IFPA draw + vote: change a drawn game by hand, then the results grid
  const vote = await page.evaluate(async () => {
    const S = () => document.getElementById('tdp-tb').shadowRoot, w = () => new Promise(r => setTimeout(r, 200));
    S().querySelector('[data-act=mIfpa]').click(); await w();   // optional ties: same choices as cut-line ties
    const before = [...S().querySelectorAll('.vrow b')].map(b => b.innerText);
    const sel = S().querySelector('select[data-ch="0"]'); const pick = [...sel.options].find(o => o.value && !o.disabled && !before.some(b => b.includes(o.value)));
    sel.value = pick.value; sel.dispatchEvent(new Event('change', { bubbles: true })); await w(); await w();
    const after = [...S().querySelectorAll('.vrow b')].map(b => b.innerText);
    S().querySelector('[data-act=choose][data-i="0"]').click(); await w();
    const names = [...S().querySelectorAll('[data-act=Name]')];
    names[1].click(); await w();
    let grid = [...S().querySelectorAll('table.rg tr')].map(t => [...t.querySelectorAll('.dot')].map(d => d.classList.contains('on') ? '●' : '○').join('')).join(' ');
    const dots = [...S().querySelectorAll('[data-act=Dot]')]; dots[dots.length - 1 - 0].click(); await w();
    const rest = [...S().querySelectorAll('[data-act=Name]')]; for (const n of rest) { const row = n.closest('tr'); if (!row.querySelector('.dot.on')) { n.click(); await w(); } }
    const grid2 = [...S().querySelectorAll('table.rg tr')].map(t => [...t.querySelectorAll('.dot')].map(d => d.classList.contains('on') ? '●' : '○').join('')).join(' ');
    return { before, after, grid, grid2, title: S().querySelector('.rt').innerText, save: !S().querySelector('[data-act=apply]').disabled, rec: Object.values(TDP.tstate[280051].tb).find(x => x.status === 'playing') };
  });
  console.log('drawn:', vote.before.join(' / '), '→', vote.after.join(' / '));
  console.log(vote.title, '| grid after 1 tap:', vote.grid, '| full:', vote.grid2, '| Save enabled:', vote.save, '| tdSet:', vote.rec && vote.rec.tdSet);
  await page.screenshot({ path: out + '/results-grid.png' });
  // item 73: the number boxes in the tie grid - typing 1 in the last player's box moves them to 1st, the rest shift
  console.log('tie boxes:', await page.evaluate(async () => {
    const S = () => document.getElementById('tdp-tb').shadowRoot, w = () => new Promise(r => setTimeout(r, 250));
    const box = () => [...S().querySelectorAll('input.ob')];
    const before = box().map(i => i.value || '_').join('');
    const last = box()[box().length - 1]; last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', { key: '1', bubbles: true })); await w(); await w();
    return before + ' -> ' + box().map(i => i.value || '_').join('');
  }));
  console.log('errors', errors);
  await browser.close();
})();
