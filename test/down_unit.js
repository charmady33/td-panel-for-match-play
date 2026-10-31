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
// the two replacements, if the same game, must not be the same game number
const b1 = ch.find(c => c.bank === 'Bank 1'), b2 = ch.find(c => c.bank === 'Bank 2');
if (b1.repl === b2.repl) ok(b1.arenas.indexOf(b1.repl) !== b2.arenas.indexOf(b2.repl), 'same replacement in the same slot of two banks');
// waiting games move to the replacement
const games = [{ gameId: 11, roundId: 9, set: 0, index: 0, arenaId: 1, bankId: 1, status: 'started' }, { gameId: 12, roundId: 9, set: 0, index: 1, arenaId: 2, bankId: 1, status: 'started' }, { gameId: 13, roundId: 9, set: 1, index: 1, arenaId: 1, bankId: 2, status: 'completed' }];
TDP.timing = { isDone: g => g.status === 'completed' };
const mv = TDP.smart.downGames(D, games, ch);
console.log('move:', JSON.stringify(mv));
ok(mv.length === 1 && mv[0].gameId === 11 && mv[0].name === b1.repl, 'only the waiting Aztec game moves, to Bank 1\'s replacement');
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
