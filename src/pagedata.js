// Match Play's own page data (sent by page.js from the page's store): the tournament on screen, its rounds and games,
// straight away and on every change. Other tabs' events are shared through storage. Anything missing here comes from
// the API (data.js). Item 69.
var TDP = window.TDP || (window.TDP = {});

TDP.page = (() => {
  const T = TDP, listeners = new Set();
  let cur = null, waiters = [];
  const pts = v => (v == null || typeof v === 'string' ? v : Number(v).toFixed(2));   // the API sends "36.00"

  // only data that looks complete is used; otherwise the API is (Match Play may change how its page keeps data)
  function norm(d) {
    if (!d || !d.t || d.t.tournamentId !== d.tid || !d.playersKnown || !d.arenasKnown || !Array.isArray(d.rounds) || !Array.isArray(d.games)) return null;
    if (d.games.some(g => g.gameId == null || g.roundId == null || g.set == null) || d.rounds.some(r => r.roundId == null)) return null;
    const rounds = [...d.rounds].sort((a, b) => ((a.index != null ? a.index : a.roundId) - (b.index != null ? b.index : b.roundId)));
    const standings = d.standings ? d.standings.map(s => ({ ...s, points: pts(s.points) })) : null;
    // a started tournament whose rounds aren't loaded yet: rounds come from the API
    const roundsKnown = rounds.length > 0 || String(d.t.status) !== 'started' || d.t.type === 'max_matchplay';   // (max match play has no rounds)
    return { tid: d.tid, at: Date.now(), t: d.t, rounds, roundsKnown, games: d.games, standings, me: d.me, linksKnown: d.linksKnown, max: d.max || null };
  }

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data.__tdp !== 'page') return;
    const d = norm(e.data.data);
    silent = 0;
    const w = waiters; waiters = []; w.forEach(f => f());
    if (!d) return;
    cur = d;
    share(d);
    listeners.forEach(f => { try { f(d); } catch (x) { T.warn(x); } });
  });

  const get = tid => (cur && cur.tid === tid ? cur : null);
  // ask the page for its latest data (right after a change we made) - at most ~0.6 s
  let silent = 0;   // no answers yet (page.js not running / store not found): stop waiting after twice
  function fresh() {
    if (silent >= 2) { window.postMessage({ __tdp: 'pageReq' }, location.origin); return Promise.resolve(); }
    return new Promise(res => {
      const t = setTimeout(() => { silent++; res(); }, 600);
      waiters.push(() => { clearTimeout(t); silent = 0; res(); });
      window.postMessage({ __tdp: 'pageReq' }, location.origin);
    });
  }

  // ---------- shared between tabs: each tab's tournament (+ standings when its page has them) ----------
  const KEY = 'pageShare', KEEP = 8;
  let sharedAt = {}, beat = null, later = null;
  async function share(d, force) {
    if (!T.store || T.dead) return;
    const wait = 5000 - (Date.now() - (sharedAt[d.tid] || 0));
    if (!force && wait > 0) { if (!later) later = setTimeout(() => { later = null; if (cur) share(cur, true); }, wait); return; }   // at most every 5 s, the latest one last
    sharedAt[d.tid] = Date.now();
    try {
      const all = await T.store.get(KEY, {});
      all[d.tid] = { at: Date.now(), t: d.t, links: !!d.linksKnown, standings: d.standings || null };
      const ids = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
      for (const id of ids.slice(KEEP)) delete all[id];
      await T.store.set(KEY, all);
    } catch (e) { /* storage full or gone */ }
    if (!beat) beat = setInterval(() => { if (cur) share(cur, true); }, 60e3);   // an open tab keeps its copy current (Match Play updates the page)
  }
  async function shared(tid, maxAge = 180e3) {
    if (cur && cur.tid === tid) return { at: cur.at, t: cur.t, standings: cur.standings };
    try { const o = (await T.store.get(KEY, {}))[tid]; return o && Date.now() - o.at < maxAge ? o : null; } catch (e) { return null; }
  }

  return { get, fresh, shared, on: f => listeners.add(f), ok: () => !!cur, norm };
})();
