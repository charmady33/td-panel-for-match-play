// Bank builder - cleaned-up port of the Pinball Tournament Bank Builder balancing.
// Goals, in order: every bank exactly `size` games, never the same arena twice in a bank, eras spread
// (EM / SS / DMD / LCD), bank play-times as even as possible. Seeded "try another" gives a different valid layout.
var TDP = window.TDP || (window.TDP = {});

TDP.banks = (() => {
  const T = TDP;
  const ERA_ORDER = ['EM', 'SS', 'DMD', 'LCD'];
  const ERA_DEFAULT_SEC = { EM: 9 * 60, SS: 12 * 60, DMD: 17 * 60, LCD: 18 * 60, Unknown: 13 * 60 };
  // Matchplay's category (1 EM, 2 SS, 3 DMD), with LCD from OPDB and the TD's overrides (cats.js)
  const eraOf = a => T.cats ? T.cats.of(a) : ({ 1: 'EM', 2: 'SS', 3: 'DMD' }[a && a.categoryId] || 'Unknown');

  function eraPair(a, b) {
    const i = ERA_ORDER.indexOf(a), j = ERA_ORDER.indexOf(b);
    if (i < 0 || j < 0) return 0;
    const d = Math.abs(i - j);
    return d === 0 ? 750 : (ERA_ORDER.length - 1 - d) * 200;
  }
  const bankEra = gs => { let t = 0; for (let a = 0; a < gs.length; a++) for (let b = a + 1; b < gs.length; b++) t += eraPair(gs[a].era, gs[b].era); return t; };
  // "banks feel unique": two games that already shared a bank in an earlier round cost this much to pair again
  // (bigger than any time/era gain, so a repeat only happens when nothing else is possible)
  const PAIR_PENALTY = 2000;
  const nk = g => String(g.name || '').toLowerCase();
  const pairKey = (a, b) => { const x = nk(a), y = nk(b); return x < y ? x + '|' + y : y + '|' + x; };
  function bankPairs(gs, avoid) {
    if (!avoid || !avoid.size) return 0;
    let t = 0; for (let a = 0; a < gs.length; a++) for (let b = a + 1; b < gs.length; b++) t += (avoid.get(pairKey(gs[a], gs[b])) || 0) * PAIR_PENALTY;
    return t;
  }
  const sumSec = gs => gs.reduce((s, g) => s + g.sec, 0);

  function rngFrom(seed) {
    if (seed == null) return null;
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // more games than slots: each era gets spots strictly by its share of the games (item 71) - rounding goes to the
  // biggest leftover fractions; within an era the longest games are left out. A game the TD forces in (Settings
  // "always", or Include in the preview) bumps the longest kept game of its own era (else the longest overall).
  function eraBalancedSubset(pool, slots, forced, numBanks, usage) {
    const byEra = {};
    pool.forEach(g => (byEra[g.era] = byEra[g.era] || []).push(g));
    const eras = Object.keys(byEra).sort((a, b) => byEra[b].length - byEra[a].length || (a < b ? -1 : 1));
    const ideal = eras.map(e => byEra[e].length * slots / pool.length), quota = ideal.map(Math.floor);
    let rem = slots - quota.reduce((a, b) => a + b, 0);
    eras.map((e, i) => ({ i, f: ideal[i] - quota[i] })).sort((a, b) => b.f - a.f || byEra[eras[b.i]].length - byEra[eras[a.i]].length)
      .forEach(c => { if (rem > 0 && quota[c.i] < byEra[eras[c.i]].length) { quota[c.i]++; rem--; } });
    let kept = [], dropped = [];
    const plan = {};
    eras.forEach((e, i) => {
      // (add mode only: games already in the existing banks last - `usage`), then the shortest
      const s = [...byEra[e]].sort((a, b) => ((usage.get(nk(a)) || 0) - (usage.get(nk(b)) || 0)) || a.sec - b.sec);
      kept.push(...s.slice(0, quota[i])); dropped.push(...s.slice(quota[i]));
      plan[e] = { games: byEra[e].length, spots: quota[i] };
    });
    const bumped = [];
    for (const g of dropped.filter(x => forced.has(x.arenaId))) {
      const free = kept.filter(x => !forced.has(x.arenaId)).sort((a, b) => b.sec - a.sec);
      const v = free.find(x => x.era === g.era) || free[0];
      if (!v) break;
      kept = kept.filter(x => x !== v).concat(g); dropped = dropped.filter(x => x !== g).concat(v);
      if (v.era !== g.era) { plan[g.era].spots++; plan[v.era].spots--; }
      bumped.push({ in: g.name, out: v.name, sameEra: v.era === g.era });
    }
    return { kept, dropped: dropped.sort((a, b) => b.sec - a.sec), plan, bumped };
  }

  // how many of each era every bank gets: each era spread as evenly as possible (counts differ by at most one
  // between banks), every bank exactly `size` games
  function eraTargets(entries, numBanks, size, rng) {
    const cnt = {}; entries.forEach(g => { cnt[g.era] = (cnt[g.era] || 0) + 1; });
    const eras = Object.keys(cnt).sort((a, b) => (cnt[b] % numBanks) - (cnt[a] % numBanks) || (a < b ? -1 : 1));
    const T0 = Array.from({ length: numBanks }, () => ({}));
    eras.forEach(e => T0.forEach(t => { t[e] = Math.floor(cnt[e] / numBanks); }));
    const need = T0.map(t => size - Object.values(t).reduce((a, b) => a + b, 0));
    for (const e of eras) {
      let extra = cnt[e] % numBanks;
      const order = [...Array(numBanks).keys()].sort((a, b) => need[b] - need[a] || (rng ? rng() - 0.5 : a - b));
      for (const i of order) { if (!extra) break; if (need[i] > 0) { T0[i][e]++; need[i]--; extra--; } }
      if (extra) return null;   // can't be done exactly (shouldn't happen) - no era rule then
    }
    return need.every(x => x === 0) ? T0 : null;
  }
  const eraCount = (b, e) => b.reduce((t, g) => t + (g.era === e ? 1 : 0), 0);

  // games: [{arenaId, name, era, sec}]  ->  { banks: [{games, total, era}], dropped, repeats }
  function build(games, numBanks, size, opts = {}) {
    const rng = rngFrom(opts.seed);
    const exclude = new Set(opts.exclude || []), forced = new Set(opts.force || []);
    const avoid = opts.avoid || new Map(), usage = opts.usage || new Map();   // from earlier rounds' banks
    let pool = games.filter(g => !exclude.has(g.arenaId));
    const slots = numBanks * size;
    let dropped = [], repeats = [], plan = null, bumped = [];
    if (pool.length > slots) ({ kept: pool, dropped, plan, bumped } = eraBalancedSubset(pool, slots, forced, numBanks, usage));
    const entries = pool.map(g => ({ ...g }));
    if (entries.length < slots) {   // too few games: shortest ones repeat (never twice in one bank)
      const cands = [...pool].sort((a, b) => a.sec - b.sec);
      let need = slots - entries.length, copies = {};
      for (let pass = 0; need > 0 && pass < numBanks; pass++)
        for (const g of cands) { if (need <= 0) break; if ((copies[g.arenaId] || 1) >= numBanks) continue; copies[g.arenaId] = (copies[g.arenaId] || 1) + 1; entries.push({ ...g, repeat: true }); need--; }
      repeats = Object.keys(copies).map(Number);
      if (entries.length < slots) throw new Error(`Not enough games: ${pool.length} games can't fill ${numBanks} banks of ${size}.`);
    }
    // each bank's era mix (item 71), then greedy: longest game first, into the bank where it adds the least time
    const targets = eraTargets(entries, numBanks, size, rng);
    const order = [...entries];
    if (rng) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.sort((a, b) => b.sec - a.sec);
    const banks = Array.from({ length: numBanks }, () => []);
    for (const e of order) {
      let best = [], bestScore = Infinity;
      banks.forEach((b, i) => {
        if (b.length >= size || b.some(g => g.arenaId === e.arenaId)) return;
        if (targets && eraCount(b, e.era) >= targets[i][e.era]) return;
        const sc = sumSec(b) + (bankEra([...b, e]) - bankEra(b)) + (bankPairs([...b, e], avoid) - bankPairs(b, avoid));
        if (sc < bestScore - 1e-6) { bestScore = sc; best = [i]; } else if (Math.abs(sc - bestScore) <= 1e-6) best.push(i);
      });
      if (!best.length) best = banks.map((b, i) => i).filter(i => banks[i].length < size && !banks[i].some(g => g.arenaId === e.arenaId));
      if (!best.length) best = banks.map((b, i) => i).filter(i => banks[i].length < size);
      banks[rng && best.length > 1 ? best[Math.floor(rng() * best.length)] : best[0]].push(e);
    }
    improve(banks, avoid, entries, numBanks);
    fixDups(banks);   // a machine twice in a bank is worse than an uneven era spread
    if (!plan) { plan = {}; entries.forEach(g => { const p = plan[g.era] = plan[g.era] || { games: 0, spots: 0 }; p.spots++; if (!g.repeat) p.games++; }); }
    return { banks: banks.map(gs => ({ games: gs, total: sumSec(gs), eraCost: bankEra(gs), repeatPairs: bankPairs(gs, avoid) / PAIR_PENALTY })), dropped, repeats, plan, bumped };
  }

  // cost of a whole layout: how far each bank's total is from the mean (seconds) + era clashes
  function cost(banks, avoid) {
    const totals = banks.map(sumSec), mean = totals.reduce((a, b) => a + b, 0) / banks.length;
    return totals.reduce((s, t) => s + Math.abs(t - mean), 0) + banks.reduce((s, b) => s + bankEra(b) + bankPairs(b, avoid), 0);
  }
  // a bank holding the same machine twice (only possible with repeats): swap one copy with a game from another bank
  function fixDups(banks) {
    const dupAt = b => b.findIndex((g, k) => b.some((x, j) => j < k && x.arenaId === g.arenaId));
    for (let pass = 0; pass < 50; pass++) {
      const a = banks.findIndex(b => dupAt(b) >= 0); if (a < 0) return;
      const i = dupAt(banks[a]), x = banks[a][i]; let done = false;
      for (let b = 0; b < banks.length && !done; b++) {
        if (b === a) continue;
        for (let j = 0; j < banks[b].length && !done; j++) {
          const y = banks[b][j];
          if (banks[a].some((g, k) => k !== i && g.arenaId === y.arenaId) || banks[b].some((g, k) => k !== j && g.arenaId === x.arenaId)) continue;
          banks[a][i] = y; banks[b][j] = x; done = true;
        }
      }
      if (!done) return;
    }
  }
  // pairwise swaps between banks while they lower the cost; a swap may not break the era spread (item 71: every
  // era's count in a bank stays within one of the others)
  function improve(banks, avoid, entries, numBanks) {
    let cur = cost(banks, avoid);
    const lim = {}; if (entries) { const c = {}; entries.forEach(g => { c[g.era] = (c[g.era] || 0) + 1; }); for (const [e, n] of Object.entries(c)) lim[e] = [Math.floor(n / numBanks), Math.ceil(n / numBanks)]; }
    const okEra = b => Object.entries(lim).every(([e, [lo, hi]]) => { const k = eraCount(b, e); return k >= lo && k <= hi; });
    for (let iter = 0; iter < 40; iter++) {
      let gained = false;
      for (let a = 0; a < banks.length; a++) for (let b = a + 1; b < banks.length; b++)
        for (let i = 0; i < banks[a].length; i++) for (let j = 0; j < banks[b].length; j++) {
          const x = banks[a][i], y = banks[b][j];
          if (x.arenaId === y.arenaId) continue;
          if (banks[a].some((g, k) => k !== i && g.arenaId === y.arenaId) || banks[b].some((g, k) => k !== j && g.arenaId === x.arenaId)) continue;
          banks[a][i] = y; banks[b][j] = x;
          if (x.era !== y.era && entries && (!okEra(banks[a]) || !okEra(banks[b]))) { banks[a][i] = x; banks[b][j] = y; continue; }
          const c = cost(banks, avoid);
          if (c < cur - 1) { cur = c; gained = true; } else { banks[a][i] = x; banks[b][j] = y; }
        }
      if (!gained) break;
    }
  }

  // time estimate per arena: live average from 3+ games, else past events, else era default
  function estimates(arenas, live, past) {
    return arenas.map(a => {
      const era = eraOf(a), L = live[a.arenaId], P = past[(a.name || '').toLowerCase()];
      let sec, src;
      if (L && L.count >= 3) { sec = L.avg / 1000; src = `live (${L.count})`; }
      else if (P && P.count) { sec = P.avg / 1000; src = `past (${P.count})`; }
      else if (L && L.count) { sec = L.avg / 1000; src = `live (${L.count})`; }
      else { sec = ERA_DEFAULT_SEC[era] || ERA_DEFAULT_SEC.Unknown; src = 'era estimate'; }
      return { arenaId: a.arenaId, name: a.name, era, sec, src };
    });
  }

  // pairs/usage from earlier rounds: rounds = [[ [name, name, ...], ... ], ...]  (banks per round)
  // Banks are built once now (no per-round banks): which games shared a bank before doesn't matter (Clark), so
  // nothing is remembered - empty maps keep the builder's options in place
  function historyMaps() { return { avoid: new Map(), usage: new Map() }; }


  // Which bank each group plays this round, so players spread over every game:
  // a game a player hasn't played yet is good, playing it again costs more each time.
  // groups: [{ key, players: [id] }], banks: [{ key, names: [arena name] }], plays: Map("pid|name" -> count)
  function assignGroups(groups, banks, plays) {
    if (!groups.length || !banks.length) return [];
    const cap = Math.ceil(groups.length / banks.length);   // more groups than banks: banks are shared
    const c = (g, b) => { let t = 0; for (const p of g.players) { let all = b.names.length > 1; for (const n of b.names) { const k = plays.get(p + '|' + String(n).toLowerCase()) || 0; t += k ? 4 * k * k : -1; if (!k) all = false; } if (all) t += 1e6; } return t; };   // (every game of the bank played before: avoided - item 103)
    const M = groups.map(g => banks.map(b => c(g, b)));
    // small rounds (finals, up to 8 groups): try every arrangement and keep the best
    if (groups.length <= 8 && banks.length >= groups.length && banks.length <= 10) {
      let best = Infinity, bestPick = null; const used = new Array(banks.length).fill(false), cur = [];
      const minRow = M.map(r => Math.min(...r));
      const rest = i => { let t = 0; for (let k = i; k < groups.length; k++) t += minRow[k]; return t; };
      (function dfs(i, sum) {
        if (sum + rest(i) >= best) return;
        if (i === groups.length) { best = sum; bestPick = [...cur]; return; }
        for (let j = 0; j < banks.length; j++) if (!used[j]) { used[j] = true; cur.push(j); dfs(i + 1, sum + M[i][j]); cur.pop(); used[j] = false; }
      })(0, 0);
      return groups.map((g, i) => ({ group: g.key, bank: banks[bestPick[i]].key, cost: M[i][bestPick[i]] }));
    }
    // greedy: groups with the most to lose pick first
    const load = banks.map(() => 0), pick = new Array(groups.length).fill(-1);
    const order = groups.map((g, i) => i).sort((a, b) => (Math.max(...M[b]) - Math.min(...M[b])) - (Math.max(...M[a]) - Math.min(...M[a])));
    for (const i of order) { let best = -1; M[i].forEach((v, j) => { if (load[j] < cap && (best < 0 || v < M[i][best])) best = j; }); pick[i] = best; load[best]++; }
    // improve: swap two groups' banks, or move a group to a bank with room
    for (let iter = 0; iter < 50; iter++) {
      let gained = false;
      for (let a = 0; a < groups.length; a++) {
        for (let b = a + 1; b < groups.length; b++) {
          const d = M[a][pick[b]] + M[b][pick[a]] - M[a][pick[a]] - M[b][pick[b]];
          if (d < 0) { [pick[a], pick[b]] = [pick[b], pick[a]]; gained = true; }
        }
        for (let j = 0; j < banks.length; j++) if (load[j] < cap && M[a][j] < M[a][pick[a]]) { load[pick[a]]--; pick[a] = j; load[j]++; gained = true; }
      }
      if (!gained) break;
    }
    return groups.map((g, i) => ({ group: g.key, bank: banks[pick[i]].key, cost: M[i][pick[i]] }));
  }

  // ---------- ranked group -> bank options (Assign banks button) ----------
  // cost(groupIndex, bankIndex) is any number (lower = better). Each bank takes at most `cap` groups.
  // Up to 8 groups: exact search keeping the `keep` best distinct options; bigger rounds: greedy + swaps from
  // several random starts. Returns [{ pick: [bankIndex per group], cost }] best first.
  function rankAssignments(nGroups, nBanks, cost, keep = 5) {
    if (!nGroups || !nBanks) return [];
    const cap = Math.ceil(nGroups / nBanks), M = [...Array(nGroups)].map((_, i) => [...Array(nBanks)].map((_, j) => cost(i, j)));
    const out = [], sig = p => p.join(',');
    const push = (pick, c) => { if (out.some(o => sig(o.pick) === sig(pick))) return; out.push({ pick: [...pick], cost: c }); out.sort((a, b) => a.cost - b.cost); if (out.length > keep) out.pop(); };
    if (nGroups <= 8 && nBanks <= 10) {
      const load = new Array(nBanks).fill(0), cur = [], minRow = M.map(r => Math.min(...r));
      const rest = i => { let t = 0; for (let k = i; k < nGroups; k++) t += minRow[k]; return t; };
      (function dfs(i, sum) {
        if (out.length >= keep && sum + rest(i) >= out[out.length - 1].cost) return;
        if (i === nGroups) return push(cur, sum);
        for (let j = 0; j < nBanks; j++) if (load[j] < cap) { load[j]++; cur.push(j); dfs(i + 1, sum + M[i][j]); cur.pop(); load[j]--; }
      })(0, 0);
      return out;
    }
    for (let start = 0; start < 12; start++) {
      const load = new Array(nBanks).fill(0), pick = new Array(nGroups).fill(-1);
      const order = [...Array(nGroups).keys()].sort(() => start ? Math.random() - 0.5 : 0);
      for (const i of order) { let b = -1; M[i].forEach((v, j) => { if (load[j] < cap && (b < 0 || v < M[i][b])) b = j; }); pick[i] = b; load[b]++; }
      for (let iter = 0; iter < 60; iter++) {
        let gained = false;
        for (let a = 0; a < nGroups; a++) {
          for (let b = a + 1; b < nGroups; b++) { const d = M[a][pick[b]] + M[b][pick[a]] - M[a][pick[a]] - M[b][pick[b]]; if (d < 0) { [pick[a], pick[b]] = [pick[b], pick[a]]; gained = true; } }
          for (let j = 0; j < nBanks; j++) if (load[j] < cap && M[a][j] < M[a][pick[a]]) { load[pick[a]]--; pick[a] = j; load[j]++; gained = true; }
        }
        if (!gained) break;
      }
      push(pick, pick.reduce((t, j, i) => t + M[i][j], 0));
    }
    return out;
  }

  // ---------- play order ----------
  // Groups play a bank's games in order, so each game has an expected window [start, end) in its bank.
  // When the same machine is in more than one bank, order the games so those windows don't overlap
  // (two groups waiting on one machine). `fixed` banks (already in Matchplay) keep their order.
  // Groups move through their games at about the same pace, so a shared machine must never be the same game
  // number in two banks (hard rule); after that, its expected start times are kept as far apart as possible.
  const BUFFER = 60;   // seconds of slack between one group finishing a machine and the next starting
  const SAME_SLOT = 1e6;
  function windows(games) { let t = 0; return games.map((g, pos) => { const w = { key: nk(g), pos, s: t, e: t + g.sec }; t += g.sec; return w; }); }
  function clash(a, b) {   // cost of two banks sharing machines: same game number (hard) + time overlap
    let t = 0;
    for (const x of a) for (const y of b) if (x.key === y.key) t += (x.pos === y.pos ? SAME_SLOT : 0) + Math.max(0, Math.min(x.e, y.e) + BUFFER - Math.max(x.s, y.s));
    return t;
  }
  function perms(arr) {
    if (arr.length > 6) return null;
    const out = []; (function go(pre, rest) { if (!rest.length) return out.push(pre); rest.forEach((x, i) => go([...pre, x], [...rest.slice(0, i), ...rest.slice(i + 1)])); })([], arr);
    return out;
  }
  // banks: [{games:[{name,sec,...}]}] (reordered in place); fixed: [[{name,sec}]]  -> total overlap seconds left
  function schedule(banks, fixed = []) {
    const fixedW = fixed.map(windows);
    const shared = new Set();
    const count = {}; [...fixed, ...banks.map(b => b.games)].forEach(gs => new Set(gs.map(nk)).forEach(k => { count[k] = (count[k] || 0) + 1; }));
    Object.entries(count).forEach(([k, c]) => { if (c > 1) shared.add(k); });
    if (!shared.size) return 0;
    const others = i => [...fixedW, ...banks.filter((_, j) => j !== i).map(b => windows(b.games))];
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      banks.forEach((b, i) => {
        if (!b.games.some(g => shared.has(nk(g)))) return;
        const ow = others(i), cost = gs => { const w = windows(gs); return ow.reduce((t, o) => t + clash(w, o), 0); };
        let best = b.games, bestC = cost(b.games);
        const cands = perms(b.games) || [...Array(400)].map(() => [...b.games].sort(() => Math.random() - 0.5));
        for (const p of cands) { const c = cost(p); if (c < bestC - 0.5) { best = p; bestC = c; } }
        if (best !== b.games) { b.games = best; changed = true; }
      });
      if (!changed) break;
    }
    let left = 0; const all = [...fixedW, ...banks.map(b => windows(b.games))];
    for (let a = 0; a < all.length; a++) for (let c = a + 1; c < all.length; c++) left += clash(all[a], all[c]);
    return Math.max(0, left - 0);
  }
  // for the preview: each game's expected start and where else that machine is played
  function timeline(banks, fixed = []) {
    const all = [...fixed.map(f => ({ name: f.name, games: f.games, fixed: true })), ...banks];
    const w = all.map(b => windows(b.games));
    return banks.map((b, bi) => {
      const i = fixed.length + bi;
      return b.games.map((g, gi) => {
        const me = w[i][gi], also = [];
        all.forEach((o, j) => { if (j === i) return; w[j].forEach(x => { if (x.key === me.key) also.push({ bank: o.name, pos: x.pos, s: x.s, e: x.e, sameSlot: x.pos === me.pos, overlap: Math.max(0, Math.min(x.e, me.e) - Math.max(x.s, me.s)) }); }); });
        return { s: me.s, e: me.e, also };
      });
    });
  }

  return { build, estimates, eraOf, cost, eraTargets, historyMaps, assignGroups, rankAssignments, pairKey, schedule, timeline, ERA_ORDER, ERA_DEFAULT_SEC };
})();
