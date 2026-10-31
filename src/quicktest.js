// Quick test tournament: on Matchplay's "Create new tournament" page, picking **Test tournament** shows
// Players [16] · Arenas [12] · Arena mix. After Create tournament, a task adds that many of your existing players
// (random; any shortfall as "Test Player N" on the Batch tab, reused next time) and existing arenas.
var TDP = window.TDP || (window.TDP = {});

TDP.quicktest = (() => {
  const T = TDP;
  let opts = null, hooked = false;
  const onPage = () => /^\/tournaments\/new\/?$/.test(location.pathname);
  async function load() { if (!opts) opts = { players: 16, arenas: 12, mix: 'era', ...(await T.store.get('quicktest', {})) }; return opts; }

  function render() {
    if (T.isFrame || !onPage()) { T.inpage.block('tdp-quicktest', null); return; }
    const test = document.querySelector('main input[type=radio][value=test]');
    let row = test; for (let i = 0; i < 8 && row && !/\bsm:grid\b/.test(row.className || ''); i++) row = row.parentElement;
    if (!test || !test.checked || !row) { T.inpage.block('tdp-quicktest', null); return; }
    if (!opts) { load().then(render); return; }
    if (!hooked) { hooked = true; document.addEventListener('click', onCreate, true); }
    const num = (k, label) => `<label class="gap" style="align-items:center"><span class="lab">${label}</span><input type="number" min="0" max="200" data-f="${k}" value="${opts[k]}" style="width:80px"></label>`;
    T.inpage.block('tdp-quicktest', row, 'after', `<div class="card" style="margin:8px 0 16px"><div class="cb gap" style="flex-wrap:wrap;align-items:center">
      <span class="h">Quick test setup</span>${num('players', 'Players')}${num('arenas', 'Arenas')}
      <label class="gap" style="align-items:center"><span class="lab">Arena mix</span><select data-f="mix" style="width:auto"><option value="era"${opts.mix === 'era' ? ' selected' : ''}>Spread over EM / SS / DMD</option><option value="random"${opts.mix === 'random' ? ' selected' : ''}>Random</option></select></label>
      <span class="small flex1">Added right after Create tournament: your existing players first (random), then "Test Player N" for any shortfall; arenas from your existing list. 0 = skip.</span></div></div>`, onEvent);
  }
  function onEvent(e) {
    const f = e.target.dataset && e.target.dataset.f; if (!f || !opts) return;
    if (e.type !== 'change' && !(e.type === 'input' && f !== 'mix')) return;
    opts[f] = f === 'mix' ? e.target.value : Math.max(0, Math.min(200, parseInt(e.target.value, 10) || 0));
    T.store.set('quicktest', opts);
  }
  // Create tournament with Test picked: remember what to add (picked up on the new tournament's page)
  function onCreate(e) {
    const b = e.target.closest && e.target.closest('button'); if (!b || !onPage() || !/^Create tournament$/i.test(T.txt(b))) return;
    const test = document.querySelector('main input[type=radio][value=test]');
    if (!test || !test.checked || !opts || (!opts.players && !opts.arenas)) return;
    T.store.set('quicktest:pending', { players: opts.players, arenas: opts.arenas, mix: opts.mix, at: Date.now() });
  }
  // on a tournament page: a pending quick setup from the last 2 minutes -> fill this (new, test) tournament
  async function after(tid) {
    if (T.isFrame || !tid || T.jobs.active()) return;
    const p = await T.store.get('quicktest:pending', null);
    if (!p || Date.now() - p.at > 120e3) return;
    await T.store.del('quicktest:pending');
    const steps = [];
    if (p.players) steps.push({ tid, page: 'players', op: 'qtPlayers', args: { tid, n: p.players }, label: `Adding ${p.players} players` });
    if (p.arenas) steps.push({ tid, page: 'arenas', op: 'qtArenas', args: { tid, n: p.arenas, mix: p.mix }, label: `Adding ${p.arenas} arenas` });
    if (steps.length) try { await T.jobs.start('Quick test setup', steps); } catch (e) { T.panel.say(e.message || String(e), 'err'); }
  }
  // picking Test / Regular doesn't always redraw Matchplay's page: watch the choice itself
  if (!T.isFrame) document.addEventListener('change', e => { if (e.target && e.target.type === 'radio' && e.target.name === 'test' && !T.settings.off && !T.dead) render(); }, true);
  return { render, after };
})();
