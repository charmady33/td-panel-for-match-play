// Multi-step jobs that click through Matchplay's UI, possibly across pages/tournaments.
// A job survives page reloads (saved in storage) and resumes when its next page is open.
// A job belongs to the tab that started it ("owner"). It runs in that tab's hidden worker frame (worker.js), so the
// page doesn't move; if the frame can't run it, the tab runs it itself behind a frozen copy of the screen (busy.js).
// Other tabs of the tournament just show a banner. When it's done, the owner tab shows the updated page.
var TDP = window.TDP || (window.TDP = {});

TDP.jobs = (() => {
  const T = TDP;
  let job = null, running = false;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(job); } catch (e) { /* ignore */ } });
  const save = async () => { if (job && runsHereNow()) job.beat = Date.now(); await T.store.set('job', job); emit(); };
  const runsHereNow = () => running;   // the side running the steps keeps the heartbeat
  // a short note of what the running step is doing right now (shown in the progress card and Details)
  async function note(text) { if (!job) return; job.sub = { done: 0, total: 0, text }; job.log.push('  · ' + text); job.log = job.log.slice(-60); await save(); }
  const active = () => !!(job && !job.done && !job.error);
  const mine = () => !!(job && job.owner === T.tabId);
  // where the steps run: the worker frame, or the owner tab itself (backup)
  const runsHere = () => mine() && ((job.runner === 'frame') === !!T.isFrame);
  const ORIGIN = 'https://app.matchplay.events';
  const STEP_LIMIT = 150000;
  const stepUrl = s => `${location.origin || ORIGIN}/tournaments/${s.tid}/${s.page === 'overview' ? '' : s.page}`;
  const canFrame = () => !T.isFrame && !T.settings.noWorkerFrame && !!T.worker;

  // progress inside one step (each game, bank, group…): job.sub = { done, total, text }; saved at most ~4x a second
  let lastSub = 0;
  function counter(total) {
    const c = { done: 0, total: Math.max(1, total) };
    const put = text => { if (!job) return; job.sub = { done: Math.min(c.done, c.total), total: c.total, text }; const now = Date.now(); if (now - lastSub > 250 || c.done >= c.total) { lastSub = now; save(); } else emit(); };
    c.tick = text => { c.done++; put(text); };
    c.to = (k, text) => { c.done = Math.max(c.done, k); put(text); };
    return c;
  }

  // keep other tabs' view of the job current; a task left from 0.6.0's background tab shows as stopped
  async function init() {
    const j = await T.store.get('job', null);
    if (j && j.worker && !j.done && !j.error) { j.error = 'Interrupted (it was running in the old background tab). Retry to run it here.'; j.worker = false; await T.store.set('job', j); }
    job = j;   // known straight away (so a mid-task reload stays covered)
    const onNew = nv => {
      if (running) { if (!nv || !job || nv.startedAt !== job.startedAt) { job = nv; emit(); } return; }   // ignore echoes of our own saves
      job = nv; emit(); watchFrame();
    };
    if (T.hasChrome) chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.job) onNew(ch.job.newValue || null); });   // eslint-disable-line no-undef
    else addEventListener('storage', e => { if (e.key === 'tdp:job') { try { onNew(JSON.parse(e.newValue)); } catch (x) { onNew(null); } } });   // test pages
    if (!T.isFrame) setInterval(watchFrame, 4000);
  }

  // the owner tab keeps an eye on its worker frame: finish up when it's done, take over if it stops responding
  let finishing = false;
  async function watchFrame() {
    if (T.isFrame || !job || !mine() || job.done || job.error) return;
    // this tab runs the steps itself: if nothing at all has happened for a minute, stop and say where it was
    if (job.runner === 'top') {
      if (!running && job.beat && Date.now() - job.beat > 60000) { job.error = `Nothing happened for a minute (${(job.sub && job.sub.text) || (job.steps[job.i] || {}).label || 'starting'}).`; await save(); }
      return;
    }
    if (job.stepsDone) { if (!finishing) { finishing = true; try { await finish(); } finally { finishing = false; } } return; }
    if (!T.worker.isOpen()) { T.worker.open(stepUrl(job.steps[Math.min(job.i, job.steps.length - 1)])); job.beat = Date.now(); await save(); return; }   // this tab reloaded mid-task
    if (job.beat && Date.now() - job.beat > 45000) {   // the frame is stuck: run it here instead, behind the frozen screen
      T.worker.close(); job.runner = 'top'; job.log.push('Worker frame not responding - finishing in this tab.'); T.busy.freeze(); await save(); run();
    }
  }

  // step: { tid, page: 'players'|'banks'|'matches'|..., op, args, label }
  // opts.after = { what, ...data }: when the task is done, the window that started it opens again (handlers below)
  const afterHandlers = {};
  async function start(title, steps, opts = {}) {
    if (job && !job.done && !job.error) throw new Error('Another task is still running.');
    const frame = canFrame();
    if (!frame) T.busy.freeze();   // backup mode: snapshot what's on screen before anything moves
    job = { title, steps, i: 0, log: [], startedAt: Date.now(), owner: T.tabId, runner: frame ? 'frame' : 'top', beat: Date.now(), returnTo: location.pathname, scroll: [scrollX, scrollY, (document.querySelector('main') || {}).scrollTop || 0], after: opts.after || null };
    await save();
    if (frame) T.worker.open(stepUrl(steps[0])); else run();
  }
  async function cancel() { job = null; await T.store.del('job'); emit(); if (T.worker && !T.isFrame) T.worker.close(); }
  async function resume() {
    job = await T.store.get('job', null); emit();
    if (active() && runsHere()) run();
    else watchFrame();
  }

  const ops = {
    async labels(a) { const P = counter(a.groups.length); for (const g of a.groups) { P.to(P.done, `${g.labels.join(', ') || 'no label'} · ${g.ids.length} player${g.ids.length === 1 ? '' : 's'}`); await T.mp.setLabels(g.ids, g.labels, g.color || a.color); P.tick(`${g.ids.length} player${g.ids.length === 1 ? '' : 's'} labelled`); } },
    async addPlayers(a) { await T.mp.addFromQualifying(a.ids); },
    async deactivate(a) { await T.mp.bulk(a.ids, 'Deactivate'); },
    async activate(a) { await T.mp.bulk(a.ids, 'Activate'); },
    async seeds(a) { await T.mp.setSeeds(a.names); },
    async readRanks(a) {
      const byName = await T.mp.readIfpaRanks(), ranks = {};
      const t = await T.data.loadTournament(a.tid, 0);
      for (const p of t.players || []) if (byName[p.name] !== undefined) ranks[p.playerId] = byName[p.name];
      await T.loadT(a.tid); await T.saveT(a.tid, { ranks, ranksAt: Date.now() });
      return `${Object.values(ranks).filter(Boolean).length} ranked players`;
    },
    // banks: each bank is worth (games added + removed + play order); the bar moves with every one of them
    async createBanks(a) { await eachBank(a.banks, (b, tick) => T.mp.createBank(b.name, b.arenas, tick), b => b.arenas.length + 2); },
    async bankArenas(a) { await eachBank(a.banks, (b, tick) => T.mp.setBankArenas(b.name, b.arenas, tick), b => 2 * b.arenas.length + 1); },
    async assignBanks(a) {
      // check Matchplay right before: a group that already has a bank/arena is skipped, not an error
      const fresh = a.roundId ? await T.api.all(`/tournaments/${a.tid}/games?round=${a.roundId}`, 0) : [];
      const has = new Set(fresh.filter(g => g.bankId != null || g.arenaId != null).map(g => g.set + 1));
      const P = counter(a.pairs.length), skipped = [];
      for (const [i, x] of a.pairs.entries()) {
        if (has.has(x.group)) { skipped.push(`Group ${x.group}`); P.tick(`Group ${x.group} already had a bank`); continue; }
        P.to(i, `Group ${x.group} → ${x.bank} (${i + 1} of ${a.pairs.length})`); await T.mp.assignBank(x.group, x.bank); P.tick(`Group ${x.group} → ${x.bank} done`);
      }
      await T.saveT(a.tid, { banksDoneRound: a.roundId, assignDoneRound: a.roundId });
      return skipped.length ? `${skipped.join(', ')} already had a bank (skipped)` : '';
    },
    async noop() { /* just brings you back to a page */ },
    async resolveTie(a) { await T.mp.resolveTie(a.from, a.names); if (a.key) await T.ties.markApplied(a.qid, a.key); },
    // TEST tournaments only: a random finishing order for every open game of the round that has its arena
    // a tiebreaker game Matchplay added (bracket finals): play it on the game the TD picked
    async tiebreakerArena(a) { await T.mp.setGameArena(a.names, a.arena); return `${a.arena} assigned to the tiebreaker`; },
    // a test tournament of yours - checked again right before - deleted with Matchplay's own button
    async deleteTest(a) {
      // each tournament's outcome goes in job.del for the result card on the Organized page
      const put = async (status, why) => { job.del = [...(job.del || []).filter(x => x.tid !== a.tid), { tid: a.tid, name: a.name, status, why: why || '' }]; await save(); return `${a.name}: ${status}${why ? ' - ' + why : ''}`; };
      await note('Reading the tournament');
      const me = T.data.D.me || T.data.unwrap(await T.api.get('/users/profile', 3600e3));
      let t = null;
      try { t = await T.data.loadTournament(a.tid, 0); }
      catch (e) { return job.delTry === a.tid ? put('deleted') : put('skipped', 'not found (already deleted?)'); }   // (the page reloaded right after Matchplay deleted it)
      if (!t || t.test !== true) return put('skipped', 'not a test tournament');
      if (!me || t.organizerId !== me.userId) return put('skipped', "you're not the organizer");
      if (!/\bTest\b/.test(T.txt(document.querySelector('main')))) return put('skipped', "the page doesn't show it as Test");
      job.delTry = a.tid; await save();
      try { await T.mp.deleteTournament(t.name, { note }); }
      catch (e) { return put('failed', e.message || String(e)); }
      // make sure it's really gone
      await note('Checking Matchplay deleted it');
      let gone = false;
      for (let k = 0; k < 6 && !gone; k++) { try { await T.api.get(`/tournaments/${a.tid}`, 0, true); await T.sleep(800); } catch (e) { gone = true; } }
      if (!gone) return put('failed', 'Matchplay still lists it');
      await T.store.del('t:' + a.tid); await T.store.del('cache:' + a.tid);
      return put('deleted');
    },
    async fillResults(a) {
      const t = await T.data.loadTournament(a.tid, 0);
      if (!t || t.test !== true) throw new Error('Random results are only for Test tournaments.');
      const pm = T.data.playerMap(t), am = T.data.arenaMap(t);
      const games = (await T.api.all(`/tournaments/${a.tid}/games?round=${a.roundId}`, 0)).filter(g => !g.bye && !T.timing.isDone(g));
      // Matchplay's tiebreaker games (set 9999) come without an arena: give each a random one first
      const arenas = (t.arenas || []).filter(x => !x.tournamentArena || x.tournamentArena.status !== 'inactive');
      for (const g of games.filter(x => x.set === 9999 && x.arenaId == null && arenas.length)) {
        const names = (g.playerIds || []).map(id => (pm[id] || {}).name).filter(Boolean), ar = arenas[Math.floor(Math.random() * arenas.length)];
        await T.mp.setGameArena(names, ar.name); g.arenaId = ar.arenaId;
      }
      const ready = games.filter(g => g.arenaId != null).sort((x, y) => (x.set - y.set) || (x.index - y.index));
      const P = counter(ready.length);
      for (const [i, g] of ready.entries()) {
        const names = (g.playerIds || []).map(id => (pm[id] || {}).name).filter(Boolean);
        const order = [...names].sort(() => Math.random() - 0.5);
        const what = g.set === 9999 ? 'Tiebreaker' : `Group ${g.set + 1} · Game ${g.index + 1}`;
        P.to(i, `${what} (${(am[g.arenaId] || {}).name || 'arena'})`);
        await T.mp.enterResults(names, (am[g.arenaId] || {}).name || '', order);
        P.tick(`${what}: ${order[0]} won`);
      }
      const tried = [...new Set([...((T.tstate[a.tid] || {}).fillTbTried || []), ...games.filter(g => g.set === 9999).map(g => g.gameId)])].slice(-50);
      await T.saveT(a.tid, { fillDoneRound: a.roundId, fillTbTried: tried });
      const skipped = games.length - ready.length;
      return `${ready.length} game${ready.length === 1 ? '' : 's'} filled${skipped ? `, ${skipped} skipped (no arena yet - assign banks first)` : ''}`;
    },
    async copyArenas(a) { const P = counter(a.names.length); await T.mp.addArenas(a.names, text => P.tick(text)); },
    async closeRound() { await T.mp.closeRound(); },
    async startNextRound(a) { await T.mp.startNextRound({ publish: !(a && a.publish === false), category: a && a.category }); await T.data.refresh(true); },
    async publishRound(a) {
      if (a && a.ifPending && !(await T.waitFor(() => T.findBtn(document.querySelector('main') || document, /^Publish$/), 4000))) return 'already published';
      await T.mp.publishRound();
    },
    // "Any category (game time)": work out every game's arena for the round just started, then add the steps that
    // set them (chunks of 8 games) and publish it
    async smartPlan(a) {
      let round = null, games = [];
      for (let k = 0; k < 15 && !round; k++) {   // the new round can take a moment to show in the API
        await T.data.refresh(true);
        const D = T.data.D, r = D.rounds[D.rounds.length - 1];
        if (r && String(r.status) !== 'completed') { games = await T.api.all(`/tournaments/${a.tid}/games?round=${r.roundId}`, 0); round = T.smart.roundToFill(D, games) ? r : null; }
        if (!round) await T.sleep(1000);
      }
      if (!round) return 'every game already has an arena';
      await note('Planning games by game time');
      const { res } = await T.smart.make(T.data.D, games, round);
      await T.saveT(a.tid, { smartLast: { roundId: round.roundId, at: Date.now(), notes: res.notes.slice(0, 20), mins: Math.round(Math.max(0, ...res.ends) / 60) } });
      const steps = T.smart.fillSteps(a.tid, round.roundId, res.assign, a.publish);
      job.steps.splice(job.i + 1, 0, ...steps); await save();
      return `${res.assign.filter(x => !x.fixed).length} games planned · about ${Math.round(Math.max(0, ...res.ends) / 60)} min${res.notes.length ? ' · ' + res.notes.slice(0, 3).join('; ') : ''}`;
    },
    async smartAssign(a) {
      const fresh = await T.api.all(`/tournaments/${a.tid}/games?round=${a.roundId}`, 0), has = new Set(fresh.filter(g => g.arenaId != null).map(g => g.gameId));
      const P = counter(a.items.length);
      for (const [i, x] of a.items.entries()) {
        const what = `Group ${x.group} · Game ${x.index + 1} → ${x.name}`;
        if (has.has(x.gameId) && !a.change) { P.tick(`${what} (already set)`); continue; }
        P.to(i, what); await T.mp.setArenaById(x.gameId, x.arenaId, x.name); P.tick(what);
      }
    },
    // a machine went down: its banks get a replacement (only those banks), then waiting games move to it
    async downFix(a) {
      await T.data.refresh(true);
      const D = T.data.D, st = T.tstate[a.tid] || {}, extra = await T.bankplan.extras(D);
      const changes = T.smart.downPlan(D, T.bankplan.estimates(D, st, extra), T.bankplan.estimates(D, st, extra, true));
      const ok = changes.filter(c => !c.none);
      await eachBank(ok.map(c => ({ name: c.bank, arenas: c.arenas })), (b, tick) => T.mp.setBankArenas(b.name, b.arenas, tick), b => 2 * b.arenas.length + 1);
      const swaps = [...(st.downSwaps || []).filter(s => !ok.some(c => c.bank === s.bank && c.downId === s.downId)), ...ok.map(c => ({ bank: c.bank, downId: c.downId, down: c.down, replId: c.replId, repl: c.repl, at: Date.now() }))].slice(-40);
      await T.saveT(a.tid, { downSwaps: swaps });
      const r = T.data.currentRound();
      if (r) {
        const games = await T.api.all(`/tournaments/${a.tid}/games?round=${r.roundId}`, 0);
        const move = T.smart.downGames(D, games, ok);
        if (move.length) job.steps.splice(job.i + 1, 0, { tid: a.tid, page: 'matches', op: 'smartAssign', args: { tid: a.tid, roundId: r.roundId, items: move, change: true }, label: `Moving ${move.length} waiting game${move.length === 1 ? '' : 's'} off the down machine` });
        await save();
      }
      const by = {}; ok.forEach(c => { (by[c.down] = by[c.down] || []).push(`${c.repl} in ${c.bank}`); });
      const text = Object.entries(by).map(([d, l]) => `${d} is down: replaced by ${l.join(', ')}`).join(' · ');
      const none = changes.filter(c => c.none).map(c => `${c.down} in ${c.bank}: no free game to use`);
      if (text || none.length) T.panel.say([text, ...none].filter(Boolean).join(' · '), none.length ? 'err' : 'ok');
      return [text, ...none].filter(Boolean).join(' · ') || 'nothing to replace';
    },
    // the machine is back: put it back where it was in its banks
    async downRestore(a) {
      await T.data.refresh(true);
      const D = T.data.D, st = T.tstate[a.tid] || {}, am = T.data.arenaMap(D.t);
      const mine = (st.downSwaps || []).filter(s => s.downId === a.downId);
      const banks = [];
      for (const s of mine) {
        const b = (D.t.banks || []).find(x => x.name === s.bank && x.status !== 'inactive'); if (!b) continue;
        const ids = b.arenaIds || []; if (!ids.includes(s.replId) || ids.includes(s.downId)) continue;
        banks.push({ name: b.name, arenas: ids.map(id => (am[id === s.replId ? s.downId : id] || {}).name).filter(Boolean) });
      }
      await eachBank(banks, (b, tick) => T.mp.setBankArenas(b.name, b.arenas, tick), b => 2 * b.arenas.length + 1);
      await T.saveT(a.tid, { downSwaps: (st.downSwaps || []).filter(s => s.downId !== a.downId) });
      return banks.length ? `${mine[0].down} back in ${banks.map(b => b.name).join(', ')}` : 'nothing to put back';
    },
    // the newest round's waiting groups get banks (same choice as the Assign banks button's best option)
    async assignRound(a) {
      await T.data.refresh(true);
      const o = T.bankplan.assignOptions(T.data.D);
      if (!o.list.length) return o.ctx.groups.length ? 'no free banks to assign' : 'every group already has a bank';
      return ops.assignBanks({ tid: a.tid, roundId: o.ctx.round.roundId, pairs: o.list[0].pairs.map(p => ({ group: p.group, bank: p.bank })) });
    },
  };

  async function eachBank(banks, fn, units) {
    const sizes = banks.map(units), P = counter(sizes.reduce((x, y) => x + y, 0));
    let base = 0;
    for (const [i, b] of banks.entries()) {
      const label = `${b.name} (bank ${i + 1} of ${banks.length})`;
      P.to(base, label);
      await fn(b, text => P.tick(`${label} · ${text}`));
      base += sizes[i]; P.to(base, `${label} · done`);
    }
  }

  async function run() {
    if (running || !job || !runsHere()) return;
    running = true;
    try {
      while (job && job.i < job.steps.length) {
        const live = await T.store.get('job', null);   // stopped from another tab?
        if (!live || live.startedAt !== job.startedAt) { job = live; break; }
        const s = job.steps[job.i];
        const here = T.routeTid() === s.tid && (T.routePage() === s.page || (s.page === 'overview' && T.routePage() === 'overview'));
        if (!here) {
          // same tournament: use Matchplay's tab links (keeps the page loaded); otherwise load the page
          if (T.routeTid() === s.tid) await T.mp.goTab(s.tid, s.page);
          else {
            // another tournament: switch inside Matchplay's app (no page load); a full load only if that doesn't take
            job.log.push(`Opening ${s.page} of tournament ${s.tid}…`); await save();
            const url = `/tournaments/${s.tid}/${s.page === 'overview' ? '' : s.page}`;
            let ok = false;
            if (location.host === 'app.matchplay.events' && document.getElementById('app')) {   // inside Matchplay's app (not a blank frame)
              try { history.pushState(history.state, '', url); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); ok = true; } catch (e) { ok = false; }
              if (ok) ok = !!(await T.waitFor(() => T.routeTid() === s.tid && document.querySelector(`main a[href^="/tournaments/${s.tid}"]`), 6000));
            }
            if (!ok) { location.assign(url); return; }
            await T.data.useTournament(s.tid);
          }
          if (T.routePage() !== s.page) { location.assign(`/tournaments/${s.tid}/${s.page}`); return; }
        }
        // page ready: Matchplay has drawn the tab's content
        await T.waitFor(() => { const m = document.querySelector('main'); return m && T.txt(m).length > 80; }, 8000);
        await T.sleep(250);
        job.log.push(s.label || s.op); await save();
        job.sub = null;
        // every step has a time limit: a step that hangs stops with where it was, instead of spinning forever
        let timer = null;
        const limit = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`Timed out: ${s.label || s.op}${job && job.sub && job.sub.text ? ` (at: ${job.sub.text})` : ''}`)), STEP_LIMIT); });
        const beat = setInterval(() => { if (job) { job.beat = Date.now(); T.store.set('job', job); } }, 5000);   // alive, even during long waits
        let res;
        try { res = await Promise.race([ops[s.op](s.args || {}), limit]); } finally { clearTimeout(timer); clearInterval(beat); }
        if (res) job.log.push('  ' + res);
        job.i++; job.sub = null; await save();
      }
      if (job && job.i >= job.steps.length && T.isFrame) { job.stepsDone = true; await save(); return; }   // the owner tab finishes up
      if (job && job.i >= job.steps.length) {
        // back to the page the TD was on
        if (job.returnTo && location.pathname !== job.returnTo) {
          const m = job.returnTo.match(/^\/tournaments\/(\d+)\/?([^/?#]*)/);
          if (m && T.routeTid() === +m[1]) { try { await T.mp.goTab(+m[1], m[2] || 'overview'); } catch (e) { /* fall through */ } }
          if (location.pathname !== job.returnTo) { await save(); location.assign(job.returnTo); return; }
        }
        // show what changed: Matchplay fetches the tournament again in place (no page reload)
        const changedHere = job.steps.some(st => st.tid === T.routeTid());
        if (changedHere && !job.reloaded) { job.reloaded = true; await save(); await T.sync.soft(); }
        await T.waitFor(() => { const m = document.querySelector('main'); return m && T.txt(m).length > 80; }, 8000);
        await T.sleep(250);
        if (job.scroll) { scrollTo(job.scroll[0], job.scroll[1]); const m = document.querySelector('main'); if (m && job.scroll[2]) m.scrollTop = job.scroll[2]; }
        job.done = true; job.doneAt = Date.now(); job.log.push('Done.'); await save();
        T.data.refresh(true);
        runAfter();
      }
    } catch (e) {
      if (job) { job.error = e.message || String(e); await save(); }
    } finally { running = false; }
  }
  function runAfter() {
    if (job && job.after && afterHandlers[job.after.what]) { const a = job.after; setTimeout(() => { try { afterHandlers[a.what](a); } catch (e) { T.warn('after', e); } }, 400); }
  }
  // the worker frame finished every step: Matchplay's page here fetches the tournament again, in place (no reload)
  async function finish() {
    T.worker.close();
    const changedHere = job.steps.some(st => st.tid === T.routeTid());   // Matchplay keeps one copy of the tournament for all its tabs
    job.done = true; job.doneAt = Date.now(); job.log.push('Done.');
    await save(); T.data.refresh(true);
    if (changedHere) await T.sync.soft();
    runAfter();
  }
  async function retry() {
    if (!job) return;
    job.error = null; job.owner = T.tabId; job.beat = Date.now();   // retrying from another tab takes the task over
    if (canFrame()) { job.runner = 'frame'; await save(); T.worker.open(stepUrl(job.steps[Math.min(job.i, job.steps.length - 1)])); }
    else { job.runner = 'top'; T.busy.freeze(); await save(); run(); }
  }
  // after a reload that finished a task: the window that started it opens again
  async function afterLoad() {
    if (job && job.done && job.afterOnLoad && mine() && !T.isFrame) { job.afterOnLoad = false; await save(); runAfter(); }
  }

  // 0..1 across the whole task (steps + progress inside the current step)
  const fraction = j => { j = j || job; if (!j) return 0; const n = j.steps.length, sub = j.sub && j.sub.total ? j.sub.done / j.sub.total : 0; return Math.min(1, (Math.min(j.i, n) + (j.i < n ? sub : 0)) / n); };

  return { afterLoad, runsHere, afterHandlers, init, start, cancel, resume, retry, active, mine, fraction, counter, running: () => running, get: () => job, on: f => listeners.add(f) };
})();
