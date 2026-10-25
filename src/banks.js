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
  const sumSec = gs => gs.reduce((s, g) => s + g.sec, 0);

  function rngFrom(seed) {
    if (seed == null) return null;
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // more games than slots: first give every era up to one game per bank (so banks can mix eras), then share
  // the rest by each era's size; within an era the longest games are held out first
  function eraBalancedSubset(pool, slots, forced, numBanks) {
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
      const s = [...byEra[e]].sort((a, b) => (forced.has(b.arenaId) - forced.has(a.arenaId)) || a.sec - b.sec);
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
    let pool = games.filter(g => !exclude.has(g.arenaId));
    const slots = numBanks * size;
    let dropped = [], repeats = [];
    if (pool.length > slots) ({ kept: pool, dropped } = eraBalancedSubset(pool, slots, forced, numBanks));
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
        const sc = sumSec(b) + (bankEra([...b, e]) - bankEra(b));
        if (sc < bestScore - 1e-6) { bestScore = sc; best = [i]; } else if (Math.abs(sc - bestScore) <= 1e-6) best.push(i);
      });
      if (!best.length) best = banks.map((b, i) => i).filter(i => banks[i].length < size);
      banks[rng && best.length > 1 ? best[Math.floor(rng() * best.length)] : best[0]].push(e);
    }
    improve(banks);
    return { banks: banks.map(gs => ({ games: gs, total: sumSec(gs), eraCost: bankEra(gs) })), dropped, repeats };
  }

  // cost of a whole layout: how far each bank's total is from the mean (seconds) + era clashes
  function cost(banks) {
    const totals = banks.map(sumSec), mean = totals.reduce((a, b) => a + b, 0) / banks.length;
    return totals.reduce((s, t) => s + Math.abs(t - mean), 0) + banks.reduce((s, b) => s + bankEra(b), 0);
  }
  // pairwise swaps between banks while they lower the cost
  function improve(banks) {
    let cur = cost(banks);
    for (let iter = 0; iter < 40; iter++) {
      let gained = false;
      for (let a = 0; a < banks.length; a++) for (let b = a + 1; b < banks.length; b++)
        for (let i = 0; i < banks[a].length; i++) for (let j = 0; j < banks[b].length; j++) {
          const x = banks[a][i], y = banks[b][j];
          if (x.arenaId === y.arenaId) continue;
          if (banks[a].some((g, k) => k !== i && g.arenaId === y.arenaId) || banks[b].some((g, k) => k !== j && g.arenaId === x.arenaId)) continue;
          banks[a][i] = y; banks[b][j] = x;
          const c = cost(banks);
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

  return { build, estimates, eraOf, cost, ERA_DEFAULT_SEC };
})();
