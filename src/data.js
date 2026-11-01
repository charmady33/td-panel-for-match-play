// Loads and refreshes everything the panel shows: Match Play's own page data first (page.js / pagedata.js, item 69),
// the official API for anything the page doesn't have.
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

  async function loadTournament(id, maxAge, prio, apiOnly) {
    if (!apiOnly && T.page) {   // this tab's page, or another open tab's copy (with its links), before the API
      const p = T.page.get(id); if (p) return withLinks(p);
      const o = await T.page.shared(id, maxAge ? 180e3 : 15e3); if (o && o.links && o.t) return o.t;
    }
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

  // the page's rounds and games (rounds whose games the page hasn't loaded keep what we had; loadGames gets them)
  function fromPage(p) {
    if (p.roundsKnown) D.rounds = p.rounds;
    const keep = new Map(D.games.map(g => [g.gameId, g]));
    for (const g of p.games) keep.set(g.gameId, g);
    D.games = [...keep.values()];
    if (p.standings && D.qual && D.qual.tournamentId === D.tid) D.standings = p.standings;
  }
  async function loadGames(force, p) {
    // Matchplay lists rounds newest first: keep them oldest first everywhere (Round 1, 2, 3…)
    if (!(p && p.roundsKnown)) D.rounds = arr(unwrap(await api.get(`/tournaments/${D.tid}/rounds`, 15000))).sort((a, b) => ((a.index != null ? a.index : a.roundId) - (b.index != null ? b.index : b.roundId)));
    const keep = new Map(D.games.map(g => [g.gameId, g]));
    for (const r of D.rounds) {
      const done = String(r.status) === 'completed';
      const onPage = p ? p.games.filter(g => g.roundId === r.roundId) : [];
      if (onPage.length) { for (const g of onPage) keep.set(g.gameId, g); if (done) doneRounds.add(r.roundId); continue; }
      if (done && doneRounds.has(r.roundId)) continue;
      const path = `/tournaments/${D.tid}/games?round=${r.roundId}`;
      const list = await api.all(path, done || force ? 0 : 12000);   // after a change: the open round straight from the API
      for (const g of list) keep.set(g.gameId, g);
      if (done) { doneRounds.add(r.roundId); }
    }
    const lp = p && T.page.get(D.tid);   // the page may have changed while the API answered: its latest wins
    if (lp) { for (const g of lp.games) keep.set(g.gameId, g); if (lp.roundsKnown) D.rounds = lp.rounds; }
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

  // the store doesn't always know a tournament's links (qualifying / finals): the API's, kept 2 minutes
  const linkCache = {};
  let linkBusy = false;
  async function withLinks(p) {
    if (p.linksKnown) return p.t;
    const c = linkCache[p.tid], prev = D.t && D.t.tournamentId === p.tid ? D.t.linkedTournaments : null;
    const get = () => api.get(tPath(p.tid), 55e3).then(t => { linkCache[p.tid] = { at: Date.now(), l: (unwrap(t) || {}).linkedTournaments || [] }; }).catch(() => {});
    if (!c && !prev) await get();   // first time: needed to know the qualifying / finals
    else if ((!c || Date.now() - c.at > 120e3) && !linkBusy) { linkBusy = true; get().finally(() => { linkBusy = false; }); }
    const l = linkCache[p.tid] ? linkCache[p.tid].l : prev;
    return { ...p.t, linkedTournaments: l || [] };
  }
  const isTDnow = () => !!(D.me && D.t && (D.me.userId === D.t.organizerId || (D.t.managers || []).some(m => m === D.me.userId || (m && (m.userId === D.me.userId || m.id === D.me.userId))))) || pageShowsTdControls();

  let again = false, againSoft = false;
  async function refresh(force = false, opt = {}) {
    if (!D.tid) return;
    if (busy) { if (force) again = true; else againSoft = true; return; }   // asked mid-refresh: runs right after it
    busy = true; D.loading = true;
    try {
      // Match Play's page first: everything draws at once, no waiting on the API (item 69)
      if (force && T.page && !opt.api) await T.page.fresh();
      const p = !opt.api && T.page ? T.page.get(D.tid) : null;
      if (p) {
        if (p.me && (!D.me || D.me.userId !== p.me.userId)) D.me = { ...(D.me || {}), ...p.me };
        D.t = await withLinks(p);
        fromPage(p);
        D.isTD = isTDnow();
        if (D.isTD) { D.cached = false; noteChange(); emit(); }
      }
      if (!T.settings.token) throw new Error('NO_TOKEN');
      const now = Date.now();
      if (!D.me) D.me = unwrap(await api.get('/users/profile', 3600e3));
      const fullDue = force || now - lastFull > (T.routePage() === 'matches' ? 15e3 : 60e3) || !D.t;   // Matches tab: keep round/status fresh
      if (fullDue) {
        if (!p) D.t = await loadTournament(D.tid, force ? 0 : 55e3, false, !!opt.api);
        await loadFamily(force ? 0 : 55e3);
        lastFull = now;
      }
      D.isTD = isTDnow();
      if (!D.isTD) return;
      if (fullDue && T.cats) T.cats.lookup(D.t.arenas, emit);   // LCD vs DMD from OPDB, in the background
      // standings of the qualifying tournament: a page that has them (this tab or another open tab), else the API at
      // most every 15 s (we use 30 s). Before the games, so check-in and the finals tables can draw first
      if (D.qual && (force || now - lastStand > 30e3)) {
        const sh = T.page && !opt.api ? await T.page.shared(D.qual.tournamentId, force ? 20e3 : 180e3) : null;
        D.standings = sh && sh.standings ? sh.standings : arr(unwrap(await api.get(`/tournaments/${D.qual.tournamentId}/standings`, force ? 0 : 29e3)));   // force = fresh (tie just resolved)
        lastStand = now;
      }
      if (fullDue && !D.games.length) { D.cached = false; emit(); }   // first load: players + standings are enough to draw
      await loadGames(force, p);
      D.error = null; D.cached = false;
      saveCache();
      noteChange();
    } catch (e) {
      D.error = T.apiErrorText(e);
    } finally {
      busy = false; D.loading = false; D.updatedAt = Date.now(); emit();
      if (again) { again = false; againSoft = false; setTimeout(() => refresh(true), 0); }
      else if (againSoft) { againSoft = false; setTimeout(() => refresh(), 0); }
    }
  }
  // the page changed (Match Play got an update): redraw from it at once
  // (straight away, even while a slower API refresh is still running)
  function quick(p) {
    if (!D.t || D.t.tournamentId !== p.tid) return false;
    D.t = p.linksKnown ? p.t : { ...p.t, linkedTournaments: D.t.linkedTournaments || [] };
    fromPage(p);
    D.isTD = isTDnow();
    if (D.isTD) { noteChange(); emit(); }
    return true;
  }
  if (T.page) T.page.on(p => { if (!D.tid || p.tid !== D.tid) return; if (!(busy && quick(p))) refresh(); });

  // one round's games / the rounds, as fresh as possible: the page (after asking it for its latest), else the API
  async function roundGames(tid, roundId) {
    if (T.page) { await T.page.fresh(); const p = T.page.get(tid); const gs = p ? p.games.filter(g => g.roundId === roundId) : []; if (gs.length) return gs; }
    return api.all(`/tournaments/${tid}/games?round=${roundId}`, 0);
  }
  async function roundsOf(tid) {
    if (T.page) { await T.page.fresh(); const p = T.page.get(tid); if (p && p.roundsKnown) return p.rounds; }
    return arr(unwrap(await api.get(`/tournaments/${tid}/rounds`, 0, true)));
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
    // only what Matchplay's page shows, in a fixed order (the same data never looks changed - item 70)
    const by = k => (a, b) => a[k] - b[k];
    const s = JSON.stringify([D.tid, D.t && D.t.status, [...(D.t && D.t.players || [])].sort(by('playerId')).map(p => [p.playerId, (p.tournamentPlayer || {}).status]),
      [...D.rounds].sort(by('roundId')).map(r => [r.roundId, r.status]), D.games.filter(g => String(g.status) !== 'completed' || !doneRounds.has(g.roundId)).sort(by('gameId')).map(g => [g.gameId, g.status, g.arenaId, (g.suggestions || []).length, T.timing.hasScore(g) ? (g.resultPositions || []).join() : ''])]);
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
  // real-time events (live.js) do the quick updates; this timer is the safety net (every minute while they're on)
  // Match Play's page updates come by themselves (item 69): then this is only a once-a-minute check; a hidden tab with an
  // automatic option on checks the API itself about once a minute (Chrome may slow a long-hidden page)
  function start() {
    stop();
    timer = setInterval(() => {
      ticks++;
      if (document.hidden) { if (autosOn() && ticks % 4 === 0) refresh(false, { api: true }); return; }
      if ((T.page && T.page.get(D.tid)) || (T.live && T.live.ok())) { if (ticks % 4 === 0) refresh(); return; }
      refresh();
    }, 15000);
  }
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

  return { D, refresh, reloadOne, roundGames, roundsOf, onChange: f => changeListeners.add(f), setTournament, useTournament, stop, on: f => listeners.add(f), playerMap, arenaMap, currentRound, latestRound, counts, loadTournament, unwrap, arr };
})();
