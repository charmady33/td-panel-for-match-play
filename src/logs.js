// When were scores actually entered? Matchplay clears a game's suggestions once it's approved, but its Logs tab
// keeps a timestamped "Suggestion created" entry per game. Read from the same address Matchplay's Logs page uses
// (works while you're logged in; usually only on tournaments you run or manage). Falls back silently.
var TDP = window.TDP || (window.TDP = {});

TDP.logs = (() => {
  const T = TDP;
  const ts = v => { const t = Date.parse(v); return isFinite(t) ? t : null; };
  const seen = {};   // tid -> { at, ok }

  async function fetchAll(tid) {
    const out = [];
    for (let page = 1; page <= 40; page++) {
      const r = await fetch(`/api/activity-logs?tournament=${tid}&page=${page}`, { credentials: 'include', headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error('logs ' + r.status);
      const j = await r.json();
      out.push(...(j.data || []));
      const last = (j.meta && (j.meta.last_page || j.meta.lastPage)) || 1;
      if (page >= last) break;
      await T.sleep(300);
    }
    return out;
  }

  // gameId -> ms: the last suggestion made before the game was completed (that's the one that was approved)
  function ends(entries) {
    const sug = {}, done = {};
    for (const x of entries) {
      if (x.type !== 'game' || x.typeId == null) continue;
      const t = ts(x.createdAt); if (t == null) continue;
      if (x.action === 'game_suggestion_create') (sug[x.typeId] = sug[x.typeId] || []).push(t);
      if (x.action === 'game_results_complete') done[x.typeId] = Math.min(done[x.typeId] || Infinity, t);
    }
    const out = {};
    for (const [id, list] of Object.entries(sug)) {
      const lim = done[id] || Infinity, before = list.filter(t => t <= lim);
      if (before.length) out[id] = Math.max(...before);
    }
    return out;
  }

  // load (and cache) one tournament's suggestion times into T.timing.logEnd
  async function load(tid, completed) {
    if (!tid) return 0;
    const s = seen[tid];
    if (s && (s.done || Date.now() - s.at < 60e3)) return s.n;
    const key = 'logEnds:' + tid;
    const cached = await T.store.get(key, null);
    if (cached && cached.done) { Object.assign(T.timing.logEnd, cached.ends); seen[tid] = { at: Date.now(), done: true, n: Object.keys(cached.ends).length }; return seen[tid].n; }
    try {
      const e = ends(await fetchAll(tid));
      Object.assign(T.timing.logEnd, e);
      await T.store.set(key, { done: !!completed, ends: e });
      seen[tid] = { at: Date.now(), done: !!completed, n: Object.keys(e).length };
    } catch (err) { seen[tid] = { at: Date.now(), done: false, n: 0 }; }
    return seen[tid].n;
  }

  return { load, ends };
})();
