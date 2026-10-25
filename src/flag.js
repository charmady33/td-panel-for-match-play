// USA flag in Matchplay's top-left corner (next to the logo on wide screens, next to the menu button on narrow ones).
// Shows on every Matchplay page, signed in or not.
var TDP = window.TDP || (window.TDP = {});

TDP.flag = (() => {
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7410 3900" width="30" height="16" role="img" aria-label="United States flag" style="display:block;border-radius:2px;box-shadow:0 0 0 1px rgba(0,0,0,.15)">
<rect width="7410" height="3900" fill="#b22234"/><path d="M0,450H7410m0,600H0m0,600H7410m0,600H0m0,600H7410m0,600H0" stroke="#fff" stroke-width="300"/>
<rect width="2964" height="2100" fill="#3c3b6e"/><g fill="#fff">${(() => { let s = ''; for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) s += `<circle cx="${247 + c * 494 + (r % 2 ? 247 : 0)}" cy="${210 + r * 210}" r="70"/>`; return s; })()}</g></svg>`;

  function place() {
    let el = document.getElementById('tdp-flag');
    const vis = e => e && e.getClientRects().length && e.getBoundingClientRect().width > 0;
    // wide screens: Matchplay's logo link in the left nav; narrow: the menu (hamburger) button in the top bar
    const logo = [...document.querySelectorAll('a[href="/"]')].find(a => vis(a) && a.getBoundingClientRect().top < 90 && a.getBoundingClientRect().left < 320 && !a.closest('#tdp-host'));
    const burger = [...document.querySelectorAll('div.h-16 > button, header button')].find(b => vis(b) && b.getBoundingClientRect().top < 70);
    const anchor = logo || burger;
    if (!anchor) return;
    if (!el) {
      el = document.createElement('span'); el.id = 'tdp-flag'; el.title = 'USA';
      el.style.cssText = 'display:inline-flex;align-items:center;align-self:center;margin:0 10px;flex:none';
      el.innerHTML = SVG;
    }
    if (anchor.nextElementSibling !== el) anchor.insertAdjacentElement('afterend', el);
  }
  setInterval(place, 1000);
  place();
  return { place };
})();
