// Multi-step jobs that click through Matchplay's UI, possibly across pages/tournaments.
// A job survives page reloads (saved in storage) and resumes when its next page is open.
// A job runs in the tab that started it ("owner"), behind a frozen copy of the screen (busy.js); other tabs of
// the tournament just show a banner. When it's done, the owner tab goes back to the page it started on.
var TDP = window.TDP || (window.TDP = {});

TDP.jobs = (() => {
  const T = TDP;
  let job = null, running = false;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(job); } catch (e) { /* ignore */ } });
  const save = async () => { await T.store.set('job', job); emit(); };
  const active = () => !!(job && !job.done && !job.error);
  const mine = () => !!(job && job.owner === T.tabId);

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
    if (!T.hasChrome) return;
    chrome.storage.onChanged.addListener((ch, area) => {   // eslint-disable-line no-undef
      if (area !== 'local' || !ch.job) return;
      const nv = ch.job.newValue || null;
      if (running) { if (!nv || !job || nv.startedAt !== job.startedAt) { job = nv; emit(); } return; }   // ignore echoes of our own saves
      job = nv; emit();
    });
  }

  // step: { tid, page: 'players'|'banks'|'matches'|..., op, args, label }
  // opts.after = { what, ...data }: when the task is done, the window that started it opens again (handlers below)
  const afterHandlers = {};
  async function start(title, steps, opts = {}) {
    if (job && !job.done && !job.error) throw new Error('Another task is still running.');
    T.busy.freeze();   // snapshot what's on screen before anything moves
    job = { title, steps, i: 0, log: [], startedAt: Date.now(), owner: T.tabId, returnTo: location.pathname, scroll: [scrollX, scrollY, (document.querySelector('main') || {}).scrollTop || 0], after: opts.after || null };
    await save();
    run();
  }
  async function cancel() { job = null; await T.store.del('job'); emit(); }
  async function resume() {
    job = await T.store.get('job', null); emit();
    if (active() && mine()) run();
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
    async fillResults(a) {
      const t = await T.data.loadTournament(a.tid, 0);
      if (!t || t.test !== true) throw new Error('Random results are only for Test tournaments.');
      const pm = T.data.playerMap(t), am = T.data.arenaMap(t);
      const games = (await T.api.all(`/tournaments/${a.tid}/games?round=${a.roundId}`, 0)).filter(g => !g.bye && g.set !== 9999 && !T.timing.isDone(g));
      const ready = games.filter(g => g.arenaId != null).sort((x, y) => (x.set - y.set) || (x.index - y.index));
      const P = counter(ready.length);
      for (const [i, g] of ready.entries()) {
        const names = (g.playerIds || []).map(id => (pm[id] || {}).name).filter(Boolean);
        const order = [...names].sort(() => Math.random() - 0.5);
        P.to(i, `Group ${g.set + 1} · Game ${g.index + 1} (${(am[g.arenaId] || {}).name || 'arena'})`);
        await T.mp.enterResults(names, (am[g.arenaId] || {}).name || '', order);
        P.tick(`Group ${g.set + 1} · Game ${g.index + 1}: ${order[0]} won`);
      }
      await T.saveT(a.tid, { fillDoneRound: a.roundId });
      const skipped = games.length - ready.length;
      return `${ready.length} game${ready.length === 1 ? '' : 's'} filled${skipped ? `, ${skipped} skipped (no arena yet - assign banks first)` : ''}`;
    },
    async copyArenas(a) { const P = counter(a.names.length); await T.mp.addArenas(a.names, text => P.tick(text)); },
    async closeRound() { await T.mp.closeRound(); },
    async startNextRound(a) { await T.mp.startNextRound({ publish: !(a && a.publish === false) }); await T.data.refresh(true); },
    async publishRound() { await T.mp.publishRound(); },
    // new game sets for the next round, written into the banks (Banks tab); worked out now, from the latest data
    async rebuildBanks(a) {
      await T.data.refresh(true);
      const D = T.data.D, st = T.tstate[a.tid] || {};
      const players = (D.t.players || []).filter(p => !p.tournamentPlayer || p.tournamentPlayer.status !== 'inactive').length;
      const n = Math.max((D.t.banks || []).filter(b => b.status !== 'inactive').length, Math.ceil(players / 4), 1);
      const plan = T.bankplan.make(D, { n, size: D.t.gamesPerRound || 3, seed: Date.now() % 1e9, exclude: st.bankExclude || [], force: st.bankForce || [], extra: await T.bankplan.extras(D) });
      await eachBank(plan.res.banks.map(b => ({ name: b.name, arenas: b.games.map(g => g.name) })), (b, tick) => T.mp.setBankArenas(b.name, b.arenas, tick), b => 2 * b.arenas.length + 1);
      return `${plan.res.banks.length} banks rebuilt`;
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
    if (running || !job) return;
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
          else { job.log.push(`Opening ${s.page} of tournament ${s.tid}…`); await save(); location.assign(`/tournaments/${s.tid}/${s.page === 'overview' ? '' : s.page}`); return; }
          if (T.routePage() !== s.page) { location.assign(`/tournaments/${s.tid}/${s.page}`); return; }
        }
        // page ready: Matchplay has drawn the tab's content
        await T.waitFor(() => { const m = document.querySelector('main'); return m && T.txt(m).length > 80; }, 8000);
        await T.sleep(250);
        job.log.push(s.label || s.op); await save();
        job.sub = null;
        const res = await ops[s.op](s.args || {});
        if (res) job.log.push('  ' + res);
        job.i++; job.sub = null; await save();
      }
      if (job && job.i >= job.steps.length) {
        // back to the page the TD was on
        if (job.returnTo && location.pathname !== job.returnTo) {
          const m = job.returnTo.match(/^\/tournaments\/(\d+)\/?([^/?#]*)/);
          if (m && T.routeTid() === +m[1]) { try { await T.mp.goTab(+m[1], m[2] || 'overview'); } catch (e) { /* fall through */ } }
          if (location.pathname !== job.returnTo) { await save(); location.assign(job.returnTo); return; }
        }
        // show what changed: Matchplay's own Refresh button where there is one, else reload this page once
        const changedHere = job.steps.some(st => st.tid === T.routeTid() && (st.page === T.routePage() || (st.page === 'overview' && T.routePage() === 'overview')));
        if (changedHere && !job.reloaded) {
          const rb = T.findBtn(document.querySelector('main') || document, /^Refresh$/);
          job.reloaded = true; await save();
          if (rb) { T.click(rb); await T.sleep(800); }
          else { location.reload(); return; }
        }
        await T.waitFor(() => { const m = document.querySelector('main'); return m && T.txt(m).length > 80; }, 8000);
        await T.sleep(250);
        if (job.scroll) { scrollTo(job.scroll[0], job.scroll[1]); const m = document.querySelector('main'); if (m && job.scroll[2]) m.scrollTop = job.scroll[2]; }
        job.done = true; job.doneAt = Date.now(); job.log.push('Done.'); await save();
        T.data.refresh(true);
        if (job.after && afterHandlers[job.after.what]) { const a = job.after; setTimeout(() => { try { afterHandlers[a.what](a); } catch (e) { T.warn('after', e); } }, 400); }
      }
    } catch (e) {
      if (job) { job.error = e.message || String(e); await save(); }
    } finally { running = false; }
  }
  async function retry() {
    if (!job) return;
    job.error = null; job.owner = T.tabId; await save();   // retrying from another tab takes the task over
    run();
  }

  // 0..1 across the whole task (steps + progress inside the current step)
  const fraction = j => { j = j || job; if (!j) return 0; const n = j.steps.length, sub = j.sub && j.sub.total ? j.sub.done / j.sub.total : 0; return Math.min(1, (Math.min(j.i, n) + (j.i < n ? sub : 0)) / n); };

  return { afterHandlers, init, start, cancel, resume, retry, active, mine, fraction, counter, running: () => running, get: () => job, on: f => listeners.add(f) };
})();
