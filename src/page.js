// Runs inside Match Play's own page (MAIN world): passes the data Match Play already loaded (its Redux store) to the
// extension, right away and on every change. Read-only: nothing is fetched or changed here. Item 69.
(() => {
  if (window.__tdpPage) return;
  window.__tdpPage = 1;
  const SLICES = ['scorekeepers', 'tournaments', 'players', 'tournamentPlayers', 'arenas', 'tournamentArenas', 'banks', 'rounds', 'games', 'standings', 'tournamentStandings', 'linkedTournaments', 'bootData'];
  let store = null, last = {}, lastTid = null, timer = null;

  function findStore() {
    const root = document.getElementById('app'); if (!root) return null;
    const k = Object.keys(root).find(x => x.startsWith('__reactContainer')); if (!k) return null;
    const stack = [root[k]]; let n = 0;
    while (stack.length && n++ < 4000) {
      const f = stack.pop(); if (!f) continue;
      const p = f.memoizedProps;
      if (p && p.store && typeof p.store.getState === 'function' && typeof p.store.subscribe === 'function') return p.store;
      if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child);
    }
    return null;
  }
  const curTid = () => { const m = location.pathname.match(/^\/tournaments\/(\d+)/); return m ? +m[1] : null; };
  const vals = o => (o && typeof o === 'object' ? Object.values(o) : []);

  // Match Play's store -> the shapes the official API returns (tournament with players/arenas/banks/links, rounds, games)
  function build(s, id) {
    const g = k => (s[k] || {});
    const t = (g('tournaments').tournaments || {})[id];
    if (!t) return null;
    const pm = g('players').players || {}, tpm = g('tournamentPlayers').tournamentPlayers || {};
    const pids = (g('tournamentPlayers').tournaments || {})[id];
    const players = (pids || []).map(pid => { const p = pm[pid], tp = tpm[`${id}-${pid}`]; return p && tp ? { ...p, tournamentPlayer: tp } : null; }).filter(Boolean);
    const am = g('arenas').arenas || {}, tam = g('tournamentArenas').tournamentArenas || {};
    const aids = (g('tournamentArenas').tournaments || {})[id];
    const arenas = (aids || []).map(aid => { const a = am[aid], ta = tam[`${id}-${aid}`]; return a && ta ? { ...a, tournamentArena: ta } : null; }).filter(Boolean);
    const banks = vals(g('banks').banks).filter(b => b && b.tournamentId === id);
    const L = g('linkedTournaments'); let linksKnown = false; const links = [];
    for (const type of ['playoff', 'qualifying', 'series', 'arena', 'queue', 'entry']) {
      const m = L[type]; if (!m || !Object.prototype.hasOwnProperty.call(m, id)) continue;
      linksKnown = true;
      for (const l of m[id] || []) links.push({ ...l, linkType: l.linkType || type });
    }
    const rounds = vals(g('rounds').rounds).filter(r => r && r.tournamentId === id);
    const games = vals(g('games').games).filter(x => x && x.tournamentId === id);
    const sids = (g('tournamentStandings').tournamentStandings || {})[id], sm = g('standings').standings || {};
    const standings = Array.isArray(sids) && sids.length ? sids.map(pid => sm[`${id}-${pid}`]).filter(Boolean) : null;
    const skm = (g('scorekeepers').scorekeepers || {})[id];
    const boot = g('bootData').bootData || {};
    return {
      tid: id, at: Date.now(),
      t: { ...t, players, arenas, banks, linkedTournaments: links, ...(skm ? { scorekeepers: Object.values(skm) } : {}) },
      playersKnown: !!pids, arenasKnown: !!aids, linksKnown,
      rounds, games, standings,
      me: boot.currentUserId ? { userId: boot.currentUserId, name: [boot.firstName, boot.lastName].filter(Boolean).join(' ') } : null,
    };
  }
  window.__tdpBuild = build;   // (tests)

  function send(force) {
    if (!store) return;
    const id = curTid(); if (!id) return;
    const s = store.getState();
    if (!force && id === lastTid && SLICES.every(k => s[k] === last[k])) return;   // nothing we use changed
    lastTid = id; SLICES.forEach(k => { last[k] = s[k]; });
    let data = null;
    try { data = build(s, id); } catch (e) { data = null; }
    window.postMessage({ __tdp: 'page', data }, location.origin);
  }
  const soon = () => { if (!timer) timer = setTimeout(() => { timer = null; send(false); }, 120); };

  window.addEventListener('message', e => { if (e.source === window && e.data && e.data.__tdp === 'pageReq') send(true); });
  let tries = 0;
  (function look() {
    store = findStore();
    if (store) { store.subscribe(soon); send(true); setInterval(() => { if (curTid() !== lastTid) send(true); }, 700); return; }   // (a move to another tournament)
    if (++tries < 200) setTimeout(look, 300);
  })();
})();
