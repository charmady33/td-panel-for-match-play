// Swap Matchplay's pride-flag image (next to the "Match Play" logo, from mp-pride-flags…) for a USA flag,
// same size and spot. Runs on every Matchplay page; re-applied if Matchplay redraws the logo.
var TDP = window.TDP || (window.TDP = {});

TDP.flag = (() => {
  let stars = '';
  for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) stars += `<circle cx="${247 + c * 494 + (r % 2 ? 247 : 0)}" cy="${210 + r * 210}" r="70"/>`;
  const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7410 3900"><rect width="7410" height="3900" fill="#b22234"/><path d="M0,450H7410m0,600H0m0,600H7410m0,600H0m0,600H7410m0,600H0" stroke="#fff" stroke-width="300"/><rect width="2964" height="2100" fill="#3c3b6e"/><g fill="#fff">${stars}</g></svg>`;
  const URL = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(SVG);

  function swap() {
    for (const img of document.querySelectorAll('img')) {
      if (img.dataset.tdpFlag === '1' && img.src === URL) continue;
      if (!/pride-flags/i.test(img.currentSrc || img.src || '') && img.dataset.tdpFlag !== '1') continue;
      img.dataset.tdpFlag = '1';
      if (img.srcset) img.removeAttribute('srcset');
      img.src = URL;
      img.alt = 'USA'; img.title = 'USA';
      img.style.objectFit = 'contain';
    }
    const old = document.getElementById('tdp-flag'); if (old) old.remove();   // the v0.3 flag next to the menu button
  }
  swap();   // and again whenever the page changes (main.js page watcher)
  return { swap };
})();
