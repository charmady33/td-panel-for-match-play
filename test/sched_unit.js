global.window = global; global.TDP = {};
const fs = require('fs');
eval(fs.readFileSync(require('path').join(__dirname, '../src/banks.js'), 'utf8'));
eval(fs.readFileSync(require('path').join(__dirname, '../src/timing.js'), 'utf8'));
const g = (name, sec) => ({ name, sec });
// the case from the screenshot: Pharaoh and Fortune in two banks each, Bank 1 much shorter
let bad = 0;
for (let t = 0; t < 200; t++) {
  const sh = a => a.sort(() => Math.random() - 0.5);
  const banks = [{ games: sh([g('Eye Of The Tiger', 540), g('Ninja Eclipse', 312), g('Pharaoh', 239)]) }, { games: sh([g('Mata Hari', 1232), g('Fortune', 285), g('Pharaoh', 239)]) }, { games: sh([g('Rescue 911', 900), g('Fortune', 285), g('Gaucho', 299)]) }];
  TDP.banks.schedule(banks);
  const pos = n => banks.map(b => b.games.findIndex(x => x.name === n)).filter(i => i >= 0);
  for (const n of ['Pharaoh', 'Fortune']) { const p = pos(n); if (new Set(p).size !== p.length) bad++; }
}
console.log('same game number collisions in 200 random tries:', bad);
// with fixed (existing) banks too
const fixed = [[g('Pharaoh', 239), g('A', 500), g('B', 500)]];
const nb = [{ games: [g('C', 500), g('D', 500), g('Pharaoh', 239)] }, { games: [g('Pharaoh', 239), g('E', 500), g('F', 500)] }];
TDP.banks.schedule(nb, fixed);
console.log('vs existing (Pharaoh game 1 there):', nb.map(b => b.games.map(x => x.name).join('>')).join(' | '));
// median + outliers
const games = [];
const mk = (id, ms) => games.push({ gameId: id, roundId: id, set: id, index: 0, arenaId: 7, status: 'completed', startedAt: new Date(0).toISOString(), duration: ms / 1000, playerIds: [1] });
[300, 310, 290, 320, 3960].forEach((s, i) => mk(i + 1, s * 1000));
const at = TDP.timing.arenaTimes(games)[7];
console.log('times 5:00,5:10,4:50,5:20,1:06:00 ->', 'count', at.count, 'dropped', at.dropped, 'value', Math.round(at.avg / 1000) + 's');
