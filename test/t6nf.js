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
  const t = F.finalsA;
  t.banks = [{ bankId: 1, name: 'Bank 1', status: 'active', arenaIds: t.arenas.slice(0, 3).map(a => a.arenaId) }, { bankId: 2, name: 'Bank 2', status: 'active', arenaIds: t.arenas.slice(3, 6).map(a => a.arenaId) }, { bankId: 3, name: 'Bank 3', status: 'active', arenaIds: t.arenas.slice(6, 9).map(a => a.arenaId) }];
  const ALL = t.arenas.map(a => a.name).concat(['Zz Extra One', 'Zz Extra Two']).sort();
  const MOCK = `<!doctype html><html><head><meta charset=utf-8><style>body{font-family:sans-serif;background:#f3f4f6;margin:0}[role=dialog]{position:relative}[role=dialog]>.in{position:fixed;top:40px;left:30%;width:40%;background:#fff;border:1px solid #999;padding:10px;max-height:80vh;overflow:auto;z-index:50}.card{background:#fff;padding:8px;margin:8px;width:260px;display:inline-block;vertical-align:top}</style></head><body><main style="padding:24px 40px">
  <div class="mb-2 flex items-center justify-between" style="display:flex;justify-content:space-between"><div class="flex-1 space-x-3"><span><button id=addbank>Add bank</button></span></div><div class="flex-none"><button>Actions</button></div></div>
  <div class="grid gap-6 grid-cols-3" id=grid></div></main>
  <script>
  const ALL = ${JSON.stringify(ALL)};
  const banks = JSON.parse(sessionStorage.getItem('mockBanks') || 'null') || ${JSON.stringify(t.banks.map(b => ({ name: b.name, games: b.arenaIds.map(id => t.arenas.find(a => a.arenaId === id).name) })))};
  const grid = document.getElementById('grid');
  function draw(){ sessionStorage.setItem('mockBanks', JSON.stringify(banks)); grid.innerHTML=''; banks.forEach((b,bi)=>{ const c=document.createElement('div'); c.className='card'; c.innerHTML='<div>'+b.name+'</div><ul>'+b.games.map((g,gi)=>'<li>'+g+'<button data-rm="'+bi+':'+gi+'" aria-label=remove style="width:14px;height:14px"></button></li>').join('')+'<li><a href="#" data-add="'+bi+'">Add arenas…</a></li></ul><div><button data-ro="'+bi+'">Re-order</button></div>'; grid.appendChild(c); }); }
  draw();
  const dlg = html => { const d=document.createElement('div'); d.setAttribute('role','dialog'); d.innerHTML='<div class=in>'+html+'</div>'; document.body.appendChild(d); return d; };
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.rm) { e.preventDefault(); const [bi,gi]=t.dataset.rm.split(':').map(Number); setTimeout(()=>{ banks[bi].games.splice(gi,1); draw(); }, 150); }
    if (t.dataset.add) { e.preventDefault(); openAdd(+t.dataset.add); }
    if (t.dataset.ro) openRo(+t.dataset.ro);
    if (t.id==='addbank') { const d=dlg('<input><button id=sv>Save</button>'); d.querySelector('#sv').onclick=()=>{ banks.push({name:d.querySelector('input').value,games:[]}); d.remove(); draw(); }; }
  });
  function openAdd(bi){
    const d = dlg('<input placeholder="Filter arenas…"><div class=list></div><button class=go>Add 0 arenas</button><button class=cl>Close</button>');
    const sel = new Set(); let shown = 10;   // fills in slowly, like a first load
    setTimeout(()=>{ shown = ALL.length; render(); }, 900);
    const f = d.querySelector('input');
    function render(){ const q=f.value.toLowerCase(); const list=d.querySelector('.list'); list.innerHTML=''; ALL.slice(0,shown).filter(n=>n.toLowerCase().includes(q)).forEach(n=>{ const l=document.createElement('label'); l.style.display='block'; l.innerHTML='<input type=checkbox '+(sel.has(n)?'checked':'')+'><div><div>'+n+'</div><div>EM · Gx</div></div>'; l.querySelector('input').onchange=ev=>{ ev.target.checked?sel.add(n):sel.delete(n); setTimeout(render, 30); }; list.appendChild(l); }); d.querySelector('.go').textContent='Add '+sel.size+' arena'+(sel.size===1?'':'s'); }
    f.addEventListener('input', render); render();
    d.querySelector('.go').onclick=()=>{ banks[bi].games.push(...[...sel].sort()); d.remove(); draw(); };
    d.querySelector('.cl').onclick=()=>d.remove();
  }
  function openRo(bi){
    let order=[...banks[bi].games], picked=-1;
    const d = dlg('<div class=rows></div><button class=sv>Save</button><button class=cn>Cancel</button>');
    function render(){ const r=d.querySelector('.rows'); r.innerHTML=''; order.forEach((g,i)=>{ if(picked===i) return; const b=document.createElement('button'); b.style.display='block'; b.textContent='A'+(i+1)+' '+(picked<0?g:'Move to arena '+(i+1)); b.onclick=()=>{ if(picked<0){picked=i;} else { const [x]=order.splice(picked,1); order.splice(i,0,x); picked=-1; } render(); }; r.appendChild(b); }); }
    render();
    d.querySelector('.sv').onclick=()=>{ banks[bi].games=order; d.remove(); draw(); };
    d.querySelector('.cn').onclick=()=>d.remove();
  }
  window.__banks = banks;
  </script></body></html>`;
  await page.route('https://app.matchplay.events/**', route => { const u = new URL(route.request().url()), json = d => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(d) }); if (u.pathname.startsWith('/api/')) return json({ data: [], meta: { last_page: 1 } }); return route.fulfill({ status: 200, contentType: 'text/html', body: MOCK }); });
  await page.goto(`https://app.matchplay.events/tournaments/280073/banks`);
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 'test-token', open: true, tab: 'status' })));
  await page.addScriptTag({ content: bundle });
  page.on('load', () => { page.addScriptTag({ content: bundle }).catch(() => {}); });   // like Chrome re-running the extension after a reload
  if (!process.env.NOFRAME) page.on('framenavigated', f => { if (f !== page.mainFrame()) f.waitForLoadState('domcontentloaded').then(() => f.addScriptTag({ content: bundle })).catch(() => {}); });   // the extension runs in the worker frame too (all_frames)
  await page.waitForTimeout(6000);
  const R = id => `document.getElementById('${id}').shadowRoot`;
  await page.evaluate(s => eval(s).querySelector('[data-act=refresh]').click(), R('tdp-bankbar'));
  await page.waitForTimeout(1200);
  const plan = await page.evaluate(s => [...eval(s).querySelectorAll('.bk .card')].map(c => [...c.querySelectorAll('li .ell')].map(x => x.textContent.replace(' repeat', '').trim())), R('tdp-bb-modal'));
  console.log('plan', JSON.stringify(plan));
  await page.evaluate(s => eval(s).querySelector('[data-act=confirm]').click(), R('tdp-bb-modal')); const tStart = Date.now(); await page.evaluate(() => { window.__tl = []; const t0 = Date.now(); TDP.jobs.on(j => { if (j && j.sub) { const k = j.sub.text; if (!window.__tl.length || window.__tl[window.__tl.length - 1][1] !== k) window.__tl.push([Date.now() - t0, k]); } }); });
  const samples = [];
  for (let k = 0; k < 200; k++) {
   try {
    await page.waitForTimeout(250);
    const v = await page.evaluate(() => { const h = document.getElementById('tdp-cover') || document.getElementById('tdp-busy-card'); if (!h) return null; const c = h.shadowRoot.querySelector('.tdpc-card'); return (h.id === 'tdp-cover' ? 'COVER ' : 'CARD ') + (c ? c.innerText.split('\n').slice(1, 3).join(' | ') : ''); });
    if (v && samples[samples.length - 1] !== v) samples.push(v);
    if (k === 6) await page.screenshot({ path: `${out}/b-progress.png` });
    const st = await page.evaluate(() => { if (!window.TDP || !TDP.jobs) return 'run'; const j = TDP.jobs.get(); return !j ? 'run' : j.done ? 'done' : j.error ? 'error: ' + j.error : 'run'; });
    if (st !== 'run') { console.log('state', st, 'seconds', ((Date.now() - tStart) / 1000).toFixed(1)); break; }
   } catch (e) { await page.waitForTimeout(500); }
  }
  /* timeline lost on reload */
  console.log('progress:\n ' + samples.slice(0, 12).join('\n ')); console.log('frame used:', await page.evaluate(() => (TDP.jobs.get() || {}).runner)); console.log('banks now', JSON.stringify(await page.evaluate(() => window.__banks.map(b => b.games))));
  console.log('errors', errors.filter(e => !/ERR_TUNNEL|Failed to load resource/.test(e)).slice(0, 5));
  await browser.close();
})();
