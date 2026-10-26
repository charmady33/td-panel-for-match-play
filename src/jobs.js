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
  async function start(title, steps) {
    if (job && !job.done && !job.error) throw new Error('Another task is still running.');
    T.busy.freeze();   // snapshot what's on screen before anything moves
    job = { title, steps, i: 0, log: [], startedAt: Date.now(), owner: T.tabId, returnTo: location.pathname, scroll: [scrollX, scrollY] };
    await save();
    run();
  }
  async function cancel() { job = null; await T.store.del('job'); emit(); }
  async function resume() {
    job = await T.store.get('job', null); emit();
    if (active() && mine()) run();
  }

  const ops = {
    async labels(a) { const P = counter(a.groups.length); for (const g of a.groups) { P.to(P.done, `${g.labels.join(', ') || 'no label'} · ${g.ids.length} player${g.ids.length === 1 ? '' : 's'}`); await T.mp.setLabels(g.ids, g.labels, a.color); P.tick(`${g.ids.length} player${g.ids.length === 1 ? '' : 's'} labelled`); } },
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
      const P = counter(a.pairs.length);
      for (const [i, x] of a.pairs.entries()) { P.to(i, `Group ${x.group} → ${x.bank} (${i + 1} of ${a.pairs.length})`); await T.mp.assignBank(x.group, x.bank); P.tick(`Group ${x.group} → ${x.bank} done`); }
      await T.saveT(a.tid, { banksDoneRound: a.roundId });
    },
    async noop() { /* just brings you back to a page */ },
    async resolveTie(a) { await T.mp.resolveTie(a.from, a.names); if (a.key) await T.ties.markApplied(a.qid, a.key); },
    async closeRound() { await T.mp.closeRound(); },
    async startNextRound() { await T.mp.startNextRound(); },
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
        await T.sleep(1200);
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
        await T.sleep(400);
        if (job.scroll) scrollTo(job.scroll[0], job.scroll[1]);
        job.done = true; job.doneAt = Date.now(); job.log.push('Done.'); await save();
        T.data.refresh(true);
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

  return { init, start, cancel, resume, retry, active, mine, fraction, counter, running: () => running, get: () => job, on: f => listeners.add(f) };
})();
