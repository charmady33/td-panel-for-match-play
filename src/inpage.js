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
  const tieCard = (ties, D, link) => ties.length ? `<div class="card" style="margin:16px 0"><div class="ch"><span class="h">Ties to break before finals</span><span class="badge b-rose">${ties.length} unresolved</span>${link ? `<a class="btn sm" href="/tournaments/${D.tid}/resolve-ties">Resolve ties</a>` : ''}</div><div class="cb">${ties.map(t => {
    const c = colorOf(t, D);
    return `<div class="tie" style="background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]}"><b>Positions ${t.pos}–${t.pos + (t.span || t.players.length) - 1}:</b> ${T.esc(t.players.map(r => r.p ? r.p.name : r.playerId).join(', '))}<div>${T.esc(t.why)}</div></div>`;
  }).join('')}</div></div>` : '';

  // ---------- Standings tab: Matchplay's standings on the left, finals standings (eligibility applied) on the right ----------
  function eligTable(D) {
    const divs = T.finals.plan(D), ranks = T.finals.ranksOf(D), rows = T.finals.order(D);
    const tiedIds = new Set(qualTies(D).flatMap(t => t.players.map(r => r.playerId)));
    const placed = new Set(divs.flatMap(x => x.picks.map(r => r.playerId)));
    const line = (r, seed, note) => `<tr${tiedIds.has(r.playerId) ? ' style="background:#fef3c7"' : ''}><td class="small num">${seed}</td><td>${T.esc(r.p.name)}${note ? ` <span class="small">${note}</span>` : ''}${tiedIds.has(r.playerId) ? ' <span class="badge b-amber" style="padding:0 6px">tie</span>' : ''}</td><td class="num small">${T.ord(r.position)}</td><td class="num small">${Math.round(Number(r.points) * 100) / 100}</td></tr>`;
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
    block('tdp-ties-standings', col, 'before', tieCard(ties, D, true));
    if (col && D.qual && D.tid === D.qual.tournamentId && (D.qual.playoffsCutoffs || []).length && D.standings.length) {
      col.style.flexDirection = 'row'; col.style.alignItems = 'flex-start'; col.style.gap = '16px';
      const mine = col.firstElementChild; mine.style.flex = '1 1 0'; mine.style.minWidth = '0';
      const host = block('tdp-elig', mine, 'after', eligTable(D));
      if (host) { host.style.flex = '1 1 0'; host.style.minWidth = '0'; host.style.marginTop = '8px'; }
    } else block('tdp-elig', null);
    if (!table) return;
    const byPlayer = new Map(); ties.forEach(t => t.players.forEach(r => { if (!byPlayer.has(r.playerId)) byPlayer.set(r.playerId, t); }));
    for (const tr of table.querySelectorAll('tr')) {
      const a = tr.querySelector('a[href*="/players/"]'); if (!a) continue;
      const id = Number((a.getAttribute('href').match(/\/players\/(\d+)/) || [])[1]);
      const t = byPlayer.get(id);
      if (!t) { if (tr.hasAttribute(MARK)) { tr.style.background = ''; tr.style.boxShadow = ''; tr.removeAttribute(MARK); tr.querySelectorAll('[data-tdp=note]').forEach(n => n.remove()); } continue; }
      const c = colorOf(t, D);
      tr.setAttribute(MARK, 'row'); tr.style.background = c[0]; tr.style.boxShadow = `inset 4px 0 0 ${c[2]}`;
      if (!tr.querySelector('[data-tdp=note]')) {
        const n = document.createElement('span'); n.dataset.tdp = 'note'; n.title = t.why;
        n.textContent = t.kind === 'seeding' ? 'Seeding tie' : 'Unresolved tie';
        n.style.cssText = `margin-left:8px;font-size:11px;font-weight:600;padding:1px 8px;border-radius:9999px;background:#fff;color:${c[1]};border:1px solid ${c[2]};white-space:nowrap`;
        a.insertAdjacentElement('afterend', n);
      }
    }
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
      const html = `<b>Important for finals.</b> ${T.esc(t.why)}`;
      let n = old;
      if (!n) { n = document.createElement('div'); n.dataset.tdp = 'note'; card.appendChild(n); }
      n.style.cssText = `margin:8px 12px 12px;padding:6px 8px;border-radius:6px;font-size:12px;background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]}`;
      if (n.innerHTML !== html) n.innerHTML = html;
    }
    // a tie we know about with no unresolved card = just resolved in Matchplay: refresh our standings
    if (ties.length > shown.length && Date.now() - staleKick > 15000) { staleKick = Date.now(); T.data.refresh(true); }
    const list = shown.map(({ t, c0 }) => { const c = colorOf(t, D); return `<div class="tie" style="background:${c[0]};color:${c[1]};border-left:4px solid ${c[2]}"><b>Positions ${c0.from}–${c0.to}:</b> ${T.esc(t.why)}</div>`; }).join('');
    block('tdp-ties-resolve', anchorEl, 'before', shown.length
      ? `<div class="card" style="margin:12px 0"><div class="ch"><span class="h">${shown.length} unresolved tie${shown.length === 1 ? '' : 's'} matter for finals</span></div><div class="cb">${list}<div class="small">Each is outlined below. Other unresolved ties don't change who makes the finals or their seeds.</div></div></div>`
      : '<div class="callout ok" style="margin:12px 0">No unresolved ties affect the finals.</div>');
  }

  // ---------- Matches tab ----------
  function matches(D) {
    const st = T.tstate[D.tid] || {};
    const refresh = T.findBtn(document.querySelector('main') || document, /^Refresh$/);
    // the toolbar row holding "Display round… / Refresh / Start next round"; our bar goes right under it
    let bar = refresh ? refresh.closest('div') : null;
    if (bar && bar.parentElement && bar.parentElement.tagName !== 'MAIN' && bar.parentElement.contains(refresh)) bar = bar.parentElement;
    if (!bar || bar.tagName === 'MAIN' || !bar.closest('main')) bar = refresh;
    const html = D.t && D.t.status === 'started' ? `<div class="card" style="margin:12px 0"><div class="cb gap">
      <label class="gap"><input type="checkbox" data-act="auto" ${st.auto ? 'checked' : ''}> <span class="lab">Auto close round &amp; start next round</span></label>
      <span class="small flex1">${st.auto ? T.esc(autoState || 'watching') : 'When every game is approved (no pending or partial scores, no open tiebreakers), closes the round and starts the next after a countdown you can cancel. Never past the last round; never completes the tournament.'}</span>
      </div></div>` : '';
    block('tdp-auto', html ? bar : null, 'after', html, async e => {
      const el = e.target; if (e.type !== 'change' || el.dataset.act !== 'auto') return;
      await T.saveT(D.tid, { auto: el.checked }); autoState = ''; render(); T.panel.render(true);
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

  function render() {
    const D = T.data.D;
    if (!D.isTD || !D.t) { clearMarks(); ['tdp-ties-standings', 'tdp-elig', 'tdp-ties-resolve', 'tdp-auto'].forEach(id => { const e = document.getElementById(id); if (e) e.remove(); }); return; }
    const page = T.routePage();
    try {
      if (page === 'standings') standings(D); else { block('tdp-ties-standings', null); block('tdp-elig', null); }
      if (page === 'resolve-ties') resolveTies(D); else block('tdp-ties-resolve', null);
      if (page === 'matches') matches(D); else block('tdp-auto', null);
    } catch (e) { T.warn('inpage', e); }
  }
  setInterval(render, 1500);   // Matchplay re-renders its pages; put our bits back
  return { render, setAutoState: s => { autoState = s; render(); } };
})();
