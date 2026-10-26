// "Submit to IFPA": a button on a completed tournament's Overview and a step-by-step page:
//   1 Results (qualifying + every finals merged, ties numbered right, checks)  2 Meaningful games (per format)
//   3 Format notes  4 Submit (IFPA Tournament Manager checklist)  5 Done (45-day reminder until ticked)
// Grading follows the IFPA TGP guide; anything the guide leaves to IFPA's calculators or to email is flagged.
var TDP = window.TDP || (window.TDP = {});

TDP.ifpa = (() => {
  const T = TDP;
  const DAY = 864e5, WINDOW_DAYS = 45, PCT_PER_GAME = 4;
  const IFPA_URL = 'https://www.ifpapinball.com/how-to-submit-tournaments';
  const TYPE_NAME = {
    matchplay: 'Head-to-head match play', group_matchplay: 'Group match play', target: 'Target match play', max_matchplay: 'Max match play',
    pace_matchplay: 'Pace match play', round_robin: 'Round robin', double_round_robin: 'Double round robin', frenzy: 'Flip Frenzy',
    manual_matchplay: 'Manual match play', knockout: 'Strike knockout', group_knockout: 'Group strike knockout', bracket: 'Single elimination bracket',
    double_bracket: 'Double elimination bracket', group_bracket: 'Group elimination bracket', golf_bracket: 'Pingolf elimination bracket',
    ladder: 'Ladder elimination bracket', amazingrace: 'Amazing Race', best_game: 'Best game', card_best_game: 'Card-based best game', golf: 'Pingolf', bowling: 'Pinbowling',
  };
  const DIRECT = new Set(['matchplay', 'group_matchplay', 'round_robin', 'double_round_robin', 'manual_matchplay', 'target']);
  const arr = j => Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : []);
  const done = t => t && String(t.status) === 'completed';
  const ts = v => { const t = Date.parse(v); return isFinite(t) ? t : null; };

  // ---------- the family: qualifying + its finals (A, B, C...) ----------
  function family(D) {
    const qual = D.qual || D.t, finals = (D.finals || []).filter(f => f.t).sort((a, b) => a.linkIndex - b.linkIndex);
    const all = [qual, ...finals.map(f => f.t)];
    const completedAt = Math.max(...all.map(t => ts(t.completedAt) || 0));
    return { qual, finals, all, ready: all.every(done), completedAt: completedAt || null, qid: qual.tournamentId };
  }
  const state = F => (T.tstate[F.qid] || {}).ifpa || {};
  const saveState = (F, patch) => T.saveT(F.qid, { ifpa: { ...state(F), ...patch } });

  // ---------- data ----------
  async function load(t) {
    const id = t.tournamentId, age = done(t) ? 864e5 : 0;
    const standings = arr(T.data.unwrap(await T.api.get(`/tournaments/${id}/standings`, age)));
    const rounds = arr(T.data.unwrap(await T.api.get(`/tournaments/${id}/rounds`, age)));
    const games = await T.api.all(`/tournaments/${id}/games`, age);
    const gtb = ((await T.store.get('t:' + id, {})) || {}).gtb || {};   // bracket tiebreakers played with the extension
    return { t, standings, rounds, games, gtb, pm: T.data.playerMap(t) };
  }

  // ---------- 1. results ----------
  // finals places first (A, then B, C...), then everyone else by qualifying position; ties share the place
  // and the next place skips (1, 1, 3); players who played no games are left out
  function results(Q, Fs) {
    const lines = [], used = new Set(), checks = [], left = [];
    const add = (rows, pm, from) => {
      const base = lines.length;
      rows.forEach((r, i) => {
        const first = rows.findIndex(x => x.position === r.position), p = pm[r.playerId] || {};
        lines.push({ place: base + first + 1, pid: r.playerId, name: p.name || ('Player #' + r.playerId), ifpa: p.ifpaId || null, from });
        used.add(r.playerId);
      });
    };
    for (const f of Fs) {
      // a tie broken with the extension's bracket tiebreaker: those players get separate places, in its finish order
      const tb = new Map();
      Object.values(f.gtb || {}).filter(x => x && x.status === 'done' && x.finish).forEach(x => x.finish.forEach((id, i) => tb.set(id, i)));
      const rows = [...f.standings].filter(r => r.gamesPlayed !== 0).map(r => tb.has(r.playerId) ? { ...r, position: r.position + tb.get(r.playerId) / 100 } : r).sort((a, b) => a.position - b.position);
      add(rows, { ...Q.pm, ...f.pm }, f.label);
    }
    const qrows = [...Q.standings].sort((a, b) => a.position - b.position).filter(r => {
      if (used.has(r.playerId)) return false;
      if (r.gamesPlayed === 0) { left.push((Q.pm[r.playerId] || {}).name || r.playerId); return false; }
      return true;
    });
    add(qrows, Q.pm, Fs.length ? 'Qualifying' : '');
    // checks
    const missing = lines.filter(l => !l.ifpa);
    if (missing.length) checks.push({ kind: 'warn', text: `${missing.length} player${missing.length === 1 ? ' has' : 's have'} no IFPA number: ${missing.map(l => l.name).join(', ')}. IFPA matches them by name or adds them as new players. Add their numbers in Matchplay first if they have one.` });
    const seen = {}; lines.forEach(l => { if (l.ifpa) (seen[l.ifpa] = seen[l.ifpa] || []).push(l.name); });
    const dup = Object.entries(seen).filter(([, n]) => n.length > 1);
    if (dup.length) checks.push({ kind: 'err', text: 'Same IFPA number on more than one player: ' + dup.map(([id, n]) => `#${id} (${n.join(', ')})`).join('; ') });
    const qset = new Set(Q.standings.map(r => r.playerId)), outsiders = lines.filter(l => l.from && l.from !== 'Qualifying' && !qset.has(l.pid));
    if (outsiders.length) checks.push({ kind: 'warn', text: `In finals but not in qualifying: ${outsiders.map(l => l.name).join(', ')}.` });
    const played = Q.standings.filter(r => r.gamesPlayed !== 0).length;
    if (lines.length !== played && !outsiders.length) checks.push({ kind: 'warn', text: `${lines.length} players listed but ${played} played in qualifying.` });
    if (left.length) checks.push({ kind: 'ok', text: `Left out (played no games): ${left.join(', ')}.` });
    if (!checks.some(c => c.kind !== 'ok')) checks.unshift({ kind: 'ok', text: `${lines.length} players, every one with an IFPA number, no duplicates.` });
    return { lines, checks, text: lines.map(l => `${l.place},${l.name},${l.ifpa || ''}`).join('\n') };
  }

  // ---------- 2. meaningful games ----------
  // per round: games each group plays, and the group bonus (majority 4-player x2, majority 3-player x1.5, 3/4 even x1.5)
  function roundInfo(X) {
    const rounds = [...X.rounds].sort((a, b) => ((a.index != null ? a.index : a.roundId) - (b.index != null ? b.index : b.roundId)));
    return rounds.map((r, idx) => {
      const gs = X.games.filter(g => g.roundId === r.roundId && !g.bye && g.set !== 9999);
      const bySet = {}; gs.forEach(g => (bySet[g.set] = bySet[g.set] || []).push(g));
      const groups = Object.values(bySet), sizes = groups.map(l => Math.max(...l.map(g => (g.playerIds || []).length)));
      const n = sizes.length, c = k => sizes.filter(s => s === k).length;
      const mult = !n ? 1 : c(4) * 2 > n ? 2 : c(3) * 2 > n ? 1.5 : (c(3) === c(4) && c(3) * 2 === n) ? 1.5 : 1;
      const counts = groups.map(l => l.length), gpg = counts.length ? counts.sort((a, b) => counts.filter(v => v === b).length - counts.filter(v => v === a).length)[0] : 0;
      const players = new Set(gs.flatMap(g => g.playerIds || []));
      return { idx, r, groups: n, sizes, mult, gpg, players, mixed: n > 1 && new Set(sizes).size > 1, size: n ? sizes.sort((a, b) => c(b) - c(a))[0] : 0 };
    }).filter(x => x.groups);
  }
  const multName = m => m === 2 ? '×2 (4-player groups)' : m === 1.5 ? '×1.5 (3-player groups)' : '';
  const n1 = v => Math.round(v * 10) / 10;
  const tableLookup = (tbl, n) => { for (const [lo, hi, v] of tbl) if (n >= lo && n <= hi) return v; return null; };
  const STRIKES = { 4: [[4, 4, 5], [5, 5, 6], [6, 6, 7], [7, 7, 8], [8, 10, 9], [11, 1e9, 10]], 3: [[3, 3, 3], [4, 5, 4], [6, 1e9, 5]], 2: [[2, 2, 1], [3, 1e9, 2]] };
  const BRACKET = {
    1: [[4, 5, 2], [6, 11, 3], [12, 22, 4], [23, 45, 5], [46, 91, 6], [92, 189, 7], [190, 350, 8]],
    3: [[4, 4, 5], [5, 6, 6], [7, 7, 7], [8, 10, 8], [11, 13, 9], [14, 18, 10], [19, 24, 11], [25, 31, 12], [32, 42, 13], [43, 55, 14], [56, 73, 15], [74, 97, 16], [98, 127, 17], [128, 168, 18]],
    5: [[4, 4, 8], [5, 5, 9], [6, 6, 10], [7, 7, 11], [8, 8, 12], [9, 10, 13], [11, 12, 14], [13, 14, 15], [15, 17, 16], [18, 20, 17], [21, 24, 18], [25, 29, 19], [30, 34, 20]],
    7: [[4, 4, 11], [5, 5, 13], [6, 6, 14], [7, 7, 15], [8, 9, 17], [10, 10, 18], [11, 11, 19], [12, 13, 20], [14, 15, 21], [16, 17, 22], [18, 19, 23], [20, 21, 24], [22, 24, 25]],
  };
  const DOUBLE = { 1: [[4, 7, 5], [8, 15, 6], [16, 31, 7], [32, 63, 8], [64, 127, 9]], 3: [[4, 4, 11], [5, 5, 12], [6, 7, 13], [8, 9, 14], [10, 12, 15], [13, 17, 16], [18, 22, 17], [23, 29, 18], [30, 39, 19], [40, 51, 20]], 5: [[4, 4, 18], [5, 5, 19], [6, 6, 20], [7, 7, 21], [8, 8, 22], [9, 10, 23], [11, 12, 24], [13, 14, 25]] };

  // one tournament's meaningful games: { mg (null = TD enters it), math: [lines], flags: [text], bye: bool, info }
  function mgOf(X) {
    const t = X.t, type = t.type, R = roundInfo(X), out = { mg: null, math: [], flags: [], R };
    const players = X.standings.filter(r => r.gamesPlayed !== 0).length || X.standings.length;
    const allMult = (() => { const s = R.flatMap(x => x.sizes), n = s.length, c = k => s.filter(v => v === k).length; return !n ? 1 : c(4) * 2 > n ? 2 : c(3) * 2 > n ? 1.5 : 1; })();
    const avgPlayed = X.standings.length ? X.standings.reduce((s, r) => s + (r.gamesPlayed || 0), 0) / X.standings.length : 0;
    if (DIRECT.has(type)) {
      let sum = 0;
      const sig = {}; R.forEach(x => { const k = `${x.gpg}|${x.mult}`; (sig[k] = sig[k] || []).push(x); sum += x.gpg * x.mult; });
      Object.values(sig).forEach(l => out.math.push(`${l.length} round${l.length === 1 ? '' : 's'} × ${l[0].gpg} game${l[0].gpg === 1 ? '' : 's'}${l[0].mult !== 1 ? ' ' + multName(l[0].mult) : ''} = ${n1(l.length * l[0].gpg * l[0].mult)}`));
      out.mg = n1(sum);
      const mixed = R.filter(x => x.mixed);
      if (mixed.length) out.flags.push(`${mixed.length} round${mixed.length === 1 ? ' has' : 's have'} mixed group sizes; the bonus follows the majority of groups in each round.`);
    } else if (type === 'max_matchplay' || type === 'pace_matchplay') {
      out.mg = n1(avgPlayed * allMult);
      out.math.push(`average ${n1(avgPlayed)} games played${allMult !== 1 ? ' ' + multName(allMult) : ''} = ${out.mg}`);
      out.flags.push('The TGP guide has no fixed rule for this format; this uses the average games played. Confirm with IFPA.');
    } else if (type === 'frenzy') {
      out.mg = n1(avgPlayed / 2);
      out.math.push(`average ${n1(avgPlayed)} matches played ÷ 2 = ${out.mg}`);
    } else if (type === 'knockout' || type === 'group_knockout') {
      const size = R.length ? Math.max(2, Math.min(4, Math.round(R.reduce((s, x) => s + x.size, 0) / R.length))) : 2;
      out.mg = tableLookup(STRIKES[size], players);
      out.math.push(`IFPA strikes table, ${size}-player groups, ${players} players = ${out.mg}`);
      out.flags.push('Strike formats are graded with IFPA\'s strikes calculator (strikestgp.slapsave.com). Check this number there.');
    } else if (type === 'bracket' || type === 'double_bracket') {
      const bo = [1, 3, 5, 7].includes(t.gamesPerRound) ? t.gamesPerRound : 1;
      out.mg = tableLookup((type === 'bracket' ? BRACKET : DOUBLE)[bo] || [], players);
      out.math.push(`IFPA ${type === 'bracket' ? 'bracket' : 'winners/losers bracket'} table, best of ${bo}, ${players} players = ${out.mg == null ? '?' : out.mg}`);
      out.flags.push('Check the best-of setting matches what was played (IFPA TGP guide tables).');
    } else if (!R.length && type !== 'amazingrace' && !/best_game|golf|bowling|ladder/.test(type)) {
      out.flags.push(`No played games found in ${t.name || 'this tournament'}. Type the number in.`);
    } else if (type === 'group_bracket') {
      // shortest path to the title: from the latest round anyone joined, to the final
      const first = {}; R.forEach(x => x.players.forEach(p => { if (first[p] == null) first[p] = x.idx; }));
      const starts = Object.values(first), latest = starts.length ? Math.max(...starts) : 0;
      const path = R.filter(x => x.idx >= latest), full = R;
      out.mg = n1(path.reduce((s, x) => s + x.gpg * x.mult, 0));
      const fullMg = n1(full.reduce((s, x) => s + x.gpg * x.mult, 0));
      out.bye = latest > 0;
      out.byes = Object.values(first).filter(v => v === latest).length;
      out.math.push(`${path.length} round${path.length === 1 ? '' : 's'} × ${path[0] ? path[0].gpg : 0} games${path[0] && path[0].mult !== 1 ? ' ' + multName(path[0].mult) : ''} = ${out.mg}${out.bye ? ' (bye path)' : ''}`);
      if (out.bye) { out.math.push(`without byes it would be ${fullMg}`); out.flags.push('Finals with byes are a deviation: IFPA asks you to contact them (ifpapinball@gmail.com) so the event is graded right. The bye path is used here.'); }
    } else if (type === 'amazingrace') {
      out.mg = Math.max(0, players - 1); out.math.push(`${players} players − 1 = ${out.mg}`);
    } else if (type === 'ladder' || type === 'golf_bracket') {
      out.flags.push(`Use IFPA's ${type === 'ladder' ? 'ladder calculator (laddertgp.slapsave.com)' : 'calculator / contact IFPA'} and type the number in.`);
    } else if (type === 'best_game' || type === 'card_best_game') {
      out.flags.push('Count the scores that make up a qualifying total (not every game available). Open qualifying adds 1% per hour (max 20%). Type the number in.');
    } else if (type === 'golf' || type === 'bowling') {
      out.flags.push(type === 'bowling' ? 'Pinbowling: each frame counts 1/3 of a game (10 frames = 3.33, or 4 with a 10th-frame extra). Type the number in.' : 'Pingolf: see IFPA\'s Pingolf rules (course multiplier). Type the number in.');
    } else out.flags.push('Format not covered by the TGP guide: contact IFPA. Type the number in.');
    out.players = players;
    return out;
  }

  // the whole event: qualifying counts only if the A finals cut at least half the field; finals = A's (winner's) path
  function grade(Q, Fs) {
    const q = mgOf(Q), f = Fs.map(mgOf), parts = [], warns = [];
    const best = new Set(['best_game', 'card_best_game', 'golf', 'bowling']).has(Q.t.type);
    let total = 0, unknown = false;
    if (Fs.length) {
      const A = Fs[0], aSize = A.standings.filter(r => r.gamesPlayed !== 0).length || A.standings.length, field = q.players;
      const cut = field ? 1 - aSize / field : 0, counts = aSize <= field / 2;
      parts.push({ label: `Qualifying · ${TYPE_NAME[Q.t.type] || Q.t.type}`, ...q, counts, note: counts ? `${field} → ${aSize} in A finals (${Math.round(cut * 100)}% cut): counts` : `${field} → ${aSize} in A finals is less than a 50% cut: qualifying is seeding only and doesn't count` });
      if (!counts) warns.push('Qualifying cut is under 50%, so qualifying games don\'t count toward TGP.');
      if (counts) { if (q.mg == null) unknown = true; else total += q.mg; }
      parts.push({ label: `${A.label} · ${TYPE_NAME[A.t.type] || A.t.type}`, ...f[0], counts: true, note: 'The winner\'s (shortest) path through the finals' });
      if (f[0].mg == null) unknown = true; else total += f[0].mg;
      Fs.slice(1).forEach((x, i) => parts.push({ label: `${x.label} · ${TYPE_NAME[x.t.type] || x.t.type}`, ...f[i + 1], counts: false, note: 'Lower division: places are in the results, games don\'t add to TGP' }));
    } else {
      parts.push({ label: TYPE_NAME[Q.t.type] || Q.t.type, ...q, counts: true, note: '' });
      if (best) warns.push('Best-game style events need a finals with direct play for at least 10% of players, and a cut of at least half the field.');
      if (q.mg == null) unknown = true; else total += q.mg;
    }
    parts.filter(p => p.counts).forEach(p => p.flags.forEach(x => warns.push(x)));
    return { parts, total: n1(total), unknown, warns: [...new Set(warns)] };
  }

  // ---------- 3. format notes ----------
  function notes(F, Q, Fs, G, mg) {
    const L = [], q = G.parts[0];
    const desc = (X, p) => {
      const R = p.R || [], size = R.length ? R[0].size : 0, gpg = R.length ? R[0].gpg : X.t.gamesPerRound;
      if (DIRECT.has(X.t.type)) return `${p.players} players, ${R.length} round${R.length === 1 ? '' : 's'} of ${gpg}-game ${size ? size + '-player ' : ''}${(TYPE_NAME[X.t.type] || '').toLowerCase()}`;
      if (X.t.type === 'group_bracket') {
        const adv = R.length > 1 && R[0].groups ? Math.round((R[1].players.size - (p.byes || 0)) / R[0].groups) : 2;
        return `${size ? size + '-player groups, ' : ''}${gpg} games/round${p.bye ? `. Seeds 1-${p.byes} had byes to round 2` : ''}; top ${adv} per group advance`;
      }
      return `${p.players} players, ${(TYPE_NAME[X.t.type] || X.t.type).toLowerCase()}`;
    };
    const mgTxt = p => p.counts && p.mg != null ? ` (${p.mg} MG${p.bye ? ' bye path' : ''})` : '';
    if (Fs.length) {
      const sizes = Fs.map(f => (f.standings.filter(r => r.gamesPlayed !== 0).length || f.standings.length));
      L.push(`Qualifying: ${desc(Q, q)}${mgTxt(q)}. Top ${sizes[0]} to finals${Fs.length > 1 ? Fs.slice(1).map((f, i) => `, next ${sizes[i + 1]} to ${f.label}`).join('') : ''}.`);
      L.push(`Finals: ${desc(Fs[0], G.parts[1])}${mgTxt(G.parts[1])}.`);
    } else L.push(`${desc(Q, q)}${mgTxt(q)}.`);
    L.push(`Total: ${mg} meaningful games.`);
    const tb = Object.values((T.tstate[F.qid] || {}).tb || {}).some(x => x && x.method && (x.status === 'done' || x.final));
    if (tb) L.push('Qualifying ties broken with played tiebreaker games.');
    F.all.forEach(t => L.push(`https://app.matchplay.events/tournaments/${t.tournamentId}`));
    return L.join('\n');
  }

  // ---------- button on the Overview ----------
  // a copy of Matchplay's own "Re-open tournament" button (same classes, so same size, colour and dark mode),
  // on its own row right under it, with the deadline in small grey text below
  function render(D) {
    const reopen = T.routePage() === 'overview' && D && D.t && D.isTD ? T.findBtn(document.querySelector('main') || document, /^Re-open tournament$/) : null;
    let box = document.getElementById('tdp-ifpa-btn');
    if (!reopen) { if (box) box.remove(); return; }
    if (!done(D.t)) { if (!render.kick || Date.now() - render.kick > 10e3) { render.kick = Date.now(); T.data.refresh(true); } }   // just completed: catch up
    const F = family(D), s = state(F);
    let sub = '', subCls = '';
    if (!F.ready) sub = `${F.finals.some(f => !done(f.t)) ? 'Finals not completed yet' : 'Qualifying not completed yet'} - submitted once for the whole event`;
    else if (s.submittedAt) sub = `Submitted ${new Date(s.submittedAt).toLocaleDateString()}`;
    else { const left = F.completedAt ? Math.ceil((F.completedAt + WINDOW_DAYS * DAY - Date.now()) / DAY) : null; if (left != null) { sub = left > 0 ? `${left} day${left === 1 ? '' : 's'} left to submit` : "IFPA's 45-day window has passed - contact IFPA"; if (left <= 7) subCls = 'red'; } }
    const wrap = reopen.parentElement && reopen.parentElement.tagName === 'SPAN' ? reopen.parentElement : reopen;   // Matchplay wraps the button in a span
    if (!box || wrap.nextElementSibling !== box) {
      if (box) box.remove();
      box = document.createElement('div'); box.id = 'tdp-ifpa-btn'; box.style.marginTop = '8px';
      const copy = wrap.cloneNode(true), btn = copy.tagName === 'BUTTON' ? copy : copy.querySelector('button');
      btn.removeAttribute('disabled'); btn.type = 'button'; btn.dataset.tdpIfpa = '1';
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); open(T.data.D); });
      const note = document.createElement('div'); note.className = 'tdp-ifpa-note'; note.style.cssText = 'font-size:12px;text-align:center;margin-top:4px';
      box.append(copy, note);
      wrap.after(box);
    }
    const btn = box.querySelector('[data-tdp-ifpa]'), label = s.submittedAt ? 'IFPA submission ✓' : 'Submit to IFPA';
    if (btn.textContent.trim() !== label) btn.textContent = label;
    if (s.submittedAt) { btn.style.backgroundColor = '#059669'; btn.dataset.green = '1'; }
    else if (btn.dataset.green) { btn.style.backgroundColor = ''; delete btn.dataset.green; }   // only undo our own colour
    const note = box.querySelector('.tdp-ifpa-note');
    if (note.textContent !== sub) note.textContent = sub;
    note.style.color = subCls ? '#e11d48' : '#9ca3af';
  }

  // ---------- the page ----------
  let host = null, cur = null;
  const CSS = () => `${T.panel.CSS}
:host{all:initial}
.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto}
.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:760px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}
.dh{padding:16px 20px 4px;font-size:18px;font-weight:500}
.steps{display:flex;gap:4px;padding:8px 20px;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.steps button{border:0;background:none;font:inherit;font-size:13px;padding:4px 8px;border-radius:6px;cursor:pointer;color:var(--soft)}
.steps button.on{background:#eef2ff;color:#4338ca;font-weight:600}
.steps button.ok::after{content:' ✓';color:#059669}
.db{padding:12px 20px 16px;max-height:62vh;overflow:auto}
.df{background:var(--head);padding:12px 20px;display:flex;justify-content:space-between;gap:8px;border-radius:0 0 8px 8px;flex-wrap:wrap}
textarea{width:100%;min-height:220px;font:12px/1.5 ui-monospace,Menlo,monospace;border:1px solid #d1d5db;border-radius:6px;padding:8px;color:var(--text);background:var(--card);box-sizing:border-box}
.chk{display:flex;gap:8px;padding:6px 8px;border-radius:6px;margin-bottom:6px;font-size:13px}
.chk.ok{background:#ecfdf5;color:#065f46}.chk.warn{background:#fffbeb;color:#92400e}.chk.err{background:#fef2f2;color:#991b1b}
table{width:100%;border-collapse:collapse}td,th{padding:5px 6px;border-top:1px solid var(--line);text-align:left;vertical-align:top}
.big{font-size:28px;font-weight:600}
ol.todo{padding-left:0;list-style:none}ol.todo li{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-top:1px solid var(--line)}`;
  const STEPS = ['Results', 'Meaningful games', 'Format notes', 'Submit', 'Done'];

  async function open(D) {
    const F = family(D);
    cur = { F, step: state(F).step || 0, loading: true };
    if (!host) {
      host = document.createElement('div'); host.id = 'tdp-ifpa';
      host.attachShadow({ mode: 'open' });
      host.shadowRoot.addEventListener('click', onClick); host.shadowRoot.addEventListener('change', onChange);
      document.documentElement.appendChild(host);
    }
    draw();
    try {
      const Q = await load(F.qual), Fs = [];
      for (const [i, f] of F.finals.entries()) { const X = await load(f.t); X.label = `${(f.t.name || '').match(/\b([A-Z]) Finals\b/i) ? RegExp.$1.toUpperCase() : T.letter(i)} finals`; Fs.push(X); }
      cur.Q = Q; cur.Fs = Fs; cur.R = results(Q, Fs); cur.G = grade(Q, Fs);
    } catch (e) { cur.err = T.apiErrorText ? T.apiErrorText(e) : String(e); }
    cur.loading = false; draw();
  }
  function close() { if (host) host.remove(); host = null; cur = null; }
  const mgNow = () => { const o = state(cur.F).mg; return o != null && o !== '' ? Number(o) : cur.G.total; };

  function draw() {
    if (!host || !cur) return;
    const F = cur.F, s = state(F), step = cur.step;
    let body = '';
    if (cur.loading) body = '<div class="small">Loading standings and games…</div>';
    else if (cur.err) body = `<div class="chk err">${T.esc(cur.err)}</div>`;
    else if (!F.ready) body = `<div class="chk warn">${F.all.filter(t => !done(t)).map(t => T.esc(t.name)).join(', ')} ${F.all.filter(t => !done(t)).length === 1 ? 'is' : 'are'} not completed yet. Results go to IFPA once, for the whole event: complete ${F.all.filter(t => !done(t)).length === 1 ? 'it' : 'them'} first. You can still look through the steps.</div>`;
    if (!cur.loading && !cur.err) {
      if (step === 0) body += `<div class="small mb">Paste this into the results box in IFPA's Tournament Manager. Finals places come first${cur.Fs.length > 1 ? ' (A, then the other divisions)' : ''}, then everyone else by qualifying position. Tied players share a place and the next place is skipped.</div>
        ${cur.R.checks.map(c => `<div class="chk ${c.kind}">${c.kind === 'ok' ? '✓' : c.kind === 'err' ? '✕' : '!'} <span>${T.esc(c.text)}</span></div>`).join('')}
        <textarea readonly data-copy="results">${T.esc(cur.R.text)}</textarea>
        <div class="gap mt"><button class="btn" data-act="copy" data-what="results">Copy results</button><span class="small">Format: place,name,IFPA number</span></div>`;
      if (step === 1) body += `<div class="small mb">Meaningful games set the event's TGP (each one is worth ${PCT_PER_GAME}%). Worked out from each tournament's format and its Matchplay games, following the IFPA TGP guide.</div>
        <table><tr><th>Part</th><th>Games</th><th>How</th></tr>${cur.G.parts.map(p => `<tr><td><b>${T.esc(p.label)}</b><div class="small">${T.esc(p.note || '')}</div></td><td class="big" style="font-size:18px;${p.counts ? '' : 'opacity:.45;text-decoration:line-through'}">${p.mg == null ? '?' : p.mg}</td><td class="small">${p.math.map(T.esc).join('<br>') || '-'}</td></tr>`).join('')}</table>
        ${cur.G.warns.map(w => `<div class="chk warn mt">! <span>${T.esc(w)}</span></div>`).join('')}
        <div class="gap mt" style="align-items:center"><span>Total meaningful games</span><input type="number" step="0.5" min="0" data-f="mg" value="${mgNow()}" style="width:90px"><span class="small">${state(F).mg != null && state(F).mg !== '' ? `you changed it (worked out: ${cur.G.total}${cur.G.unknown ? ' + ?' : ''})` : cur.G.unknown ? 'part of this needs your number' : 'worked out'}</span></div>
        <div class="small mt">≈ ${Math.round(mgNow() * PCT_PER_GAME)}% TGP before IFPA's own limits. IFPA reviewers make the final call.</div>`;
      if (step === 2) body += `<div class="small mb">Goes in the notes / description box. Short is fine: format, the cut, byes, meaningful games and the Matchplay links.</div>
        <textarea data-copy="notes" data-f="notes" style="min-height:160px">${T.esc(s.notes != null ? s.notes : notes(F, cur.Q, cur.Fs, cur.G, mgNow()))}</textarea>
        <div class="gap mt"><button class="btn" data-act="copy" data-what="notes">Copy notes</button>${s.notes != null ? '<button class="btn sec" data-act="resetNotes">Rebuild from Matchplay</button>' : ''}</div>`;
      if (step === 3) {
        const todo = [['login', 'Log in to IFPA Tournament Manager with your TD account (it is separate from your IFPA player account).'], ['find', 'Open this event (the one you registered on the IFPA calendar).'], ['results', 'Paste the results from step 1.'], ['notes', 'Paste the format notes from step 2.'], ['mg', `Enter ${mgNow()} meaningful games if the form asks for it.`], ['submit', 'Submit.'], ['check', 'Open the results view and check for errors - the page doesn\'t change when you submit.']];
        const ck = s.checks || {};
        body += `<div class="gap mb"><a class="btn" href="${IFPA_URL}" target="_blank" rel="noopener">Open IFPA submission page ↗</a><button class="btn sec" data-act="copy" data-what="results">Copy results</button><button class="btn sec" data-act="copy" data-what="notes">Copy notes</button></div>
          <ol class="todo">${todo.map(([k, t], i) => `<li><input type="checkbox" data-ck="${k}" ${ck[k] ? 'checked' : ''}><span><b>${i + 1}.</b> ${T.esc(t)}</span></li>`).join('')}</ol>
          ${cur.G.parts.some(p => p.bye) ? '<div class="chk warn">! <span>Your finals had byes: IFPA asks you to email ifpapinball@gmail.com so the event is graded right. Mention the bye path in your notes (already included).</span></div>' : ''}
          <div class="small">IFPA wants results within ${WINDOW_DAYS} days of the event.</div>`;
      }
      if (step === 4) {
        const left = F.completedAt ? Math.ceil((F.completedAt + WINDOW_DAYS * DAY - Date.now()) / DAY) : null;
        body += s.submittedAt ? `<div class="chk ok">✓ <span>Marked as submitted on ${new Date(s.submittedAt).toLocaleString()}.</span></div><button class="btn sec" data-act="unsubmit">Mark as not submitted</button>`
          : `<div class="mb">${left != null ? `<b>${left > 0 ? left + ' day' + (left === 1 ? '' : 's') + ' left' : 'Past the 45-day window'}</b> to submit.` : ''} Until you tick this, the Overview shows a reminder.</div><button class="btn" data-act="submitted">I've submitted to IFPA</button>`;
      }
    }
    const okStep = i => i === 4 ? !!s.submittedAt : (s.seen || []).includes(i);
    host.shadowRoot.innerHTML = `<style>${CSS()}</style><div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg">
      <div class="dh">Submit to IFPA <span class="small">· ${T.esc(F.qual.name || '')}</span></div>
      <div class="steps">${STEPS.map((n, i) => `<button class="${i === step ? 'on' : ''} ${okStep(i) ? 'ok' : ''}" data-act="go" data-i="${i}">${i + 1}. ${n}</button>`).join('')}</div>
      <div class="db">${body}</div>
      <div class="df"><button class="btn sec" data-act="close">Close</button><span class="gap">${step > 0 ? '<button class="btn sec" data-act="back">Back</button>' : ''}${step < 4 ? '<button class="btn" data-act="next">Next</button>' : ''}</span></div>
    </div></div></div>`;
  }

  async function go(i) {
    const s = state(cur.F), seen = new Set(s.seen || []); seen.add(cur.step);
    cur.step = Math.max(0, Math.min(4, i)); await saveState(cur.F, { step: cur.step, seen: [...seen] }); draw();
  }
  async function onClick(e) {
    const a = e.target.closest('[data-act]'); if (!a || !cur) return;
    if (a.dataset.act === 'bg' && e.target !== a) return;
    const act = a.dataset.act;
    if (act === 'bg' || act === 'close') return close();
    if (act === 'go') return go(+a.dataset.i);
    if (act === 'next') return go(cur.step + 1);
    if (act === 'back') return go(cur.step - 1);
    if (act === 'copy') {
      const txt = a.dataset.what === 'results' ? cur.R.text : (state(cur.F).notes != null ? state(cur.F).notes : notes(cur.F, cur.Q, cur.Fs, cur.G, mgNow()));
      try { await navigator.clipboard.writeText(txt); a.textContent = 'Copied ✓'; } catch (err) { const ta = host.shadowRoot.querySelector(`[data-copy=${a.dataset.what}]`); if (ta) { ta.select(); document.execCommand('copy'); a.textContent = 'Copied ✓'; } }
      setTimeout(() => { if (a.isConnected) a.textContent = a.dataset.what === 'results' ? 'Copy results' : 'Copy notes'; }, 1500);
      return;
    }
    if (act === 'resetNotes') { await saveState(cur.F, { notes: null }); return draw(); }
    if (act === 'submitted') { await saveState(cur.F, { submittedAt: Date.now() }); T.inpage.render && T.inpage.render(); return draw(); }
    if (act === 'unsubmit') { await saveState(cur.F, { submittedAt: null }); return draw(); }
  }
  async function onChange(e) {
    const el = e.target; if (!cur) return;
    if (el.dataset.f === 'mg') { const v = el.value === '' ? null : Number(el.value); await saveState(cur.F, { mg: v === cur.G.total ? null : v }); return draw(); }
    if (el.dataset.f === 'notes') { await saveState(cur.F, { notes: el.value }); return; }
    if (el.dataset.ck) { const ck = { ...(state(cur.F).checks || {}), [el.dataset.ck]: el.checked }; await saveState(cur.F, { checks: ck }); }
  }

  return { render, open, close, results, mgOf, grade, notes, family };
})();
