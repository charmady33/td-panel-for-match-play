// "Delete test tournaments" on Matchplay's Organized tournaments page.
// Lists every tournament you organize that Matchplay marks as Test (never a regular one), you untick any to keep,
// type DELETE, and they're deleted with Matchplay's own Overview → More… → Delete tournament, finals before their
// qualifying. Right before each delete the tournament is read again: not Test, or not yours -> skipped.
var TDP = window.TDP || (window.TDP = {});

TDP.deltest = (() => {
  const T = TDP;
  let list = null, listAt = 0, loadingList = false, host = null, cur = null;

  const onPage = () => /^\/tournaments\/organized\/?$/.test(location.pathname);
  async function me() { if (!T.data.D.me) T.data.D.me = T.data.unwrap(await T.api.get('/users/profile', 3600e3)); return T.data.D.me; }
  // every test tournament you organize (the API list, all pages)
  async function load(force) {
    if (loadingList || (!force && list && Date.now() - listAt < 60e3)) return list;
    loadingList = true;
    try {
      const u = await me(), out = [];
      for (let page = 1; page <= 20; page++) {
        const j = await T.api.get(`/tournaments?owner=${u.userId}&limit=100&page=${page}`, force ? 0 : 55e3);
        const rows = Array.isArray(j) ? j : (j && j.data) || [];
        out.push(...rows);
        const last = j && j.meta && (j.meta.last_page || j.meta.lastPage);
        if (!last || page >= last) break;
      }
      list = out.filter(t => t.test === true && t.organizerId === u.userId);
      listAt = Date.now();
    } catch (e) { list = list || []; T.warn('deltest', e); }
    finally { loadingList = false; }
    return list;
  }

  // ---------- the bar ----------
  function render() {
    if (T.isFrame) return;
    const row = onPage() && T.settings.token ? [...document.querySelectorAll('main div.mb-2.flex')].find(e => T.findBtn(e, /^Status/)) : null;
    if (!row) { T.inpage.block('tdp-deltest', null); return; }
    if (!list && !loadingList) load().then(render);
    const n = list ? list.length : null;
    T.inpage.block('tdp-deltest', row, 'before', `<div class="card" style="margin:0 0 12px"><div class="cb gap" style="align-items:center;flex-wrap:wrap">
      <span class="h flex1">Test tournaments</span>
      <span class="small">${n == null ? 'Checking…' : n ? `${n} test tournament${n === 1 ? '' : 's'} you organize` : 'None'}</span>
      <button class="btn sm red" data-act="open" ${n ? '' : 'disabled'}>Delete test tournaments${n ? ` (${n})` : ''}</button></div>${resultHtml()}</div>`, onBar);
  }
  // the last run's outcome, per tournament (until dismissed)
  const lastRun = () => { const j = T.jobs.get(); return j && j.del && /^Delete \d+ test tournament/.test(j.title) && (j.done || j.error) ? j : null; };
  const dismissed = () => { try { return Number(sessionStorage.getItem('tdp-deltest-seen')) || 0; } catch (e) { return 0; } };
  function resultHtml() {
    const j = lastRun(); if (!j || j.startedAt === dismissed()) return '';
    const c = k => j.del.filter(x => x.status === k);
    const dl = c('deleted'), sk = c('skipped'), fl = c('failed');
    const line = x => `<div class="small" style="padding:2px 0"><b>${T.esc(x.name)}</b>: ${x.status}${x.why ? ` - ${T.esc(x.why)}` : ''}</div>`;
    return `<div class="cb" style="border-top:1px solid var(--line)">
      <div class="callout ${fl.length || j.error ? 'warn' : 'ok'}" style="margin-bottom:6px"><b>Deleted ${dl.length}</b>${sk.length ? ` · Skipped ${sk.length}` : ''}${fl.length ? ` · Failed ${fl.length}` : ''}${j.error ? ` · Stopped: ${T.esc(j.error)}` : ''}</div>
      ${[...fl, ...sk, ...dl].map(line).join('')}
      <div class="gap mt">${fl.length ? `<button class="btn sm" data-act="retry">Retry ${fl.length} failed</button>` : ''}<button class="btn sm sec" data-act="dismiss">Dismiss</button></div></div>`;
  }
  async function onBar(e) {
    if (e.type !== 'click') return;
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'open') return open();
    const j = lastRun(); if (!j) return;
    if (a.dataset.act === 'dismiss') { try { sessionStorage.setItem('tdp-deltest-seen', String(j.startedAt)); } catch (err) { /* */ } return render(); }
    if (a.dataset.act === 'retry') {
      const rows = j.del.filter(x => x.status === 'failed');
      const steps = rows.map((r, i) => ({ tid: r.tid, page: 'overview', op: 'deleteTest', args: { tid: r.tid, name: r.name }, label: `Deleting ${i + 1} of ${rows.length}: ${r.name}` }));
      try { await T.jobs.start(`Delete ${rows.length} test tournament${rows.length === 1 ? '' : 's'}`, steps, { after: { what: 'deltest' } }); } catch (err) { T.panel.say(err.message || String(err), 'err'); }
    }
  }

  // ---------- the window ----------
  const CSS = () => `${T.panel.CSS}
:host{all:initial}
.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:620px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text);display:flex;flex-direction:column;max-height:88vh}
.dh{padding:16px 20px 8px;font-size:18px;font-weight:500}
.db{padding:4px 20px 16px;overflow:auto;min-height:0}
.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px;flex-wrap:wrap;align-items:center}
label.row{display:flex;gap:10px;align-items:center;padding:7px 4px;border-top:1px solid var(--line);cursor:pointer}
label.row:first-child{border-top:0}`;
  async function open() {
    cur = { keep: new Set(), typed: '', loading: true };
    if (!host) { host = document.createElement('div'); host.id = 'tdp-deltest-dlg'; host.attachShadow({ mode: 'open' }); host.shadowRoot.addEventListener('click', onClick); host.shadowRoot.addEventListener('input', onInput); host.shadowRoot.addEventListener('change', onInput); document.documentElement.appendChild(host); }
    draw();
    await load(true);
    // finals first: a qualifying is the one with playoffs linked (details read once per tournament)
    cur.rows = [];
    for (const t of list) {
      let full = t; try { full = await T.data.loadTournament(t.tournamentId, 300e3); } catch (e) { /* keep the list row */ }
      const isQual = (full.linkedTournaments || []).some(l => l.linkType === 'playoff');
      cur.rows.push({ id: t.tournamentId, name: full.name || t.name, status: full.status || t.status, date: full.startUtc || t.startUtc, isQual });
    }
    cur.rows.sort((a, b) => (a.isQual - b.isQual) || String(b.date || '').localeCompare(String(a.date || '')));
    cur.loading = false; draw();
  }
  function close() { if (host) host.remove(); host = null; cur = null; }
  const chosen = () => (cur.rows || []).filter(r => !cur.keep.has(r.id));
  function draw() {
    if (!host || !cur) return;
    const badge = s => s === 'started' ? '<span class="badge b-green">In progress</span>' : s === 'completed' ? '<span class="badge b-blue">Completed</span>' : '<span class="badge b-indigo">Planned</span>';
    const n = cur.rows ? chosen().length : 0, ok = n && cur.typed.trim() === 'DELETE';
    const body = cur.loading ? '<div class="small">Finding your test tournaments…</div>'
      : !cur.rows.length ? '<div class="callout ok">You have no test tournaments.</div>'
      : `<div class="callout warn">Deleting is permanent: Matchplay removes the tournament and all its games. Only tournaments Matchplay marks as <b>Test</b> are listed; regular ones never are. Untick any you want to keep.</div>
        <div>${cur.rows.map(r => `<label class="row"><input type="checkbox" data-id="${r.id}" ${cur.keep.has(r.id) ? '' : 'checked'}><span class="flex1"><b>${T.esc(r.name)}</b><div class="small">${r.date ? new Date(r.date).toLocaleDateString() : ''} · #${r.id}${r.isQual ? ' · qualifying (deleted after its finals)' : ''}</div></span>${badge(r.status)}</label>`).join('')}</div>
        <div class="mt"><div class="lab mb">Type <b>DELETE</b> to confirm</div><input type="text" data-f="typed" value="${T.esc(cur.typed)}" placeholder="DELETE" autocomplete="off" style="width:200px"></div>`;
    const keepFocus = host.shadowRoot.activeElement && host.shadowRoot.activeElement.dataset.f === 'typed';
    host.shadowRoot.innerHTML = `<style>${CSS()}</style><div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg">
      <div class="dh">Delete test tournaments</div><div class="db">${body}</div>
      <div class="df"><button class="btn sec" data-act="close">Cancel</button>${cur.rows && cur.rows.length ? `<button class="btn red" data-act="go" ${ok ? '' : 'disabled'}>Delete ${n} test tournament${n === 1 ? '' : 's'}</button>` : ''}</div></div></div></div>`;
    if (keepFocus) { const i = host.shadowRoot.querySelector('[data-f=typed]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  }
  function onInput(e) {
    if (!cur) return;
    const el = e.target;
    if (el.dataset.f === 'typed') { cur.typed = el.value; const b = host.shadowRoot.querySelector('[data-act=go]'); if (b) b.disabled = !(chosen().length && cur.typed.trim() === 'DELETE'); return; }
    if (el.dataset.id && e.type === 'change') { const id = +el.dataset.id; if (el.checked) cur.keep.delete(id); else cur.keep.add(id); draw(); }
  }
  async function onClick(e) {
    const a = e.target.closest('[data-act]'); if (!a || !cur) return;
    if (a.dataset.act === 'bg' && e.target !== a) return;
    if (a.dataset.act === 'bg' || a.dataset.act === 'close') return close();
    if (a.dataset.act === 'go') {
      const rows = chosen(); if (!rows.length || cur.typed.trim() !== 'DELETE') return;
      close();
      const steps = rows.map((r, i) => ({ tid: r.id, page: 'overview', op: 'deleteTest', args: { tid: r.id, name: r.name }, label: `Deleting ${i + 1} of ${rows.length}: ${r.name}` }));
      try { await T.jobs.start(`Delete ${rows.length} test tournament${rows.length === 1 ? '' : 's'}`, steps, { after: { what: 'deltest' } }); }
      catch (err) { T.panel.say(err.message || String(err), 'err'); }
    }
  }

  // after the task: fresh list, and Matchplay's own list fetched again
  T.jobs.afterHandlers.deltest = async () => { list = null; await load(true); render(); if (onPage()) T.sync.soft({ any: true }); };

  return { render, open, load };
})();
