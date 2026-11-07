// TD Panel for Match Play - Max match play (items 105-112). No rounds here: every player plays the set number of
// matches (maxMatchplayDuration), 2 players a match, and Match Play's "Create matches" pairs players who are waiting
// (never two who already played each other). This adds:
//   - Auto create matches (off by default): when active games drop below N, Match Play's own Create matches is clicked
//     (No limit, All arenas, never the Emergency valve); it stops at M remaining games
//   - "Waiting for…" note: who still has matches left once others are done, and when only rematches are left
//   - progress "7 of 10" on the waiting list and the Standings tab
//   - Fill random results for a number of active games (Test tournaments)
var TDP = window.TDP || (window.TDP = {});

TDP.maxmp = (() => {
  const T = TDP;
  const isMax = D => !!(D && D.t && D.t.type === 'max_matchplay');
  const dur = D => +D.t.maxMatchplayDuration || 0;
  const isActive = g => g && !g.bye && String(g.status) === 'started';

  // ---------- the picture right now ----------
  // page data (Match Play's own counts) when the Matches tab has loaded it, else worked out from the games
  function state(D) {
    const p = T.page ? T.page.get(D.tid) : null, M = p && p.max;
    const n = dur(D), pm = T.data.playerMap(D.t);
    const ids = (D.t.players || []).filter(x => !x.tournamentPlayer || x.tournamentPlayer.status !== 'inactive').map(x => x.playerId);
    const active = (D.games || []).filter(isActive);
    const playing = new Set(active.flatMap(g => g.playerIds || []));
    const per = {};
    for (const id of ids) per[id] = { id, name: (pm[id] || {}).name || ('#' + id), count: 0, opp: new Set(), last: 0 };
    if (M && Array.isArray(M.players) && M.players.length) {
      for (const x of M.players) { const o = per[x.playerId]; if (!o) continue; o.count = +x.gameCount || 0; (x.allOpponents || []).forEach(q => o.opp.add(q)); o.last = (+x.completedTime || 0) * 1000; }
    } else {
      for (const g of D.games || []) {
        if (g.bye) continue;
        for (const id of g.playerIds || []) { const o = per[id]; if (!o) continue; o.count++; (g.playerIds || []).forEach(q => { if (q != null && q !== id) o.opp.add(q); }); }
      }
    }
    const players = Object.values(per).map(o => ({ ...o, playing: playing.has(o.id), left: Math.max(0, n - o.count), done: Math.max(0, o.count - (playing.has(o.id) ? 1 : 0)) }));
    const remaining = M && M.remaining != null ? +M.remaining : Math.ceil(players.reduce((s, o) => s + o.left, 0) / 2);
    const waiting = players.filter(o => !o.playing && o.left > 0);
    let canPair = false;
    for (let i = 0; i < waiting.length && !canPair; i++) for (let k = i + 1; k < waiting.length; k++) if (!waiting[i].opp.has(waiting[k].id)) { canPair = true; break; }
    // anyone left to play at all (waiting or playing) that a waiting player hasn't met yet
    const open = players.filter(o => o.left > 0);
    for (const o of waiting) o.partners = open.filter(q => q.id !== o.id && !o.opp.has(q.id) && !(q.playing && q.left <= 1)).length;
    return { n, players, active, waiting, canPair, remaining, finished: players.filter(o => o.left === 0 && !o.playing) };
  }
  const st = D => T.tstate[D.tid] || {};
  const belowOf = (D, S) => { const v = +st(D).maxBelow; return v > 0 ? v : Math.max(1, Math.floor(S.players.length / 2)); };
  const stopOf = D => Math.max(0, +st(D).maxStop || 0);

  // ---------- Matches tab ----------
  let autoState = '';
  const setAutoState = s => { if (autoState !== s) { autoState = s; if (T.inpage) T.inpage.render(); } };
  function box(D) {
    const s = st(D), S = state(D), N = belowOf(D, S), M = stopOf(D);
    const note = waitingNote(D, S, N);
    const testRow = D.t.test === true ? `<div class="cb gap" style="border-top:1px solid var(--line);flex-wrap:wrap;align-items:center;background:#fffbeb">
        <span class="badge b-amber">Test</span>
        <button class="btn sm sec" data-act="maxFill" ${S.active.length && !T.jobs.active() ? '' : 'disabled'}>Fill random results</button>
        <label class="gap small">for <input type="number" min="1" max="${S.active.length || 1}" data-f="maxFillN" value="${s.maxFillN || ''}" placeholder="all" style="width:64px"> active game(s)</label>
        <span class="small flex1">${S.active.length} active. Empty = all of them. Test tournaments only.</span></div>` : '';
    return `<div class="card" style="margin:12px 0"><div class="cb gap" style="flex-wrap:wrap;align-items:center">
      <label class="gap"><input type="checkbox" data-act="maxAuto" ${s.maxAuto ? 'checked' : ''}> <span class="lab">Auto create matches</span></label>
      <span class="small" title="When active games drop below the number under Active games, Match Play's own Create matches is clicked (No limit, All arenas - never the Emergency valve). Only when two waiting players haven't played each other yet. Stops at the number under Remaining games, so you can sort out the end yourself." style="cursor:help">ⓘ</span>
      <span class="small flex1">${s.maxAuto ? T.esc(autoState || `watching: below ${N} active, stops at ${M} remaining`) : 'Off'}</span>
      </div>${note}${testRow}</div>`;
  }
  function waitingNote(D, S, N) {
    const behind = S.players.filter(o => o.left > 0);
    if (!S.finished.length || !behind.length) return '';
    const stuck = S.waiting.filter(o => !o.partners);
    const list = behind.sort((a, b) => (b.left - a.left) || a.name.localeCompare(b.name)).slice(0, 12).map(o => {
      const how = o.playing ? 'playing now' : !o.partners ? '<b>waiting - only rematches left</b>' : 'waiting';
      return `${T.esc(o.name)} <span style="opacity:.75">(${o.done} of ${S.n}, ${how})</span>`;
    }).join(', ');
    const more = behind.length > 12 ? ` and ${behind.length - 12} more` : '';
    return `<div class="cb" style="border-top:1px solid var(--line);background:#eff6ff;color:#1e3a8a;font-size:13px">
      <b>Waiting for ${behind.length} player${behind.length === 1 ? '' : 's'}:</b> ${list}${more}.
      <div class="small" style="margin-top:4px">${S.finished.length} player${S.finished.length === 1 ? ' has' : 's have'} played all ${S.n}${S.active.length < N ? `, so fewer than ${N} games can be active` : ''}.${stuck.length ? ` Only rematches are left for ${stuck.map(o => T.esc(o.name)).join(', ')} - use Match Play's Create matches with the Emergency valve if they should still play.` : ''}</div></div>`;
  }
  async function onBox(e) {
    const D = T.data.D, el = e.target;
    if (e.type === 'click' && el.closest && el.closest('[data-act=maxFill]')) {
      const S = state(D), k = Math.min(S.active.length, +st(D).maxFillN || S.active.length);
      if (!k) return;
      try { await T.jobs.start(`Random results for ${k} game${k === 1 ? '' : 's'}`, [{ tid: D.tid, page: 'matches', op: 'fillMax', args: { tid: D.tid, count: k }, label: `Entering random results (${k})` }]); }
      catch (err) { T.panel.say(err.message || String(err), 'err'); }
      return;
    }
    if (e.type !== 'change') return;
    if (el.dataset.act === 'maxAuto') { await T.saveT(D.tid, { maxAuto: el.checked }); autoState = ''; T.inpage.render(); tick(T.data.D); }
    if (el.dataset.f === 'maxFillN') await T.saveT(D.tid, { maxFillN: el.value ? Math.max(1, Math.round(+el.value)) : null });
    if (el.dataset.f === 'maxBelow') { await T.saveT(D.tid, { maxBelow: el.value ? Math.max(1, Math.round(+el.value)) : null }); T.inpage.render(); tick(T.data.D); }
    if (el.dataset.f === 'maxStop') { await T.saveT(D.tid, { maxStop: el.value ? Math.max(0, Math.round(+el.value)) : null }); T.inpage.render(); tick(T.data.D); }
  }
  // the boxes under Match Play's "Active games" and "Remaining games" numbers
  const statDl = label => { const dt = [...document.querySelectorAll('main dt')].find(x => T.txt(x) === label); return dt ? dt.closest('dl') : null; };
  function statInputs(D) {
    const S = state(D), on = !!st(D).maxAuto;
    const a = statDl('Active games'), r = statDl('Remaining games');
    const css = 'font-size:12px;opacity:' + (on ? 1 : 0.7);
    T.inpage.block('tdp-max-below', a, 'after', `<label class="small gap" style="${css};margin-top:4px">Auto create below <input type="number" min="1" data-f="maxBelow" value="${belowOf(D, S)}" style="width:56px"></label>`, onBox);
    T.inpage.block('tdp-max-stop', r, 'after', `<label class="small gap" style="${css};margin-top:4px">Stop auto create at <input type="number" min="0" data-f="maxStop" value="${stopOf(D)}" style="width:56px"> left</label>`, onBox);
  }
  // "7 of 10" on the waiting list (Matches) and in the Games column (Standings)
  function progress(D, page) {
    const S = state(D), by = {}; S.players.forEach(o => { by[o.id] = o; });
    const pid = a => +((a.getAttribute('href') || '').match(/\/players\/(\d+)/) || [])[1];
    if (page === 'matches') {
      for (const a of document.querySelectorAll('main li > div:first-child > a[href*="/players/"]')) {
        const li = a.closest('li'), o = by[pid(a)]; if (!li || !o) continue;
        const sub = li.children[1]; if (!sub || !/\btext-xs\b/.test(sub.className || '')) continue;   // (the waiting list's rows, not the match cards)
        let sp = sub.querySelector('[data-tdp=prog]');
        const txt = ` · ${o.done} of ${S.n}`;
        if (!sp) { sp = document.createElement('span'); sp.dataset.tdp = 'prog'; sub.appendChild(sp); }
        if (sp.textContent !== txt) sp.textContent = txt;
      }
    }
    if (page === 'standings') {
      const table = document.querySelector('main table'); if (!table) return;
      const ths = [...table.querySelectorAll('thead th')], gi = ths.findIndex(th => /^games$/i.test(T.txt(th))); if (gi < 0) return;
      for (const tr of table.querySelectorAll('tbody tr')) {
        const a = tr.querySelector('a[href*="/players/"]'), o = a && by[pid(a)], td = tr.children[gi]; if (!o || !td) continue;
        let sp = td.querySelector('[data-tdp=prog]');
        const txt = ` of ${S.n}${o.playing ? ' +1 playing' : ''}`;
        if (!sp) { sp = document.createElement('span'); sp.dataset.tdp = 'prog'; sp.style.opacity = '.6'; td.appendChild(sp); }
        if (sp.textContent !== txt) sp.textContent = txt;
      }
    }
  }
  function render(D) {
    if (T.isFrame) return;
    const page = T.routePage(), on = isMax(D) && D.isTD;
    if (!on || page !== 'matches' || String(D.t.status) !== 'started') { T.inpage.block('tdp-max-below', null); T.inpage.block('tdp-max-stop', null); }
    else statInputs(D);
    if (on && (page === 'matches' || page === 'standings')) progress(D, page);
  }

  // ---------- automatic: create matches when active games drop below N ----------
  let lastTry = 0, lastSig = '', busy = false;
  async function lock(tid) {
    const k = 'lock:max:' + tid, cur = await T.store.get(k, null);
    if (cur && cur.tab !== T.tabId && Date.now() - cur.at < 30000) return false;
    await T.store.set(k, { tab: T.tabId, at: Date.now() }); return true;
  }
  async function tick(D) {
    if (!isMax(D) || T.isFrame || busy || !D.isTD || String(D.t.status) !== 'started') return;
    if (!st(D).maxAuto) return;
    if (T.jobs.active()) return setAutoState('waiting for the running task');
    const S = state(D), N = belowOf(D, S), M = stopOf(D);
    if (S.remaining <= M) return setAutoState(`stopped: ${S.remaining} remaining (stops at ${M}) - create the last matches yourself`);
    if (S.active.length >= N) return setAutoState(`${S.active.length} active - creates matches below ${N}`);
    if (!S.canPair) return setAutoState(S.waiting.length >= 2 ? `${S.waiting.length} waiting, but they've all played each other - waiting for more players` : `${S.active.length} active, ${S.waiting.length} waiting - nobody to pair yet`);
    const sig = S.active.map(g => g.gameId).sort().join(',') + '|' + S.waiting.map(o => o.id).sort().join(',');
    if (sig === lastSig && Date.now() - lastTry < 90e3) return;   // tried with exactly this picture already
    if (Date.now() - lastTry < 8e3) return;
    busy = true;
    try {
      if (!(await lock(D.tid))) return setAutoState('running in another tab');
      lastTry = Date.now(); lastSig = sig;
      setAutoState(`creating matches (${S.active.length} active, below ${N})`);
      await T.jobs.start('Create matches', [{ tid: D.tid, page: 'matches', op: 'createMatches', args: { tid: D.tid }, label: `Creating matches (${S.active.length} active, ${S.waiting.length} waiting)` }]);
    } catch (e) { /* another task started: next time */ }
    finally { busy = false; }
  }

  return { isMax, state, box, onBox, render, tick, belowOf, stopOf, setAutoState };
})();
