// Loads and refreshes everything the panel shows, from the official API.
var TDP = window.TDP || (window.TDP = {});

TDP.data = (() => {
  const T = TDP, api = T.api;
  const D = { tid: null, t: null, me: null, isTD: null, qual: null, finals: [], rounds: [], games: [], standings: [], error: null, loading: false, updatedAt: 0 };
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(D); } catch (e) { T.warn(e); } });
  const unwrap = j => (j && j.data && !Array.isArray(j) && !j.meta ? j.data : j);
  const arr = j => Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : []);
  let timer = null, busy = false, lastFull = 0, lastStand = 0;
  const doneRounds = new Set();   // completed rounds already fetched (never change)

  const isCompleted = t => t && String(t.status) === 'completed';
  const tPath = id => `/tournaments/${id}?includePlayers=1&includeArenas=1&includeBanks=1&includeLinkedTournaments=1`;

  async function loadTournament(id, maxAge, prio) {
    const t = unwrap(await api.get(tPath(id), maxAge, prio));
    if (isCompleted(t)) api.keepForever(tPath(id));
    return t;
  }

  // which tournament is the qualifying one, and which are its playoffs (A = linkIndex 0, B = 1...)
  async function loadFamily(maxAge) {
    const links = D.t.linkedTournaments || [];
    const playoffs = links.filter(l => l.linkType === 'playoff');
    if (playoffs.length || (D.t.playoffsCutoffs || []).length || !links.length) D.qual = D.t;
    else {
      const q = links.find(l => l.linkType !== 'playoff') || links[0];
      D.qual = q ? await loadTournament(q.tournamentId, maxAge) : null;
    }
    const pl = ((D.qual && D.qual.linkedTournaments) || []).filter(l => l.linkType === 'playoff').sort((a, b) => (a.linkIndex || 0) - (b.linkIndex || 0));
    D.finals = [];
    for (const l of pl) {
      const ft = l.tournamentId === D.tid ? D.t : await loadTournament(l.tournamentId, maxAge);
      D.finals.push({ tid: l.tournamentId, linkIndex: l.linkIndex || 0, name: l.name, status: l.status, t: ft });
    }
  }

  async function loadGames(force) {
    // Matchplay lists rounds newest first: keep them oldest first everywhere (Round 1, 2, 3…)
    D.rounds = arr(unwrap(await api.get(`/tournaments/${D.tid}/rounds`, 15000))).sort((a, b) => ((a.index != null ? a.index : a.roundId) - (b.index != null ? b.index : b.roundId)));
    const keep = new Map(D.games.map(g => [g.gameId, g]));
    for (const r of D.rounds) {
      const done = String(r.status) === 'completed';
      if (done && doneRounds.has(r.roundId)) continue;
      const path = `/tournaments/${D.tid}/games?round=${r.roundId}`;
      const list = await api.all(path, done || force ? 0 : 12000);   // after a change: the open round straight from the API
      for (const g of list) keep.set(g.gameId, g);
      if (done) { doneRounds.add(r.roundId); }
    }
    D.games = [...keep.values()];
    // when scores were really entered (Matchplay's Logs): only where game times are shown or used
    if (T.logs && (/^(arenas|banks)$/.test(T.routePage()) || T.isFrame)) await T.logs.load(D.tid, isCompleted(D.t));
    T.timing.noteSuggestions(D.games);
    await T.saveT(D.tid, { fullSeen: { ...T.timing.fullSeen } });
    await recordHistory();
  }

  // every tournament run with the extension keeps its per-arena game times (by arena name) for later bank building
  let histAt = 0;
  async function recordHistory() {
    if (Date.now() - histAt < 5 * 60e3 || !D.t) return;
    histAt = Date.now();
    const times = T.timing.arenaTimes(D.games), am = arenaMap(D.t), arenas = {};
    for (const [id, v] of Object.entries(times)) { const n = ((am[id] || {}).name || '').toLowerCase(); if (n) arenas[n] = { count: v.count, avg: v.avg }; }
    if (!Object.keys(arenas).length) return;
    const hist = await T.store.get('hist', {});
    hist[D.tid] = { name: D.t.name, date: D.t.startUtc || null, at: Date.now(), arenas };
    await T.store.set('hist', hist);
  }

  let again = false;
  async function refresh(force = false) {
    if (!D.tid) return;
    if (busy) { if (force) again = true; return; }   // a forced reload asked mid-refresh runs right after it
    busy = true; D.loading = true;
    try {
      if (!T.settings.token) throw new Error('NO_TOKEN');
      const now = Date.now();
      if (!D.me) D.me = unwrap(await api.get('/users/profile', 3600e3));
      const fullDue = force || now - lastFull > (T.routePage() === 'matches' ? 15e3 : 60e3) || !D.t;   // Matches tab: keep round/status fresh
      if (fullDue) {
        D.t = await loadTournament(D.tid, force ? 0 : 55e3);
        await loadFamily(force ? 0 : 55e3);
        lastFull = now;
      }
      D.isTD = !!(D.me && D.t && D.me.userId === D.t.organizerId) || pageShowsTdControls();
      if (!D.isTD) return;
      if (fullDue && T.cats) T.cats.lookup(D.t.arenas, emit);   // LCD vs DMD from OPDB, in the background
      // standings of the qualifying tournament: at most every 15 s (we use 30 s). Before the games, so check-in and
      // the finals tables can draw first
      if (D.qual && (force || now - lastStand > 30e3)) {
        D.standings = arr(unwrap(await api.get(`/tournaments/${D.qual.tournamentId}/standings`, force ? 0 : 29e3)));   // force = fresh (tie just resolved)
        lastStand = now;
      }
      if (fullDue && !D.games.length) { D.cached = false; emit(); }   // first load: players + standings are enough to draw
      await loadGames(force);
      D.error = null; D.cached = false;
      saveCache();
      noteChange();
    } catch (e) {
      D.error = T.apiErrorText(e);
    } finally {
      busy = false; D.loading = false; D.updatedAt = Date.now(); emit();
      if (again) { again = false; setTimeout(() => refresh(true), 0); }
    }
  }

  // one tournament again, straight away (e.g. a finals right after check-in) - then everything else
  async function reloadOne(tid) {
    try {
      const t = await loadTournament(tid, 0, true);
      if (tid === D.tid) D.t = t;
      if (D.qual && D.qual.tournamentId === tid) D.qual = t;
      for (const f of D.finals) if (f.tid === tid) f.t = t;
      emit();
    } catch (e) { T.warn('reloadOne', e); }
    refresh(true);
  }

  // what Matchplay would show differently: players, rounds, games and their scores (for keeping its page in sync)
  let sig = null;
  const changeListeners = new Set();
  function noteChange() {
    const s = JSON.stringify([D.tid, D.t && D.t.status, (D.t && D.t.players || []).map(p => [p.playerId, (p.tournamentPlayer || {}).status]),
      D.rounds.map(r => [r.roundId, r.status]), D.games.filter(g => !doneRounds.has(g.roundId) || g.status !== 'completed').map(g => [g.gameId, g.status, g.arenaId, (g.suggestions || []).length, g.resultPositions || g.resultPoints || null])]);
    const prev = sig; sig = s;
    if (prev && prev !== s && JSON.parse(prev)[0] === D.tid) changeListeners.forEach(f => { try { f(D); } catch (e) { T.warn(e); } });
  }

  // managers aren't in the API's organizerId - fall back to TD-only buttons Matchplay shows
  function pageShowsTdControls() {
    return !!(document.querySelector(`a[href="/tournaments/${D.tid}/edit"]`) || T.findBtn(document, /^(Start next round|Start tournament|Complete tournament|Add players)$/));
  }

  // the worker frame: just which tournament it's on (tasks refresh what they need themselves)
  async function useTournament(tid) {
    if (D.tid === tid) return;
    Object.assign(D, { tid, t: null, isTD: null, qual: null, finals: [], rounds: [], games: [], standings: [], error: null });
    await T.loadT(tid); if (T.cats) await T.cats.load();
  }

  // last data seen for each tournament, so a reload draws everything straight away (then it's refreshed)
  const CACHE_KEEP = 6;
  let cacheAt = 0;
  async function saveCache() {
    if (!D.tid || !D.t || !D.isTD || Date.now() - cacheAt < 20000) return;
    cacheAt = Date.now();
    const idx = (await T.store.get('cacheIdx', [])).filter(x => x !== D.tid); idx.unshift(D.tid);
    for (const old of idx.splice(CACHE_KEEP)) await T.store.del('cache:' + old);
    await T.store.set('cacheIdx', idx);
    await T.store.set('cache:' + D.tid, { at: Date.now(), me: D.me, t: D.t, qual: D.qual, finals: D.finals, rounds: D.rounds, games: D.games, standings: D.standings });
  }
  async function loadCache(tid) {
    let c = await T.store.get('cache:' + tid, null);
    if (!c || !c.t || Date.now() - c.at > 7 * 864e5) {
      // first visit: another tournament of the same set (qualifying, A, B, C…) knows this one's players and standings
      c = null;
      for (const id of await T.store.get('cacheIdx', [])) {
        const o = await T.store.get('cache:' + id, null);
        if (!o || !o.t || Date.now() - o.at > 7 * 864e5) continue;
        const f = (o.finals || []).find(x => x.tid === tid && x.t);
        const q = o.qual && o.qual.tournamentId === tid ? o.qual : null;
        if (f || q) { c = { me: o.me, t: f ? f.t : q, qual: o.qual, finals: o.finals, rounds: [], games: [], standings: o.standings }; break; }
      }
      if (!c) return false;
    }
    Object.assign(D, { me: c.me || D.me, t: c.t, qual: c.qual, finals: c.finals || [], rounds: c.rounds || [], games: c.games || [], standings: c.standings || [], isTD: true, cached: true });
    return true;
  }

  async function setTournament(tid) {
    if (D.tid === tid) return;
    stop();
    Object.assign(D, { tid, t: null, isTD: null, qual: null, finals: [], rounds: [], games: [], standings: [], error: null });
    doneRounds.clear(); lastFull = 0; lastStand = 0; sig = null;
    const st = await T.loadT(tid);
    if (T.cats) await T.cats.load();
    Object.keys(T.timing.fullSeen).forEach(k => delete T.timing.fullSeen[k]);
    Object.assign(T.timing.fullSeen, st.fullSeen || {});
    if (tid && await loadCache(tid)) emit();   // draw from the saved copy at once
    if (tid) { await refresh(true); start(); }
    emit();
  }
  // every 15 s while the tab shows; in the background only when an automatic option is on (every 30 s - Chrome may
  // slow it to about once a minute), so a round started on a phone is still noticed
  const autosOn = () => { const st = T.tstate[D.tid] || {}; return !!(st.auto || st.autoAssign); };
  let ticks = 0;
  function start() { stop(); timer = setInterval(() => { ticks++; if (!document.hidden || (autosOn() && ticks % 2 === 0)) refresh(); }, 15000); }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  // ---------- derived ----------
  function arenaMap(t) { const m = {}; for (const a of (t && t.arenas) || []) m[a.arenaId] = a; return m; }
  const playerMap = t => { const m = {}; for (const p of (t && t.players) || []) m[p.playerId] = p; return m; };
  const currentRound = () => { const s = D.rounds.filter(r => String(r.status) !== 'completed'); return s[s.length - 1] || null; };   // newest round still open
  const latestRound = () => D.rounds[D.rounds.length - 1] || null;
  function counts() {
    const r = currentRound(); const gs = r ? D.games.filter(g => g.roundId === r.roundId && !g.bye) : [];
    let active = 0, pending = 0, partial = 0;
    for (const g of gs) {
      if (T.timing.isDone(g)) continue;
      const s = T.timing.suggestState(g);
      if (s === 'full') pending++; else { active++; if (s === 'partial') partial++; }
    }
    return { round: r, active, pending, partial, total: gs.length, done: gs.filter(T.timing.doneish).length };
  }

  return { D, refresh, reloadOne, onChange: f => changeListeners.add(f), setTournament, useTournament, stop, on: f => listeners.add(f), playerMap, arenaMap, currentRound, latestRound, counts, loadTournament, unwrap, arr };
})();
