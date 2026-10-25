// Bank builder - cleaned-up port of the Pinball Tournament Bank Builder balancing.
// Goals, in order: every bank exactly `size` games, never the same arena twice in a bank, eras spread
// (EM / SS / DMD), bank play-times as even as possible. Seeded "try another" gives a different valid layout.
var TDP = window.TDP || (window.TDP = {});

TDP.banks = (() => {
  const ERA_ORDER = ['EM', 'SS', 'DMD'];
  const ERA_DEFAULT_SEC = { EM: 9 * 60, SS: 12 * 60, DMD: 17 * 60, Unknown: 13 * 60 };
  // Matchplay arena categoryId (from OPDB): 1 EM, 2 SS, 3 DMD/modern
  const eraOf = a => ({ 1: 'EM', 2: 'SS', 3: 'DMD' }[a && a.categoryId] || 'Unknown');

  function eraPair(a, b) {
    const i = ERA_ORDER.indexOf(a), j = ERA_ORDER.indexOf(b);
    if (i < 0 || j < 0) return 0;
    const d = Math.abs(i - j);
    return d === 0 ? 750 : (ERA_ORDER.length - 1 - d) * 300;
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

  // more games than slots: first give every era up to one game per bank (so banks can mix eras), then share
  // the rest by each era's size; within an era the longest games are held out first
  function eraBalancedSubset(pool, slots, forced, numBanks, usage) {
    const byEra = {};
    pool.forEach(g => (byEra[g.era] = byEra[g.era] || []).push(g));
    const eras = Object.keys(byEra).sort((a, b) => byEra[a].length - byEra[b].length);   // rarest first
    const quota = eras.map(() => 0);
    let rem = slots;
    eras.forEach((e, i) => { const q = Math.min(byEra[e].length, numBanks, rem); quota[i] = q; rem -= q; });
    if (rem > 0) {
      const left = eras.map((e, i) => byEra[e].length - quota[i]), tot = left.reduce((a, b) => a + b, 0) || 1;
      const ideal = left.map(l => l * rem / tot), add = ideal.map(Math.floor);
      let r2 = rem - add.reduce((a, b) => a + b, 0);
      eras.map((e, i) => ({ i, f: ideal[i] - add[i] })).sort((a, b) => b.f - a.f).forEach(c => { if (r2 > 0 && add[c.i] < left[c.i]) { add[c.i]++; r2--; } });
      add.forEach((a, i) => { quota[i] += a; });
    }
    let kept = [], dropped = [];
    eras.forEach((e, i) => {
      // games used least in earlier rounds first (rotation), then the shortest
      const s = [...byEra[e]].sort((a, b) => (forced.has(b.arenaId) - forced.has(a.arenaId)) || ((usage.get(nk(a)) || 0) - (usage.get(nk(b)) || 0)) || a.sec - b.sec);
      kept.push(...s.slice(0, quota[i])); dropped.push(...s.slice(quota[i]));
    });
    // forced games that still fell out bump the longest unforced kept game
    for (const g of dropped.filter(x => forced.has(x.arenaId))) {
      const victims = kept.filter(x => !forced.has(x.arenaId)).sort((a, b) => b.sec - a.sec);
      if (!victims.length) break;
      kept = kept.filter(x => x !== victims[0]).concat(g); dropped = dropped.filter(x => x !== g).concat(victims[0]);
    }
    return { kept, dropped: dropped.sort((a, b) => b.sec - a.sec) };
  }

  // games: [{arenaId, name, era, sec}]  ->  { banks: [{games, total, era}], dropped, repeats }
  function build(games, numBanks, size, opts = {}) {
    const rng = rngFrom(opts.seed);
    const exclude = new Set(opts.exclude || []), forced = new Set(opts.force || []);
    const avoid = opts.avoid || new Map(), usage = opts.usage || new Map();   // from earlier rounds' banks
    let pool = games.filter(g => !exclude.has(g.arenaId));
    const slots = numBanks * size;
    let dropped = [], repeats = [];
    if (pool.length > slots) ({ kept: pool, dropped } = eraBalancedSubset(pool, slots, forced, numBanks, usage));
    const entries = pool.map(g => ({ ...g }));
    if (entries.length < slots) {   // too few games: shortest ones repeat (never twice in one bank)
      const cands = [...pool].sort((a, b) => a.sec - b.sec);
      let need = slots - entries.length, copies = {};
      for (let pass = 0; need > 0 && pass < numBanks; pass++)
        for (const g of cands) { if (need <= 0) break; if ((copies[g.arenaId] || 1) >= numBanks) continue; copies[g.arenaId] = (copies[g.arenaId] || 1) + 1; entries.push({ ...g, repeat: true }); need--; }
      repeats = Object.keys(copies).map(Number);
      if (entries.length < slots) throw new Error(`Not enough games: ${pool.length} games can't fill ${numBanks} banks of ${size}.`);
    }
    // greedy: longest game first, into the bank where it adds the least (time + era clash)
    const order = [...entries];
    if (rng) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.sort((a, b) => b.sec - a.sec);
    const banks = Array.from({ length: numBanks }, () => []);
    for (const e of order) {
      let best = [], bestScore = Infinity;
      banks.forEach((b, i) => {
        if (b.length >= size || b.some(g => g.arenaId === e.arenaId)) return;
        const sc = sumSec(b) + (bankEra([...b, e]) - bankEra(b)) + (bankPairs([...b, e], avoid) - bankPairs(b, avoid));
        if (sc < bestScore - 1e-6) { bestScore = sc; best = [i]; } else if (Math.abs(sc - bestScore) <= 1e-6) best.push(i);
      });
      if (!best.length) best = banks.map((b, i) => i).filter(i => banks[i].length < size);
      banks[rng && best.length > 1 ? best[Math.floor(rng() * best.length)] : best[0]].push(e);
    }
    improve(banks, avoid);
    return { banks: banks.map(gs => ({ games: gs, total: sumSec(gs), eraCost: bankEra(gs), repeatPairs: bankPairs(gs, avoid) / PAIR_PENALTY })), dropped, repeats };
  }

  // cost of a whole layout: how far each bank's total is from the mean (seconds) + era clashes
  function cost(banks, avoid) {
    const totals = banks.map(sumSec), mean = totals.reduce((a, b) => a + b, 0) / banks.length;
    return totals.reduce((s, t) => s + Math.abs(t - mean), 0) + banks.reduce((s, b) => s + bankEra(b) + bankPairs(b, avoid), 0);
  }
  // pairwise swaps between banks while they lower the cost
  function improve(banks, avoid) {
    let cur = cost(banks, avoid);
    for (let iter = 0; iter < 40; iter++) {
      let gained = false;
      for (let a = 0; a < banks.length; a++) for (let b = a + 1; b < banks.length; b++)
        for (let i = 0; i < banks[a].length; i++) for (let j = 0; j < banks[b].length; j++) {
          const x = banks[a][i], y = banks[b][j];
          if (x.arenaId === y.arenaId) continue;
          if (banks[a].some((g, k) => k !== i && g.arenaId === y.arenaId) || banks[b].some((g, k) => k !== j && g.arenaId === x.arenaId)) continue;
          banks[a][i] = y; banks[b][j] = x;
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
  function historyMaps(rounds) {
    const avoid = new Map(), usage = new Map();
    for (const banks of rounds || []) for (const names of banks) {
      const gs = names.map(n => ({ name: n }));
      gs.forEach(g => usage.set(nk(g), (usage.get(nk(g)) || 0) + 1));
      for (let a = 0; a < gs.length; a++) for (let b = a + 1; b < gs.length; b++) { const k = pairKey(gs[a], gs[b]); avoid.set(k, (avoid.get(k) || 0) + 1); }
    }
    return { avoid, usage };
  }

  // Which bank each group plays this round, so players spread over every game:
  // a game a player hasn't played yet is good, playing it again costs more each time.
  // groups: [{ key, players: [id] }], banks: [{ key, names: [arena name] }], plays: Map("pid|name" -> count)
  function assignGroups(groups, banks, plays) {
    if (!groups.length || !banks.length) return [];
    const cap = Math.ceil(groups.length / banks.length);   // more groups than banks: banks are shared
    const c = (g, b) => { let t = 0; for (const p of g.players) for (const n of b.names) { const k = plays.get(p + '|' + String(n).toLowerCase()) || 0; t += k ? 4 * k * k : -1; } return t; };
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

  return { build, estimates, eraOf, cost, historyMaps, assignGroups, pairKey, ERA_DEFAULT_SEC };
})();
