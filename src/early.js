// Runs before the page draws. If this tab is in the middle of a task (it reloaded to another page), cover the page
// straight away so it never flashes; busy.js replaces this with the full "Updating Matchplay…" screen.
/* global chrome */
(async () => {
  try {
    if (window.top !== window) return;   // the hidden worker frame never shows a cover
    const me = sessionStorage.getItem('tdp-tab');
    const j = (await chrome.storage.local.get('job')).job;
    if (!me || !j || j.done || j.error || j.owner !== me || j.runner === 'frame') return;   // worker-frame tasks don't cover the page
    const d = document.createElement('div');
    d.id = 'tdp-cover-early';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#f3f4f6;cursor:progress';
    document.documentElement.appendChild(d);
  } catch (e) { /* nothing to cover */ }
})();
