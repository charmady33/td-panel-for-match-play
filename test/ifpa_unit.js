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
// IFPA cheat sheet row "8 players: 2 with 2 byes, 2 with 1 bye, 4 in QF" -> 1.75 effective rounds (x3 games x2 = 10.5)
{
  const ids = [1, 2, 3, 4, 5, 6, 7, 8].map(i => 900 + i), gs = [], rs = [1, 2, 3].map(i => ({ roundId: 50 + i, index: i - 1 }));
  const g = (rid, set, p) => { for (let k = 0; k < 3; k++) gs.push({ roundId: rid, set, index: k, playerIds: p }); };
  g(51, 0, ids.slice(4, 8)); g(52, 0, [ids[2], ids[3], ids[4], ids[5]]); g(53, 0, [ids[0], ids[1], ids[2], ids[4]]);
  const X = { t: { type: 'group_bracket', players: [] }, standings: ids.map((id, i) => ({ playerId: id, position: i + 1, gamesPlayed: 3 })), rounds: rs, games: gs, pm: {} };
  const out = T.ifpa.grade({ ...X, t: { type: 'group_matchplay', players: [] }, standings: Array.from({ length: 20 }, (_, i) => ({ playerId: i, position: i + 1, gamesPlayed: 1 })), rounds: [], games: [] }, [{ ...X, label: 'A' }]).parts[1];
  console.log('8-player 2/2/4 bye structure:', out.evr, out.mg, out.evr === 1.75 && out.mg === 10.5 ? 'OK (matches the IFPA table)' : 'WRONG');
}
// item 100: an open B finals is placed below the A finals; restricted (cutoff or "B Ineligible" label) = left out
{
  eval(fs.readFileSync(require('path').join(__dirname, '../src/finals.js'), 'utf8'));
  const B = { t: { tournamentId: 278132, type: 'group_bracket', players }, standings: [qstand[12], qstand[13], qstand[14]].map((s, i) => ({ playerId: s.playerId, position: i + 1, gamesPlayed: 3 })), rounds: [], games: [], pm: Q.pm, label: 'B finals' };
  const famB = { qid: 278128, qual: { players }, all: [{ tournamentId: 278128 }, { tournamentId: 278131 }, { tournamentId: 278132 }] };
  const open1 = T.ifpa.openDiv(famB, B);
  T.tstate[278128] = { divs: { B: { cutoff: 500 } } }; const cut = T.ifpa.openDiv(famB, B); T.tstate[278128] = {};
  const lab = T.ifpa.openDiv({ ...famB, qual: { players: [{ ...players[0], tournamentPlayer: { labels: ['B Ineligible'] } }] } }, B);
  const R2 = T.ifpa.results(Q, [F, { ...B }]).text.split('\n').map(l => l.split(',')[0]);
  B.open = true; const G2 = T.ifpa.grade(Q, [F, B]), N2 = T.ifpa.notes(famB, Q, [F, B], G2, G2.total);
  const ok = open1 === true && cut === false && lab === false && R2[12] === '13' && G2.total === G.total && N2.includes('B Finals had no restrictions (open to every player who qualified for it).');
  console.log('open B:', open1, '| B cutoff set:', cut, '| B Ineligible label:', lab, '| place after A:', R2[12], '| MG same:', G2.total === G.total, '|', ok ? 'OK' : 'WRONG');
}
