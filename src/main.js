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

  // the on/off switch (toolbar button): off = nothing on Matchplay's pages, no automatic options (a task already
  // running finishes, so Matchplay isn't left half-changed)
  const off = () => !!T.settings.off;
  function teardown() {
    T.panel.unmount(); T.data.stop();
    document.querySelectorAll('[id^="tdp-"]').forEach(e => { if (!/^tdp-(worker|busy-card|cover|host)/.test(e.id)) e.remove(); });
    document.querySelectorAll('[data-tdp]').forEach(e => { if (e.closest('[id^="tdp-"]')) return; if (e.tagName === 'OPTION' || e.dataset.tdp === 'note' || e.dataset.tdpPlays || e.id === 'tdp-smart-hint' || e.dataset.tdp === 'timer') e.remove(); });
  }

  T.busy.render();   // mid-task reload: cover the page straight away
  if (!off()) bgRunner();
  T.jobs.afterLoad();

  // ---------- route watching (Matchplay is a single-page app) ----------
  let lastPath = null;
  async function onRoute() {
    if (off()) { lastPath = null; return; }
    if (location.pathname === lastPath || T.sync.hopping()) return;   // (a soft refresh hops away and back - not a new page)
    const prevTid = lastPath ? Number((lastPath.match(/^\/tournaments\/(\d+)/) || [])[1]) : null;
    lastPath = location.pathname;
    if (prevTid && prevTid === T.routeTid()) { T.data.refresh(true); return; }   // another tab of the same tournament: fresh details
    const tid = T.routeTid();
    if (!tid) { T.panel.unmount(); T.data.setTournament(null); T.deltest.render(); T.jobs.resume(); return; }   // (a task can continue from any page)
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
    if (off()) { if (T.jobs.get()) T.busy.render(); return; }
    onRoute();
    T.flag.swap();
    if (T.data.D.t) { T.inpage.render(); T.embed.render(); T.panel.render(); }
    T.deltest.render();   // (Organized page: no tournament open)
    T.smart.decorate();   // Start next round window: our "Any category (game time)" choice
    if (T.jobs.get()) T.busy.render();
  };
  new MutationObserver(ms => {
    if (ms.every(m => m.target.closest && m.target.closest('[data-tdp]'))) return;   // only our own timers ticking
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1 || (n.id || '').startsWith('tdp-')) continue;
      const tx = n.textContent || ''; if (tx.length > 200) continue;   // toasts are short
      if (/(Tournament|Round) (started|completed|published)|Round created/i.test(tx)) { clearTimeout(toastTimer); toastTimer = setTimeout(() => T.data.refresh(true), 800); }
    }
    if (!drawTimer) drawTimer = setTimeout(draw, 60);
  }).observe(document.documentElement, { childList: true, subtree: true });

  T.data.on(D => {
    if (off()) return;
    if (D.isTD === false && T.settings.token) { T.panel.unmount(); return; }   // not your tournament: stay out of the way
    T.panel.mount(); T.panel.render();
    T.embed.render(); T.inpage.render();
    autoTick().then(autoAssign).then(autoFill).then(() => T.smart.downCheck());
  });
  T.jobs.on(() => { if (off()) { T.busy.render(); return; } T.panel.render(); T.embed.render(); T.busy.render(); T.inpage.render(); T.deltest.render(); });
  // Matchplay doesn't push changes: when the API shows something new (a score from a phone, a new round…),
  // Matchplay's page fetches again in place - unless the TD is busy with it
  T.data.onChange(() => { if (!off()) T.sync.auto(); });
  // a setting changed (here or in another tab): redraw everything that shows settings
  let sharedTimer = null;
  let lastToken = T.settings.token, wasOff = off();
  T.onShared(() => {
    if (off() !== wasOff) { wasOff = off(); if (wasOff) { teardown(); return; } lastPath = null; onRoute(); draw(); return; }
    if (off()) return;
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
    const total = D.t.roundCount || D.t.duration || 0, last = !!total && D.rounds.length >= total;
    // the set number of rounds is done: nothing more to do (the TD completes the tournament on the Overview)
    if (r && String(r.status) === 'completed' && last) return state(`${r.name || 'Round ' + total} of ${total} done. Complete the tournament on the Overview when you're ready`);
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
      const go = await T.panel.showCountdown(`All games approved in ${r.name}. Closing the round${last ? '' : ' and starting the next one'} in`, 10);
      if (!go || !(T.tstate[tid] || {}).auto) return state('cancelled - will check again');
      const steps = [{ tid, page: 'matches', op: 'closeRound', args: { tid, roundId: r.roundId, name: r.name }, label: `Closing ${r.name}` }];
      const stt = T.tstate[tid] || {}, banksOn = /bank/i.test(D.t.arenaAssignment || '');
      const smart = stt.smartArenas && !isFinals(D), assign = banksOn && stt.autoAssign && !smart;
      if (!last && smart) {
        // "Any category (game time)": start without drawing arenas, set every game's arena, then publish
        steps.push({ tid, page: 'matches', op: 'startNextRound', args: { publish: false, category: '-1' }, label: 'Starting the next round (not published yet)' });
        steps.push({ tid, page: 'matches', op: 'smartPlan', args: { tid, publish: true }, label: 'Working out the arenas by game time' });
      } else if (!last) {
        // Automatic assign (Matches tab): the round starts unpublished, gets its banks, then goes live
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
    // rounds started with "Any category (game time)" get their arenas from that instead
    if (!st.autoAssign || (st.smartArenas && !isFinals(D)) || assignBusy || !D.t || !D.isTD || D.t.status !== 'started' || T.jobs.active()) return;
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
