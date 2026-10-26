// Tiebreakers (IFPA18 §IV.1), opened from the Standings / Resolve ties pages.
//  - seeding-only ties (everyone advances): head-to-head win % in qualifying, then IFPA rank - no game
//  - bubble ties (not everyone advances): pick a game (IFPA draw Old/Mid/New + vote, or just random), random player
//    order, then the TD clicks the finishing order. Advancers keep their seeds by head-to-head (IFPA: the playoff only
//    decides who advances). Results are saved, so the TD can leave and come back to enter them.
//  - "Apply to Matchplay" opens Matchplay's Resolve window for that tie and saves the order there.
var TDP = window.TDP || (window.TDP = {});

TDP.ties = (() => {
  const T = TDP;
  let host = null, cur = null;   // cur = { key, tie } while the window is open
  const keyOf = t => `${t.pos}:${t.players.map(r => r.playerId).sort((a, b) => a - b).join(',')}`;
  const qidOf = D => D.qual && D.qual.tournamentId;
  const store = D => ((T.tstate[qidOf(D)] || {}).tb) || {};
  async function save(D, key, patch) {
    const qid = qidOf(D), tb = { ...store(D) };
    tb[key] = patch === null ? undefined : { ...(tb[key] || {}), ...patch, at: Date.now() };
    if (patch === null) delete tb[key];
    await T.saveT(qid, { tb });
  }
  async function markApplied(qid, key) {
    await T.loadT(qid);
    const tb = { ...((T.tstate[qid] || {}).tb || {}) };
    if (tb[key]) { tb[key] = { ...tb[key], status: 'done', appliedAt: Date.now() }; await T.saveT(qid, { tb }); }
    T.data.refresh(true);
  }
  const name = (D, id) => ((T.data.playerMap(D.qual)[id]) || {}).name || ('#' + id);
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const lc = s => String(s || '').toLowerCase();

  // ---------- head-to-head among the tied players (qualifying games: resultPositions = finish order of player ids) ----------
  function h2h(D, ids) {
    const rec = {}; ids.forEach(id => (rec[id] = { w: 0, l: 0 }));
    const set = new Set(ids.map(Number));
    for (const g of D.games) {
      const rp = (g.resultPositions || []).map(Number); if (rp.length < 2) continue;
      const here = rp.filter(p => set.has(p)); if (here.length < 2) continue;
      for (let i = 0; i < here.length; i++) for (let j = i + 1; j < here.length; j++) { rec[here[i]].w++; rec[here[j]].l++; }
    }
    const ranks = T.finals.ranksOf(D), pos = id => (D.standings.find(s => s.playerId === id) || {}).position || 999;
    const rows = ids.map(id => { const r = rec[id], n = r.w + r.l; return { id, w: r.w, l: r.l, pct: n ? r.w / n : null, rank: ranks[id] || null }; });
    // IFPA: highest head-to-head win % first; no head-to-head (or equal) -> initial IFPA rank decides
    rows.sort((a, b) => ((b.pct ?? -1) - (a.pct ?? -1)) || ((a.rank || 1e9) - (b.rank || 1e9)) || (pos(a.id) - pos(b.id)));
    return rows;
  }

  // ---------- game pick ----------
  function qualArenas(D) {
    return (D.qual.arenas || []).filter(a => !a.tournamentArena || a.tournamentArena.status !== 'inactive');
  }
  function drawIfpa(D) {   // one random Old (EM), Mid (SS), New (DMD + LCD); if an era is missing, draw from the rest
    const all = qualArenas(D), byEra = { EM: [], SS: [], DMD: [] };
    all.forEach(a => { const e = T.banks.eraOf(a) === 'LCD' ? 'DMD' : T.banks.eraOf(a); if (byEra[e]) byEra[e].push(a); });
    const out = [], used = new Set();
    for (const [label, era] of [['Old', 'EM'], ['Mid', 'SS'], ['New', 'DMD']]) {
      let pool = byEra[era].filter(a => !used.has(a.arenaId)); if (!pool.length) pool = all.filter(a => !used.has(a.arenaId));
      if (!pool.length) continue;
      const a = pool[Math.floor(Math.random() * pool.length)]; used.add(a.arenaId); out.push({ label, era: T.banks.eraOf(a), name: a.name });
    }
    return out;
  }
  const drawRandom = D => { const all = qualArenas(D); const a = all[Math.floor(Math.random() * all.length)]; return a ? a.name : null; };

  // final Matchplay order for a bubble tie: playoff winners (seeded by head-to-head) then the rest in playoff order
  function finalOrder(D, tie, finish) {
    const spots = Math.min(tie.spots || finish.length, finish.length);
    const adv = finish.slice(0, spots), out = finish.slice(spots);
    const advSeeded = adv.length > 1 ? h2h(D, adv).map(r => r.id) : adv;
    return [...advSeeded, ...out];
  }

  // ---------- decimals for resolved ties (Matchplay standings: manualTiebreakerGroup + their positions) ----------
  function decimals(D) {
    const map = new Map(), groups = {};
    for (const s of D.standings) if (s.manualTiebreakerGroup != null) (groups[s.manualTiebreakerGroup] = groups[s.manualTiebreakerGroup] || []).push(s);
    const tb = store(D);
    for (const g of Object.values(groups)) {
      g.sort((a, b) => a.position - b.position);
      const n = g.length, step = n <= 10 ? 0.1 : 0.01, dp = n <= 10 ? 1 : 2;
      const ids = g.map(s => s.playerId).sort((a, b) => a - b).join(',');
      const rec = Object.values(tb).find(x => x.status === 'done' && x.ids && [...x.ids].sort((a, b) => a - b).join(',') === ids);
      const how = rec ? (rec.kind === 'seeding' || rec.method === 'h2h' ? 'Head-to-head, then IFPA rank' : `Tiebreaker on ${rec.game}${rec.method === 'ifpa' ? ' (IFPA draw + vote)' : ' (random game)'}`) : 'Resolved in Matchplay (manual order)';
      g.forEach((s, i) => map.set(s.playerId, { pts: (Number(s.points) + (n - 1 - i) * step).toFixed(dp), title: `${how} · ${T.ord(i + 1)} of ${n} tied on ${Number(s.points)}` }));
    }
    return map;
  }
  const pending = D => Object.entries(store(D)).filter(([, x]) => x && x.status === 'playing').map(([key, x]) => ({ key, ...x }));

  // ---------- the window ----------
  const CSS = () => `${T.panel.CSS}
:host{all:initial}
.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:560px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}
.dh{padding:16px 20px 8px;font-size:18px;font-weight:500;display:flex;align-items:center;gap:8px}
.dlg{display:flex;flex-direction:column;max-height:88vh}
.db{padding:4px 20px 16px;overflow:auto;flex:1 1 auto;min-height:0}
.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px;flex-wrap:wrap;flex:none}
.pick{display:flex;flex-direction:column;gap:6px;margin:8px 0}
.pick button{text-align:left}
.opt{display:block;width:100%;text-align:left;white-space:normal;background:var(--card);border:1px solid var(--prib);border-radius:8px;padding:10px 12px;cursor:pointer;font:inherit;color:var(--text)}
.opt:hover{background:var(--head);border-color:var(--pril)}
.opt b{display:block;color:var(--pri2);font-size:14px;margin-bottom:2px}.opt span{display:block;font-size:13px;color:var(--muted)}
.opt .era{display:inline-block;margin-right:6px}
tr.out td{opacity:.5}
.slot{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px dashed var(--line);border-radius:6px;margin-bottom:6px;min-height:34px}
.slot b{width:36px;color:var(--soft)}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.game{font-size:16px;font-weight:600}`;
  function close() { if (host) host.remove(); host = null; cur = null; gcur = null; }
  function openByKey(D, key) { const t = T.finals.qualifyingTies(D, T.finals.plan(D)).find(x => keyOf(x) === key); const rec = store(D)[key]; if (t || rec) open(D, t || recToTie(D, rec), key); }
  const recToTie = (D, rec) => { const players = rec.ids.map(id => ({ playerId: id, p: { name: name(D, id) } })); return { pos: rec.pos, kind: rec.kind, spots: rec.spots, why: rec.why, sitOut: rec.sitOut || [], players, playing: players.filter(r => !(rec.sitOut || []).includes(r.playerId)) }; };
  // tied players who play the tiebreaker (the others aren't eligible for / in that division)
  const playIds = t => (t.playing || t.players).map(r => r.playerId);
  const outIds = t => t.sitOut || [];
  function open(D, tie, key) {
    key = key || keyOf(tie); cur = { key, tie, pickGame: false }; gcur = null;
    if (!host) {
      host = document.createElement('div'); host.id = 'tdp-tb';
      host.attachShadow({ mode: 'open' });
      host.shadowRoot.addEventListener('click', onClick);
      document.documentElement.appendChild(host);
    }
    draw();
  }
  // a tie Matchplay already resolved (opened from a "Manual" button)
  function openResolved(D, playerId) {
    const s = D.standings.find(x => x.playerId === playerId); if (!s || s.manualTiebreakerGroup == null) return;
    const g = D.standings.filter(x => x.manualTiebreakerGroup === s.manualTiebreakerGroup).sort((a, b) => a.position - b.position), dec = decimals(D);
    cur = { key: null, tie: null, resolved: g };
    if (!host) { host = document.createElement('div'); host.id = 'tdp-tb'; host.attachShadow({ mode: 'open' }); host.shadowRoot.addEventListener('click', onClick); document.documentElement.appendChild(host); }
    host.shadowRoot.innerHTML = `<style>${CSS()}</style><div class="wrap"><div class="ov" data-act="bg"><div class="dlg">
      <div class="dh">Resolved tie · positions ${g[0].position}–${g[g.length - 1].position}</div>
      <div class="db"><div class="small mb">${T.esc((dec.get(g[0].playerId) || {}).title || '').split(' · ')[0]}</div>
      <table><tr><th>Place</th><th>Player</th><th class="num">Points</th></tr>${g.map((x, i) => `<tr><td>${T.ord(x.position)}</td><td>${T.esc(name(D, x.playerId))}</td><td class="num"><b>${(dec.get(x.playerId) || {}).pts || x.points}</b></td></tr>`).join('')}</table>
      <div class="small mt">To change it, use Delete on this tie under Resolved ties, then break it again.</div></div>
      <div class="df"><a class="btn sec" href="/tournaments/${qidOf(D)}/resolve-ties">Resolve ties page</a><button class="btn" data-act="close">Okay</button></div></div></div></div>`;
  }

  const KIND = { cutline: 'Cut line', boundary: 'Cut line (eligibility)', bye: 'Bye', pick: 'Game picks', seeding: 'Seeding' };
  function draw() {
    if (!host || !cur || !cur.tie) return;
    const D = T.data.D, t = cur.tie, rec = store(D)[cur.key] || {}, all = t.players.map(r => r.playerId), ids = playIds(t), outs = outIds(t);
    const outNote = id => {
      const d = t.div, p = (T.data.playerMap(D.qual) || {})[id];
      return d && T.finals.ineligible(p, d, T.finals.ranksOf(D)) ? `${d.letter} Ineligible: doesn't play this tiebreaker` : `not in ${d ? d.letter + ' finals' : 'this division'}: doesn't play this tiebreaker`;
    };
    const bubble = t.kind === 'cutline' || t.kind === 'boundary';
    let body = '', foot = '';
    const head = `<div class="dh">Tie · positions ${t.pos}–${t.pos + all.length - 1}<span class="badge ${bubble ? 'b-rose' : 'b-amber'}">${KIND[t.kind] || 'Tie'}</span></div>`;
    const first = t.waitFor && !(store(D)[keyOf(t.waitFor)] || {}).status ? t.waitFor : null;
    const why = `<div class="callout mb"><b>Why it matters:</b> ${(t.reasons || [t.why]).map(T.esc).join('<br>')}</div>${first ? `<div class="callout warn mb"><b>Break the ${T.esc(first.letter)} cut-off tie first</b> (positions ${first.pos}–${first.pos + first.players.length - 1}): the ${T.esc(t.letter || '')} cut-off may move. <button class="link" data-act="goFirst">Open it</button></div>` : ''}`;
    const hRows = h2h(D, ids);
    const pts = id => { const st = D.standings.find(x => x.playerId === id) || {}; return st.points != null ? Number(st.points) : '–'; };
    const who = `<table class="mb"><tr><th>Player</th><th class="num">Points</th><th class="num">IFPA rank</th><th class="num">H2H W–L</th></tr>${hRows.map(r => `<tr><td>${T.esc(name(D, r.id))}</td><td class="num">${pts(r.id)}</td><td class="num">${r.rank || '–'}</td><td class="num">${r.w}–${r.l}</td></tr>`).join('')}
      ${outs.map(id => `<tr class="out"><td>${T.esc(name(D, id))} <span class="small">· ${T.esc(outNote(id))}</span></td><td class="num">${pts(id)}</td><td class="num">${(T.finals.ranksOf(D))[id] || '–'}</td><td class="num"></td></tr>`).join('')}</table>`;
    if (rec.status === 'done') {
      body = `${why}<div class="callout ok">Applied to Matchplay${rec.game ? ` · tiebreaker on <b>${T.esc(rec.game)}</b>` : rec.method === 'h2h' ? ' · head-to-head, then IFPA rank' : ''}.</div><ol>${(rec.final || []).map(id => `<li>${T.esc(name(D, id))}</li>`).join('')}</ol>`;
      foot = `<button class="btn sec" data-act="forget">Clear record</button><button class="btn" data-act="close">Close</button>`;
    } else if (!rec.status && !cur.pickGame) {
      // How to resolve: why it matters, who's tied, and the options for this kind of tie
      const opts = bubble ? [
        ['mIfpa', 'IFPA draw + vote', 'Recommended. Draws one Old (EM), Mid (SS) and New (DMD/LCD) game; the tied players vote by secret ballot; you click the winning game, then enter the finish.'],
        ['mRandom', 'Random game', 'One random game from the qualifying, played now; you enter the finish.'],
      ] : [
        ['mH2h', 'Head-to-head, then IFPA rank', 'Recommended (IFPA way for seeding). No game: order by head-to-head win % among these players in qualifying, then IFPA rank.'],
        ['mPlay', 'Play a tiebreaker game', 'Decide it on a game instead (IFPA draw + vote, or random).'],
      ];
      body = `${why}<div class="lab">Tied</div>${who}<div class="lab">How to resolve</div><div class="pick">${opts.map(([act, title, text]) => `<button class="opt" data-act="${act}"><b>${title}</b><span>${text}</span></button>`).join('')}</div>`;
      foot = `<button class="btn sec" data-act="close">Cancel</button>`;
    } else if (!rec.status && cur.pickGame) {
      body = `${why}<div class="lab">Pick the tiebreaker game</div><div class="pick"><button class="opt" data-act="mIfpa"><b>IFPA draw + vote</b><span>One Old (EM), Mid (SS) and New (DMD/LCD) game; the players vote.</span></button>
        <button class="opt" data-act="mRandom"><b>Random game</b><span>One random qualifying game.</span></button></div>`;
      foot = `<button class="btn sec" data-act="back">Back</button><button class="btn sec" data-act="close">Cancel</button>`;
    } else if (rec.status === 'h2h' || rec.kind === 'seeding' && rec.status === 'applying') {
      body = `${why}<div class="small mb">Head-to-head win % among these players in qualifying, then IFPA rank. No game.</div>
        <table><tr><th>New order</th><th>Player</th><th class="num">H2H W–L</th><th class="num">Win %</th><th class="num">IFPA</th></tr>${hRows.map((r, i) => `<tr><td>${T.ord(t.pos + i)}</td><td>${T.esc(name(D, r.id))}</td><td class="num">${r.w}–${r.l}</td><td class="num">${r.pct == null ? '–' : Math.round(r.pct * 100) + '%'}</td><td class="num">${r.rank || '–'}</td></tr>`).join('')}</table>`;
      cur.final = hRows.map(r => r.id).concat(outs);
      foot = `<button class="btn sec" data-act="restart">Back</button><button class="btn" data-act="apply">Apply to Matchplay</button>`;
    } else if (rec.status === 'vote') {
      body = `${why}<div class="small mb">Drawn games. Players vote by secret ballot; click the game with the most votes. If the vote is tied (after a re-vote), use Random pick.</div>
        <div class="pick">${rec.drawn.map((g, i) => `<button class="opt" data-act="choose" data-i="${i}"><b><span class="era era-${g.era}">${g.label}</span>${T.esc(g.name)}</b></button>`).join('')}</div>
        <div class="gap"><button class="btn sm sec" data-act="randPick">Random pick (vote tied)</button><button class="btn sm sec" data-act="mIfpa">Redraw</button></div>`;
      foot = `<button class="btn sec" data-act="restart">Start over</button><button class="btn sec" data-act="close">Close</button>`;
    } else if (rec.status === 'playing') {
      const order = rec.order || [], finish = rec.finish || [];
      const games = []; for (let i = 0; i < order.length; i += 4) games.push(order.slice(i, i + 4));
      body = `${why}<div class="callout">Tiebreaker on <span class="game">${T.esc(rec.game)}</span>${rec.method === 'ifpa' ? ' (IFPA draw + vote)' : ' (random game)'}</div>
        <div class="lab">Player order (random)</div>${games.map((g, gi) => `<div class="small">${games.length > 1 ? `Game ${gi + 1}: ` : ''}${g.map((id, i) => `P${i + 1} ${T.esc(name(D, id))}`).join(' · ')}</div>`).join('')}
        ${games.length > 1 ? '<div class="small">More tied players than one game holds: games are played in random order and scores compared as one game.</div>' : ''}
        <div class="lab mt">Finishing order - click players from 1st down</div>
        <div class="chips">${order.filter(id => !finish.includes(id)).map(id => `<button class="btn sm" data-act="fin" data-p="${id}">${T.esc(name(D, id))}</button>`).join('') || '<span class="small">All placed.</span>'}</div>
        ${ids.map((_, i) => `<div class="slot"><b>${T.ord(i + 1)}</b>${finish[i] ? T.esc(name(D, finish[i])) + (i < t.spots ? ` <span class="badge b-green">${bubble ? 'advances' : t.kind === 'bye' ? 'bye' : 'picks'}</span>` : '') : '<span class="small">–</span>'}</div>`).join('')}
        ${outs.length ? `<div class="small mt">Not playing: ${outs.map(id => T.esc(name(D, id))).join(', ')} (placed after the players above in Matchplay's order).</div>` : ''}
        ${finish.length === ids.length ? (() => { cur.final = (bubble ? finalOrder(D, t, finish) : finish).concat(outs); return `<div class="lab mt">Matchplay order</div><div class="small mb">${bubble ? 'Advancers seeded by head-to-head (IFPA: the tiebreaker only decides who advances), then the rest by tiebreaker finish.' : 'In tiebreaker finishing order.'}</div><ol>${cur.final.map(id => `<li>${T.esc(name(D, id))}</li>`).join('')}</ol>`; })() : ''}`;
      foot = `<button class="btn sec" data-act="restart">Start over</button>${finish.length ? '<button class="btn sec" data-act="undo">Undo</button>' : ''}<button class="btn sec" data-act="close">Close (results saved)</button><button class="btn" data-act="apply" ${finish.length === ids.length ? '' : 'disabled'}>Apply to Matchplay</button>`;
    }
    host.shadowRoot.innerHTML = `<style>${CSS()}</style><div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg">${head}<div class="db">${body}</div><div class="df">${foot}</div></div></div></div>`;
  }

  async function onClick(e) {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'bg' && e.target !== a) return;   // only a click on the dark background closes
    const D = T.data.D, act = a.dataset.act;
    if (act === 'bg' || act === 'close') return close();
    if (gcur && act.startsWith('g')) { try { await gClick(act, a); } catch (err) { T.panel.say(err.message || String(err), 'err'); } return; }
    if (!cur || !cur.tie) return;
    const t = cur.tie, all = t.players.map(r => r.playerId), ids = playIds(t), base = { pos: t.pos, ids: all, sitOut: outIds(t), kind: t.kind, spots: t.spots, why: t.why };
    try {
      if (act === 'goFirst' && t.waitFor) { open(D, t.waitFor); return; }
      if (act === 'mH2h') await save(D, cur.key, { ...base, status: 'h2h', method: 'h2h' });
      if (act === 'mPlay') { cur.pickGame = true; return draw(); }
      if (act === 'back') { cur.pickGame = false; return draw(); }
      if (act === 'mIfpa') await save(D, cur.key, { ...base, status: 'vote', method: 'ifpa', drawn: drawIfpa(D) });
      if (act === 'mRandom') await save(D, cur.key, { ...base, status: 'playing', method: 'random', game: drawRandom(D), order: shuffle(ids), finish: [] });
      if (act === 'choose') { const rec = store(D)[cur.key]; await save(D, cur.key, { status: 'playing', game: rec.drawn[+a.dataset.i].name, order: shuffle(ids), finish: [] }); }
      if (act === 'randPick') { const rec = store(D)[cur.key]; const g = rec.drawn[Math.floor(Math.random() * rec.drawn.length)]; await save(D, cur.key, { status: 'playing', game: g.name, order: shuffle(ids), finish: [], randomPick: true }); }
      if (act === 'fin') { const rec = store(D)[cur.key]; await save(D, cur.key, { finish: [...(rec.finish || []), +a.dataset.p] }); }
      if (act === 'undo') { const rec = store(D)[cur.key]; await save(D, cur.key, { finish: (rec.finish || []).slice(0, -1) }); }
      if (act === 'restart') { cur.pickGame = false; await save(D, cur.key, null); }
      if (act === 'forget') { await save(D, cur.key, null); return close(); }
      if (act === 'apply') {
        const final = cur.final || all, qid = qidOf(D), names = final.map(id => name(D, id));
        const was = (store(D)[cur.key] || {}).status;
        await save(D, cur.key, { ...base, final, status: was === 'playing' ? 'playing' : was === 'h2h' ? 'h2h' : 'applying', kind: t.kind });
        await T.jobs.start(`Break tie at ${T.ord(t.pos)}`, [{ tid: qid, page: 'resolve-ties', op: 'resolveTie', args: { from: t.pos, names, key: cur.key, qid }, label: `Resolving positions ${t.pos}–${t.pos + all.length - 1} in Matchplay` }]);
        return close();
      }
    } catch (err) { T.panel.say(err.message || String(err), 'err'); }
    draw();
  }

  // ---------- bracket finals: a tie inside a group (Matchplay has no tiebreaker for brackets) ----------
  // The TD plays a tiebreaker game; the extension records the finish. It shows by the group and Submit to IFPA uses it.
  const gKey = gt => `g:${gt.roundId}:${gt.group}:${gt.pts}`;
  const gStore = D => ((T.tstate[D.tid] || {}).gtb) || {};
  const gRec = (D, gt) => gStore(D)[gKey(gt)] || null;
  async function gSave(D, key, patch) {
    const all = { ...gStore(D) };
    if (patch === null) delete all[key]; else all[key] = { ...(all[key] || {}), ...patch, at: Date.now() };
    await T.saveT(D.tid, { gtb: all });
  }
  const gName = (D, id) => ((T.data.playerMap(D.t)[id]) || {}).name || ('#' + id);
  function finalsArenas(D) { return (D.t.arenas || []).filter(a => !a.tournamentArena || a.tournamentArena.status !== 'inactive'); }
  let gcur = null;
  function openGroup(D, gt) {
    gcur = { gt, key: gKey(gt), mp: !!(gt.tbGame && gt.tbOpen) };   // mp: Matchplay added the tiebreaker game - we only pick its arena
    cur = null;
    if (!host) { host = document.createElement('div'); host.id = 'tdp-tb'; host.attachShadow({ mode: 'open' }); host.shadowRoot.addEventListener('click', onClick); document.documentElement.appendChild(host); }
    gDraw();
  }
  function gDraw() {
    if (!host || !gcur) return;
    const D = T.data.D, gt = gcur.gt, rec = gStore(D)[gcur.key] || {}, ids = gt.ids;
    const place = i => T.ord(gt.place + i);
    let body = `<div class="callout mb"><b>Why it matters:</b> ${T.esc(gt.why)}. Matchplay has no tiebreaker for brackets: play one here and the extension records the result (shown by the group, and used for Submit to IFPA).</div>
      <div class="lab">Tied on ${gt.pts} points</div><div class="small mb">${ids.map(id => T.esc(gName(D, id))).join(', ')}</div>`, foot = '';
    if (gcur.mp) {
      // Matchplay's own tiebreaker game: pick the game (IFPA draw + vote, or random); the arena is set on Matchplay's game
      const am = T.data.arenaMap(D.t), cur2 = gt.tbGame.arenaId != null ? (am[gt.tbGame.arenaId] || {}).name : null;
      body = `<div class="callout mb"><b>Why it matters:</b> ${T.esc(gt.why)}. Matchplay added a tiebreaker game for ${ids.map(id => T.esc(gName(D, id))).join(' and ')}. Pick the game here; the extension sets it as that game's arena, then enter the result in Matchplay as usual.</div>`;
      if (cur2) { body += `<div class="callout ok">Tiebreaker arena: <b>${T.esc(cur2)}</b>. Enter the result on Matchplay's tiebreaker card.</div>`; foot = `<button class="btn" data-act="close">Close</button>`; }
      else if (gcur.drawn) {
        body += `<div class="small mb">Players vote by secret ballot; click the game with the most votes.</div><div class="pick">${gcur.drawn.map((g, i) => `<button class="opt" data-act="gSet" data-i="${i}"><b><span class="era era-${g.era}">${g.label}</span>${T.esc(g.name)}</b></button>`).join('')}</div>
          <div class="gap"><button class="btn sm sec" data-act="gSetRand">Random pick (vote tied)</button><button class="btn sm sec" data-act="gIfpa">Redraw</button></div>`;
        foot = `<button class="btn sec" data-act="close">Cancel</button>`;
      } else {
        body += `<div class="lab">Pick the tiebreaker game</div><div class="pick"><button class="opt" data-act="gIfpa"><b>IFPA draw + vote</b><span>Recommended. Draws one Old (EM), Mid (SS) and New (DMD/LCD) game from this finals; the tied players vote.</span></button>
          <button class="opt" data-act="gRandom"><b>Random game</b><span>One random game from this finals.</span></button></div>`;
        foot = `<button class="btn sec" data-act="close">Cancel</button>`;
      }
    } else if (rec.status === 'done') {
      body += `<div class="callout ok">Tiebreaker${rec.game ? ` on <b>${T.esc(rec.game)}</b>` : ''}: ${rec.finish.map((id, i) => `${T.esc(gName(D, id))} ${place(i)}`).join(', ')}</div>`;
      foot = `<button class="btn sec" data-act="gForget">Clear result</button><button class="btn" data-act="close">Close</button>`;
    } else if (!rec.status) {
      body += `<div class="lab">How to resolve</div><div class="pick"><button class="opt" data-act="gIfpa"><b>IFPA draw + vote</b><span>Recommended. Draws one Old (EM), Mid (SS) and New (DMD/LCD) game from this finals; the tied players vote; you click the winning game, then enter the finish.</span></button>
        <button class="opt" data-act="gRandom"><b>Random game</b><span>One random game from this finals, played now; you enter the finish.</span></button></div>`;
      foot = `<button class="btn sec" data-act="close">Cancel</button>`;
    } else if (rec.status === 'vote') {
      body += `<div class="small mb">Players vote by secret ballot; click the game with the most votes.</div><div class="pick">${rec.drawn.map((g, i) => `<button class="opt" data-act="gChoose" data-i="${i}"><b><span class="era era-${g.era}">${g.label}</span>${T.esc(g.name)}</b></button>`).join('')}</div>
        <div class="gap"><button class="btn sm sec" data-act="gRandPick">Random pick (vote tied)</button><button class="btn sm sec" data-act="gIfpa">Redraw</button></div>`;
      foot = `<button class="btn sec" data-act="gRestart">Start over</button><button class="btn sec" data-act="close">Close</button>`;
    } else if (rec.status === 'playing') {
      const fin = rec.finish || [];
      body += `<div class="callout">Tiebreaker on <span class="game">${T.esc(rec.game)}</span></div><div class="small">Player order (random): ${rec.order.map((id, i) => `P${i + 1} ${T.esc(gName(D, id))}`).join(' · ')}</div>
        <div class="lab mt">Finishing order - click players from best down</div>
        <div class="chips">${rec.order.filter(id => !fin.includes(id)).map(id => `<button class="btn sm" data-act="gFin" data-p="${id}">${T.esc(gName(D, id))}</button>`).join('') || '<span class="small">All placed.</span>'}</div>
        ${ids.map((_, i) => `<div class="slot"><b>${place(i)}</b>${fin[i] ? T.esc(gName(D, fin[i])) : '<span class="small">–</span>'}</div>`).join('')}`;
      foot = `<button class="btn sec" data-act="gRestart">Start over</button>${fin.length ? '<button class="btn sec" data-act="gUndo">Undo</button>' : ''}<button class="btn sec" data-act="close">Close (saved)</button><button class="btn" data-act="gDone" ${fin.length === ids.length ? '' : 'disabled'}>Save result</button>`;
    }
    host.shadowRoot.innerHTML = `<style>${CSS()}</style><div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg"><div class="dh">${T.esc(gt.groupName || 'Group ' + gt.group)} · tie<span class="badge b-rose">${gt.kind === 'final' ? 'Final' : 'Advancing spot'}</span></div><div class="db">${body}</div><div class="df">${foot}</div></div></div></div>`;
  }
  async function gClick(act, a) {
    const D = T.data.D, gt = gcur.gt, key = gcur.key, rec = gStore(D)[key] || {};
    const drawn = () => { const all = finalsArenas(D), byEra = { EM: [], SS: [], DMD: [] }; all.forEach(x => { const e = T.banks.eraOf(x) === 'LCD' ? 'DMD' : T.banks.eraOf(x); if (byEra[e]) byEra[e].push(x); }); const out = [], used = new Set(); for (const [label, era] of [['Old', 'EM'], ['Mid', 'SS'], ['New', 'DMD']]) { let pool = byEra[era].filter(x => !used.has(x.arenaId)); if (!pool.length) pool = all.filter(x => !used.has(x.arenaId)); if (!pool.length) continue; const x = pool[Math.floor(Math.random() * pool.length)]; used.add(x.arenaId); out.push({ label, era: T.banks.eraOf(x), name: x.name }); } return out; };
    const base = { ids: gt.ids, place: gt.place, pts: gt.pts, roundId: gt.roundId, group: gt.group };
    if (gcur.mp) {
      const setArena = async name => {
        const names = (gt.tbGame.playerIds || []).map(id => gName(D, id));
        close();
        await T.jobs.start(`Tiebreaker game: ${name}`, [{ tid: D.tid, page: 'matches', op: 'tiebreakerArena', args: { names, arena: name }, label: `Setting ${name} as the tiebreaker's arena` }]);
      };
      if (act === 'gIfpa') { gcur.drawn = drawn(); return gDraw(); }
      if (act === 'gRandom') { const all = finalsArenas(D), x = all[Math.floor(Math.random() * all.length)]; return x ? setArena(x.name) : null; }
      if (act === 'gSet') return setArena(gcur.drawn[+a.dataset.i].name);
      if (act === 'gSetRand') return setArena(gcur.drawn[Math.floor(Math.random() * gcur.drawn.length)].name);
      return;
    }
    if (act === 'gIfpa') await gSave(D, key, { ...base, status: 'vote', method: 'ifpa', drawn: drawn() });
    if (act === 'gRandom') { const all = finalsArenas(D), x = all[Math.floor(Math.random() * all.length)]; await gSave(D, key, { ...base, status: 'playing', method: 'random', game: x ? x.name : '', order: shuffle(gt.ids), finish: [] }); }
    if (act === 'gChoose') await gSave(D, key, { status: 'playing', game: rec.drawn[+a.dataset.i].name, order: shuffle(gt.ids), finish: [] });
    if (act === 'gRandPick') { const g = rec.drawn[Math.floor(Math.random() * rec.drawn.length)]; await gSave(D, key, { status: 'playing', game: g.name, order: shuffle(gt.ids), finish: [] }); }
    if (act === 'gFin') await gSave(D, key, { finish: [...(rec.finish || []), +a.dataset.p] });
    if (act === 'gUndo') await gSave(D, key, { finish: (rec.finish || []).slice(0, -1) });
    if (act === 'gRestart') await gSave(D, key, null);
    if (act === 'gForget') { await gSave(D, key, null); close(); T.inpage.render(); return; }
    if (act === 'gDone') { await gSave(D, key, { status: 'done' }); T.inpage.render(); }
    gDraw();
  }

  return { keyOf, open, openByKey, openResolved, openGroup, gRec, close, decimals, pending, markApplied, h2h };
})();
