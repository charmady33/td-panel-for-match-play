// Per-round bank planning: new banks each round (different from earlier rounds' banks), then which group plays
// which bank so players spread over every game. Used by the Banks tab and by the automatic per-round option.
var TDP = window.TDP || (window.TDP = {});

TDP.bankplan = (() => {
  const T = TDP;
  const lc = s => String(s || '').toLowerCase();

  // the round that needs banks: newest round with group games that have no arena yet (else the newest round)
  function context(D) {
    const am = T.data.arenaMap(D.t);
    const rounds = D.rounds || [];
    const needs = r => D.games.some(g => g.roundId === r.roundId && !g.bye && g.set !== 9999 && g.arenaId == null && g.bankId == null);
    const round = [...rounds].reverse().find(r => String(r.status) !== 'completed' && needs(r)) || null;
    // groups of that round
    const groups = [];
    if (round) {
      const sets = {};
      for (const g of D.games.filter(x => x.roundId === round.roundId && !x.bye && x.set !== 9999)) (sets[g.set] = sets[g.set] || new Set()) && (g.playerIds || []).forEach(p => sets[g.set].add(p));
      for (const [set, ps] of Object.entries(sets).sort((a, b) => a[0] - b[0])) groups.push({ key: Number(set) + 1, players: [...ps] });
    }
    // earlier rounds: which games shared a bank (or a group, when banks weren't used) and who played what
    const earlier = rounds.filter(r => !round || r.roundId !== round.roundId);
    const history = [];
    for (const r of earlier) {
      const byBank = {};
      for (const g of D.games.filter(x => x.roundId === r.roundId && !x.bye && x.arenaId != null && x.set !== 9999)) {
        const k = g.bankId != null ? 'b' + g.bankId : 's' + g.set;
        (byBank[k] = byBank[k] || new Set()).add((am[g.arenaId] || {}).name);
      }
      history.push(Object.values(byBank).map(s => [...s].filter(Boolean)));
    }
    const plays = new Map();
    for (const g of D.games) {
      if (g.bye || g.arenaId == null || (round && g.roundId === round.roundId)) continue;
      const n = lc((am[g.arenaId] || {}).name);
      for (const p of g.playerIds || []) plays.set(p + '|' + n, (plays.get(p + '|' + n) || 0) + 1);
    }
    return { round, groups, history, plays };
  }

  // game-time estimate per arena = all sources combined, weighted by game count:
  // this tournament, the qualifying (finals only), Matchplay IDs loaded by the TD, past events run with the extension
  function sources(D, st, extra) {
    const am = T.data.arenaMap(D.t), out = {};
    const put = (key, name, v) => { if (!name || !v || !v.count) return; const k = lc(name); (out[k] = out[k] || {})[key] = { count: v.count, avg: v.avg }; };
    for (const [id, v] of Object.entries(T.timing.arenaTimes(D.games))) put('live', (am[id] || {}).name, v);
    for (const [k, v] of Object.entries((extra && extra.qual) || {})) put('qual', k, v);
    for (const [k, v] of Object.entries(st.pastTimes || {})) put('past', k, v);
    const hm = {};
    for (const h of (extra && extra.hist) || []) for (const [k, v] of Object.entries(h)) { const m = hm[k] || (hm[k] = { count: 0, sum: 0 }); m.count += v.count; m.sum += v.avg * v.count; }
    for (const [k, m] of Object.entries(hm)) put('hist', k, { count: m.count, avg: m.sum / m.count });
    for (const v of Object.values(out)) {
      let c = 0, sum = 0; for (const x of ['live', 'qual', 'past', 'hist']) if (v[x]) { c += v[x].count; sum += v[x].avg * v[x].count; }
      v.combined = c ? { count: c, avg: sum / c } : null;
    }
    return out;
  }
  const SRC_NAME = { live: 'This event', qual: 'Qualifying', past: 'Matchplay IDs', hist: 'Past events' };
  const breakdownText = v => ['live', 'qual', 'past', 'hist'].filter(x => v && v[x]).map(x => `${SRC_NAME[x]} ${T.fmtDur(v[x].avg)} (${v[x].count})`).join(' · ');
  function estimates(D, st, extra) {
    const arenas = (D.t.arenas || []).filter(a => !a.tournamentArena || a.tournamentArena.status !== 'inactive');
    const src = sources(D, st, extra);
    return arenas.map(a => {
      const era = T.banks.eraOf(a), v = src[lc(a.name)];
      if (v && v.combined) return { arenaId: a.arenaId, name: a.name, era, sec: v.combined.avg / 1000, src: breakdownText(v) };
      return { arenaId: a.arenaId, name: a.name, era, sec: T.banks.ERA_DEFAULT_SEC[era] || T.banks.ERA_DEFAULT_SEC.Unknown, src: 'era estimate' };
    });
  }
  // everything the tools need for times, in one call (qualifying + history are looked up here)
  async function extras(D) {
    const st = T.tstate[D.tid] || {}, use = new Set(st.histUse || []), hist = await T.store.get('hist', {});
    let qual = null; try { qual = await qualTimes(D); } catch (e) { /* optional */ }
    return { qual, hist: Object.entries(hist).filter(([id]) => use.has(id) && +id !== D.tid).map(([, h]) => h.arenas) };
  }

  function make(D, opts) {
    const ctx = context(D), st = T.tstate[D.tid] || {};
    const { avoid, usage } = T.banks.historyMaps(ctx.history);
    const est = estimates(D, st, opts.extra);
    const res = T.banks.build(est, opts.n, opts.size, { seed: opts.seed, exclude: opts.exclude, force: opts.force || st.bankForce || [], avoid, usage });
    res.overlap = T.banks.schedule(res.banks);   // a machine in two banks: played at different times in each
    // bank names: reuse Matchplay's existing banks in order, create more if needed
    const existing = (D.t.banks || []).filter(b => b.status !== 'inactive').map(b => b.name);
    res.banks.forEach((b, i) => { b.name = existing[i] || `Bank ${existing.length + (i - existing.length) + 1}`; });
    let assign = [];
    if (ctx.round && ctx.groups.length) {
      assign = T.banks.assignGroups(ctx.groups, res.banks.map(b => ({ key: b.name, names: b.games.map(g => g.name) })), ctx.plays);
      for (const a of assign) {   // how many of the bank's games are new for this group's players
        const g = ctx.groups.find(x => x.key === a.group), b = res.banks.find(x => x.name === a.bank);
        let fresh = 0, total = 0;
        for (const p of g.players) for (const x of b.games) { total++; if (!ctx.plays.get(p + '|' + lc(x.name))) fresh++; }
        a.fresh = fresh; a.total = total;
      }
    }
    return { ctx, res, assign, est };
  }

  // job steps: update the banks on the Banks tab, then assign each group on the Matches tab
  function steps(D, plan) {
    const out = [{ tid: D.tid, page: 'banks', op: 'bankArenas', args: { banks: plan.res.banks.map(b => ({ name: b.name, arenas: b.games.map(g => g.name) })) }, label: `Updating ${plan.res.banks.length} banks` }];
    if (plan.assign.length) out.push({ tid: D.tid, page: 'matches', op: 'assignBanks', args: { tid: D.tid, roundId: plan.ctx.round.roundId, pairs: plan.assign.map(a => ({ group: a.group, bank: a.bank })) }, label: `Assigning banks to ${plan.assign.length} groups` });
    return out;
  }

  // times from the qualifying (when building banks for a finals), keyed by lowercase arena name; cached 5 min
  let qualCache = { id: null, at: 0, times: null };
  async function qualTimes(D) {
    const q = D.qual; if (!q || q.tournamentId === D.tid) return null;
    if (qualCache.id === q.tournamentId && Date.now() - qualCache.at < 300e3) return qualCache.times;
    await T.logs.load(q.tournamentId, q.status === 'completed');
    const am = T.data.arenaMap(q), games = await T.api.all(`/tournaments/${q.tournamentId}/games`, 300e3), out = {};
    for (const [aid, v] of Object.entries(T.timing.arenaTimes(games))) { const k = lc((am[aid] || {}).name); if (k) out[k] = { count: v.count, avg: v.avg }; }
    qualCache = { id: q.tournamentId, at: Date.now(), times: out };
    return out;
  }
  // past Matchplay tournaments by ID (same venue): per-arena times saved on this tournament
  async function loadPast(D, ids) {
    const merged = {};
    for (const id of ids) {
      const t = await T.data.loadTournament(id, 3600e3), am = T.data.arenaMap(t);
      await T.logs.load(id, t && t.status === 'completed');
      const games = await T.api.all(`/tournaments/${id}/games`, 3600e3);
      for (const [aid, v] of Object.entries(T.timing.arenaTimes(games))) {
        const k = lc((am[aid] || {}).name); if (!k) continue;
        const m = merged[k] || (merged[k] = { count: 0, sum: 0 }); m.count += v.count; m.sum += v.avg * v.count;
      }
    }
    const pastTimes = {}; for (const [k, m] of Object.entries(merged)) pastTimes[k] = { count: m.count, avg: m.sum / m.count };
    await T.saveT(D.tid, { pastTimes, bankPast: ids.join(', ') });
    return Object.keys(pastTimes).length;
  }

  return { context, estimates, sources, breakdownText, extras, make, steps, qualTimes, loadPast };
})();
