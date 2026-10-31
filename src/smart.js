// "Any category (game time)": an extra choice in Matchplay's Start next round → Limit arenas to… dropdown.
// The round starts with "Don't draw arenas"; then every game of every group gets its arena from here, by these
// rules (most important first):
//   1. no machine used by two groups at the same time (estimated from game times; a group waits rather than clash)
//   2. nobody plays the same game twice in one round
//   3. every game played about equally across the qualifying (counts within 1)
//   4. groups finish at about the same time (long games balanced; extra machines: longest sit out first)
//   5. a group's games spread over the eras
// A game a player already played earlier is avoided; when it can't be, the repeat goes to the player in the group
// who has repeated the least so far. Also: a machine that goes down is replaced in the banks that hold it (down()).
var TDP = window.TDP || (window.TDP = {});

TDP.smart = (() => {
  const T = TDP;
  const VALUE = 'tdp-gt', LABEL = 'Any category (game time) · TD Panel';
  const BUFFER = 60;   // seconds between one group leaving a machine and the next starting it
  const W = { wait: 40, repeat: 2500, repeatEach: 1500, repeatMore: 2500, equal: 12000, era: 120, len: 0.2, spread: 1, span: 0.5, roundDup: 1e7 };

  function rngFrom(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- the planner (pure: unit-tested in test/smart_unit.js) ----------
  // inp: { groups: [{no, players:[id], slots:[{gameId, index, arenaId|null}]}], arenas: [{arenaId, name, era, sec}],
  //        played: {playerId: {arenaId: count}} (earlier rounds), plays: {arenaId: count} (earlier rounds) }
  // -> { assign: [{gameId, group, index, arenaId, name, s, e, fixed}], notes: [text], cost }
  function plan(inp, opts = {}) {
    const tries = opts.tries || 300, rng = rngFrom(opts.seed || 12345);
    let best = null;
    for (let k = 0; k < tries; k++) {
      const r = once(inp, rng, k === 0 ? 0 : 0.3);
      if (!best || r.cost < best.cost) best = r;
    }
    return best;
  }
  function once(inp, rng, wobble) {
    const arenas = inp.arenas, byId = {}; arenas.forEach(a => { byId[a.arenaId] = a; });
    const played = {}, repeats = {};
    for (const [p, m] of Object.entries(inp.played || {})) { played[p] = { ...m }; repeats[p] = Object.values(m).reduce((s, c) => s + Math.max(0, c - 1), 0); }
    const plays = { ...(inp.plays || {}) }, planned = {};
    const busy = {};   // arenaId -> [[s, e]]
    const G = inp.groups.map(g => ({ g, t: 0, k: 0, used: new Set(), eras: [] }));
    const out = [], notes = [];
    let cost = 0;
    const startAt = (id, t, sec) => {
      let s = t;
      for (let moved = true, n = 0; moved && n < 50; n++) {
        moved = false;
        for (const [a, b] of busy[id] || []) if (s < b + BUFFER && s + sec + BUFFER > a) { s = b + BUFFER; moved = true; }
      }
      return s;
    };
    const minUse = () => Math.min(...arenas.map(a => (plays[a.arenaId] || 0) + (planned[a.arenaId] || 0)));
    const nameOf = p => (inp.names && inp.names[p]) || 'Player ' + p;
    for (;;) {
      const open = G.filter(x => x.k < x.g.slots.length);
      if (!open.length) break;
      const tmin = Math.min(...open.map(x => x.t));
      const now = open.filter(x => x.t <= tmin + 1e-6);
      const cur = now[Math.floor(rng() * now.length)];
      const slot = cur.g.slots[cur.k];
      let pick = null, extra = 0;
      if (slot.arenaId != null) {   // already has an arena (set by hand, or a retry): keep it
        const a = byId[slot.arenaId] || { arenaId: slot.arenaId, name: '', era: 'Unknown', sec: 13 * 60 };
        pick = { a, s: startAt(a.arenaId, cur.t, a.sec), fixed: true };
      } else {
        const m = minUse(), cands = [];
        for (const a of arenas) {
          const s = startAt(a.arenaId, cur.t, a.sec), wait = s - cur.t;
          let c = wait * W.wait;
          if (cur.used.has(a.arenaId)) c += W.roundDup;
          for (const p of cur.g.players) { const n = (played[p] || {})[a.arenaId] || 0; if (n) c += W.repeat + W.repeatEach * (repeats[p] || 0) + W.repeatMore * (n - 1); }
          const d = (plays[a.arenaId] || 0) + (planned[a.arenaId] || 0) - m;
          c += W.equal * d * d;
          c += W.era * cur.eras.filter(e => e === a.era).length;
          c += W.len * a.sec;
          c += rng() * 5;
          cands.push({ a, s, c, wait, d });
        }
        cands.sort((x, y) => x.c - y.c);
        pick = cands[0];
        if (wobble && cands.length > 1 && rng() < wobble && cands[1].c - cands[0].c < 1500) pick = cands[1];
        if (!pick) throw new Error('No arenas to choose from.');
        extra = pick.c;
      }
      const a = pick.a, s = pick.s, e = s + a.sec;
      (busy[a.arenaId] = busy[a.arenaId] || []).push([s, e]);
      const label = `Group ${cur.g.no}`;
      if (!pick.fixed) {
        if (cur.used.has(a.arenaId)) notes.push(`${label} plays ${a.name} twice this round (not enough games)`);
        for (const p of cur.g.players) {
          const n = (played[p] || {})[a.arenaId] || 0;
          if (n) { notes.push(`${nameOf(p)} replays ${a.name} - every other game was taken`); repeats[p] = (repeats[p] || 0) + 1; }
        }
        if (pick.wait > 30) notes.push(`${label} waits about ${Math.round(pick.wait / 60)} min for ${a.name}`);
        if (pick.d >= 1) notes.push(`${a.name} gets an extra play (others caught up later)`);
      }
      for (const p of cur.g.players) { played[p] = played[p] || {}; played[p][a.arenaId] = (played[p][a.arenaId] || 0) + 1; }
      planned[a.arenaId] = (planned[a.arenaId] || 0) + 1;
      cur.used.add(a.arenaId); cur.eras.push(a.era);
      out.push({ gameId: slot.gameId, group: cur.g.no, index: slot.index, arenaId: a.arenaId, name: a.name, s, e, fixed: !!pick.fixed });
      cost += extra;
      cur.t = e; cur.k++;
    }
    const ends = G.map(x => x.t);
    if (ends.length) cost += (Math.max(...ends) - Math.min(...ends)) * W.spread + Math.max(...ends) * W.span;
    out.sort((x, y) => (x.group - y.group) || (x.index - y.index));
    return { assign: out, notes: [...new Set(notes)], cost, ends };
  }

  // ---------- from Matchplay's data ----------
  // the round to fill: newest open round with group games that have no arena yet
  function roundToFill(D, games) {
    const need = r => games.some(g => g.roundId === r.roundId && !g.bye && g.set !== 9999 && g.arenaId == null);
    return [...(D.rounds || [])].reverse().find(r => String(r.status) !== 'completed' && need(r)) || null;
  }
  function input(D, round, roundGames, est) {
    const st = T.tstate[D.tid] || {}, never = new Set(st.bankExclude || []);
    const arenas = est.filter(a => !never.has(a.arenaId));
    const sets = {};
    for (const g of roundGames.filter(x => !x.bye && x.set !== 9999)) (sets[g.set] = sets[g.set] || []).push(g);
    const groups = Object.keys(sets).map(Number).sort((a, b) => a - b).map(set => {
      const gs = sets[set].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      return { no: set + 1, players: [...new Set(gs.flatMap(g => g.playerIds || []))], slots: gs.map(g => ({ gameId: g.gameId, index: g.index ?? 0, arenaId: g.arenaId })) };
    });
    const played = {}, plays = {};
    for (const g of D.games) {
      if (g.bye || g.arenaId == null || g.roundId === round.roundId) continue;
      for (const p of g.playerIds || []) { played[p] = played[p] || {}; played[p][g.arenaId] = (played[p][g.arenaId] || 0) + 1; }
      if (g.set !== 9999) plays[g.arenaId] = (plays[g.arenaId] || 0) + 1;
    }
    const names = {}; for (const p of D.t.players || []) names[p.playerId] = p.name;
    return { groups, arenas, played, plays, names };
  }
  async function make(D, roundGames, round) {
    const est = T.bankplan.estimates(D, T.tstate[D.tid] || {}, await T.bankplan.extras(D));
    const inp = input(D, round, roundGames, est);
    if (!inp.arenas.length) throw new Error('No arenas to use (all disabled or set to never).');
    return { inp, res: plan(inp, { seed: Date.now() % 1e9 }) };
  }

  // ---------- Matchplay's Start next round window ----------
  const isFinals = D => !!(D.qual && D.qual.tournamentId !== D.tid);
  const want = new WeakMap();   // dialog -> picked our choice?
  let passing = false, poll = null;
  function startDialog() {
    const d = T.dialog(); if (!d) return null;
    const h = d.querySelector('h2, h3'); if (!h || !/^Start next round$/i.test(T.txt(h))) return null;
    const sel = d.querySelector('select#categoryId, select[name=categoryId]');
    return sel ? { d, sel } : null;
  }
  function decorate() {
    if (T.isFrame) return;
    const D = T.data.D, x = startDialog();
    if (!x || !D || !D.t || !D.isTD || isFinals(D) || T.jobs.active()) return;
    const { d, sel } = x;
    if (!sel.querySelector(`option[value="${VALUE}"]`)) {
      const o = document.createElement('option'); o.value = VALUE; o.textContent = LABEL; o.dataset.tdp = '1';
      sel.insertBefore(o, sel.options[1] || null);
      // Matchplay never hears about our choice (it would not know it); its own choices go through as usual
      const block = e => { if (sel.value === VALUE) e.stopImmediatePropagation(); };
      sel.addEventListener('change', e => { want.set(d, sel.value === VALUE); T.saveT(D.tid, { smartArenas: sel.value === VALUE }); hint(d, sel); block(e); });
      sel.addEventListener('input', block);
      if ((T.tstate[D.tid] || {}).smartArenas) want.set(d, true);
      d.addEventListener('click', onClick, true);
      clearInterval(poll); poll = setInterval(() => { const y = startDialog(); if (!y) { clearInterval(poll); return; } if (want.get(y.d) && y.sel.value !== VALUE) y.sel.value = VALUE; hint(y.d, y.sel); }, 300);
    }
    if (want.get(d) && sel.value !== VALUE) sel.value = VALUE;
    hint(d, sel);
  }
  function hint(d, sel) {
    let el = d.querySelector('#tdp-smart-hint');
    if (sel.value !== VALUE) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div'); el.id = 'tdp-smart-hint'; el.dataset.tdp = '1';
    el.style.cssText = 'font-size:12px;line-height:1.4;margin-top:6px;color:#4f46e5';
    el.textContent = 'TD Panel gives every game its arena right after the round starts: no two groups on a machine at once, no game twice for a player, every game played equally, groups finishing together.';
    sel.parentElement.appendChild(el);
  }
  async function onClick(e) {
    if (passing) return;
    const b = e.target.closest('button'); if (!b || !/^Start round$/i.test(T.txt(b))) return;
    const x = startDialog(); if (!x || !want.get(x.d)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const D = T.data.D, tid = D.tid;
    const cb = [...x.d.querySelectorAll('input[type=checkbox]')].find(c => /Publish round immediately/i.test(T.cbLabel(c)));
    const publish = !cb || cb.checked;
    if (cb && cb.checked) { cb.click(); await T.waitFor(() => !cb.checked, 1500); }
    T.setVal(x.sel, '-1');   // Matchplay: Don't draw arenas
    await T.sleep(200);
    passing = true; try { b.click(); } finally { passing = false; }
    await T.waitFor(() => !startDialog(), 15000, 100);
    await T.saveT(tid, { smartArenas: true });
    try { await T.jobs.start('Assign arenas by game time', [{ tid, page: 'matches', op: 'smartPlan', args: { tid, publish }, label: 'Working out the arenas' }]); }
    catch (err) { T.panel.say(err.message || String(err), 'err'); }
  }

  // job steps that fill the round: the plan, then the games in chunks (Matchplay's Arena window, one game at a time)
  function fillSteps(tid, roundId, assign, publish) {
    const todo = assign.filter(x => !x.fixed), steps = [];
    for (let i = 0; i < todo.length; i += 8) {
      const part = todo.slice(i, i + 8);
      steps.push({ tid, page: 'matches', op: 'smartAssign', args: { tid, roundId, items: part.map(x => ({ gameId: x.gameId, arenaId: x.arenaId, name: x.name, group: x.group, index: x.index })) }, label: `Arenas for games ${i + 1}-${i + part.length} of ${todo.length}` });
    }
    if (publish) steps.push({ tid, page: 'matches', op: 'publishRound', args: { ifPending: true }, label: 'Publishing the round' });
    return steps;
  }

  // ---------- a machine goes down: replace it in the banks that hold it (only those banks) ----------
  const isDown = a => !!(a && a.tournamentArena && a.tournamentArena.status === 'inactive');
  function downPlan(D, est, estAll) {
    const st = T.tstate[D.tid] || {}, never = new Set(st.bankExclude || []);
    const am = T.data.arenaMap(D.t), banks = (D.t.banks || []).filter(b => b.status !== 'inactive');
    const secOf = id => { const x = estAll.find(a => a.arenaId === id); return x ? x : { arenaId: id, name: (am[id] || {}).name || '', era: T.banks.eraOf(am[id]), sec: 13 * 60 }; };
    const cur = banks.map(b => ({ name: b.name, ids: [...(b.arenaIds || [])] }));
    const count = id => cur.filter(b => b.ids.includes(id)).length;
    const changes = [];
    for (const b of cur) {
      for (let pos = 0; pos < b.ids.length; pos++) {
        const id = b.ids[pos]; if (!isDown(am[id])) continue;
        const down = secOf(id);
        const cands = est.filter(a => !never.has(a.arenaId) && !isDown(am[a.arenaId]) && !b.ids.includes(a.arenaId));
        if (!cands.length) { changes.push({ bank: b.name, down: down.name, none: true }); continue; }
        const others = cur.filter(o => o !== b).map(o => o.ids.map(secOf));
        let best = null;
        for (const c of cands) {
          const games = b.ids.map((x, i) => (i === pos ? c : secOf(x)));
          const trial = [{ games: games.map(g => ({ ...g })) }];
          const overlap = T.banks.schedule(trial, others);   // may reorder this bank so the machine isn't busy then
          const cost = overlap * 10 + Math.abs(c.sec - down.sec) + (c.era === down.era ? 0 : 300) + 400 * count(c.arenaId);
          if (!best || cost < best.cost) best = { c, cost, order: trial[0].games.map(g => g.arenaId) };
        }
        b.ids = best.order;
        changes.push({ bank: b.name, down: down.name, downId: id, repl: best.c.name, replId: best.c.arenaId, arenas: best.order.map(x => secOf(x).name) });
        pos = -1;   // the order may have changed: look the bank over again
      }
    }
    return changes;
  }
  // games of the open round still waiting on a down machine -> the replacement from their bank (or any free game)
  function downGames(D, roundGames, changes) {
    const am = T.data.arenaMap(D.t), out = [];
    const bankOf = id => (D.t.banks || []).find(b => b.bankId === id);
    for (const g of roundGames) {
      if (g.bye || g.arenaId == null || T.timing.isDone(g) || !isDown(am[g.arenaId])) continue;
      const bank = g.bankId != null ? bankOf(g.bankId) : null;
      const ch = changes.find(c => c.downId === g.arenaId && (!bank || c.bank === bank.name)) || changes.find(c => c.downId === g.arenaId);
      if (!ch || ch.none) continue;
      const mine = roundGames.filter(x => x.set === g.set && x.roundId === g.roundId).map(x => x.arenaId);
      if (mine.includes(ch.replId)) continue;   // the group plays it already this round
      out.push({ gameId: g.gameId, arenaId: ch.replId, name: ch.repl, group: g.set === 9999 ? 'Tiebreaker' : g.set + 1, index: g.index ?? 0 });
    }
    return out;
  }
  let downBusy = false;
  async function downCheck() {
    const D = T.data.D;
    if (T.isFrame || downBusy || !D || !D.t || !D.isTD || D.t.status !== 'started' || T.jobs.active() || !/bank/i.test(D.t.arenaAssignment || '')) return;
    const am = T.data.arenaMap(D.t);
    const hit = (D.t.banks || []).filter(b => b.status !== 'inactive' && (b.arenaIds || []).some(id => isDown(am[id])));
    if (!hit.length) return;
    const sig = hit.map(b => b.bankId + ':' + b.arenaIds.join(',')).join('|'), st = T.tstate[D.tid] || {};
    if (st.downSig === sig && Date.now() - (st.downAt || 0) < 10 * 60e3) return;
    downBusy = true;
    try {
      await T.saveT(D.tid, { downSig: sig, downAt: Date.now() });
      const tid = D.tid;
      await T.jobs.start('A machine is down: fixing its banks', [{ tid, page: 'banks', op: 'downFix', args: { tid }, label: 'Replacing the down game in its banks' }]);
    } catch (e) { T.warn('downCheck', e); }
    finally { downBusy = false; }
  }

  return { VALUE, plan, input, make, roundToFill, fillSteps, decorate, downPlan, downGames, downCheck, isDown };
})();
