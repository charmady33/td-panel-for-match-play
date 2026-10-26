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
    if (!table) { document.querySelectorAll(`[${COL}]`).forEach(e => e.remove()); T.inpage.block('tdp-arena-times', null); return; }
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
    // "Game times from" bar above the table
    // outside the table's own box (Matchplay pins its select-all checkbox to that box): climb to the block that
    // sits next to the Add / Add from qualifying / Actions row, and go right before it
    let wrap = table;
    while (wrap.parentElement && wrap.parentElement.tagName !== 'MAIN' && !T.findBtn(wrap.parentElement, /^Add from qualifying$|^Add…$|^Add\.\.\.$/)) wrap = wrap.parentElement;
    const isFinals = D.qual && D.qual.tournamentId !== D.tid;
    const live = Object.values(T.timing.arenaTimes(D.games)).reduce((s, x) => s + x.count, 0);
    const qn = extra && extra.qual ? Object.values(extra.qual).reduce((s, x) => s + x.count, 0) : 0;
    const hn = (st.histUse || []).length;
    const html = `<div class="card" style="margin:0 0 12px"><div class="cb gap" style="flex-wrap:wrap;align-items:center">
      <span class="h">Game times from</span>
      <span class="badge b-indigo">This event · ${live} games</span>
      ${isFinals ? `<span class="badge b-indigo" title="Included automatically: this finals is linked to its qualifying">Qualifying · ${qn} games</span>` : ''}
      ${st.pastTimes ? `<span class="badge b-indigo">Matchplay IDs · ${Object.values(st.pastTimes).reduce((s, x) => s + x.count, 0)} games</span>` : ''}
      ${hn ? `<span class="badge b-gray" title="Ticked in Bank Builder ⚙ Settings">Past events · ${hn}</span>` : ''}
      <span class="gap" style="margin-left:auto"><input type="text" data-f="ids" placeholder="Other Matchplay IDs, e.g. 201234, 205678" value="${T.esc(st.bankPast || '')}" style="width:260px"><button class="btn sm sec" data-act="load">Load</button></span>
    </div></div>`;
    T.inpage.block('tdp-arena-times', wrap, 'before', html, onBar);
  }

  async function onBar(e) {
    if (e.type !== 'click') return;
    const a = e.target.closest('[data-act=load]'); if (!a) return;
    const D = T.data.D, ids = (a.getRootNode().querySelector('[data-f=ids]').value.match(/\d+/g) || []).map(Number).filter(id => id !== D.tid);
    a.disabled = true; a.textContent = 'Loading…';
    try {
      if (!ids.length) { await T.saveT(D.tid, { pastTimes: null, bankPast: '' }); T.panel.say('Cleared the other Matchplay IDs.', 'ok'); }
      else { const k = await T.bankplan.loadPast(D, ids); T.panel.say(`Loaded times for ${k} arenas from ${ids.length} tournament${ids.length === 1 ? '' : 's'}.`, 'ok'); }
    } catch (err) { T.panel.say(T.apiErrorText ? T.apiErrorText(err) : String(err), 'err'); }
    a.disabled = false; a.textContent = 'Load';
    render(T.data.D);
  }

  // the Display menus live in Matchplay's own table
  document.addEventListener('change', async e => {
    const sel = e.target.closest && e.target.closest('select[data-tdp-cat]'); if (!sel) return;
    e.stopPropagation();
    await T.cats.setOverride(Number(sel.dataset.tdpCat), sel.value || null);
    render(T.data.D);
  }, true);

  return { render };
})();
