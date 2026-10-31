/* global chrome */
// Toolbar button: your events (qualifying with its finals underneath), the API token, and clearing saved data.
(async () => {
  const $ = id => document.getElementById(id);
  const APP = 'https://app.matchplay.events', API = 'https://api.matchplay.events/api';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  $('ver').textContent = 'Version ' + chrome.runtime.getManifest().version;
  // a newer version on GitHub (checked by the background part)
  const { update } = await chrome.storage.local.get('update');
  if (update && update.version) {
    $('upd').hidden = false;
    $('upd').innerHTML = `<b>Update available: ${esc(update.version)}</b><br><a href="${esc(update.zip)}" target="_blank" rel="noopener">Download</a> · <a href="${esc(update.page)}" target="_blank" rel="noopener">What's new</a> · <a href="https://github.com/charmady33/td-panel-for-match-play#updating" target="_blank" rel="noopener">How to update</a>`;
  }
  chrome.runtime.sendMessage({ type: 'tdp-check-update' }).catch(() => {});
  const { settings = {} } = await chrome.storage.local.get('settings');
  $('tok').value = settings.token || '';
  // on/off switch: every Matchplay tab follows straight away (they watch the saved settings)
  const showOn = v => { $('on').checked = v; $('onTxt').textContent = v ? 'TD Panel is on' : 'TD Panel is off'; document.body.classList.toggle('off', !v); };
  showOn(!settings.off);
  $('on').addEventListener('change', async () => {
    const cur = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: { ...cur, off: !$('on').checked } });
    showOn($('on').checked);
    chrome.runtime.sendMessage({ type: 'tdp-onoff' }).catch(() => {});
  });
  $('save').addEventListener('click', async () => {
    const cur = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: { ...cur, token: $('tok').value.trim() } });
    $('msg').textContent = 'Saved. Open tournament pages update straight away.';
    loadEvents();
  });

  // ---------- clear saved data for the open tournament ----------
  let tid = null;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const m = tab && tab.url && tab.url.match(/^https:\/\/app\.matchplay\.events\/tournaments\/(\d+)/);
    if (m) tid = m[1];
  } catch (e) { /* no tab info */ }
  if (tid) { $('tinfo').textContent = `Tournament ${tid}: cut-offs, check-in, tiebreakers and bank settings saved by the extension.`; $('clear').disabled = false; }
  $('clear').addEventListener('click', async () => {
    if (!tid || !confirm(`Clear everything the extension saved for tournament ${tid}?`)) return;
    await chrome.storage.local.remove(['t:' + tid, 'cache:' + tid]);
    $('msg').textContent = 'Cleared. Reload the tournament page.';
  });

  // ---------- your events ----------
  async function api(path) {
    const { settings: s = {} } = await chrome.storage.local.get('settings');
    if (!s.token) throw new Error('NO_TOKEN');
    const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + s.token, Accept: 'application/json' } });
    if (r.status === 401) throw new Error('BAD_TOKEN');
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  const rows = j => Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : []);
  const one = j => (j && j.data && !Array.isArray(j.data) ? j.data : j);
  const full = id => api(`/tournaments/${id}?includeLinkedTournaments=1`).then(one);
  const badge = s => s === 'started' ? '<span class="b g">In progress</span>' : s === 'completed' ? '<span class="b c">Completed</span>' : '<span class="b p">Planned</span>';

  async function loadEvents() {
    const box = $('events');
    box.innerHTML = '<div class="s">Loading your tournaments…</div>';
    try {
      const me = one(await api('/users/profile'));
      const [started, planned] = await Promise.all([
        api(`/tournaments?owner=${me.userId}&status=started&limit=50`).then(rows),
        api(`/tournaments?owner=${me.userId}&status=planned&limit=50`).then(rows),
      ]);
      const byId = new Map(); [...started, ...planned].forEach(t => byId.set(t.tournamentId, t));
      // details (links between qualifying and finals) for each
      const det = new Map();
      for (const t of byId.values()) { try { det.set(t.tournamentId, await full(t.tournamentId)); } catch (e) { det.set(t.tournamentId, t); } }
      // events keyed by their qualifying: finals point to it, a qualifying lists its playoffs
      const events = new Map();
      const qualOf = t => { const l = (t.linkedTournaments || []).find(x => x.linkType !== 'playoff'); const isQual = (t.linkedTournaments || []).some(x => x.linkType === 'playoff'); return isQual || !l ? t.tournamentId : l.tournamentId; };
      for (const t of det.values()) { const q = qualOf(t); if (!events.has(q)) events.set(q, { q, finals: new Map() }); }
      for (const ev of events.values()) {
        let qt = det.get(ev.q); if (!qt) { try { qt = await full(ev.q); det.set(ev.q, qt); } catch (e) { qt = { tournamentId: ev.q, name: 'Qualifying', status: '' }; } }
        ev.qt = qt;
        for (const l of (qt.linkedTournaments || []).filter(x => x.linkType === 'playoff').sort((a, b) => (a.linkIndex || 0) - (b.linkIndex || 0)))
          ev.finals.set(l.tournamentId, det.get(l.tournamentId) || { tournamentId: l.tournamentId, name: l.name, status: l.status });
      }
      // current round of what's in progress
      const roundOf = new Map();
      for (const t of det.values()) if (t.status === 'started') {
        try { const rs = rows(await api(`/tournaments/${t.tournamentId}/rounds`)).sort((a, b) => (a.index ?? a.roundId) - (b.index ?? b.roundId)); const r = rs[rs.length - 1]; if (r) roundOf.set(t.tournamentId, r.name || ''); } catch (e) { /* skip */ }
      }
      const st = await chrome.storage.local.get(null);
      const auto = id => { const x = st['t:' + id] || {}; return x.auto || x.autoAssign; };
      const row = (t, sub) => `<div class="ev${sub ? ' sub' : ''}"><div class="top"><a href="#" data-go="${t.tournamentId}/" class="nm">${esc(t.name)}</a>${badge(t.status)}${auto(t.tournamentId) ? '<span class="b a" title="An automatic option is on - Chrome watches it in the background">Auto</span>' : ''}</div>
        ${roundOf.get(t.tournamentId) ? `<div class="s">${esc(roundOf.get(t.tournamentId))}</div>` : ''}
        <div class="lk">${[['', 'Overview'], ['matches', 'Matches'], ['players', 'Players'], ['standings', 'Standings']].map(([p, l]) => `<a href="#" data-go="${t.tournamentId}/${p}">${l}</a>`).join(' · ')}</div></div>`;
      const list = [...events.values()].filter(ev => [ev.qt, ...ev.finals.values()].some(t => t.status !== 'completed'));
      const live = ev => [ev.qt, ...ev.finals.values()].some(t => t.status === 'started');
      list.sort((a, b) => (live(b) - live(a)) || String(b.qt.startUtc || '').localeCompare(String(a.qt.startUtc || '')));
      box.innerHTML = list.length ? list.map(ev => `<div class="card">${row(ev.qt, false)}${[...ev.finals.values()].map(f => row(f, true)).join('')}</div>`).join('')
        : '<div class="s">No tournaments in progress or planned.</div>';
    } catch (e) {
      box.innerHTML = e.message === 'NO_TOKEN' ? '<div class="s">Add your API token below to see your tournaments.</div>'
        : e.message === 'BAD_TOKEN' ? '<div class="s">Matchplay rejected the API token - check it below.</div>' : `<div class="s">Couldn't load your tournaments (${esc(e.message)}).</div>`;
    }
  }
  // links: switch to the tab if that tournament page is open, else a new tab
  document.addEventListener('click', async e => {
    const a = e.target.closest('[data-go]'); if (!a) return;
    e.preventDefault();
    const url = `${APP}/tournaments/${a.dataset.go}`.replace(/\/$/, '');
    const tabs = await chrome.tabs.query({ url: `${APP}/tournaments/${a.dataset.go.split('/')[0]}*` });
    const exact = tabs.find(t => t.url.replace(/[?#].*$/, '').replace(/\/$/, '') === url) || null;
    if (exact) { await chrome.tabs.update(exact.id, { active: true }); await chrome.windows.update(exact.windowId, { focused: true }); }
    else if (tabs[0]) { await chrome.tabs.update(tabs[0].id, { active: true, url }); await chrome.windows.update(tabs[0].windowId, { focused: true }); }
    else await chrome.tabs.create({ url });
    window.close();
  });
  loadEvents();
})();
