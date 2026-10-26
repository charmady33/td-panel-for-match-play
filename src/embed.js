// Finals roster + check-in, placed inside Matchplay's own page under the player list on the qualifying Players tab.
// Ticking a player's check-in box adds them to that division's finals tournament as Active (or re-activates them);
// unticking deactivates them there. Changes are batched for a few seconds, then done by clicking Matchplay's own controls.
var TDP = window.TDP || (window.TDP = {});

TDP.embed = (() => {
  const T = TDP, F = () => T.finals;
  let host = null, root = null, pending = new Map(), timer = null;   // pending: playerId -> { div, on }

  const CSS = () => (T.panel.CSS || '') + `
:host{all:initial;display:block;margin-top:24px}
.wrap{position:static;width:auto}
.embed h2{font-size:18px;font-weight:500;color:var(--text);margin:0 0 4px}
.embed .sub{font-size:14px;color:var(--muted);margin-bottom:12px}
.embed td,.embed th{padding:8px 12px}
.embed .card{margin-bottom:16px}
.ck{width:18px;height:18px}
tr.pend td{background:#fffbeb}
tr.back td{background:var(--head)}`;

  function wanted() {
    const D = T.data.D;
    // shows on a FINALS tournament's Players tab (linked playoff of the qualifying)
    return !!(D.isTD && D.qual && D.tid !== D.qual.tournamentId && D.finals.some(f => f.tid === D.tid) && T.routePage() === 'players' && (D.qual.playoffsCutoffs || []).length);
  }
  // put our block right after Matchplay's player table card
  function anchor() {
    const tables = [...document.querySelectorAll('main table')].filter(t => t.querySelector('a[href*="/players/"]'));
    const t = tables[tables.length - 1];
    if (!t) {   // no players yet: no table - go under the "MP Ratings / IFPA rankings" links (or the toolbar)
      const link = T.findBtn(document.querySelector('main') || document, /IFPA rankings$/) || T.findBtn(document.querySelector('main') || document, /^Add players$/);
      if (!link) return null;
      return link.parentElement;   // the row of links; check-in goes right below it
    }
    let card = t; while (card.parentElement && card.parentElement.tagName !== 'MAIN' && !/rounded|shadow/.test(card.className || '')) card = card.parentElement;
    return card;
  }
  function ensure() {
    if (!wanted()) { if (host) { host.remove(); host = root = null; } return false; }
    const a = anchor(); if (!a) return false;
    if (!host || !host.isConnected || host.previousElementSibling !== a) {
      if (host) host.remove();
      host = document.createElement('div'); host.id = 'tdp-embed';
      root = host.attachShadow({ mode: 'open' });
      root.innerHTML = `<style>${CSS()}</style><div class="wrap"><div class="embed"></div></div>`;
      root.addEventListener('change', onChange);
      root.addEventListener('click', onClick);
      a.insertAdjacentElement('afterend', host);
    }
    return true;
  }

  const more = new Set();   // divisions showing all their backups
  function render() {
    if (!ensure()) return;
    const D = T.data.D, w = root.querySelector('.wrap');
    w.classList.toggle('dark', document.documentElement.classList.contains('dark'));
    const job = T.jobs.get(), busy = !!(job && !job.done && !job.error);
    const divs = F().plan(D).filter(x => x.finals && x.finals.tid === D.tid);
    if (D.qual.status !== 'completed') {
      w.querySelector('.embed').innerHTML = `<div class="card"><div class="cb"><b>Finals check-in</b> opens here once the qualifying (${T.esc(D.qual.name)}) is completed.</div></div>`;
      return;
    }
    // players the running task is changing (shown as "Checking in…" until Matchplay has them)
    const inJob = new Map();
    if (busy) for (const st of job.steps.slice(job.i)) for (const id of (st.args && st.args.ids) || []) inJob.set(id, st.op === 'deactivate' ? 'off' : 'on');
    let h = `<h2>Finals check-in</h2><div class="sub">Tick a player when they check in: they're added to this finals as <b>Active</b>. Untick to take them out. Backups go in place of a no-show.${pending.size ? ` <button class="link" data-act="now">Apply now</button>` : ''}</div>`;
    for (const x of divs) {
      const f = x.finals, started = f && f.t && f.t.status !== 'planned';
      const fp = x.inFinals, inN = Object.values(fp).filter(p => (p.tournamentPlayer || {}).status === 'active').length;
      const row = (r, label, isBackup) => {
        const p = fp[r.playerId], active = p && (p.tournamentPlayer || {}).status === 'active';
        const pend = pending.get(r.playerId), working = inJob.get(r.playerId);
        const want = pend ? pend.on : working ? working === 'on' : !!active;
        const state = pend || working ? `<span class="badge b-amber">${want ? 'Checking in…' : 'Taking out…'}</span>`
          : active ? '<span class="badge b-green">Checked in</span>' : '<span class="badge b-gray">Not checked in</span>';
        const from = isBackup && r.from ? ` <span class="small">(in ${r.from.letter})</span>` : '';
        return `<tr class="${pend || working ? 'pend' : isBackup ? 'back' : ''}"><td><input class="ck" type="checkbox" data-p="${r.playerId}" data-div="${x.i}" ${want ? 'checked' : ''} ${!f || started || working ? 'disabled' : ''}></td>
          <td class="small">${label}</td><td>${T.esc(r.p.name)}${from}</td><td>${state}</td></tr>`;
      };
      const extras = x.finalsPlayers.filter(p => !x.picks.some(r => r.playerId === p.playerId) && !x.backups.some(r => r.playerId === p.playerId));
      const showAll = more.has(x.i), bks = showAll ? x.backups : x.backups.slice(0, 3);
      const seedNote = f && f.t && f.t.seeding && f.t.seeding !== 'manual' ? `<div class="small" style="padding:6px 12px">Seeding is ${T.esc(f.t.seeding)} in this finals: seeds aren't set from here.</div>` : '';
      h += `<div class="card"><div class="ch" style="border-left:4px solid ${(T.panel.cutColor(x.color))[2]}"><span class="h">${x.letter} Finals · top ${x.size}${x.i ? ` (${x.letter}-eligible)` : ''}</span>
          ${f ? `<span class="badge ${inN >= x.size ? 'b-green' : 'b-amber'}">${inN}/${x.size} checked in</span>` : '<span class="badge b-amber">No playoff linked</span>'}${started ? '<span class="badge b-green">Started</span>' : ''}</div>
        ${f ? '' : `<div class="cb"><div class="callout warn">Create the ${x.letter} playoff: Overview → More… → Manage playoffs → Create playoffs (same order as the cut lines).</div></div>`}
        <table><tr><th style="width:36px">In</th><th style="width:60px">Seed</th><th>Name</th><th>Status</th></tr>
        ${x.picks.map((r, i) => row(r, 'S' + (i + 1), false)).join('')}
        ${extras.map(p => { const r = T.finals.order(D).find(q => q.playerId === p.playerId); return r ? row(r, 'Added', true) : ''; }).join('')}
        ${x.backups.length ? `<tr><th colspan="4">Backups</th></tr>${bks.map((r, i) => row(r, 'B' + (i + 1), true)).join('')}` : ''}
        </table>
        ${x.backups.length > 3 ? `<div style="padding:6px 12px"><button class="link" data-act="more" data-div="${x.i}">${showAll ? 'Show less' : `Show more (${x.backups.length - 3})`}</button></div>` : ''}
        ${seedNote}
        ${inN > x.size ? `<div class="cb"><div class="callout warn">${inN} checked in for ${x.size} spots - untick someone.</div></div>` : ''}</div>`;
    }
    const e = w.querySelector('.embed'); if (e.dataset.h !== h) { e.dataset.h = h; e.innerHTML = h; }
  }

  function onChange(e) {
    const cb = e.target; if (!cb.dataset.p) return;
    const id = +cb.dataset.p, div = +cb.dataset.div, D = T.data.D;
    // already checked in to another (lower) division? moving them takes them out there
    if (cb.checked) {
      const other = F().plan(D).find(o => o.i !== div && o.finals && o.inFinals[id] && (o.inFinals[id].tournamentPlayer || {}).status === 'active');
      const here = F().plan(D).find(o => o.i === div);
      if (other && !confirm(`${nameOf(D, id)} is checked in to ${other.letter}. Move them to ${here ? here.letter : 'this'} finals? They'll be taken out of ${other.letter}.`)) { cb.checked = false; return; }
    }
    pending.set(id, { div, on: cb.checked });
    clearTimeout(timer); timer = setTimeout(apply, 1000);   // a quick second tick joins the same update
    render();
  }
  function onClick(e) {
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'now') { clearTimeout(timer); apply(); }
    if (a.dataset.act === 'more') { const i = +a.dataset.div; if (more.has(i)) more.delete(i); else more.add(i); render(); }
  }

  // build one job: per finals tournament add / activate / deactivate, fix seeds, then come back here
  async function apply() {
    if (!pending.size) return;
    const D = T.data.D, divs = F().plan(D), steps = [];
    const changes = [...pending.entries()]; pending.clear();
    for (const x of divs) {
      if (!x.finals) continue;
      const mine = changes.filter(([, c]) => c.div === x.i);
      if (!mine.length) continue;
      const add = [], act = [], deact = [];
      for (const [id, c] of mine) {
        const p = x.inFinals[id];
        if (c.on) { if (!p) add.push(id); else if ((p.tournamentPlayer || {}).status !== 'active') act.push(id); }
        else if (p && (p.tournamentPlayer || {}).status === 'active') deact.push(id);
        // a backup moving up from a lower division leaves it there
        if (c.on) for (const o of divs) if (o.i !== x.i && o.finals && o.inFinals[id] && (o.inFinals[id].tournamentPlayer || {}).status === 'active')
          steps.push({ tid: o.finals.tid, page: 'players', op: 'deactivate', args: { ids: [id] }, label: `Deactivating ${nameOf(D, id)} in ${o.letter} (moved up to ${x.letter})` });
      }
      const tid = x.finals.tid;
      if (add.length) steps.push({ tid, page: 'players', op: 'addPlayers', args: { ids: add }, label: `${x.letter}: adding ${add.length} checked-in player${add.length === 1 ? '' : 's'}` });
      if (act.length) steps.push({ tid, page: 'players', op: 'activate', args: { ids: act }, label: `${x.letter}: activating ${act.length}` });
      if (deact.length) steps.push({ tid, page: 'players', op: 'deactivate', args: { ids: deact }, label: `${x.letter}: deactivating ${deact.length}` });
      // seeds: qualifying order for the planned players, then everyone else (backups) after them
      const inAfter = new Set([...Object.keys(x.inFinals).map(Number), ...add]);
      const names = x.picks.filter(r => inAfter.has(r.playerId)).map(r => r.p.name)
        .concat(T.finals.order(D).filter(r => inAfter.has(r.playerId) && !x.picks.some(q => q.playerId === r.playerId)).map(r => r.p.name));
      // only when this finals uses manual seeding (otherwise Matchplay has no "Update seeds")
      if (add.length && names.length > 1 && x.finals.t && x.finals.t.seeding === 'manual') steps.push({ tid, page: 'players', op: 'seeds', args: { names }, label: `${x.letter}: seeds in qualifying order` });
    }
    if (!steps.length) { render(); return; }
    steps.push({ tid: D.tid, page: 'players', op: 'noop', label: 'Back to this Players tab' });
    try { await T.jobs.start('Finals check-in', steps); } catch (e) { T.panel.say(e.message, 'err'); }
    render();
  }
  const nameOf = (D, id) => ((T.data.playerMap(D.qual)[id]) || {}).name || id;

  setInterval(() => { if (wanted() && (!host || !host.isConnected)) render(); else if (!wanted() && host) ensure(); }, 1000);
  return { render };
})();
