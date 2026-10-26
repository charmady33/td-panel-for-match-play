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

  async function loadTournament(id, maxAge) {
    const t = unwrap(await api.get(tPath(id), maxAge));
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

  async function loadGames() {
    D.rounds = arr(unwrap(await api.get(`/tournaments/${D.tid}/rounds`, 15000)));
    const keep = new Map(D.games.map(g => [g.gameId, g]));
    for (const r of D.rounds) {
      const done = String(r.status) === 'completed';
      if (done && doneRounds.has(r.roundId)) continue;
      const path = `/tournaments/${D.tid}/games?round=${r.roundId}`;
      const list = await api.all(path, done ? 0 : 12000);
      for (const g of list) keep.set(g.gameId, g);
      if (done) { doneRounds.add(r.roundId); }
    }
    D.games = [...keep.values()];
    if (T.logs) await T.logs.load(D.tid, isCompleted(D.t));   // when scores were really entered (Matchplay's Logs)
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

  async function refresh(force = false) {
    if (busy || !D.tid) return;
    busy = true; D.loading = true;
    try {
      if (!T.settings.token) throw new Error('NO_TOKEN');
      const now = Date.now();
      if (!D.me) D.me = unwrap(await api.get('/users/profile', 3600e3));
      const fullDue = force || now - lastFull > 60e3 || !D.t;
      if (fullDue) {
        D.t = await loadTournament(D.tid, force ? 0 : 55e3);
        await loadFamily(force ? 0 : 55e3);
        lastFull = now;
      }
      D.isTD = !!(D.me && D.t && D.me.userId === D.t.organizerId) || pageShowsTdControls();
      if (!D.isTD) return;
      if (fullDue && T.cats) T.cats.lookup(D.t.arenas, emit);   // LCD vs DMD from OPDB, in the background
      await loadGames();
      // standings of the qualifying tournament: at most every 15 s (we use 30 s)
      if (D.qual && (force || now - lastStand > 30e3)) {
        D.standings = arr(unwrap(await api.get(`/tournaments/${D.qual.tournamentId}/standings`, force ? 0 : 29e3)));   // force = fresh (tie just resolved)
        lastStand = now;
      }
      D.error = null;
    } catch (e) {
      D.error = T.apiErrorText(e);
    } finally {
      busy = false; D.loading = false; D.updatedAt = Date.now(); emit();
    }
  }

  // managers aren't in the API's organizerId - fall back to TD-only buttons Matchplay shows
  function pageShowsTdControls() {
    return !!(document.querySelector(`a[href="/tournaments/${D.tid}/edit"]`) || T.findBtn(document, /^(Start next round|Start tournament|Complete tournament|Add players)$/));
  }

  async function setTournament(tid) {
    if (D.tid === tid) return;
    stop();
    Object.assign(D, { tid, t: null, isTD: null, qual: null, finals: [], rounds: [], games: [], standings: [], error: null });
    doneRounds.clear(); lastFull = 0; lastStand = 0;
    const st = await T.loadT(tid);
    if (T.cats) await T.cats.load();
    Object.keys(T.timing.fullSeen).forEach(k => delete T.timing.fullSeen[k]);
    Object.assign(T.timing.fullSeen, st.fullSeen || {});
    if (tid) { await refresh(true); start(); }
    emit();
  }
  function start() { stop(); timer = setInterval(() => { if (!document.hidden) refresh(); }, 15000); }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  // ---------- derived ----------
  function arenaMap(t) { const m = {}; for (const a of (t && t.arenas) || []) m[a.arenaId] = a; return m; }
  const playerMap = t => { const m = {}; for (const p of (t && t.players) || []) m[p.playerId] = p; return m; };
  const currentRound = () => { const s = D.rounds.filter(r => String(r.status) !== 'completed'); return s[s.length - 1] || null; };
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

  return { D, refresh, setTournament, stop, on: f => listeners.add(f), playerMap, arenaMap, currentRound, latestRound, counts, loadTournament, unwrap, arr };
})();
