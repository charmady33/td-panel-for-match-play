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
    if (!ties.length) return '';   // (optional ties: grey "tied · optional" tags on the finals standings only)
    const rows = ties.map(t => {
      const c = colorOf(t, D), key = T.ties.keyOf(t), rec = tieRec(D, t);
      const kinds = [...new Set([t.kind, ...(t.reasons || []).map(r => /bye/.test(r) ? 'bye' : /picks games/.test(r) ? 'pick' : null)].filter(Boolean).map(k => KIND[k]))].join(' + ');
      const btn = rec.status === 'playing' ? `<button class="btn sm" data-act="tb" data-key="${key}">Enter results · ${T.esc(rec.game || '')}</button>` : `<button class="btn sm sec" data-act="tb" data-key="${key}">Resolve</button>`;
      return `<div class="tie gap" style="background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]};align-items:center"><div class="flex1"><b>Positions ${t.pos}–${t.pos + (t.span || t.players.length) - 1}</b> · ${T.esc(kinds)} <span class="small">(${T.esc((t.playing || t.players).map(r => r.p ? r.p.name : r.playerId).join(', '))})</span></div>${btn}</div>`;
    }).join('');
    const others = '';   // ties that don't change the finals: only the grey "tied · optional" tags on the finals standings
    return `<div class="card" style="margin:16px 0"><div class="ch"><span class="h">Ties to break before finals</span>${ties.length ? `<span class="badge b-rose">${ties.length} unresolved</span>` : '<span class="badge b-green">none that matter</span>'}${link ? `<a class="btn sm" href="/tournaments/${D.tid}/resolve-ties">Resolve ties page</a>` : ''}</div><div class="cb">${rows}${others}</div></div>`;
  };
  // clicks inside our shadow blocks: open the tiebreaker window
  const onTieClick = e => { const a = e.target.closest('[data-act="tb"]'); if (a && e.type === 'click') T.ties.openByKey(T.data.D, a.dataset.key); };

  // ---------- Standings tab: Matchplay's standings on the left, finals standings (eligibility applied) on the right ----------
  function eligTable(D) {
    const divs = T.finals.plan(D), ranks = T.finals.ranksOf(D), rows = T.finals.order(D);
    const ties = qualTies(D), tieOf = new Map(); ties.forEach(t => t.players.forEach(r => { if (!tieOf.has(r.playerId)) tieOf.set(r.playerId, t); }));
    const otherOf = new Map(); (ties.other || []).forEach(o => o.players.forEach(r => otherOf.set(r.playerId, o)));
    const tag = r => {   // clickable "Unresolved tie" tag: opens the tiebreaker window
      const t = tieOf.get(r.playerId);
      const o = otherOf.get(r.playerId);
      const orec = o ? tieRec(D, o) : {};
      const plain = o ? ` <button data-act="tb" data-key="${T.ties.keyOf(o)}" title="Tied, but it doesn't change the finals - breaking it is optional" style="font:500 11px ui-sans-serif,system-ui,sans-serif;padding:1px 8px;border-radius:9999px;background:#fff;color:#6b7280;border:1px solid #d1d5db;white-space:nowrap;cursor:pointer">${orec.status === 'playing' ? `Tiebreaker in progress: ${T.esc(orec.game || '')}` : 'tied · optional'}</button>` : '';
      if (!t) return plain;
      if ((t.sitOut || []).includes(r.playerId)) return ' <span class="small" title="Tied, but not eligible for / in the division this tie decides - doesn\'t play the tiebreaker">tied</span>';
      const c = colorOf(t, D), rec = tieRec(D, t), key = T.ties.keyOf(t);
      const label = rec.status === 'playing' ? `Tiebreaker in progress: ${rec.game}` : 'Unresolved tie';
      return ` <button data-act="tb" data-key="${key}" title="${T.esc(t.why || '')} - click for how to resolve it" style="font:600 11px ui-sans-serif,system-ui,sans-serif;padding:1px 8px;border-radius:9999px;background:#fff;color:${c[1]};border:1px solid ${c[2]};white-space:nowrap;cursor:pointer">${T.esc(label)}</button>`;
    };
    const rowStyle = r => { const t = tieOf.get(r.playerId); if (!t || (t.sitOut || []).includes(r.playerId)) return ''; const c = colorOf(t, D); return ` style="background:${c[0]};box-shadow:inset 4px 0 0 ${c[2]}"`; };
    const byId = new Map(rows.map(r => [r.playerId, r]));
    const nm = id => (byId.get(id) || {}).p ? byId.get(id).p.name : ('#' + id);
    const above = [];   // cut-off ties of the divisions drawn so far
    const placed = new Set(divs.flatMap(x => x.picks.map(r => r.playerId)));
    // a tie that matters and isn't broken yet: everyone in it shares the seed of its first spot, e.g. A7-T
    const tseed = (x, r) => { const t = tieOf.get(r.playerId); if (!t || (t.sitOut || []).includes(r.playerId)) return null; const mem = new Set(t.players.map(q => q.playerId)); const f = x.picks.findIndex(p => mem.has(p.playerId)); return f >= 0 ? `${x.letter}${f + 1}-T` : null; };
    const shown = new Set();   // each player is listed once: in the first division that has them (their tie decides the rest)
    const dec = T.ties.decimals(D);
    const line = (r, seed, note) => `<tr${rowStyle(r)}><td class="small num">${seed}</td><td>${T.esc(r.p.name)}${note ? ` <span class="small">${note}</span>` : ''}${tag(r)}</td><td class="num small">${T.ord(r.position)}</td><td class="num small"${dec.get(r.playerId) ? ` title="${T.esc(dec.get(r.playerId).title)}"` : ''}>${dec.get(r.playerId) ? dec.get(r.playerId).pts : Math.round(Number(r.points) * 100) / 100}</td></tr>`;
    let h = `<div class="card"><div class="ch"><span class="h">Finals standings (eligibility applied)</span></div><table><tr><th>Seed</th><th>Player</th><th class="num">MP pos</th><th class="num">Pts</th></tr>`;
    for (const x of divs) {
      const c = T.panel.cutColor(x.color);
      // a cut-off tie above that can still move this list: its losers drop in here (when they're eligible)
      const deps = above.filter(s => s.tie.playing.some(r => !T.finals.ineligible(r.p, x, ranks)));
      const depIds = new Set(deps.flatMap(s => s.tie.playing.map(r => r.playerId)));
      h += `<tr><td colspan="4" style="background:${c[0]};color:${c[1]};font-weight:600;font-size:12px;border-left:4px solid ${c[2]}">${x.letter} FINALS · ${x.size} players${x.i ? ` · ${x.letter}-eligible only${x.cutoff ? ` (IFPA rank above ${x.cutoff})` : ''}` : ''}</td></tr>`;
      if (deps.length) h += `<tr><td colspan="4" class="small" style="background:#fffbeb;color:#92400e">May change: depends on the ${deps.map(s => `${s.letter} cut-off tie (${T.esc(s.tie.playing.map(r => nm(r.playerId)).join(', '))})`).join(' and the ')}</td></tr>`;
      // players of an unbroken cut-off tie above stay listed there; their possible spot here is one line
      const later = x.picks.filter(r => depIds.has(r.playerId) && shown.has(r.playerId));
      const laterRow = `<tr><td class="small num">${x.letter}${x.picks.indexOf(later[0]) + 1}</td><td colspan="3" class="small" style="color:#92400e">${later.length} spot${later.length === 1 ? '' : 's'} for whoever loses the ${deps.map(s => s.letter).join('/')} cut-off tie</td></tr>`;
      h += x.picks.map((r, i) => (r === later[0] ? laterRow : later.includes(r) ? '' : line(r, tseed(x, r) || x.letter + (i + 1), depIds.has(r.playerId) ? '(if they lose that tie)' : ''))).join('');
      x.picks.forEach(r => shown.add(r.playerId));
      // the whole tie at this division's cut-off: everyone fighting for the last spot(s), then the line
      const st = T.finals.straddle(x, ties);
      if (st) {
        const ts = (() => { const f = x.picks.findIndex(p => st.inIds.includes(p.playerId)); return `${x.letter}${(f >= 0 ? f : x.picks.length) + 1}-T`; })();
        h += st.outIds.map(id => byId.get(id)).filter(Boolean).map(r => line(r, ts, 'tied for the last spot')).join('');
        st.outIds.forEach(id => { shown.add(id); placed.add(id); });
        h += `<tr><td colspan="4" style="text-align:center;font-weight:600;font-size:11px;letter-spacing:.04em;color:${c[1]};border-top:2px solid ${c[2]}">${x.letter} FINALS CUTOFF · ${st.inIds.length + st.outIds.length} TIED FOR ${st.spots} SPOT${st.spots === 1 ? '' : 'S'}</td></tr>`;
        above.push({ ...st, letter: x.letter });
      }
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
      if (!t) {
        if (card.hasAttribute(MARK)) { card.style.boxShadow = ''; card.removeAttribute(MARK); }
        // a tie that doesn't change the finals: breaking it is optional (grey button)
        const o = (ties.other || []).find(x => x.pos === c0.from);
        if (!o) { if (old) old.remove(); continue; }
        const ohtml = `Optional: doesn't change who makes the finals or their seeds. <button data-tdp-key="${T.ties.keyOf(o)}" style="margin-left:6px;font:inherit;color:#4b5563;background:#fff;border:1px solid #d1d5db;border-radius:6px;padding:1px 8px;cursor:pointer">Break tie (optional)</button>`;
        let on = old;
        if (!on) { on = document.createElement('div'); on.dataset.tdp = 'note'; card.appendChild(on); on.addEventListener('click', ev => { const b = ev.target.closest('[data-tdp-key]'); if (b) { ev.preventDefault(); ev.stopPropagation(); T.ties.openByKey(T.data.D, b.dataset.tdpKey); } }); }
        on.style.cssText = 'margin:8px 12px 12px;padding:6px 8px;border-radius:6px;font-size:12px;background:#f9fafb;color:#4b5563;border-left:4px solid #d1d5db';
        if (on.dataset.h !== ohtml) { on.dataset.h = ohtml; on.innerHTML = ohtml; }
        continue;
      }
      shown.push({ t, c0 });
      const c = colorOf(t, D);
      card.setAttribute(MARK, 'card'); card.style.boxShadow = `0 0 0 3px ${c[2]}`;
      const rec = ((T.tstate[D.qual.tournamentId] || {}).tb || {})[T.ties.keyOf(t)] || {};
      const html = `<b>Important for finals.</b> ${T.esc(t.why)} <button data-tdp-key="${T.ties.keyOf(t)}" style="margin-left:6px;font:inherit;font-weight:600;color:#4338ca;background:#fff;border:1px solid #a5b4fc;border-radius:6px;padding:1px 8px;cursor:pointer">${rec.status === 'playing' ? 'Enter results' : 'Break tie'}</button>`;
      let n = old;
      if (!n) { n = document.createElement('div'); n.dataset.tdp = 'note'; card.appendChild(n); n.addEventListener('click', ev => { const b = ev.target.closest('[data-tdp-key]'); if (b) { ev.preventDefault(); ev.stopPropagation(); T.ties.openByKey(T.data.D, b.dataset.tdpKey); } }); }
      n.style.cssText = `margin:8px 12px 12px;padding:6px 8px;border-radius:6px;font-size:12px;background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]}`;
      if (n.dataset.h !== html) { n.dataset.h = html; n.innerHTML = html; }
    }
    // a tie we know about with no unresolved card = just resolved in Matchplay: refresh our standings
    if (ties.length > shown.length && Date.now() - staleKick > 15000) { staleKick = Date.now(); T.data.refresh(true); }
    const list = shown.map(({ t, c0 }) => { const c = colorOf(t, D); return `<div class="tie gap" style="background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]}"><div class="flex1"><b>Positions ${c0.from}–${c0.to}:</b> ${T.esc(t.why)}</div><button class="btn sm sec" data-act="tb" data-key="${T.ties.keyOf(t)}">Break tie</button></div>`; }).join('');
    block('tdp-ties-resolve', anchorEl, 'before', shown.length
      ? `<div class="card" style="margin:12px 0"><div class="ch"><span class="h">${shown.length} unresolved tie${shown.length === 1 ? '' : 's'} matter for finals</span></div><div class="cb">${list}<div class="small">Each is outlined below. Other unresolved ties don't change who makes the finals or their seeds.</div></div></div>`
      : '<div class="callout ok" style="margin:12px 0">No unresolved ties affect the finals.</div>', onTieClick);
  }

  // ---------- Matches tab ----------
  // fallback: Assign arenas by game time for the newest open round (same code as the automatic redo)
  function smartRow(D) {
    if (!T.rounds || (D.qual && D.qual.tournamentId !== D.tid)) return '';
    const r = T.data.latestRound(); if (!r || String(r.status) === 'completed') return '';
    const gs = D.games.filter(g => g.roundId === r.roundId && !g.bye && g.set !== 9999), open = gs.filter(g => !T.timing.hasScore(g));
    const none = open.filter(g => g.arenaId == null).length;
    const type = T.rounds.typeOf(D);
    if (!open.length || (!none && type !== 'smart') || (/bank/i.test(D.t.arenaAssignment || '') && type !== 'smart')) return '';   // bank events: Assign banks instead
    return `<div class="cb gap" style="border-top:1px solid var(--line);flex-wrap:wrap;align-items:center">
      <button class="btn sm" data-act="smartNow" ${T.jobs.active() ? 'disabled' : ''}>Assign arenas by game time</button>
      <span class="small flex1">${T.esc(r.name || 'This round')}: ${none ? `${none} game${none === 1 ? '' : 's'} without an arena` : 'every game has an arena'} · games with a score are never changed.</span></div>`;
  }
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
      const ctx = T.bankplan.context(D), sum = T.bankplan.roundSummary(D);
      // groups whose games have no arena / bank yet
      const waiting = ctx.round ? ctx.groups.filter(gr => D.games.filter(g => g.roundId === ctx.round.roundId && g.set === gr.key - 1 && !g.bye && g.set !== 9999).every(g => g.arenaId == null && g.bankId == null)).length : 0;
      const need = !!waiting;
      const nb = (D.t.banks || []).filter(b => b.status !== 'inactive').length;
      bankRow = `<div class="cb gap" style="border-top:1px solid var(--line);flex-wrap:wrap;align-items:center">
        <button class="btn sm" data-act="assign" ${need && nb && !T.jobs.active() ? '' : 'disabled'}>Assign banks</button>
        <label class="gap" title="Each new round, give every group a bank automatically${st.smartArenas ? ' (not while rounds use Any category (game time))' : ''}"><input type="checkbox" data-act="autoAssign" ${st.autoAssign ? 'checked' : ''}> <span class="lab">Automatic</span></label>
        <span class="small flex1">${!nb ? 'No banks yet - make them on the Banks tab.' : need ? `${waiting} group${waiting === 1 ? '' : 's'} in ${T.esc(ctx.round.name || 'this round')} need${waiting === 1 ? 's' : ''} a bank${st.autoAssign ? ' - assigning automatically' : ''}.` : sum.length ? `All ${sum.length} group${sum.length === 1 ? ' has' : 's have'} banks.` : 'Every group has its games.'}</span>
      </div>`;
    }
    let testRow = '';
    if (D.t.test === true && D.t.status === 'started') {
      const r = T.data.currentRound(), gs = r ? D.games.filter(g => g.roundId === r.roundId && !g.bye) : [];
      const open = gs.filter(g => !T.timing.isDone(g)), ready = open.filter(g => g.arenaId != null || g.set === 9999);   // tiebreakers get a random arena
      testRow = `<div class="cb gap" style="border-top:1px solid var(--line);flex-wrap:wrap;align-items:center;background:#fffbeb">
        <span class="badge b-amber">Test</span>
        <button class="btn sm sec" data-act="fill" ${ready.length && !T.jobs.active() && String((r || {}).status) !== 'pending' ? '' : 'disabled'}>Fill random results</button>
        <label class="gap"><input type="checkbox" data-act="autoFill" ${st.autoFill ? 'checked' : ''}> <span class="lab">Every round</span></label>
        <span class="small flex1">${!r ? 'No round in progress.' : !open.length ? 'Every game in this round has a result.' : `${open.length} open game${open.length === 1 ? '' : 's'}${ready.length < open.length ? ` - ${open.length - ready.length} still need an arena (assign banks first)` : ''}.`} Test tournaments only.</span>
      </div>`;
    }
    const html = D.t && D.t.status === 'started' ? `<div class="card" style="margin:12px 0"><div class="cb gap">
      <label class="gap"><input type="checkbox" data-act="auto" ${st.auto ? 'checked' : ''}> <span class="lab">Auto close round &amp; start next round</span></label>
      <span class="small" title="When every game is approved (no pending or partial scores, no open tiebreakers), closes the round and starts the next after a 10-second countdown you can cancel. Never past the last round; never completes the tournament." style="cursor:help">ⓘ</span>
      <span class="small flex1">${st.auto ? T.esc(autoState || 'watching') : 'Off'}</span>
      ${T.rounds ? T.rounds.selectHtml(D) : ''}
      </div>${smartRow(D)}${bankRow}${testRow}</div>` : '';
    block('tdp-auto', html ? bar : null, 'after', html, async e => {
      const el = e.target;
      if (e.type === 'click' && el.closest && el.closest('[data-act=assign]')) return T.bankbar.assignPreview(T.data.D);
      if (e.type === 'click' && el.closest && el.closest('[data-act=fill]')) return T.bankbar.fillConfirm(T.data.D);
      if (e.type === 'click' && el.closest && el.closest('[data-act=smartNow]')) {
        const D2 = T.data.D, r = T.data.latestRound(); if (!r) return;
        const gs = D2.games.filter(g => g.roundId === r.roundId && !g.bye && g.set !== 9999 && !T.timing.hasScore(g)), had = gs.filter(g => g.arenaId != null).length;
        if (had && !confirm(`${had} game${had === 1 ? ' already has an arena' : 's already have arenas'} in ${r.name || 'this round'}. Give every game without a score its arena by game time (changes those too)?`)) return;
        try { await T.jobs.start(`${r.name || 'Round'}: arenas by game time`, [{ tid: D2.tid, page: 'matches', op: 'smartPlan', args: { tid: D2.tid, roundId: r.roundId, redo: true, publish: String(r.status) === 'pending' }, label: 'Giving every game its arena by game time' }]); }
        catch (err) { T.panel.say(err.message || String(err), 'err'); }
        return;
      }
      if (e.type !== 'change') return;
      if (el.dataset.act === 'auto') { await T.saveT(D.tid, { auto: el.checked }); autoState = ''; render(); }
      if (el.dataset.act === 'roundType') { await T.rounds.setType(T.data.D, el.value); render(); }
      if (el.dataset.act === 'autoAssign') { await T.saveT(D.tid, { autoAssign: el.checked }); render(); }
      if (el.dataset.act === 'autoFill') { await T.saveT(D.tid, { autoFill: el.checked }); render(); }
    });
    groupButtons(D, usesBanks);
    // finals: outline groups that are tied at the advance line / in the final
    const gt = (() => { try { return T.finals.groupTies(D); } catch (e) { return []; } })();
    // every tie in the group, each with Break tie (or the recorded result)
    const pm = T.data.playerMap(D.t), nm = id => (pm[id] || {}).name || ('#' + id);
    for (const th of [...document.querySelectorAll('main th, main td')].filter(e => /^Group \d+/.test(T.txt(e)))) {
      const no = +T.txt(th).match(/^Group (\d+)/)[1], ts = gt.filter(x => x.group === no), table = th.closest('table'); if (!table) continue;
      const box = table.parentElement, old = box.querySelector(':scope > [data-tdp=note]');
      if (!ts.length) { if (old) old.remove(); if (box.hasAttribute(MARK)) { box.style.boxShadow = ''; box.removeAttribute(MARK); } continue; }
      const open = ts.filter(t => !t.tbDone), c = T.panel.cutColor(open.length ? (ts[0].kind === 'final' ? 'rose' : 'amber') : 'green');
      box.setAttribute(MARK, 'group'); box.style.boxShadow = open.length ? `0 0 0 3px ${c[2]}` : '';
      let n = old;
      if (!n) {
        n = document.createElement('div'); n.dataset.tdp = 'note'; box.appendChild(n);
        n.addEventListener('click', ev => { const b = ev.target.closest('[data-tdp-g]'); if (!b) return; ev.preventDefault(); ev.stopPropagation(); const t = (T.finals.groupTies(T.data.D) || []).find(x => `${x.group}:${x.pts}` === b.dataset.tdpG); if (t) T.ties.openGroup(T.data.D, t); });
      }
      n.style.cssText = `margin:8px 12px;padding:6px 8px;border-radius:6px;font-size:12px;background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]}`;
      const btn = (t, label) => `<button data-tdp-g="${t.group}:${t.pts}" style="margin-left:6px;font:inherit;font-weight:600;color:#4338ca;background:#fff;border:1px solid #a5b4fc;border-radius:6px;padding:1px 8px;cursor:pointer">${label}</button>`;
      const am = T.data.arenaMap(D.t), arenaOf = g => g && g.arenaId != null ? (am[g.arenaId] || {}).name || 'an arena' : null;
      const html = ts.map(t => {
        if (t.ours) return `<div><b>Tiebreaker${t.ours.game ? ` on ${T.esc(t.ours.game)}` : ''}:</b> ${t.ours.finish.map((id, i) => `${T.esc(nm(id))} ${T.ord(t.place + i)}`).join(', ')}${btn(t, 'Details')}</div>`;
        const head = `<b>${T.esc(t.why)}</b> · ${T.esc(t.players.join(', '))}`;
        if (t.tbGame && t.tbDone) return `<div><b>Tiebreaker done${arenaOf(t.tbGame) ? ` on ${T.esc(arenaOf(t.tbGame))}` : ''}:</b> ${t.tbOrder.map((id, i) => `${T.esc(nm(id))} ${T.ord(t.place + i)}`).join(', ')}</div>`;
        if (t.tbGame && arenaOf(t.tbGame)) return `<div>${head} · <b>tiebreaker on ${T.esc(arenaOf(t.tbGame))}, playing</b> (enter its result below)</div>`;
        if (t.tbGame) return `<div>${head} · Matchplay added a tiebreaker game (below) - no arena yet${btn(t, 'Pick tiebreaker game')}</div>`;
        return `<div>${head} · <b>needs a tiebreaker game</b> <span style="opacity:.75">(Matchplay hasn't added one)</span>${btn(t, 'Break tie')}</div>`;
      }).join('');
      if (n.dataset.h !== html) { n.dataset.h = html; n.innerHTML = html; }
      // Matchplay's tiebreaker card(s) below the round: say which group and places they're for
      for (const t of ts.filter(x => x.tbGame)) tbCard(D, t, c, nm, btn);
    }
  }

  function tbCard(D, t, c, nm, btn) {
    const names = (t.tbGame.playerIds || []).map(nm);
    const card = T.mp.gameCard(names); if (!card || /\bTot\.?/.test(T.txt(card))) return;   // not drawn yet (only the group's table matches)
    let lab = card.querySelector(':scope > [data-tdp=tblabel]');
    if (!lab) {
      lab = document.createElement('div'); lab.dataset.tdp = 'tblabel'; card.prepend(lab);
      lab.addEventListener('click', ev => { const b = ev.target.closest('[data-tdp-g]'); if (!b) return; ev.preventDefault(); ev.stopPropagation(); const x = (T.finals.groupTies(T.data.D) || []).find(y => `${y.group}:${y.pts}` === b.dataset.tdpG); if (x) T.ties.openGroup(T.data.D, x); });
    }
    const places = t.ids.length > 2 ? `${T.ord(t.place)}–${T.ord(t.place + t.ids.length - 1)}` : `${T.ord(t.place)}/${T.ord(t.place + 1)}`;
    const html = `Tiebreaker · Group ${t.group} · ${t.kind === 'final' ? 'Final' : 'advancing spot'} · for ${places}${t.tbOpen && t.tbGame.arenaId == null ? btn(t, 'Pick tiebreaker game') : ''}`;
    lab.style.cssText = `padding:6px 10px;font-size:12px;font-weight:600;background:${c[0]};color:${c[1]};border-bottom:1px solid ${c[2]};border-radius:8px 8px 0 0`;
    if (lab.dataset.h !== html) { lab.dataset.h = html; lab.innerHTML = html; }
    card.style.boxShadow = t.tbOpen ? `0 0 0 3px ${c[2]}` : '';
  }

  // "Assign Bank/Order" next to each group's name (bank tournaments, e.g. finals with Arena banks (manual)): our window
  // with the bank as a dropdown (Random bank; banks other groups have this round greyed out) and the play order typed
  // as 1, 2, 3, 4 next to each player (empty = Matchplay's order). Gone once the group has its bank.
  function groupButtons(D, usesBanks) {
    const r = T.data.currentRound();
    const heads = [...document.querySelectorAll('main th, main td, main div, main span')].filter(e => [...e.children].every(c => c.dataset && c.dataset.tdp) && /^Group \d+/.test(T.txt(e)) && T.visible(e));
    for (const h of heads) {
      const no = +T.txt(h).match(/^Group (\d+)/)[1];
      const gs = r && usesBanks && String(r.status) !== 'completed' ? D.games.filter(g => g.roundId === r.roundId && g.set === no - 1 && !g.bye && g.set !== 9999) : [];
      const want = gs.length && gs.some(g => !T.timing.isDone(g)) && gs.every(g => g.bankId == null && g.arenaId == null);
      let b = h.querySelector(':scope > [data-tdp=abtn]');
      if (!want) { if (b) b.remove(); continue; }
      if (!b) {
        b = document.createElement('button'); b.dataset.tdp = 'abtn'; b.type = 'button'; b.textContent = 'Assign Bank/Order';
        b.style.cssText = 'margin-left:10px;font:500 12px ui-sans-serif,system-ui,sans-serif;padding:2px 9px;border-radius:6px;border:1px solid #a5b4fc;background:#fff;color:#4338ca;cursor:pointer;vertical-align:middle;white-space:nowrap';
        b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); bankOrder(T.data.D, no); });
        h.appendChild(b);
      }
      b.disabled = !!T.jobs.active();
    }
  }
  let boHost = null, boCur = null, boQuiet = false;
  function bankOrder(D, no) {
    const r = T.data.currentRound(); if (!r) return;
    const gs = D.games.filter(g => g.roundId === r.roundId && g.set === no - 1 && !g.bye).sort((a, b) => (a.index || 0) - (b.index || 0));
    const pm = T.data.playerMap(D.t), ids = (gs[0] && gs[0].playerIds) || [];
    const banks = (D.t.banks || []).filter(b => b.status !== 'inactive');
    const usedBy = {}; D.games.filter(g => g.roundId === r.roundId && g.bankId != null && g.set !== no - 1).forEach(g => { usedBy[g.bankId] = g.set + 1; });
    const am = T.data.arenaMap(D.t);
    banks.forEach(b => { b.games = (b.arenaIds || []).map(id => (am[id] || {}).name).filter(Boolean); });
    boCur = { no, roundId: r.roundId, players: ids.map(id => ({ id, name: (pm[id] || {}).name || '#' + id })), banks, usedBy, bank: 'random', order: {}, err: '' };
    if (!boHost) { boHost = document.createElement('div'); boHost.id = 'tdp-bankorder'; boHost.attachShadow({ mode: 'open' }); boHost.shadowRoot.addEventListener('click', boClick); boHost.shadowRoot.addEventListener('input', boInput); boHost.shadowRoot.addEventListener('change', boInput); boHost.shadowRoot.addEventListener('keydown', boKey);
      // click a box: the 1…N list opens under it; click away: closes, the number stays
      boHost.shadowRoot.addEventListener('focusin', e => { const id = e.target.dataset && e.target.dataset.p; if (id && boCur && !boQuiet && String(boCur.menu) !== String(id)) { boCur.menu = id; boDraw(); const i = boHost.shadowRoot.querySelector(`input[data-p="${id}"]`); if (i) i.focus(); } });
      boHost.shadowRoot.addEventListener('mousedown', e => { if (e.target.closest('[data-pick]')) e.preventDefault(); });
      boHost.shadowRoot.addEventListener('focusout', e => { if (!e.target.dataset || !e.target.dataset.p) return; setTimeout(() => { if (!boHost || !boCur) return; const a = boHost.shadowRoot.activeElement; if (!(a && a.dataset && a.dataset.p) && boCur.menu != null) { boCur.menu = null; boDraw(); } }, 0); }); document.documentElement.appendChild(boHost); }
    boDraw();
  }
  function boDraw() {
    if (!boHost || !boCur) return;
    const c = boCur, free = c.banks.filter(b => !c.usedBy[b.bankId]);
    const opt = b => `<option value="${b.bankId}"${String(c.bank) === String(b.bankId) ? ' selected' : ''}${c.usedBy[b.bankId] ? ' disabled' : ''}>${T.esc(b.name)}${b.games.length ? ' – ' + T.esc(b.games.join(', ')) : ''}${c.usedBy[b.bankId] ? ` · Group ${c.usedBy[b.bankId]}` : ''}</option>`;
    const chosen = c.bank === 'random' ? null : c.banks.find(b => String(b.bankId) === String(c.bank));
    const gamesHtml = chosen ? `<ol style="margin:6px 0 0;padding-left:22px">${chosen.games.map(g => `<li style="padding:1px 0"><b>${T.esc(g)}</b></li>`).join('') || '<li class="small">No games in this bank yet</li>'}</ol>` : '<div class="small" style="margin-top:6px">A free bank is picked when you press Save.</div>';
    const taken = id => new Set(Object.entries(c.order).filter(([p]) => String(p) !== String(id)).map(([, v]) => v));
    boHost.shadowRoot.innerHTML = `<style>${T.panel.CSS}:host{all:initial}.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:8vh 16px}.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:440px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}.dh{padding:16px 20px 8px;font-size:18px;font-weight:500}.db{padding:4px 20px 16px}.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px}.pl{display:grid;grid-template-columns:52px 1fr;gap:8px;align-items:center;margin:6px 0;position:relative}.pl input{width:52px;box-sizing:border-box;text-align:center;caret-color:transparent;cursor:pointer}
.pm{position:absolute;left:0;top:100%;z-index:5;display:flex;gap:4px;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px;box-shadow:0 6px 16px rgba(0,0,0,.15)}.pm button{width:30px;height:28px;border:1px solid var(--line);border-radius:5px;background:var(--card);color:var(--text);font:inherit;cursor:pointer}.pm button:hover,.pm button.on{background:#e0e7ff;border-color:#a5b4fc}</style>
      <div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg"><div class="dh">Group ${c.no} · Assign Bank/Order</div><div class="db">
      <div class="lab mb">Bank</div><select data-f="bank" style="width:100%"><option value="random"${c.bank === 'random' ? ' selected' : ''}>Random bank (${free.length} free)</option>${c.banks.map(opt).join('')}</select>${gamesHtml}
      <div class="lab mt mb">Play order <span class="small">(click a box to pick, or type 1, 2, 3… then Tab to the next player - leave empty to keep Matchplay's order)</span></div>
      ${c.players.map(p => `<div class="pl"><input type="text" inputmode="numeric" autocomplete="off" data-p="${p.id}" value="${c.order[p.id] || ''}" title="Click to pick, or type 1-${c.players.length}"><span>${T.esc(p.name)}</span>${String(c.menu) === String(p.id) ? `<div class="pm">${c.players.map((_, k) => k + 1).filter(k => !taken(p.id).has(k)).map(k => `<button type="button" tabindex="-1" data-pick="${k}" data-pp="${p.id}" class="${c.order[p.id] === k ? 'on' : ''}">${k}</button>`).join('')}</div>` : ''}</div>`).join('')}
      ${c.err ? `<div class="callout err mt">${T.esc(c.err)}</div>` : ''}
      </div><div class="df"><button class="btn sec" data-act="close">Cancel</button><button class="btn" data-act="save" ${free.length ? '' : 'disabled'}>Save</button></div></div></div></div>`;
  }
  function boInput(e) {
    if (!boCur) return;
    if (e.target.dataset.f === 'bank') { if (e.type === 'change') { boCur.bank = e.target.value; boDraw(); } return; }
    if (e.target.dataset.p) e.target.value = boCur.order[e.target.dataset.p] || '';   // only picks / digit keys change it
  }
  // a player gets number v: whoever had it shifts down one (and so on) to the nearest free number below, else up;
  // when only one player is left without a number, they get the one left
  function boAssign(id, v) {
    const c = boCur, n = c.players.length, ord = c.order;
    delete ord[id];
    const holder = k => Object.keys(ord).find(p => ord[p] === k);
    if (holder(v)) {
      let free = null; for (let k = v - 1; k >= 1; k--) if (!holder(k)) { free = k; break; }
      if (free != null) { for (let k = free + 1; k <= v; k++) { const h = holder(k); if (h) ord[h] = k - 1; } }
      else { for (let k = v + 1; k <= n; k++) if (!holder(k)) { free = k; break; } for (let k = free - 1; k >= v; k--) { const h = holder(k); if (h) ord[h] = k + 1; } }
    }
    ord[id] = v;
    const left = c.players.filter(p => !ord[p.id]);
    if (left.length === 1) { const used = new Set(Object.values(ord)); for (let k = 1; k <= n; k++) if (!used.has(k)) { ord[left[0].id] = k; break; } }
    c.err = ''; c.menu = null; boDraw();
    boQuiet = true; const i = boHost.shadowRoot.querySelector(`input[data-p="${id}"]`); if (i) i.focus(); boQuiet = false;
  }
  function boKey(e) {
    const id = e.target.dataset && e.target.dataset.p; if (!id || !boCur) return;
    if (e.key === 'Tab') return;
    e.preventDefault();
    if (e.key === 'Escape') { boCur.menu = null; return boDraw(); }
    const v = parseInt(e.key, 10);
    if (v >= 1 && v <= boCur.players.length) boAssign(id, v);   // anything else is ignored
  }
  async function boClick(e) {
    const pk = e.target.closest('[data-pick]'); if (pk && boCur) return boAssign(pk.dataset.pp, +pk.dataset.pick);
    const a = e.target.closest('[data-act]'); if (!a || !boCur) return;
    if (a.dataset.act === 'bg' && e.target !== a) return;
    if (a.dataset.act === 'bg' || a.dataset.act === 'close') { boHost.remove(); boHost = null; boCur = null; return; }
    if (a.dataset.act !== 'save') return;
    const c = boCur, D = T.data.D, n = c.players.length, typed = Object.values(c.order);
    // order: all empty = keep Matchplay's; otherwise every player gets 1…N, each once
    if (typed.length && (typed.length !== n || new Set(typed).size !== n || typed.some(v => v < 1 || v > n))) { c.err = `Give each player a different number from 1 to ${n} (or leave them all empty).`; return boDraw(); }
    const free = c.banks.filter(b => !c.usedBy[b.bankId]);
    const bank = c.bank === 'random' ? free[Math.floor(Math.random() * free.length)] : c.banks.find(b => String(b.bankId) === String(c.bank));
    if (!bank) { c.err = 'Pick a bank.'; return boDraw(); }
    const steps = [{ tid: D.tid, page: 'matches', op: 'assignBanks', args: { tid: D.tid, roundId: c.roundId, pairs: [{ group: c.no, bank: bank.name }] }, label: `Group ${c.no} → ${bank.name}` }];
    if (typed.length) steps.push({ tid: D.tid, page: 'matches', op: 'playerOrder', args: { group: c.no, names: [...c.players].sort((x, y) => c.order[x.id] - c.order[y.id]).map(p => p.name) }, label: `Group ${c.no}: play order` });
    boHost.remove(); boHost = null; boCur = null;
    try { await T.jobs.start(`Group ${c.no}: ${bank.name}${typed.length ? ' + play order' : ''}`, steps); } catch (err) { T.panel.say(err.message || String(err), 'err'); }
  }

  // reminder on every page of the tournament while a tiebreaker waits for results, or check-in ticks wait for Confirm
  const loading = new Set();
  function reminder(D) {
    const p = D.qual ? T.ties.pending(D) : [];
    const ck = [];
    for (const f of D.finals || []) {
      if (!T.tstate[f.tid]) { if (!loading.has(f.tid)) { loading.add(f.tid); T.loadT(f.tid).then(() => render()); } continue; }
      const n = Object.keys(T.tstate[f.tid].ckPending || {}).length;
      if (n && !(D.tid === f.tid && T.routePage() === 'players')) ck.push({ f, n });
    }
    const main = document.querySelector('main');
    const anchor = (p.length || ck.length) && main ? [...main.children].find(e => !/^tdp-/.test(e.id || '')) : null;
    const tbs = p.length ? `<div class="callout warn gap" style="margin:8px 16px">${p.length} tiebreaker${p.length === 1 ? '' : 's'} waiting for results: ${p.map(x => `<button class="btn sm" data-act="tb" data-key="${x.key}">Positions ${x.pos}–${x.pos + x.ids.length - 1} · ${T.esc(x.game || '')}</button>`).join(' ')}</div>` : '';
    const cks = ck.map(({ f, n }) => `<div class="callout warn gap" style="margin:8px 16px;align-items:center"><span class="flex1">${n} check-in change${n === 1 ? '' : 's'} waiting for Confirm in ${T.esc(f.name || (f.t && f.t.name) || 'the finals')}.</span><a class="btn sm" href="/tournaments/${f.tid}/players">Go to Players</a></div>`).join('');
    block('tdp-tb-reminder', anchor, 'before', tbs + cks, onTieClick);
  }
  let lastPage = null;
  function render() {
    if (T.isFrame) return;   // the hidden worker frame shows nothing
    const D = T.data.D;
    const page0 = T.routePage();
    if (page0 !== lastPage) { lastPage = page0; if ((page0 === 'standings' || page0 === 'resolve-ties') && D.qual) T.data.refresh(true); }
    if (!D.isTD || !D.t) { clearMarks(); ['tdp-ties-standings', 'tdp-elig', 'tdp-ties-resolve', 'tdp-auto', 'tdp-tb-reminder', 'tdp-bankbar', 'tdp-arena-times', 'tdp-ifpa-btn', 'tdp-busy-banner', 'tdp-elig-bar', 'tdp-plays'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); return; }
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
      if (T.plays) T.plays.render(D);
      if (T.timers) T.timers.render(D);
    } catch (e) { T.warn('inpage', e); }
  }
  // Matchplay's "Manual" button in the standings Ties column: show our resolved-tie window instead of its info box
  document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('main table [data-tdp-pid]');
    if (!c || T.routePage() !== 'standings' || !T.data.D.isTD) return;
    e.preventDefault(); e.stopPropagation();
    T.ties.openResolved(T.data.D, Number(c.dataset.tdpPid));
  }, true);
  return { render, block, setAutoState: s => { autoState = s; render(); } };
})();
