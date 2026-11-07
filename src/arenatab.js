// Matchplay's Arenas tab: three extra columns and a "Game times from" bar.
//  - Display: EM / SS / DMD / LCD (LCD from Matchplay's OPDB data), with a per-arena override the TD can set
//  - This event: running average from this tournament's finished games
//  - Combined: this event + qualifying + Matchplay IDs + ticked past events (what Bank Builder uses); hover = breakdown
var TDP = window.TDP || (window.TDP = {});

TDP.arenatab = (() => {
  const T = TDP;
  const lc = s => String(s || '').toLowerCase();
  const COL = 'data-tdp-col';
  let extra = null, extraAt = 0, extraBusy = false;

  async function refreshExtra(D) {
    if (extraBusy) return; extraBusy = true;
    try { extra = await T.bankplan.extras(D); } catch (e) { extra = extra || {}; } finally { extraAt = Date.now(); extraBusy = false; }
  }

  function render(D) {
    const table = T.routePage() === 'arenas' && D && D.t && D.isTD ? document.querySelector('main table') : null;
    if (!table) { document.querySelectorAll(`[${COL}]`).forEach(e => e.remove()); T.inpage.block('tdp-arena-times', null); const gb = document.getElementById('tdp-gtbtn'); if (gb) gb.remove(); return; }
    if (!extraBusy && (!extra || Date.now() - extraAt > 60e3)) refreshExtra(D).then(() => render(T.data.D));
    const st = T.tstate[D.tid] || {}, src = T.bankplan.sources(D, st, extra || {}), am = T.data.arenaMap(D.t);
    // header
    const ths = [...table.querySelectorAll('thead th')];
    const catTh = ths.find(th => /^category$/i.test(T.txt(th)));
    if (!catTh) return;
    if (!table.querySelector(`thead [${COL}]`)) {
      const mk = (text, title) => { const th = catTh.cloneNode(false); th.setAttribute(COL, '1'); th.textContent = text; if (title) th.title = title; return th; };
      const a = mk('Display', 'EM / SS / DMD / LCD used by Bank Builder and tiebreaker draws. LCD comes from OPDB; change it with the menu.');
      const b = mk('This event', "Average game time from this tournament's finished games");
      const c = mk('Combined', 'This event + qualifying + Matchplay IDs + ticked past events, weighted by games. Bank Builder uses this. Hover a time for the breakdown.');
      catTh.after(a); a.after(b); b.after(c);
    }
    // rows
    const catIdx = [...catTh.parentElement.children].indexOf(catTh);
    for (const tr of table.querySelectorAll('tbody tr')) {
      const link = tr.querySelector('a[href*="/arenas/"]'); if (!link) continue;
      const id = Number((link.getAttribute('href').match(/\/arenas\/(\d+)/) || [])[1]), a = am[id];
      if (!a) continue;
      let cells = [...tr.querySelectorAll(`[${COL}]`)];
      const catTd = tr.children[catIdx];
      if (cells.length !== 3 && catTd) {
        cells.forEach(c => c.remove());
        cells = [0, 1, 2].map(() => { const td = catTd.cloneNode(false); td.setAttribute(COL, '1'); return td; });
        catTd.after(cells[0]); cells[0].after(cells[1]); cells[1].after(cells[2]);
      }
      if (cells.length !== 3) continue;
      // display + override
      const cur = T.cats.of(a), mp = T.cats.mpCat(a), ov = T.cats.overrides()[a.arenaId] || '', disp = T.cats.display(a);
      const auto = ov ? (T.cats.opdbCat(a) === 'LCD' && (mp === 'DMD' || mp === 'Unknown') ? 'LCD' : mp) : cur;
      const key = `${cur}|${ov}|${disp}`;
      if (cells[0].dataset.k !== key) {
        cells[0].dataset.k = key;
        const why = ov ? `Your override (Matchplay: ${mp}${disp ? ', OPDB: ' + disp : ''})` : disp ? `OPDB display: ${disp} · Matchplay: ${mp}` : `Matchplay: ${mp} (OPDB not checked yet)`;
        cells[0].innerHTML = `<select data-tdp-cat="${a.arenaId}" title="${T.esc(why)}" style="font:inherit;font-size:13px;border:1px solid #d1d5db;border-radius:6px;padding:2px 22px 2px 6px;background-color:transparent;color:inherit">
          <option value="">Auto: ${auto}</option>${T.cats.CATS.map(c => `<option value="${c}" ${ov === c ? 'selected' : ''}>${c}</option>`).join('')}</select>${cur !== mp ? `<div style="font-size:11px;opacity:.7">Matchplay: ${mp}</div>` : ''}`;
      }
      // times
      const v = src[lc(a.name)] || {};
      const live = v.live ? `${T.fmtDur(v.live.avg)} <span style="opacity:.6">(${v.live.count})</span>` : '<span style="opacity:.5">–</span>';
      const est = (T.banks.ERA_DEFAULT_SEC[cur] || T.banks.ERA_DEFAULT_SEC.Unknown) * 1000;
      const comb = v.combined ? `<span title="${T.esc(T.bankplan.breakdownText(v))}" style="cursor:help;border-bottom:1px dotted currentColor">${T.fmtDur(v.combined.avg)}</span> <span style="opacity:.6">(${v.combined.count})</span>` : `<span title="No finished games anywhere yet: Bank Builder uses an era estimate" style="opacity:.55">~${T.fmtDur(est)} era</span>`;
      if (cells[1].dataset.k !== live) { cells[1].dataset.k = live; cells[1].innerHTML = live; }
      if (cells[2].dataset.k !== comb) { cells[2].dataset.k = comb; cells[2].innerHTML = comb; }
    }
    // item 84: one "Game times" button right after Matchplay's Add arenas (the old "Game times from" bar is gone)
    autoLocal(D);
    T.inpage.block('tdp-arena-times', null);
    button(D, st);
  }
  function button(D, st) {
    const add = [...document.querySelectorAll('main button, main a')].find(b => /^Add arenas$/i.test(T.txt(b)) && !b.closest('[data-tdp]'));
    let b = document.getElementById('tdp-gtbtn');
    if (!add) { if (b) b.remove(); return; }
    const ids = (st.bankPast || '').match(/\d+/g) || [];
    const label = `Game times${ids.length ? ` · ${ids.length} ID${ids.length === 1 ? '' : 's'}` : ''}`;
    const anchor = add.closest('span.inline-flex, span.rounded-md') || add;
    if (!b) {
      b = document.createElement('span'); b.id = 'tdp-gtbtn'; b.dataset.tdp = 'gtbtn';
      b.innerHTML = '<button type="button"></button>';
      b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openWin(T.data.D); });
    }
    // the same button look (and wrapper) as Matchplay's Add arenas, right after it
    if (anchor !== add) b.className = anchor.className; else b.style.marginLeft = '8px';
    const btn = b.firstElementChild; btn.className = add.className;
    if (btn.textContent !== label) btn.textContent = label;
    if (b.previousElementSibling !== anchor) anchor.after(b);
  }

  // ---------- the Game times window ----------
  let host = null;
  function openWin(D) {
    if (!host) { host = document.createElement('div'); host.id = 'tdp-gt-dlg'; host.attachShadow({ mode: 'open' }); host.shadowRoot.addEventListener('click', onWin); document.documentElement.appendChild(host); }
    drawWin(D);
  }
  function closeWin() { if (host) host.remove(); host = null; }
  function drawWin(D, msg) {
    if (!host) return;
    const st = T.tstate[D.tid] || {}, isFinals = D.qual && D.qual.tournamentId !== D.tid;
    const live = Object.values(T.timing.arenaTimes(D.games)).reduce((s, x) => s + x.count, 0);
    const qn = extra && extra.qual ? Object.values(extra.qual).reduce((s, x) => s + x.count, 0) : 0;
    const hn = (st.histUse || []).length, miss = missingFromQual(D);
    const info = st.pastInfo || [];
    const rows = [`<li>This event · <b>${live}</b> games</li>`];
    if (isFinals) rows.push(`<li>Qualifying (${T.esc(D.qual.name || '')}) · <b>${qn}</b> games <span class="small muted">- included automatically</span></li>`);
    if (st.pastTimes) rows.push(`<li>Other Match Play IDs · <b>${Object.values(st.pastTimes).reduce((s, x) => s + x.count, 0)}</b> games</li>`);
    if (hn) rows.push(`<li>Past events ticked in Bank Builder ⚙ Settings · <b>${hn}</b></li>`);
    host.shadowRoot.innerHTML = `<style>${T.panel.CSS}
:host{all:initial}.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:8vh 16px;overflow:auto}
.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:560px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}
.dh{padding:16px 20px 8px;font-size:18px;font-weight:500}.db{padding:4px 20px 16px}.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px}
ul{margin:6px 0 12px 18px;padding:0}li{margin:3px 0}</style>
      <div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg">
      <div class="dh">Game times</div><div class="db">
        <div class="lab">Where the times come from</div><ul>${rows.join('')}</ul>
        <div class="lab">Search past events (any organizer)</div>
        <div class="small muted mb">Type a venue or event name, e.g. the league's name - Match Play's search finds events by name.</div>
        <div class="gap"><input type="text" data-f="q" value="${T.esc(sq.q || '')}" placeholder="e.g. Lane Change Thursday" style="flex:1;min-width:220px"><button class="btn sm sec" data-act="search">Search</button></div>
        ${sq.busy ? '<div class="small mt">Searching…</div>' : sq.err ? `<div class="small err mt">${T.esc(sq.err)}</div>` : sq.list ? (sq.list.length ? `<table class="small" style="margin:6px 0 10px">${sq.list.map(x => `<tr><td><b>${T.esc(x.name)}</b> <span class="muted">#${x.id}</span></td><td class="muted">${T.esc(x.date || '')}</td><td style="text-align:right">${idsOf(st).includes(x.id) || x.id === D.tid ? '<span class="muted">added</span>' : `<button class="btn sm" data-act="addId" data-id="${x.id}">Add</button>`}</td></tr>`).join('')}</table>` : '<div class="small mt">Nothing found.</div>') : ''}
        <div class="lab">Other Match Play tournament IDs</div>
        <div class="small muted mb">Past events at this venue give game times before this one has its own. Paste one or more IDs (the number in the event's address).</div>
        <div class="gap"><input type="text" data-f="ids" value="${T.esc(st.bankPast || '')}" placeholder="e.g. 280233, 280541" style="flex:1;min-width:220px"><button class="btn sm" data-act="load">Load</button>${st.bankPast ? '<button class="btn sm sec" data-act="clear">Clear</button>' : ''}</div>
        ${info.length ? `<ul>${info.map(x => `<li>#${x.id} ${T.esc(x.name)} · ${x.games} games${(st.locAuto || []).includes(x.id) ? ' <span class="small muted">(yours, same location - added by itself)</span>' : ''}</li>`).join('')}</ul>` : ''}
        ${msg ? `<div class="callout ${msg.err ? 'err' : ''} mt">${T.esc(msg.text)}</div>` : ''}
        ${miss.length ? `<div class="mt"><button class="btn sm sec" data-act="copyQual" title="${T.esc(miss.join(', '))}">Copy ${miss.length} arena${miss.length === 1 ? '' : 's'} from ${T.esc(D.qual.name || 'qualifying')}</button></div>` : ''}
      </div><div class="df"><button class="btn" data-act="close">Done</button></div></div></div></div>`;
  }
  let sq = { q: '', list: null };
  const idsOf = st => ((st.bankPast || '').match(/\d+/g) || []).map(Number);
  // Match Play's search (read-only API): events by name, any organizer, finished ones first
  async function search(D, q) {
    sq = { q, busy: true }; drawWin(D);
    try {
      const j = await T.api.get(`/search?query=${encodeURIComponent(q)}&type=tournaments`, 60e3);
      const rows = T.data.arr(j && j.tournaments ? j.tournaments : j);
      sq = { q, list: rows.filter(t => t && t.tournamentId).map(t => ({ id: t.tournamentId, name: t.name || ('#' + t.tournamentId), date: (t.startLocal || t.startUtc || '').slice(0, 10), done: String(t.status) === 'completed' })).sort((a, b) => (b.done - a.done) || String(b.date).localeCompare(String(a.date))).slice(0, 15) };
    } catch (err) { sq = { q, err: T.apiErrorText ? T.apiErrorText(err) : String(err) }; }
    drawWin(D);
  }
  // item 89: the TD's own finished events at this event's location are used by themselves (newest 10, last 12 months)
  let locDone = {};
  // item 97: a finals uses its qualifying's location when it has none, and gets the qualifying's Match Play IDs too -
  // even before the qualifying starts
  // item 109: also run (and waited for) before any game times are used - the Start round planner, Max est., banks -
  // so a new or cloned event never falls back to era guesses just because its Arenas tab wasn't opened first
  function autoLocal(D) {
    if (!D || !D.t || !T.settings.token) return Promise.resolve();
    if (!locDone[D.tid]) locDone[D.tid] = autoLocalRun(D);
    return locDone[D.tid];
  }
  async function autoLocalRun(D) {
    const fin = D.qual && D.qual.tournamentId !== D.tid, loc = D.t.locationId || (fin && D.qual.locationId);
    try {
      let st = T.tstate[D.tid] || {};
      if (st.pastTimes && !st.past4 && idsOf(st).length) { await T.bankplan.loadPast(D, idsOf(st)); st = T.tstate[D.tid] || {}; render(T.data.D); drawWin(T.data.D); }   // saved before item 98: again as 4-player times
      let fromQ = [];
      if (fin) { const qs = T.tstate[D.qual.tournamentId] || await T.loadT(D.qual.tournamentId); fromQ = idsOf(qs || {}).filter(id => id !== D.tid); }
      if (!loc && !fromQ.length) return;
      const me = D.me || T.data.unwrap(await T.api.get('/users/profile', 3600e3)); if (!me || !me.userId) return;
      const list = T.data.arr(await T.api.get(`/tournaments?owner=${me.userId}&status=completed&limit=100`, 3600e3));
      const year = Date.now() - 365 * 864e5;
      const ids = !loc ? [] : list.filter(t => t.locationId === loc && t.tournamentId !== D.tid && (!D.qual || t.tournamentId !== D.qual.tournamentId) && (Date.parse(t.startUtc || t.completedAt || '') || 0) > year)
        .sort((a, b) => (Date.parse(b.startUtc || '') || 0) - (Date.parse(a.startUtc || '') || 0)).slice(0, 10).map(t => t.tournamentId);
      st = T.tstate[D.tid] || {}; const have = idsOf(st), add = [...new Set([...fromQ, ...ids])].filter(id => !have.includes(id) && !(st.locSkip || []).includes(id));
      if (!add.length) return;
      await T.bankplan.loadPast(D, [...have, ...add]);
      await T.saveT(D.tid, { locAuto: [...new Set([...(st.locAuto || []), ...add])] });
      render(T.data.D); drawWin(T.data.D);
    } catch (e) { /* next time */ }
  }
  async function onWin(e) {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'bg' && e.target !== a) return;
    const D = T.data.D, act = a.dataset.act;
    if (act === 'bg' || act === 'close') return closeWin();
    if (act === 'copyQual') {
      const names = missingFromQual(D); closeWin();
      if (names.length) await T.jobs.start(`Copy ${names.length} arenas from qualifying`, [{ tid: D.tid, page: 'arenas', op: 'copyArenas', args: { names }, label: `Adding ${names.length} arenas` }]);
      return;
    }
    if (act === 'search') { const q = host.shadowRoot.querySelector('[data-f=q]').value.trim(); if (q.length >= 2) search(D, q); return; }
    if (act === 'addId') {
      const st = T.tstate[D.tid] || {}, ids = [...new Set([...idsOf(st), +a.dataset.id])];
      a.disabled = true; a.textContent = 'Loading…';
      try { const k = await T.bankplan.loadPast(D, ids); drawWin(D, { text: `Loaded times for ${k} arenas from ${ids.length} tournament${ids.length === 1 ? '' : 's'}.` }); }
      catch (err) { drawWin(D, { text: `#${a.dataset.id}: ${T.apiErrorText ? T.apiErrorText(err) : String(err)} (another organizer's event may not be readable with your token)`, err: true }); }
      return render(T.data.D);
    }
    if (act === 'clear') { await T.saveT(D.tid, { pastTimes: null, bankPast: '', pastInfo: null, locSkip: [...new Set([...((T.tstate[D.tid] || {}).locSkip || []), ...((T.tstate[D.tid] || {}).locAuto || [])])], locAuto: [] }); drawWin(D, { text: 'Cleared the other Match Play IDs.' }); return render(T.data.D); }
    if (act === 'load') {
      const ids = ((host.shadowRoot.querySelector('[data-f=ids]').value.match(/\d+/g)) || []).map(Number).filter(id => id !== D.tid);
      if (!ids.length) { await T.saveT(D.tid, { pastTimes: null, bankPast: '', pastInfo: null }); drawWin(D, { text: 'Cleared the other Match Play IDs.' }); return render(T.data.D); }
      a.disabled = true; a.textContent = 'Loading…';
      try { const k = await T.bankplan.loadPast(D, ids); drawWin(D, { text: `Loaded times for ${k} arenas from ${ids.length} tournament${ids.length === 1 ? '' : 's'}.` }); }
      catch (err) { drawWin(D, { text: T.apiErrorText ? T.apiErrorText(err) : String(err), err: true }); }
      render(T.data.D);
    }
  }

  // a finals: the qualifying's active arenas this tournament doesn't have yet (Matchplay's own "Add from qualifying" can miss them)
  function missingFromQual(D) {
    if (!D.qual || D.qual.tournamentId === D.tid) return [];
    const have = new Set((D.t.arenas || []).map(a => lc(a.name)));
    return (D.qual.arenas || []).filter(a => !a.tournamentArena || a.tournamentArena.status !== 'inactive').map(a => a.name).filter(n => n && !have.has(lc(n)));
  }
  // the Display menus live in Matchplay's own table
  document.addEventListener('change', async e => {
    const sel = e.target.closest && e.target.closest('select[data-tdp-cat]'); if (!sel) return;
    e.stopPropagation();
    await T.cats.setOverride(Number(sel.dataset.tdpCat), sel.value || null);
    render(T.data.D);
  }, true);

  return { render, autoLocal };
})();
