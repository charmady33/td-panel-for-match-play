// Bar on Matchplay's Banks tab: Generate banks (none yet) / Refresh + Add (banks exist), with a preview to
// confirm before anything is created, and a Settings window (games to use/never/always, time sources).
var TDP = window.TDP || (window.TDP = {});

TDP.bankbar = (() => {
  const T = TDP;
  const lc = s => String(s || '').toLowerCase();
  let host = null, cur = null;   // modal host + state {mode, n, size, plan, seed}

  const active = D => (D.t.banks || []).filter(b => b.status !== 'inactive');
  const st = D => T.tstate[D.tid] || {};
  const sizeOf = D => +st(D).barSize || D.t.gamesPerRound || 3;

  // ---------- the bar ----------
  function anchor() {
    const add = T.findBtn(document.querySelector('main') || document, /^Add bank$/);
    if (!add) return null;
    let row = add; while (row.parentElement && !(row.nextElementSibling && /grid/.test(row.nextElementSibling.className || ''))) { row = row.parentElement; if (row.tagName === 'MAIN') return add.parentElement; }
    return row;
  }
  function render(D) {
    const show = D && D.t && D.isTD && T.routePage() === 'banks' && /bank/i.test(D.t.arenaAssignment || '');
    const a = show ? anchor() : null;
    if (!a) return T.inpage.block('tdp-bankbar', null);
    const s = st(D), has = active(D).length;
    const html = `<div class="card" style="margin:0 0 12px"><div class="cb gap" style="flex-wrap:wrap;align-items:flex-end">
      <span class="h" style="margin-right:4px">Bank builder</span>
      <label style="width:90px"><div class="lab">Banks</div><input type="number" min="1" data-f="barN" value="${s.barN || ''}"></label>
      <label style="width:130px"><div class="lab" style="white-space:nowrap">Games per bank</div><input type="number" min="1" data-f="barSize" value="${sizeOf(D)}"></label>
      ${has ? `<button class="btn" data-act="refresh">Refresh banks</button><button class="btn sec" data-act="add">Add banks</button>` : `<button class="btn" data-act="generate">Generate banks</button>`}
      <button class="btn sec" data-act="settings" title="Games and time sources">⚙ Settings</button>
      <span class="small flex1" style="text-align:right">${has ? `${has} bank${has === 1 ? '' : 's'} in Matchplay` : 'No banks yet'}</span>
    </div></div>`;
    T.inpage.block('tdp-bankbar', a, 'after', html, onBar);
  }
  async function onBar(e) {
    const D = T.data.D; if (!D || !D.t) return;
    const f = e.target.dataset && e.target.dataset.f;
    if (e.type === 'change' && f) { await T.saveT(D.tid, { [f]: e.target.value ? +e.target.value : null }); return; }
    if (e.type !== 'click') return;
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act, root = a.getRootNode();
    const nBox = root.querySelector('[data-f=barN]'), sBox = root.querySelector('[data-f=barSize]');
    const size = +sBox.value || sizeOf(D);
    if (act === 'settings') return openSettings(D);
    if (act === 'generate') { const n = +nBox.value; return n ? preview(D, 'create', n, size) : ask(D, 'create', size, 'How many banks?'); }
    if (act === 'refresh') return preview(D, 'refresh', active(D).length, size);
    if (act === 'add') return ask(D, 'add', size, 'How many banks to add?');
  }

  // ---------- building ----------
  async function times(D) {
    const s = st(D), use = new Set(s.histUse || []), hist = await T.store.get('hist', {});
    let qual = null; try { qual = await T.bankplan.qualTimes(D); } catch (e) { /* qualifying times are optional */ }
    return T.bankplan.estimates(D, s, { qual, hist: Object.entries(hist).filter(([id]) => use.has(id) && +id !== D.tid).map(([, h]) => h.arenas) });
  }
  const namesOf = (D, ids) => { const am = T.data.arenaMap(D.t); return (ids || []).map(id => (am[id] || {}).name).filter(Boolean); };
  async function build(D, mode, n, size) {
    const s = st(D), ctx = T.bankplan.context(D), est = await times(D);
    const existing = active(D).map(b => namesOf(D, b.arenaIds));
    // never repeat an arrangement already shown or created: shown/existing banks count as history
    const shown = (s.bankShown || []).map(x => x.banks);
    const hist = [...ctx.history, ...shown, existing];
    const { avoid, usage } = T.banks.historyMaps(hist);
    if (mode === 'add') for (const names of existing) for (const nm of names) usage.set(lc(nm), (usage.get(lc(nm)) || 0) + 3);   // prefer games not in the banks already there
    const seen = new Set(shown.map(sig).concat([sig(existing)]));
    let best = null;
    for (let tries = 0; tries < 12; tries++) {
      const seed = Math.floor(Math.random() * 1e9);
      const res = T.banks.build(est, n, size, { seed, exclude: s.bankExclude || [], force: s.bankForce || [], avoid, usage });
      const k = sig(res.banks.map(b => b.games.map(g => g.name)));
      const spread = spreadOf(res.banks);
      if (!seen.has(k) && (!best || spread < best.spread)) best = { res, spread, seed };
      if (best && tries >= 3) break;
    }
    if (!best) throw new Error('Every arrangement of these games has been shown already. Change the games in Settings or the bank count.');
    const names = active(D).map(b => b.name);
    const taken = new Set(names.map(lc));
    let k = names.length;
    best.res.banks.forEach((b, i) => {
      if (mode === 'refresh') b.name = names[i];
      else { do k++; while (taken.has(lc('Bank ' + k))); b.name = 'Bank ' + k; taken.add(lc(b.name)); }
    });
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
.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:640px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}
.dh{padding:16px 20px 8px;font-size:18px;font-weight:500}
.db{padding:4px 20px 16px;max-height:65vh;overflow:auto}
.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px;flex-wrap:wrap}
.bk{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
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

  function ask(D, mode, size, q) {
    cur = { mode, size };
    show(`<div class="dh">${T.esc(q)}</div><div class="db"><input type="number" min="1" data-autofocus data-f="askN" value="${mode === 'create' ? (st(D).barN || '') : ''}"></div>
      <div class="df"><button class="btn sec" data-act="close">Cancel</button><button class="btn" data-act="askOk">Preview</button></div>`);
  }

  async function preview(D, mode, n, size) {
    cur = { mode, n, size };
    show(`<div class="dh">Building ${n} bank${n === 1 ? '' : 's'}…</div><div class="db small">Working out the arrangement.</div>`);
    try { cur.res = await build(D, mode, n, size); } catch (e) {
      return show(`<div class="dh">Can't build banks</div><div class="db"><div class="callout">${T.esc(e.message || String(e))}</div></div><div class="df"><button class="btn sec" data-act="settings">Settings</button><button class="btn" data-act="close">Close</button></div>`);
    }
    drawPreview();
  }
  function drawPreview() {
    const { mode, n, res } = cur, t = res.banks.map(b => b.total);
    const title = mode === 'refresh' ? `Refresh games in ${n} bank${n === 1 ? '' : 's'}` : mode === 'add' ? `Add ${n} bank${n === 1 ? '' : 's'}` : `Create ${n} bank${n === 1 ? '' : 's'}`;
    const cards = res.banks.map(b => `<div class="card"><div class="ch"><span class="h">${T.esc(b.name)}</span><span class="small">${T.fmtDur(b.total * 1000)}</span></div><div class="cb"><ul style="margin:0;padding:0;list-style:none">${b.games.map(g => `<li><span class="ell">${T.esc(g.name)}${g.repeat ? ' <span class="badge b-amber">repeat</span>' : ''}</span><span class="small" title="${T.esc(g.src)}">${T.esc(g.era)} · ${T.fmtDur(g.sec * 1000)}</span></li>`).join('')}</ul>${b.repeatPairs ? '<div class="small warn mt">Has a game pair from an earlier round</div>' : ''}</div></div>`).join('');
    const notes = [`Bank times ${T.fmtDur(Math.min(...t) * 1000)} – ${T.fmtDur(Math.max(...t) * 1000)} (spread ${T.fmtDur((Math.max(...t) - Math.min(...t)) * 1000)})`];
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
      <div class="small mb">This tournament's own games always count first.${isFinals ? ' The qualifying tournament is included automatically.' : ''}</div>
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
        if (cur.mode === 'create') await T.saveT(D.tid, { barN: n });
        return preview(D, cur.mode, n, cur.size);
      }
      if (act === 'another') return preview(D, cur.mode, cur.n, cur.size);
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

  return { render, close };
})();
