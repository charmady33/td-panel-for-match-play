// Bar on Matchplay's Banks tab: Generate banks (none yet) / Refresh + Add (banks exist), with a preview to
// confirm before anything is created, and a Settings window (games to use/never/always, time sources).
var TDP = window.TDP || (window.TDP = {});

TDP.bankbar = (() => {
  const T = TDP;
  const lc = s => String(s || '').toLowerCase();
  let host = null, cur = null;   // modal host + state {mode, n, res}

  const active = D => (D.t.banks || []).filter(b => b.status !== 'inactive');
  const st = D => T.tstate[D.tid] || {};
  const sizeOf = D => D.t.gamesPerRound || 3;   // "Matches each round" on Matchplay's Overview

  // ---------- the bar ----------
  // the row holding Matchplay's "Add bank" button; the bar goes right above the bank cards (or under that row).
  // Found from the button's own row, so the bar sitting there doesn't change where it's placed next time.
  function anchor() {
    const add = T.findBtn(document.querySelector('main') || document, /^Add bank$/);
    if (!add) return null;
    const row = add.closest('div.justify-between') || add.parentElement.parentElement;
    let nx = row.nextElementSibling;
    if (nx && nx.id === 'tdp-bankbar') nx = nx.nextElementSibling;
    return nx && /\bgrid\b/.test(nx.className || '') ? { el: nx, where: 'before' } : { el: row, where: 'after' };
  }
  function render(D) {
    const show = D && D.t && D.isTD && T.routePage() === 'banks' && /bank/i.test(D.t.arenaAssignment || '');
    const a = show ? anchor() : null;
    if (!a) return T.inpage.block('tdp-bankbar', null);
    const has = active(D).length, size = sizeOf(D);
    const html = `<div class="card" style="margin:0 0 12px"><div class="cb gap" style="flex-wrap:wrap;align-items:center">
      <span class="h" style="margin-right:4px">Bank Builder</span>
      <span class="small" title="From &quot;Matches each round&quot; on Matchplay's Overview">${size} game${size === 1 ? '' : 's'} per bank (from Matchplay)</span>
      ${has ? `<button class="btn" data-act="refresh">Refresh banks</button><button class="btn sec" data-act="add">Add banks</button>` : `<button class="btn" data-act="generate">Generate banks</button>`}
      <button class="btn sec" data-act="settings" title="Games and time sources">⚙ Settings</button>
      <span class="small flex1" style="text-align:right">${has ? `${has} bank${has === 1 ? '' : 's'} in Matchplay` : 'No banks yet'}</span>
    </div></div>`;
    T.inpage.block('tdp-bankbar', a.el, a.where, html, onBar);
  }
  async function onBar(e) {
    const D = T.data.D; if (!D || !D.t) return;
    if (e.type !== 'click') return;
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'settings') return openSettings(D);
    if (act === 'generate') return ask(D, 'create', 'How many banks?');
    if (act === 'refresh') return preview(D, 'refresh', active(D).length);
    if (act === 'add') return ask(D, 'add', 'How many banks to add?');
  }

  // ---------- building ----------
  async function times(D) { return T.bankplan.estimates(D, st(D), await T.bankplan.extras(D)); }
  const namesOf = (D, ids) => { const am = T.data.arenaMap(D.t); return (ids || []).map(id => (am[id] || {}).name).filter(Boolean); };
  async function build(D, mode, n) {
    const size = sizeOf(D), s = st(D), ctx = T.bankplan.context(D), est = await times(D);
    const existing = active(D).map(b => namesOf(D, b.arenaIds));
    const estBy = new Map(est.map(g => [lc(g.name), g]));
    // Add: the banks already there stay as they are. Leave their games out of the new banks when there are
    // enough other games; otherwise the fewest-used ones may repeat (and get spread out in time below).
    let exclude = [...(s.bankExclude || [])];
    if (mode === 'add') {
      const inUse = new Set(existing.flat().map(lc));
      const free = est.filter(g => !exclude.includes(g.arenaId) && !inUse.has(lc(g.name)));
      if (free.length >= n * size) exclude = [...exclude, ...est.filter(g => inUse.has(lc(g.name))).map(g => g.arenaId)];
    }
    const fixed = mode === 'add' ? active(D).map(b => ({ name: b.name, games: namesOf(D, b.arenaIds).map(nm => estBy.get(lc(nm)) || { name: nm, sec: T.banks.ERA_DEFAULT_SEC.Unknown }) })) : [];
    // never repeat an arrangement already shown or created: shown/existing banks count as history
    const shown = (s.bankShown || []).map(x => x.banks);
    const hist = [...ctx.history, ...shown, existing];
    const { avoid, usage } = T.banks.historyMaps(hist);
    if (mode === 'add') for (const names of existing) for (const nm of names) usage.set(lc(nm), (usage.get(lc(nm)) || 0) + 3);   // prefer games not in the banks already there
    const seen = new Set(shown.map(sig).concat([sig(existing)]));
    let best = null;
    for (let tries = 0; tries < 12; tries++) {
      const seed = Math.floor(Math.random() * 1e9);
      const res = T.banks.build(est, n, size, { seed, exclude, force: s.bankForce || [], avoid, usage });
      const k = sig(res.banks.map(b => b.games.map(g => g.name)));
      const spread = spreadOf(res.banks);
      if (!seen.has(k) && (!best || spread < best.spread)) best = { res, spread, seed };
      if (best && tries >= 3) break;
    }
    if (!best) throw new Error('Every arrangement of these games has been shown already. Change the games in Settings or the bank count.');
    // play order inside each bank: a machine in more than one bank is played at different times in each
    best.res.overlap = T.banks.schedule(best.res.banks, fixed.map(f => f.games));
    best.res.fixed = fixed;
    const names = active(D).map(b => b.name);
    const taken = new Set(names.map(lc));
    let k = names.length;
    best.res.banks.forEach((b, i) => {
      if (mode === 'refresh') b.name = names[i];
      else { do k++; while (taken.has(lc('Bank ' + k))); b.name = 'Bank ' + k; taken.add(lc(b.name)); }
    });
    best.res.when = T.banks.timeline(best.res.banks, fixed);
    // remember it so Refresh / Another arrangement never shows it again
    const list = [...(s.bankShown || []), { at: Date.now(), banks: best.res.banks.map(b => b.games.map(g => g.name)) }].slice(-20);
    await T.saveT(D.tid, { bankShown: list });
    return best.res;
  }
  const sig = banks => banks.map(b => [...b].map(lc).sort().join('|')).sort().join('#');
  const spreadOf = banks => { const t = banks.map(b => b.total); return t.length ? Math.max(...t) - Math.min(...t) : 0; };

  // ---------- windows ----------
  const CSS = () => `${T.panel.CSS}
:host{all:initial}
.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:800px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}
.dh{padding:16px 20px 8px;font-size:18px;font-weight:500}
.db{padding:4px 20px 16px;max-height:65vh;overflow:auto}
.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px;flex-wrap:wrap}
.bk{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.bk .card{margin:0}
.bk li{display:flex;justify-content:space-between;gap:6px;padding:2px 0}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.seg button{border:0;background:var(--card);padding:3px 8px;font:inherit;font-size:12px;cursor:pointer;color:var(--text)}
.seg button.on{background:var(--pri);color:#fff}
table{width:100%;border-collapse:collapse}td{padding:4px 6px;border-top:1px solid var(--line)}`;
  function show(inner) {
    if (!host) {
      host = document.createElement('div'); host.id = 'tdp-bb-modal';
      host.attachShadow({ mode: 'open' });
      host.shadowRoot.addEventListener('click', onModal);
      host.shadowRoot.addEventListener('change', onModal);
      document.documentElement.appendChild(host);
    }
    host.shadowRoot.innerHTML = `<style>${CSS()}</style><div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg">${inner}</div></div></div>`;
    const inp = host.shadowRoot.querySelector('input[data-autofocus]'); if (inp) inp.focus();
  }
  function close() { if (host) host.remove(); host = null; cur = null; }

  function ask(D, mode, q) {
    cur = { mode };
    show(`<div class="dh">${T.esc(q)}</div><div class="db"><input type="number" min="1" data-autofocus data-f="askN" value=""></div>
      <div class="df"><button class="btn sec" data-act="close">Cancel</button><button class="btn" data-act="askOk">Preview</button></div>`);
  }

  async function preview(D, mode, n) {
    cur = { mode, n };
    show(`<div class="dh">Building ${n} bank${n === 1 ? '' : 's'}…</div><div class="db small">Working out the arrangement.</div>`);
    try { cur.res = await build(D, mode, n); } catch (e) {
      return show(`<div class="dh">Can't build banks</div><div class="db"><div class="callout">${T.esc(e.message || String(e))}</div></div><div class="df"><button class="btn sec" data-act="settings">Settings</button><button class="btn" data-act="close">Close</button></div>`);
    }
    drawPreview();
  }
  function drawPreview() {
    const { mode, n, res } = cur, t = res.banks.map(b => b.total);
    const title = mode === 'refresh' ? `Refresh games in ${n} bank${n === 1 ? '' : 's'}` : mode === 'add' ? `Add ${n} bank${n === 1 ? '' : 's'}` : `Create ${n} bank${n === 1 ? '' : 's'}`;
    const at = sec => T.fmtDur(sec * 1000);
    const cards = res.banks.map((b, bi) => `<div class="card"><div class="ch"><span class="h">${T.esc(b.name)}</span><span class="small">${at(b.total)}</span></div><div class="cb"><ul style="margin:0;padding:0;list-style:none">${b.games.map((g, gi) => {
      const w = res.when[bi][gi], clash = w.also.filter(x => x.overlap > 0 || x.sameSlot), same = w.also.filter(x => x.sameSlot);
      const also = w.also.length ? `<div class="small ${clash.length ? 'err' : 'muted'}" style="padding-left:44px">${clash.length ? '⚠ ' : ''}also in ${w.also.map(x => `${T.esc(x.bank)} as game ${x.pos + 1} @ ${at(x.s)}`).join(', ')}${same.length ? ` - same game number as ${same.map(x => T.esc(x.bank)).join(', ')}` : clash.length ? ` - overlaps ~${Math.ceil(Math.max(...clash.map(x => x.overlap)) / 60)} min` : ''}</div>` : '';
      return `<li><span class="small" style="width:44px;flex:none">@${at(w.s)}</span><span class="ell flex1">${T.esc(g.name)}${g.repeat ? ' <span class="badge b-amber">repeat</span>' : ''}</span><span class="small" title="${T.esc(g.src)}">${T.esc(g.era)} · ${at(g.sec)}</span></li>${also}`;
    }).join('')}</ul>${b.repeatPairs ? '<div class="small warn mt">Has a game pair from an earlier round</div>' : ''}</div></div>`).join('');
    const notes = [`Bank times ${at(Math.min(...t))} – ${at(Math.max(...t))} (spread ${at(Math.max(...t) - Math.min(...t))}). @ = expected start; games are played in this order.`];
    if (res.fixed.length) notes.push(res.fixed.length === 1 ? 'Your existing bank stays as it is.' : `Your ${res.fixed.length} existing banks stay as they are.`);
    if (res.banks.some((b, bi) => res.when[bi].some(w => w.also.some(x => x.overlap > 0 || x.sameSlot)))) notes.push('Some machines are in more than one bank at the same game number or at overlapping times (marked ⚠): two groups may wait on the same game. Try another arrangement, or add more games in Matchplay.');
    if (res.dropped.length) notes.push(`Not used this time: ${res.dropped.map(g => g.name).join(', ')}`);
    if (mode === 'refresh') notes.push('Bank names stay the same; their games are replaced.');
    show(`<div class="dh">${title}</div><div class="db"><div class="small mb">${notes.map(T.esc).join('<br>')}</div><div class="bk">${cards}</div></div>
      <div class="df"><button class="btn sec" data-act="close">Cancel</button><button class="btn sec" data-act="another">Another arrangement</button><button class="btn" data-act="confirm">Confirm</button></div>`);
  }

  async function confirm(D) {
    const { mode, res } = cur, banks = res.banks.map(b => ({ name: b.name, arenas: b.games.map(g => g.name) }));
    const step = mode === 'refresh'
      ? { tid: D.tid, page: 'banks', op: 'bankArenas', args: { banks }, label: `Replacing games in ${banks.length} banks` }
      : { tid: D.tid, page: 'banks', op: 'createBanks', args: { banks }, label: `Creating ${banks.length} banks` };
    close();
    await T.jobs.start(mode === 'refresh' ? 'Refresh banks' : mode === 'add' ? 'Add banks' : 'Generate banks', [step]);
  }

  // ---------- Assign banks (Matches tab button) ----------
  function assignPreview(D, k = 0) {
    const o = T.bankplan.assignOptions(D);
    if (!o.list.length) return T.panel.say(o.banks.length ? 'No group in this round needs a bank.' : 'No banks yet - make them on the Banks tab.', 'err');
    k = k % o.list.length; cur = { mode: 'assign', k, o };
    const opt = o.list[k];
    const rows = opt.pairs.map(p => {
      const lines = [];
      if (p.similar.length) lines.push(`<div class="small err">⚠ Very like a bank already played: ${p.similar.map(x => `${T.esc(x.player)} (${x.same} of the same games in ${T.esc(x.round)})`).join(', ')}</div>`);
      if (p.repeats.length) lines.push(`<div class="small warn">Repeats: ${p.repeats.map(x => `${T.esc(x.player)} played ${T.esc(x.game)}${x.times > 1 ? ' ×' + x.times : ''}`).join(', ')}</div>`);
      return `<tr><td><b>Group ${p.group}</b></td><td>→ ${T.esc(p.bank)}</td><td class="small">${p.fresh} of ${p.total} new</td></tr>${lines.length ? `<tr><td></td><td colspan="2">${lines.join('')}</td></tr>` : ''}`;
    }).join('');
    const notes = [];
    if (o.shared) notes.push(`${o.ctx.groups.length} groups but ${o.banks.length} banks: some banks are shared. Add banks on the Banks tab so each group gets its own.`);
    if (opt.pairs.some(p => p.repeats.length || p.similar.length)) notes.push('Some repeats can\'t be avoided with these banks. Refresh or Add banks on the Banks tab for more variety.');
    show(`<div class="dh">Assign banks · ${T.esc(o.ctx.round.name || 'this round')}</div><div class="db">
      <div class="small mb">Picked so players get games they haven't played, avoiding banks close to one they already had (2+ of the same games).${o.list.length > 1 ? ` Option ${k + 1} of ${o.list.length}.` : ''}</div>
      <table>${rows}</table>${notes.map(n => `<div class="callout warn mt">${T.esc(n)}</div>`).join('')}</div>
      <div class="df"><button class="btn sec" data-act="close">Cancel</button>${o.list.length > 1 ? '<button class="btn sec" data-act="nextOpt">Another option</button>' : ''}<button class="btn" data-act="assignGo">Assign</button></div>`);
  }

  // ---------- Fill random results (Test tournaments) ----------
  function fillConfirm(D) {
    const r = T.data.currentRound(); if (!r || D.t.test !== true) return;
    const open = D.games.filter(g => g.roundId === r.roundId && !g.bye && g.set !== 9999 && !T.timing.isDone(g)), ready = open.filter(g => g.arenaId != null);
    cur = { mode: 'fill', r };
    show(`<div class="dh">Fill random results?</div><div class="db">
      <div class="mb">Enter a random finishing order for all <b>${ready.length}</b> open game${ready.length === 1 ? '' : 's'} in ${T.esc(r.name || 'this round')}.</div>
      ${ready.length < open.length ? `<div class="callout warn">${open.length - ready.length} game${open.length - ready.length === 1 ? ' has' : 's have'} no arena yet and will be skipped. Assign banks first.</div>` : ''}
      <div class="small">Only on Test tournaments. Each game gets its own random order.</div></div>
      <div class="df"><button class="btn sec" data-act="close">Cancel</button><button class="btn" data-act="fillGo">Fill ${ready.length} game${ready.length === 1 ? '' : 's'}</button></div>`);
  }

  // ---------- settings ----------
  async function openSettings(D) {
    cur = { mode: 'settings' };
    const s = st(D), est = await times(D), ex = new Set(s.bankExclude || []), fo = new Set(s.bankForce || []);
    const hist = await T.store.get('hist', {}), use = new Set(s.histUse || []);
    const isFinals = D.qual && D.qual.tournamentId !== D.tid;
    const rows = [...est].sort((a, b) => (a.era > b.era) - (a.era < b.era) || a.name.localeCompare(b.name)).map(g => {
      const v = ex.has(g.arenaId) ? 'never' : fo.has(g.arenaId) ? 'always' : 'use';
      return `<tr><td>${T.esc(g.name)}</td><td class="small">${T.esc(g.era)}</td><td class="small" title="${T.esc(g.src)}">${T.fmtDur(g.sec * 1000)}</td><td style="text-align:right"><span class="seg">${['use', 'never', 'always'].map(x => `<button class="${x === v ? 'on' : ''}" data-act="mode" data-a="${g.arenaId}" data-v="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</span></td></tr>`;
    }).join('');
    const histRows = Object.entries(hist).filter(([id]) => +id !== D.tid).sort((a, b) => b[1].at - a[1].at).slice(0, 15).map(([id, x]) => `<label class="gap"><input type="checkbox" data-hist="${id}" ${use.has(id) ? 'checked' : ''}> <span class="flex1 ell">${T.esc(x.name)}</span><span class="small">${Object.keys(x.arenas).length} arenas</span></label>`).join('') || '<div class="small">None yet. Times are saved automatically from every tournament you open with the extension.</div>';
    show(`<div class="dh">Bank settings</div><div class="db">
      <div class="lab">Games</div><div class="small mb">Use = may be picked · Never = left out · Always = in every set of banks</div>
      <table>${rows}</table>
      <div class="lab mt">Game times from</div>
      <div class="small mb">All sources are combined, weighted by how many games each has: this tournament${isFinals ? ', the qualifying (automatic)' : ''}, the Matchplay IDs below, and the past events you tick. Same list as the Arenas tab.</div>
      <div class="gap mb"><input type="text" data-f="pastIds" placeholder="Matchplay tournament IDs, e.g. 201234, 205678" value="${T.esc(s.bankPast || '')}"><button class="btn sm sec" data-act="loadPast">Load</button></div>
      ${s.pastTimes ? `<div class="small mb">${Object.keys(s.pastTimes).length} arenas loaded from those IDs.</div>` : ''}
      <div class="lab mt">Past events run with the extension</div>${histRows}
    </div><div class="df"><button class="btn" data-act="close">Done</button></div>`);
  }

  async function onModal(e) {
    const D = T.data.D; if (!D) return;
    const el = e.target;
    if (e.type === 'change') {
      if (el.dataset.hist) { const s2 = new Set(st(D).histUse || []); el.checked ? s2.add(el.dataset.hist) : s2.delete(el.dataset.hist); await T.saveT(D.tid, { histUse: [...s2] }); }
      return;
    }
    const a = el.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'bg' && el !== a) return;
    const act = a.dataset.act;
    try {
      if (act === 'bg' || act === 'close') return close();
      if (act === 'askOk') {
        const n = +host.shadowRoot.querySelector('[data-f=askN]').value;
        if (!n || n < 1) return T.panel.say('Enter how many banks.', 'err');
        return preview(D, cur.mode, n);
      }
      if (act === 'another') return preview(D, cur.mode, cur.n);
      if (act === 'nextOpt') return assignPreview(D, cur.k + 1);
      if (act === 'fillGo') { const r = cur.r; close(); return T.jobs.start(`Random results for ${r.name || 'this round'}`, [{ tid: D.tid, page: 'matches', op: 'fillResults', args: { tid: D.tid, roundId: r.roundId }, label: 'Entering random results' }]); }
      if (act === 'assignGo') { const { o, k } = cur; close(); return T.jobs.start(`Assign banks for ${o.ctx.round.name || 'this round'}`, T.bankplan.assignSteps(D, o.ctx, o.list[k])); }
      if (act === 'confirm') return confirm(D);
      if (act === 'settings') return openSettings(D);
      if (act === 'mode') {
        const id = +a.dataset.a, v = a.dataset.v, s = st(D);
        const ex = new Set(s.bankExclude || []), fo = new Set(s.bankForce || []);
        ex.delete(id); fo.delete(id); if (v === 'never') ex.add(id); if (v === 'always') fo.add(id);
        await T.saveT(D.tid, { bankExclude: [...ex], bankForce: [...fo] });
        return openSettings(D);
      }
      if (act === 'loadPast') {
        const ids = (host.shadowRoot.querySelector('[data-f=pastIds]').value.match(/\d+/g) || []).map(Number);
        a.disabled = true; a.textContent = 'Loading…';
        const k = await T.bankplan.loadPast(D, ids);
        T.panel.say(`Loaded times for ${k} arenas.`, 'ok');
        return openSettings(D);
      }
    } catch (err) { T.panel.say(err.message || String(err), 'err'); }
  }
  // keyboard: Enter in the "how many" box
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && cur && cur.mode !== 'settings' && host && e.composedPath().some(x => x.dataset && x.dataset.f === 'askN')) host.shadowRoot.querySelector('[data-act=askOk]').click(); }, true);

  return { render, close, assignPreview, fillConfirm };
})();
