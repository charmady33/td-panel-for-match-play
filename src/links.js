// Item 78: under Matchplay's tab bar (Overview | Players | …) a second row in Matchplay's own tab style with the events
// linked to this one: on a qualifying event its finals; on a finals event the qualifying event and the other finals.
// A click opens the same page there (same tab, in-app - no reload); if that event is open in another tab, that tab is
// shown instead; a page the other event doesn't have -> its Overview.
var TDP = window.TDP || (window.TDP = {});

TDP.links = (() => {
  const T = TDP;
  const ID = 'tdp-links';
  // Matchplay's tab classes (copied from its tab bar, so the look - incl. dark mode - is the same)
  const TAB = 'whitespace-nowrap border-b-2 border-solid px-1 pb-1 text-sm font-medium focus:outline-none inline-block';
  const OFF = 'border-transparent text-default hover:border-gray-300 dark:hover:border-gray-500 dark:focus:border-gray-500 hover:text-gray-700 dark:hover:text-gray-300 focus:border-gray-300 focus:text-gray-700';
  const ON = 'border-indigo-500 text-indigo-600 dark:text-indigo-400';

  // the event's family: [{tid, name, t}] in Matchplay's order (qualifying first)
  function family(D) {
    if (!D.qual) return [];
    const out = [{ tid: D.qual.tournamentId, name: D.qual.name || 'Qualifying', t: D.qual, qual: true }];
    for (const f of D.finals || []) out.push({ tid: f.tid, name: f.name || (f.t && f.t.name) || 'Finals', t: f.t });
    return out.length > 1 ? out : [];
  }
  function tabBar() {
    const tid = T.routeTid(); if (!tid) return null;
    const a = document.querySelector(`main nav a[href="/tournaments/${tid}/players"], main nav a[href="/tournaments/${tid}"]`);
    const nav = a && a.closest('nav');
    return nav ? { nav, wrap: nav.parentElement } : null;
  }
  function render(D) {
    const old = document.getElementById(ID);
    const fam = !T.isFrame && D && D.t && D.tid === T.routeTid() ? family(D) : [];
    const bar = fam.length ? tabBar() : null;
    if (!bar) { if (old) old.remove(); return; }
    const items = fam.filter(x => !(x.qual && x.tid === D.tid));   // a qualifying event lists only its finals
    const html = items.map(x => x.tid === D.tid
      ? `<a class="${TAB} ${ON}" aria-current="page" data-tdp-tid="${x.tid}">${T.esc(x.qual ? 'Qualifying: ' + x.name : x.name)}</a>`
      : `<a class="${TAB} ${OFF}" href="/tournaments/${x.tid}${target(x, sub())}" data-tdp-tid="${x.tid}">${T.esc(x.qual ? 'Qualifying: ' + x.name : x.name)}</a>`).join('');
    const sig = html + '|' + location.pathname;
    if (old && old.dataset.sig === sig && old.previousElementSibling === bar.wrap) return;
    const box = old || document.createElement('div');
    box.id = ID; box.dataset.tdp = 'links'; box.dataset.sig = sig;
    box.className = bar.wrap.className.replace(/\bpt-\d+\b/, 'pt-2');   // same border line and padding as Matchplay's bar
    box.innerHTML = `<nav class="${bar.nav.className}">${html}</nav>`;
    if (!old) box.addEventListener('click', onClick);
    if (box.previousElementSibling !== bar.wrap) bar.wrap.after(box);
  }
  // the page you're on, as a path after /tournaments/{id} ("" = Overview)
  function sub() {
    const m = location.pathname.match(/^\/tournaments\/\d+(\/[a-z-]+)?/);
    return (m && m[1]) || '';
  }
  // that page on the other event, if it has it; otherwise its Overview
  function target(x, s) {
    const t = x.t || {};
    if (['', '/players', '/arenas', '/matches', '/standings', '/stats', '/logs'].includes(s)) return s;
    if (s === '/banks') return t.arenaAssignment === 'manual_banks' ? s : '';
    return '';
  }
  async function onClick(e) {
    const a = e.target.closest('a[data-tdp-tid]'); if (!a || !a.getAttribute('href')) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;   // (the TD asked for a new tab)
    e.preventDefault();
    const path = a.getAttribute('href');
    // open in another tab already? show that tab there (bg.js); otherwise go in this tab
    let shown = false;
    try { if (T.hasChrome) shown = await chrome.runtime.sendMessage({ type: 'tdp-show-tournament', tid: Number(a.dataset.tdpTid), path }); } catch (err) { shown = false; }
    if (!shown) go(path);
  }
  // in-app navigation (no page load): Matchplay's router follows the address
  function go(path) {
    history.pushState(history.state, '', path);
    dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
  }
  // bg.js asks this tab to move to a page of its tournament
  if (T.hasChrome && !T.isFrame) chrome.runtime.onMessage.addListener(m => { if (m && m.type === 'tdp-go' && m.path) go(m.path); });
  return { render, family, target };
})();
