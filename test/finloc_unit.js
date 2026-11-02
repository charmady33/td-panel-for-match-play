// item 97: a finals with no location uses the qualifying's location + the qualifying's Match Play IDs, before anything starts
global.window = global; global.document = { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null };
global.TDP = {}; const T = global.TDP;
const saved = {}, loads = [];
Object.assign(T, {
  settings: { token: 'x' }, tstate: { 100: { bankPast: '555' } },
  loadT: async tid => T.tstate[tid] || {}, saveT: async (tid, p) => { T.tstate[tid] = Object.assign(T.tstate[tid] || {}, p); Object.assign(saved, p); },
  data: { D: null, arr: x => x, unwrap: x => x },
  api: { get: async p => p.startsWith('/users') ? { userId: 1 } : [
    { tournamentId: 700, locationId: 9, startUtc: new Date().toISOString() },
    { tournamentId: 701, locationId: 8, startUtc: new Date().toISOString() }] },
  bankplan: { loadPast: async (D, ids) => { loads.push(ids); T.tstate[D.tid] = Object.assign(T.tstate[D.tid] || {}, { bankPast: ids.join(', '), past4: true }); return 1; } },
  inpage: { block() {} },
});
require('../src/arenatab.js');
T.arenatab.render = () => {};
(async () => {
  const D = { tid: 200, t: { tournamentId: 200, status: 'planned', locationId: null }, qual: { tournamentId: 100, status: 'planned', locationId: 9 }, me: { userId: 1 } };
  T.data.D = D;
  await T.arenatab.autoLocal(D);
  const got = loads[loads.length - 1] || [];
  const ok = got.includes(555) && got.includes(700) && !got.includes(701) && !got.includes(100);
  console.log('loaded ids for finals:', JSON.stringify(got), 'locAuto', JSON.stringify(saved.locAuto));
  // old (not 4-player) times get loaded again
  loads.length = 0; T.tstate[300] = { bankPast: '42', pastTimes: { a: {} } };
  await T.arenatab.autoLocal({ tid: 300, t: { tournamentId: 300, locationId: null }, me: { userId: 1 } });
  const ok2 = JSON.stringify(loads[0]) === '[42]';
  console.log('reload old times:', JSON.stringify(loads));
  console.log(ok && ok2 ? 'all passed' : 'FAILED'); if (!(ok && ok2)) process.exit(1);
})();
