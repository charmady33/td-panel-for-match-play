// Finals planning: divisions from Matchplay's cut lines, B/C eligibility, backups, and the ties that matter.
var TDP = window.TDP || (window.TDP = {});

TDP.finals = (() => {
  const T = TDP;
  const DEF_LABEL = L => `${L} Ineligible`;

  // divisions = Matchplay cut lines (A, B, C...) matched to linked playoffs by order
  function divisions(D) {
    const q = D.qual; if (!q) return [];
    const cuts = [...(q.playoffsCutoffs || [])].sort((a, b) => (a.index || 0) - (b.index || 0));
    const st = T.tstate[q.tournamentId] || {};
    return cuts.map((c, i) => {
      const m = String(c.text || '').trim().match(/^([A-Z])\b/i);
      const letter = m ? m[1].toUpperCase() : T.letter(i);
      const cfg = (st.divs || {})[letter] || {};
      return {
        i, letter, size: Math.round(+c.value) || 0, color: c.color || 'indigo', text: c.text,
        finals: D.finals.find(f => f.linkIndex === i) || null,
        cutoff: i === 0 ? null : (cfg.cutoff ? Number(cfg.cutoff) : null),
        label: i === 0 ? null : (cfg.label || DEF_LABEL(letter)),
      };
    });
  }

  const ranksOf = D => ((T.tstate[D.qual && D.qual.tournamentId] || {}).ranks) || {};   // playerId -> IFPA rank
  const labelsOf = p => (p && p.tournamentPlayer && p.tournamentPlayer.labels) || [];

  // eligibility labels: "B Ineligible", "B/C Ineligible", "C/D Ineligible"… -> the division letters a player can't play
  const ELIG_RE = /^([A-Z](?:\s*\/\s*[A-Z])*)\s+Ineligible$/i;
  const lettersOf = p => { const out = new Set(); labelsOf(p).forEach(l => { const m = String(l).trim().match(ELIG_RE); if (m) m[1].split('/').forEach(x => out.add(x.trim().toUpperCase())); }); return out; };
  const eligLabel = letters => letters.length ? `${letters.join('/')} Ineligible` : null;
  // ineligible for division d: an eligibility label naming it (or its old custom label), or ranked at/better than its cutoff
  function ineligible(p, d, ranks) {
    if (!d || d.i === 0 || !p) return false;
    if (lettersOf(p).has(d.letter)) return true;
    if (d.label && labelsOf(p).some(l => l.toLowerCase() === d.label.toLowerCase())) return true;
    const r = ranks[p.playerId];
    return !!(d.cutoff && r && r <= d.cutoff);
  }

  // standings order (ties keep Matchplay's order) with player objects
  function order(D) {
    const pm = T.data.playerMap(D.qual);
    return [...D.standings].sort((a, b) => (a.position || 999) - (b.position || 999)).map(s => ({ ...s, p: pm[s.playerId] })).filter(r => r.p && (!r.p.tournamentPlayer || r.p.tournamentPlayer.status !== 'inactive'));
  }

  // who goes where if every qualifier shows up, plus 3 backups per division
  const isActive = p => !!p && (!p.tournamentPlayer || p.tournamentPlayer.status === 'active');
  function plan(D) {
    const divs = divisions(D), ranks = ranksOf(D), rows = order(D), taken = new Set();
    // who's in each finals tournament right now (checked in = active there)
    for (const d of divs) {
      d.inFinals = {}; d.finalsPlayers = [];
      if (d.finals && d.finals.t) for (const p of d.finals.t.players || []) { d.inFinals[p.playerId] = p; d.finalsPlayers.push(p); }
    }
    // a player checked in to a higher division (a backup who moved up) leaves the lower ones: everyone below moves up
    const upAbove = (d, id) => divs.some(o => o.i < d.i && isActive(o.inFinals[id]));
    for (const d of divs) {
      d.picks = [];
      for (const r of rows) { if (d.picks.length >= d.size) break; if (taken.has(r.playerId) || ineligible(r.p, d, ranks) || upAbove(d, r.playerId)) continue; d.picks.push(r); taken.add(r.playerId); }
    }
    for (const d of divs) {
      // backups: next qualifiers (eligible here) not already in this division - may come from a lower division
      d.backups = [];
      const inThis = id => d.picks.some(x => x.playerId === id) || d.inFinals[id];
      const higher = id => divs.some(o => o.i < d.i && (isActive(o.inFinals[id]) || o.picks.some(x => x.playerId === id)));
      for (const r of rows) {
        if (d.backups.length >= 12) break;   // the check-in list shows 3, "Show more" shows the rest
        if (inThis(r.playerId) || higher(r.playerId) || ineligible(r.p, d, ranks)) continue;
        d.backups.push({ ...r, from: divs.find(o => o.i > d.i && (o.inFinals[r.playerId] || o.picks.some(x => x.playerId === r.playerId))) || null });
      }
    }
    return divs;
  }

  // ---------- ties that need breaking ----------
  // Only ties that change the finals: a CUT line (who makes A/B/C, incl. the eligibility line Matchplay doesn't
  // flag), a BYE line (who skips round 1) or a PICK line (top seed in each group picks the games). Lines come from
  // each finals tournament's own settings. Resolved ties (Matchplay's manual tiebreakers) never show.
  function lines(d) {
    const ft = d.finals && d.finals.t, size = d.size || (d.picks || []).length;
    if (!ft || !size) return [];
    const out = [], B = Math.min(ft.bracketSize || size, size) || size;
    if (ft.type === 'group_bracket') {
      let L = 4; while (L * 2 <= B) L *= 2;
      const byes = B === L ? 0 : 2 * L - B;
      if (byes > 0) {
        out.push({ k: byes, kind: 'bye', text: `decides who gets a bye (seeds 1–${byes} skip round 1)` });
        out.push({ k: L / 4, kind: 'pick', text: `decides who picks games (seeds 1–${L / 4} pick in their first round)` });
        const g1 = (B - byes) / 4;
        if (g1 >= 1) out.push({ k: byes + g1, kind: 'pick', text: `decides who picks games in round 1 (seeds ${byes + 1}–${byes + g1} pick)` });
      } else if (B / 4 >= 1) out.push({ k: B / 4, kind: 'pick', text: `decides who picks games (seeds 1–${B / 4} pick)` });
    } else if (ft.type === 'bracket' || ft.type === 'double_bracket') {
      let P = 1; while (P < B) P *= 2;
      if (P - B > 0) out.push({ k: P - B, kind: 'bye', text: `decides who gets a bye (seeds 1–${P - B} skip round 1)` });
    } else if (ft.seeding && ft.seeding !== 'random' && Math.floor(size / 4) >= 1) {
      out.push({ k: Math.floor(size / 4), kind: 'pick', text: `decides who picks games (seeds 1–${Math.floor(size / 4)} pick)` });
    }
    return out.filter(l => l.k > 0 && l.k < size);
  }

  function qualifyingTies(D, divs) {
    const out = [], other = [], ranks = ranksOf(D), rows = order(D);
    const byPos = {}; rows.forEach(r => (byPos[r.position] = byPos[r.position] || []).push(r));
    const group = pos => byPos[pos] || [];
    const real = g => g.length > 1 && !g.some(r => r.manualTiebreakerGroup != null);   // 2+ players still tied
    const found = new Map();   // pos -> tie (one card per tied group, reasons added up)
    const add = (kind, pos, d, why, spots) => {
      const g = group(pos); if (!real(g)) return;
      const t = found.get(pos);
      if (t) { if (!t.reasons.includes(why)) t.reasons.push(why); if (kind === 'cutline' || kind === 'boundary') { t.kind = kind; t.spots = spots; } return; }
      found.set(pos, { kind, pos, players: g, div: d, reasons: [why], span: g.length, spots: spots == null ? g.length : spots });
    };
    // 1. Matchplay's own cut lines
    const cuts = [...(D.qual.playoffsCutoffs || [])].sort((x, y) => (x.index || 0) - (y.index || 0));
    const cutAt = (pos, n) => cuts.find(c => pos <= c.cumulative && pos + n - 1 > c.cumulative) || null;
    for (const r of rows) {
      const g = group(r.position); if (!real(g)) continue;
      const c = cutAt(r.position, g.length); if (!c) continue;
      const L = String(c.text || '').trim().charAt(0).toUpperCase() || 'A', spots = c.cumulative - r.position + 1;
      add('cutline', r.position, null, `decides who makes ${L} finals: ${g.length} tied at ${T.ord(r.position)} for ${spots} spot${spots === 1 ? '' : 's'} (top ${c.cumulative})`, spots);
    }
    for (const d of divs) {
      if (!d.picks || !d.picks.length) continue;
      const last = d.picks[d.picks.length - 1];
      // 2. the division's last spot when ineligible players are skipped (Matchplay doesn't flag this)
      const nextElig = rows.find(r => (r.position || 0) >= (last.position || 0) && !d.picks.includes(r) && !ineligible(r.p, d, ranks) && !divs.some(o => o.i < d.i && o.picks.includes(r)));
      const cutHere = found.get(last.position) && found.get(last.position).kind === 'cutline';   // same line Matchplay already flags
      if (d.picks.length >= d.size && nextElig && nextElig.position === last.position && !(cutHere && d.i === 0))
        add('boundary', last.position, d, `decides the last ${d.letter} finals spot (eligible players tied; Matchplay doesn't flag this because ineligible players are skipped)`, d.picks.filter(r => r.position === last.position).length);
      // 3. bye and pick lines inside the division (seed k | k+1)
      for (const l of lines(d)) {
        const a = d.picks[l.k - 1], b = d.picks[l.k];
        if (a && b && a.position === b.position) {
          const first = d.picks.findIndex(r => r.position === a.position);
          add(l.kind, a.position, d, `${d.letter} finals: ${l.text}`, l.k - first);
        }
      }
    }
    // every other tie: listed, but not highlighted
    for (const [pos, g] of Object.entries(byPos)) if (real(g) && !found.has(+pos)) other.push({ pos: +pos, players: g });
    const list = [...found.values()].sort((a, b) => a.pos - b.pos);
    list.forEach(t => { t.why = t.reasons.join('; '); });
    list.other = other.sort((a, b) => a.pos - b.pos);
    return list;
  }

  // finals in progress: ties inside each group of the current round
  function groupTies(D) {
    const t = D.t; if (!t || !/bracket|elim/i.test(t.type || '')) return [];
    const r = T.data.currentRound() || T.data.latestRound(); if (!r) return [];
    const gs = D.games.filter(g => g.roundId === r.roundId && !g.bye);
    const isFinal = (t.roundCount && (r.index != null ? r.index + 1 >= t.roundCount : D.rounds.length >= t.roundCount)) || /^final/i.test(r.name || '');
    const pm = T.data.playerMap(t), out = [];
    const sets = [...new Set(gs.filter(g => g.set !== 9999).map(g => g.set))];
    for (const s of sets) {
      const sg = gs.filter(g => g.set === s);
      if (!sg.length || !sg.every(T.timing.isDone)) continue;
      const tot = {};
      for (const g of sg) (g.playerIds || []).forEach((pid, i) => { tot[pid] = (tot[pid] || 0) + (Number((g.resultPoints || [])[i]) || 0); });
      const ranked = Object.entries(tot).sort((a, b) => b[1] - a[1]);
      const tb = gs.filter(g => g.set === 9999 && (g.playerIds || []).some(p => tot[p] != null));
      const tbOpen = tb.some(g => !T.timing.isDone(g)), tbDone = tb.length && tb.every(T.timing.isDone);
      const name = id => (pm[id] && pm[id].name) || ('#' + id);
      if (isFinal) {
        const dup = {}; ranked.forEach(([id, p]) => (dup[p] = dup[p] || []).push(id));
        for (const [pts, ids] of Object.entries(dup)) if (ids.length > 1) out.push({ kind: 'final', group: s + 1, pts: +pts, players: ids.map(name), tbOpen, tbDone, why: `Final - ${ids.length} players tied on ${pts}; every place needs a clear winner` });
      } else {
        const adv = Math.max(1, Math.floor(ranked.length / 2));
        if (ranked.length > adv && ranked[adv - 1][1] === ranked[adv][1]) {
          const pts = ranked[adv][1];
          out.push({ kind: 'advance', group: s + 1, pts, players: ranked.filter(x => x[1] === pts).map(x => name(x[0])), tbOpen, tbDone, why: `Group ${s + 1} - tie for the last advancing spot (${pts} pts)` });
        }
      }
    }
    return out;
  }

  return { ELIG_RE, lettersOf, eligLabel, divisions, plan, ineligible, ranksOf, labelsOf, qualifyingTies, lines, groupTies, order };
})();
