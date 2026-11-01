// 0.22.0: linked-event links row (78), token section (77), Manage cutoffs + IFPA box in Matchplay's cutoff window
// (72), number boxes in Matchplay's Results / Change player order windows (73/75), Create page cutoffs + finals (79).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const out = process.argv[2] || '.';
const q = F.qual; q.status = 'started'; q.playoffsCutoffs = [{ index: 0, value: 8, cumulative: 8, text: 'A FINALS CUTOFF', color: 'green' }, { index: 1, value: 8, cumulative: 16, text: 'B FINALS CUTOFF', color: 'fuchsia' }];
const TAB = 'whitespace-nowrap border-b-2 border-solid px-1 pb-1 text-sm font-medium focus:outline-none inline-block';
const nav = (tid, cur) => `<div class="border-b border-gray-200 dark:border-gray-700 px-2 sm:px-0 pt-4"><nav class="-mb-px space-x-2 sm:space-x-8">${['', '/players', '/arenas', '/matches', '/standings'].map(p => `<a class="${TAB} ${p === cur ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-default'}" href="/tournaments/${tid}${p}"${p === cur ? ' aria-current="page"' : ''}>${p ? p.slice(1) : 'Overview'}</a>`).join('')}</nav></div>`;
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1300, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: q, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds }); if (p.match(/\/games$/)) return json({ data: F.games, meta: { last_page: 1 } });
    return json({ data: [] }); });
  const players = q.players.slice(0, 4).map(p => `<tr><td><a href="/players/${p.playerId}">${p.name}</a></td></tr>`).join('');
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><a href="/tournaments/280051/edit">Edit</a><h1>test matchplay addon</h1>${nav(280051, '/players')}<div><button>Add players</button><button>Actions</button><table>${players}</table></div></main></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051/players');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(4000);

  // 78: links row under the tabs, Matchplay's tab classes; click -> same page on that event, same tab
  console.log('links row:', await page.evaluate(() => { const r = document.getElementById('tdp-links'); return r ? [...r.querySelectorAll('a')].map(a => a.textContent + ' -> ' + a.getAttribute('href')).join(' | ') + ' | classes match: ' + r.querySelector('a').className.includes('border-b-2') : 'none'; }));
  await page.evaluate(() => { window.__nav = []; addEventListener('popstate', () => window.__nav.push(location.pathname)); document.querySelector('#tdp-links a').click(); });
  await page.waitForTimeout(300);
  console.log('after click:', await page.evaluate(() => location.pathname + ' | popstate: ' + window.__nav.join(',')));
  await page.evaluate(() => { history.replaceState(null, '', '/tournaments/280051/players'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.waitForTimeout(5000);
  console.log('state:', await page.evaluate(() => JSON.stringify([TDP.data.D.tid, TDP.data.D.isTD, TDP.routePage(), !!document.querySelector('main table'), !!(TDP.data.D.qual)])));

  // 72: Cutoffs bar + Manage cutoffs window -> job steps
  console.log('cutoff bar:', await page.evaluate(() => { const h = document.getElementById('tdp-cut-bar'); return h ? h.shadowRoot.querySelector('.card').innerText.replace(/\s+/g, ' ').trim().slice(0, 160) : 'none'; }));
  await page.evaluate(() => { TDP.jobs.start = async (t, s) => { window.__job = { t, s }; }; document.getElementById('tdp-cut-bar').shadowRoot.querySelector('[data-act=open]').click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const r = document.getElementById('tdp-cut-dlg').shadowRoot, i = r.querySelector('input[data-f=rank]'); i.value = '1000'; i.dispatchEvent(new Event('input', { bubbles: true })); r.querySelector('[data-act=add]').click(); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { const r = document.getElementById('tdp-cut-dlg').shadowRoot, i = r.querySelectorAll('input[data-f=rank]')[1]; i.value = '3000'; i.dispatchEvent(new Event('input', { bubbles: true })); r.querySelector('input[data-f=text]').dispatchEvent(new Event('input')); });
  await page.evaluate(() => document.getElementById('tdp-cut-dlg').shadowRoot.querySelector('[data-act=add]').click()); await page.waitForTimeout(150);
  await page.evaluate(() => { const r = document.getElementById('tdp-cut-dlg').shadowRoot; [...r.querySelectorAll('[data-act=rm]')].pop().click(); });
  await page.waitForTimeout(150);
  console.log('window labels:', await page.evaluate(() => { const r = document.getElementById('tdp-cut-dlg').shadowRoot; const i = r.querySelectorAll('input[data-f=rank]')[1]; i.value = '3000'; i.dispatchEvent(new Event('input')); return r.querySelector('.db').innerText.replace(/\n+/g, ' | ').slice(0, 400); }));
  await page.screenshot({ path: out + '/cutoffs.png' });
  await page.evaluate(() => document.getElementById('tdp-cut-dlg').shadowRoot.querySelector('[data-act=save]').click()); await page.waitForTimeout(500);
  console.log('save job:', await page.evaluate(() => JSON.stringify(window.__job && window.__job.s.map(x => x.op + (x.args.ranges ? ' ' + x.args.ranges.map(r => `${r.from}-${r.to}:${r.label}`).join(',') : x.args.lines ? ' ' + x.args.lines.map(l => l.above).join('/') : '')))), '| saved cuts:', await page.evaluate(() => JSON.stringify(TDP.tstate[280051].divs)));

  // 72: Matchplay's own Manage cutoffs window gets an IFPA rank box from cutoff 2
  await page.evaluate(() => { const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.innerHTML = [1, 2].map(i => `<div><div>Cutoff ${i}<button>Remove</button></div><label>Players above cutoff</label><div class="mt-1"><div class="flex"><button>-</button><div><input type="text" value="8"></div><button>+</button></div></div><input type="text" value="X FINALS"></div>`).join('') + '<button>Add another cutoff</button><button>Update</button><button>Cancel</button>'; document.body.appendChild(d); });
  await page.waitForTimeout(400);
  console.log('MP cutoff window IFPA boxes:', await page.evaluate(() => [...document.querySelectorAll('[data-tdp=ifpa-in]')].map(i => i.value || '(empty)').join(',')));
  await page.evaluate(() => { document.querySelector('[data-tdp=ifpa-in]').value = '750'; [...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent === 'Update').click(); document.querySelector('[role=dialog]').remove(); });
  await page.waitForTimeout(400);
  console.log('cuts after MP Update:', await page.evaluate(() => JSON.stringify(TDP.tstate[280051].divs.B)));

  // 73: Matchplay's Results window (mocked): boxes column; typing sets the circles; circles update the boxes
  await page.evaluate(() => {
    const names = ['Ann', 'Bob', 'Cy', 'Di']; let sel = {};
    const d = document.createElement('div'); d.setAttribute('role', 'dialog'); document.body.appendChild(d);
    const draw = () => {
      d.innerHTML = `<div>Results for Gaucho</div><div class="flex flex-row"><div class="flex-1 truncate"><div class="mb-2 text-sm"></div>${names.map(n => `<div class="cursor-pointer truncate pr-2 py-2 leading-6">${n}</div>`).join('')}</div>${names.map((_, c) => `<div class="w-10 flex-shrink-0 flex-grow-0 text-center"><div class="pb-2 text-sm">${c + 1}</div>${names.map((_, r) => `<div class="h-10 py-2 leading-6">${sel[r] === c + 1 ? `<svg data-c="${c}" data-r="${r}" width="24" height="24"></svg>` : `<div class="rounded-full w-6 h-6" data-c="${c}" data-r="${r}"></div>`}</div>`).join('')}</div>`).join('')}</div><button>Save</button><button>Cancel</button>`;
    };
    d.addEventListener('click', e => { const x = e.target.closest('[data-c]'); if (!x || e.target.closest('[data-tdp]')) return; const c = +x.dataset.c + 1, r = +x.dataset.r; if (sel[r] === c) delete sel[r]; else { for (const k of Object.keys(sel)) if (sel[k] === c) delete sel[k]; sel[r] = c; } setTimeout(draw, 10); });
    window.__res = () => JSON.stringify(sel); draw();
  });
  await page.waitForTimeout(400);
  const boxes = () => page.evaluate(() => [...document.querySelectorAll('[role=dialog] input[data-tdp=ob]')].map(i => i.value || '_').join(''));
  console.log('results boxes:', await boxes());
  await page.locator('[role=dialog] input[data-tdp=ob]').nth(2).click(); await page.keyboard.type('1'); await page.waitForTimeout(400);
  console.log('Cy typed 1 -> circles', await page.evaluate(() => window.__res()), '| boxes', await boxes());
  await page.locator('[role=dialog] input[data-tdp=ob]').nth(0).click(); await page.keyboard.type('1'); await page.waitForTimeout(600);
  console.log('Ann typed 1 -> circles', await page.evaluate(() => window.__res()), '| boxes', await boxes());
  await page.evaluate(() => document.querySelector('[role=dialog] [data-c="3"][data-r="3"]').click()); await page.waitForTimeout(400);
  console.log('Di circle 4th clicked -> boxes', await boxes());
  await page.screenshot({ path: out + '/results.png' });
  await page.evaluate(() => document.querySelector('[data-ob=clear]').click()); await page.waitForTimeout(800);
  console.log('Clear -> circles', await page.evaluate(() => window.__res()), '| boxes', await boxes());
  await page.evaluate(() => document.querySelector('[role=dialog]').remove());

  // 75: Change player order (mocked): box, gray P#, name; typing moves the player
  await page.evaluate(() => {
    let names = ['Ann', 'Bob', 'Cy', 'Di'], pick = null;
    const d = document.createElement('div'); d.setAttribute('role', 'dialog'); document.body.appendChild(d);
    const draw = () => { d.innerHTML = `<div>Change player order</div><ul>${names.map((n, i) => `<li><button class="flex"><div class="flex-none w-8 h-8 mr-2 text-lg">${pick != null && pick !== i ? '' : 'P' + (i + 1)}</div><div class="flex-1 truncate text-left">${n}<div class="text-xs">Seed: ${i}</div></div></button></li>`).join('')}</ul><button>Save</button><button>Cancel</button><button>Flip order</button>`; };
    d.addEventListener('click', e => { const b = e.target.closest('li button'); if (!b) return; const i = [...d.querySelectorAll('li button')].indexOf(b); if (pick == null) pick = i; else { const n = names.splice(pick, 1)[0]; names.splice(i, 0, n); pick = null; } setTimeout(draw, 10); });
    window.__ord = () => names.join(','); draw();
  });
  await page.waitForTimeout(400);
  console.log('order row:', await page.evaluate(() => { const li = document.querySelector('[role=dialog] li'); return [...li.children].map(c => c.tagName).join('+') + ' | P color ' + getComputedStyle(li.querySelector('button > div')).color; }));
  await page.locator('[role=dialog] li input').nth(3).click(); await page.keyboard.type('1'); await page.waitForTimeout(900);
  console.log('Di typed 1 ->', await page.evaluate(() => window.__ord()), '| boxes', await page.evaluate(() => [...document.querySelectorAll('[role=dialog] li input')].map(i => i.value).join('')));
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent === 'Clear').click()); await page.waitForTimeout(1200);
  console.log('Clear ->', await page.evaluate(() => window.__ord()));
  await page.screenshot({ path: out + '/order.png' });
  await page.evaluate(() => document.querySelector('[role=dialog]').remove());

  // 74: timers text; 77: token section
  console.log('timer text:', await page.evaluate(() => { const e = document.createElement('div'); e.dataset.tdp = 'timer'; e.className = 'tdp-ge'; e.dataset.est = '1560'; e.dataset.start = String(Date.now() - 60000); document.querySelector('main').appendChild(e); const g = document.createElement('div'); g.dataset.tdp = 'timer'; g.className = 'tdp-gt'; g.dataset.start = String(Date.now() - 754000); document.querySelector('main').appendChild(g); return 'ok'; }));
  await page.waitForTimeout(1600);
  console.log('group / game:', await page.evaluate(() => document.querySelector('.tdp-ge').textContent + ' / ' + document.querySelector('.tdp-gt').textContent));
  await page.evaluate(async () => { await TDP.saveSettings({ token: '' }); TDP.panel.render(); });
  await page.waitForTimeout(500);
  console.log('token section:', await page.evaluate(() => { const h = document.getElementById('tdp-token'); return h ? h.shadowRoot.querySelector('.card').innerText.replace(/\s+/g, ' ').trim().slice(0, 220) : 'none'; }));
  await page.screenshot({ path: out + '/token.png' });
  console.log('errors', errors); await browser.close();
})();
