// Matches tab: "Est. 34 min" by each group (its games' estimated times added up - worked out once, then kept) and a
// live timer over each game (stops at the final time when the game is done). Stats → Rounds: a "Max est." column
// (the longest group estimate of each round) next to Matchplay's Duration.
var TDP = window.TDP || (window.TDP = {});

TDP.timers = (() => {
  const T = TDP;
  let est = null, guess = new Set(), estAt = 0, estTid = null, loading = false, ticker = null;
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const mins = sec => `${Math.round(sec / 60)} min`;

  // game-time estimates per arena (same as the Arenas tab / game-time option), refreshed every few minutes
  function estimates(D) {
    if (est && estTid === D.tid && Date.now() - estAt < 300e3) return est;
    if (!loading) {
      loading = true;
      T.bankplan.extras(D).then(x => { est = {}; guess = new Set(); T.bankplan.estimates(D, T.tstate[D.tid] || {}, x, true).forEach(a => { est[a.arenaId] = a.sec; if (a.src === 'era estimate') guess.add(a.arenaId); }); estAt = Date.now(); estTid = D.tid; })
        .catch(() => {}).finally(() => { loading = false; render(T.data.D); });
    }
    return estTid === D.tid ? est : null;
  }
  // each group's estimate for a round: saved the first time all its games have an arena, never changed after
  let saving = false, histFor = null;
  // item 107: the round played out with the estimated game times: a game starts when its group is free and its
  // machine is free (+1 min, like the planner), so a group waiting on a machine another group is on counts the wait.
  // Kept under a new key (estW) so rounds saved before 0.28.1 are worked out again once, with waits.
  const BUFFER = 60;
  function schedule(games, E) {
    const bySet = {}; for (const g of games) (bySet[g.set] = bySet[g.set] || []).push(g);
    const G = Object.entries(bySet).map(([set, gs]) => ({ set, gs: gs.sort((a, b) => (a.index || 0) - (b.index || 0)), k: 0, t: 0 }));
    const free = {}, out = {};
    for (;;) {
      const open = G.filter(x => x.k < x.gs.length); if (!open.length) break;
      const x = open.reduce((m, y) => (y.t < m.t || (y.t === m.t && +y.set < +m.set) ? y : m));
      const g = x.gs[x.k++], sec = E[g.arenaId] || 13 * 60, s = free[g.arenaId] != null ? Math.max(x.t, free[g.arenaId] + BUFFER) : x.t;
      free[g.arenaId] = x.t = s + sec;
    }
    for (const x of G) out[x.set] = Math.round(x.t);
    return out;
  }
  function groupEst(D, roundId) {
    const st = T.tstate[D.tid] || {}, saved = { ...((st.estW || {})[roundId] || {}) }, guessed = { ...((st.estWGuess || {})[roundId] || {}) }, E = estimates(D);
    const games = D.games.filter(g => g.roundId === roundId && !g.bye && g.set !== 9999);
    if (!E || !games.length) return saved;
    const sets = [...new Set(games.map(g => g.set))];
    if (sets.every(x => saved[x] != null)) return saved;
    if (games.some(g => g.arenaId == null)) {   // not every game has its arena yet: show each set's game times added up, save nothing
      const tmp = { ...saved };
      for (const x of sets) { const gs = games.filter(g => g.set === x); if (tmp[x] == null && gs.every(g => g.arenaId != null)) tmp[x] = Math.round(gs.reduce((s, g) => s + (E[g.arenaId] || 13 * 60), 0)); }
      return tmp;
    }
    const sch = schedule(games, E);
    for (const x of sets) {
      if (saved[x] != null) continue;
      saved[x] = sch[x];
      if (games.filter(g => g.set === x).every(g => guess.has(g.arenaId) || !E[g.arenaId])) guessed[x] = 1;
    }
    if (!saving) { saving = true; T.saveT(D.tid, { estW: { ...(st.estW || {}), [roundId]: saved }, estWGuess: { ...(st.estWGuess || {}), [roundId]: guessed } }).finally(() => { saving = false; }); }
    return saved;
  }

  // ---------- Matches tab ----------
  function put(th, cls, html, data) {
    let el = th.querySelector(`[data-tdp="timer"].${cls}`);
    if (!el) { el = document.createElement('div'); el.dataset.tdp = 'timer'; el.className = cls; el.style.cssText = 'font-size:11px;font-weight:500;line-height:1.3;white-space:nowrap;font-variant-numeric:tabular-nums'; th.appendChild(el); }
    for (const [k, v] of Object.entries(data || {})) el.dataset[k] = v == null ? '' : String(v);
    if (html && el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
    return el;
  }
  function matches(D) {
    const byId = new Map(D.games.map(g => [g.gameId, g]));
    for (const table of document.querySelectorAll('main table')) {
      const head = table.querySelector('thead tr'); if (!head) continue;
      const ths = [...head.children]; if (!/^Group \d+/.test(T.txt(ths[0]))) continue;
      const col = {};   // column -> game
      for (const a of table.querySelectorAll('a[href*="/matches/"]')) { const td = a.closest('td'), m = a.getAttribute('href').match(/\/matches\/(\d+)/); if (td && m && byId.has(+m[1])) col[td.cellIndex] = byId.get(+m[1]); }
      const games = Object.values(col); if (!games.length) continue;
      const rid = games[0].roundId, set = games[0].set, rg = D.games.filter(g => g.roundId === rid);
      for (const [i, g] of Object.entries(col)) {
        const th = ths[+i]; if (!th) continue;
        const s = T.timing.realStart(g, rg), done = T.timing.doneish(g), e = done ? T.timing.gEnd(g) : null;
        const dur = Number(g.duration) > 0 && Number(g.duration) < 86400 ? Number(g.duration) * 1000 : 0;
        put(th, 'tdp-gt', '', { start: s || '', end: e || '', done: done ? 1 : '', dur: dur || '' });
      }
      // the group: estimate (kept from round start) + time so far
      const ordered = games.slice().sort((a, b) => (a.index || 0) - (b.index || 0));
      const s0 = T.timing.realStart(ordered[0], rg), all = ordered.every(T.timing.doneish), last = all ? Math.max(...ordered.map(g => T.timing.gEnd(g) || 0)) : null;
      const e = set === 9999 ? null : groupEst(D, rid)[set];
      put(ths[0], 'tdp-ge', '', { start: s0 || '', end: last || '', est: e || '', guess: set !== 9999 && ((T.tstate[D.tid] || {}).estWGuess || {})[rid] && T.tstate[D.tid].estWGuess[rid][set] ? 1 : '' });
    }
    tick();
  }
  // every second: the timers' text from their start / end
  function tick() {
    const now = Date.now();
    for (const el of document.querySelectorAll('[data-tdp="timer"].tdp-gt')) {
      const s = +el.dataset.start, e = +el.dataset.end;
      const html = !s && el.dataset.done ? `<span style="color:#6b7280">✓${+el.dataset.dur ? ' ' + fmt(+el.dataset.dur) : ''}</span>` : !s ? '<span style="color:#9ca3af">waiting</span>' : e ? `<span style="color:#6b7280">✓ ${fmt(e - s)}</span>` : `<span style="color:#4f46e5">${fmt(now - s)}</span>`;
      if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
    }
    for (const el of document.querySelectorAll('[data-tdp="timer"].tdp-ge')) {
      const est = +el.dataset.est;
      // just the estimate (item 74): "Est. 26 min"
      const html = est ? `<span title="Estimated when the round started (game times added up, plus any wait for a machine another group is on) - doesn't change">Est. ${mins(est)}</span>` : '<span style="color:#9ca3af">Est. –</span>';
      if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
    }
  }

  // ---------- Stats → Rounds: Max est. ----------
  function stats(D) {
    const table = [...document.querySelectorAll('main table')].find(t => [...(t.querySelector('thead tr') || t.querySelector('tr') || { children: [] }).children].some(th => /^duration$/i.test(T.txt(th))));
    if (!table || location.hash === '#tdp-plays') return;
    const head = table.querySelector('thead tr') || table.querySelector('tr');
    const di = [...head.children].findIndex(th => /^duration$/i.test(T.txt(th)) && !th.dataset.tdp);
    if (di < 0) return;
    // older rounds' games aren't in the page's data: fetch them once (item 102's ensureHistory)
    const have = new Set(D.games.map(g => g.roundId));
    if ((D.rounds || []).some(r => !have.has(r.roundId)) && histFor !== D.tid) { histFor = D.tid; T.data.ensureHistory(D.tid).then(() => render(T.data.D)).catch(() => {}); }
    const one = new URLSearchParams(location.search).get('roundId');   // item 108: one round picked - a row per game
    let th = head.querySelector('[data-tdp="timer"]');
    if (!th) { th = document.createElement('th'); th.dataset.tdp = 'timer'; th.className = head.children[di].className; head.children[di].after(th); }
    const hText = one ? 'Est.' : 'Max est.', hTitle = one ? "This game's estimated time - hover for its group's estimate" : 'Longest group estimate of the round (game times added up when it started, plus any wait for a machine another group is on)';
    if (th.textContent !== hText) th.textContent = hText;
    th.title = hTitle;
    if (one) return roundRows(D, table, head, di, +one);
    const byName = new Map((D.rounds || []).map(r => [String(r.name || '').toLowerCase(), r]));
    const rows = [...table.querySelectorAll('tr')].filter(tr => tr !== head && tr.children.length > di);
    const maxOf = r => Object.entries(groupEst(D, r.roundId)).sort((a, b) => b[1] - a[1])[0];
    const vals = rows.map(tr => byName.get(T.txt(tr.children[0]).toLowerCase())).filter(Boolean).map(maxOf).filter(Boolean).map(b => b[1]);
    for (const tr of rows) {
      const name = T.txt(tr.children[0]).toLowerCase(), r = byName.get(name);
      let td = tr.querySelector('[data-tdp="timer"]');
      if (!td) { td = document.createElement('td'); td.dataset.tdp = 'timer'; td.className = tr.children[di].className; tr.children[di].after(td); }
      let text = '', title = '';
      if (r) {
        const best = maxOf(r);
        if (best) { text = mins(best[1]); title = `Group ${+best[0] + 1}`; }
      } else if (/^total$/.test(name) && vals.length) text = mins(vals.reduce((s, v) => s + v, 0));
      else if (/^average$/.test(name) && vals.length) text = mins(vals.reduce((s, v) => s + v, 0) / vals.length);
      if (td.textContent !== (text || '–')) td.textContent = text || '–';
      td.title = title;
    }
  }

  // item 108: Stats → Rounds with one round picked: rows "#1 | arena | duration …" in Matchplay's game order
  // (game 1 of every group, then game 2 …); each row gets its game's estimate, the title its group's
  function roundRows(D, table, head, di, rid) {
    const E = estimates(D), am = T.data.arenaMap(D.t), est = groupEst(D, rid), top = Math.max(0, ...Object.values(est));
    const games = D.games.filter(g => g.roundId === rid && !g.bye).sort((a, b) => ((a.index || 0) - (b.index || 0)) || (a.set - b.set) || (a.gameId - b.gameId));
    const used = new Set();
    for (const tr of [...table.querySelectorAll('tr')].filter(tr => tr !== head && tr.children.length > di)) {
      let td = tr.querySelector('[data-tdp="timer"]');
      if (!td) { td = document.createElement('td'); td.dataset.tdp = 'timer'; td.className = tr.children[di].className; tr.children[di].after(td); }
      const name = T.txt(tr.children[1]).toLowerCase();
      const g = games.find(x => !used.has(x.gameId) && String((am[x.arenaId] || {}).name || '').toLowerCase() === name);
      let text = '', title = '';
      if (g) {
        used.add(g.gameId);
        if (E && E[g.arenaId]) text = mins(E[g.arenaId]);
        if (g.set === 9999) title = 'Tiebreaker';
        else if (est[g.set] != null) title = `Group ${g.set + 1}: ${mins(est[g.set])} estimated${est[g.set] === top ? ' - the longest group this round (Max est.)' : ''}`;
      }
      if (td.textContent !== (text || '–')) td.textContent = text || '–';
      td.title = title;
    }
  }

  function render(D) {
    if (T.isFrame || !D || !D.t || !D.isTD) return;
    const page = T.routePage();
    if (page === 'matches') { matches(D); if (!ticker) ticker = setInterval(() => { if (T.routePage() !== 'matches' || T.settings.off) { clearInterval(ticker); ticker = null; return; } tick(); }, 1000); }
    if (page === 'stats') stats(D);
  }
  return { render, groupEst };
})();
