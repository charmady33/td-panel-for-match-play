// Multi-step jobs that click through Matchplay's UI, possibly across pages/tournaments.
// A job survives page reloads (saved in storage) and resumes when its next page is open.
var TDP = window.TDP || (window.TDP = {});

TDP.jobs = (() => {
  const T = TDP;
  let job = null, running = false;
  const listeners = new Set();
  const emit = () => listeners.forEach(f => { try { f(job); } catch (e) { /* ignore */ } });
  const save = async () => { await T.store.set('job', job); emit(); };

  // step: { tid, page: 'players'|'banks'|'matches'|..., op, args, label }
  async function start(title, steps) {
    if (job && !job.done && !job.error) throw new Error('Another task is still running.');
    job = { title, steps, i: 0, log: [], startedAt: Date.now() };
    await save();
    run();
  }
  async function cancel() { job = null; await T.store.del('job'); emit(); }
  async function resume() { job = await T.store.get('job', null); emit(); if (job && !job.done && !job.error) run(); }

  const ops = {
    async labels(a) { for (const g of a.groups) await T.mp.setLabels(g.ids, g.labels, a.color); },
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
    async createBanks(a) { for (const b of a.banks) await T.mp.createBank(b.name, b.arenas); },
    async bankArenas(a) { for (const b of a.banks) await T.mp.setBankArenas(b.name, b.arenas); },
    async assignBanks(a) { for (const x of a.pairs) await T.mp.assignBank(x.group, x.bank); await T.saveT(a.tid, { banksDoneRound: a.roundId }); },
    async noop() { /* just brings you back to a page */ },
  };

  async function run() {
    if (running || !job) return;
    running = true;
    try {
      while (job && job.i < job.steps.length) {
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
        const res = await ops[s.op](s.args || {});
        if (res) job.log.push('  ' + res);
        job.i++; await save();
      }
      if (job) { job.done = true; job.log.push('Done.'); await save(); T.data.refresh(true); }
    } catch (e) {
      if (job) { job.error = e.message || String(e); await save(); }
    } finally { running = false; }
  }
  async function retry() { if (job) { job.error = null; await save(); run(); } }

  return { start, cancel, resume, retry, get: () => job, on: f => listeners.add(f) };
})();
