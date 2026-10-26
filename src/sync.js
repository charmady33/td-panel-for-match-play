// Keeps Matchplay's own page up to date without reloading it.
// Matchplay loads a tournament once when you open it and never pushes changes. To make it fetch again:
//  - its own Refresh button, where the page has one (Matches, Standings)
//  - otherwise a quick in-app hop: the address switches to another route and straight back (no page load), so
//    Matchplay re-opens the tournament and fetches it - behind a still copy of the screen, so nothing flickers
// Also: when the API shows something changed (a score from a phone, a new round…), the page is updated by itself,
// unless the TD is busy with it (a dialog open, typing, clicked in the last few seconds).
var TDP = window.TDP || (window.TDP = {});

TDP.sync = (() => {
  const T = TDP;
  let hopping = false, lastInput = 0, lastAuto = 0;

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev => addEventListener(ev, e => { if (e.isTrusted) lastInput = Date.now(); }, true));

  const main = () => document.querySelector('main');
  const settled = async () => {
    // Matchplay has drawn the tab again and stopped changing it for a moment
    let last = '', same = 0;
    for (let i = 0; i < 80; i++) {
      await T.sleep(50);
      const m = main(), t = m ? T.txt(m) : '';
      if (t.length > 80 && t === last) { if (++same >= 4) return true; } else same = 0;
      last = t;
    }
    return false;
  };

  // refetch the tournament in place; resolves when Matchplay shows the new data
  async function soft() {
    if (hopping || !T.routeTid()) return;
    const rb = T.findBtn(main() || document, /^Refresh$/);
    if (rb) { T.click(rb); await settled(); return; }
    hopping = true;
    const path = location.pathname + location.search + location.hash, m = main(), y = m ? m.scrollTop : 0, sx = scrollX, sy = scrollY;
    try {
      T.busy.still(true);
      const go = u => { history.replaceState(history.state, '', u); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); };
      go('/tournaments/0');
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
      go(path);
      await settled();
      const m2 = main(); if (m2 && y) m2.scrollTop = y; if (sx || sy) scrollTo(sx, sy);
    } catch (e) { T.warn('soft refresh', e); }
    finally { hopping = false; T.busy.still(false); }
  }

  // the TD is in the middle of something on the page: don't change it under them
  function busyHere() {
    if (document.hidden || T.jobs.active()) return true;
    if (Date.now() - lastInput < 8000) return true;
    const ae = document.activeElement;
    if (ae && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return true;
    if ([...document.querySelectorAll('[role=dialog], [role=menu], [aria-modal=true]')].some(T.visible)) return true;
    if (document.querySelector('#tdp-bb-modal, #tdp-tb, #tdp-elig-dlg, #tdp-ifpa')) return true;
    return false;
  }
  async function auto() {
    if (T.isFrame || !T.routeTid() || Date.now() - lastAuto < 10000 || busyHere()) return;
    lastAuto = Date.now();
    await soft();
  }

  return { soft, auto, hopping: () => hopping };
})();
