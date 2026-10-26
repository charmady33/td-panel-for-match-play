// The bottom-left TD panel. Lives in a Shadow DOM so Matchplay's CSS and ours never collide.
// Visual tokens copied from Matchplay's own UI (Tailwind): indigo-600 primary, gray-100 page, white cards, 6px buttons.
var TDP = window.TDP || (window.TDP = {});

TDP.panel = (() => {
  const T = TDP, F = () => T.finals, D = () => T.data.D;
  let host = null, root = null, body = null;
  const ui = { bank: null, bankSeed: null, bankEdit: false, bankOpts: null, labelPreview: null, msg: null, autoState: '', replace: null, pastLoading: false, qualTimes: null };
  const COLORS = ['lime', 'sky', 'purple', 'orange', 'rose', 'gray', 'trans', 'pride'];   // Matchplay's label colors
  const CUTCOL = { green: ['#d1fae5', '#065f46', '#10b981'], fuchsia: ['#fae8ff', '#86198f', '#d946ef'], blue: ['#dbeafe', '#1e40af', '#3b82f6'], sky: ['#e0f2fe', '#075985', '#0ea5e9'], orange: ['#ffedd5', '#9a3412', '#f97316'], rose: ['#ffe4e6', '#9f1239', '#f43f5e'], red: ['#fee2e2', '#991b1b', '#ef4444'], yellow: ['#fef9c3', '#854d0e', '#eab308'], amber: ['#fef3c7', '#92400e', '#f59e0b'], violet: ['#ede9fe', '#5b21b6', '#8b5cf6'], purple: ['#f3e8ff', '#6b21a8', '#a855f7'], indigo: ['#e0e7ff', '#3730a3', '#6366f1'], gray: ['#f3f4f6', '#374151', '#9ca3af'], teal: ['#ccfbf1', '#115e59', '#14b8a6'], pink: ['#fce7f3', '#9d174d', '#ec4899'] };
  const cc = c => CUTCOL[c] || CUTCOL.indigo;

  const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.wrap{--bg:#f3f4f6;--card:#fff;--text:#111827;--muted:#4b5563;--soft:#6b7280;--line:#e5e7eb;--head:#f9fafb;--pri:#4f46e5;--pri2:#4338ca;--pril:#6366f1;--prib:#a5b4fc;
  font-family:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji";font-size:14px;line-height:1.4;color:var(--text);
  position:fixed;right:0;top:0;bottom:0;width:380px;z-index:35;}   /* full-height right sidebar, under Matchplay's dialogs (z-40) */
.wrap.railed{width:48px}
.wrap.dark{--bg:#111827;--card:#1f2937;--text:#f3f4f6;--muted:#d1d5db;--soft:#9ca3af;--line:#374151;--head:#111827;--pri:#6366f1;--pri2:#a5b4fc;--pril:#818cf8;--prib:#4f46e5}
.panel{position:relative;width:100%;height:100%;background:var(--bg);display:flex;flex-direction:column;overflow:hidden;border-left:1px solid var(--line);box-shadow:-1px 0 3px rgba(0,0,0,.05)}
.top{background:var(--card);border-bottom:1px solid var(--line);padding:10px 12px 0}
.row{display:flex;align-items:center;gap:8px}
.title{font-size:15px;font-weight:600;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.strip{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 8px}
.tabs{display:flex;gap:16px;overflow-x:auto;scrollbar-width:none}
.tab{background:none;border:0;border-bottom:2px solid transparent;padding:0 2px 6px;font:inherit;font-size:14px;font-weight:500;color:var(--muted);cursor:pointer;white-space:nowrap}
.tab.on{color:var(--pri);border-bottom-color:var(--pril)}
.body{flex:1;overflow:auto;padding:12px}
.card{background:var(--card);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1),0 1px 2px -1px rgba(0,0,0,.1);margin-bottom:12px;overflow:hidden}
.ch{padding:10px 12px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-weight:500}
.ch .h{flex:1;min-width:0}
.cb{padding:10px 12px}
.lab{font-size:14px;font-weight:500;color:var(--muted)}
.small{font-size:12px;color:var(--soft)}
.btn{font:inherit;font-size:14px;font-weight:500;border-radius:6px;padding:7px 14px;cursor:pointer;border:1px solid transparent;background:var(--pri);color:#fff;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.btn:hover{filter:brightness(.95)}
.btn.sec{background:var(--card);color:var(--pri2);border-color:var(--prib)}
.btn.sm{font-size:12px;padding:3px 9px}
.btn.green{background:#059669}
.btn.red{background:#e11d48}
.btn[disabled]{opacity:.5;cursor:not-allowed}
.link{background:none;border:0;padding:0;font:inherit;font-weight:500;color:var(--pril);cursor:pointer;text-decoration:none}
.link:hover{text-decoration:underline}
.icon{background:none;border:0;cursor:pointer;color:var(--soft);font-size:16px;padding:2px 4px;border-radius:4px}
.icon:hover{background:var(--head);color:var(--text)}
.badge{display:inline-flex;align-items:center;gap:4px;border-radius:9999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap}
.b-green{background:#d1fae5;color:#065f46}.b-indigo{background:#e0e7ff;color:#3730a3}.b-blue{background:#dbeafe;color:#1e40af}
.b-gray{background:#f3f4f6;color:#374151}.b-amber{background:#fef3c7;color:#92400e}.b-rose{background:#ffe4e6;color:#9f1239}.b-pink{background:#fce7f3;color:#9d174d}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;color:var(--soft);background:var(--head);padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
tr:last-child td{border-bottom:0}
.num{text-align:right;font-variant-numeric:tabular-nums}
.callout{border-left:4px solid #60a5fa;background:#eff6ff;color:#1e3a8a;padding:8px 10px;border-radius:4px;font-size:13px;margin-bottom:12px}
.callout.warn{border-color:#f59e0b;background:#fffbeb;color:#78350f}
.callout.err{border-color:#f43f5e;background:#fff1f2;color:#881337}
.callout.ok{border-color:#10b981;background:#ecfdf5;color:#064e3b}
.dark .callout{filter:brightness(.9)}
.bar{height:6px;background:var(--line);border-radius:9999px;overflow:hidden}.bar>i{display:block;height:100%;background:#34d399}
input[type=text],input[type=number],input[type=password],select{font:inherit;font-size:14px;color:var(--text);background:var(--card);border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;width:100%}
input:focus,select:focus{outline:2px solid var(--pril);outline-offset:-1px}
input[type=checkbox]{width:16px;height:16px;accent-color:var(--pri);vertical-align:middle}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mt{margin-top:8px}.mb{margin-bottom:8px}.gap{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tie{border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:13px}
.era{font-size:11px;font-weight:600;border-radius:4px;padding:1px 5px}
.era-EM{background:#fef3c7;color:#92400e}.era-SS{background:#dbeafe;color:#1e40af}.era-DMD{background:#ede9fe;color:#5b21b6}.era-LCD{background:#dcfce7;color:#166534}.era-Unknown{background:#f3f4f6;color:#374151}
.rail{height:100%;width:48px;background:var(--card);border-left:1px solid var(--line);display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:14px}
.pill{background:var(--pri);color:#fff;border:0;border-radius:9999px;width:36px;height:36px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(79,70,229,.35)}
.rail .n{border-radius:9999px;padding:1px 7px;font-size:12px;font-weight:600;min-width:24px;text-align:center;background:#d1fae5;color:#065f46}
.rail .n.amber{background:#fef3c7;color:#92400e}
.toast{position:absolute;left:12px;right:12px;bottom:12px;background:#111827;color:#fff;border-radius:8px;padding:12px 14px;box-shadow:0 10px 25px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center;z-index:2}
.job{border-top:1px solid var(--line);background:var(--card);padding:8px 12px;font-size:13px;max-height:140px;overflow:auto}
.muted{color:var(--soft)}
.flex1{flex:1;min-width:0}
.ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

  // ---------- mount ----------
  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'tdp-host';
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}</style><div class="wrap"></div>`;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', e => e.stopPropagation(), true);   // don't trigger Matchplay shortcuts
    setInterval(tickTimers, 1000);
  }
  function unmount() { if (host) { host.remove(); host = root = null; } push(null); }
  // make room for the sidebar: Matchplay's page shifts right (wide screens only; narrow screens overlay)
  function push(mode) {
    let st = document.getElementById('tdp-push');
    if (!st) { st = document.createElement('style'); st.id = 'tdp-push'; st.textContent = '@media (min-width:900px){html.tdp-side body{margin-right:380px!important}html.tdp-rail body{margin-right:48px!important}}'; document.head.appendChild(st); }
    document.documentElement.classList.toggle('tdp-side', mode === 'side');
    document.documentElement.classList.toggle('tdp-rail', mode === 'rail');
  }
  const wrap = () => root && root.querySelector('.wrap');
  const isDark = () => document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');
  const focused = () => root && root.activeElement && /INPUT|SELECT|TEXTAREA/.test(root.activeElement.tagName);

  // ---------- render ----------
  function render(force) {
    if (!root) return;
    const w = wrap(); w.classList.toggle('dark', isDark());
    const d = D(), c = T.data.counts();
    push(T.settings.open ? 'side' : 'rail');
    w.classList.toggle('railed', !T.settings.open);
    if (!T.settings.open) {
      w.innerHTML = `<div class="rail"><button class="pill" data-act="open" title="Open TD panel">TD</button><span class="n" title="Active games">${c.active}</span>${c.pending ? `<span class="n amber" title="Pending approvals">${c.pending}</span>` : ''}</div>${toastHtml()}`;
      return;
    }
    if (!force && focused() && w.querySelector('.panel')) { updateStrip(); return; }
    const scroll = body ? body.scrollTop : 0;
    const tabs = [['status', 'Status'], ['finals', 'Finals'], ['timers', 'Timers'], ['banks', 'Banks'], ['settings', 'Settings']];
    const tab = T.settings.tab || 'status';
    let content = '';
    try {
      content = !T.settings.token && tab !== 'settings' ? tokenNotice() : ({ status: tStatus, finals: tFinals, timers: tTimers, banks: tBanks, settings: tSettings }[tab] || tStatus)();
    } catch (e) { content = `<div class="callout err">Panel error: ${T.esc(e.message)}</div>`; T.warn(e); }
    w.innerHTML = `<div class="panel">
      <div class="top">
        <div class="row"><div class="title" title="${T.esc(d.t && d.t.name)}">${T.esc(d.t ? d.t.name : 'Matchplay TD Panel')}</div>
          ${d.loading ? '<span class="small">↻</span>' : ''}
          <button class="icon" data-act="refresh" title="Refresh now">⟳</button>
          <button class="icon" data-act="min" title="Collapse">»</button></div>
        <div class="strip" id="strip">${stripHtml()}</div>
        <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" data-act="tab" data-tab="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="body">${d.error ? `<div class="callout err">${T.esc(d.error)}</div>` : ''}${ui.msg ? `<div class="callout ${ui.msg.kind || ''}">${T.esc(ui.msg.text)} <button class="link" data-act="dismiss">Dismiss</button></div>` : ''}${content}</div>
      ${jobHtml()}
    </div>${toastHtml()}`;
    body = w.querySelector('.body'); body.scrollTop = scroll;
  }
  function updateStrip() { const s = root && root.getElementById('strip'); if (s) s.innerHTML = stripHtml(); }
  function stripHtml() {
    const c = T.data.counts(), r = c.round;
    return `<span class="badge b-green" title="Games still being played">● ${c.active} active game${c.active === 1 ? '' : 's'}</span>
      <span class="badge ${c.pending ? 'b-amber' : 'b-gray'}" title="Every score entered, waiting for your approval">${c.pending} pending approval${c.pending === 1 ? '' : 's'}</span>
      ${c.partial ? `<span class="badge b-gray" title="Some scores entered - not complete">${c.partial} partial</span>` : ''}
      ${r ? `<span class="badge b-indigo">${T.esc(r.name || 'Round')}</span>` : ''}`;
  }
  const tokenNotice = () => `<div class="callout warn">Add your Matchplay API token to start. Create one at <b>app.matchplay.events/account/tokens</b>, then paste it in <button class="link" data-act="tab" data-tab="settings">Settings</button>.</div>`;

  // ---------- Status ----------
  function tStatus() {
    const d = D(); if (!d.t) return '<div class="small">Loading…</div>';
    const c = T.data.counts(), st = T.tstate[d.tid] || {}, pm = T.data.playerMap(d.t), am = T.data.arenaMap(d.t);
    const r = c.round;
    let h = `<div class="card"><div class="ch"><span class="h">${r ? T.esc(r.name) : 'No round running'}</span>${statusBadge(d.t.status)}</div><div class="cb">
      ${r ? `<div class="bar"><i style="width:${c.total ? Math.round(100 * c.done / c.total) : 0}%"></i></div><div class="small mt">${c.done} of ${c.total} games completed${c.pending ? ` · ${c.pending} waiting for approval` : ''}</div>` : '<div class="small">Start the next round on the Matches tab.</div>'}
      <div class="small mt"><b>Auto close/start round:</b> ${st.auto ? T.esc(ui.autoState || 'on - watching') : 'off'} · switch it on the <a class="link" href="/tournaments/${d.tid}/matches">Matches tab</a></div>
    </div></div>`;
    h += tiesCard();
    // games still being played
    const gs = r ? d.games.filter(g => g.roundId === r.roundId && !g.bye && !T.timing.isDone(g)) : [];
    const rg = r ? d.games.filter(g => g.roundId === r.roundId) : [];
    if (gs.length) {
      const rows = gs.map(g => {
        const s = T.timing.suggestState(g), start = T.timing.realStart(g, rg);
        const state = s === 'full' ? '<span class="badge b-amber">Pending approval</span>' : s === 'partial' ? '<span class="badge b-gray">Partial scores</span>' : start ? '<span class="badge b-green">Playing</span>' : '<span class="badge b-gray">Waiting</span>';
        const names = (g.playerIds || []).map(id => (pm[id] && pm[id].name || '').split(' ')[0]).join(', ');
        return `<tr><td class="flex1"><div class="ell" style="max-width:150px">${T.esc(g.arenaId ? (am[g.arenaId] || {}).name || 'Arena' : 'Needs arena')}${g.set === 9999 ? ' <span class="badge b-rose">Tiebreaker</span>' : ` <span class="small">G${(g.set || 0) + 1}</span>`}</div><div class="small ell" style="max-width:150px">${T.esc(names)}</div></td><td>${state}</td><td class="num" ${start && s !== 'full' ? `data-since="${start}"` : ''}>${start && s !== 'full' ? T.fmtDur(Date.now() - start) : '–'}</td></tr>`;
      }).join('');
      h += `<div class="card"><div class="ch"><span class="h">Games in progress</span><span class="badge b-green">${gs.length}</span></div><table><tr><th>Arena / players</th><th>State</th><th class="num">Time</th></tr>${rows}</table></div>`;
    }
    return h;
  }
  const statusBadge = s => s === 'started' ? '<span class="badge b-green">In progress</span>' : s === 'completed' ? '<span class="badge b-blue">Completed</span>' : '<span class="badge b-indigo">Planned</span>';

  function tiesCard() {
    const d = D(); let ties = [], gties = [];
    try { if (d.qual && (d.qual.playoffsCutoffs || []).length && d.standings.length) ties = F().qualifyingTies(d, F().plan(d)); } catch (e) { T.warn(e); }
    try { gties = F().groupTies(d); } catch (e) { T.warn(e); }
    if (!ties.length && !gties.length) return '';
    const qid = d.qual && d.qual.tournamentId;
    const items = ties.map(t => {
      const col = t.kind === 'cutline' ? cc(((d.standings.find(s => s.position === t.pos) || {}).cutoffBubbleColor) || 'amber') : t.kind === 'boundary' ? cc(t.div ? t.div.color : 'amber') : cc('amber');
      return `<div class="tie" style="background:${col[0]};color:${col[1]};border-left:4px solid ${col[2]}"><b>${T.esc(t.why)}</b> · position ${t.pos}<div>${t.players.map(r => T.esc(r.p ? r.p.name : r.playerId)).join(', ')}</div></div>`;
    }).join('') + gties.map(t => {
      const col = cc(t.kind === 'final' ? 'rose' : 'amber');
      return `<div class="tie" style="background:${col[0]};color:${col[1]};border-left:4px solid ${col[2]}"><b>${T.esc(t.why)}</b>${t.tbOpen ? ' · tiebreaker game open' : t.tbDone ? ' · tiebreaker played' : ' · <b>no tiebreaker game yet</b>'}<div>${t.players.map(T.esc).join(', ')}</div></div>`;
    }).join('');
    return `<div class="card"><div class="ch"><span class="h">Ties to break for finals</span><span class="badge b-rose">${ties.length + gties.length}</span></div><div class="cb">${items}
      <div class="gap">${ties.length && qid ? `<a class="btn sm" href="/tournaments/${qid}/resolve-ties">Resolve ties</a>` : ''}${gties.length ? `<a class="btn sm sec" href="/tournaments/${d.tid}/matches">Matches</a>` : ''}</div></div></div>`;
  }

  // ---------- Finals ----------
  function tFinals() {
    const d = D();
    if (!d.qual) return '<div class="small">Loading…</div>';
    const divs = F().plan(d), qid = d.qual.tournamentId, st = T.tstate[qid] || {};
    if (!divs.length) return `<div class="callout warn">No finals cut lines yet. In Matchplay: qualifying Overview → <b>Cutoff lines → Manage cutoffs</b>, then create the playoffs under <b>More… → Manage playoffs</b>.</div>`;
    const ranks = st.ranks || {}, nRanked = Object.keys(ranks).length;
    let h = `<div class="card"><div class="ch"><span class="h">IFPA ranks</span>${nRanked ? `<span class="badge b-green">${nRanked} loaded</span>` : '<span class="badge b-gray">not loaded</span>'}</div><div class="cb">
      <div class="small mb">Read from Matchplay's own IFPA Rankings list on the qualifying Players tab${st.ranksAt ? ` · last loaded ${new Date(st.ranksAt).toLocaleString()}` : ''}.</div>
      <button class="btn sm sec" data-act="loadRanks">Load IFPA ranks</button></div></div>`;
    h += tiesCard();
    // eligibility labels
    const needCut = divs.filter(x => x.i > 0);
    if (needCut.length) {
      h += `<div class="card"><div class="ch"><span class="h">Eligibility labels (qualifying)</span></div><div class="cb">
        <div class="small mb">Players ranked at or better than a division's cutoff can't play in it. Labels are only added, never removed.</div>
        ${needCut.map(x => `<div class="grid2 mb"><div><div class="lab">${x.letter} rank cutoff</div><input type="number" min="1" placeholder="e.g. 1000" data-div="${x.letter}" data-field="cutoff" value="${x.cutoff || ''}"></div><div><div class="lab">${x.letter} label</div><input type="text" data-div="${x.letter}" data-field="label" value="${T.esc(x.label)}"></div></div>`).join('')}
        ${ui.labelPreview ? labelPreviewHtml() : `<button class="btn sm" data-act="previewLabels" ${nRanked ? '' : 'disabled title="Load IFPA ranks first"'}>Preview labels</button>`}
      </div></div>`;
    }
    for (const x of divs) h += divisionCard(x, d);
    return h;
  }
  function labelPreviewHtml() {
    const p = ui.labelPreview;
    if (!p.groups.length) return `<div class="callout ok">Every player already has the right labels.</div><button class="btn sm sec" data-act="cancelLabels">OK</button>`;
    const n = p.groups.reduce((s, g) => s + g.ids.length, 0);
    return `<div class="callout">${n} player${n === 1 ? '' : 's'} will get labels:</div>
      <table><tr><th>Player</th><th class="num">IFPA</th><th>New labels</th></tr>${p.rows.map(r => `<tr><td>${T.esc(r.name)}</td><td class="num">${r.rank || '–'}</td><td>${r.add.map(l => `<span class="badge b-rose">${T.esc(l)}</span>`).join(' ')}</td></tr>`).join('')}</table>
      <div class="gap mt"><button class="btn sm" data-act="applyLabels">Apply ${n} label${n === 1 ? '' : 's'}</button><button class="btn sm sec" data-act="cancelLabels">Cancel</button></div>`;
  }
  function divisionCard(x, d) {
    const col = cc(x.color), f = x.finals, ranks = F().ranksOf(d);
    const fStarted = f && f.t && f.t.status !== 'planned';
    const missing = x.picks.filter(r => !x.inFinals[r.playerId]);
    const extra = x.finalsPlayers.filter(p => !x.picks.some(r => r.playerId === p.playerId));
    const rows = x.picks.map((r, i) => {
      const inF = x.inFinals[r.playerId];
      return `<tr><td class="num small">${i + 1}</td><td>${T.esc(r.p.name)} ${F().labelsOf(r.p).map(l => `<span class="badge b-rose" style="padding:0 6px">${T.esc(l)}</span>`).join(' ')}</td><td class="num small">${T.ord(r.position)}</td><td class="num small">${ranks[r.playerId] || '–'}</td><td>${inF ? (inF.tournamentPlayer && inF.tournamentPlayer.status === 'active' ? '<span class="badge b-green">In</span>' : '<span class="badge b-gray">In · inactive</span>') : '<span class="badge b-amber">Not added</span>'}</td></tr>`;
    }).join('');
    const bk = x.backups.map((r, i) => `<tr><td class="num small">B${i + 1}</td><td>${T.esc(r.p.name)}${r.from ? ` <span class="small">(now in ${r.from.letter})</span>` : ''}</td><td class="num small">${T.ord(r.position)}</td><td class="num small">${ranks[r.playerId] || '–'}</td><td></td></tr>`).join('');
    return `<div class="card"><div class="ch" style="border-left:4px solid ${col[2]}"><span class="h">${x.letter} Finals · ${x.size} players</span>${f ? statusBadge(f.t && f.t.status) : '<span class="badge b-amber">No playoff linked</span>'}</div>
      ${f ? '' : `<div class="cb"><div class="callout warn">Create the ${x.letter} playoff in Matchplay: qualifying <b>More… → Manage playoffs → Create playoffs</b> (in the same order as the cut lines).</div></div>`}
      <table><tr><th>#</th><th>Player</th><th class="num">Qual</th><th class="num">IFPA</th><th>Finals</th></tr>${rows}${bk ? `<tr><th colspan="5">Backups</th></tr>${bk}` : ''}</table>
      ${extra.length ? `<div class="cb small">Also in the ${x.letter} finals: ${extra.map(p => T.esc(p.name)).join(', ')}</div>` : ''}
      ${f && !fStarted ? `<div class="cb gap" style="border-top:1px solid var(--line)"><span class="small flex1">Check-in is on the ${x.letter} finals <a class="link" href="/tournaments/${f.tid}/players">Players tab</a> once qualifying is completed.</span>
        ${x.finalsPlayers.length ? `<button class="btn sm sec" data-act="seedsDiv" data-div="${x.i}">Fix seeds</button>` : ''}</div>` : ''}
    </div>`;
  }

  // ---------- Timers ----------
  function tTimers() {
    const d = D(); if (!d.t) return '<div class="small">Loading…</div>';
    const rt = T.timing.roundTimes(d.rounds, d.games), at = T.timing.arenaTimes(d.games), am = T.data.arenaMap(d.t);
    const rrows = rt.map(r => `<tr><td>${T.esc(r.name)}</td><td class="small">${r.done}/${r.games}</td><td class="num" ${!r.end && r.start ? `data-since="${r.start}"` : ''}>${r.start ? T.fmtDur((r.end || Date.now()) - r.start) : '–'}</td><td>${r.allDone ? '<span class="badge b-green">Done</span>' : r.start ? '<span class="badge b-indigo">Running</span>' : ''}</td></tr>`).join('');
    const arows = Object.entries(at).map(([id, v]) => ({ a: am[id] || { name: 'Arena ' + id }, v })).sort((x, y) => y.v.avg - x.v.avg)
      .map(({ a, v }) => `<tr><td class="ell" style="max-width:150px">${T.esc(a.name)}</td><td><span class="era era-${T.banks.eraOf(a)}">${T.banks.eraOf(a)}</span></td><td class="num small">${v.count}</td><td class="num"><b>${T.fmtDur(v.avg)}</b></td><td class="num small">${T.fmtDur(v.min)}–${T.fmtDur(v.max)}</td></tr>`).join('');
    return `<div class="card"><div class="ch"><span class="h">Rounds</span></div><table><tr><th>Round</th><th>Games</th><th class="num">Length</th><th></th></tr>${rrows || '<tr><td colspan="4" class="small">No rounds yet</td></tr>'}</table><div class="cb small">From the first game's start until every game is done (full pending approvals count as done).</div></div>
      <div class="card"><div class="ch"><span class="h">Average game time per arena</span></div><table><tr><th>Arena</th><th>Era</th><th class="num">#</th><th class="num" title="Middle value of the game times (very long outliers left out)">Typical</th><th class="num">Range</th></tr>${arows || '<tr><td colspan="5" class="small">No finished games yet</td></tr>'}</table>
      <div class="cb small">A game starts when its group and the arena are both free, and ends at the first full set of scores (or approval). Partial scores don't count. Games under 2 min or over 2 h are left out.</div></div>`;
  }

  // ---------- Banks (per round) ----------
  function bankOpts() {
    const d = D(), st = T.tstate[d.tid] || {};
    if (!ui.bankOpts) {
      const ctx = T.bankplan.context(d);
      ui.bankOpts = { n: st.bankN || Math.max(ctx.groups.length, (d.t.banks || []).length, 4), size: st.bankSize || d.t.gamesPerRound || 3, past: st.bankPast || '', exclude: st.bankExclude || [] };
    }
    return ui.bankOpts;
  }
  // extra time sources: qualifying (when this is a finals) + tournaments run with the extension
  function bankExtra() {
    const d = D(), st = T.tstate[d.tid] || {}, use = new Set(st.histUse || []);
    return { qual: ui.qualTimes || null, hist: Object.entries(ui.hist || {}).filter(([id]) => use.has(id)).map(([, h]) => h.arenas) };
  }
  function tBanks() {
    const d = D(); if (!d.t) return '<div class="small">Loading…</div>';
    if (!ui.hist) { ui.hist = {}; T.store.get('hist', {}).then(h => { ui.hist = h; render(true); }); }
    const o = bankOpts(), st = T.tstate[d.tid] || {};
    const bankMode = /bank/i.test(d.t.arenaAssignment || ''), existing = (d.t.banks || []).filter(b => b.status !== 'inactive');
    const ctx = T.bankplan.context(d);
    let h = '';
    if (!bankMode) h += `<div class="callout warn">This tournament isn't using banks. In Matchplay: Overview → <b>Arena assignment</b> → Show additional options → <b>Arena banks (manual)</b>.</div>`;
    h += `<div class="card"><div class="ch"><span class="h">${ctx.round ? `${T.esc(ctx.round.name)} · ${ctx.groups.length} group${ctx.groups.length === 1 ? '' : 's'} need banks` : 'No groups waiting for banks'}</span>${existing.length ? `<span class="badge b-gray">${existing.length} banks in Matchplay</span>` : ''}</div><div class="cb">
      <label class="gap"><input type="checkbox" data-set="autoBanks" ${st.autoBanks ? 'checked' : ''}> <span class="lab">Automatic every round</span></label>
      <div class="small mb">When a round starts and its groups have no games yet, makes new banks (different from earlier rounds), updates the banks in Matchplay and assigns each group the bank with the most games its players haven't played. Needs Arena assignment set to Arena banks (manual).${st.banksDoneRound ? ` Last done for round #${st.banksDoneRound}.` : ''}</div>
      <div class="grid2"><div><div class="lab">Banks</div><input type="number" min="1" max="30" data-bank="n" value="${o.n}"></div><div><div class="lab">Games per bank</div><input type="number" min="1" max="10" data-bank="size" value="${o.size}"></div></div>
      <div class="gap mt"><button class="btn" data-act="genBanks">Generate${ctx.round ? ' for ' + T.esc(ctx.round.name) : ''}</button>${ui.bank ? '<button class="btn sec" data-act="anotherBanks">Try another</button>' : ''}</div>
    </div></div>`;
    if (ui.bank) h += bankResultHtml(bankMode);
    h += `<div class="card"><div class="ch"><span class="h">Game times</span></div><div class="cb">
      <div class="small mb">This tournament's own times are always used (3+ finished games). Other sources fill the gaps, matched by exact arena name.</div>
      ${d.qual && d.qual.tournamentId !== d.tid ? `<label class="gap mb"><input type="checkbox" data-act="useQual" ${ui.qualTimes ? 'checked' : ''}> <span class="lab">Qualifying (${T.esc(d.qual.name)})</span></label>` : ''}
      <div class="lab">Matchplay tournament IDs</div>
      <div class="gap"><input type="text" class="flex1" style="width:auto" data-bank="past" placeholder="e.g. 279001, 279554" value="${T.esc(o.past)}"><button class="btn sm sec" data-act="loadPast">${ui.pastLoading ? 'Loading…' : 'Load'}</button></div>
      <div class="small">${Object.keys(st.pastTimes || {}).length ? `${Object.keys(st.pastTimes).length} arenas loaded from those IDs.` : 'None loaded.'}</div>
      <div class="lab mt">Tournaments run with this extension</div>
      ${Object.entries(ui.hist || {}).filter(([id]) => +id !== d.tid).sort((a, b) => b[1].at - a[1].at).slice(0, 15).map(([id, x]) => `<label class="gap"><input type="checkbox" data-hist="${id}" ${(st.histUse || []).includes(id) ? 'checked' : ''}> <span class="flex1 ell">${T.esc(x.name)}</span><span class="small">${Object.keys(x.arenas).length} arenas</span></label>`).join('') || '<div class="small">None yet - times are saved automatically from every tournament you open with the panel.</div>'}
    </div></div>`;
    const est = T.bankplan.estimates(d, st, bankExtra()), ex = new Set(o.exclude);
    h += `<div class="card"><div class="ch"><span class="h">Arenas</span><span class="badge b-gray">${est.length - est.filter(e => ex.has(e.arenaId)).length}/${est.length} used</span></div>
      <table><tr><th></th><th>Arena</th><th>Era</th><th class="num">Est.</th><th>From</th></tr>${est.sort((a, b) => b.sec - a.sec).map(e => `<tr><td><input type="checkbox" data-incl="${e.arenaId}" ${ex.has(e.arenaId) ? '' : 'checked'}></td><td class="ell" style="max-width:130px">${T.esc(e.name)}</td><td><span class="era era-${e.era}">${e.era}</span></td><td class="num">${T.fmtDur(e.sec * 1000)}</td><td class="small" title="${T.esc(e.src)}">${e.src === 'era estimate' ? 'era' : 'times'}</td></tr>`).join('')}</table></div>`;
    return h;
  }
  function bankResultHtml(bankMode) {
    const plan = ui.bank, res = plan.res, totals = res.banks.map(b => b.total), spread = Math.max(...totals) - Math.min(...totals);
    const used = new Set(res.banks.flatMap(b => b.games.map(g => g.arenaId)));
    const held = plan.est.filter(e => !used.has(e.arenaId) && !new Set(ui.bankOpts.exclude).has(e.arenaId));
    const reps = res.banks.reduce((s, b) => s + b.repeatPairs, 0);
    const cards = res.banks.map((b, bi) => `<div class="card"><div class="ch"><span class="h">${T.esc(b.name)}</span><span class="small">${T.fmtDur(b.total * 1000)}</span>${b.eraCost >= 750 ? '<span class="badge b-amber">same era</span>' : ''}${b.repeatPairs ? `<span class="badge b-amber">${b.repeatPairs} repeat pair${b.repeatPairs === 1 ? '' : 's'}</span>` : ''}</div>
      <table>${b.games.map((g, gi) => `<tr><td class="small num">A${gi + 1}</td><td class="flex1">${ui.bankEdit ? swapSelect(bi, gi, g, res, held) : T.esc(g.name)}${g.repeat ? ' <span class="badge b-gray">repeat</span>' : ''}</td><td><span class="era era-${g.era}">${g.era}</span></td><td class="num small">${T.fmtDur(g.sec * 1000)}</td><td><button class="icon" title="Swap for the best other game (exclude this one and rebuild)" data-act="excludeRebuild" data-a="${g.arenaId}">⟳</button></td></tr>`).join('')}</table></div>`).join('');
    const asg = plan.assign.length ? `<div class="card"><div class="ch"><span class="h">Groups → banks</span></div><table><tr><th>Group</th><th>Bank</th><th class="num">New games for players</th></tr>${plan.assign.sort((a, b) => a.group - b.group).map(a => `<tr><td>Group ${a.group}</td><td>${T.esc(a.bank)}</td><td class="num">${a.fresh}/${a.total}</td></tr>`).join('')}</table></div>` : '';
    return `<div class="callout ${spread > 180 ? 'warn' : 'ok'}">${res.banks.length} banks · longest vs shortest: ${T.fmtDur(spread * 1000)}${reps ? ` · ${reps} game pair${reps === 1 ? '' : 's'} repeat an earlier round` : ' · no pair of games repeats an earlier round'}${res.dropped.length ? ` · ${res.dropped.length} held out` : ''}</div>
      <label class="gap mb"><input type="checkbox" data-act="bankEdit" ${ui.bankEdit ? 'checked' : ''}> <span class="lab">Edit banks</span></label>
      ${cards}${asg}
      <div class="card"><div class="cb"><button class="btn" data-act="applyBanks" ${bankMode ? '' : 'disabled title="Switch Arena assignment to banks first"'}>Update banks in Matchplay${plan.assign.length ? ' & assign groups' : ''}</button>
      <div class="small mt">Existing banks keep their names and get these games; missing banks are created.</div></div></div>`;
  }
  function swapSelect(bi, gi, g, res, held) {
    const opts = [`<option value="">${T.esc(g.name)}</option>`]
      .concat(held.map(h => `<option value="h:${h.arenaId}">↔ ${T.esc(h.name)} (held out, ${T.fmtDur(h.sec * 1000)})</option>`))
      .concat(res.banks.flatMap((b, bj) => bj === bi ? [] : b.games.filter(x => !res.banks[bi].games.some(y => y.arenaId === x.arenaId)).map(x => `<option value="b:${bj}:${b.games.indexOf(x)}">↔ ${T.esc(x.name)} (${T.esc(b.name)})</option>`)));
    return `<select data-swap="${bi}:${gi}">${opts.join('')}</select>`;
  }

  // ---------- Settings ----------
  function tSettings() {
    const s = T.settings, d = D();
    return `<div class="card"><div class="ch"><span class="h">Matchplay API token</span></div><div class="cb">
      <div class="small mb">Each TD uses their own token: app.matchplay.events → Account → <b>API tokens</b>. Stored only in this browser. Read-only access; changes are made by clicking Matchplay's own buttons.</div>
      <div class="gap"><input type="password" class="flex1" style="width:auto" id="tok" placeholder="Paste token" value="${T.esc(s.token)}"><button class="btn sm" data-act="saveToken">Save</button></div>
      ${d.me ? `<div class="small mt">Signed in to the API as <b>${T.esc(d.me.name)}</b>.</div>` : ''}</div></div>
      <div class="card"><div class="ch"><span class="h">Options</span></div><div class="cb">
      <div class="lab">Label color</div><select data-setting="labelColor">${COLORS.map(c => `<option ${c === s.labelColor ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <div class="lab mt">Auto round countdown (seconds)</div><input type="number" min="3" max="60" data-setting="autoCountdown" value="${s.autoCountdown}">
      <div class="gap mt"><button class="btn sm sec" data-act="clearT">Clear saved data for this tournament</button></div>
      <div class="small mt">Matchplay TD Panel v${T.VERSION}</div></div></div>`;
  }

  // ---------- job + toast ----------
  function jobHtml() {
    const j = T.jobs.get(); if (!j) return '';
    const last = j.log.slice(-4).map(T.esc).join('<br>');
    return `<div class="job"><div class="row"><b class="flex1">${T.esc(j.title)}</b>${j.done ? '<span class="badge b-green">Done</span>' : j.error ? '<span class="badge b-rose">Stopped</span>' : `<span class="badge b-indigo">Step ${Math.min(j.i + 1, j.steps.length)}/${j.steps.length}</span>`}</div>
      ${!j.done && !j.error ? `<div style="height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-top:6px"><i style="display:block;height:100%;width:${Math.max(4, Math.round(T.jobs.fraction(j) * 100))}%;background:#4f46e5;transition:width .3s"></i></div>${j.sub && j.sub.text ? `<div class="small mt">${T.esc(j.sub.text)}${j.sub.total > 1 ? ` (${j.sub.done} of ${j.sub.total})` : ''}</div>` : ''}` : ''}
      <div class="small mt">${last}</div>${j.error ? `<div class="callout err mt">${T.esc(j.error)}</div>` : ''}
      <div class="gap mt">${j.error ? '<button class="btn sm" data-act="jobRetry">Retry</button>' : ''}<button class="btn sm sec" data-act="jobClose">${j.done || j.error ? 'Close' : 'Stop'}</button></div></div>`;
  }
  let toast = null;   // {text, until, onCancel}
  const toastHtml = () => toast ? `<div class="toast"><span class="flex1">${T.esc(toast.text)} <b data-count>${Math.max(0, Math.ceil((toast.until - Date.now()) / 1000))}s</b></span><button class="btn sm sec" data-act="toastCancel">Cancel</button></div>` : '';
  function showCountdown(text, secs) {
    return new Promise(res => { toast = { text, until: Date.now() + secs * 1000, res }; render(true); setTimeout(() => { if (toast && toast.res === res) { toast = null; render(true); res(true); } }, secs * 1000); });
  }
  function tickTimers() {
    if (!root) return;
    root.querySelectorAll('[data-since]').forEach(el => { el.textContent = T.fmtDur(Date.now() - Number(el.dataset.since)); });
    const c = root.querySelector('[data-count]'); if (c && toast) c.textContent = Math.max(0, Math.ceil((toast.until - Date.now()) / 1000)) + 's';
  }

  // ---------- actions ----------
  const say = (text, kind) => { ui.msg = { text, kind }; render(true); };
  async function onClick(e) {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act, d = D();
    try {
      switch (act) {
        case 'open': await T.saveSettings({ open: true }); render(true); break;
        case 'min': await T.saveSettings({ open: false }); render(true); break;
        case 'tab': await T.saveSettings({ tab: a.dataset.tab }); ui.msg = null; render(true); break;
        case 'refresh': T.api.clear(); await T.data.refresh(true); break;
        case 'dismiss': ui.msg = null; render(true); break;
        case 'saveToken': await T.saveSettings({ token: root.getElementById('tok').value.trim() }); T.api.clear(); d.me = null; await T.data.refresh(true); say(d.error ? d.error : 'Token saved.', d.error ? 'err' : 'ok'); break;
        case 'clearT': await T.store.del('t:' + d.tid); await T.loadT(d.tid); say('Saved data for this tournament cleared.', 'ok'); break;
        case 'toastCancel': if (toast) { const r = toast.res; toast = null; r(false); render(true); } break;
        case 'jobRetry': await T.jobs.retry(); break;
        case 'jobClose': await T.jobs.cancel(); render(true); break;
        case 'loadRanks': await T.jobs.start('Load IFPA ranks', [{ tid: d.qual.tournamentId, page: 'players', op: 'readRanks', args: { tid: d.qual.tournamentId }, label: 'Reading Matchplay IFPA Rankings' }]); break;
        case 'previewLabels': ui.labelPreview = buildLabelPlan(); render(true); break;
        case 'cancelLabels': ui.labelPreview = null; render(true); break;
        case 'applyLabels': {
          const p = ui.labelPreview; ui.labelPreview = null;
          await T.jobs.start(`Add eligibility labels (${p.rows.length} players)`, [{ tid: d.qual.tournamentId, page: 'players', op: 'labels', args: { groups: p.groups, color: T.settings.labelColor }, label: 'Setting labels on the qualifying Players tab' }]);
          break;
        }
        case 'seedsDiv': {
          const x = F().plan(d)[+a.dataset.div];
          const names = x.picks.filter(r => x.inFinals[r.playerId]).map(r => r.p.name).concat(x.finalsPlayers.filter(p => !x.picks.some(r => r.playerId === p.playerId)).map(p => p.name));
          await T.jobs.start(`Fix ${x.letter} seeds`, [{ tid: x.finals.tid, page: 'players', op: 'seeds', args: { names }, label: 'Reordering seeds' }]);
          break;
        }
        case 'auto': break;
        case 'genBanks': ui.bankSeed = null; genBanks(); break;
        case 'anotherBanks': ui.bankSeed = Math.floor(Math.random() * 1e9); genBanks(); break;
        case 'excludeRebuild': { const o = bankOpts(); o.exclude = [...new Set([...o.exclude, +a.dataset.a])]; await T.saveT(d.tid, { bankExclude: o.exclude }); genBanks(); break; }
        case 'bankEdit': ui.bankEdit = a.checked; render(true); break;
        case 'loadPast': await loadPast(); break;
        case 'applyBanks': {
          await T.jobs.start(`Banks for ${ui.bank.ctx.round ? ui.bank.ctx.round.name : 'this tournament'}`, T.bankplan.steps(d, ui.bank));
          ui.bank = null;
          break;
        }
        case 'useQual': if (a.checked) await loadQualTimes(); else { ui.qualTimes = null; render(true); } break;
      }
    } catch (err) { say(err.message || String(err), 'err'); }
  }
  async function onChange(e) {
    const el = e.target, d = D();
    if (el.dataset.set === 'auto') { await T.saveT(d.tid, { auto: el.checked }); ui.autoState = ''; render(true); return; }
    if (el.dataset.set === 'autoBanks') { await T.saveT(d.tid, { autoBanks: el.checked }); render(true); return; }
    if (el.dataset.hist) { const st = T.tstate[d.tid] || {}, s2 = new Set(st.histUse || []); if (el.checked) s2.add(el.dataset.hist); else s2.delete(el.dataset.hist); await T.saveT(d.tid, { histUse: [...s2] }); render(true); return; }
    if (el.dataset.div && el.dataset.field) {
      const qid = d.qual.tournamentId, st = T.tstate[qid] || {}, divs = { ...(st.divs || {}) };
      divs[el.dataset.div] = { ...(divs[el.dataset.div] || {}), [el.dataset.field]: el.dataset.field === 'cutoff' ? (parseInt(el.value, 10) || null) : el.value.trim() };
      await T.saveT(qid, { divs }); ui.labelPreview = null; render(true); return;
    }
    if (el.dataset.setting) { await T.saveSettings({ [el.dataset.setting]: el.type === 'number' ? Number(el.value) : el.value }); return; }
    if (el.dataset.bank) {
      const o = bankOpts(); o[el.dataset.bank] = el.type === 'number' ? Math.max(1, parseInt(el.value, 10) || 1) : el.value;
      await T.saveT(d.tid, { bankN: o.n, bankSize: o.size, bankPast: o.past }); return;
    }
    if (el.dataset.incl) {
      const o = bankOpts(), id = +el.dataset.incl; o.exclude = el.checked ? o.exclude.filter(x => x !== id) : [...new Set([...o.exclude, id])];
      await T.saveT(d.tid, { bankExclude: o.exclude }); render(true); return;
    }
    if (el.dataset.swap && el.value) {
      const [bi, gi] = el.dataset.swap.split(':').map(Number), res = ui.bank.res, g = res.banks[bi].games[gi];
      if (el.value.startsWith('h:')) { const h = ui.bank.est.find(x => x.arenaId === +el.value.slice(2)); res.banks[bi].games[gi] = h; }
      else { const [, bj, gj] = el.value.split(':').map(Number); res.banks[bi].games[gi] = res.banks[bj].games[gj]; res.banks[bj].games[gj] = g; }
      res.banks.forEach(b => { b.total = b.games.reduce((s, x) => s + x.sec, 0); });
      render(true);
    }
  }

  function buildLabelPlan() {
    const d = D(), divs = F().divisions(d).filter(x => x.i > 0 && x.cutoff), ranks = F().ranksOf(d);
    const rows = [], byKey = {};
    for (const p of d.qual.players || []) {
      const r = ranks[p.playerId]; if (!r) continue;
      const have = F().labelsOf(p), add = divs.filter(x => r <= x.cutoff && !have.some(l => l.toLowerCase() === x.label.toLowerCase())).map(x => x.label);
      if (!add.length) continue;
      const labels = [...have, ...add]; rows.push({ name: p.name, rank: r, add });
      const k = labels.join('|'); (byKey[k] = byKey[k] || { ids: [], labels }).ids.push(p.playerId);
    }
    if (!divs.length) throw new Error('Enter a rank cutoff for at least one division first.');
    return { rows: rows.sort((a, b) => a.rank - b.rank), groups: Object.values(byKey) };
  }
  function genBanks() {
    const o = bankOpts();
    try { ui.bank = T.bankplan.make(D(), { n: o.n, size: o.size, seed: ui.bankSeed, exclude: o.exclude, extra: bankExtra() }); ui.msg = null; }
    catch (e) { ui.bank = null; ui.msg = { text: e.message, kind: 'err' }; }
    render(true);
  }
  async function loadPast() {
    const d = D(), o = bankOpts(), ids = String(o.past).split(/[^\d]+/).map(Number).filter(Boolean);
    if (!ids.length) return say('Enter one or more past tournament IDs.', 'warn');
    ui.pastLoading = true; render(true);
    const merged = {};
    try {
      for (const id of ids) {
        const t = await T.data.loadTournament(id, 3600e3), am = T.data.arenaMap(t);
        const games = await T.api.all(`/tournaments/${id}/games`, 3600e3);
        for (const [aid, v] of Object.entries(T.timing.arenaTimes(games))) {
          const k = ((am[aid] || {}).name || '').toLowerCase(); if (!k) continue;
          const m = merged[k] || (merged[k] = { count: 0, sum: 0 }); m.count += v.count; m.sum += v.avg * v.count;
        }
      }
      const pastTimes = {}; for (const [k, m] of Object.entries(merged)) pastTimes[k] = { count: m.count, avg: m.sum / m.count };
      await T.saveT(d.tid, { pastTimes });
      ui.pastLoading = false; say(`Loaded times for ${Object.keys(pastTimes).length} arenas from ${ids.length} tournament(s).`, 'ok');
    } catch (e) { ui.pastLoading = false; say(T.apiErrorText(e), 'err'); }
  }
  async function loadQualTimes() {
    const d = D(), q = d.qual, am = T.data.arenaMap(q);
    const games = await T.api.all(`/tournaments/${q.tournamentId}/games`, 300e3), out = {};
    for (const [aid, v] of Object.entries(T.timing.arenaTimes(games))) { const k = ((am[aid] || {}).name || '').toLowerCase(); if (k) out[k] = v; }
    ui.qualTimes = out; render(true);   // keyed by lowercase arena name
  }

  return { CSS, cutColor: cc, mount, unmount, render, showCountdown, setAutoState: s => { if (ui.autoState !== s) { ui.autoState = s; render(); } }, say };
})();
