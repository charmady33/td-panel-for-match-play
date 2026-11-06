// items 102/103: replay of Carpool Turbo Tuesday 11/03 (#281484: 18 players, 15 active games, 5 groups, 2 games, 6 rounds;
// players as numbers). The groups are the night's; the planner picks every game from round 2 on, through smart.input
// (every earlier round). Expect: no back-to-back repeat, nobody gets the same set of games twice.
global.window = global; global.TDP = {};
const fs = require('fs'), path = require('path');
eval(fs.readFileSync(path.join(__dirname, '../src/smart.js'), 'utf8'));
const [G, A] = fs.readFileSync(path.join(__dirname, 'tuesday.txt'), 'utf8').trim().split('|');
const night = G.slice(1).split(';').map(s => { const [r, set, idx, a, ps, min] = s.split(','); return { r: +r, set: +set, index: +idx, arenaId: +a, players: ps.split('.').map(Number), min: +min }; });
const arenasAll = A.slice(1).split(';').map((s, i) => { const [name, cat, st] = s.split(':'); return { arenaId: i, name, cat: +cat, st }; });
const med = {}; for (const a of arenasAll) { const l = night.filter(g => g.arenaId === a.arenaId).map(g => g.min).sort((x, y) => x - y); med[a.arenaId] = l.length ? l[l.length >> 1] * 60 : 600; }
const est = arenasAll.filter(a => a.st === 'active').map(a => ({ arenaId: a.arenaId, name: a.name, era: a.cat === 1 ? 'EM' : 'SS', sec: med[a.arenaId] }));
TDP.tstate = {};
const rounds = [0, 1, 2, 3, 4, 5].map(i => ({ roundId: 1000 + i }));
let gid = 1; const games = night.filter(g => g.r === 0).map(g => ({ gameId: gid++, roundId: 1000, set: g.set, index: g.index, arenaId: g.arenaId, playerIds: g.players }));
const D = { tid: 1, t: { players: [] }, rounds, games };
let b2b = 0, pairs = 0, reps = 0; const per = [];
for (let r = 1; r < 6; r++) {
  const rg = night.filter(g => g.r === r).map(g => ({ gameId: gid++, roundId: 1000 + r, set: g.set, index: g.index, arenaId: null, playerIds: g.players }));
  const inp = TDP.smart.input(D, rounds[r], rg, est);
  const res = TDP.smart.plan(inp, { seed: 4242 + r, tries: 300 });
  let n = 0;
  for (const g of rg) { const x = res.assign.find(y => y.gameId === g.gameId); g.arenaId = x.arenaId; }
  for (const set of [...new Set(rg.map(g => g.set))]) {
    const mine = rg.filter(g => g.set === set), ids = mine.map(g => g.arenaId).sort().join();
    for (const p of mine[0].playerIds) {
      for (const g of mine) { const before = D.games.filter(x => x.playerIds.includes(p) && x.arenaId === g.arenaId); if (before.length) { reps++; n++; } if (before.some(x => x.roundId === 1000 + r - 1)) b2b++; }
      for (let q = 0; q < r; q++) if (D.games.filter(x => x.roundId === 1000 + q && x.playerIds.includes(p)).map(x => x.arenaId).sort().join() === ids) pairs++;
    }
  }
  per.push(n); D.games.push(...rg);
}
console.log(`repeats per round 2-6: ${per.join(' ')} (total ${reps}) | back-to-back: ${b2b} | same set of games again: ${pairs}`);
const ok = b2b === 0 && pairs === 0;
console.log(ok ? 'all passed' : 'FAILED'); if (!ok) process.exit(1);
