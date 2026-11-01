// Items 73 + 75: the 1, 2, 3, 4 boxes (like Assign Bank/Order) wherever results or a player order are entered:
//  - Matchplay's Results window (a box per player, in one column between the names and the circles - the circles
//    follow the boxes and the boxes follow the circles)
//  - Matchplay's Change player order window (box, then a gray P1/P2…, then the name; typing moves the player there)
//  - the extension's own tiebreaker results grid (ties.js uses assign/toFinish/attach)
// Click a box: only the free numbers to pick; type 1…N (others shift to make room); Tab to the next box; the last one
// fills itself; clicking away keeps the number. Nothing is saved until Matchplay's own Save.
var TDP = window.TDP || (window.TDP = {});

TDP.orderbox = (() => {
  const T = TDP;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // order: {id: number}. id gets v: whoever had v shifts to the nearest free number below (else above); when one
  // player is left without a number they get the one left. Returns a new order.
  function assign(order, ids, id, v) {
    const ord = { ...order }, n = ids.length; id = String(id);
    Object.keys(ord).forEach(k => { if (ord[k] == null) delete ord[k]; });
    delete ord[id];
    const holder = k => Object.keys(ord).find(p => ord[p] === k);
    if (holder(v)) {
      let free = null; for (let k = v - 1; k >= 1; k--) if (!holder(k)) { free = k; break; }
      if (free != null) { for (let k = free + 1; k <= v; k++) { const h = holder(k); if (h) ord[h] = k - 1; } }
      else { for (let k = v + 1; k <= n; k++) if (!holder(k)) { free = k; break; } for (let k = free - 1; k >= v; k--) { const h = holder(k); if (h) ord[h] = k + 1; } }
    }
    ord[id] = v;
    const left = ids.map(String).filter(p => !ord[p]);
    if (left.length === 1) { const used = new Set(Object.values(ord)); for (let k = 1; k <= n; k++) if (!used.has(k)) { ord[left[0]] = k; break; } }
    return ord;
  }
  // a finish list (finish[i] = player at place i+1) with id moved to place v
  function toFinish(finish, ids, id, v) {
    const ord = {}; (finish || []).forEach((p, i) => { if (p != null) ord[p] = i + 1; });
    const o = assign(ord, ids, id, v), f = Array(ids.length).fill(null);
    for (const [p, k] of Object.entries(o)) f[k - 1] = isNaN(+p) ? p : +p;
    return f;
  }

  // ---------- one box ----------
  const dark = () => document.documentElement.classList.contains('dark');
  const css = () => dark()
    ? 'width:36px;height:28px;box-sizing:border-box;text-align:center;border:1px solid #6366f1;border-radius:6px;font:600 13px ui-sans-serif,system-ui,sans-serif;color:#fff;background:#4b5563;padding:0;margin:0'
    : 'width:36px;height:28px;box-sizing:border-box;text-align:center;border:1px solid #a5b4fc;border-radius:6px;font:600 13px ui-sans-serif,system-ui,sans-serif;color:#111827;background:#fff;padding:0;margin:0';
  let menu = null;
  function closeMenu() { if (menu) menu.remove(); menu = null; }
  // input: a text box; o = { n, value(), free() -> [numbers], pick(v) }
  function attach(input, o) {
    input.type = 'text'; input.inputMode = 'numeric'; input.autocomplete = 'off'; input.maxLength = 2;
    input.title = `Click to pick, or type 1-${o.n}`;
    input.addEventListener('keydown', e => {
      if (e.key === 'Tab') { closeMenu(); return; }
      e.preventDefault(); e.stopPropagation();
      if (e.key === 'Escape') return closeMenu();
      const v = parseInt(e.key, 10);
      if (v >= 1 && v <= o.n) { closeMenu(); o.pick(v); }   // anything else is ignored
    });
    input.addEventListener('focus', () => show(input, o));
    input.addEventListener('mousedown', () => { if (document.activeElement === input) show(input, o); });
    input.addEventListener('blur', () => setTimeout(() => { if (menu && menu.dataset.for === input.dataset.obId && !menu.contains(document.activeElement)) closeMenu(); }, 120));
    input.dataset.obId = input.dataset.obId || Math.random().toString(36).slice(2);
    return input;
  }
  // the list of free numbers under the box
  function show(input, o) {
    closeMenu();
    const list = o.free(); if (!list.length) return;
    menu = document.createElement('div'); menu.dataset.tdp = 'obmenu'; menu.dataset.for = input.dataset.obId;
    menu.style.cssText = `position:fixed;z-index:2147483600;display:flex;gap:4px;padding:4px;border-radius:6px;box-shadow:0 6px 16px rgba(0,0,0,.2);background:${dark() ? '#374151' : '#fff'};border:1px solid ${dark() ? '#4b5563' : '#e5e7eb'}`;
    const r = input.getBoundingClientRect();
    menu.style.left = Math.max(4, r.left) + 'px'; menu.style.top = (r.bottom + 2) + 'px';
    for (const k of list) {
      const b = document.createElement('button'); b.type = 'button'; b.tabIndex = -1; b.textContent = k;
      b.style.cssText = `width:30px;height:28px;border:1px solid ${dark() ? '#6b7280' : '#e5e7eb'};border-radius:5px;background:${String(o.value()) === String(k) ? '#e0e7ff' : (dark() ? '#4b5563' : '#fff')};color:${dark() ? '#fff' : '#111827'};font:600 13px ui-sans-serif,system-ui,sans-serif;cursor:pointer`;
      b.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); closeMenu(); o.pick(k); });
      menu.appendChild(b);
    }
    // inside the open dialog (Matchplay's dialogs close on a click outside them)
    (input.closest('[role=dialog]') || document.body).appendChild(menu);
  }
  const mkInput = () => { const i = document.createElement('input'); i.dataset.tdp = 'ob'; i.style.cssText = css(); return i; };

  // ---------- Matchplay's Results window ----------
  // columns: the names (flex-1) then one w-10 column per place, each with a circle per player; a picked place shows
  // no circle in its cell
  function resultsParts(d) {
    if (!/^\s*Results for/.test(T.txt(d))) return null;
    const cols = [...d.querySelectorAll('div.w-10')].filter(c => c.querySelectorAll('div.h-10').length);
    if (!cols.length) return null;
    const nameCol = cols[0].previousElementSibling && !cols[0].previousElementSibling.matches('[data-tdp=obcol]') ? cols[0].previousElementSibling : (cols[0].previousElementSibling && cols[0].previousElementSibling.previousElementSibling);
    if (!nameCol) return null;
    const names = [...nameCol.children].slice(1).map(e => T.txt(e));
    if (names.length !== cols[0].querySelectorAll('div.h-10').length) return null;
    return { cols, nameCol, names, cell: (c, r) => cols[c].querySelectorAll('div.h-10')[r] };
  }
  function resultsState(P) {
    const pos = {};
    P.names.forEach((_, r) => { for (let c = 0; c < P.cols.length; c++) { const cell = P.cell(c, r); if (cell && !cell.querySelector('.rounded-full')) { pos[r] = c + 1; break; } } });
    return pos;
  }
  let syncing = false;
  const tap = el => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));   // (works on the SVG check too)
  // make the circles match order {row: place}: one click at a time (Matchplay redraws after each); a place no box asks
  // for any more is clicked again (the check) to take it off
  async function resultsSet(d, order) {
    syncing = true;
    try {
      for (let k = 0; k < 40; k++) {
        const P = resultsParts(d); if (!P) return;
        const now = resultsState(P);
        const r = Object.keys(order).find(x => order[x] && now[x] !== order[x]);
        if (r != null) {
          const circle = P.cell(order[r] - 1, +r) && P.cell(order[r] - 1, +r).querySelector('.rounded-full');
          if (!circle) return;
          tap(circle); await sleep(60); continue;
        }
        const extra = Object.keys(now).find(x => !order[x]);
        if (extra == null) return;
        const cell = P.cell(now[extra] - 1, +extra), el = cell && (cell.firstElementChild || cell);
        if (!el) return;
        tap(el); await sleep(60);
      }
    } finally { syncing = false; drawResults(d); }
  }
  function drawResults(d) {
    const P = resultsParts(d); if (!P) return;
    let col = d.querySelector('[data-tdp=obcol]');
    const n = P.names.length, st = resultsState(P);
    if (!col) {
      col = document.createElement('div'); col.dataset.tdp = 'obcol';
      col.style.cssText = 'flex:none;width:48px;text-align:center';
      P.cols[0].before(col);
    }
    const head = col.querySelector('[data-ob=head]') || (() => { const h = document.createElement('div'); h.dataset.ob = 'head'; h.className = P.cols[0].firstElementChild.className; h.style.cssText = 'font-size:11px'; col.appendChild(h); return h; })();
    const any = Object.keys(st).length;
    const hh = any ? '<button type="button" data-ob="clear" style="background:none;border:0;padding:0;color:#4f46e5;font:500 11px ui-sans-serif,system-ui,sans-serif;cursor:pointer;text-decoration:underline">Clear</button>' : '&nbsp;';
    if (head.dataset.h !== hh) { head.dataset.h = hh; head.innerHTML = hh; const c = head.querySelector('[data-ob=clear]'); if (c) c.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); resultsSet(d, {}); }); }
    while (col.querySelectorAll('[data-ob=row]').length < n) {
      const r = col.querySelectorAll('[data-ob=row]').length, row = document.createElement('div');
      row.dataset.ob = 'row'; row.className = P.cell(0, 0).className; row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.justifyContent = 'center'; row.style.paddingTop = row.style.paddingBottom = '0';
      const inp = mkInput(); row.appendChild(inp); col.appendChild(row);
      attach(inp, {
        n, value: () => resultsState(resultsParts(d))[r] || '',
        free: () => { const s = resultsState(resultsParts(d)); const used = new Set(Object.entries(s).filter(([k]) => +k !== r).map(([, v]) => v)); return [...Array(n)].map((_, k) => k + 1).filter(k => !used.has(k)); },
        pick: v => { const s = resultsState(resultsParts(d)); const o = assign(s, P.names.map((_, i) => i), r, v); const o2 = {}; Object.entries(o).forEach(([k, x]) => { o2[k] = x; }); resultsSet(d, o2).then(() => { const nx = col.querySelectorAll('input[data-tdp=ob]')[r]; if (nx && document.activeElement !== nx) nx.focus(); }); },
      });
    }
    col.querySelectorAll('input[data-tdp=ob]').forEach((inp, r) => { const v = String(st[r] || ''); if (inp.value !== v) inp.value = v; });
    // only one player and one place left (however the others were entered): it fills itself
    const left = P.names.map((_, r) => r).filter(r => !st[r]), used = new Set(Object.values(st));
    if (!syncing && n > 1 && left.length === 1) { const k = [...Array(n)].map((_, i) => i + 1).find(i => !used.has(i)); if (k) resultsSet(d, { ...st, [left[0]]: k }); }
  }

  // ---------- Matchplay's Change player order window ----------
  function orderParts(d) {
    if (!/Change player order/.test(T.txt(d))) return null;
    const lis = [...d.querySelectorAll('ul > li')].filter(li => li.querySelector('button'));
    if (!lis.length) return null;
    const nameOf = li => { const nd = li.querySelector('button .flex-1'); return nd ? ([...nd.childNodes].filter(x => x.nodeType === 3).map(x => x.textContent).join('').trim() || T.txt(nd.firstChild || nd)) : ''; };
    return { lis, names: lis.map(nameOf), btn: li => li.querySelector('button') };
  }
  const original = new WeakMap();
  async function orderSet(d, want) {
    syncing = true;
    try {
      for (let k = 0; k < want.length * 3; k++) {
        const P = orderParts(d); if (!P) return;
        const i = P.names.findIndex((n, j) => n !== want[j]); if (i < 0) return;
        const j = P.names.indexOf(want[i]); if (j < 0) return;
        tap(P.btn(P.lis[j])); await sleep(80);   // pick the player…
        const P2 = orderParts(d); tap(P2.btn(P2.lis[i])); await sleep(120);   // …then "Move to player i+1"
      }
    } finally { syncing = false; drawOrder(d); }
  }
  function drawOrder(d) {
    const P = orderParts(d); if (!P) return;
    if (!original.has(d)) original.set(d, P.names.slice());
    const n = P.names.length;
    P.lis.forEach((li, i) => {
      li.style.display = 'flex'; li.style.alignItems = 'center'; li.style.gap = '8px';
      const pdiv = li.querySelector('button > div'); if (pdiv && pdiv.style.color !== 'rgb(156, 163, 175)') pdiv.style.color = '#9ca3af';   // P1, P2… in gray
      let inp = li.querySelector(':scope > input[data-tdp=ob]');
      if (!inp) {
        inp = mkInput(); li.prepend(inp);
        attach(inp, {
          n, value: () => { const Q = orderParts(d); return Q ? Q.names.indexOf(inp.dataset.name) + 1 : ''; },
          free: () => [...Array(n)].map((_, k) => k + 1).filter(k => { const Q = orderParts(d); return Q && Q.names[k - 1] !== inp.dataset.name; }),
          pick: v => {
            const Q = orderParts(d); if (!Q) return;
            const ord = {}; Q.names.forEach((nm, k) => { ord[nm] = k + 1; });
            const o = assign(ord, Q.names, inp.dataset.name, v), want = Object.entries(o).sort((a, b) => a[1] - b[1]).map(x => x[0]);
            orderSet(d, want);
          },
        });
      }
      inp.dataset.name = P.names[i];
      const v = String(i + 1); if (inp.value !== v) inp.value = v;
    });
    const foot = [...d.querySelectorAll('button')].find(b => T.txt(b) === 'Flip order');
    if (foot && !d.querySelector('[data-ob=oclear]')) {
      const c = document.createElement('button'); c.type = 'button'; c.dataset.ob = 'oclear'; c.dataset.tdp = 'ob'; c.className = foot.className; c.textContent = 'Clear';
      c.title = 'Back to the order this window opened with';
      c.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); orderSet(d, original.get(d) || []); });
      foot.after(c);
    }
  }

  // ---------- watch for the windows ----------
  function scan() {
    if (T.settings.off || T.dead) return;
    const d = T.dialog(); if (!d || syncing) return;
    try { drawResults(d); drawOrder(d); } catch (e) { T.warn('orderbox', e); }
  }
  let t = null;
  if (!T.isFrame) new MutationObserver(ms => {
    if (ms.every(m => m.target.closest && m.target.closest('[data-tdp]'))) return;
    if (!t) t = setTimeout(() => { t = null; scan(); }, 40);
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  return { assign, toFinish, attach, mkInput, scan };
})();
