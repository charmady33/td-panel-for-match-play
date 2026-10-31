// A machine goes down: only the banks holding it change; the replacement isn't already in that bank and doesn't
// put a machine in two banks at the same time.
global.window = global; global.TDP = {};
const fs = require('fs'), path = require('path');
for (const f of ['banks.js', 'smart.js']) eval(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'));
TDP.data = { arenaMap: t => Object.fromEntries(t.arenas.map(a => [a.arenaId, a])) };
TDP.tstate = {};
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };
const names = ['Aztec', 'Cinema', 'Dune', 'Dino', 'Gaucho', 'Fathom', 'Pharaoh', 'Fortune', 'Spirit'];
const arenas = names.map((n, i) => ({ arenaId: i + 1, name: n, categoryId: (i % 3) + 1, tournamentArena: { status: 'active' } }));
const est = arenas.map(a => ({ arenaId: a.arenaId, name: a.name, era: ['EM', 'SS', 'DMD'][a.categoryId - 1], sec: 300 + a.arenaId * 60 }));
const banks = [{ bankId: 1, name: 'Bank 1', arenaIds: [1, 2, 3] }, { bankId: 2, name: 'Bank 2', arenaIds: [4, 1, 5] }, { bankId: 3, name: 'Bank 3', arenaIds: [6, 7, 8] }];
arenas[0].tournamentArena.status = 'inactive';   // Aztec is down
const D = { tid: 1, t: { arenas, banks } };
const ch = TDP.smart.downPlan(D, est.filter(a => a.arenaId !== 1), est);
console.log(ch.map(c => `${c.bank}: ${c.down} -> ${c.repl} (${c.arenas.join(' > ')})`).join('\n'));
ok(ch.length === 2 && ch.every(c => c.bank !== 'Bank 3'), 'only banks 1 and 2 change');
for (const c of ch) { ok(!c.arenas.includes('Aztec'), 'Aztec gone from ' + c.bank); ok(new Set(c.arenas).size === 3, 'no game twice in ' + c.bank); }
// item 68: only the down game's spot changes - order and other games kept, in every option
for (const c of ch) { const old = banks.find(b => b.name === c.bank).arenaIds.map(id => names[id - 1]);
  for (const o of [c, ...c.options]) ok(o.arenas.every((n, i) => i === c.pos ? n !== 'Aztec' : n === old[i]), `${c.bank} keeps order/other games (${o.arenas.join('>')})`); }
// the two replacements, if the same game, must not be the same game number
const b1 = ch.find(c => c.bank === 'Bank 1'), b2 = ch.find(c => c.bank === 'Bank 2');
if (b1.repl === b2.repl) ok(b1.arenas.indexOf(b1.repl) !== b2.arenas.indexOf(b2.repl), 'same replacement in the same slot of two banks');
// waiting games move to the replacement
const games = [{ gameId: 11, roundId: 9, set: 0, index: 0, arenaId: 1, bankId: 1, status: 'started' }, { gameId: 12, roundId: 9, set: 0, index: 1, arenaId: 2, bankId: 1, status: 'started' }, { gameId: 13, roundId: 9, set: 1, index: 1, arenaId: 1, bankId: 2, status: 'completed' }];
TDP.timing = { isDone: g => g.status === 'completed' };
const mv = TDP.smart.downGames(D, games, ch);
console.log('move:', JSON.stringify(mv));
ok(mv.length === 1 && mv[0].gameId === 11 && mv[0].name === b1.repl, 'only the waiting Aztec game moves, to Bank 1\'s replacement');
// a game being played now on the down machine moves too; a completed one never does
const mv2 = TDP.smart.downGames(D, [...games, { gameId: 14, roundId: 9, set: 2, index: 1, arenaId: 1, bankId: 2, status: 'started', startedAt: '2026-10-31T20:00:00Z' }], ch);
ok(mv2.some(m => m.gameId === 14 && m.name === b2.repl) && !mv2.some(m => m.gameId === 13), 'in-progress game moves to Bank 2\'s replacement; completed game untouched');
// ranked choices for the TD: best first, no clash on the best
ok(b1.options && b1.options.length > 1 && !b1.options[0].clash, 'Bank 1 has ranked options, best without a clash');
console.log('Bank 1 options:', b1.options.slice(0, 4).map(o => `${o.name}${o.clash ? ' ⚠' + o.clash : ''}`).join(' | '));
// clash: Bank 2 has Cinema at game 1 like Bank 1 -> re-order Bank 2 (keeps its games)
arenas[0].tournamentArena.status = 'active';
D.t.banks = [{ bankId: 1, name: 'Bank 1', arenaIds: [2, 3, 1] }, { bankId: 2, name: 'Bank 2', arenaIds: [2, 4, 5] }, { bankId: 3, name: 'Bank 3', arenaIds: [6, 7, 8] }];
const cp = TDP.smart.clashPlan(D, est, est);
console.log('clash fix:', JSON.stringify(cp.map(c => [c.bank, c.what, c.arenas.join('>')])));
ok(cp.length === 1 && cp[0].bank === 'Bank 2' && cp[0].arenas[0] !== 'Cinema' && cp[0].arenas.includes('Cinema'), 'Bank 2 re-ordered, Cinema kept');
// timing: a shared machine at the same game number - the finished game went first
const T0 = Date.parse('2026-10-31T20:00:00Z'), iso = ms => new Date(ms).toISOString();
TDP.timing = undefined; eval(fs.readFileSync(path.join(__dirname, '../src/timing.js'), 'utf8'));
const g1 = { gameId: 1, roundId: 5, set: 0, index: 0, arenaId: 9, status: 'started', startedAt: iso(T0), duration: null };
const g4 = { gameId: 4, roundId: 5, set: 3, index: 0, arenaId: 9, status: 'completed', startedAt: iso(T0), duration: 600 };
const rg = [g1, g4];
console.log('finished game start:', TDP.timing.realStart(g4, rg) ? 'set' : 'WAITING', '| other group starts after it:', (TDP.timing.realStart(g1, rg) - T0) / 1000, 's');
ok(TDP.timing.realStart(g4, rg) === T0, 'Group 4 (finished) started at the round start');
ok(TDP.timing.realStart(g1, rg) === T0 + 600000, 'Group 1 starts when Group 4 freed the machine');
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
