const vm = require('vm'), fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '../src/util.js'), 'utf8');
// one shared chrome.storage.local, with onChanged fired to every "tab"
const data = {}, listeners = [];
const local = {
  get: async k => (k in data ? { [k]: JSON.parse(JSON.stringify(data[k])) } : {}),
  set: async o => { const ch = {}; for (const [k, v] of Object.entries(o)) { ch[k] = { oldValue: data[k], newValue: JSON.parse(JSON.stringify(v)) }; data[k] = JSON.parse(JSON.stringify(v)); } await new Promise(r => setTimeout(r, 5)); listeners.forEach(f => f(ch, 'local')); },
  remove: async k => { delete data[k]; },
};
const chrome = { storage: { local, onChanged: { addListener: f => listeners.push(f) } } };
function tab(name) {
  const ctx = { console, setTimeout, clearTimeout, chrome, sessionStorage: { getItem: () => name, setItem() {} }, localStorage: {}, document: {}, HTMLInputElement: function () {}, KeyboardEvent: function () {}, MouseEvent: function () {}, PointerEvent: function () {}, Event: function () {} };
  ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx); return ctx.TDP;
}
(async () => {
  const A = tab('A'), B = tab('B');
  await A.loadT(280169); await B.loadT(280169);            // both tabs open the tournament
  let redraws = 0; B.onShared(() => redraws++);
  await A.saveT(280169, { autoBanks: true });               // TD ticks "Rebuild banks every round" in tab A
  await new Promise(r => setTimeout(r, 30));
  console.log('tab B sees it right away:', B.tstate[280169].autoBanks === true, '| B redraws:', redraws);
  for (let i = 0; i < 3; i++) await B.saveT(280169, { fullSeen: { [i]: Date.now() } });   // B's routine 15-second saves
  await new Promise(r => setTimeout(r, 30));
  console.log('after B saved 3x: stored autoBanks =', data['t:280169'].autoBanks, '| A memory =', A.tstate[280169].autoBanks, '| redraws for routine saves:', redraws - 1);
  // two saves at once in one tab must not lose either
  await Promise.all([A.saveT(280169, { auto: true }), A.saveT(280169, { autoFill: true })]);
  console.log('two quick saves:', JSON.stringify({ auto: data['t:280169'].auto, autoFill: data['t:280169'].autoFill, autoBanks: data['t:280169'].autoBanks }));
  await B.saveSettings({ autoCountdown: 5 }); await A.saveSettings({ labelColor: 'sky' });
  await new Promise(r => setTimeout(r, 30));
  console.log('settings kept from both tabs:', JSON.stringify(data.settings));
})();
