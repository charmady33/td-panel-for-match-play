// While the extension is changing Matchplay in this tab: the screen is frozen. A copy of what was showing is laid
// over the page (in a shadow root, so the clicking scripts never see it), with an "Updating Matchplay…" card and
// Stop; clicks, scrolling and keys are blocked; the side panel stays live. Matchplay's dialogs and page changes
// happen underneath, out of sight. Other tabs of the tournament show a banner. Green banner when done, red on error.
var TDP = window.TDP || (window.TDP = {});

TDP.busy = (() => {
  const T = TDP;
  const DONE_MS = 4000;
  let snap = null, host = null;

  const panelW = () => 0;   // (no sidebar any more)
  // Matchplay's side drawers (game details…) are pinned to the right edge: keep our card clear of them
  const drawerW = () => {
    let w = 0;
    for (const el of document.querySelectorAll('.fixed, [role=dialog]')) {
      if ((el.id || '').startsWith('tdp-') || !T.visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right >= innerWidth - 2 && r.width < innerWidth * 0.7 && r.height > innerHeight * 0.5) w = Math.max(w, r.width);
    }
    return w;
  };
  const stepText = j => { if (j.sub && j.sub.text) return j.sub.text; const s = j.steps[Math.min(j.i, j.steps.length - 1)]; return s ? (s.label || s.op) : ''; };
  const countText = j => j.sub && j.sub.total > 1 ? ` (${j.sub.done} of ${j.sub.total})` : j.steps.length > 1 ? ` (step ${Math.min(j.i + 1, j.steps.length)} of ${j.steps.length})` : '';

  // the page's background colour (body, else html, else white/dark) - the cover must be solid
  const solidBg = () => {
    for (const el of [document.body, document.documentElement]) { const c = el && getComputedStyle(el).backgroundColor; if (c && !/rgba\(\s*0,\s*0,\s*0,\s*0\)|transparent/.test(c)) return c; }
    return document.documentElement.classList.contains('dark') ? '#111827' : '#ffffff';
  };
  // ---------- snapshot of the screen, taken just before a task starts ----------
  function freeze() {
    try {
      const body = document.body, clone = body.cloneNode(true);
      const pair = sel => [[...body.querySelectorAll(sel)], [...clone.querySelectorAll(sel)]];
      // live form values aren't attributes: copy them so the copy looks the same
      { const [a, b] = pair('input, select, textarea'); a.forEach((el, i) => { const c = b[i]; if (!c) return; if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); } else if (el.tagName === 'SELECT') { [...c.options].forEach((o, k) => { if (k === el.selectedIndex) o.setAttribute('selected', ''); else o.removeAttribute('selected'); }); } else c.setAttribute('value', el.value); }); }
      // videos, embeds, canvases and our own shadow-DOM boxes don't copy: grey boxes of the same size
      { const [a, b] = pair('iframe, video, canvas, [id^="tdp-"]'); a.forEach((el, i) => { const c = b[i]; if (!c || !c.parentNode) return; const r = el.getBoundingClientRect(), f = getComputedStyle(el).position === 'fixed'; const ph = document.createElement('div'); ph.style.cssText = f ? 'display:none' : `width:${r.width}px;height:${r.height}px;max-width:100%;background:${/^tdp-/.test(el.id) ? 'transparent' : '#e5e7eb'};border-radius:6px`;
        if (!f && /^tdp-/.test(el.id) && el.shadowRoot) { ph.style.background = 'none'; ph.style.height = ''; ph.attachShadow({ mode: 'open' }).innerHTML = el.shadowRoot.innerHTML; }   // our own boxes: copy them too
        c.replaceWith(ph); }); }
      clone.querySelectorAll('script, noscript').forEach(e => e.remove());
      const cs = getComputedStyle(body), r = body.getBoundingClientRect();
      snap = { node: clone, htmlClass: document.documentElement.className, bodyClass: body.className, bg: solidBg(), font: cs.font, color: cs.color, left: r.left, width: r.width, x: scrollX, y: scrollY, mainY: (document.querySelector('main') || {}).scrollTop || 0, path: location.pathname };
    } catch (e) { snap = null; }
  }

  // ---------- the cover ----------
  const CARD_CSS = `.tdpc-dim{position:fixed;inset:0}.tdpc-card{position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);width:340px;max-width:90vw;background:#fff;color:#111827;border-radius:10px;box-shadow:0 20px 45px rgba(0,0,0,.22);padding:16px 18px;font:14px/1.4 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
.dark .tdpc-card{background:#1f2937;color:#f3f4f6}.tdpc-t{font-weight:600;font-size:15px;display:flex;gap:8px;align-items:center}.tdpc-s{font-size:12px;color:#6b7280;margin-top:3px}.dark .tdpc-s{color:#9ca3af}
.tdpc-pb{height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin:12px 0 10px}.tdpc-pb i{display:block;height:100%;background:#4f46e5;transition:width .3s}
.tdpc-row{display:flex;align-items:center;gap:8px}.tdpc-f{flex:1;font-size:12px;color:#6b7280}
.tdpc-b{font:500 13px ui-sans-serif,system-ui,sans-serif;border:1px solid #c7d2fe;background:#fff;color:#4338ca;border-radius:6px;padding:5px 12px;cursor:pointer}.tdpc-b:hover{background:#eef2ff}
.tdpc-sp{width:16px;height:16px;border:2px solid #4f46e5;border-right-color:transparent;border-radius:50%;animation:sp .8s linear infinite;flex:none}@keyframes sp{to{transform:rotate(360deg)}}`;

  function showCover(j) {
    document.getElementById('tdp-cover-early')?.remove();
    const dark = document.documentElement.classList.contains('dark');
    if (!host) {
      host = document.createElement('div'); host.id = 'tdp-cover';
      const root = host.attachShadow({ mode: 'open' });
      // Matchplay's own stylesheets, so the copied screen looks the same
      document.querySelectorAll('link[rel="stylesheet"], style').forEach(s => { if (!s.closest('[id^="tdp-"]')) root.appendChild(s.cloneNode(true)); });
      const st = document.createElement('style'); st.textContent = CARD_CSS; root.appendChild(st);
      const pg = document.createElement('div'); pg.className = 'pg'; root.appendChild(pg);
      const ui = document.createElement('div'); ui.className = 'ui'; root.appendChild(ui);
      root.addEventListener('click', onClick);
      host.addEventListener('wheel', e => e.preventDefault(), { passive: false });
      host.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
      document.documentElement.appendChild(host);
    }
    host.style.cssText = `position:fixed;top:0;left:0;bottom:0;right:${panelW()}px;z-index:2147483000;overflow:hidden;background:${snap ? snap.bg : solidBg()};cursor:progress`;
    const root = host.shadowRoot, pg = root.querySelector('.pg');
    if (snap && !pg.firstChild) {
      const wrap = document.createElement('div');
      wrap.className = snap.htmlClass;
      const b = document.createElement('div');
      b.className = snap.bodyClass;
      b.style.cssText = `position:absolute;left:${snap.left - snap.x}px;top:${-snap.y}px;width:${snap.width}px;min-height:100vh;background:${snap.bg};font:${snap.font};color:${snap.color}`;
      [...snap.node.childNodes].forEach(n => b.appendChild(n));   // moved, not copied, so our boxes' contents stay
      wrap.appendChild(b); pg.appendChild(wrap);
      // Matchplay scrolls its content area (main), not the window: show the copy where you were
      const cm = b.querySelector('main'), y = snap.mainY;
      if (cm && y) { cm.scrollTop = y; setTimeout(() => { cm.scrollTop = y; }, 0); }
    }
    if (!j) { host.style.cursor = 'default'; return; }   // still copy only
    const pct = Math.max(4, Math.round(T.jobs.fraction(j) * 100));
    const html = `<div class="${dark ? 'dark' : ''}"><div class="tdpc-dim" style="background:${dark ? 'rgba(17,24,39,.35)' : 'rgba(255,255,255,.35)'}"></div><div class="tdpc-card">
      <div class="tdpc-t"><span class="tdpc-sp"></span>Updating Matchplay…</div>
      <div class="tdpc-s">${T.esc(j.title)}</div><div class="tdpc-s">${T.esc(stepText(j))}</div>
      <div class="tdpc-pb"><i style="width:${pct}%"></i></div><div class="tdpc-s" style="margin:-4px 0 8px;text-align:right">${pct}%${T.esc(countText(j))}</div>
      <div class="tdpc-row"><span class="tdpc-f">Please wait - the page is locked until it's done.</span><button class="tdpc-b" data-act="stop">Stop</button></div></div></div>`;
    const ui = root.querySelector('.ui'); if (ui.dataset.h !== html) { ui.dataset.h = html; ui.innerHTML = html; }
    host.dataset.tdpLog = (j.log || []).slice(-10).join(' | ');   // (for troubleshooting)
  }
  // a still copy of the screen while Matchplay reloads its data in place (soft refresh): no card, no dimming
  let stillOn = false;
  function still(on) {
    if (on) {
      if (host) return;   // a task's cover is already up
      freeze(); stillOn = true; showCover(null);
    } else if (stillOn) { stillOn = false; hideCover(); }
  }
  function hideCover() { document.getElementById('tdp-cover-early')?.remove(); if (host) { host.remove(); host = null; } snap = null; }

  // keys don't reach Matchplay while covered (the side panel still works)
  document.addEventListener('keydown', e => {
    if (!host) return;
    if (e.composedPath().some(x => x && x.id === 'tdp-host')) return;
    e.preventDefault(); e.stopPropagation();
  }, true);

  // ---------- worker-frame mode: a small card in the corner, and only the area being changed is greyed ----------
  let card = null;
  function showCard(j) {
    if (!card) {
      card = document.createElement('div'); card.id = 'tdp-busy-card';
      const r = card.attachShadow({ mode: 'open' });
      r.innerHTML = `<style>${CARD_CSS}.tdpc-card{position:static;transform:none;width:300px;padding:12px 14px}</style><div class="w"></div>`;
      r.addEventListener('click', onClick);
      document.documentElement.appendChild(card);
    }
    const dark = document.documentElement.classList.contains('dark');
    card.style.cssText = `position:fixed;bottom:16px;right:${drawerW() + 16}px;z-index:2147482000`;
    const pct = Math.max(4, Math.round(T.jobs.fraction(j) * 100));
    const html = `<div class="${dark ? 'dark' : ''}"><div class="tdpc-card"><div class="tdpc-t"><span class="tdpc-sp"></span>Updating Matchplay…</div>
      <div class="tdpc-s">${T.esc(j.title)}</div><div class="tdpc-s">${T.esc(stepText(j))}</div>
      <div class="tdpc-pb"><i style="width:${pct}%"></i></div><div class="tdpc-s" style="margin:-4px 0 8px;text-align:right">${pct}%${T.esc(countText(j))}</div>
      <div class="tdpc-row"><span class="tdpc-f">You can keep working.</span><button class="tdpc-b" data-act="show">Show me</button><button class="tdpc-b" data-act="stop">Stop</button></div></div></div>`;
    const w = card.shadowRoot.querySelector('.w'); if (w.dataset.h !== html) { w.dataset.h = html; w.innerHTML = html; }
    card.dataset.tdpLog = (j.log || []).slice(-10).join(' | ');   // (for troubleshooting)
  }
  function hideCard() { if (card) { card.remove(); card = null; } }
  const LOCK = 'data-tdp-lock';
  function lockAreas(on) {
    document.querySelectorAll(`[${LOCK}]`).forEach(el => { if (!on) { el.style.pointerEvents = ''; el.style.opacity = ''; el.removeAttribute(LOCK); } });
    if (!on) return;
    const main = document.querySelector('main'); if (!main) return;
    const boxes = [...main.querySelectorAll('table, div.grid')].map(t => t.closest('div.shadow, div.overflow-hidden, div.rounded-lg') || t)
      .filter(el => !el.closest('[id^="tdp-"]') && !el.querySelector('[id^="tdp-"]'));
    for (const el of boxes) if (!el.hasAttribute(LOCK)) { el.setAttribute(LOCK, '1'); el.style.pointerEvents = 'none'; el.style.opacity = '.5'; }
  }

  let doneTimer = null;
  function render() {
    if (T.isFrame) return;   // the worker frame shows nothing
    const j = T.jobs.get();
    const running = j && T.jobs.active();
    const own = running && T.jobs.mine();
    if (own && j.runner !== 'frame') { stillOn = false; showCover(j); } else if (!stillOn) hideCover();
    if (own && j.runner === 'frame') { showCard(j); lockAreas(T.routeTid() && j.steps.some(s => s.tid === T.routeTid() && s.page === T.routePage())); }
    else { hideCard(); lockAreas(false); }
    // banner: other tabs while running; this tab when done or stopped with an error
    const main = document.querySelector('main');
    const fresh = j && j.done && j.doneAt && Date.now() - j.doneAt < DONE_MS;
    if (fresh) { clearTimeout(doneTimer); doneTimer = setTimeout(render, DONE_MS - (Date.now() - j.doneAt) + 50); }
    const here = j && ((T.routeTid() && j.steps.some(s => s.tid === T.routeTid())) || (j.returnTo === location.pathname && T.jobs.mine()));
    let banner = '';
    if (here && j.error) banner = `<div class="callout err gap" style="margin:8px 0;align-items:center"><span class="flex1"><b>Update stopped:</b> ${T.esc(j.title)} - ${T.esc(j.error)}<details style="margin-top:4px"><summary style="cursor:pointer">Details</summary><div style="font:11px/1.4 ui-monospace,monospace;white-space:pre-wrap;max-height:200px;overflow:auto">${T.esc((j.log || []).slice(-25).join('\n'))}</div></details></span><button class="btn sm" data-act="retry">Retry</button>${T.worker && T.worker.isOpen() ? '<button class="btn sm sec" data-act="show">Show me</button>' : ''}<button class="btn sm sec" data-act="stop">Stop</button></div>`;
    else if (here && fresh) banner = `<div class="callout ok" style="margin:8px 0"><b>Updates done ✓</b> ${T.esc(j.title)}</div>`;
    else if (here && running && !T.jobs.mine()) banner = `<div class="callout gap" style="margin:8px 0;align-items:center"><span class="flex1"><b>Updating Matchplay in another tab:</b> ${T.esc(j.title)} - ${T.esc(stepText(j))} · ${Math.round(T.jobs.fraction(j) * 100)}%. Changes will show when it's done.</span><button class="btn sm sec" data-act="stop">Stop</button></div>`;
    const top = main ? (document.getElementById('tdp-tb-reminder') || [...main.children].find(e => !/^tdp-/.test(e.id || ''))) : null;
    T.inpage.block('tdp-busy-banner', banner ? top : null, 'before', banner, onClick);
  }

  async function onClick(e) {
    const a = e.target.closest && e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'retry') await T.jobs.retry();
    if (a.dataset.act === 'show') { T.worker.show(); return; }
    if (a.dataset.act === 'stop') await T.jobs.cancel();
    render();
  }

  return { render, freeze, still };
})();
