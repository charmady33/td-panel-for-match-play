// "Any category (game time)": an extra choice in Matchplay's Start next round → Limit arenas to… dropdown.
// The round starts with "Don't draw arenas"; then every game of every group gets its arena from here, by these
// rules (most important first, item 105):
//   1. no machine used by two groups at the same time (estimated from game times; a group waits rather than clash)
//   2. nobody plays the same game twice in one round
//   3. nobody plays a game they played in an earlier round, unless nothing else fits; a 3rd play of the same game
//      is blocked hardest; a repeat goes to the player in the group who has repeated the least so far
//   4. groups finish at about the same time (long games balanced; extra machines: longest sit out first)
//   5. a group's games spread over the eras
//   6. every game played about equally (only a tiebreaker) Also: a machine that goes down is replaced in the banks that hold it (down()).
var TDP = window.TDP || (window.TDP = {});

TDP.smart = (() => {
  const T = TDP;
  const VALUE = 'tdp-gt', LABEL = 'Any category (game time) · TD Panel';
  const BUFFER = 60;   // seconds between one group leaving a machine and the next starting it
  const W = { wait: 40, repeat: 1e6, repeatEach: 1500, repeatMore: 2e7, equal: 1000, era: 120, len: 0.2, spread: 1, span: 0.5, roundDup: 1e9, pair: 1e7, b2b: 3e7, longWait: 4000, recent: 600, quota: 15000, target: 6, equalAll: 0 };   // item 105: repeats far above everything but a clash/same-round dup; equal plays last

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
  // inp.sets: {playerId: ['id,id', …]} - the sorted games each player had in each earlier round
  const pairKey = ids => ids.map(Number).sort((x, y) => x - y).join(',');
  const samePair = (inp, players, ids) => { const k = pairKey(ids); return players.some(p => ((inp.sets || {})[p] || []).includes(k)); };
  function once(inp, rng, wobble) {
    const arenas = inp.arenas, byId = {}; arenas.forEach(a => { byId[a.arenaId] = a; });
    const played = {}, repeats = {};
    for (const [p, m] of Object.entries(inp.played || {})) { played[p] = { ...m }; repeats[p] = Object.values(m).reduce((s, c) => s + Math.max(0, c - 1), 0); }
    const plays = { ...(inp.plays || {}) }, planned = {};
    const busy = {};   // arenaId -> [[s, e]]
    const G = inp.groups.map(g => ({ g, t: 0, k: 0, used: new Set(), eras: [], sum: 0 }));
    // even rounds: each round takes its share of each era (long modern games spread over the night, not bunched),
    // and every group aims at the same length (long games paired with short ones)
    const eraOf = a => a.era === 'LCD' ? 'DMD' : a.era, byEra = {};
    arenas.forEach(a => { (byEra[eraOf(a)] = byEra[eraOf(a)] || []).push(a); });
    const slotsAll = inp.groups.reduce((n, g) => n + g.slots.length, 0), quota = {}, eraCount = {};
    let avgSlot = 0;
    for (const [e, list] of Object.entries(byEra)) { quota[e] = slotsAll * list.length / arenas.length; avgSlot += quota[e] * list.reduce((x, a) => x + a.sec, 0) / list.length; }
    avgSlot = slotsAll ? avgSlot / slotsAll : 0;
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
    // equal play within each era (every EM game as often as the other EM games, etc.)
    const minUse = e => Math.min(...byEra[e].map(a => (plays[a.arenaId] || 0) + (planned[a.arenaId] || 0)));
    const nameOf = p => (inp.names && inp.names[p]) || 'Player ' + p;
    for (;;) {
      const open = G.filter(x => x.k < x.g.slots.length);
      if (!open.length) break;
      const tmin = Math.min(...open.map(x => x.t));
      const now = open.filter(x => x.t <= tmin + 1e-6);
      // item 105: the group with the fewest games left that none of its players has played picks first
      // (most constrained first); ties, and every other try, at random
      const freeFor = x => arenas.filter(a => !x.used.has(a.arenaId) && !x.g.players.some(p => (played[p] || {})[a.arenaId])).length;
      let cur = now[Math.floor(rng() * now.length)];
      if (now.length > 1 && rng() < 0.5) { const f = now.map(freeFor), m = Math.min(...f), tied = now.filter((x, i) => f[i] === m); cur = tied[Math.floor(rng() * tied.length)]; }
      const slot = cur.g.slots[cur.k];
      let pick = null, extra = 0;
      if (slot.arenaId != null) {   // already has an arena (set by hand, or a retry): keep it
        const a = byId[slot.arenaId] || { arenaId: slot.arenaId, name: '', era: 'Unknown', sec: 13 * 60 };
        pick = { a, s: startAt(a.arenaId, cur.t, a.sec), fixed: true };
      } else {
        const mins = {}; Object.keys(byEra).forEach(e => { mins[e] = minUse(e); });
        const minAll = Math.min(...Object.values(mins));
        const cands = [], left = cur.g.slots.length - cur.k - 1, target = avgSlot * cur.g.slots.length;
        for (const a of arenas) {
          const m = mins[eraOf(a)];
          const s = startAt(a.arenaId, cur.t, a.sec), wait = s - cur.t;
          let c = wait * W.wait + Math.max(0, wait - 300) * W.longWait;   // item 105: a wait over 5 min costs more than a repeat
          if (cur.used.has(a.arenaId)) c += W.roundDup;
          // item 103: a player never gets the same set of games as in an earlier round (last game of the group's round)
          if (!left && cur.used.size && samePair(inp, cur.g.players, [...cur.used, a.arenaId])) c += W.pair;
          for (const p of cur.g.players) {
            const n = (played[p] || {})[a.arenaId] || 0; if (!n) continue;
            c += W.repeat + W.repeatEach * (repeats[p] || 0) + W.repeatMore * (n - 1);
            // a repeat is never a game from the round just before (last resort); otherwise the one played longest ago
            const ago = ((inp.ago || {})[p] || {})[a.arenaId];
            if (ago === 1) c += W.b2b; else if (ago) c += W.recent * Math.max(0, 5 - ago);
          }
          const d = (plays[a.arenaId] || 0) + (planned[a.arenaId] || 0) - m;
          c += W.equal * d * d;
          const dAll = (plays[a.arenaId] || 0) + (planned[a.arenaId] || 0) - minAll;   // across eras: no game gets a 2nd extra play before the others caught up
          if (dAll >= 1 && W.equalAll) c += W.equalAll * dAll * dAll;
          c += W.era * cur.eras.filter(e => e === a.era).length;
          const over = (eraCount[eraOf(a)] || 0) + 1 - Math.ceil(quota[eraOf(a)] - 1e-9); if (over > 0) c += W.quota * over;
          c += W.target * Math.abs(cur.sum + a.sec + left * avgSlot - target);
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
          if (n) { notes.push(((inp.ago || {})[p] || {})[a.arenaId] === 1 ? `${nameOf(p)} replays ${a.name} from the last round - nothing else was free` : `${nameOf(p)} replays ${a.name} - every other game was taken`); repeats[p] = (repeats[p] || 0) + 1; }
        }
        if (!pick.fixed && cur.k === cur.g.slots.length - 1 && cur.used.size && samePair(inp, cur.g.players, [...cur.used, a.arenaId])) notes.push(`${label} gets a set of games a player had before - nothing else fit`);
        if (pick.wait > 30) notes.push(`${label} waits about ${Math.round(pick.wait / 60)} min for ${a.name}`);
      }
      for (const p of cur.g.players) { played[p] = played[p] || {}; played[p][a.arenaId] = (played[p][a.arenaId] || 0) + 1; }
      planned[a.arenaId] = (planned[a.arenaId] || 0) + 1;
      cur.used.add(a.arenaId); cur.eras.push(a.era); cur.sum += a.sec || 0; eraCount[eraOf(a)] = (eraCount[eraOf(a)] || 0) + 1;
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
    const played = {}, plays = {}, ago = {};
    const rs = [...(D.rounds || [])], ri = {}; rs.forEach((r, i) => { ri[r.roundId] = i; });
    const now = ri[round.roundId] != null ? ri[round.roundId] : rs.length;
    for (const g of D.games) {
      if (g.bye || g.arenaId == null || g.roundId === round.roundId) continue;
      // how many rounds ago each player last played each game (1 = the round just before)
      if (ri[g.roundId] != null && ri[g.roundId] < now) for (const p of g.playerIds || []) { const d = now - ri[g.roundId]; ago[p] = ago[p] || {}; if (!ago[p][g.arenaId] || d < ago[p][g.arenaId]) ago[p][g.arenaId] = d; }
      for (const p of g.playerIds || []) { played[p] = played[p] || {}; played[p][g.arenaId] = (played[p][g.arenaId] || 0) + 1; }
      if (g.set !== 9999) plays[g.arenaId] = (plays[g.arenaId] || 0) + 1;
    }
    const names = {}; for (const p of D.t.players || []) names[p.playerId] = p.name;
    // item 103: each player's set of games per earlier round (tiebreakers left out)
    const per = {}; for (const g of D.games) { if (g.bye || g.arenaId == null || g.set === 9999 || g.roundId === round.roundId) continue; for (const p of g.playerIds || []) { const k = p + '|' + g.roundId; (per[k] = per[k] || []).push(g.arenaId); } }
    const had = {}; for (const [k, ids] of Object.entries(per)) { if (ids.length < 2) continue; const p = k.split('|')[0]; (had[p] = had[p] || []).push(pairKey(ids)); }
    return { groups, arenas, played, plays, names, ago, sets: had };
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
    if (!x || !D || !D.t || !D.isTD || T.jobs.active()) return;
    const { d, sel } = x;
    // the tournament's default ("New rounds use", Matches tab): picked when the window opens
    if (!d.dataset.tdpPre) {
      d.dataset.tdpPre = '1';
      const t = T.rounds.typeOf(D), v = T.rounds.startValue(t);
      if (t && t !== 'smart' && v != null && sel.value !== v && [...sel.options].some(o => o.value === v)) T.setVal(sel, v);
    }
    if (isFinals(D)) return;
    if (!sel.querySelector(`option[value="${VALUE}"]`)) {
      const o = document.createElement('option'); o.value = VALUE; o.textContent = LABEL; o.dataset.tdp = '1';
      sel.insertBefore(o, sel.options[1] || null);
      // Matchplay never hears about our choice (it would not know it); its own choices go through as usual
      const block = e => { if (sel.value === VALUE) e.stopImmediatePropagation(); };
      sel.addEventListener('change', e => { want.set(d, sel.value === VALUE); if (!(T.tstate[D.tid] || {}).roundType) T.saveT(D.tid, { smartArenas: sel.value === VALUE }); hint(d, sel); block(e); });   // (with a "New rounds use" default, a pick here is just for this round)
      sel.addEventListener('input', block);
      if (T.rounds.typeOf(D) === 'smart') want.set(d, true);
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
    el.textContent = 'TD Panel gives every game its arena right after the round starts: no two groups on a machine at once, no game twice in a round, no repeats of earlier games when anything else fits, groups finishing together, eras mixed, and plays per game evened out last.';
    sel.parentElement.appendChild(el);
  }
  // any Start round from this computer: the TD picked it - a round started here is never "redone"
  if (!T.isFrame && typeof document !== 'undefined') document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button'); if (!b || !/^Start round$/i.test(T.txt(b)) || !startDialog()) return;
    const D = T.data.D; if (D && D.tid) T.saveT(D.tid, { localStartAt: Date.now() });
  }, true);
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
  function fillSteps(tid, roundId, assign, publish, change) {
    const todo = assign.filter(x => !x.fixed), steps = [];
    for (let i = 0; i < todo.length; i += 8) {
      const part = todo.slice(i, i + 8);
      steps.push({ tid, page: 'matches', op: 'smartAssign', args: { tid, roundId, change: !!change, items: part.map(x => ({ gameId: x.gameId, arenaId: x.arenaId, name: x.name, group: x.group, index: x.index })) }, label: `Arenas for games ${i + 1}-${i + part.length} of ${todo.length}` });
    }
    if (publish) steps.push({ tid, page: 'matches', op: 'publishRound', args: { ifPending: true }, label: 'Publishing the round' });
    return steps;
  }

  // ---------- a machine goes down: replace it in the banks that hold it (only those banks) ----------
  const isDown = a => !!(a && a.tournamentArena && a.tournamentArena.status === 'inactive');
  // ---------- best fit for one bank slot (same rules as building banks) ----------
  //  1 never a game already in this bank · 2 the machine isn't busy in another bank then (same game number = hard,
  //  time overlap; re-ordering this bank is tried) · 3 the bank's total stays close to the other banks' · 4 the era
  //  this bank is missing · 5 games in no bank / the fewest banks
  function bankCtx(D, estAll) {
    const st = T.tstate[D.tid] || {}, never = new Set(st.bankExclude || []);
    const am = T.data.arenaMap(D.t), banks = (D.t.banks || []).filter(b => b.status !== 'inactive');
    const secOf = id => { const x = estAll.find(a => a.arenaId === id); return x ? x : { arenaId: id, name: (am[id] || {}).name || '', era: T.banks.eraOf(am[id]), sec: 13 * 60 }; };
    const cur = banks.map(b => ({ name: b.name, ids: [...(b.arenaIds || [])] }));
    return { am, never, secOf, cur, count: id => cur.filter(b => b.ids.includes(id)).length };
  }
  const eraK = e => (e === 'LCD' ? 'DMD' : e);
  // every candidate for slot `pos` of bank `b`, best first: {c, cost, order (arena ids), clash}
  function fitSlot(X, b, pos, est) {
    const others = X.cur.filter(o => o !== b), otherW = others.map(o => o.ids.map(X.secOf));
    const tot = ids => ids.reduce((t, id) => t + X.secOf(id).sec, 0);
    const avg = others.length ? others.reduce((t, o) => t + tot(o.ids), 0) / others.length : tot(b.ids);
    const rest = b.ids.filter((_, i) => i !== pos), downEra = eraK(X.secOf(b.ids[pos]).era);   // same era as the down game keeps the era mix (item 71)
    const cands = est.filter(a => !X.never.has(a.arenaId) && !isDown(X.am[a.arenaId]) && !b.ids.includes(a.arenaId));
    const out = [], base = T.banks.schedule([], otherW);
    for (const c of cands) {
      // only the down game's spot changes: the bank keeps its order and its other games (item 68)
      const games = b.ids.map((x, i) => (i === pos ? c : X.secOf(x)));
      const overlap = Math.max(0, T.banks.schedule([], [games, ...otherW]) - base);
      const order = games.map(g => g.arenaId);
      const cost = overlap * 10 + Math.abs(tot(rest) + c.sec - avg) + (eraK(c.era) === downEra ? 0 : 300) + 400 * X.count(c.arenaId);
      let clash = '';
      if (overlap >= 1e6) { const o = others.find(o => o.ids.indexOf(c.arenaId) === order.indexOf(c.arenaId)); clash = `same game number in ${o ? o.name : 'another bank'}`; }
      else if (overlap > 0) { const o = others.find(o => o.ids.includes(c.arenaId)); clash = `busy at that time in ${o ? o.name : 'another bank'}`; }
      out.push({ c, cost, order, clash, reordered: false });
    }
    return out.sort((x, y) => x.cost - y.cost);
  }
  // a machine went down: each bank holding it -> best fit (with the ranked list, for the TD to pick another)
  function downPlan(D, est, estAll) {
    const X = bankCtx(D, estAll), changes = [];
    for (const b of X.cur) {
      for (let pos = 0; pos < b.ids.length; pos++) {
        const id = b.ids[pos]; if (!isDown(X.am[id])) continue;
        const down = X.secOf(id), list = fitSlot(X, b, pos, est);
        if (!list.length) { changes.push({ bank: b.name, down: down.name, downId: id, none: true }); continue; }
        const best = list[0], before = [...b.ids];
        b.ids = best.order;
        changes.push({ bank: b.name, down: down.name, downId: id, pos, before, repl: best.c.name, replId: best.c.arenaId, arenas: best.order.map(x => X.secOf(x).name), reordered: best.reordered,
          options: list.slice(0, 25).map(o => ({ id: o.c.arenaId, name: o.c.name, era: o.c.era, sec: Math.round(o.c.sec), clash: o.clash, arenas: o.order.map(x => X.secOf(x).name), reordered: o.reordered })) });
        pos = -1;   // the order may have changed: look the bank over again
      }
    }
    return changes;
  }
  // two active banks with the same machine at the same game number -> fix: re-order the later bank if that's enough,
  // else replace that game with the best fit
  function clashPlan(D, est, estAll) {
    const X = bankCtx(D, estAll), out = [];
    for (let bi = 1; bi < X.cur.length; bi++) {
      const b = X.cur[bi];
      const hit = b.ids.map((id, pos) => ({ id, pos, other: X.cur.slice(0, bi).find(o => o.ids[pos] === id) })).filter(x => x.other);
      if (!hit.length) continue;
      const others = X.cur.filter(o => o !== b).map(o => o.ids.map(X.secOf));
      const trial = [{ games: b.ids.map(X.secOf).map(g => ({ ...g })) }];
      const left = T.banks.schedule(trial, others);
      if (left < 1e6) { const order = trial[0].games.map(g => g.arenaId); out.push({ bank: b.name, what: `re-order (${hit.map(h => X.secOf(h.id).name).join(', ')} moved)`, arenas: order.map(x => X.secOf(x).name), clash: hit.map(h => `${X.secOf(h.id).name} is game ${h.pos + 1} in ${h.other.name} too`) }); b.ids = order; continue; }
      const h = hit[0], list = fitSlot(X, b, h.pos, est).filter(o => !o.clash);
      if (!list.length) { out.push({ bank: b.name, none: true, clash: [`${X.secOf(h.id).name} is game ${h.pos + 1} in ${h.other.name} too`] }); continue; }
      out.push({ bank: b.name, what: `${X.secOf(h.id).name} → ${list[0].c.name}`, arenas: list[0].order.map(x => X.secOf(x).name), clash: [`${X.secOf(h.id).name} is game ${h.pos + 1} in ${h.other.name} too`] });
      b.ids = list[0].order;
    }
    return out;
  }
  // games of the open round still waiting on a down machine -> the replacement from their bank (or any free game)
  function downGames(D, roundGames, changes, alts) {
    const am = T.data.arenaMap(D.t), out = [];
    const bankOf = id => (D.t.banks || []).find(b => b.bankId === id);
    for (const g of roundGames) {
      if (g.bye || g.arenaId == null || T.timing.isDone(g) || !isDown(am[g.arenaId])) continue;
      const bank = g.bankId != null ? bankOf(g.bankId) : null;
      const ch = changes.find(c => c.downId === g.arenaId && (!bank || c.bank === bank.name)) || changes.find(c => c.downId === g.arenaId);
      if (!ch || ch.none) continue;
      const mine = roundGames.filter(x => x.set === g.set && x.roundId === g.roundId).map(x => x.arenaId);
      // the group's players: games they had in the round just before are a last resort (never back to back)
      const rs = D.rounds || [], i = rs.findIndex(r => r.roundId === g.roundId), prev = i > 0 ? rs[i - 1].roundId : null;
      const ps = new Set(roundGames.filter(x => x.set === g.set && x.roundId === g.roundId).flatMap(x => x.playerIds || []));
      const hadLast = new Set((D.games || []).filter(x => x.roundId === prev && (x.playerIds || []).some(p => ps.has(p))).map(x => x.arenaId));
      let pick = { arenaId: ch.replId, name: ch.repl };
      if (mine.includes(pick.arenaId) || hadLast.has(pick.arenaId)) {
        const alt = (alts || []).find(a => !mine.includes(a.arenaId) && !hadLast.has(a.arenaId) && !isDown(am[a.arenaId]));
        if (alt) pick = { arenaId: alt.arenaId, name: alt.name };
        else if (mine.includes(pick.arenaId)) continue;   // the group plays it already this round
      }
      out.push({ gameId: g.gameId, arenaId: pick.arenaId, name: pick.name, group: g.set === 9999 ? 'Tiebreaker' : g.set + 1, index: g.index ?? 0 });
    }
    return out;
  }
  // items 91, 96: a game of the current round waiting on / played on a down machine that no bank change covers ->
  // every free game ranked: same era, a similar time, not busy right now, not one the group plays this round or played
  // in the round before
  function looseFits(D, g, est, roundGames) {
    const am = T.data.arenaMap(D.t), down = est.find(a => a.arenaId === g.arenaId) || { era: T.banks.eraOf(am[g.arenaId]), sec: 13 * 60 };
    const group = roundGames.filter(x => x.set === g.set && x.roundId === g.roundId), mine = new Set(group.map(x => x.arenaId));
    const busy = new Set(roundGames.filter(x => x !== g && !x.bye && !T.timing.isDone(x) && x.arenaId != null).map(x => x.arenaId));
    const rs = D.rounds || [], i = rs.findIndex(r => r.roundId === g.roundId), prev = i > 0 ? rs[i - 1].roundId : null;
    const ps = new Set(group.flatMap(x => x.playerIds || []));
    const hadLast = new Set((D.games || []).filter(x => x.roundId === prev && (x.playerIds || []).some(p => ps.has(p))).map(x => x.arenaId));
    // max match play (item 110): a game either player already played counts against it
    const played = {}; if (T.maxmp && T.maxmp.isMax(D)) for (const x of D.games || []) if (x !== g && !x.bye && x.arenaId != null && (x.playerIds || []).some(p => (g.playerIds || []).includes(p))) played[x.arenaId] = (played[x.arenaId] || 0) + (x.playerIds || []).filter(p => (g.playerIds || []).includes(p)).length;
    return est.filter(a => a.arenaId !== g.arenaId && !isDown(am[a.arenaId]) && !mine.has(a.arenaId))
      .map(a => ({ id: a.arenaId, name: a.name, era: a.era, sec: a.sec, busy: busy.has(a.arenaId), last: hadLast.has(a.arenaId),
        cost: (eraK(a.era) === eraK(down.era) ? 0 : 300) + Math.abs(a.sec - down.sec) + (busy.has(a.arenaId) ? 900 : 0) + (hadLast.has(a.arenaId) ? 500 : 0) + 400 * (played[a.arenaId] || 0) }))
      .sort((x, y) => x.cost - y.cost);
  }
  // item 110: max match play has no rounds - its active games are "the round"
  const curRound = D => T.maxmp && T.maxmp.isMax(D) ? { roundId: 0, max: true } : T.data.currentRound();
  const curGames = (D, r) => !r ? [] : r.max ? (D.games || []).filter(g => !g.bye && String(g.status) === 'started') : D.games.filter(g => g.roundId === r.roundId);
  const vsOf = g => { const pm = T.data.playerMap(T.data.D.t); return (g.playerIds || []).map(id => (pm[id] || {}).name || '#' + id).join(' vs '); };
  const pvMax = () => !!(T.maxmp && T.maxmp.isMax(T.data.D));
  const openOnDown = (D, roundGames) => { const am = T.data.arenaMap(D.t); return roundGames.filter(g => !g.bye && g.arenaId != null && !T.timing.isDone(g) && isDown(am[g.arenaId])); };
  // item 90: a game turned off (or back on) in one event of the set - qualifying, A, B… - is turned off (on) in the others
  async function famSync(D) {
    if (!D.qual || T.isFrame) return false;
    const st = T.tstate[D.tid] || {}, seen = st.arenaSeen || null, now = {};
    for (const a of D.t.arenas || []) now[a.arenaId] = isDown(a) ? 0 : 1;
    if (JSON.stringify(seen) !== JSON.stringify(now)) await T.saveT(D.tid, { arenaSeen: now });
    if (!seen) return false;   // first look: nothing changed yet
    const changed = Object.keys(now).filter(id => id in seen && seen[id] !== now[id]);
    if (!changed.length) return false;
    const fam = [{ tid: D.qual.tournamentId, t: D.qual }, ...(D.finals || []).map(f => ({ tid: f.tid, t: f.t }))].filter(x => x.tid !== D.tid && x.t && !T.isDone(x.t));   // (completed events are left alone)
    const steps = [];
    for (const id of changed) {
      const active = !!now[id], name = ((D.t.arenas || []).find(a => String(a.arenaId) === id) || {}).name || 'A game';
      for (const x of fam) {
        const a = (x.t.arenas || []).find(z => String(z.arenaId) === id); if (!a || !isDown(a) === active) continue;
        steps.push({ tid: x.tid, page: 'arenas', op: 'arenaStatus', args: { arenaId: +id, active, name, tname: x.t.name || ('#' + x.tid) }, label: `${active ? 'Turning on' : 'Turning off'} ${name} in ${x.t.name || '#' + x.tid}` });
      }
    }
    if (!steps.length) return false;
    try { await T.jobs.start(`${steps.length === 1 ? steps[0].args.name : 'Games'} ${steps[0].args.active ? 'back on' : 'off'} in the other events too`, steps); return true; } catch (e) { return false; }
  }
  // item 94: a finals gets every active arena of its qualifying by itself (Matchplay's "Add from qualifying" can miss some)
  async function famArenas(D) {
    if (!D.qual || D.tid === D.qual.tournamentId || T.isFrame) return false;
    const have = new Set((D.t.arenas || []).map(a => String(a.name || '').toLowerCase()));
    const names = (D.qual.arenas || []).filter(a => !isDown(a)).map(a => a.name).filter(n => n && !have.has(n.toLowerCase()));
    if (!names.length) return false;
    const st = T.tstate[D.tid] || {}, sig = names.slice().sort().join('|');
    if (st.arenaCopySig === sig && Date.now() - (st.arenaCopyAt || 0) < 30 * 60e3) return false;   // tried already: not again and again
    await T.saveT(D.tid, { arenaCopySig: sig, arenaCopyAt: Date.now() });
    try { await T.jobs.start(`Copy ${names.length} arena${names.length === 1 ? '' : 's'} from qualifying`, [{ tid: D.tid, page: 'arenas', op: 'copyArenas', args: { names }, label: `Adding ${names.length} arena${names.length === 1 ? '' : 's'} from ${D.qual.name || 'qualifying'}` }]); return true; } catch (e) { return false; }
  }
  let downBusy = false;
  async function downCheck() {
    const D = T.data.D;
    // (item 91: before the event starts too; item 96: with or without banks)
    if (T.isFrame || downBusy || !D || !D.t || !D.isTD || T.isDone(D.t) || T.jobs.active()) return;   // (completed: nothing changes by itself)
    if (D.tid === T.routeTid() && await famSync(D)) return;   // (the window follows once that's done)
    if (D.tid === T.routeTid() && await famArenas(D)) return;
    const am = T.data.arenaMap(D.t), usesBanks = /bank/i.test(D.t.arenaAssignment || '');
    const hit = usesBanks ? (D.t.banks || []).filter(b => b.status !== 'inactive' && (b.arenaIds || []).some(id => isDown(am[id]))) : [];
    const r = curRound(D), loose = r ? openOnDown(D, curGames(D, r)) : [];
    if (!hit.length && !loose.length) return;
    const sig = hit.map(b => b.bankId + ':' + b.arenaIds.join(',')).join('|') + '#' + loose.map(g => g.gameId + ':' + g.arenaId).join(','), st = T.tstate[D.tid] || {};
    if (st.downSig === sig && Date.now() - (st.downAt || 0) < 10 * 60e3) return;
    downBusy = true;
    try {
      await T.saveT(D.tid, { downSig: sig, downAt: Date.now() });
      const tid = D.tid;
      let bgWin = false; try { bgWin = sessionStorage.getItem('tdp-bg') === '1'; } catch (e) { /* */ }
      if (!bgWin && !document.hidden) return downPreview(D);   // the TD is here: show what will change first
      if (hit.length) await T.jobs.start('A machine is down: fixing its banks', [{ tid, page: 'banks', op: 'downFix', args: { tid }, label: 'Replacing the down game in its banks' }]);
      else {   // nobody here: each game gets its best replacement
        const extra = await T.bankplan.extras(D), est = T.bankplan.estimates(D, st, extra, true), rg = curGames(D, r);
        const items = loose.map(g => { const o = looseFits(D, g, est, rg)[0]; return o && { gameId: g.gameId, arenaId: o.id, name: o.name, group: g.set === 9999 ? 'Tiebreaker' : g.set + 1, index: g.index ?? 0 }; }).filter(Boolean);
        if (items.length) await T.jobs.start('A machine is down: moving its games', [{ tid, page: 'matches', op: 'smartAssign', args: { tid, roundId: r.roundId, items, change: true }, label: `Moving ${items.length} game${items.length === 1 ? '' : 's'} off the down machine` }]);
      }
    } catch (e) { T.warn('downCheck', e); }
    finally { downBusy = false; }
  }

  // ---------- the window: "Laser Ball is going down" - what changes, best fit picked, TD can pick another ----------
  let pvHost = null, pv = null;
  async function downPreview(D) {
    const st = T.tstate[D.tid] || {}, extra = await T.bankplan.extras(D);
    const usesBanks = /bank/i.test(D.t.arenaAssignment || ''), estAll = T.bankplan.estimates(D, st, extra, true);
    const changes = usesBanks ? downPlan(D, T.bankplan.estimates(D, st, extra), estAll) : [];
    const r = curRound(D), roundGames = curGames(D, r);
    // games on the down machine that the bank changes don't move: each gets its own choice (best / random / pick)
    const covered = new Set(downGames(D, roundGames, changes.filter(c => !c.none)).map(m => m.gameId));
    const am = T.data.arenaMap(D.t);
    const loose = openOnDown(D, roundGames).filter(g => !covered.has(g.gameId)).map(g => ({ g, down: (am[g.arenaId] || {}).name || 'a game', options: looseFits(D, g, estAll, roundGames) })).filter(x => x.options.length);
    if (!changes.length && !loose.length) return;
    pv = { tid: D.tid, roundId: r && r.roundId, changes, pick: {}, roundGames, loose, lpick: {} };
    if (!pvHost) { pvHost = document.createElement('div'); pvHost.id = 'tdp-downpv'; pvHost.attachShadow({ mode: 'open' }); pvHost.shadowRoot.addEventListener('click', pvClick); pvHost.shadowRoot.addEventListener('change', pvChange); document.documentElement.appendChild(pvHost); }
    pvDraw();
  }
  const pvChoice = (ch, k) => { const id = pv.pick[k]; return (id && ch.options.find(o => String(o.id) === String(id))) || ch.options[0]; };
  function pvDraw() {
    const D = T.data.D, by = {}; pv.changes.forEach(c => { (by[c.down] = by[c.down] || []).push(c); }); pv.loose.forEach(x => { by[x.down] = by[x.down] || []; });
    const rows = pv.changes.map((ch, k) => {
      if (ch.none) return `<tr><td><b>${T.esc(ch.bank)}</b></td><td colspan="2" class="small">No free game fits - this bank keeps ${T.esc(ch.down)}.</td></tr>`;
      const o = pvChoice(ch, k);
      return `<tr><td><b>${T.esc(ch.bank)}</b><div class="small">game ${ch.pos + 1}</div></td><td><select data-k="${k}" style="width:100%">${ch.options.map((x, i) => `<option value="${x.id}"${String(x.id) === String(o.id) ? ' selected' : ''}>${i === 0 ? '★ ' : ''}${T.esc(x.name)} (${x.era}, ~${Math.round(x.sec / 60)} min)${x.clash ? ' ⚠ ' + T.esc(x.clash) : ''}</option>`).join('')}</select>
        <div class="small" style="margin-top:3px">${o.clash ? `<span style="color:#b45309">⚠ ${T.esc(o.clash)}</span> · ` : ''}Play order: ${o.arenas.map(T.esc).join(' → ')}</div></td></tr>`;
    }).join('');
    const moving = downGames(D, pv.roundGames, pv.changes.filter(c => !c.none).map((c, k) => { const o = pvChoice(c, pv.changes.indexOf(c)); return { ...c, repl: o.name, replId: o.id }; }));
    pvHost.shadowRoot.innerHTML = `<style>${T.panel.CSS}:host{all:initial}.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:7vh 16px;overflow:auto}.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:640px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}.dh{padding:16px 20px 8px;font-size:18px;font-weight:500}.db{padding:4px 20px 16px}.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px}td{vertical-align:top;padding:6px 4px;border-top:1px solid var(--line)}</style>
      <div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov"><div class="dlg"><div class="dh">${Object.keys(by).map(T.esc).join(', ')} ${Object.keys(by).length === 1 ? 'is' : 'are'} going down</div><div class="db">
      <div class="small mb">${Object.entries(by).filter(([, cs]) => cs.length).map(([d, cs]) => `${T.esc(d)} is in ${cs.map(c => `${T.esc(c.bank)} (game ${c.pos + 1})`).join(' and ')}`).join('. ')}${pv.changes.length ? '. ' : ''}${pv.loose.length ? `${pv.loose.length} game${pv.loose.length === 1 ? ' is' : 's are'} waiting on or being played on it. ` : ''}★ = best fit (${pv.changes.length ? 'banks: not busy in another bank then, same era, keeps bank times even, games in the fewest banks' : 'same era, a similar game time, not busy right now, not one the group plays this round or played last round'}). Pick another if you like.</div>
      <table>${rows}${pv.loose.map((x, k) => { const v = pv.lpick[k] || 'best', o = x.options[0];
        return `<tr><td><b>${pvMax() ? T.esc(vsOf(x.g)) : x.g.set === 9999 ? 'Tiebreaker' : 'Group ' + (x.g.set + 1)}</b><div class="small">${pvMax() ? '' : `game ${(x.g.index ?? 0) + 1} · `}on ${T.esc(x.down)}</div></td><td><select data-l="${k}" style="width:100%"><option value="best"${v === 'best' ? ' selected' : ''}>★ Best: ${T.esc(o.name)} (${o.era}, ~${Math.round(o.sec / 60)} min)${o.busy ? ' - busy right now' : ''}</option><option value="random"${v === 'random' ? ' selected' : ''}>Random (any free game that fits)</option>${x.options.slice(1).map(c => `<option value="${c.id}"${String(v) === String(c.id) ? ' selected' : ''}>${T.esc(c.name)} (${c.era}, ~${Math.round(c.sec / 60)} min)${c.busy ? ' - busy right now' : ''}${c.last ? ' - played last round' : ''}</option>`).join('')}</select></td></tr>`; }).join('')}</table>
      ${moving.length ? `<div class="small mt">Also moves ${moving.length} game${moving.length === 1 ? '' : 's'} of the current round still waiting on it: ${moving.map(m => `Group ${m.group} → ${T.esc(m.name)}`).join(', ')}.</div>` : ''}
      </div><div class="df"><button class="btn sec" data-act="leave">${pv.changes.length ? 'Leave banks as they are' : 'Leave it'}</button><button class="btn" data-act="apply">Apply</button></div></div></div></div>`;
  }
  function pvChange(e) { const d = e.target.dataset || {}; if (!pv) return; if (d.l != null) { pv.lpick[d.l] = e.target.value; return pvDraw(); } if (d.k == null) return; pv.pick[d.k] = e.target.value; pvDraw(); }
  async function pvClick(e) {
    const a = e.target.closest('[data-act]'); if (!a || !pv) return;
    const close = () => { if (pvHost) pvHost.remove(); pvHost = null; };
    if (a.dataset.act === 'leave') { close(); T.panel.say(pv.changes.length ? 'Banks left as they are - the Banks tab shows a ⚠ until it\'s fixed.' : 'Left as it is.'); pv = null; return; }
    if (a.dataset.act !== 'apply') return;
    const changes = pv.changes.filter(c => !c.none).map(c => { const o = pvChoice(c, pv.changes.indexOf(c)); return { bank: c.bank, down: c.down, downId: c.downId, repl: o.name, replId: o.id, arenas: o.arenas }; });
    // games not moved by a bank change: best (default), random, or the one picked
    const items = pv.loose.map((x, k) => {
      const v = pv.lpick[k] || 'best', fit = x.options.filter(o => !o.busy && !o.last);
      const o = v === 'best' ? x.options[0] : v === 'random' ? (fit.length ? fit : x.options)[Math.floor(Math.random() * (fit.length || x.options.length))] : x.options.find(c => String(c.id) === String(v));
      return o && { gameId: x.g.gameId, arenaId: o.id, name: o.name, group: x.g.set === 9999 ? 'Tiebreaker' : x.g.set + 1, index: x.g.index ?? 0, ...(pvMax() ? { label: `${vsOf(x.g)} → ${o.name}` } : {}) };
    }).filter(Boolean);
    const tid = pv.tid, roundId = pv.roundId; close(); pv = null;
    const steps = [];
    if (changes.length) steps.push({ tid, page: 'banks', op: 'downFix', args: { tid, changes }, label: 'Replacing the down game in its banks' });
    if (items.length) steps.push({ tid, page: 'matches', op: 'smartAssign', args: { tid, roundId, items, change: true }, label: `Moving ${items.length} game${items.length === 1 ? '' : 's'} off the down machine` });
    try { if (steps.length) await T.jobs.start('A machine is down', steps); }
    catch (err) { T.panel.say(err.message || String(err), 'err'); }
  }

  return { VALUE, plan, input, make, roundToFill, fillSteps, decorate, downPlan, clashPlan, downGames, downCheck, isDown };
})();
