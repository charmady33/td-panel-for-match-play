const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const out = process.argv[2] || '' + require('path').join(__dirname, 'out') + '/shots';
fs.mkdirSync(out, { recursive: true });
const tid = Number(process.argv[3] || 280051);
const html = id => `<!doctype html><html><head><meta charset=utf-8><title>MP</title><style>body{background:#f3f4f6;font-family:sans-serif;margin:0}</style></head><body class="bg-gray-100"><div class="flex h-16" style="display:flex;height:64px;background:#fff"><button style="width:56px">☰</button><input placeholder="Search"></div><main style="padding:24px 40px">
<h1>Tournament ${id}</h1><nav><a href="/tournaments/${id}">Overview</a> <a href="/tournaments/${id}/players">Players</a> <a href="/tournaments/${id}/matches">Matches</a></nav>
<a href="/tournaments/${id}/edit">Edit</a> <button>Start next round</button><button>Refresh</button><div class="flex flex-col" style="display:flex;flex-direction:column"><div class="shadow sm:rounded-lg" style="background:#fff;margin-top:20px"><table><tr><td><input type=checkbox></td><td><a href="/tournaments/${id}/players/600000">Greg Gibson</a></td></tr><tr><td><input type=checkbox></td><td><a href="/tournaments/${id}/players/600001">Russ DeWolfe</a></td></tr></table></div></div></main></body></html>`;
const RESOLVE_HTML = id => `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/${id}/edit">Edit</a><h3>Resolved ties</h3><div class="card"><span>Positions 6-9</span><button>Delete</button><div>Rick</div></div><h3>Unresolved ties</h3><div class="grid">` +
  [[2,5],[10,13],[14,17],[18,20],[23,27]].map(([a,b])=>`<div class="card" style="background:#fff;margin:8px;padding:8px"><div><span>Positions ${a}-${b}</span><button>Resolve</button></div><div>players</div></div>`).join('') + `</div></main></body></html>`;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  const calls = [];
  await page.route('https://api.matchplay.events/**', route => {
    const u = new URL(route.request().url()); calls.push(u.pathname + u.search);
    const p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me });
    let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: F.qual, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings);
    if (p.match(/\/rounds$/)) return json({ data: Number(p.split('/')[3]) === 280051 ? F.rounds : [] });
    if (p.match(/\/games$/)) { const r = u.searchParams.get('round'); const g = Number(p.split('/')[3]) === 280051 ? F.games.filter(x => !r || x.roundId === +r) : []; return json({ data: g, meta: { current_page: 1, last_page: 1 } }); }
    return json({ data: [] });
  });
  const pg = process.argv[4];
  const LCD = new Set(['G9', 'G8']);
  if (pg === 'overview') { F.qual.status = 'completed'; F.qual.completedAt = new Date(Date.now() - 3 * 864e5).toISOString(); F.finalsA.status = 'completed'; F.finalsA.completedAt = new Date(Date.now() - 2 * 864e5).toISOString(); F.finalsB.status = 'completed'; }
  if (pg === 'matches') {
    const q = F.qual; q.arenaAssignment = 'manual_banks'; q.status = 'started'; if (process.env.TESTT) q.test = true;
    q.banks = [0,1,2,3,4,5,6].map(b => ({ bankId: 900 + b, name: 'Bank ' + (b + 1), status: 'active', arenaIds: [q.arenas[(b * 2) % 14].arenaId, q.arenas[(b * 2 + 1) % 14].arenaId] }));
    F.rounds[1].status = 'completed'; F.games.forEach(g => { if (g.roundId === 2) { g.status = 'completed'; g.duration = 600; g.suggestions = []; } });
    F.rounds.push({ roundId: 3, name: 'Round 3', index: 2, status: 'started', createdAt: new Date().toISOString() });
    let gid = 500;
    for (let set = 0; set < 7; set++) for (let idx = 0; idx < 2; idx++) F.games.push({ gameId: gid++, roundId: 3, arenaId: null, bankId: null, set, index: idx, status: 'started', startedAt: new Date().toISOString(), bye: false, playerIds: [0, 1, 2, 3].map(k => 600000 + ((set * 4 + k * 7) % 28)), suggestions: [] });
  }
  const shell = inner => `<!doctype html><html><head><meta charset=utf-8></head><body><div><img src="https://mp-pride-flags.sfo3.digitaloceanspaces.com/transgender.png" style="width:30px;height:20px"> Match Play</div><main style="padding:24px 40px">${inner}</main></body></html>`;
  const t = tid === 280073 ? F.finalsA : F.qual;
  const PAGES = {
    banks: () => shell(`<div class="mb-2 flex items-center justify-between" style="display:flex;justify-content:space-between"><div class="flex-1 space-x-3"><span><button>Add bank</button></span></div><div class="flex-none"><button>Actions</button></div></div><div class="grid gap-6 grid-cols-3" style="display:grid;grid-template-columns:repeat(3,1fr)">${t.banks.map(b => `<div style="background:#fff;padding:8px"><div>${b.name}</div><ul>${b.arenaIds.map(id => `<li>${t.arenas.find(a => a.arenaId === id).name}<button>x</button></li>`).join('')}</ul><button>Add arenas…</button><button>Re-order</button></div>`).join('')}</div>`),
    arenas: () => shell(`<div class="flex" style="display:flex;gap:8px"><button>Add…</button><button>Add from qualifying</button><button>Actions</button></div><div class="shadow sm:rounded-lg" style="background:#fff;position:relative;margin-top:16px"><input type=checkbox id=selall style="position:absolute;left:16px;top:12px"><table style="width:100%"><thead><tr><th></th><th>Name</th><th class="text-center">Category</th><th>OPDB</th><th>Status</th><th></th></tr></thead><tbody>${t.arenas.map(a => `<tr><td><input type=checkbox></td><td><a href="/tournaments/${tid}/arenas/${a.arenaId}">${a.name}</a></td><td class="text-center">${({1:'EM',2:'SS',3:'DMD'})[a.categoryId]}</td><td>${a.opdbId}</td><td>Active</td><td>Deactivate</td></tr>`).join('')}</tbody></table></div>`),
    matches: () => shell(`<div class="flex justify-between" style="display:flex;justify-content:space-between"><div><button>Display round…</button></div><div><button>Refresh</button><button>Start next round</button></div></div><div>Round 3 groups</div>`),
    overview: () => shell(`<div style="display:flex;gap:24px"><div style="flex:1">Overview</div><div style="width:300px"><span class="inline-flex w-full" style="display:flex;width:100%"><button class="mp-btn" style="width:100%;background:#4f46e5;color:#fff;padding:8px;border-radius:6px;border:0">Re-open tournament</button></span><div class="mb-4 mt-2 grid grid-cols-2" style="display:grid;grid-template-columns:1fr 1fr;margin-top:8px"><button>Edit</button><button>More…</button></div></div></div>`),
  };
  await page.route(/api\.matchplay\.events\/api\/tournaments\/2800(73|74)\/standings/, route => { const a = route.request().url().includes('280073'); const rows = F.standings.slice(a ? 0 : 8, a ? 8 : 16).map((r, i) => ({ ...r, position: i + 1, gamesPlayed: 6 })); route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(rows) }); });
  await page.route('https://app.matchplay.events/**', route => {
    const u = new URL(route.request().url()), json = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) });
    if (u.pathname.startsWith('/api/opdb/entry/')) { const id = u.pathname.split('/').pop(); calls.push('opdb ' + id); return json({ data: { opdbId: id, display: LCD.has(id) ? 'lcd' : 'dmd' } }); }
    if (u.pathname.startsWith('/api/activity-logs')) { calls.push('logs'); return json({ data: [], meta: { last_page: 1 } }); }
    return route.fulfill({ status: 200, contentType: 'text/html', body: PAGES[pg]() });
  });
  await page.goto(`https://app.matchplay.events/tournaments/${tid}/${pg === 'overview' ? '' : pg}`);
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 'test-token', open: false, tab: 'status' })));
  await page.addScriptTag({ content: bundle });
  await page.waitForTimeout(7000);
  const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: `${out}/${name}.png`, fullPage: true }); };
  const R = id => `document.getElementById('${id}').shadowRoot`;
  const click = async (id, sel) => { await page.evaluate(([s, q]) => eval(s).querySelector(q).click(), [R(id), sel]); await page.waitForTimeout(700); };
  if (pg === 'banks') {
    await shot('b-bar');
    const pos = await page.evaluate(() => { const h = document.getElementById('tdp-bankbar'); return h.previousElementSibling.className + ' -> ' + h.nextElementSibling.className; });
    await page.waitForTimeout(3500);
    const pos2 = await page.evaluate(() => { const h = document.getElementById('tdp-bankbar'); return h.previousElementSibling.className + ' -> ' + h.nextElementSibling.className; });
    console.log('placement', pos, '| after 3.5s:', pos2 === pos ? 'same' : pos2);
    await click('tdp-bankbar', '[data-act=add]');
    await page.evaluate(s => { const r = eval(s); r.querySelector('[data-f=askN]').value = 3; r.querySelector('[data-act=askOk]').click(); }, R('tdp-bb-modal'));
    await page.waitForTimeout(1200); await shot('b-add3');
    console.log('add3', await page.evaluate(s => eval(s).querySelector('.db').innerText.slice(0, 900), R('tdp-bb-modal')));
    await click('tdp-bb-modal', '[data-act=close]');
    // force repeats: add 5 banks of 3 = 15 slots, 14 games minus 3 in Bank 1
    await click('tdp-bankbar', '[data-act=add]');
    await page.evaluate(s => { const r = eval(s); r.querySelector('[data-f=askN]').value = 5; r.querySelector('[data-act=askOk]').click(); }, R('tdp-bb-modal'));
    await page.waitForTimeout(1500); await shot('b-add5');
    console.log('add5', await page.evaluate(s => eval(s).querySelector('.db').innerText.slice(0, 1600), R('tdp-bb-modal')));
  }
  if (pg === 'arenas') {
    await page.waitForTimeout(6000);
    await shot('a-table');
    console.log('rows', await page.evaluate(() => [...document.querySelectorAll('main tbody tr')].slice(0, 14).map(tr => [...tr.children].map(td => td.querySelector('select') ? 'sel:' + td.querySelector('select').selectedOptions[0].text : td.innerText.replace(/\s+/g, ' ').trim()).join(' | ')).join('\n')));
    // override Gaucho to SS
    await page.evaluate(() => { const s = [...document.querySelectorAll('select[data-tdp-cat]')].pop(); s.value = 'SS'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(800);
    console.log('override', await page.evaluate(() => { const tr = [...document.querySelectorAll('main tbody tr')].pop(); return tr.innerText.replace(/\s+/g, ' '); }), await page.evaluate(() => TDP.banks.eraOf(TDP.data.D.t.arenas.find(a => a.name === 'Gaucho'))));
  }
  if (pg === 'matches') {
    await shot('m-bar');
    console.log('bar', await page.evaluate(s => eval(s).querySelector('.card').innerText, R('tdp-auto')));
    await click('tdp-auto', '[data-act=assign]'); await page.waitForTimeout(600); await shot('m-preview');
    console.log('preview', await page.evaluate(s => eval(s).querySelector('.dlg').innerText.slice(0, 1500), R('tdp-bb-modal')));
    await click('tdp-bb-modal', '[data-act=nextOpt]');
    console.log('opt2', await page.evaluate(s => eval(s).querySelector('.db .small').innerText, R('tdp-bb-modal')));
    await click('tdp-bb-modal', '[data-act=assignGo]');
    await page.waitForTimeout(600); await page.screenshot({ path: `${out}/m-running.png` });
    console.log('cover', await page.evaluate(() => { const h = document.getElementById('tdp-cover'); return h ? { right: h.style.right, txt: h.shadowRoot.querySelector('.tdpc-card').innerText.replace(/\s+/g, ' '), cloneHasMain: !!h.shadowRoot.querySelector('main'), docButtons: [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Refresh').length } : 'none'; }));
    const clickedThrough = await page.evaluate(() => { const el = document.elementFromPoint(300, 100); return el ? (el.closest('#tdp-cover') ? 'cover' : el.tagName) : 'none'; });
    console.log('top element at a page point:', clickedThrough);
    await page.waitForTimeout(16000); await shot('m-error');
    console.log('after', await page.evaluate(() => { const h = document.getElementById('tdp-busy-banner'); return h ? h.shadowRoot.querySelector('.callout').innerText.replace(/\s+/g, ' ').slice(0, 220) : 'none'; }), 'cover gone', await page.evaluate(() => !document.getElementById('tdp-cover')));
  }
  if (pg === 'overview') {
    await shot('o-btn');
    console.log('btn', await page.evaluate(() => { const b = document.querySelector('[data-tdp-ifpa]'); const r = b.getBoundingClientRect(), o = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Re-open tournament').getBoundingClientRect(); return `ifpa ${Math.round(r.width)}x${Math.round(r.height)} @y${Math.round(r.top)} | reopen ${Math.round(o.width)}x${Math.round(o.height)} @y${Math.round(o.top)} | note: ${document.querySelector('.tdp-ifpa-note').textContent}`; }));
    await page.click('[data-tdp-ifpa]'); await page.waitForTimeout(700);
    await page.waitForTimeout(4000); await shot('o-step1');
    console.log('page', await page.evaluate(s => eval(s).querySelector('.dlg').innerText.replace(/\n+/g, ' | ').slice(0, 900), R('tdp-ifpa')));
    await page.evaluate(s => { const c = eval(s).querySelector('[data-f=done]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })); }, R('tdp-ifpa')); await page.waitForTimeout(400);
    console.log('header after Done:', await page.evaluate(s => eval(s).querySelector('.dh').innerText.replace(/\n+/g, ' | '), R('tdp-ifpa')));
    await click('tdp-ifpa', '[data-act=close]'); await page.waitForTimeout(1600); await shot('o-after');
  }
  console.log('errors', errors.filter(e => !/ERR_TUNNEL|Failed to load resource/.test(e)).slice(0, 8)); console.log('calls', calls.filter(c => /opdb|logs/.test(c)).length);
  await browser.close();
})();
