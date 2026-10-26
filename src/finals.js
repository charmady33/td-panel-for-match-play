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

  // ineligible for division d: carries that division's label, or ranked at/better than its cutoff
  function ineligible(p, d, ranks) {
    if (!d || d.i === 0 || !p) return false;
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
  function plan(D) {
    const divs = divisions(D), ranks = ranksOf(D), rows = order(D), taken = new Set();
    for (const d of divs) {
      d.picks = [];
      for (const r of rows) { if (d.picks.length >= d.size) break; if (taken.has(r.playerId) || ineligible(r.p, d, ranks)) continue; d.picks.push(r); taken.add(r.playerId); }
    }
    // in each finals tournament right now
    for (const d of divs) {
      d.inFinals = {}; d.finalsPlayers = [];
      if (d.finals && d.finals.t) for (const p of d.finals.t.players || []) { d.inFinals[p.playerId] = p; d.finalsPlayers.push(p); }
    }
    for (const d of divs) {
      // backups: next qualifiers (eligible here) not already in this division - may come from a lower division
      d.backups = [];
      const inThis = id => d.picks.some(x => x.playerId === id) || d.inFinals[id];
      const higher = id => divs.some(o => o.i < d.i && (o.inFinals[id] || o.picks.some(x => x.playerId === id)));
      for (const r of rows) {
        if (d.backups.length >= 3) break;
        if (inThis(r.playerId) || higher(r.playerId) || ineligible(r.p, d, ranks)) continue;
        d.backups.push({ ...r, from: divs.find(o => o.i > d.i && (o.inFinals[r.playerId] || o.picks.some(x => x.playerId === r.playerId))) || null });
      }
    }
    return divs;
  }

  // ---------- ties that need breaking ----------
  function qualifyingTies(D, divs) {
    const out = [], ranks = ranksOf(D), rows = order(D);
    const byPos = {}; rows.forEach(r => (byPos[r.position] = byPos[r.position] || []).push(r));
    const group = pos => byPos[pos] || [];
    const seen = new Set();
    // spots = how many of the tied players get the place being decided (bubble); seeding ties: everyone advances
    const add = (kind, pos, players, d, why, spots) => { const k = kind + pos + (d ? d.letter : ''); if (seen.has(k)) return; seen.add(k); out.push({ kind, pos, players, div: d, why, span: group(pos).length, spots: spots == null ? players.length : spots }); };
    // 1. Matchplay's own cut-line bubbles
    // which cut line a tie straddles (cumulative sizes: A = top 8, B = next 8 → 16...)
    const cuts = [...(D.qual.playoffsCutoffs || [])].sort((x, y) => (x.index || 0) - (y.index || 0));
    const cutName = (pos, n) => { const c = cuts.find(c => pos <= c.cumulative && pos + n - 1 > c.cumulative); return c ? c : null; };
    for (const r of rows) if (r.onCutoffBubble || r.onCutoffBubble2) {
      const g = group(r.position), c = cutName(r.position, g.length);
      const L = c ? (String(c.text || '').trim().charAt(0).toUpperCase() || 'A') : 'a';
      const spots = c ? c.cumulative - r.position + 1 : null;
      add('cutline', r.position, g, null, c ? `Decides who makes ${L} finals: ${g.length} players tied at ${T.ord(r.position)} for ${spots} spot${spots === 1 ? '' : 's'} above the ${L} cut line (top ${c.cumulative})` : 'Tie across a finals cut line', spots);
    }
    for (const d of divs) {
      if (!d.picks || !d.picks.length) continue;
      const last = d.picks[d.picks.length - 1];
      // 2. boundary of the division (includes the B/C-eligibility line Matchplay doesn't flag)
      const nextElig = rows.find(r => (r.position || 0) >= (last.position || 0) && !d.picks.includes(r) && !ineligible(r.p, d, ranks) && !divs.some(o => o.i < d.i && o.picks.includes(r)));
      if (d.picks.length >= d.size && nextElig && nextElig.position === last.position)
        add('boundary', last.position, group(last.position).filter(r => !ineligible(r.p, d, ranks)), d, d.i ? `Decides the last ${d.letter} finals spot: these ${d.letter}-eligible players are tied (Matchplay doesn't flag this because ineligible players are skipped)` : `Decides the last ${d.letter} finals spot`, d.picks.filter(r => r.position === last.position).length);
      // 3. seeding ties inside the division (groups, byes, bank-pick order)
      const posCount = {}; d.picks.forEach(r => (posCount[r.position] = (posCount[r.position] || 0) + 1));
      for (const [pos, n] of Object.entries(posCount)) if (n > 1) add('seeding', +pos, d.picks.filter(r => String(r.position) === pos), d, `${d.letter} finals seeding: decides who gets the higher seed - group placement, byes and bank-pick order`);
    }
    // one card per real problem: a cut-line tie already covers the same boundary/seeding tie at that position
    const cut = new Map(out.filter(t => t.kind === 'cutline').map(t => [t.pos, t]));
    const bound = new Set(out.filter(t => t.kind === 'boundary').map(t => t.pos));
    return out.filter(t => {
      if (t.kind === 'boundary' && cut.has(t.pos) && cut.get(t.pos).players.length === t.players.length) return false;
      if (t.kind === 'seeding' && (cut.has(t.pos) || bound.has(t.pos))) return false;
      return true;
    }).sort((a, b) => (a.pos || 0) - (b.pos || 0));
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

  return { divisions, plan, ineligible, ranksOf, labelsOf, qualifyingTies, groupTies, order };
})();
