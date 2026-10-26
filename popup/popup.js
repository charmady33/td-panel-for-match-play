/* global chrome */
// Toolbar button: the API token, and clearing what the extension saved for the open tournament.
(async () => {
  const $ = id => document.getElementById(id);
  $('ver').textContent = 'Version ' + chrome.runtime.getManifest().version;
  const { settings = {} } = await chrome.storage.local.get('settings');
  $('tok').value = settings.token || '';
  $('save').addEventListener('click', async () => {
    const cur = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: { ...cur, token: $('tok').value.trim() } });
    $('msg').textContent = 'Saved. Open tournament pages update straight away.';
  });
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
})();
