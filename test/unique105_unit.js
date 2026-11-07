// item 105: replay of test #282622 (clone of Turbo Tuesday 11/03: 18 players, 15 games, 2 games a round, 6 rounds)
// with its real groups and the combined game times it used. Before 105 it got 26 repeats and Clark played Hot Shot 3 times.
// Checks: no 3rd play of a game, no back-to-back repeat, fewer repeats, Max est. not longer.
global.window = global; global.TDP = {};
const fs = require('fs'), path = require('path');
eval(fs.readFileSync(path.join(__dirname, '../src/smart.js'), 'utf8'));
const S = TDP.smart;
const ROUNDS = [[[607572, 607646, 613498, 607589], [613531, 607553, 607592, 607575], [607555, 613519, 607559, 613521], [613520, 613509, 613516], [308798, 613543, 607560]], [[607560, 613498, 613531, 613520], [613519, 607553, 613509, 308798], [607589, 613543, 613516, 607559], [607555, 607592, 607646], [607575, 613521, 607572]], [[607572, 607592, 613516, 607560], [607555, 613520, 308798, 607575], [607646, 613521, 613543, 613509], [613531, 613519, 607589], [607559, 613498, 607553]], [[607575, 607559, 607646, 607560], [613519, 613520, 613543, 607592], [613498, 613521, 613516, 308798], [607589, 607555, 607553], [613531, 613509, 607572]], [[607572, 613509, 607589, 607560], [607555, 613543, 613531, 613516], [607553, 613520, 607646, 613521], [607575, 613498, 613519], [607592, 308798, 607559]], [[607589, 607592, 613521, 613531], [308798, 613520, 607572, 607559], [607555, 607575, 613509, 613498], [607560, 607553, 613543], [607646, 613519, 613516]]];
const SEC = {"244742": 716, "244745": 740, "244741": 537, "244744": 748, "244751": 703, "244738": 566, "244746": 666, "244739": 637, "244750": 676, "245516": 691, "244737": 663, "244735": 738, "244736": 609, "244747": 595, "244743": 562};
const SS = new Set(['244739', '244750']);
const arenas = Object.keys(SEC).map(id => ({ arenaId: +id, name: 'A' + id, era: SS.has(id) ? 'SS' : 'EM', sec: SEC[id] }));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };
for (const seed of [1, 2, 3]) {
  const played = {}, plays = {}, sets = {}, last = {}; let reps = 0, third = 0, b2b = 0, est = 0;
  ROUNDS.forEach((gs, ri) => {
    let id = 1; const groups = gs.map((players, k) => ({ no: k + 1, players, slots: [0, 1].map(i => ({ gameId: id++, index: i, arenaId: null })) }));
    const ago = {}; for (const [p, m] of Object.entries(last)) { ago[p] = {}; for (const [a, r] of Object.entries(m)) ago[p][a] = ri - r; }
    const res = S.plan({ groups, arenas, played, plays, ago, sets }, { seed: seed * 100 + ri, tries: 300 });
    let mx = 0;
    for (const g of groups) {
      const got = res.assign.filter(x => x.group === g.no).map(x => x.arenaId);
      mx = Math.max(mx, got.reduce((s, a) => s + SEC[a], 0));
      for (const p of g.players) {
        (sets[p] = sets[p] || []).push([...got].sort((a, b) => a - b).join(','));
        for (const a of got) { played[p] = played[p] || {}; const n = played[p][a] = (played[p][a] || 0) + 1; if (n > 1) reps++; if (n > 2) third++; if (ago[p] && ago[p][a] === 1) b2b++; (last[p] = last[p] || {})[a] = ri; }
      }
      for (const a of got) plays[a] = (plays[a] || 0) + 1;
    }
    est += mx;
  });
  console.log(`seed ${seed}: repeats ${reps} (was 26), 3rd plays ${third}, back-to-back ${b2b}, Max est. total ${Math.round(est / 60)} min (was 138)`);
  ok(third === 0, '3rd plays ' + third); ok(b2b === 0, 'back-to-back ' + b2b); ok(reps <= 25, 'repeats ' + reps); ok(est / 60 <= 140, 'Max est. ' + Math.round(est / 60));
}
console.log(fails ? fails + ' FAILED' : 'all passed');
process.exit(fails ? 1 : 0);
