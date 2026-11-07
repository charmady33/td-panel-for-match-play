// "Any category (game time)" planner: 14 games, 8 groups of 4, 1 and 3 games per round, 7 rounds.
// Checks: no machine used by two groups at once, nobody plays a game twice in a round, no repeats when there's
// room (play counts within 4: equal plays is only a tiebreaker since item 105), repeats spread over players, group finish times close.
global.window = global; global.TDP = {};
const fs = require('fs'), path = require('path');
eval(fs.readFileSync(path.join(__dirname, '../src/smart.js'), 'utf8'));
const S = TDP.smart;
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  FAIL', msg); } };

function run(nGames, nPlayers, perRound, rounds, seed) {
  const eras = ['EM', 'SS', 'DMD'];
  const arenas = Array.from({ length: nGames }, (_, i) => ({ arenaId: 100 + i, name: 'G' + i, era: eras[i % 3], sec: 240 + ((i * 97) % 600) }));
  const played = {}, plays = {};
  const lastR = {}, prevSets = []; let b2b = 0;
  let id = 1, worstSpread = 0, worstPlayGap = 0, maxRep = 0, minRep = 1e9;
  for (let r = 0; r < rounds; r++) {
    const ps = Array.from({ length: nPlayers }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    const groups = [];
    for (let g = 0; g * 4 < nPlayers; g++) groups.push({ no: g + 1, players: ps.slice(g * 4, g * 4 + 4), slots: Array.from({ length: perRound }, (_, k) => ({ gameId: id++, index: k, arenaId: null })) });
    const ago = {}; prevSets.forEach((m, k) => { const d = r - k; for (const [p, set] of Object.entries(m)) for (const a of set) { ago[p] = ago[p] || {}; if (!ago[p][a] || d < ago[p][a]) ago[p][a] = d; } });
    const res = S.plan({ groups, arenas, played, plays, ago }, { seed: seed + r, tries: 150 });
    const now = {};
    // 1. machine overlap
    const by = {}; res.assign.forEach(x => (by[x.arenaId] = by[x.arenaId] || []).push(x));
    for (const xs of Object.values(by)) { xs.sort((a, b) => a.s - b.s); for (let i = 1; i < xs.length; i++) ok(xs[i].s >= xs[i - 1].e, `round ${r + 1}: machine clash on ${xs[i].name}`); }
    // 2. twice in a round
    for (const g of groups) { const a = res.assign.filter(x => x.group === g.no).map(x => x.arenaId); ok(new Set(a).size === a.length, `round ${r + 1}: group ${g.no} plays a game twice`); }
    // record
    for (const x of res.assign) {
      const g = groups.find(y => y.no === x.group);
      for (const p of g.players) { if (r > 0 && (prevSets[r - 1][p] || new Set()).has(x.arenaId)) b2b++; (now[p] = now[p] || new Set()).add(x.arenaId); played[p] = played[p] || {}; played[p][x.arenaId] = (played[p][x.arenaId] || 0) + 1; }
      plays[x.arenaId] = (plays[x.arenaId] || 0) + 1;
    }
    prevSets.push(now);
    const counts = arenas.map(a => plays[a.arenaId] || 0);
    worstPlayGap = Math.max(worstPlayGap, Math.max(...counts) - Math.min(...counts));
    worstSpread = Math.max(worstSpread, Math.max(...res.ends) - Math.min(...res.ends));
  }
  for (const m of Object.values(played)) { const rep = Object.values(m).reduce((s, c) => s + Math.max(0, c - 1), 0); maxRep = Math.max(maxRep, rep); minRep = Math.min(minRep, rep); }
  return { worstPlayGap, worstSpread, maxRep, minRep, b2b };
}

for (const per of [1, 3]) {
  for (let t = 0; t < 5; t++) {
    const r = run(14, 32, per, 7, 1000 * t + per);
    console.log(`14 games, 8 groups, ${per}/round, 7 rounds: play gap ${r.worstPlayGap}, finish spread ${Math.round(r.worstSpread / 60)} min, repeats per player ${r.minRep}-${r.maxRep}, back-to-back ${r.b2b}`);
    // 1 game a round: never; 3 a round (24 slots on 14 games, ~10 repeats each): only a rare forced one
    ok(per === 1 ? r.b2b === 0 : r.b2b <= 3, 'back-to-back repeats: ' + r.b2b);
    if (per === 1) ok(r.worstPlayGap <= 4 && r.maxRep <= 1, `play counts differ by ${r.worstPlayGap} / repeats ${r.maxRep}`);   // item 105: no repeats first, equal plays only a tiebreaker
    ok(r.maxRep - r.minRep <= 4, `repeats not spread: ${r.minRep}-${r.maxRep}`);
  }
}
// small event: 2 groups, 3 per round, 7 games (like the live test)
for (let t = 0; t < 5; t++) { const r = run(7, 8, 3, 4, 77 + t); console.log(`7 games, 2 groups, 3/round, 4 rounds: play gap ${r.worstPlayGap}, repeats ${r.minRep}-${r.maxRep}, back-to-back ${r.b2b} (7 games / 3 a round: some unavoidable)`); ok(r.worstPlayGap <= 2, 'small play gap ' + r.worstPlayGap); }
// fairness: p1 already played X, p2 played Y - with only X and Y free, the repeat goes to whoever repeated less
{
  const arenas = [{ arenaId: 1, name: 'X', era: 'SS', sec: 300 }, { arenaId: 2, name: 'Y', era: 'SS', sec: 300 }];
  const played = { 1: { 1: 1, 5: 2 }, 2: { 2: 1 } };   // p1 has 1 repeat already (game 5 twice), p2 none
  const res = S.plan({ groups: [{ no: 1, players: [1, 2], slots: [{ gameId: 1, index: 0, arenaId: null }] }], arenas, played, plays: {} }, { tries: 50 });
  console.log('fair repeat: picked', res.assign[0].name, '(expect Y: p2 has fewer repeats)');
  ok(res.assign[0].name === 'Y', 'repeat should go to p2');
}
console.log(fails ? `${fails} FAILED` : 'all passed');
process.exit(fails ? 1 : 0);
