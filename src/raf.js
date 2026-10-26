// Runs in the page's own JavaScript world, before Matchplay loads. Chrome pauses requestAnimationFrame in tabs
// you aren't looking at, and Matchplay's dialogs wait on it to open and close - which would stall the hidden
// worker tab. While the tab is hidden, animation frames are run on a short timer instead. Visible tabs are untouched.
(() => {
  const raf = window.requestAnimationFrame.bind(window), caf = window.cancelAnimationFrame.bind(window);
  const timers = new Map(); let next = -1;
  window.requestAnimationFrame = cb => {
    if (!document.hidden) return raf(cb);
    const id = next--; timers.set(id, setTimeout(() => { timers.delete(id); cb(performance.now()); }, 16));
    return id;
  };
  window.cancelAnimationFrame = id => { if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); } else caf(id); };
})();
