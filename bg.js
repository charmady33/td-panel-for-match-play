/* global chrome */
// Background watcher: runs while Chrome is open, even with no Matchplay tab.
// About once a minute: your in-progress tournaments (official API, your own token). For one with an automatic
// option on (Auto close/start, Assign banks · Automatic) that needs something done and
// has no tab open, the tournament opens in its own minimized window; the extension there does the work (slowly,
// Chrome slows hidden windows) and the window closes when it's done. A Chrome notification says what happened.
// Also keeps the toolbar badge = number of your tournaments in progress.

const API = 'https://api.matchplay.events/api';
// where new versions are published (GitHub Releases): the toolbar button and tournament pages say when one is out
const REPO = 'charmady33/td-panel-for-match-play';
const APP = 'https://app.matchplay.events';
const store = {
  get: async (k, d = null) => { const o = await chrome.storage.local.get(k); return o[k] === undefined ? d : o[k]; },
  set: (k, v) => chrome.storage.local.set({ [k]: v }),
};
async function api(path) {
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (!settings.token) throw new Error('NO_TOKEN');
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + settings.token, Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return j;
}
const rows = j => Array.isArray(j) ? j : (j && Array.isArray(j.data) ? j.data : []);
const one = j => (j && j.data && !Array.isArray(j.data) ? j.data : j);
async function me() {
  const c = await store.get('bg:me');
  if (c && Date.now() - c.at < 6 * 3600e3) return c.u;
  const u = one(await api('/users/profile'));
  await store.set('bg:me', { at: Date.now(), u });
  return u;
}

function setup() { chrome.alarms.create('watch', { periodInMinutes: 1 }); }
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.alarms.onAlarm.addListener(a => { if (a.name === 'watch') tick().catch(e => console.warn('[TD Panel bg]', e)); });

const tabsOf = async tid => (await chrome.tabs.query({ url: `${APP}/tournaments/${tid}*` }));

// ---------- new version on GitHub? (at most every 6 hours) ----------
const newer = (a, b) => { const x = String(a).replace(/^v/, '').split('.').map(Number), y = String(b).replace(/^v/, '').split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
async function checkUpdate(force) {
  const last = await store.get('bg:updateAt', 0);
  if (!force && Date.now() - last < 6 * 3600e3) return;
  await store.set('bg:updateAt', Date.now());
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!r.ok) return;
    const j = await r.json(), mine = chrome.runtime.getManifest().version;
    const zip = (j.assets || []).find(a => /\.zip$/i.test(a.name));
    await store.set('update', newer(j.tag_name, mine) ? { version: String(j.tag_name).replace(/^v/, ''), page: j.html_url, zip: zip ? zip.browser_download_url : j.html_url, notes: String(j.body || '').slice(0, 600) } : null);
  } catch (e) { /* offline: try again later */ }
}
chrome.runtime.onMessage.addListener(m => { if (m && m.type === 'tdp-check-update') checkUpdate(true); if (m && m.type === 'tdp-onoff') tick().catch(() => {}); });

async function tick() {
  const { settings: sx = {} } = await chrome.storage.local.get('settings');
  if (sx.off) { chrome.action.setBadgeText({ text: 'OFF' }); chrome.action.setBadgeBackgroundColor({ color: '#6b7280' }); return; }   // switched off: watch nothing
  checkUpdate(false);
  let u; try { u = await me(); } catch (e) { chrome.action.setBadgeText({ text: '' }); return; }
  const started = rows(await api(`/tournaments?owner=${u.userId}&status=started&limit=50`));
  chrome.action.setBadgeText({ text: started.length ? String(started.length) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#4f46e5' });
  const runs = await store.get('bg:runs', {});
  for (const t of started) {
    const tid = t.tournamentId, st = await store.get('t:' + tid, {});
    if (!(st.auto || st.autoAssign)) continue;
    const run = runs[tid];
    if (run && run.windowId) {   // already working on it: give up waiting after 20 min and tell the TD
      const alive = await chrome.windows.get(run.windowId).then(() => true, () => false);
      if (alive && Date.now() - run.at > 20 * 60e3 && !run.warned) { run.warned = true; await store.set('bg:runs', runs); note(tid, `${t.name}: the background update is taking a long time - open its window to check.`, run.windowId); }
      if (alive) continue;
      delete runs[tid]; await store.set('bg:runs', runs);
    }
    if ((await tabsOf(tid)).length) continue;   // a tab of it is open: that tab does the work
    const need = await needs(tid, st);
    if (!need) continue;
    // the same need isn't handled twice in 10 minutes (e.g. auto close waiting on a tie)
    if (run && run.sig === need.sig && Date.now() - run.at < 10 * 60e3) continue;
    const w = await chrome.windows.create({ url: `${APP}/tournaments/${tid}/matches#tdp-bg`, state: 'minimized', focused: false });
    runs[tid] = { windowId: w.id, at: Date.now(), sig: need.sig, what: need.what, name: t.name };
    await store.set('bg:runs', runs);
  }
}

// does this tournament need the automatic options right now?
async function needs(tid, st) {
  const rounds = rows(await api(`/tournaments/${tid}/rounds`)).sort((a, b) => (a.index ?? a.roundId) - (b.index ?? b.roundId));
  const r = rounds[rounds.length - 1]; if (!r || String(r.status) === 'completed') return null;
  const games = rows(await api(`/tournaments/${tid}/games?round=${r.roundId}`)).filter(g => !g.bye);
  if (!games.length) return null;
  const noBank = games.some(g => g.set !== 9999 && g.arenaId == null && g.bankId == null);
  if (st.autoAssign && !st.smartArenas && noBank && st.assignDoneRound !== r.roundId && st.banksDoneRound !== r.roundId)
    return { sig: `banks:${r.roundId}`, what: `${r.name || 'A new round'} needs banks` };
  if (st.auto && games.every(g => String(g.status) === 'completed'))
    return { sig: `close:${r.roundId}`, what: `${r.name || 'The round'} is done` };
  return null;
}

function note(tid, message, windowId) {
  chrome.notifications.create('tdp:' + tid + ':' + Date.now(), { type: 'basic', iconUrl: 'icons/icon128.png', title: 'TD Panel for Match Play', message, priority: 1 });
  if (windowId) noteWin[tid] = windowId;
}
const noteWin = {};
chrome.notifications.onClicked.addListener(id => {
  const tid = id.split(':')[1], w = noteWin[tid];
  if (w) chrome.windows.update(w, { focused: true, state: 'normal' }).catch(() => {});
  else chrome.tabs.create({ url: `${APP}/tournaments/${tid}/matches` });
});

// the minimized window reports back when it's finished
chrome.runtime.onMessage.addListener((m, sender) => {
  if (!m || m.type !== 'tdp-bg-done') return;
  (async () => {
    const runs = await store.get('bg:runs', {}), run = runs[m.tid];
    const name = (run && run.name) || ('Tournament ' + m.tid);
    if (m.ok) {
      if (!/^nothing/.test(m.text || '')) note(m.tid, `${name}: ${m.text || 'automatic update done.'}`);
      if (sender.tab) chrome.windows.remove(sender.tab.windowId).catch(() => {});
      if (run) { run.windowId = null; run.at = Date.now(); await store.set('bg:runs', runs); }
    } else {
      // leave the window (with the error and Retry) for the TD
      note(m.tid, `${name}: ${m.text || 'the automatic update stopped'} - click to open it.`, sender.tab && sender.tab.windowId);
      if (run) { run.at = Date.now(); await store.set('bg:runs', runs); }
    }
  })();
});

// a fresh install / update: start watching straight away
setup(); tick().catch(() => {});
