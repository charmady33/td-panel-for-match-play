// Stats tab → "Plays": who played which game and how many times (one row per player, one column per game).
// Added as a sub-tab next to Matchplay's Rounds / Arenas / Players / Points/round. Sort by any column.
var TDP = window.TDP || (window.TDP = {});

TDP.plays = (() => {
  const T = TDP;
  const ON = '#tdp-plays';
  const ACTIVE = 'border-indigo-500 text-indigo-600 dark:text-indigo-400', IDLE = 'border-transparent text-default';
  const opt = { sort: 'name', dir: 1, round: 'all', done: false, active: false, tb: true };
  let hooked = null;

  const on = () => location.hash === ON;
  function nav() {
    const a = [...document.querySelectorAll('main nav a')].find(x => /\/stats\/round-points$/.test(x.getAttribute('href') || ''));
    return a ? a.parentElement : null;
  }
  // Matchplay's own sub-tab content (filters + tables) under the nav: hidden while Plays shows
  const content = n => { const box = n.parentElement; return [...box.parentElement.children].filter(e => e !== box && e.id !== 'tdp-plays' && box.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING); };

  function render(D) {
    const n = T.routePage() === 'stats' && D && D.t ? nav() : null;
    if (!n) { T.inpage.block('tdp-plays', null); return; }
    let link = n.querySelector('a[data-tdp-plays]');
    if (!link) {
      const model = n.querySelector('a');
      link = document.createElement('a'); link.dataset.tdpPlays = '1'; link.dataset.tdp = '1'; link.href = ON; link.textContent = 'Plays';
      link.className = model.className;
      link.addEventListener('click', e => { e.preventDefault(); history.replaceState(history.state, '', location.pathname + location.search + ON); render(T.data.D); });
      n.appendChild(link);
    }
    if (hooked !== n) {   // Matchplay's own sub-tabs: leave Plays
      hooked = n;
      n.addEventListener('click', e => {
        const a = e.target.closest('a'); if (!a || a.dataset.tdpPlays || !on()) return;
        // give Matchplay its own tab classes back first, so its page switch draws them right
        for (const x of n.querySelectorAll('a[data-tdp-was-active]')) { delete x.dataset.tdpWasActive; x.className = x.className.replace(IDLE, ACTIVE); }
        history.replaceState(history.state, '', location.pathname + location.search); setTimeout(() => render(T.data.D), 0);
      }, true);
    }
    const show = on();
    const swap = (el, active) => { const want = el.className.replace(active ? IDLE : ACTIVE, active ? ACTIVE : IDLE); if (want !== el.className) el.className = want; };
    for (const a of n.querySelectorAll('a')) {
      if (a.dataset.tdpPlays) swap(a, show);
      else if (show) { if (a.className.includes(ACTIVE)) { a.dataset.tdpWasActive = '1'; swap(a, false); } }
      else if (a.dataset.tdpWasActive) { delete a.dataset.tdpWasActive; swap(a, true); }
    }
    for (const el of content(n)) { if (show && el.style.display !== 'none') { el.dataset.tdpHid = '1'; el.style.display = 'none'; } else if (!show && el.dataset.tdpHid) { el.style.display = ''; delete el.dataset.tdpHid; } }
    T.inpage.block('tdp-plays', show ? n.parentElement : null, 'after', show ? html(D) : '', onEvent);
  }

  // ---------- the table ----------
  function data(D) {
    const am = T.data.arenaMap(D.t), rounds = D.rounds || [], rn = {}; rounds.forEach((r, i) => { rn[r.roundId] = r.name || 'Round ' + (i + 1); });
    const players = (D.t.players || []).filter(p => !opt.active || !p.tournamentPlayer || p.tournamentPlayer.status !== 'inactive');
    const games = (D.games || []).filter(g => !g.bye && g.arenaId != null && (opt.round === 'all' || String(g.roundId) === opt.round) && (!opt.done || T.timing.isDone(g)) && (opt.tb || g.set !== 9999));
    const cnt = {}, where = {}, perGame = {};
    for (const g of games) {
      perGame[g.arenaId] = (perGame[g.arenaId] || 0) + 1;
      for (const p of g.playerIds || []) {
        const k = p + ':' + g.arenaId; cnt[k] = (cnt[k] || 0) + 1;
        (where[k] = where[k] || []).push((rn[g.roundId] || 'Round') + (g.set === 9999 ? ' (tiebreaker)' : ''));
      }
    }
    const used = new Set(games.map(g => g.arenaId));
    const arenas = (D.t.arenas || []).filter(a => used.has(a.arenaId) || !a.tournamentArena || a.tournamentArena.status !== 'inactive').sort((a, b) => a.name.localeCompare(b.name));
    const rows = players.map(p => {
      const c = arenas.map(a => cnt[p.playerId + ':' + a.arenaId] || 0);
      const total = c.reduce((s, x) => s + x, 0);
      return { p, c, total, diff: c.filter(Boolean).length, rep: c.reduce((s, x) => s + Math.max(0, x - 1), 0) };
    });
    return { rows, arenas, where, perGame, am, rounds };
  }
  function html(D) {
    const X = data(D), { rows, arenas } = X;
    const key = r => opt.sort === 'name' ? r.p.name.toLowerCase() : opt.sort === 'total' ? r.total : opt.sort === 'diff' ? r.diff : opt.sort === 'rep' ? r.rep : r.c[arenas.findIndex(a => 'a' + a.arenaId === opt.sort)] || 0;
    rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * opt.dir || a.p.name.localeCompare(b.p.name); });
    const arrow = k => opt.sort === k ? (opt.dir === 1 ? ' ▲' : ' ▼') : '';
    const th = (k, label, title, extra = '') => `<th data-sort="${k}" title="${T.esc(title || 'Sort')}" style="cursor:pointer;white-space:nowrap;${extra}">${label}${arrow(k)}</th>`;
    const shade = n => (n >= 4 ? '#a5b4fc' : n === 3 ? '#c7d2fe' : n === 2 ? '#e0e7ff' : '');
    const down = a => a.tournamentArena && a.tournamentArena.status === 'inactive';
    const body = rows.map(r => `<tr><td style="white-space:nowrap">${T.esc(r.p.name)}</td><td class="num"><b>${r.total}</b></td><td class="num">${r.diff}</td><td class="num">${r.rep || ''}</td>${r.c.map((n, i) => {
      const w = X.where[r.p.playerId + ':' + arenas[i].arenaId] || [];
      return `<td class="num" style="${n >= 2 ? `background:${shade(n)};color:#1e1b4b;font-weight:600` : ''}" title="${n ? T.esc(`${r.p.name} · ${arenas[i].name}: ${w.join(', ')}`) : ''}">${n || ''}</td>`;
    }).join('')}</tr>`).join('');
    const foot = `<tr style="background:var(--head)"><td><b>Games played</b></td><td class="num"><b>${arenas.reduce((s, a) => s + (X.perGame[a.arenaId] || 0), 0)}</b></td><td></td><td></td>${arenas.map(a => `<td class="num"><b>${X.perGame[a.arenaId] || 0}</b></td>`).join('')}</tr>`;
    const head = `<tr>${th('name', 'Player', 'Sort by name')}${th('total', 'Total', 'Games played')}${th('diff', 'Different', 'Different games played')}${th('rep', 'Repeats', 'Plays beyond the first on a game')}${arenas.map(a => th('a' + a.arenaId, `<span style="writing-mode:vertical-rl;transform:rotate(180deg);display:inline-block;max-height:140px;overflow:hidden;text-overflow:ellipsis">${T.esc(a.name)}</span>`, `${a.name}${down(a) ? ' (disabled)' : ''} - sort by times played`, `vertical-align:bottom;text-align:center;${down(a) ? 'opacity:.45' : ''}`)).join('')}</tr>`;
    const roundSel = `<select data-f="round" style="width:auto"><option value="all">All rounds</option>${X.rounds.map(r => `<option value="${r.roundId}"${String(r.roundId) === opt.round ? ' selected' : ''}>${T.esc(r.name || '')}</option>`).join('')}</select>`;
    const cb = (k, label) => `<label class="gap" style="align-items:center"><input type="checkbox" data-f="${k}"${opt[k] ? ' checked' : ''}> <span class="small">${label}</span></label>`;
    return `<div class="card" style="margin:0 0 16px"><div class="cb gap" style="flex-wrap:wrap;align-items:center">
      <span class="h">Who played what</span>${roundSel}${cb('done', 'Completed games only')}${cb('active', 'Active players only')}${cb('tb', 'Count tiebreakers')}
      <span class="small flex1" style="text-align:right">Click a column to sort · shaded = played 2+ times · hover a number for the rounds</span></div>
      <div style="overflow:auto;max-height:75vh"><table>${head}${body || `<tr><td colspan="${4 + arenas.length}" class="small">No games played yet.</td></tr>`}${foot}</table></div></div>`;
  }
  function onEvent(e) {
    const D = T.data.D;
    if (e.type === 'change') {
      const f = e.target.dataset && e.target.dataset.f; if (!f) return;
      opt[f] = f === 'round' ? e.target.value : e.target.checked;
      return render(D);
    }
    const h = e.target.closest('[data-sort]'); if (!h) return;
    const k = h.dataset.sort;
    if (opt.sort === k) opt.dir = -opt.dir; else { opt.sort = k; opt.dir = k === 'name' ? 1 : -1; }
    render(D);
  }
  return { render };
})();
