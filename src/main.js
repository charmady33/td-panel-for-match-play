// Entry point: follows Matchplay's in-app navigation, draws the extension's parts into Matchplay's pages on
// tournaments you run, resumes unfinished jobs, and runs the optional auto close/start round.
// One page watcher (MutationObserver) does all the redrawing - no polling timers.
var TDP = window.TDP || (window.TDP = {});

(async () => {
  const T = TDP;
  if (window.__tdpStarted) return; window.__tdpStarted = true;
  await T.loadSettings();
  const tabId = Math.random().toString(36).slice(2);

  await T.jobs.init();

  // ---------- inside the hidden worker frame: only run tasks, show nothing ----------
  if (T.isFrame) {
    let last = null;
    const go = async () => { if (location.pathname === last) return; last = location.pathname; const tid = T.routeTid(); if (tid) await T.data.useTournament(tid); T.jobs.resume(); };
    new MutationObserver(() => go()).observe(document.documentElement, { childList: true, subtree: true });
    addEventListener('popstate', () => setTimeout(go, 0));
    go();
    return;
  }

  T.busy.render();   // mid-task reload: cover the page straight away
  bgRunner();
  T.jobs.afterLoad();

  // ---------- route watching (Matchplay is a single-page app) ----------
  let lastPath = null;
  async function onRoute() {
    if (location.pathname === lastPath || T.sync.hopping()) return;   // (a soft refresh hops away and back - not a new page)
    const prevTid = lastPath ? Number((lastPath.match(/^\/tournaments\/(\d+)/) || [])[1]) : null;
    lastPath = location.pathname;
    if (prevTid && prevTid === T.routeTid()) { T.data.refresh(true); return; }   // another tab of the same tournament: fresh details
    const tid = T.routeTid();
    if (!tid) { T.panel.unmount(); T.data.setTournament(null); T.deltest.render(); return; }
    T.panel.mount(); T.panel.render();
    T.jobs.resume();   // a task in progress carries on straight away (it doesn't need the tournament data first)
    await T.data.setTournament(tid);
    T.embed.render();
  }
  onRoute();
  addEventListener('popstate', () => setTimeout(onRoute, 0));

  // the page watcher: whenever Matchplay draws or changes its page - a new address (in-app navigation), our parts
  // put back where Matchplay redrew, the flag, and Matchplay's own toasts ("Round started"…) -> reload details
  let drawTimer = null, toastTimer = null;
  const draw = () => {
    drawTimer = null;
    onRoute();
    T.flag.swap();
    if (T.data.D.t) { T.inpage.render(); T.embed.render(); T.panel.render(); }
    T.deltest.render();   // (Organized page: no tournament open)
    if (T.jobs.get()) T.busy.render();
  };
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || (n.id || '').startsWith('tdp-')) continue;
      const tx = n.textContent || ''; if (tx.length > 200) continue;   // toasts are short
      if (/(Tournament|Round) (started|completed|published)|Round created/i.test(tx)) { clearTimeout(toastTimer); toastTimer = setTimeout(() => T.data.refresh(true), 800); }
    }
    if (!drawTimer) drawTimer = setTimeout(draw, 60);
  }).observe(document.documentElement, { childList: true, subtree: true });

  T.data.on(D => {
    if (D.isTD === false && T.settings.token) { T.panel.unmount(); return; }   // not your tournament: stay out of the way
    T.panel.mount(); T.panel.render();
    T.embed.render(); T.inpage.render();
    autoTick().then(autoBanks).then(autoAssign).then(autoFill);
  });
  T.jobs.on(() => { T.panel.render(); T.embed.render(); T.busy.render(); T.inpage.render(); });
  // Matchplay doesn't push changes: when the API shows something new (a score from a phone, a new round…),
  // Matchplay's page fetches again in place - unless the TD is busy with it
  T.data.onChange(() => T.sync.auto());
  // a setting changed (here or in another tab): redraw everything that shows settings
  let sharedTimer = null;
  let lastToken = T.settings.token;
  T.onShared(() => {
    if (T.settings.token !== lastToken) { lastToken = T.settings.token; T.api.clear(); T.data.D.me = null; T.data.refresh(true); }   // token set from the toolbar button
    clearTimeout(sharedTimer); sharedTimer = setTimeout(() => { T.panel.render(); T.embed.render(); T.inpage.render(); }, 150);
  });

  // ---------- auto close round & start next (default off, per tournament) ----------
  let autoBusy = false;
  const isFinals = D => !!(D.qual && D.qual.tournamentId !== D.tid);
  async function lock(tid) {
    const k = 'lock:auto:' + tid, cur = await T.store.get(k, null);
    if (cur && cur.tab !== tabId && Date.now() - cur.at < 30000) return false;
    await T.store.set(k, { tab: tabId, at: Date.now() }); return true;
  }
  const state = s => { T.panel.setAutoState(s); T.inpage.setAutoState(s); };
  async function autoTick() {
    const D = T.data.D, tid = D.tid, st = T.tstate[tid] || {};
    if (!st.auto || autoBusy || !D.t || !D.isTD) return;
    if (T.jobs.active()) return state('waiting for the running task');
    if (D.t.status !== 'started') return state('tournament not in progress');
    const r = T.data.latestRound();
    if (!r || String(r.status) === 'completed') return state('no round in progress');
    if (!(await lock(tid))) return state('running in another tab');
    autoBusy = true;
    try {
      const fresh = await T.api.all(`/tournaments/${tid}/games?round=${r.roundId}`, 0);
      const gs = fresh.filter(g => !g.bye);
      const open = gs.filter(g => !T.timing.isDone(g));
      if (!gs.length || open.length) {
        const pend = open.filter(g => T.timing.suggestState(g) !== 'none').length;
        return state(`${open.length} game${open.length === 1 ? '' : 's'} not approved yet${pend ? ` (${pend} with scores waiting)` : ''}`);
      }
      D.games = D.games.filter(g => g.roundId !== r.roundId).concat(fresh);
      const ft = T.finals.groupTies(D).filter(t => !t.tbDone);
      if (ft.length) return state(ft[0].tbGame ? `waiting for Group ${ft[0].group}'s tiebreaker` : 'tie needs breaking first: ' + ft[0].why);
      const total = D.t.roundCount || D.t.duration || 0, last = !!total && D.rounds.length >= total;
      const go = await T.panel.showCountdown(`All games approved in ${r.name}. Closing the round${last ? '' : ' and starting the next one'} in`, 10);
      if (!go || !(T.tstate[tid] || {}).auto) return state('cancelled - will check again');
      const steps = [{ tid, page: 'matches', op: 'closeRound', label: `Closing ${r.name}` }];
      const stt = T.tstate[tid] || {}, banksOn = /bank/i.test(D.t.arenaAssignment || '');
      const rebuild = banksOn && stt.autoBanks && !isFinals(D), assign = banksOn && stt.autoAssign;   // finals keep their banks
      if (!last) {
        // Rebuild (Banks tab) and Automatic assign (Matches tab) are separate; with assign on, the round starts
        // unpublished, gets its banks, then goes live
        if (rebuild) steps.push({ tid, page: 'banks', op: 'rebuildBanks', args: { tid }, label: 'Rebuilding banks for the next round' });
        steps.push({ tid, page: 'matches', op: 'startNextRound', args: { publish: !assign }, label: assign ? 'Starting the next round (not published yet)' : 'Starting the next round' });
        if (assign) {
          steps.push({ tid, page: 'matches', op: 'assignRound', args: { tid }, label: 'Assigning a bank to each group' });
          steps.push({ tid, page: 'matches', op: 'publishRound', label: 'Publishing the round' });
        }
      }
      await T.jobs.start(last ? `Close ${r.name}` : `Close ${r.name} & start next round`, steps);
      state(last ? `closing ${r.name} - that was the last round` : `closing ${r.name} and starting the next round`);
    } catch (e) { state('error: ' + (e.message || e)); }
    finally { autoBusy = false; }
  }

  // ---------- Assign banks: automatic option on the Matches tab (default off) ----------
  let assignBusy = false;
  async function autoAssign() {
    const D = T.data.D, tid = D.tid, st = T.tstate[tid] || {};
    // with Rebuild on as well, the rebuild task assigns after rebuilding (one task, never two at once)
    if (!st.autoAssign || assignBusy || !D.t || !D.isTD || D.t.status !== 'started' || T.jobs.active()) return;
    if (st.autoBanks && !isFinals(D)) { const c = T.bankplan.context(D); if (c.round && st.banksDoneRound !== c.round.roundId) return; }
    const ctx = T.bankplan.context(D);
    if (!ctx.round || !ctx.groups.length || st.assignDoneRound === ctx.round.roundId) return;
    if (!(await lock(tid + ':assign'))) return;
    assignBusy = true;
    try {
      const opts = T.bankplan.assignOptions(D);
      if (!opts.list.length) return;
      await T.saveT(tid, { assignDoneRound: ctx.round.roundId });   // once per round, even if the TD stops the task
      await T.jobs.start(`Assign banks for ${ctx.round.name}`, T.bankplan.assignSteps(D, opts.ctx, opts.list[0]));
    } catch (e) { T.panel.say('Assign banks: ' + (e.message || e), 'err'); }
    finally { assignBusy = false; }
  }

  // ---------- Test tournaments: random results every round (Matches tab, default off) ----------
  let fillBusy = false;
  async function autoFill() {
    const D = T.data.D, tid = D.tid, st = T.tstate[tid] || {};
    if (!st.autoFill || fillBusy || !D.t || D.t.test !== true || !D.isTD || D.t.status !== 'started' || T.jobs.active()) return;
    const r = T.data.currentRound(); if (!r || String(r.status) === 'pending') return;   // unpublished rounds can't take results
    // once per round - and again when Matchplay adds a tiebreaker game to it
    const tried = new Set(st.fillTbTried || []);
    const tbOpen = D.games.some(g => g.roundId === r.roundId && g.set === 9999 && !T.timing.isDone(g) && !tried.has(g.gameId));
    if (st.fillDoneRound === r.roundId && !tbOpen) return;
    const gs = D.games.filter(g => g.roundId === r.roundId && !g.bye);
    if (!gs.length || gs.some(g => g.arenaId == null && g.set !== 9999)) return;   // wait until every game has its arena / bank (tiebreakers get one when filled)
    if (!gs.some(g => !T.timing.isDone(g))) return;
    if (!(await lock(tid + ':fill'))) return;
    fillBusy = true;
    try {
      const tbIds = D.games.filter(g => g.roundId === r.roundId && g.set === 9999).map(g => g.gameId);
      await T.saveT(tid, { fillDoneRound: r.roundId, fillTbTried: [...new Set([...(st.fillTbTried || []), ...tbIds])].slice(-50) });
      await T.jobs.start(`Random results for ${r.name || 'this round'}`, [{ tid, page: 'matches', op: 'fillResults', args: { tid, roundId: r.roundId }, label: 'Entering random results' }]);
    } catch (e) { T.panel.say('Random results: ' + (e.message || e), 'err'); }
    finally { fillBusy = false; }
  }

  // ---------- automatic banks each round (Banks tab switch, default off) ----------
  // "Rebuild banks every round" (Banks tab) when the round was started by hand: new banks, then assign them
  let banksBusy = false;
  async function autoBanks() {
    const D = T.data.D, tid = D.tid, st = T.tstate[tid] || {};
    if (!st.autoBanks || isFinals(D) || banksBusy || !D.t || !D.isTD || D.t.status !== 'started' || !/bank/i.test(D.t.arenaAssignment || '') || T.jobs.active()) return;
    const ctx = T.bankplan.context(D);
    if (!ctx.round || !ctx.groups.length || st.banksDoneRound === ctx.round.roundId) return;
    if (!(await lock(tid + ':banks'))) return;
    banksBusy = true;
    try {
      await T.saveT(tid, { banksDoneRound: ctx.round.roundId });   // once per round, even if the TD stops the task
      const steps = [{ tid, page: 'banks', op: 'rebuildBanks', args: { tid }, label: 'Rebuilding banks' }];
      if (st.autoAssign) steps.push({ tid, page: 'matches', op: 'assignRound', args: { tid }, label: 'Assigning a bank to each group' });
      await T.jobs.start(`Rebuild banks for ${ctx.round.name}`, steps);
    } catch (e) { T.panel.say('Rebuild banks: ' + (e.message || e), 'err'); }
    finally { banksBusy = false; }
  }

  // ---------- opened by the background watcher (minimized window, no tab of this tournament was open) ----------
  // Lets the automatic options do their work here, then reports back so the window can close.
  function bgRunner() {
    let on = false;
    try { if (location.hash === '#tdp-bg') sessionStorage.setItem('tdp-bg', '1'); on = sessionStorage.getItem('tdp-bg') === '1'; } catch (e) { /* no */ }
    if (!on || !(T.hasChrome && chrome.runtime && chrome.runtime.sendMessage)) return;   // eslint-disable-line no-undef
    const t0 = Date.now(), titles = [];
    let lastDone = 0, seen = null, sent = false;
    const send = (ok, text) => { if (sent) return; sent = true; try { sessionStorage.removeItem('tdp-bg'); } catch (e) { /* */ } chrome.runtime.sendMessage({ type: 'tdp-bg-done', tid: T.routeTid(), ok, text }); };   // eslint-disable-line no-undef
    const iv = setInterval(() => {
      const j = T.jobs.get();
      if (j && j.startedAt >= t0 && j.startedAt !== seen) { seen = j.startedAt; titles.push(j.title); }
      if (j && j.startedAt >= t0 && j.error) { clearInterval(iv); return send(false, `${j.title}: ${j.error}`); }
      if (j && j.startedAt >= t0 && j.done) lastDone = Math.max(lastDone, j.doneAt || Date.now());
      if (T.jobs.active()) return;
      // done: nothing new started for 30 s after the last task (auto close/start, then banks, can follow each other)
      if (lastDone && Date.now() - lastDone > 30000) { clearInterval(iv); return send(true, titles.join(' · ') + ' - done.'); }
      if (!titles.length && Date.now() - t0 > 3 * 60e3) { clearInterval(iv); return send(true, 'nothing needed doing after all.'); }
    }, 5000);
  }
})();
