global.window = global; global.TDP = {};
const fs = require('fs');
TDP.tstate = {}; TDP.letter = i => String.fromCharCode(65 + i);
TDP.data = { unwrap: j => j, playerMap: t => Object.fromEntries(t.players.map(p => [p.playerId, p])) };
eval(fs.readFileSync(require('path').join(__dirname, '../src/ifpa.js'), 'utf8'));
const T = TDP;
// qualifying: 24 players, 8 rounds, 6 groups of 4, 2 games per group
const qpos = '1,2,3,4,5,6,7,7,7,10,11,11,13,13,15,16,17,18,19,19,19,22,23,24'.split(',').map(Number);
const players = qpos.map((_, i) => ({ playerId: 100 + i, name: 'P' + (i + 1), ifpaId: i === 5 ? null : 5000 + i }));
const qstand = qpos.map((p, i) => ({ playerId: 100 + i, position: p, gamesPlayed: 16 }));
const qrounds = [], qgames = [];
for (let r = 0; r < 8; r++) { qrounds.push({ roundId: r + 1, index: r }); for (let s = 0; s < 6; s++) for (let g = 0; g < 2; g++) qgames.push({ roundId: r + 1, set: s, index: g, playerIds: [0, 1, 2, 3].map(k => 100 + s * 4 + k) }); }
// finals: top 12, seeds 1-4 bye; R1: seeds 5-12 in 2 groups; R2: 4 adv + 4 byes in 2 groups; R3: final 4; 3 games each
const fp = qstand.slice(0, 12).map(s => s.playerId);
const fgames = [], fr = [1, 2, 3].map(i => ({ roundId: 10 + i, index: i - 1 }));
const grp = (rid, set, ids) => { for (let g = 0; g < 3; g++) fgames.push({ roundId: rid, set, index: g, playerIds: ids }); };
grp(11, 0, fp.slice(4, 8)); grp(11, 1, fp.slice(8, 12));
grp(12, 0, [fp[0], fp[1], fp[4], fp[8]]); grp(12, 1, [fp[2], fp[3], fp[5], fp[9]]);
grp(13, 0, [fp[0], fp[4], fp[2], fp[5]]);
const fpos = '1,2,3,4,5,6,6,8,9,10,11,11'.split(',').map(Number);
const fstand = [fp[2], fp[0], fp[4], fp[5], fp[1], fp[8], fp[3], fp[9], fp[6], fp[7], fp[10], fp[11]].map((id, i) => ({ playerId: id, position: fpos[i], gamesPlayed: 6 }));
const Q = { t: { tournamentId: 278128, type: 'group_matchplay', players }, standings: qstand, rounds: qrounds, games: qgames, pm: T.data.playerMap({ players }) };
const F = { t: { tournamentId: 278131, type: 'group_bracket', gamesPerRound: 3, players }, standings: fstand, rounds: fr, games: fgames, pm: Q.pm, label: 'A finals' };
const R = T.ifpa.results(Q, [F]);
console.log(R.text.split('\n').map(l => l.split(',')[0]).join(','));
console.log(R.checks.map(c => c.kind + ': ' + c.text).join('\n'));
const G = T.ifpa.grade(Q, [F]);
console.log(JSON.stringify(G.parts.map(p => [p.label, p.mg, p.counts, p.math, p.note])), G.total, G.warns);
const fam = { qid: 278128, all: [{ tournamentId: 278128 }, { tournamentId: 278131 }] };
console.log(T.ifpa.notes(fam, Q, [F], G, G.total));
