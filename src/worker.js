// The hidden worker frame: an off-screen copy of Matchplay inside the TD's own tab. Tasks run in it, so the TD's
// page doesn't flash, move or lock up. Chrome treats it as visible (it's part of the visible page), so it runs at full
// speed - unlike a background tab. "Show me" brings it on screen.
var TDP = window.TDP || (window.TDP = {});

TDP.worker = (() => {
  const T = TDP;
  let frame = null;
  const OFF = 'position:fixed;left:-12000px;top:0;width:1280px;height:900px;border:0;visibility:visible';
  function open(url) {
    if (T.isFrame) return null;
    if (!frame || !frame.isConnected) {
      frame = document.createElement('iframe');
      frame.id = 'tdp-worker'; frame.name = 'tdp-worker'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
      frame.style.cssText = OFF;
      document.documentElement.appendChild(frame);
    }
    frame.src = url;
    return frame;
  }
  const isOpen = () => !!(frame && frame.isConnected);
  function close() { if (frame) frame.remove(); frame = null; hideShow(); }
  // "Show me": the worker on screen, in a window over the page
  let shade = null;
  function show() {
    if (!isOpen()) return false;
    shade = document.createElement('div'); shade.id = 'tdp-worker-shade';
    shade.style.cssText = 'position:fixed;inset:0;background:rgba(17,24,39,.55);z-index:2147482990';
    shade.addEventListener('click', hideShow);
    document.documentElement.appendChild(shade);
    frame.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(1280px,94vw);height:86vh;border:0;border-radius:8px;box-shadow:0 20px 50px rgba(0,0,0,.4);z-index:2147482995;background:#fff';
    return true;
  }
  function hideShow() { if (shade) shade.remove(); shade = null; if (frame) frame.style.cssText = OFF; }
  return { open, close, isOpen, show, hide: hideShow };
})();
