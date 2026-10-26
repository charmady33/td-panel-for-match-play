// Features placed directly inside Matchplay's own pages (so the sidebar is optional):
//  - Standings + Resolve ties: unresolved ties that matter for finals are highlighted with the reason
//  - Matches tab: "Auto close round & start next round" checkbox + status; finals group ties highlighted
var TDP = window.TDP || (window.TDP = {});

TDP.inpage = (() => {
  const T = TDP;
  let autoState = '';
  const MARK = 'data-tdp';

  // a small shadow-DOM block styled like Matchplay (shares the sidebar's CSS tokens)
  function block(id, anchor, where, html, onEvent) {
    let host = document.getElementById(id);
    if (!anchor) { if (host) host.remove(); return null; }
    if (!host) {
      host = document.createElement('div'); host.id = id; host.style.display = 'block';
      const r = host.attachShadow({ mode: 'open' });
      r.innerHTML = `<style>${T.panel.CSS}:host{all:initial;display:block}.wrap{position:static;width:auto}</style><div class="wrap"></div>`;
      if (onEvent) { r.addEventListener('change', onEvent); r.addEventListener('click', onEvent); }
    }
    const placed = where === 'before' ? anchor.previousElementSibling === host : anchor.nextElementSibling === host;
    if (!placed) anchor.insertAdjacentElement(where === 'before' ? 'beforebegin' : 'afterend', host);
    const w = host.shadowRoot.querySelector('.wrap');
    w.classList.toggle('dark', document.documentElement.classList.contains('dark'));
    if (w.dataset.html !== html) { w.innerHTML = html; w.dataset.html = html; }
    return host;
  }
  const clearMarks = () => document.querySelectorAll(`[${MARK}]`).forEach(e => { if (e.dataset.tdp === 'note') e.remove(); else { e.style.background = ''; e.style.boxShadow = ''; e.removeAttribute(MARK); } });
  const colorOf = (t, D) => T.panel.cutColor(t.kind === 'cutline' ? ((D.standings.find(s => s.position === t.pos) || {}).cutoffBubbleColor || 'amber') : t.kind === 'boundary' ? (t.div ? t.div.color : 'amber') : 'amber');

  function qualTies(D) {
    if (!D.qual || D.tid !== D.qual.tournamentId || !(D.qual.playoffsCutoffs || []).length || !D.standings.length) return [];
    try { return T.finals.qualifyingTies(D, T.finals.plan(D)); } catch (e) { return []; }
  }
  const KIND = { cutline: 'cut line', boundary: 'cut line', bye: 'bye', pick: 'game picks' };
  const tieRec = (D, t) => ((T.tstate[D.qual.tournamentId] || {}).tb || {})[T.ties.keyOf(t)] || {};
  // short list: the reasons live in the tiebreaker window
  const tieCard = (ties, D, link) => {
    const other = ties.other || [];
    if (!ties.length) return '';
    const rows = ties.map(t => {
      const c = colorOf(t, D), key = T.ties.keyOf(t), rec = tieRec(D, t);
      const kinds = [...new Set([t.kind, ...(t.reasons || []).map(r => /bye/.test(r) ? 'bye' : /picks games/.test(r) ? 'pick' : null)].filter(Boolean).map(k => KIND[k]))].join(' + ');
      const btn = rec.status === 'playing' ? `<button class="btn sm" data-act="tb" data-key="${key}">Enter results · ${T.esc(rec.game || '')}</button>` : `<button class="btn sm sec" data-act="tb" data-key="${key}">Resolve</button>`;
      return `<div class="tie gap" style="background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]};align-items:center"><div class="flex1"><b>Positions ${t.pos}–${t.pos + (t.span || t.players.length) - 1}</b> · ${T.esc(kinds)} <span class="small">(${T.esc(t.players.map(r => r.p ? r.p.name : r.playerId).join(', '))})</span></div>${btn}</div>`;
    }).join('');
    const others = '';   // ties that don't change the finals: plain "tied" text on the eligibility table instead
    return `<div class="card" style="margin:16px 0"><div class="ch"><span class="h">Ties to break before finals</span>${ties.length ? `<span class="badge b-rose">${ties.length} unresolved</span>` : '<span class="badge b-green">none that matter</span>'}${link ? `<a class="btn sm" href="/tournaments/${D.tid}/resolve-ties">Resolve ties page</a>` : ''}</div><div class="cb">${rows}${others}</div></div>`;
  };
  // clicks inside our shadow blocks: open the tiebreaker window
  const onTieClick = e => { const a = e.target.closest('[data-act="tb"]'); if (a && e.type === 'click') T.ties.openByKey(T.data.D, a.dataset.key); };

  // ---------- Standings tab: Matchplay's standings on the left, finals standings (eligibility applied) on the right ----------
  function eligTable(D) {
    const divs = T.finals.plan(D), ranks = T.finals.ranksOf(D), rows = T.finals.order(D);
    const ties = qualTies(D), tieOf = new Map(); ties.forEach(t => t.players.forEach(r => { if (!tieOf.has(r.playerId)) tieOf.set(r.playerId, t); }));
    const otherIds = new Set((ties.other || []).flatMap(o => o.players.map(r => r.playerId)));
    const tag = r => {   // clickable "Unresolved tie" tag: opens the tiebreaker window
      const t = tieOf.get(r.playerId);
      if (!t) return otherIds.has(r.playerId) ? ' <span class="small" title="Tied, but it doesn\'t change the finals - nothing to resolve">tied</span>' : '';
      const c = colorOf(t, D), rec = tieRec(D, t), key = T.ties.keyOf(t);
      const label = rec.status === 'playing' ? `Tiebreaker in progress: ${rec.game}` : 'Unresolved tie';
      return ` <button data-act="tb" data-key="${key}" title="${T.esc(t.why || '')} - click for how to resolve it" style="font:600 11px ui-sans-serif,system-ui,sans-serif;padding:1px 8px;border-radius:9999px;background:#fff;color:${c[1]};border:1px solid ${c[2]};white-space:nowrap;cursor:pointer">${T.esc(label)}</button>`;
    };
    const rowStyle = r => { const t = tieOf.get(r.playerId); if (!t) return ''; const c = colorOf(t, D); return ` style="background:${c[0]};box-shadow:inset 4px 0 0 ${c[2]}"`; };
    const placed = new Set(divs.flatMap(x => x.picks.map(r => r.playerId)));
    const dec = T.ties.decimals(D);
    const line = (r, seed, note) => `<tr${rowStyle(r)}><td class="small num">${seed}</td><td>${T.esc(r.p.name)}${note ? ` <span class="small">${note}</span>` : ''}${tag(r)}</td><td class="num small">${T.ord(r.position)}</td><td class="num small"${dec.get(r.playerId) ? ` title="${T.esc(dec.get(r.playerId).title)}"` : ''}>${dec.get(r.playerId) ? dec.get(r.playerId).pts : Math.round(Number(r.points) * 100) / 100}</td></tr>`;
    let h = `<div class="card"><div class="ch"><span class="h">Finals standings (eligibility applied)</span></div><table><tr><th>Seed</th><th>Player</th><th class="num">MP pos</th><th class="num">Pts</th></tr>`;
    for (const x of divs) {
      const c = T.panel.cutColor(x.color);
      h += `<tr><td colspan="4" style="background:${c[0]};color:${c[1]};font-weight:600;font-size:12px;border-left:4px solid ${c[2]}">${x.letter} FINALS · ${x.size} players${x.i ? ` · ${x.letter}-eligible only${x.cutoff ? ` (IFPA rank above ${x.cutoff})` : ''}` : ''}</td></tr>`;
      h += x.picks.map((r, i) => line(r, x.letter + (i + 1), '')).join('');
    }
    const rest = rows.filter(r => !placed.has(r.playerId));
    if (rest.length) {
      h += `<tr><td colspan="4" style="background:var(--head);font-weight:600;font-size:12px;color:var(--soft)">NOT IN FINALS</td></tr>`;
      h += rest.map(r => { const inel = divs.filter(x => x.i && T.finals.ineligible(r.p, x, ranks)).map(x => x.letter); return line(r, '–', inel.length ? `(${inel.join('/')} ineligible)` : ''); }).join('');
    }
    return h + '</table></div>';
  }
  function standings(D) {
    const table = document.querySelector('main table');
    const ties = qualTies(D);
    const col = table ? table.closest('div.flex.flex-col') || table.parentElement.parentElement.parentElement : null;
    block('tdp-ties-standings', col, 'before', tieCard(ties, D, true), onTieClick);
    if (col && D.qual && D.tid === D.qual.tournamentId && (D.qual.playoffsCutoffs || []).length && D.standings.length) {
      col.style.flexDirection = 'row'; col.style.alignItems = 'flex-start'; col.style.gap = '16px';
      const mine = col.firstElementChild; mine.style.flex = '1 1 0'; mine.style.minWidth = '0';
      const host = block('tdp-elig', mine, 'after', eligTable(D), onTieClick);
      if (host) { host.style.flex = '1 1 0'; host.style.minWidth = '0'; host.style.marginTop = '8px'; }
    } else block('tdp-elig', null);
    if (!table) return;
    const dec = T.ties.decimals(D);
    hideTiesColumn(table);
    for (const tr of table.querySelectorAll('tr')) {
      const a = tr.querySelector('a[href*="/players/"]'); if (!a) continue;
      const id = Number((a.getAttribute('href').match(/\/players\/(\d+)/) || [])[1]);
      // resolved ties: replace "34 pts." with 34.3 / 34.2 ... (winner highest)
      const ptsCell = [...tr.children].find(td => /pts\.?$/.test(T.txt(td)) || td.dataset.tdpPts);
      if (ptsCell) {
        const dv = dec.get(id);
        if (dv) {
          if (!ptsCell.dataset.tdpPts) ptsCell.dataset.tdpPts = T.txt(ptsCell);
          const want = `${dv.pts} pts.`; if (T.txt(ptsCell) !== want) ptsCell.textContent = want;
          ptsCell.title = dv.title + ' - click for details'; ptsCell.style.cursor = 'pointer'; ptsCell.dataset.tdpPid = id;
        } else if (ptsCell.dataset.tdpPts) { ptsCell.textContent = ptsCell.dataset.tdpPts; delete ptsCell.dataset.tdpPts; delete ptsCell.dataset.tdpPid; ptsCell.title = ''; ptsCell.style.cursor = ''; }
      }
      // tie tags live on the eligibility table now: clear any left on Matchplay's own rows
      if (tr.hasAttribute(MARK)) { tr.style.background = ''; tr.style.boxShadow = ''; tr.removeAttribute(MARK); tr.querySelectorAll('[data-tdp=note]').forEach(n => n.remove()); }
    }
  }

  // Matchplay's "Ties" column only shows "-" or "Manual"; the decimals already show resolved ties: hide it
  function hideTiesColumn(table) {
    const hr = table.querySelector('thead tr') || table.querySelector('tr'); if (!hr) return;
    const head = [...hr.children], i = head.findIndex(th => /^ties$/i.test(T.txt(th)));
    if (i < 0) return;
    for (const tr of table.querySelectorAll('tr')) { const c = tr.children[i]; if (c && c.style.display !== 'none') c.style.display = 'none'; }
  }

  // ---------- Resolve ties page ----------
  let staleKick = 0;
  function resolveTies(D) {
    const anchorEl = [...document.querySelectorAll('main *')].find(e => e.children.length === 0 && /^Unresolved ties$/.test(T.txt(e)));
    // wait for our data before saying anything (no "no ties" flash while loading)
    if (!D.standings.length || !D.qual || D.tid !== D.qual.tournamentId) { block('tdp-ties-resolve', anchorEl, 'before', '<div class="callout" style="margin:12px 0">Checking which ties matter for finals…</div>'); return; }
    const ties = qualTies(D);
    // only the cards under "Unresolved ties" (each card = smallest box with one "Positions" heading and a Resolve button)
    const isHead = e => e.children.length === 0 && /^Positions\s+\d+\s*[-–]\s*\d+$/.test(T.txt(e));
    const cards = [];
    for (const h of [...document.querySelectorAll('main *')].filter(isHead)) {
      let card = h;
      while (card.parentElement && card.parentElement.tagName !== 'MAIN' && [...card.parentElement.querySelectorAll('*')].filter(isHead).length === 1) card = card.parentElement;
      if (!T.findBtn(card, /^Resolve$/)) continue;   // resolved card (Delete) - not ours
      const m = T.txt(h).match(/(\d+)\s*[-–]\s*(\d+)/);
      cards.push({ card, from: +m[1], to: +m[2] });
    }
    const shown = [];
    for (const c0 of cards) {
      const { card } = c0, t = ties.find(x => x.pos === c0.from);
      const old = card.querySelector('[data-tdp=note]');
      if (!t) { if (old) old.remove(); if (card.hasAttribute(MARK)) { card.style.boxShadow = ''; card.removeAttribute(MARK); } continue; }
      shown.push({ t, c0 });
      const c = colorOf(t, D);
      card.setAttribute(MARK, 'card'); card.style.boxShadow = `0 0 0 3px ${c[2]}`;
      const rec = ((T.tstate[D.qual.tournamentId] || {}).tb || {})[T.ties.keyOf(t)] || {};
      const html = `<b>Important for finals.</b> ${T.esc(t.why)} <button data-tdp-key="${T.ties.keyOf(t)}" style="margin-left:6px;font:inherit;font-weight:600;color:#4338ca;background:#fff;border:1px solid #a5b4fc;border-radius:6px;padding:1px 8px;cursor:pointer">${rec.status === 'playing' ? 'Enter results' : 'Break tie'}</button>`;
      let n = old;
      if (!n) { n = document.createElement('div'); n.dataset.tdp = 'note'; card.appendChild(n); n.addEventListener('click', ev => { const b = ev.target.closest('[data-tdp-key]'); if (b) { ev.preventDefault(); ev.stopPropagation(); T.ties.openByKey(T.data.D, b.dataset.tdpKey); } }); }
      n.style.cssText = `margin:8px 12px 12px;padding:6px 8px;border-radius:6px;font-size:12px;background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]}`;
      if (n.innerHTML !== html) n.innerHTML = html;
    }
    // a tie we know about with no unresolved card = just resolved in Matchplay: refresh our standings
    if (ties.length > shown.length && Date.now() - staleKick > 15000) { staleKick = Date.now(); T.data.refresh(true); }
    const list = shown.map(({ t, c0 }) => { const c = colorOf(t, D); return `<div class="tie gap" style="background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]}"><div class="flex1"><b>Positions ${c0.from}–${c0.to}:</b> ${T.esc(t.why)}</div><button class="btn sm sec" data-act="tb" data-key="${T.ties.keyOf(t)}">Break tie</button></div>`; }).join('');
    block('tdp-ties-resolve', anchorEl, 'before', shown.length
      ? `<div class="card" style="margin:12px 0"><div class="ch"><span class="h">${shown.length} unresolved tie${shown.length === 1 ? '' : 's'} matter for finals</span></div><div class="cb">${list}<div class="small">Each is outlined below. Other unresolved ties don't change who makes the finals or their seeds.</div></div></div>`
      : '<div class="callout ok" style="margin:12px 0">No unresolved ties affect the finals.</div>', onTieClick);
  }

  // ---------- Matches tab ----------
  function matches(D) {
    const st = T.tstate[D.tid] || {};
    const refresh = T.findBtn(document.querySelector('main') || document, /^Refresh$/);
    // the toolbar row holding "Display round… / Refresh / Start next round"; our bar goes right under it
    let bar = refresh ? refresh.closest('div') : null;
    if (bar && bar.parentElement && bar.parentElement.tagName !== 'MAIN' && bar.parentElement.contains(refresh)) bar = bar.parentElement;
    if (!bar || bar.tagName === 'MAIN' || !bar.closest('main')) bar = refresh;
    const usesBanks = /bank/i.test(D.t.arenaAssignment || '');
    let bankRow = '';
    if (usesBanks && D.t.status === 'started') {
      const ctx = T.bankplan.context(D), need = ctx.round && ctx.groups.length, sum = T.bankplan.roundSummary(D);
      const nb = (D.t.banks || []).filter(b => b.status !== 'inactive').length;
      bankRow = `<div class="cb gap" style="border-top:1px solid var(--line);flex-wrap:wrap;align-items:center">
        <button class="btn sm" data-act="assign" ${need && nb && !T.jobs.active() ? '' : 'disabled'}>Assign banks</button>
        <label class="gap" title="Each new round, give every group a bank automatically${st.autoBanks ? ' (after the banks are rebuilt - Banks tab)' : ''}"><input type="checkbox" data-act="autoAssign" ${st.autoAssign ? 'checked' : ''}> <span class="lab">Automatic</span></label>
        <span class="small flex1">${!nb ? 'No banks yet - make them on the Banks tab.' : need ? `${ctx.groups.length} group${ctx.groups.length === 1 ? '' : 's'} in ${T.esc(ctx.round.name || 'this round')} need a bank${st.autoAssign ? ' - assigning automatically' : ''}.` : sum.length ? `All ${sum.length} group${sum.length === 1 ? ' has' : 's have'} banks.` : 'Every group has its games.'}</span>
      </div>`;
    }
    let testRow = '';
    if (D.t.test === true && D.t.status === 'started') {
      const r = T.data.currentRound(), gs = r ? D.games.filter(g => g.roundId === r.roundId && !g.bye && g.set !== 9999) : [];
      const open = gs.filter(g => !T.timing.isDone(g)), ready = open.filter(g => g.arenaId != null);
      testRow = `<div class="cb gap" style="border-top:1px solid var(--line);flex-wrap:wrap;align-items:center;background:#fffbeb">
        <span class="badge b-amber">Test</span>
        <button class="btn sm sec" data-act="fill" ${ready.length && !T.jobs.active() && String((r || {}).status) !== 'pending' ? '' : 'disabled'}>Fill random results</button>
        <label class="gap"><input type="checkbox" data-act="autoFill" ${st.autoFill ? 'checked' : ''}> <span class="lab">Every round</span></label>
        <span class="small flex1">${!r ? 'No round in progress.' : !open.length ? 'Every game in this round has a result.' : `${open.length} open game${open.length === 1 ? '' : 's'}${ready.length < open.length ? ` - ${open.length - ready.length} still need an arena (assign banks first)` : ''}.`} Test tournaments only.</span>
      </div>`;
    }
    const html = D.t && D.t.status === 'started' ? `<div class="card" style="margin:12px 0"><div class="cb gap">
      <label class="gap"><input type="checkbox" data-act="auto" ${st.auto ? 'checked' : ''}> <span class="lab">Auto close round &amp; start next round</span></label>
      <span class="small flex1">${st.auto ? T.esc(autoState || 'watching') : 'When every game is approved (no pending or partial scores, no open tiebreakers), closes the round and starts the next after a countdown you can cancel. Never past the last round; never completes the tournament.'}</span>
      </div>${bankRow}${testRow}</div>` : '';
    block('tdp-auto', html ? bar : null, 'after', html, async e => {
      const el = e.target;
      if (e.type === 'click' && el.closest && el.closest('[data-act=assign]')) return T.bankbar.assignPreview(T.data.D);
      if (e.type === 'click' && el.closest && el.closest('[data-act=fill]')) return T.bankbar.fillConfirm(T.data.D);
      if (e.type !== 'change') return;
      if (el.dataset.act === 'auto') { await T.saveT(D.tid, { auto: el.checked }); autoState = ''; render(); T.panel.render(true); }
      if (el.dataset.act === 'autoAssign') { await T.saveT(D.tid, { autoAssign: el.checked }); render(); }
      if (el.dataset.act === 'autoFill') { await T.saveT(D.tid, { autoFill: el.checked }); render(); }
    });
    // finals: outline groups that are tied at the advance line / in the final
    const gt = (() => { try { return T.finals.groupTies(D); } catch (e) { return []; } })();
    for (const th of [...document.querySelectorAll('main th, main td')].filter(e => /^Group \d+/.test(T.txt(e)))) {
      const no = +T.txt(th).match(/^Group (\d+)/)[1], t = gt.find(x => x.group === no), table = th.closest('table'); if (!table) continue;
      const box = table.parentElement, old = box.querySelector(':scope > [data-tdp=note]');
      if (!t) { if (old) old.remove(); if (box.hasAttribute(MARK)) { box.style.boxShadow = ''; box.removeAttribute(MARK); } continue; }
      const c = T.panel.cutColor(t.kind === 'final' ? 'rose' : 'amber');
      box.setAttribute(MARK, 'group'); box.style.boxShadow = `0 0 0 3px ${c[2]}`;
      if (!old) { const n = document.createElement('div'); n.dataset.tdp = 'note'; n.style.cssText = `margin:8px 12px;padding:6px 8px;border-radius:6px;font-size:12px;background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]}`; box.appendChild(n); }
      box.querySelector(':scope > [data-tdp=note]').innerHTML = `<b>${T.esc(t.why)}</b> · ${T.esc(t.players.join(', '))}${t.tbOpen ? ' · tiebreaker game open' : t.tbDone ? ' · tiebreaker played' : ' · <b>needs a tiebreaker</b>'}`;
    }
  }

  // reminder on every page of the tournament while a tiebreaker waits for results
  function reminder(D) {
    const p = D.qual ? T.ties.pending(D) : [];
    const main = document.querySelector('main');
    const anchor = p.length && main ? [...main.children].find(e => !/^tdp-/.test(e.id || '')) : null;
    block('tdp-tb-reminder', anchor, 'before', p.length ? `<div class="callout warn gap" style="margin:8px 16px">${p.length} tiebreaker${p.length === 1 ? '' : 's'} waiting for results: ${p.map(x => `<button class="btn sm" data-act="tb" data-key="${x.key}">Positions ${x.pos}–${x.pos + x.ids.length - 1} · ${T.esc(x.game || '')}</button>`).join(' ')}</div>` : '', onTieClick);
  }
  let lastPage = null;
  function render() {
    if (T.isFrame) return;   // the hidden worker frame shows nothing
    const D = T.data.D;
    const page0 = T.routePage();
    if (page0 !== lastPage) { lastPage = page0; if ((page0 === 'standings' || page0 === 'resolve-ties') && D.qual) T.data.refresh(true); }
    if (!D.isTD || !D.t) { clearMarks(); ['tdp-ties-standings', 'tdp-elig', 'tdp-ties-resolve', 'tdp-auto', 'tdp-tb-reminder', 'tdp-bankbar', 'tdp-arena-times', 'tdp-ifpa-btn', 'tdp-busy-banner', 'tdp-elig-bar'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); return; }
    const page = T.routePage();
    try {
      reminder(D);
      if (page === 'standings') standings(D); else { block('tdp-ties-standings', null); block('tdp-elig', null); }
      if (page === 'resolve-ties') resolveTies(D); else block('tdp-ties-resolve', null);
      if (page === 'matches') matches(D); else block('tdp-auto', null);
      if (T.bankbar) T.bankbar.render(D);
      if (T.arenatab) T.arenatab.render(D);
      if (T.elig) T.elig.render(D);
      if (T.ifpa) T.ifpa.render(D);
    } catch (e) { T.warn('inpage', e); }
  }
  setInterval(render, 1500);   // Matchplay re-renders its pages; put our bits back
  // Matchplay's "Manual" button in the standings Ties column: show our resolved-tie window instead of its info box
  document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('main table [data-tdp-pid]');
    if (!c || T.routePage() !== 'standings' || !T.data.D.isTD) return;
    e.preventDefault(); e.stopPropagation();
    T.ties.openResolved(T.data.D, Number(c.dataset.tdpPid));
  }, true);
  return { render, block, setAutoState: s => { autoState = s; render(); } };
})();
