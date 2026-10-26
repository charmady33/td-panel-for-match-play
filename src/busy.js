// While the worker tab is changing Matchplay: a banner at the top of the tournament's pages, a progress card in
// the corner, and the part of the page being changed greyed out and locked. Green "done" for a few seconds after,
// then the page reloads its data if it shows what was changed. Red with Retry / Show me / Stop on an error.
var TDP = window.TDP || (window.TDP = {});

TDP.busy = (() => {
  const T = TDP;
  const DONE_MS = 4000;
  const LOCK = 'data-tdp-lock';
  // which part of which page each kind of step changes
  const AREA = {
    createBanks: 'banks', bankArenas: 'banks', labels: 'players', addPlayers: 'players', deactivate: 'players', activate: 'players',
    seeds: 'players', readRanks: 'players', assignBanks: 'matches', closeRound: 'matches', startNextRound: 'matches', resolveTie: 'resolve-ties',
  };
  const tidsOf = j => new Set(j.steps.map(s => s.tid));
  const pagesOf = j => new Set(j.steps.map(s => s.page));
  const stepText = j => { const s = j.steps[Math.min(j.i, j.steps.length - 1)]; return s ? (s.label || s.op) : ''; };

  const spinner = '<span style="display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:tdpspin .8s linear infinite;vertical-align:-2px"></span><style>@keyframes tdpspin{to{transform:rotate(360deg)}}</style>';

  function lockAreas(on) {
    document.querySelectorAll(`[${LOCK}]`).forEach(el => { if (!on) { el.style.pointerEvents = ''; el.style.opacity = ''; el.style.filter = ''; el.removeAttribute(LOCK); } });
    if (!on) return;
    const main = document.querySelector('main'); if (!main) return;
    const page = T.routePage();
    let targets = [];
    if (page === 'banks') targets = [...main.querySelectorAll('div.grid')];
    else if (page === 'players') targets = [...main.querySelectorAll('table')].map(t => t.closest('div.shadow, div.overflow-hidden') || t);
    else targets = [...main.children].filter(e => !/^tdp-/.test(e.id || ''));
    for (const el of targets) { if (el.id && /^tdp-/.test(el.id)) continue; el.setAttribute(LOCK, '1'); el.style.pointerEvents = 'none'; el.style.opacity = '.45'; el.style.filter = 'grayscale(.4)'; }
  }

  function render() {
    const j = T.jobs.get(), main = document.querySelector('main');
    const fresh = j && j.done && j.doneAt && Date.now() - j.doneAt < DONE_MS;
    const show = j && (T.jobs.active() || j.error || fresh);
    const here = show && T.routeTid() && tidsOf(j).has(T.routeTid());
    // locked area: only while running, only on a page this task changes
    lockAreas(!!(j && T.jobs.active() && here && pagesOf(j).has(T.routePage()) && AREA[j.steps[Math.min(j.i, j.steps.length - 1)].op]));
    // banner
    let banner = '';
    if (here) {
      const n = j.steps.length, at = Math.min(j.i + 1, n);
      if (j.error) banner = `<div class="callout err gap" style="margin:8px 0;align-items:center"><span class="flex1"><b>Update stopped:</b> ${T.esc(j.title)} - ${T.esc(j.error)}</span><button class="btn sm" data-act="retry">Retry</button><button class="btn sm sec" data-act="show">Show me</button><button class="btn sm sec" data-act="stop">Stop</button></div>`;
      else if (fresh) banner = `<div class="callout ok" style="margin:8px 0"><b>Updates done ✓</b> ${T.esc(j.title)}</div>`;
      else banner = `<div class="callout gap" style="margin:8px 0;align-items:center;background:#eff6ff;color:#1e40af;border-color:#bfdbfe">${spinner}<span class="flex1"><b>Updating Matchplay in the background:</b> ${T.esc(j.title)} - ${T.esc(stepText(j))}${n > 1 ? ` (${at} of ${n})` : ''}. Changes will show when it's done.</span></div>`;
    }
    // above the tiebreak reminder when there is one, else above Matchplay's first block (stable order, no jumping)
    const top = main ? (document.getElementById('tdp-tb-reminder') || [...main.children].find(e => !/^tdp-/.test(e.id || ''))) : null;
    T.inpage.block('tdp-busy-banner', banner ? top : null, 'before', banner, onClick);
    // corner card (any Matchplay page)
    let card = document.getElementById('tdp-busy-card');
    if (!show || fresh || j.error) { if (card) card.remove(); }
    else {
      if (!card) {
        card = document.createElement('div'); card.id = 'tdp-busy-card';
        const r = card.attachShadow({ mode: 'open' });
        r.innerHTML = `<style>${T.panel.CSS}:host{all:initial}.wrap{position:static}.c{width:300px;background:var(--card);border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,.18);padding:12px 14px;font:14px ui-sans-serif,system-ui,sans-serif;color:var(--text)}.pb{height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin:8px 0}.pb i{display:block;height:100%;background:#4f46e5;transition:width .3s}</style><div class="wrap"><div class="c"></div></div>`;
        r.addEventListener('click', onClick);
        document.documentElement.appendChild(card);
      }
      const cls = document.documentElement.classList, right = cls.contains('tdp-side') ? 396 : cls.contains('tdp-rail') ? 64 : 16;
      card.style.cssText = `position:fixed;bottom:16px;right:${right}px;z-index:2147482000`;
      const n = j.steps.length, pct = Math.round((Math.min(j.i, n) / n) * 100);
      const html = `<div class="gap" style="align-items:center">${spinner}<b class="flex1">Updating Matchplay…</b></div>
        <div class="small" style="margin-top:4px">${T.esc(j.title)}</div><div class="small">${T.esc(stepText(j))}${n > 1 ? ` (${Math.min(j.i + 1, n)} of ${n})` : ''}</div>
        <div class="pb"><i style="width:${Math.max(6, pct)}%"></i></div>
        <div class="gap" style="align-items:center"><span class="small flex1">Working in a hidden tab</span><button class="btn sm sec" data-act="show">Show me</button><button class="btn sm sec" data-act="stop">Stop</button></div>`;
      const c = card.shadowRoot.querySelector('.c'); if (c.dataset.h !== html) { c.dataset.h = html; c.innerHTML = html; }
      card.shadowRoot.querySelector('.wrap').classList.toggle('dark', document.documentElement.classList.contains('dark'));
    }
    // finished: reload this page once if it shows what was changed
    if (fresh && here && pagesOf(j).has(T.routePage())) {
      const k = 'tdp-reloaded-' + j.startedAt;
      try { if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, '1'); setTimeout(() => location.reload(), 1500); } } catch (e) { /* storage blocked: skip */ }
    }
  }

  async function onClick(e) {
    const a = e.target.closest && e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'retry') await T.jobs.retry();
    if (a.dataset.act === 'show') await T.jobs.showWorker();
    if (a.dataset.act === 'stop') await T.jobs.cancel();
    render();
  }

  // inside the worker tab itself
  function workerNote() {
    const n = document.createElement('div');
    n.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483000;background:#4f46e5;color:#fff;font:600 13px ui-sans-serif,system-ui,sans-serif;padding:6px 12px;text-align:center;pointer-events:none';
    n.textContent = 'TD Panel is updating Matchplay in this tab. It closes by itself when done - please leave it alone.';
    const add = () => { if (!n.isConnected && document.body) document.body.appendChild(n); };
    add(); setInterval(add, 1000);
  }

  setInterval(() => { if (!T.jobs.isWorker()) render(); }, 1000);
  return { render, workerNote };
})();
