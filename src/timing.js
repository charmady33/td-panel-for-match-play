// Game timing, ported from the Carpool Pinball remote app (server.js: realStart / gEnd / doneish / arenaTimes).
//  - a game STARTS at the latest of: its own startedAt, the end of its group's earlier games, the end of the
//    arena's earlier games in that round (Matchplay gives every game the round's start time, so we correct it)
//  - a game ENDS at the earlier of: the approved result (startedAt + duration), the first moment every player
//    had a suggested score or position (full pending approval), or the "Suggestion created" time in Matchplay's
//    Logs (logs.js - covers games the extension didn't watch). A partial suggestion does NOT end a game.
//  - games under 2 minutes or over 2 hours are left out of averages.
var TDP = window.TDP || (window.TDP = {});

TDP.timing = (() => {
  const GAME_MIN_MS = 2 * 60e3, GAME_MAX_MS = 2 * 3600e3;
  const ts = v => { if (!v) return null; const t = Date.parse(v); return isFinite(t) ? t : null; };
  const isDone = g => String(g && g.status || '').toLowerCase() === 'completed';
  const isTiebreak = g => g && g.set === 9999;

  // does every player in the game have a suggested score or position?
  function suggestState(g) {
    const sug = Array.isArray(g.suggestions) ? g.suggestions : [];
    if (!sug.length || isDone(g)) return 'none';
    const ids = (g.playerIds || []).map(String), inn = new Set();
    for (const x of sug) {
      for (const [pid, v] of Object.entries((x && x.scores) || {})) if (v != null && v !== '') inn.add(String(pid));
      const rs = Array.isArray(x && x.results) ? x.results : [];
      rs.forEach((v, i) => { if (v == null || v === '') return; if (ids.includes(String(v))) inn.add(String(v)); else if (ids[i] != null) inn.add(ids[i]); });
    }
    if (!inn.size) return 'none';
    return ids.length && ids.every(id => inn.has(id)) ? 'full' : 'partial';
  }

  // first time we saw a full suggestion for a game (Matchplay doesn't say when it was made)
  const fullSeen = {};   // gameId -> ms   (persisted per tournament by data.js)
  function noteSuggestions(games) {
    const now = Date.now();
    for (const g of games) {
      const st = suggestState(g);
      if (st === 'full') { if (!fullSeen[g.gameId]) fullSeen[g.gameId] = suggestionTime(g) || now; }
      else if (!isDone(g)) delete fullSeen[g.gameId];   // taken back: being played again
    }
  }
  function suggestionTime(g) {
    const t = (g.suggestions || []).map(x => ts(x.createdAt || x.updatedAt)).filter(Boolean);
    return t.length ? Math.max(...t) : null;
  }
  const doneish = g => isDone(g) || !!fullSeen[g.gameId];

  function approvedEnd(g) {
    const st = ts(g.startedAt), d = Number(g.duration);
    if (st == null || g.duration == null || !isFinite(d)) return null;
    return st + (d > 86400 ? d : d * 1000);
  }
  const logEnd = {};   // gameId -> ms (from Matchplay's Logs: when the approved scores were entered)
  function gEnd(g) {
    const c = [isDone(g) ? approvedEnd(g) : null, fullSeen[g.gameId] || null, isDone(g) ? (logEnd[g.gameId] || null) : null].filter(v => v != null);
    return c.length ? Math.min(...c) : null;
  }

  // real start of a game within its round's list of games
  function realStart(g, roundGames) {
    if (!g) return null;
    let t = ts(g.startedAt);
    if (t == null) return null;
    if (isTiebreak(g)) return t;
    const others = roundGames.filter(x => x !== g && !x.bye && x.roundId === g.roundId);
    for (const p of others) {
      const sameGroupEarlier = p.set === g.set && (p.index || 0) < (g.index || 0);
      const sameArenaEarlier = g.arenaId != null && p.arenaId === g.arenaId &&
        ((p.index || 0) < (g.index || 0) || ((p.index || 0) === (g.index || 0) && p.gameId < g.gameId));
      if (!sameGroupEarlier && !sameArenaEarlier) continue;
      if (!doneish(p)) return null;      // group or arena still busy: this game hasn't really started
      const e = gEnd(p); if (e != null && e > t) t = e;
    }
    return t;
  }
  function gameLen(g, roundGames) {
    if (!doneish(g)) return null;
    const st = realStart(g, roundGames), en = gEnd(g);
    return st != null && en != null && en > st ? en - st : null;
  }

  // per-arena averages from a list of games (one tournament)
  function arenaTimes(games) {
    const byRound = {};
    for (const g of games) (byRound[g.roundId] = byRound[g.roundId] || []).push(g);
    const lists = {};
    for (const g of games) {
      if (g.bye || isTiebreak(g) || g.arenaId == null || !doneish(g)) continue;
      const ms = gameLen(g, byRound[g.roundId]);
      if (ms == null || ms < GAME_MIN_MS || ms > GAME_MAX_MS) continue;
      (lists[g.arenaId] = lists[g.arenaId] || []).push(ms);
    }
    // the middle value (median), leaving out any game more than 3x that game's median (a game left open, etc.)
    const med = l => { const x = [...l].sort((a, b) => a - b), m = x.length >> 1; return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2; };
    const out = {};
    for (const [id, all] of Object.entries(lists)) {
      const m0 = med(all), l = all.filter(v => v <= 3 * m0);
      out[id] = { count: l.length, avg: med(l), min: Math.min(...l), max: Math.max(...l), list: l, dropped: all.length - l.length };
    }
    return out;
  }

  // round timer: first game's start -> last game done (full pending counts as done)
  function roundTimes(rounds, games) {
    return rounds.map(r => {
      const gs = games.filter(g => g.roundId === r.roundId && !g.bye);
      const starts = gs.map(g => ts(g.startedAt)).filter(v => v != null);
      const start = starts.length ? Math.min(...starts) : ts(r.createdAt);
      const allDone = gs.length > 0 && gs.every(doneish);
      const ends = gs.map(gEnd).filter(v => v != null);
      const end = allDone && ends.length ? Math.max(...ends) : null;
      return { roundId: r.roundId, name: r.name, status: r.status, start, end, games: gs.length, done: gs.filter(doneish).length, allDone };
    });
  }

  return { logEnd, ts, isDone, isTiebreak, suggestState, noteSuggestions, fullSeen, doneish, gEnd, realStart, gameLen, arenaTimes, roundTimes, GAME_MIN_MS, GAME_MAX_MS };
})();
