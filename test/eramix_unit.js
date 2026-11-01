// Item 71: bank spots by era strictly by share, longest left out within an era, each era spread evenly over the
// banks (within one), a forced-in game bumps the longest kept game of its own era.
global.window = global; global.TDP = {};
const fs = require('fs'), path = require('path');
eval(fs.readFileSync(path.join(__dirname, '../src/banks.js'), 'utf8'));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };
const mk = (era, n, base) => [...Array(n)].map((_, i) => ({ arenaId: base + i, name: `${era}${i + 1}`, era, sec: (era === 'EM' ? 500 : era === 'SS' ? 700 : 1000) + i * 30 }));
const games = [...mk('DMD', 10, 100), ...mk('SS', 6, 200), ...mk('EM', 4, 300)];
const cnt = (gs, e) => gs.filter(g => g.era === e).length;
for (let seed = 1; seed <= 200; seed++) {
  const r = TDP.banks.build(games, 4, 3, { seed });
  const all = r.banks.flatMap(b => b.games);
  if (seed === 1) console.log('plan', JSON.stringify(r.plan), '| banks:', r.banks.map(b => b.games.map(g => g.name).join(' ')).join(' / '), '| dropped:', r.dropped.map(g => g.name).join(' '));
  ok(cnt(all, 'DMD') === 6 && cnt(all, 'SS') === 4 && cnt(all, 'EM') === 2, `seed ${seed}: 6 DMD / 4 SS / 2 EM`);
  for (const e of ['DMD', 'SS', 'EM']) { const c = r.banks.map(b => cnt(b.games, e)); ok(Math.max(...c) - Math.min(...c) <= 1, `seed ${seed}: ${e} spread ${c}`); }
  ok(!r.dropped.some(d => all.some(k => k.era === d.era && k.sec > d.sec)), `seed ${seed}: only the longest left out in each era`);
  ok(r.banks.every(b => b.games.length === 3 && new Set(b.games.map(g => g.arenaId)).size === 3), `seed ${seed}: 3 different games per bank`);
}
// strict share: no boost for a rare era (3 EM of 20 games, 12 spots -> 2 EM)
const rare = [...mk('DMD', 11, 100), ...mk('SS', 6, 200), ...mk('EM', 3, 300)];
const r2 = TDP.banks.build(rare, 4, 3, { seed: 3 });
console.log('rare EM plan', JSON.stringify(r2.plan));
ok(r2.plan.EM.spots === 2, 'EM 3 of 20 games -> 2 of 12 spots');
// forced in (Include): the longest EM bumps the longest kept EM
const r3 = TDP.banks.build(games, 4, 3, { seed: 5, force: [303] });
console.log('include EM4:', JSON.stringify(r3.bumped), '| EM in banks:', r3.banks.flatMap(b => b.games).filter(g => g.era === 'EM').map(g => g.name).join(' '));
ok(r3.bumped.length === 1 && r3.bumped[0].in === 'EM4' && r3.bumped[0].out === 'EM2' && r3.bumped[0].sameEra, 'EM4 in, EM2 (longest kept EM) out');
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
