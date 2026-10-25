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

  // estimates: live (this tournament) > other sources merged by arena name > era default
  function estimates(D, st, extra) {
    const arenas = (D.t.arenas || []).filter(a => !a.tournamentArena || a.tournamentArena.status !== 'inactive');
    const live = T.timing.arenaTimes(D.games);
    const merged = {};
    const add = src => { for (const [k, v] of Object.entries(src || {})) { const m = merged[k] || (merged[k] = { count: 0, sum: 0 }); m.count += v.count; m.sum += v.avg * v.count; } };
    add(st.pastTimes); add(extra && extra.qual); (extra && extra.hist || []).forEach(add);
    const past = {}; for (const [k, m] of Object.entries(merged)) past[k] = { count: m.count, avg: m.sum / m.count };
    return T.banks.estimates(arenas, live, past);
  }

  function make(D, opts) {
    const ctx = context(D), st = T.tstate[D.tid] || {};
    const { avoid, usage } = T.banks.historyMaps(ctx.history);
    const est = estimates(D, st, opts.extra);
    const res = T.banks.build(est, opts.n, opts.size, { seed: opts.seed, exclude: opts.exclude, avoid, usage });
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

  return { context, estimates, make, steps };
})();
