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
    return !!(D.isTD && D.qual && D.tid === D.qual.tournamentId && T.routePage() === 'players' && (D.qual.playoffsCutoffs || []).length);
  }
  // put our block right after Matchplay's player table card
  function anchor() {
    const tables = [...document.querySelectorAll('main table')].filter(t => t.querySelector('a[href*="/players/"]'));
    const t = tables[tables.length - 1]; if (!t) return null;
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

  function render() {
    if (!ensure()) return;
    const D = T.data.D, w = root.querySelector('.wrap');
    w.classList.toggle('dark', document.documentElement.classList.contains('dark'));
    const divs = F().plan(D), ranks = F().ranksOf(D), job = T.jobs.get();
    const busy = job && !job.done && !job.error;
    let h = `<h2>Finals check-in</h2><div class="sub">Who made each finals, in seed order. Tick a player when they check in: they're added to that finals tournament as <b>Active</b>. Untick to deactivate. Backups can be ticked in place of a no-show; they take the lowest seed.${busy ? ' <b>Updating Matchplay…</b>' : pending.size ? ` <b>${pending.size} change${pending.size === 1 ? '' : 's'} waiting…</b> <button class="link" data-act="now">Apply now</button>` : ''}</div>`;
    for (const x of divs) {
      const f = x.finals, started = f && f.t && f.t.status !== 'planned';
      const fp = x.inFinals, inN = Object.values(fp).filter(p => (p.tournamentPlayer || {}).status === 'active').length;
      const row = (r, label, isBackup) => {
        const p = fp[r.playerId], active = p && (p.tournamentPlayer || {}).status === 'active', pend = pending.get(r.playerId);
        const on = pend ? pend.on : !!active;
        const seed = p && p.tournamentPlayer && p.tournamentPlayer.seed != null ? p.tournamentPlayer.seed : null;
        const state = pend ? '<span class="badge b-amber">Saving…</span>' : active ? '<span class="badge b-green">Checked in</span>' : p ? '<span class="badge b-gray">Inactive</span>' : '<span class="badge b-gray">Not checked in</span>';
        const from = isBackup && r.from ? ` <span class="small">(in ${r.from.letter})</span>` : '';
        return `<tr class="${pend ? 'pend' : isBackup ? 'back' : ''}"><td><input class="ck" type="checkbox" data-p="${r.playerId}" data-div="${x.i}" ${on ? 'checked' : ''} ${!f || started || busy ? 'disabled' : ''}></td>
          <td class="small">${label}</td><td>${T.esc(r.p.name)}${from} ${F().labelsOf(r.p).map(l => `<span class="badge b-rose" style="padding:0 6px">${T.esc(l)}</span>`).join(' ')}</td>
          <td class="num small">${T.ord(r.position)}</td><td class="num small">${ranks[r.playerId] || '–'}</td><td>${state}</td></tr>`;
      };
      const extras = x.finalsPlayers.filter(p => !x.picks.some(r => r.playerId === p.playerId) && !x.backups.some(r => r.playerId === p.playerId));
      h += `<div class="card"><div class="ch" style="border-left:4px solid ${(T.panel.cutColor(x.color))[2]}"><span class="h">${x.letter} Finals · top ${x.size}${x.i ? ` (${x.letter}-eligible)` : ''}</span>
          ${f ? `<span class="badge ${inN >= x.size ? 'b-green' : 'b-amber'}">${inN}/${x.size} checked in</span>` : '<span class="badge b-amber">No playoff linked</span>'}${started ? '<span class="badge b-green">Started</span>' : ''}</div>
        ${f ? '' : `<div class="cb"><div class="callout warn">Create the ${x.letter} playoff: Overview → More… → Manage playoffs → Create playoffs (same order as the cut lines).</div></div>`}
        <table><tr><th style="width:36px">In</th><th>Seed</th><th>Player</th><th class="num">Qual</th><th class="num">IFPA</th><th>Status</th></tr>
        ${x.picks.map((r, i) => row(r, 'S' + (i + 1), false)).join('')}
        ${extras.map(p => { const r = T.finals.order(D).find(q => q.playerId === p.playerId); return r ? row(r, 'Added', true) : ''; }).join('')}
        ${x.backups.length ? `<tr><th colspan="6">Backups</th></tr>${x.backups.map((r, i) => row(r, 'B' + (i + 1), true)).join('')}` : ''}
        </table>
        ${inN > x.size ? `<div class="cb"><div class="callout warn">${inN} checked in for ${x.size} spots - untick someone.</div></div>` : ''}</div>`;
    }
    w.querySelector('.embed').innerHTML = h;
  }

  function onChange(e) {
    const cb = e.target; if (!cb.dataset.p) return;
    pending.set(+cb.dataset.p, { div: +cb.dataset.div, on: cb.checked });
    clearTimeout(timer); timer = setTimeout(apply, 3000);
    render();
  }
  function onClick(e) { const a = e.target.closest('[data-act]'); if (a && a.dataset.act === 'now') { clearTimeout(timer); apply(); } }

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
      if (add.length && names.length > 1) steps.push({ tid, page: 'players', op: 'seeds', args: { names }, label: `${x.letter}: seeds in qualifying order` });
    }
    if (!steps.length) { render(); return; }
    steps.push({ tid: D.qual.tournamentId, page: 'players', op: 'noop', label: 'Back to the qualifying Players tab' });
    try { await T.jobs.start('Finals check-in', steps); } catch (e) { T.panel.say(e.message, 'err'); }
    render();
  }
  const nameOf = (D, id) => ((T.data.playerMap(D.qual)[id]) || {}).name || id;

  setInterval(() => { if (wanted() && (!host || !host.isConnected)) render(); else if (!wanted() && host) ensure(); }, 1000);
  return { render };
})();
