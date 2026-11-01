// Items 72 + 76: IFPA rank ranges -> eligibility labels; TD / Scorekeeper labels (never both, by account, other labels
// kept); staff labels don't count for eligibility; the number-box rules (orderbox.assign / toFinish).
global.window = global; global.TDP = { tstate: {}, letter: i => String.fromCharCode(65 + i), isFrame: true, settings: {} };
global.document = { addEventListener() {}, documentElement: { classList: { contains: () => false } } };
global.MutationObserver = class { observe() {} };
const fs = require('fs'), path = require('path');
for (const f of ['finals.js', 'cutoffs.js', 'orderbox.js']) eval(fs.readFileSync(path.join(__dirname, '../src', f), 'utf8'));
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  FAIL', m); } };
const r = TDP.cutoffs.ranges({ B: 1000, C: 3000 });
console.log('ranges', JSON.stringify(r));
ok(r.length === 2 && r[0].from === 1 && r[0].to === 1000 && r[0].label === 'B/C Ineligible' && r[1].from === 1001 && r[1].to === 3000 && r[1].label === 'C Ineligible', 'B 1000 / C 3000 ranges');
ok(TDP.cutoffs.ranges({ B: 500 }).length === 1 && TDP.cutoffs.ranges({}).length === 0, 'one cut / none');
// staff: organizer 1 + manager 2 = TD; scorekeeper 3 (also 2 is listed as scorekeeper -> TD wins); 9 not in the pool
const P = (id, user, labels = []) => ({ playerId: id, name: 'P' + id, claimedBy: user, tournamentPlayer: { labels, status: 'active' } });
const t = { organizerId: 1, managers: [2], scorekeepers: [{ userId: 3, role: 'scorekeeper' }, { userId: 2, role: 'scorekeeper' }, { userId: 9, role: 'scorekeeper' }],
  players: [P(10, 1), P(11, 2, ['B Ineligible']), P(12, 3), P(13, null, ['TD']), P(14, 4)] };
const g = TDP.cutoffs.staffGroups(t);
const lab = id => { const x = g.find(x => x.ids.includes(id)); return x ? x.labels.join('|') + '#' + x.color : 'unchanged'; };
console.log('staff', JSON.stringify(g));
ok(lab(10) === 'TD#sky', 'organizer -> TD (blue)');
ok(lab(11) === 'B Ineligible|TD#rose', 'manager keeps B Ineligible, gets TD, keeps the eligibility color');
ok(lab(12) === 'Scorekeeper#gray', 'scorekeeper -> Scorekeeper (gray)');
ok(lab(13) === '#undefined' || lab(13).startsWith('#'), 'TD label taken off a player who is not a TD');
ok(lab(14) === 'unchanged', 'everyone else unchanged');
ok(!g.some(x => x.labels.includes('TD') && x.labels.includes('Scorekeeper')), 'never both');
// unknown scorekeeper list: Scorekeeper labels left alone
ok(!TDP.cutoffs.staffGroups({ organizerId: 1, managers: [], players: [P(20, 5, ['Scorekeeper'])] }).length, 'unknown scorekeeper list keeps the label');
// staff labels never count for eligibility
const d = { i: 1, letter: 'B', cutoff: null, label: 'B Ineligible' };
ok(!TDP.finals.ineligible(P(30, 1, ['TD']), d, {}) && !TDP.finals.ineligible(P(31, 3, ['Scorekeeper']), d, {}), 'TD / Scorekeeper are eligible');
ok(TDP.finals.ineligible(P(32, 1, ['B Ineligible', 'TD']), d, {}), 'B Ineligible + TD still ineligible for B');
// strip: only eligibility labels come off
const s = TDP.cutoffs.stripGroups({ players: [P(40, 1, ['B/C Ineligible', 'TD']), P(41, 2, ['C Ineligible']), P(42, 3, ['Scorekeeper'])] });
ok(s.length === 2 && s.some(x => x.ids[0] === 40 && x.labels.join() === 'TD') && s.some(x => x.ids[0] === 41 && !x.labels.length), 'strip keeps TD');
// number boxes: shift + last fills itself
const o = TDP.orderbox.assign({ a: 1, b: 2 }, ['a', 'b', 'c', 'd'], 'c', 1);
console.log('assign', JSON.stringify(o));
ok(o.c === 1 && o.a === 2 && o.b === 3 && o.d === 4, 'c to 1st: a, b shift; d fills itself');
const f = TDP.orderbox.toFinish([11, 12, 13, 14], [11, 12, 13, 14], 14, 1);
ok(f.join() === '14,11,12,13', 'finish: 4th to 1st shifts the rest down');
console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0);
