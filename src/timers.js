// Matches tab: "Est. 34 min" by each group (its games' estimated times added up - worked out once, then kept) and a
// live timer over each game (stops at the final time when the game is done). Stats → Rounds: a "Max est." column
// (the longest group estimate of each round) next to Matchplay's Duration.
var TDP = window.TDP || (window.TDP = {});

TDP.timers = (() => {
  const T = TDP;
  let est = null, estAt = 0, estTid = null, loading = false, ticker = null;
  const fmt = ms => { const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
  const mins = sec => `${Math.round(sec / 60)} min`;

  // game-time estimates per arena (same as the Arenas tab / game-time option), refreshed every few minutes
  function estimates(D) {
    if (est && estTid === D.tid && Date.now() - estAt < 300e3) return est;
    if (!loading) {
      loading = true;
      T.bankplan.extras(D).then(x => { est = {}; T.bankplan.estimates(D, T.tstate[D.tid] || {}, x, true).forEach(a => { est[a.arenaId] = a.sec; }); estAt = Date.now(); estTid = D.tid; })
        .catch(() => {}).finally(() => { loading = false; render(T.data.D); });
    }
    return estTid === D.tid ? est : null;
  }
  // each group's estimate for a round: saved the first time all its games have an arena, never changed after
  let saving = false;
  function groupEst(D, roundId) {
    const st = T.tstate[D.tid] || {}, saved = { ...((st.est || {})[roundId] || {}) }, E = estimates(D);
    let added = false;
    const sets = {};
    for (const g of D.games) if (g.roundId === roundId && !g.bye && g.set !== 9999) (sets[g.set] = sets[g.set] || []).push(g);
    for (const [set, gs] of Object.entries(sets)) {
      if (saved[set] != null || !E || gs.some(g => g.arenaId == null)) continue;
      saved[set] = Math.round(gs.reduce((s, g) => s + (E[g.arenaId] || 13 * 60), 0)); added = true;
    }
    if (added && !saving) { saving = true; T.saveT(D.tid, { est: { ...(st.est || {}), [roundId]: saved } }).finally(() => { saving = false; }); }
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
        put(th, 'tdp-gt', '', { start: s || '', end: e || '', done: done ? 1 : '' });
      }
      // the group: estimate (kept from round start) + time so far
      const ordered = games.slice().sort((a, b) => (a.index || 0) - (b.index || 0));
      const s0 = T.timing.realStart(ordered[0], rg), all = ordered.every(T.timing.doneish), last = all ? Math.max(...ordered.map(g => T.timing.gEnd(g) || 0)) : null;
      const e = set === 9999 ? null : groupEst(D, rid)[set];
      put(ths[0], 'tdp-ge', '', { start: s0 || '', end: last || '', est: e || '' });
    }
    tick();
  }
  // every second: the timers' text from their start / end
  function tick() {
    const now = Date.now();
    for (const el of document.querySelectorAll('[data-tdp="timer"].tdp-gt')) {
      const s = +el.dataset.start, e = +el.dataset.end;
      const html = !s ? '<span style="color:#9ca3af">waiting</span>' : e ? `<span style="color:#6b7280">✓ ${fmt(e - s)}</span>` : `<span style="color:#4f46e5">⏱ ${fmt(now - s)}</span>`;
      if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
    }
    for (const el of document.querySelectorAll('[data-tdp="timer"].tdp-ge')) {
      const s = +el.dataset.start, e = +el.dataset.end, est = +el.dataset.est;
      const run = s ? (e || now) - s : 0, over = est && run > est * 1000;
      const html = `${est ? `<span title="Estimated when the round started (game times added up) - doesn't change">Est. ${mins(est)}</span>` : '<span style="color:#9ca3af">Est. –</span>'}${s ? ` · <span style="color:${over ? '#b45309' : e ? '#6b7280' : '#4f46e5'}">${e ? '✓ ' : ''}${fmt(run)}</span>` : ''}`;
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
    if (!head.querySelector('[data-tdp="timer"]')) { const th = document.createElement('th'); th.dataset.tdp = 'timer'; th.className = head.children[di].className; th.textContent = 'Max est.'; th.title = 'Longest group estimate of the round (game times added up when it started)'; head.children[di].after(th); }
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

  function render(D) {
    if (T.isFrame || !D || !D.t || !D.isTD) return;
    const page = T.routePage();
    if (page === 'matches') { matches(D); if (!ticker) ticker = setInterval(() => { if (T.routePage() !== 'matches' || T.settings.off) { clearInterval(ticker); ticker = null; return; } tick(); }, 1000); }
    if (page === 'stats') stats(D);
  }
  return { render, groupEst };
})();
