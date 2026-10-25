// Entry point: follows Matchplay's in-app navigation, shows the panel on tournaments you run,
// resumes unfinished jobs, and runs the optional auto close/start round.
var TDP = window.TDP || (window.TDP = {});

(async () => {
  const T = TDP;
  if (window.__tdpStarted) return; window.__tdpStarted = true;
  await T.loadSettings();
  const tabId = Math.random().toString(36).slice(2);

  // ---------- route watching (Matchplay is a single-page app) ----------
  let lastPath = null;
  async function onRoute() {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    const tid = T.routeTid();
    if (!tid) { T.panel.unmount(); T.data.setTournament(null); return; }
    T.panel.mount(); T.panel.render(true);
    await T.data.setTournament(tid);
    T.embed.render();
    await T.jobs.resume();
  }
  setInterval(onRoute, 500);
  onRoute();

  T.data.on(D => {
    if (D.isTD === false && T.settings.token) { T.panel.unmount(); return; }   // not your tournament: stay out of the way
    T.panel.mount(); T.panel.render();
    T.embed.render();
    autoTick().then(autoBanks);
  });
  T.jobs.on(() => { T.panel.render(true); T.embed.render(); });

  // ---------- auto close round & start next (default off, per tournament) ----------
  let autoBusy = false;
  async function lock(tid) {
    const k = 'lock:auto:' + tid, cur = await T.store.get(k, null);
    if (cur && cur.tab !== tabId && Date.now() - cur.at < 30000) return false;
    await T.store.set(k, { tab: tabId, at: Date.now() }); return true;
  }
  const state = s => T.panel.setAutoState(s);
  async function autoTick() {
    const D = T.data.D, tid = D.tid, st = T.tstate[tid] || {};
    if (!st.auto || autoBusy || !D.t || !D.isTD) return;
    if (T.routePage() !== 'matches') return state('waiting - open this tournament\'s Matches tab');
    if (T.jobs.get() && !T.jobs.get().done && !T.jobs.get().error) return state('waiting for the running task');
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
      if (ft.length) return state('tie needs breaking first: ' + ft[0].why);
      const last = D.t.roundCount && D.rounds.length >= D.t.roundCount;
      const go = await T.panel.showCountdown(`All games approved in ${r.name}. Closing the round${last ? '' : ' and starting the next one'} in`, Math.max(3, T.settings.autoCountdown || 10));
      if (!go || !(T.tstate[tid] || {}).auto) return state('cancelled - will check again');
      if (T.routePage() !== 'matches') return state('left the Matches tab - not acting');
      await T.mp.closeRound();
      state(`closed ${r.name}`);
      await T.data.refresh(true);
      if (last) return state(`closed ${r.name} - that was the last round`);
      const btn = await T.waitFor(() => T.findBtn(document, /^Start next round$/), 8000);
      if (!btn) return state(`closed ${r.name}; no "Start next round" button (last round?)`);
      await T.mp.startNextRound();
      state(`started the next round after ${r.name}`);
      await T.data.refresh(true);
    } catch (e) { state('error: ' + (e.message || e)); }
    finally { autoBusy = false; }
  }

  // ---------- automatic banks each round (Banks tab switch, default off) ----------
  let banksBusy = false;
  async function autoBanks() {
    const D = T.data.D, tid = D.tid, st = T.tstate[tid] || {};
    if (!st.autoBanks || banksBusy || !D.t || !D.isTD || D.t.status !== 'started' || !/bank/i.test(D.t.arenaAssignment || '')) return;
    const j = T.jobs.get(); if (j && !j.done && !j.error) return;
    const ctx = T.bankplan.context(D);
    if (!ctx.round || !ctx.groups.length || st.banksDoneRound === ctx.round.roundId) return;
    if (!(await lock(tid + ':banks'))) return;
    banksBusy = true;
    try {
      const n = Math.max(st.bankN || 0, ctx.groups.length), size = st.bankSize || D.t.gamesPerRound || 3;
      const use = new Set(st.histUse || []), hist = await T.store.get('hist', {});
      const plan = T.bankplan.make(D, { n, size, seed: ctx.round.roundId, exclude: st.bankExclude || [], extra: { hist: Object.entries(hist).filter(([id]) => use.has(id)).map(([, h]) => h.arenas) } });
      await T.saveT(tid, { banksDoneRound: ctx.round.roundId });   // once per round, even if the TD stops the task
      await T.jobs.start(`Auto banks for ${ctx.round.name}`, T.bankplan.steps(D, plan));
    } catch (e) { T.panel.say('Auto banks: ' + (e.message || e), 'err'); }
    finally { banksBusy = false; }
  }
})();
