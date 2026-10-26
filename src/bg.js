// Background service worker: owns the hidden "worker" tab that makes the Matchplay changes, so the TD's own
// tab is never clicked through. The worker tab opens next to the TD's tab inside a collapsed "TD Panel" tab group
// and closes itself when the task is done (kept open on an error so "Show me" can bring it forward).
/* global chrome */
const KEY = 'workerTab';
const getW = async () => (await chrome.storage.session.get(KEY))[KEY] || null;
const setW = async v => chrome.storage.session.set({ [KEY]: v });
const alive = async id => { if (id == null) return null; try { return await chrome.tabs.get(id); } catch (e) { return null; } };

async function openWorker(url, from) {
  const w = await getW(), tab = await alive(w && w.id);
  if (tab) { await chrome.tabs.update(tab.id, { url }); return tab.id; }
  const t = await chrome.tabs.create({ url, active: false, windowId: from && from.windowId, index: from ? from.index + 1 : undefined });
  await setW({ id: t.id, at: Date.now() });
  try {
    const gid = await chrome.tabs.group({ tabIds: [t.id], createProperties: from ? { windowId: from.windowId } : undefined });
    await chrome.tabGroups.update(gid, { title: 'TD Panel', color: 'purple', collapsed: true });
  } catch (e) { /* tab groups not available: the tab just sits in the background */ }
  return t.id;
}
async function closeWorker() {
  const w = await getW(); await setW(null);
  if (w && await alive(w.id)) { try { await chrome.tabs.remove(w.id); } catch (e) { /* already gone */ } }
}
async function showWorker() {
  const w = await getW(), tab = await alive(w && w.id); if (!tab) return false;
  try { await chrome.tabs.ungroup(tab.id); } catch (e) { /* not grouped */ }
  await chrome.tabs.update(tab.id, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
  return true;
}

chrome.runtime.onMessage.addListener((m, sender, reply) => {
  (async () => {
    const w = await getW();
    switch (m && m.t) {
      case 'whoami': return { worker: !!(w && sender.tab && sender.tab.id === w.id) };
      case 'openWorker': return { id: await openWorker(m.url, sender.tab) };
      case 'ensureWorker': {   // retry: wake the worker if it's still there, otherwise open a new one
        const tab = await alive(w && w.id);
        if (tab) { try { await chrome.tabs.sendMessage(tab.id, { t: 'resume' }); return { id: tab.id }; } catch (e) { /* page reloading */ } }
        return { id: await openWorker(m.url, sender.tab) };
      }
      case 'closeWorker': await closeWorker(); return { ok: true };
      case 'showWorker': return { ok: await showWorker() };
      case 'hasWorker': return { open: !!(await alive(w && w.id)) };
      default: return { error: 'unknown' };
    }
  })().then(reply, e => reply({ error: String(e && e.message || e) }));
  return true;   // answer asynchronously
});

// the TD closed the worker tab by hand: forget it
chrome.tabs.onRemoved.addListener(async id => { const w = await getW(); if (w && w.id === id) await setW(null); });
