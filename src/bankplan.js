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
    const put = (key, name, v) => { if (!name || !v || !v.count) return; const k = lc(name); (out[k] = out[k] || {})[key] = { count: v.count, avg: v.avg, dropped: v.dropped || 0 }; };
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
  const breakdownText = v => ['live', 'qual', 'past', 'hist'].filter(x => v && v[x]).map(x => `${SRC_NAME[x]} ${T.fmtDur(v[x].avg)} (${v[x].count}${v[x].dropped ? `, ${v[x].dropped} extreme left out` : ''})`).join(' · ') + ' - middle values, combined by game count';
  function estimates(D, st, extra, all) {   // all: down (disabled) machines too
    const arenas = (D.t.arenas || []).filter(a => all || !a.tournamentArena || a.tournamentArena.status !== 'inactive');
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

  // ---------- Assign banks (Matches tab): the banks already in Matchplay, to this round's groups ----------
  // A game a player hasn't played: good. A game they have played: bad, worse each time.
  // A bank sharing 2+ games with a bank (group's games in a round) the player already had: very bad.
  const NEW_GAME = -10, REPEAT = 40, SIMILAR = 3000, SAME_SET = 1e6;   // SAME_SET: item 103, the exact games a player had before
  // item 88: banks being played right now in the other finals (same games = the same bank): sorted game names -> label.
  // Refreshed in the background (at most every 10 s); assignOptions and the Assign Bank/Order window leave them out.
  let busyAt = 0, busyTid = null, busyMap = new Map(), busyRun = null;
  const bankSig = names => names.map(n => String(n).toLowerCase()).sort().join('|');
  async function siblingBusy(D) {
    if (!D || !D.qual || D.qual.tournamentId === D.tid) return busyMap = new Map();
    if (busyTid === D.tid && Date.now() - busyAt < 10e3) return busyMap;
    if (busyRun) return busyRun;
    busyRun = (async () => {
      const out = new Map();
      for (const f of (D.finals || []).filter(x => x.tid !== D.tid && x.t)) {
        try {
          const rs = T.data.arr(T.data.unwrap(await T.api.get(`/tournaments/${f.tid}/rounds`, 8e3)));
          const r = rs.filter(x => String(x.status) !== 'completed').sort((a, b) => (b.index ?? b.roundId) - (a.index ?? a.roundId))[0]; if (!r) continue;
          const gs = await T.api.all(`/tournaments/${f.tid}/games?round=${r.roundId}`, 8e3), am = T.data.arenaMap(f.t);
          for (const b of f.t.banks || []) {
            const mine = gs.filter(g => g.bankId === b.bankId && !g.bye);
            if (!mine.length || mine.every(g => T.timing.isDone(g))) continue;
            out.set(bankSig((b.arenaIds || []).map(id => (am[id] || {}).name).filter(Boolean)), `${f.name || f.t.name} Group ${mine[0].set + 1}`);
          }
        } catch (e) { /* that finals isn't readable now */ }
      }
      busyMap = out; busyAt = Date.now(); busyTid = D.tid; busyRun = null; return out;
    })();
    return busyRun;
  }
  const busyLabel = (D, b) => { const am = T.data.arenaMap(D.t); return busyMap.get(bankSig((b.arenaIds || []).map(id => (am[id] || {}).name).filter(Boolean))) || null; };
  function assignOptions(D) {
    const ctx0 = context(D), am = T.data.arenaMap(D.t), pm = T.data.playerMap(D.t);
    // only groups still waiting (no bank, no arena); banks already used this round (by hand or not) are left out
    const rg = ctx0.round ? D.games.filter(g => g.roundId === ctx0.round.roundId && !g.bye && g.set !== 9999) : [];
    const waiting = new Set(rg.filter(g => g.bankId == null && g.arenaId == null).map(g => g.set + 1));
    const done = new Set(rg.filter(g => g.bankId != null || g.arenaId != null).map(g => g.set + 1));
    const usedBanks = new Set(rg.map(g => g.bankId).filter(b => b != null));
    const ctx = { ...ctx0, groups: ctx0.groups.filter(g => waiting.has(g.key) && !done.has(g.key)) };
    const all = (D.t.banks || []).filter(b => b.status !== 'inactive');
    const banks = all.filter(b => !usedBanks.has(b.bankId) && !busyLabel(D, b)).map(b => ({ name: b.name, games: (b.arenaIds || []).map(id => (am[id] || {}).name).filter(Boolean) }));   // (not one the other finals is playing right now)
    if (!ctx.round || !ctx.groups.length || !banks.length) return { ctx, banks, list: [], usedBanks: usedBanks.size, allBanks: all.length };
    // each player's earlier "banks": the games their group played in each earlier round
    const past = {};   // playerId -> [{ round, games:Set }]
    const rname = {}; (D.rounds || []).forEach((r, i) => { rname[r.roundId] = r.name || `Round ${i + 1}`; });
    const sets = {};
    for (const g of D.games) {
      if (g.bye || g.arenaId == null || g.set === 9999 || g.roundId === ctx.round.roundId) continue;
      const k = g.roundId + ':' + g.set, x = sets[k] || (sets[k] = { round: rname[g.roundId] || 'an earlier round', games: new Set(), players: new Set() });
      x.games.add(lc((am[g.arenaId] || {}).name)); (g.playerIds || []).forEach(p => x.players.add(p));
    }
    for (const x of Object.values(sets)) for (const p of x.players) (past[p] = past[p] || []).push(x);
    const detail = (grp, bank) => {
      let fresh = 0, total = 0; const repeats = [], similar = [];
      for (const p of grp.players) {
        for (const n of bank.games) { total++; const k = ctx.plays.get(p + '|' + lc(n)) || 0; if (!k) fresh++; else repeats.push({ player: (pm[p] || {}).name || '#' + p, game: n, times: k }); }
        for (const x of past[p] || []) { const ov = bank.games.filter(n => x.games.has(lc(n))).length; if (ov >= 2) similar.push({ player: (pm[p] || {}).name || '#' + p, round: x.round, same: ov }); }
      }
      return { fresh, total, repeats, similar };
    };
    const cost = (gi, bi) => {
      const g = ctx.groups[gi], b = banks[bi]; let t = 0;
      for (const p of g.players) {
        for (const n of b.games) { const k = ctx.plays.get(p + '|' + lc(n)) || 0; t += k ? REPEAT * k * k : NEW_GAME; }
        for (const x of past[p] || []) { const ov = b.games.filter(n => x.games.has(lc(n))).length; if (ov >= 2) t += SIMILAR * (ov - 1); if (ov >= 2 && ov === b.games.length && ov === x.games.size) t += SAME_SET; }
      }
      return t;
    };
    const list = T.banks.rankAssignments(ctx.groups.length, banks.length, cost, 5).map(o => ({
      cost: o.cost,
      pairs: o.pick.map((bi, gi) => ({ group: ctx.groups[gi].key, bank: banks[bi].name, ...detail(ctx.groups[gi], banks[bi]) })),
    }));
    return { ctx, banks, list, shared: ctx.groups.length > banks.length, usedBanks: usedBanks.size, allBanks: all.length };
  }
  // the current round's groups that already have a bank: "Group 2 -> Bank 4 · 11 of 12 new"
  function roundSummary(D) {
    const r = T.data.currentRound() || T.data.latestRound(); if (!r) return [];
    const am = T.data.arenaMap(D.t), banks = Object.fromEntries((D.t.banks || []).map(b => [b.bankId, b.name]));
    const before = new Map();
    for (const g of D.games) { if (g.bye || g.arenaId == null || g.roundId === r.roundId) continue; const n = lc((am[g.arenaId] || {}).name); for (const p of g.playerIds || []) before.set(p + '|' + n, (before.get(p + '|' + n) || 0) + 1); }
    const sets = {};
    for (const g of D.games.filter(x => x.roundId === r.roundId && !x.bye && x.set !== 9999)) { const x = sets[g.set] || (sets[g.set] = { group: g.set + 1, bank: null, games: [], players: new Set() }); if (g.bankId != null) x.bank = banks[g.bankId] || 'bank'; if (g.arenaId != null) x.games.push(lc((am[g.arenaId] || {}).name)); (g.playerIds || []).forEach(p => x.players.add(p)); }
    return Object.values(sets).filter(x => x.bank).map(x => { let fresh = 0, total = 0; for (const p of x.players) for (const n of x.games) { total++; if (!before.get(p + '|' + n)) fresh++; } return { group: x.group, bank: x.bank, fresh, total }; });
  }
  const assignSteps = (D, ctx, opt) => [{ tid: D.tid, page: 'matches', op: 'assignBanks', args: { tid: D.tid, roundId: ctx.round.roundId, pairs: opt.pairs.map(p => ({ group: p.group, bank: p.bank })) }, label: `Assigning banks to ${opt.pairs.length} group${opt.pairs.length === 1 ? '' : 's'}` }];

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
    for (const [aid, v] of Object.entries(T.timing.arenaTimes(games))) { const k = lc((am[aid] || {}).name); if (k) out[k] = { count: v.count, avg: v.avg, dropped: v.dropped || 0 }; }
    qualCache = { id: q.tournamentId, at: Date.now(), times: out };
    return out;
  }
  // past Matchplay tournaments by ID (same venue): per-arena times saved on this tournament
  async function loadPast(D, ids) {
    const merged = {}, info = [];
    for (const id of ids) {
      const t = await T.data.loadTournament(id, 3600e3), am = T.data.arenaMap(t);
      await T.logs.load(id, t && t.status === 'completed');
      const games = await T.api.all(`/tournaments/${id}/games`, 3600e3);
      let n = 0;
      for (const [aid, v] of Object.entries(T.timing.arenaTimes(games))) {
        const k = lc((am[aid] || {}).name); if (!k) continue;
        n += v.count;
        const m = merged[k] || (merged[k] = { count: 0, sum: 0, dropped: 0 }); m.count += v.count; m.sum += v.avg * v.count; m.dropped += v.dropped || 0;
      }
      info.push({ id, name: (t && t.name) || ('#' + id), games: n });
    }
    const pastTimes = {}; for (const [k, m] of Object.entries(merged)) pastTimes[k] = { count: m.count, avg: m.sum / m.count, dropped: m.dropped };
    await T.saveT(D.tid, { pastTimes, bankPast: ids.join(', '), pastInfo: info, past4: true });   // (past4: 4-player times, item 98)
    return Object.keys(pastTimes).length;
  }

  return { siblingBusy, busyLabel, assignOptions, assignSteps, roundSummary, context, estimates, sources, breakdownText, extras, make, steps, qualTimes, loadPast };
})();
