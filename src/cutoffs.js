// Items 72, 76, 79: finals cutoff lines with an IFPA rank cut for each division after A, kept on the players as
// Matchplay labels ("B/C Ineligible", "C Ineligible"…), and "TD" / "Scorekeeper" labels.
//  - Manage cutoffs (Players tab bar + Standings tab): one window with every line - players above, label, IFPA rank
//  - Matchplay's own Manage cutoffs window: an "IFPA rank" box next to "Players above cutoff" (cutoff 2 on)
//  - Create new tournament: set the lines (and create the finals) up front - done right after Create tournament
//  - labels: Matchplay's own "Set rank labels" (its IFPA data, by IFPA number) for each rank range; new players (any
//    device, incl. the phone app) get theirs automatically; TD = organizer/managers, Scorekeeper = scorekeepers
//    (never both), matched by Match Play account; they don't count for standings or eligibility.
var TDP = window.TDP || (window.TDP = {});

TDP.cutoffs = (() => {
  const T = TDP;
  const COLORS = ['rose', 'orange', 'purple', 'sky', 'gray'];   // B…, C…, D… eligibility labels
  const STAFF = ['TD', 'Scorekeeper'];
  const FORMATS = [['group_bracket', 'Group elimination bracket'], ['bracket', 'Single elimination bracket'], ['double_bracket', 'Double elimination bracket'], ['golf_bracket', 'Pingolf elimination bracket'], ['bowling', 'Pinbowling finals'], ['ladder', 'Ladder elimination bracket'], ['amazingrace', 'Amazing Race'], ['group_matchplay', 'Group match play']];
  const isQual = D => !!(D && D.qual && D.tid === D.qual.tournamentId && D.isTD);
  const qst = D => T.tstate[D.qual.tournamentId] || {};
  const isElig = l => T.finals.ELIG_RE.test(String(l).trim());
  const isStaff = l => STAFF.includes(String(l).trim());
  const colorOf = label => { const m = String(label).match(/^([A-Z])/); return m ? COLORS[(m[1].charCodeAt(0) - 66 + COLORS.length * 4) % COLORS.length] : 'rose'; };

  // ---------- the rules (pure) ----------
  const cutsOf = D => { const out = {}; for (const [L, v] of Object.entries(qst(D).divs || {})) if (v && +v.cutoff > 0) out[L] = +v.cutoff; return out; };
  // {B: 1000, C: 3000} -> ranks 1-1000 "B/C Ineligible", 1001-3000 "C Ineligible"
  function ranges(cuts) {
    const e = Object.entries(cuts).filter(([, v]) => v > 0).sort((a, b) => a[1] - b[1]);
    let prev = 0;
    return e.map(([, v]) => {
      const letters = e.filter(([, w]) => w >= v).map(x => x[0]).sort();
      const r = { from: prev + 1, to: v, label: T.finals.eligLabel(letters), color: colorOf(letters[0]) };
      prev = v; return r;
    }).filter(r => r.from <= r.to);
  }
  // groups that take the eligibility labels off (other labels kept) - before Matchplay labels the ranges again
  function stripGroups(t) {
    const groups = new Map();
    for (const p of (t && t.players) || []) {
      const have = T.finals.labelsOf(p); if (!have.some(isElig)) continue;
      const next = have.filter(l => !isElig(l)), k = next.join('|');
      if (!groups.has(k)) groups.set(k, { ids: [], labels: next, color: next.includes('TD') ? 'sky' : next.includes('Scorekeeper') ? 'gray' : undefined });
      groups.get(k).ids.push(p.playerId);
    }
    return [...groups.values()];
  }
  // TD = organizer + managers; Scorekeeper = scorekeepers who aren't TDs (unknown list -> Scorekeeper labels left alone)
  function staffMap(t) {
    const uid = m => (m && typeof m === 'object' ? (m.userId || m.id) : m);
    const td = new Set([t.organizerId, ...(t.managers || []).map(uid)].filter(Boolean));
    const sk = Array.isArray(t.scorekeepers) ? new Set(t.scorekeepers.filter(x => x && x.role === 'scorekeeper').map(x => x.userId).filter(u => u && !td.has(u))) : null;
    return { td, sk };
  }
  function staffGroups(t) {
    if (!t) return [];
    const { td, sk } = staffMap(t), groups = new Map();
    for (const p of t.players || []) {
      const u = p.claimedBy, have = T.finals.labelsOf(p);
      let want = u && td.has(u) ? 'TD' : u && sk && sk.has(u) ? 'Scorekeeper' : null;
      if (!want && !sk && have.includes('Scorekeeper') && !(u && td.has(u))) want = 'Scorekeeper';   // (scorekeeper list not known here)
      const keep = have.filter(l => !isStaff(l)), next = want ? [...keep, want] : keep;
      if (next.join('|') === have.join('|')) continue;
      const el = keep.find(isElig);
      const color = el ? colorOf(el) : want === 'TD' ? 'sky' : want ? 'gray' : ((p.tournamentPlayer || {}).labelColor || undefined);
      const k = next.join('|') + '#' + color;
      if (!groups.has(k)) groups.set(k, { ids: [], labels: next, color });
      groups.get(k).ids.push(p.playerId);
    }
    return [...groups.values()];
  }

  // ---------- job steps ----------
  // everyone again: take the old eligibility labels off, Matchplay labels each rank range, then TD/Scorekeeper back
  function applySteps(D) {
    const qid = D.qual.tournamentId, rs = ranges(cutsOf(D)), strip = stripGroups(D.qual), steps = [];
    if (strip.length) steps.push({ tid: qid, page: 'players', op: 'labels', args: { groups: strip }, label: 'Taking off the old eligibility labels' });
    if (rs.length) steps.push({ tid: qid, page: 'players', op: 'eligApply', args: { tid: qid, ranges: rs, only: false }, label: 'Eligibility labels from IFPA ranks' });
    steps.push({ tid: qid, page: 'players', op: 'staffLabels', args: { tid: qid }, label: 'TD and Scorekeeper labels' });
    return steps;
  }
  async function saveCuts(D, cuts) {
    const st = { ...(qst(D).divs || {}) };
    for (const L of Object.keys(st)) if (!(L in cuts)) st[L] = { ...st[L], cutoff: null };
    for (const [L, v] of Object.entries(cuts)) st[L] = { ...(st[L] || {}), cutoff: v || null, label: null };
    await T.saveT(D.qual.tournamentId, { divs: st });
  }
  async function startApply(D, title) {
    const steps = applySteps(D);
    await T.saveT(D.qual.tournamentId, { knownPlayers: (D.qual.players || []).map(p => p.playerId) });
    try { await T.jobs.start(title || 'Eligibility labels', steps); } catch (e) { T.panel.say(e.message || String(e), 'err'); }
  }

  // ---------- new players (any device) and TD / Scorekeeper changes: labels by themselves ----------
  let autoAt = 0;
  async function auto(D) {
    if (!D || !D.t || !D.isTD || D.tid !== T.routeTid() || T.jobs.active() || Date.now() - autoAt < 15000) return;
    const st = T.tstate[D.tid] || {}, ids = (D.t.players || []).map(p => p.playerId);
    const steps = [];
    if (isQual(D)) {
      const known = st.knownPlayers;
      if (!known) { await T.saveT(D.tid, { knownPlayers: ids }); return; }   // first look: nothing to catch up on
      const fresh = ids.filter(id => !known.includes(id)), rs = ranges(cutsOf(D));
      if (fresh.length && rs.length) steps.push({ tid: D.tid, page: 'players', op: 'eligApply', args: { tid: D.tid, ranges: rs, only: true }, label: `Eligibility labels for ${fresh.length} new player${fresh.length === 1 ? '' : 's'}` });
      if (fresh.length || ids.length !== known.length) await T.saveT(D.tid, { knownPlayers: ids });
    }
    const sg = staffGroups(D.t), sig = JSON.stringify(sg.map(g => [g.ids, g.labels]));
    if (sg.length && (st.staffTried !== sig || Date.now() - (st.staffTriedAt || 0) > 30 * 60e3)) { steps.push({ tid: D.tid, page: 'players', op: 'staffLabels', args: { tid: D.tid }, label: 'TD and Scorekeeper labels' }); await T.saveT(D.tid, { staffTried: sig, staffTriedAt: Date.now() }); }
    else if (steps.length) steps.push({ tid: D.tid, page: 'players', op: 'staffLabels', args: { tid: D.tid }, label: 'TD and Scorekeeper labels' });
    if (!steps.length) return;
    autoAt = Date.now();
    try { await T.jobs.start('Player labels', steps); } catch (e) { /* another task is running: next time */ }
  }

  // ---------- Players tab bar + Standings button ----------
  function anchor() {
    const table = document.querySelector('main table'); if (!table) return null;
    let w = table;
    while (w.parentElement && w.parentElement.tagName !== 'MAIN' && !T.findBtn(w.parentElement, /^Add players$/) && !(w.parentElement.querySelector('#tdp-links') && w.parentElement.contains(table))) w = w.parentElement;
    return w;
  }
  function summary(D) {
    const ds = T.finals.divisions(D), cuts = cutsOf(D);
    return ds.map((d, i) => `<b>${T.esc(d.letter)}</b> ${d.size}${i && cuts[d.letter] ? ` · IFPA ≤ ${cuts[d.letter]}` : ''}`).join(' &nbsp;|&nbsp; ') || 'No cutoff lines yet.';
  }
  function counts(D) {
    const c = {}; for (const p of D.qual.players || []) { if (p.tournamentPlayer && p.tournamentPlayer.status === 'inactive') continue; for (const l of T.finals.labelsOf(p)) if (isElig(l) || isStaff(l)) c[l] = (c[l] || 0) + 1; }
    return Object.entries(c).sort().map(([l, n]) => `${T.esc(l)}: ${n}`).join(' · ');
  }
  function render(D) {
    if (T.isFrame) return;
    const page = T.routePage(), on = isQual(D) && (page === 'players' || page === 'standings');
    const a = on ? anchor() : null;
    if (!a) T.inpage.block('tdp-cut-bar', null);
    else T.inpage.block('tdp-cut-bar', a, 'before', `<div class="card" style="margin:0 0 12px"><div class="cb gap" style="flex-wrap:wrap;align-items:center">
      <span class="h">Cutoffs</span><button class="btn sm" data-act="open">Manage cutoffs</button>
      <span class="small flex1">${summary(D)}${counts(D) ? ` <span class="muted">· ${counts(D)}</span>` : ''}</span></div></div>`, onBar);
    if (D && D.t) auto(D);
  }
  function onBar(e) { if (e.type === 'click' && e.target.closest('[data-act=open]')) open(T.data.D); }

  // ---------- the Manage cutoffs window ----------
  let host = null, cur = null;
  const CSS = () => `${T.panel.CSS}
:host{all:initial}
.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:720px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}
.dh{padding:16px 20px 8px;font-size:18px;font-weight:500}.db{padding:4px 20px 16px;max-height:65vh;overflow:auto}
.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px;flex-wrap:wrap}
.ln{display:grid;grid-template-columns:80px 110px 1fr 120px 70px;gap:8px;align-items:center;margin:6px 0}.ln input{width:100%;box-sizing:border-box}
.hd{font-size:12px;color:var(--soft)}`;
  function open(D) {
    if (!isQual(D)) return;
    const cuts = cutsOf(D);
    cur = { lines: T.finals.divisions(D).map((d, i) => ({ above: d.size, text: d.text || '', color: d.color, rank: i ? (cuts[d.letter] || '') : '' })), err: '' };
    if (!cur.lines.length) cur.lines.push({ above: 8, text: 'A FINALS CUTOFF', rank: '' });
    cur.orig = JSON.stringify(cur.lines.map(l => [l.above, l.text]));
    if (!host) { host = document.createElement('div'); host.id = 'tdp-cut-dlg'; host.attachShadow({ mode: 'open' }); host.shadowRoot.addEventListener('click', onClick); host.shadowRoot.addEventListener('input', onInput); document.documentElement.appendChild(host); }
    draw();
  }
  function close() { if (host) host.remove(); host = null; cur = null; }
  function valid() {
    let prev = 0;
    for (const [i, l] of cur.lines.entries()) {
      if (!(+l.above > 0)) return `Cutoff ${i + 1}: players above must be 1 or more.`;
      if (i && l.rank) { if (+l.rank <= prev) return `Cutoff ${i + 1}: the IFPA rank must be a bigger number than the one before it.`; prev = +l.rank; }
    }
    return '';
  }
  function draw() {
    const rs = ranges(Object.fromEntries(cur.lines.map((l, i) => [T.letter(i), i ? +l.rank || 0 : 0]).filter(([, v]) => v)));
    host.shadowRoot.innerHTML = `<style>${CSS()}</style><div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg">
      <div class="dh">Manage cutoffs</div><div class="db">
        <div class="ln hd"><span></span><span>Players above</span><span>Line text</span><span>IFPA rank</span><span></span></div>
        ${cur.lines.map((l, i) => `<div class="ln"><b>Cutoff ${i + 1}</b><input type="number" min="1" data-f="above" data-i="${i}" value="${T.esc(l.above)}"><input type="text" data-f="text" data-i="${i}" value="${T.esc(l.text)}" placeholder="e.g. ${T.letter(i)} FINALS CUTOFF">${i ? `<input type="number" min="1" data-f="rank" data-i="${i}" value="${T.esc(l.rank)}" placeholder="e.g. 1000" title="Players ranked this or better can't play ${T.letter(i)} finals">` : '<span class="small muted">(A: open to all)</span>'}${cur.lines.length > 1 ? `<button class="btn sm sec" data-act="rm" data-i="${i}">Remove</button>` : '<span></span>'}</div>`).join('')}
        <button class="btn sm sec" data-act="add">+ Add another cutoff</button>
        ${cur.err ? `<div class="callout err mt">${T.esc(cur.err)}</div>` : ''}
        <div class="lab mt">Labels</div>
        <div class="small">${rs.length ? rs.map(r => `IFPA rank ${r.from}–${r.to}: <b>${T.esc(r.label)}</b>`).join('<br>') + '<br>Everyone else (and unranked players): no label - eligible for every finals.' : 'No IFPA rank cuts: nobody gets an eligibility label.'}</div>
        <div class="small muted mt">IFPA ranks come from Match Play's own IFPA data (refreshed when you save). Players added later - from any device, the phone app included - get their label automatically. TD and Scorekeeper labels are kept.</div>
      </div><div class="df"><button class="btn sec" data-act="close">Cancel</button><button class="btn" data-act="save">Save</button></div></div></div></div>`;
  }
  function onInput(e) { const f = e.target.dataset && e.target.dataset.f; if (!f || !cur) return; cur.lines[+e.target.dataset.i][f] = e.target.value; }
  async function onClick(e) {
    const a = e.target.closest('[data-act]'); if (!a || !cur) return;
    if (a.dataset.act === 'bg' && e.target !== a) return;
    const D = T.data.D, act = a.dataset.act;
    if (act === 'bg' || act === 'close') return close();
    if (act === 'add') { cur.lines.push({ above: 8, text: `${T.letter(cur.lines.length)} FINALS CUTOFF`, rank: '' }); return draw(); }
    if (act === 'rm') { cur.lines.splice(+a.dataset.i, 1); return draw(); }
    if (act === 'save') {
      cur.err = valid(); if (cur.err) return draw();
      const lines = cur.lines.map(l => ({ above: Math.round(+l.above), text: l.text, color: l.color }));
      const cuts = {}; cur.lines.forEach((l, i) => { if (i) cuts[T.letter(i)] = +l.rank || null; });
      const changed = JSON.stringify(lines.map(l => [l.above, l.text])) !== cur.orig;
      close();
      await saveCuts(D, cuts);
      const steps = [];
      if (changed) steps.push({ tid: D.qual.tournamentId, page: 'overview', op: 'setCutoffs', args: { lines }, label: "Saving the cutoff lines in Match Play" });
      steps.push(...applySteps(D));
      await T.saveT(D.qual.tournamentId, { knownPlayers: (D.qual.players || []).map(p => p.playerId) });
      try { await T.jobs.start('Cutoffs and labels', steps); } catch (err) { T.panel.say(err.message || String(err), 'err'); }
    }
  }

  // ---------- Matchplay's own Manage cutoffs window: an IFPA rank box per line (from cutoff 2) ----------
  function cutBlocks(d) {
    const all = [...d.querySelectorAll('div')].filter(x => x.firstElementChild && /^Cutoff \d+/.test(T.txt(x.firstElementChild)) && x.querySelector('input'));
    return all.filter(b => !all.some(o => o !== b && b.contains(o)));
  }
  function decorate() {
    if (T.isFrame || T.settings.off || T.dead) return;
    const d = T.dialog(), D = T.data.D;
    if (!d || !D || !isQual(D) || !/Players above cutoff/.test(T.txt(d)) || !T.findBtn(d, 'Add another cutoff')) return;
    const cuts = cutsOf(D);
    cutBlocks(d).forEach((b, i) => {
      if (!i || b.querySelector('[data-tdp=ifpa]')) return;
      const num = b.querySelector('input'); const row = num && num.closest('div.flex'); if (!row) return;
      const w = document.createElement('div'); w.dataset.tdp = 'ifpa'; w.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:16px';
      w.innerHTML = `<span style="font-size:13px;font-weight:500">IFPA rank</span><input data-tdp="ifpa-in" type="text" inputmode="numeric" value="${cuts[T.letter(i)] || ''}" placeholder="e.g. 1000" title="Players ranked this or better can't play ${T.letter(i)} finals (blank = no rank limit)" style="width:90px;height:34px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:6px;padding:0 8px;font-size:14px">`;
      row.appendChild(w);
    });
  }
  // Update in Matchplay's window: keep the ranks; once Matchplay has saved the lines, label everyone again
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button'); const d = b && b.closest('[role=dialog]');
    if (!d || T.txt(b) !== 'Update' || !d.querySelector('[data-tdp=ifpa-in]') && !/Players above cutoff/.test(T.txt(d))) return;
    const D = T.data.D; if (!isQual(D)) return;
    const cuts = {}; cutBlocks(d).forEach((blk, i) => { if (!i) return; const inp = blk.querySelector('[data-tdp=ifpa-in]'); const v = inp ? parseInt(inp.value, 10) : NaN; cuts[T.letter(i)] = v > 0 ? v : null; });
    (async () => {
      await saveCuts(D, cuts);
      await T.waitFor(() => !T.dialog(), 8000, 100);
      await T.sleep(1200); await T.data.refresh(true);
      startApply(T.data.D, 'Eligibility labels');
    })();
  }, true);

  // ---------- Create new tournament: cutoffs (and finals) up front ----------
  let copts = null;
  const onCreatePage = () => /^\/tournaments\/new\/?$/.test(location.pathname);
  async function cload() { if (!copts) copts = { on: false, lines: [{ above: 8, text: 'A FINALS CUTOFF', rank: '', finals: true, name: 'A Finals', format: 'group_bracket' }], ...(await T.store.get('cutoffs:create', {})) }; return copts; }
  function createRender() {
    if (T.isFrame || !onCreatePage()) { T.inpage.block('tdp-cut-create', null); return; }
    const sub = [...document.querySelectorAll('main button')].find(b => /^Create tournament$/i.test(T.txt(b)));
    const form = sub && (sub.closest('form') || sub.parentElement);
    if (!form) { T.inpage.block('tdp-cut-create', null); return; }
    if (!copts) { cload().then(createRender); return; }
    const L = copts.lines;
    let foot = sub; while (foot.parentElement && foot.parentElement !== form && foot.parentElement.tagName !== 'MAIN') foot = foot.parentElement;   // (the button row)
    T.inpage.block('tdp-cut-create', foot, 'before', `<div class="card" style="margin:12px 0"><div class="cb">
      <label class="gap" style="align-items:center"><input type="checkbox" data-c="on" ${copts.on ? 'checked' : ''}><span class="h">Cutoffs and finals</span><span class="small">set them up now (done right after Create tournament)</span></label>
      ${copts.on ? `<table style="width:100%;margin-top:8px;font-size:13px"><tr class="small muted"><td></td><td>Players above</td><td>Line text</td><td>IFPA rank</td><td>Create finals</td><td>Finals name</td><td>Format</td><td></td></tr>
      ${L.map((l, i) => `<tr><td><b>Cutoff ${i + 1}</b></td><td><input type="number" min="1" data-c="above" data-i="${i}" value="${T.esc(l.above)}" style="width:70px"></td><td><input type="text" data-c="text" data-i="${i}" value="${T.esc(l.text)}" style="width:150px"></td>
        <td>${i ? `<input type="number" min="1" data-c="rank" data-i="${i}" value="${T.esc(l.rank)}" placeholder="e.g. 1000" style="width:90px">` : '<span class="small muted">open</span>'}</td>
        <td style="text-align:center"><input type="checkbox" data-c="finals" data-i="${i}" ${l.finals ? 'checked' : ''}></td><td><input type="text" data-c="name" data-i="${i}" value="${T.esc(l.name)}" style="width:110px" ${l.finals ? '' : 'disabled'}></td>
        <td><select data-c="format" data-i="${i}" ${l.finals ? '' : 'disabled'}>${FORMATS.map(([v, t]) => `<option value="${v}"${l.format === v ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
        <td>${L.length > 1 ? `<button class="btn sm sec" data-c="rm" data-i="${i}" type="button">Remove</button>` : ''}</td></tr>`).join('')}</table>
      <button class="btn sm sec mt" data-c="add" type="button">+ Add another cutoff</button>
      <div class="small muted mt">IFPA rank: players ranked this or better can't play that finals (labels like "B Ineligible" follow as players are added). Each finals is created with Match Play's own Create playoffs, sized to its players above.</div>` : ''}
    </div></div>`, onCreateEvent);
  }
  function onCreateEvent(e) {
    if (!copts) return;
    const el = e.target, c = el.dataset && el.dataset.c; if (!c) return;
    const i = +el.dataset.i, L = copts.lines;
    if (e.type === 'click' && c === 'add') { const k = L.length; L.push({ above: 8, text: `${T.letter(k)} FINALS CUTOFF`, rank: '', finals: true, name: `${T.letter(k)} Finals`, format: 'group_bracket' }); }
    else if (e.type === 'click' && c === 'rm') L.splice(i, 1);
    else if (e.type === 'change' && c === 'on') copts.on = el.checked;
    else if (e.type === 'change' && c === 'finals') L[i].finals = el.checked;
    else if ((e.type === 'input' || e.type === 'change') && ['above', 'text', 'rank', 'name', 'format'].includes(c)) { L[i][c] = el.value; T.store.set('cutoffs:create', copts); return; }
    else return;
    T.store.set('cutoffs:create', copts); createRender();
  }
  if (!T.isFrame) document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('button'); if (!b || !onCreatePage() || !/^Create tournament$/i.test(T.txt(b)) || !copts || !copts.on) return;
    T.store.set('cutoffs:pending', { lines: copts.lines.map(l => ({ ...l })), at: Date.now() });
  }, true);
  // on the new tournament's page: Matchplay's cutoff lines, the finals, and the rank cuts
  async function after(tid) {
    if (T.isFrame || !tid) return;
    const p = await T.store.get('cutoffs:pending', null);
    if (!p || Date.now() - p.at > 120e3) return;
    await T.store.del('cutoffs:pending');
    const lines = p.lines.map(l => ({ above: Math.max(1, Math.round(+l.above || 8)), text: l.text }));
    const divs = {}; p.lines.forEach((l, i) => { if (i) divs[T.letter(i)] = { cutoff: +l.rank || null, label: null }; });
    await T.loadT(tid); await T.saveT(tid, { divs });
    const steps = [{ tid, page: 'overview', op: 'setCutoffs', args: { lines }, label: 'Adding the cutoff lines' }];
    p.lines.forEach((l, i) => { if (l.finals) steps.push({ tid, page: 'playoffs', op: 'createPlayoff', args: { name: l.name || `${T.letter(i)} Finals`, format: l.format || 'group_bracket', limit: Math.max(2, Math.round(+l.above || 8)) }, label: `Creating ${l.name || T.letter(i) + ' Finals'}` }); });
    const wait = async () => { for (let k = 0; k < 400 && T.jobs.active(); k++) await T.sleep(1500); };   // (Quick test setup may run first)
    await wait();
    try { await T.jobs.start('Cutoffs and finals', steps); } catch (e) { T.panel.say(e.message || String(e), 'err'); }
  }

  return { render, decorate, createRender, after, ranges, staffGroups, stripGroups, staffMap, open, applySteps };
})();
