// item 98: game times scaled to a 4-player game
global.window = global; global.TDP = {}; require('../src/timing.js');
const T = global.TDP, t0 = Date.parse('2026-11-01T18:00:00Z'), m = 60e3;
const g = (id, arena, players, len) => ({ gameId: id, roundId: 1, set: id, index: 0, arenaId: arena, playerIds: players, status: 'completed', startedAt: new Date(t0).toISOString(), duration: len / 1000, resultPositions: players });
const games = [g(1, 10, [1, 2, 3, 4], 12 * m), g(2, 11, [5, 6], 6 * m), g(3, 12, [7, 8, 9], 9 * m), g(4, 13, [9], 1.5 * m)];
const r = T.timing.arenaTimes(games), mins = id => r[id] ? r[id].avg / m : null;
const ok = mins(10) === 12 && mins(11) === 12 && mins(12) === 12 && mins(13) === null;
console.log('4p', mins(10), '2p', mins(11), '3p', mins(12), '1p 1.5min (under 2 min real)', mins(13));
console.log(ok ? 'all passed' : 'FAILED'); if (!ok) process.exit(1);
