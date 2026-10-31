// "New rounds use": the tournament's default way of giving a new round its arenas (Matches tab dropdown), and the
// fix for a round started somewhere else (a phone, another computer) with something different.
// A round started elsewhere is noticed through Matchplay's real-time events (live.js / bg.js) within seconds and,
// while nobody has entered a score and it's under 10 minutes old, redone with the default:
//   game time -> every game gets its arena by the game-time rules (Change arena, game by game)
//   a category / Any category -> Matchplay's round Actions → Clear all arenas + Assign arenas (that category)
//   banks -> Assign banks to each group
var TDP = window.TDP || (window.TDP = {});

TDP.rounds = (() => {
  const T = TDP;
  const TYPES = [
    ['smart', 'Any category (game time) · TD Panel'], ['any', 'Any category'], ['cat1', 'Electro-mechanical'],
    ['cat2', 'Solid state'], ['cat3', 'DMD'], ['cat4', 'Label A'], ['cat5', 'Label B'], ['cat6', 'Label C'], ['cat7', 'Label D'],
    ['cat8', 'Label E'], ['banks', 'Banks (Assign banks)'], ['none', "Don't draw arenas"],
  ];
  const isFinals = D => !!(D.qual && D.qual.tournamentId !== D.tid);
  // the default for a tournament (older settings: game-time option on = 'smart', Automatic banks = 'banks')
  function typeOf(D) {
    const st = T.tstate[D.tid] || {};
    if (st.roundType) return st.roundType;
    if (st.smartArenas && !isFinals(D)) return 'smart';
    if (st.autoAssign && /bank/i.test((D.t && D.t.arenaAssignment) || '')) return 'banks';
    return '';
  }
  // Matchplay's Start next round value for a type ("Limit arenas to…")
  const startValue = t => (t === 'any' ? '0' : /^cat\d$/.test(t) ? t.slice(3) : t === 'none' || t === 'smart' || t === 'banks' ? '-1' : null);
  async function setType(D, t) {
    const patch = { roundType: t || null, smartArenas: t === 'smart' };
    if (t === 'banks') patch.autoAssign = true; else if (typeOf(D) === 'banks') patch.autoAssign = false;
    // rounds already there are left alone
    patch.knownRounds = (D.rounds || []).map(r => r.roundId);
    await T.saveT(D.tid, patch);
  }
  function selectHtml(D) {
    const cur = typeOf(D), banks = /bank/i.test(D.t.arenaAssignment || '');
    return `<label class="gap" style="align-items:center" title="How each new round gets its arenas - also used by Auto close/start. A round started somewhere else (a phone) with something different is redone with this within seconds, while nobody has entered a score."><span class="lab">New rounds use</span>
      <select data-act="roundType" style="width:auto"><option value=""${cur ? '' : ' selected'}>(whatever is picked each time)</option>${TYPES.filter(([k]) => k !== 'banks' || banks).filter(([k]) => k !== 'smart' || !isFinals(D)).map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${T.esc(l)}</option>`).join('')}</select></label>`;
  }

  // ---------- a round started elsewhere ----------
  const hasScore = g => T.timing.isDone(g) || (g.resultPositions || []).length || (g.suggestions || []).length;
  const ts = v => { const t = Date.parse(String(v || '').replace(' ', 'T')); return isFinite(t) ? t : null; };
  // does the round already match the default? (categories: every assigned arena in that category / label)
  function matches(D, type, games) {
    const am = T.data.arenaMap(D.t), real = games.filter(g => !g.bye && g.set !== 9999);
    if (type === 'smart') return false;   // can't tell a random draw from ours: ours are marked when we make them
    if (type === 'banks') return real.every(g => g.bankId != null || g.arenaId != null);
    if (type === 'any') return real.every(g => g.arenaId != null);   // a phone's usual draw; only fill games with none
    if (type === 'none') return true;
    const n = +type.slice(3);
    return real.filter(g => g.arenaId != null).every(g => { const a = am[g.arenaId] || {}; return n <= 3 ? a.categoryId === n : (a.labels || []).map(x => String(x.name || x).trim().toUpperCase()).includes('ABCDE'[n - 4]); });
  }
  let busy = false;
  async function guard(lock) {
    const D = T.data.D, tid = D.tid, st = T.tstate[tid] || {}, type = typeOf(D);
    if (busy || T.isFrame || !D.t || !D.isTD || D.t.status !== 'started' || T.jobs.active()) return;
    const r = T.data.latestRound(); if (!r || String(r.status) === 'completed') return;
    const known = st.knownRounds;
    if (!known) { await T.saveT(tid, { knownRounds: (D.rounds || []).map(x => x.roundId) }); return; }   // first look: everything there is left alone
    if (known.includes(r.roundId)) return;
    // started from this computer (any choice) in the last 2 minutes: the TD picked it - leave it
    if (st.localStartAt && Date.now() - st.localStartAt < 120e3) { await T.saveT(tid, { knownRounds: [...known, r.roundId].slice(-60) }); return; }
    if (!type || !(await lock(tid + ':guard'))) return;
    busy = true;
    try {
      const games = await T.api.all(`/tournaments/${tid}/games?round=${r.roundId}`, 0);
      await T.saveT(tid, { knownRounds: [...known, r.roundId].slice(-60) });   // once per round, whatever happens next
      const label = (TYPES.find(x => x[0] === type) || [])[1] || type, name = r.name || 'The new round';
      const age = Date.now() - (ts(r.createdAt) || Date.now());
      if (games.some(hasScore) || age > 10 * 60e3) { T.panel.say(`${name} was started on another device - left as it is (scores already entered or it's over 10 minutes old). New rounds use: ${label}.`, 'err'); return 'left'; }
      if (matches(D, type, games)) return 'ok';
      const pending = String(r.status) === 'pending', steps = [];
      if (type === 'smart') steps.push({ tid, page: 'matches', op: 'smartPlan', args: { tid, publish: pending, roundId: r.roundId, redo: true }, label: 'Giving every game its arena by game time' });
      else if (type === 'banks') steps.push({ tid, page: 'matches', op: 'assignRound', args: { tid }, label: 'Assigning a bank to each group' });
      else if (type === 'any') steps.push({ tid, page: 'matches', op: 'roundArenas', args: { tid, roundId: r.roundId, value: 'automatic', clear: false }, label: 'Assigning arenas (Any category)' });
      else steps.push({ tid, page: 'matches', op: 'roundArenas', args: { tid, roundId: r.roundId, value: 'category_id_' + type.slice(3), clear: true }, label: `Re-drawing arenas: ${label}` });
      if (pending && type !== 'smart') steps.push({ tid, page: 'matches', op: 'publishRound', args: { ifPending: true }, label: 'Publishing the round' });
      T.panel.say(`${name} was started on another device - redoing it with ${label}.`);
      await T.jobs.start(`${name}: redo with ${label}`, steps);
      return 'redo';
    } catch (e) { T.warn('round guard', e); }
    finally { busy = false; }
  }

  return { TYPES, typeOf, setType, startValue, selectHtml, guard };
})();
