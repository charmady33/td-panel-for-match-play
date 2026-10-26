// Shared look (CSS tokens copied from Matchplay's Tailwind UI) plus the few things that aren't part of a Matchplay page:
//  - a status chip in the tournament header (active games, pending approvals, current round)
//  - small toasts at the bottom (messages, and the auto-round countdown with Cancel)
//  - a first-run prompt for the API token on tournaments you run (the token is also set from the toolbar button)
// There is no sidebar any more: every tool lives inside Matchplay's own pages.
var TDP = window.TDP || (window.TDP = {});

TDP.panel = (() => {
  const T = TDP, F = () => T.finals, D = () => T.data.D;
  let host = null, root = null;
  const CUTCOL = { green: ['#d1fae5', '#065f46', '#10b981'], fuchsia: ['#fae8ff', '#86198f', '#d946ef'], blue: ['#dbeafe', '#1e40af', '#3b82f6'], sky: ['#e0f2fe', '#075985', '#0ea5e9'], orange: ['#ffedd5', '#9a3412', '#f97316'], rose: ['#ffe4e6', '#9f1239', '#f43f5e'], red: ['#fee2e2', '#991b1b', '#ef4444'], yellow: ['#fef9c3', '#854d0e', '#eab308'], amber: ['#fef3c7', '#92400e', '#f59e0b'], violet: ['#ede9fe', '#5b21b6', '#8b5cf6'], purple: ['#f3e8ff', '#6b21a8', '#a855f7'], indigo: ['#e0e7ff', '#3730a3', '#6366f1'], gray: ['#f3f4f6', '#374151', '#9ca3af'], teal: ['#ccfbf1', '#115e59', '#14b8a6'], pink: ['#fce7f3', '#9d174d', '#ec4899'] };
  const cc = c => CUTCOL[c] || CUTCOL.indigo;

  const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.wrap{--bg:#f3f4f6;--card:#fff;--text:#111827;--muted:#4b5563;--soft:#6b7280;--line:#e5e7eb;--head:#f9fafb;--pri:#4f46e5;--pri2:#4338ca;--pril:#6366f1;--prib:#a5b4fc;
  font-family:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Segoe UI Emoji";font-size:14px;line-height:1.4;color:var(--text);
  position:fixed;right:0;top:0;bottom:0;width:380px;z-index:35;}   /* full-height right sidebar, under Matchplay's dialogs (z-40) */
.wrap.railed{width:48px}
.wrap.dark{--bg:#111827;--card:#1f2937;--text:#f3f4f6;--muted:#d1d5db;--soft:#9ca3af;--line:#374151;--head:#111827;--pri:#6366f1;--pri2:#a5b4fc;--pril:#818cf8;--prib:#4f46e5}
.panel{position:relative;width:100%;height:100%;background:var(--bg);display:flex;flex-direction:column;overflow:hidden;border-left:1px solid var(--line);box-shadow:-1px 0 3px rgba(0,0,0,.05)}
.top{background:var(--card);border-bottom:1px solid var(--line);padding:10px 12px 0}
.row{display:flex;align-items:center;gap:8px}
.title{font-size:15px;font-weight:600;color:var(--text);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.strip{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 8px}
.tabs{display:flex;gap:16px;overflow-x:auto;scrollbar-width:none}
.tab{background:none;border:0;border-bottom:2px solid transparent;padding:0 2px 6px;font:inherit;font-size:14px;font-weight:500;color:var(--muted);cursor:pointer;white-space:nowrap}
.tab.on{color:var(--pri);border-bottom-color:var(--pril)}
.body{flex:1;overflow:auto;padding:12px}
.card{background:var(--card);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.1),0 1px 2px -1px rgba(0,0,0,.1);margin-bottom:12px;overflow:hidden}
.ch{padding:10px 12px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:8px;font-weight:500}
.ch .h{flex:1;min-width:0}
.cb{padding:10px 12px}
.lab{font-size:14px;font-weight:500;color:var(--muted)}
.small{font-size:12px;color:var(--soft)}
.btn{font:inherit;font-size:14px;font-weight:500;border-radius:6px;padding:7px 14px;cursor:pointer;border:1px solid transparent;background:var(--pri);color:#fff;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.btn:hover{filter:brightness(.95)}
.btn.sec{background:var(--card);color:var(--pri2);border-color:var(--prib)}
.btn.sm{font-size:12px;padding:3px 9px}
.btn.green{background:#059669}
.btn.red{background:#e11d48}
.btn[disabled]{opacity:.5;cursor:not-allowed}
a.btn{text-decoration:none}
.link{background:none;border:0;padding:0;font:inherit;font-weight:500;color:var(--pril);cursor:pointer;text-decoration:none}
.link:hover{text-decoration:underline}
.icon{background:none;border:0;cursor:pointer;color:var(--soft);font-size:16px;padding:2px 4px;border-radius:4px}
.icon:hover{background:var(--head);color:var(--text)}
.badge{display:inline-flex;align-items:center;gap:4px;border-radius:9999px;padding:2px 10px;font-size:12px;font-weight:500;white-space:nowrap}
.b-green{background:#d1fae5;color:#065f46}.b-indigo{background:#e0e7ff;color:#3730a3}.b-blue{background:#dbeafe;color:#1e40af}
.b-gray{background:#f3f4f6;color:#374151}.b-amber{background:#fef3c7;color:#92400e}.b-rose{background:#ffe4e6;color:#9f1239}.b-pink{background:#fce7f3;color:#9d174d}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.04em;color:var(--soft);background:var(--head);padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:6px 8px;border-bottom:1px solid var(--line);vertical-align:middle}
tr:last-child td{border-bottom:0}
.num{text-align:right;font-variant-numeric:tabular-nums}
.callout{border-left:4px solid #60a5fa;background:#eff6ff;color:#1e3a8a;padding:8px 10px;border-radius:4px;font-size:13px;margin-bottom:12px}
.callout.warn{border-color:#f59e0b;background:#fffbeb;color:#78350f}
.callout.err{border-color:#f43f5e;background:#fff1f2;color:#881337}
.callout.ok{border-color:#10b981;background:#ecfdf5;color:#064e3b}
.dark .callout{filter:brightness(.9)}
.bar{height:6px;background:var(--line);border-radius:9999px;overflow:hidden}.bar>i{display:block;height:100%;background:#34d399}
input[type=text],input[type=number],input[type=password],select{font:inherit;font-size:14px;color:var(--text);background:var(--card);border:1px solid #d1d5db;border-radius:6px;padding:6px 8px;width:100%}
input:focus,select:focus{outline:2px solid var(--pril);outline-offset:-1px}
input[type=checkbox]{width:16px;height:16px;accent-color:var(--pri);vertical-align:middle}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.mt{margin-top:8px}.mb{margin-bottom:8px}.gap{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.tie{border-radius:6px;padding:8px 10px;margin-bottom:8px;font-size:13px}
.era{font-size:11px;font-weight:600;border-radius:4px;padding:1px 5px}
.era-EM{background:#fef3c7;color:#92400e}.era-SS{background:#dbeafe;color:#1e40af}.era-DMD{background:#ede9fe;color:#5b21b6}.era-LCD{background:#dcfce7;color:#166534}.era-Unknown{background:#f3f4f6;color:#374151}
.rail{height:100%;width:48px;background:var(--card);border-left:1px solid var(--line);display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:14px}
.pill{background:var(--pri);color:#fff;border:0;border-radius:9999px;width:36px;height:36px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 6px rgba(79,70,229,.35)}
.rail .n{border-radius:9999px;padding:1px 7px;font-size:12px;font-weight:600;min-width:24px;text-align:center;background:#d1fae5;color:#065f46}
.rail .n.amber{background:#fef3c7;color:#92400e}
.toast{position:absolute;left:12px;right:12px;bottom:12px;background:#111827;color:#fff;border-radius:8px;padding:12px 14px;box-shadow:0 10px 25px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center;z-index:2}
.job{border-top:1px solid var(--line);background:var(--card);padding:8px 12px;font-size:13px;max-height:140px;overflow:auto}
.muted{color:var(--soft)}
.flex1{flex:1;min-width:0}
.ell{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
`;

  // ---------- mount: the toast layer ----------
  function mount() {
    if (host) return;
    host = document.createElement('div');
    host.id = 'tdp-host';
    host.style.cssText = 'position:fixed;left:0;right:0;bottom:16px;z-index:2147482500;pointer-events:none;display:flex;justify-content:center';
    document.documentElement.appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${CSS}.wrap{position:static;width:auto;display:flex;flex-direction:column;gap:8px;align-items:center}
.toast{pointer-events:auto;background:#111827;color:#fff;border-radius:8px;padding:10px 14px;box-shadow:0 10px 25px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center;max-width:min(560px,calc(100vw - 32px));font-size:14px}
.toast.err{background:#9f1239}.toast.ok{background:#065f46}.toast .x{background:none;border:0;color:inherit;opacity:.7;cursor:pointer;font-size:16px}</style><div class="wrap"></div>`;
    root.addEventListener('click', onClick);
    root.addEventListener('keydown', e => e.stopPropagation(), true);   // don't trigger Matchplay shortcuts
  }
  function unmount() { if (host) { host.remove(); host = root = null; } chip(null); tokenPrompt(false); }
  const isDark = () => document.documentElement.classList.contains('dark') || document.body.classList.contains('dark');

  // ---------- header chip ----------
  // next to the tournament's format line under its name ("Group match play ?")
  function chip(D) {
    let el = document.getElementById('tdp-chip');
    const h1 = D && D.t ? document.querySelector('main h1') : null, line = h1 && h1.nextElementSibling;
    if (!line || !D.isTD || D.t.status !== 'started') { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('span'); el.id = 'tdp-chip'; el.dataset.tdp = 'chip'; el.attachShadow({ mode: 'open' }); }
    if (el.parentElement !== line) line.appendChild(el);
    const c = T.data.counts(), r = c.round;
    const b = (bg, fg, t, title) => `<span title="${T.esc(title)}" style="display:inline-flex;align-items:center;border-radius:9999px;padding:1px 8px;margin-left:6px;font:500 12px ui-sans-serif,system-ui,sans-serif;background:${bg};color:${fg};white-space:nowrap">${t}</span>`;
    const html = (r ? b('#e0e7ff', '#3730a3', T.esc(r.name || 'Round'), `${c.done} of ${c.total} games done`) : '')
      + b('#d1fae5', '#065f46', `● ${c.active} active`, 'Games still being played')
      + (c.pending ? b('#fef3c7', '#92400e', `${c.pending} pending approval${c.pending === 1 ? '' : 's'}`, 'Every score entered, waiting for your approval') : '')
      + (c.partial ? b('#f3f4f6', '#374151', `${c.partial} partial`, 'Some scores entered - not complete') : '')
      + (() => { const st = T.tstate[D.tid] || {}; return st.auto || st.autoBanks || st.autoAssign ? b('#ede9fe', '#5b21b6', 'Watching for new rounds', 'An automatic option is on: new rounds (also started on a phone) and finished rounds are handled, even with this tab in the background or closed while Chrome is open') : ''; })();
    if (el.dataset.h !== html) { el.dataset.h = html; el.shadowRoot.innerHTML = html; }
  }

  // ---------- first run: no API token yet ----------
  function tokenPrompt(show) {
    const main = document.querySelector('main');
    const anchor = show && main ? [...main.children].find(e => !/^tdp-/.test(e.id || '')) : null;
    T.inpage.block('tdp-token', anchor, 'before', anchor ? `<div class="card" style="margin:8px 16px"><div class="cb gap" style="align-items:center;flex-wrap:wrap">
      <b>Matchplay TD Panel</b><span class="small flex1">Paste your Matchplay API token to switch on the TD tools. <a class="link" href="https://app.matchplay.events/account/tokens" target="_blank" rel="noopener">Create an API token ↗</a> - name it anything (e.g. TD Panel), copy it, paste it here. It's kept only in this browser; change it later with the extension's toolbar button.</span>
      <input type="password" data-f="tok" placeholder="API token" style="width:240px"><button class="btn sm" data-act="saveToken">Save</button></div></div>` : '', onTokenEvent);
  }
  async function onTokenEvent(e) {
    if (e.type !== 'click' || !e.target.closest('[data-act=saveToken]')) return;
    const v = e.target.getRootNode().querySelector('[data-f=tok]').value.trim(); if (!v) return;
    await T.saveSettings({ token: v }); T.api.clear(); T.data.D.me = null; tokenPrompt(false);
    await T.data.refresh(true);
    say(T.data.D.error ? T.data.D.error : 'Token saved.', T.data.D.error ? 'err' : 'ok');
  }

  // ---------- render ----------
  function render() {
    if (!root) return;
    const d = D();
    const tdPage = !!document.querySelector(`a[href="/tournaments/${d.tid}/edit"]`);
    tokenPrompt(!T.settings.token && tdPage);
    chip(d);
    const w = root.querySelector('.wrap'); w.classList.toggle('dark', isDark());
    const html = toasts.map((t, i) => t.count
      ? `<div class="toast"><span class="flex1">${T.esc(t.text)} <b>${Math.max(0, Math.ceil((t.until - Date.now()) / 1000))}s</b></span><button class="btn sm sec" data-act="toastCancel" data-i="${i}">Cancel</button></div>`
      : `<div class="toast ${t.kind || ''}"><span class="flex1">${T.esc(t.text)}${/API token/.test(t.text) ? ' <a href="https://app.matchplay.events/account/tokens" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline">Create an API token ↗</a>' : ''}</span><button class="x" data-act="toastClose" data-i="${i}" title="Dismiss">×</button></div>`).join('');
    if (w.dataset.h !== html) { w.dataset.h = html; w.innerHTML = html; }
  }

  // ---------- toasts ----------
  let toasts = [], ticker = null;
  const tick = () => { toasts = toasts.filter(t => t.count || !t.until || t.until > Date.now()); render(); if (!toasts.length) { clearInterval(ticker); ticker = null; } };
  const startTicker = () => { if (!ticker) ticker = setInterval(tick, 500); };
  // message: errors stay until dismissed, others fade after 6 s
  function say(text, kind) { mount(); toasts = toasts.filter(t => t.count || t.text !== text); toasts.push({ text, kind, until: kind === 'err' ? 0 : Date.now() + 6000 }); render(); startTicker(); }
  // auto close/start round: "Closing the round in 10s" with Cancel; resolves true to go ahead
  function showCountdown(text, secs) {
    mount();
    return new Promise(res => {
      const t = { text, count: true, until: Date.now() + secs * 1000, res };
      toasts.push(t); render(); startTicker();
      setTimeout(() => { if (toasts.includes(t)) { toasts = toasts.filter(x => x !== t); render(); res(true); } }, secs * 1000);
    });
  }
  function onClick(e) {
    const a = e.target.closest('[data-act]'); if (!a) return;
    const t = toasts[+a.dataset.i]; if (!t) return;
    toasts = toasts.filter(x => x !== t);
    if (a.dataset.act === 'toastCancel' && t.res) t.res(false);
    render();
  }

  return { CSS, cutColor: cc, mount, unmount, render, showCountdown, setAutoState: () => {}, say };
})();
