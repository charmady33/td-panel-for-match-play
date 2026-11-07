// Even round lengths: 43 games (17 EM, 13 SS, 13 DMD at era-default times), 12 groups × 2 games, 8 rounds.
// The longest group of each round (Max est.) should be about the same every round.
global.window = global; global.TDP = {};
const fs = require('fs'), path = require('path');
eval(fs.readFileSync(path.join(__dirname, '../src/smart.js'), 'utf8'));
const S = TDP.smart;
const SEC = { EM: 540, SS: 720, DMD: 1020 };
let worst = 0, fails = 0;
for (let t = 0; t < 4; t++) {
  const arenas = []; let id = 1;
  for (const [era, n] of [['EM', 17], ['SS', 13], ['DMD', 13]]) for (let i = 0; i < n; i++) arenas.push({ arenaId: id, name: era + i, era, sec: SEC[era] }), id++;
  const played = {}, plays = {}, prev = []; let gid = 1; const maxes = [], gaps = [];
  for (let r = 0; r < 8; r++) {
    const ps = Array.from({ length: 46 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    const sizes = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3];
    let k = 0; const groups = sizes.map((n, g) => { const p = ps.slice(k, k + n); k += n; return { no: g + 1, players: p, slots: [{ gameId: gid++, index: 0, arenaId: null }, { gameId: gid++, index: 1, arenaId: null }] }; });
    const ago = {}; prev.forEach((m, j) => { for (const [p, s] of Object.entries(m)) for (const a of s) { ago[p] = ago[p] || {}; const d = r - j; if (!ago[p][a] || d < ago[p][a]) ago[p][a] = d; } });
    const res = S.plan({ groups, arenas, played, plays, ago }, { seed: 99 + r + t * 10 });
    const sum = {}; res.assign.forEach(x => { sum[x.group] = (sum[x.group] || 0) + arenas.find(a => a.arenaId === x.arenaId).sec; });
    maxes.push(Math.round(Math.max(...Object.values(sum)) / 60));
    const now = {};
    for (const x of res.assign) { const g = groups.find(y => y.no === x.group); plays[x.arenaId] = (plays[x.arenaId] || 0) + 1; for (const p of g.players) { played[p] = played[p] || {}; played[p][x.arenaId] = (played[p][x.arenaId] || 0) + 1; (now[p] = now[p] || new Set()).add(x.arenaId); } }
    prev.push(now);
    const c = arenas.map(a => plays[a.arenaId] || 0); gaps.push(Math.max(...c) - Math.min(...c));
  }
  const spread = Math.max(...maxes) - Math.min(...maxes); worst = Math.max(worst, spread);
  console.log(`run ${t + 1}: Max est. per round ${maxes.join(' / ')} min (spread ${spread}) · play-count gap ${Math.max(...gaps)}`);
  if (spread > 3) fails++;
  if (Math.max(...gaps) > 4) { fails++; console.log('  FAIL play gap'); }   // item 105: equal plays is only a tiebreaker now
}
console.log(fails ? `${fails} FAILED (worst spread ${worst} min)` : `all passed (worst spread ${worst} min)`);
process.exit(fails ? 1 : 0);
