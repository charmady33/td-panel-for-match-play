// Matchplay TD Panel - shared helpers. Every file adds to the one global namespace TDP.
/* global chrome */
var TDP = window.TDP || (window.TDP = {});
TDP.VERSION = '0.6.0';

TDP.sleep = ms => new Promise(r => setTimeout(r, ms));
TDP.log = (...a) => console.log('%c[TD Panel]', 'color:#4f46e5;font-weight:600', ...a);
TDP.warn = (...a) => console.warn('[TD Panel]', ...a);

// ---------- storage: chrome.storage.local, or localStorage when injected for testing ----------
TDP.hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
TDP.store = {
  async get(key, def = null) {
    try {
      if (TDP.hasChrome) { const o = await chrome.storage.local.get(key); return o[key] === undefined ? def : o[key]; }
      const v = localStorage.getItem('tdp:' + key); return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  async set(key, val) {
    try {
      if (TDP.hasChrome) await chrome.storage.local.set({ [key]: val });
      else localStorage.setItem('tdp:' + key, JSON.stringify(val));
    } catch (e) { TDP.warn('store.set', e); }
  },
  async del(key) {
    try { if (TDP.hasChrome) await chrome.storage.local.remove(key); else localStorage.removeItem('tdp:' + key); } catch (e) { /* ignore */ }
  },
};

// settings shared by every tournament
TDP.DEFAULT_SETTINGS = {
  token: '',
  open: true,            // panel open (not minimized)
  tab: 'status',
  labelColor: 'rose',
  autoCountdown: 10,     // seconds before auto close/start
};
TDP.settings = { ...TDP.DEFAULT_SETTINGS };
TDP.loadSettings = async () => { TDP.settings = { ...TDP.DEFAULT_SETTINGS, ...(await TDP.store.get('settings', {})) }; return TDP.settings; };
TDP.saveSettings = async (patch) => { Object.assign(TDP.settings, patch); await TDP.store.set('settings', TDP.settings); };

// per-tournament state (cutoffs, labels, check-ins, auto round, bank options...)
TDP.tstate = {};
TDP.loadT = async (tid) => (TDP.tstate[tid] = await TDP.store.get('t:' + tid, {}));
TDP.saveT = async (tid, patch) => { TDP.tstate[tid] = { ...(TDP.tstate[tid] || {}), ...patch }; await TDP.store.set('t:' + tid, TDP.tstate[tid]); };

// ---------- formatting ----------
TDP.fmtDur = ms => {
  if (ms == null || !isFinite(ms)) return '–';
  const s = Math.max(0, Math.round(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
TDP.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
TDP.ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
TDP.letter = i => String.fromCharCode(65 + i); // 0 -> A

// ---------- DOM helpers for driving Matchplay's own UI ----------
TDP.visible = el => !!(el && el.offsetParent !== null && el.getClientRects().length);
TDP.txt = el => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
TDP.waitFor = async (fn, timeout = 8000, step = 150) => {
  const end = Date.now() + timeout;
  for (;;) {
    let v = null;
    try { v = fn(); } catch (e) { v = null; }
    if (v) return v;
    if (Date.now() > end) return null;
    await TDP.sleep(step);
  }
};
// newest open Matchplay dialog (modals are role=dialog)
TDP.dialog = () => { const d = [...document.querySelectorAll('[role=dialog]')].filter(TDP.visible); return d[d.length - 1] || null; };
TDP.findBtn = (root, match) => {
  const re = match instanceof RegExp ? match : new RegExp('^\\s*' + match.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i');
  return [...(root || document).querySelectorAll('button, a, [role=menuitem]')].filter(TDP.visible).find(b => re.test(TDP.txt(b))) || null;
};
// a real mouse press: some Matchplay menus (group "Actions") only open on pointer/mouse down+up, not a bare .click()
TDP.click = el => {
  if (!el) return false;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect(), o = { bubbles: true, cancelable: true, composed: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
  for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) el.dispatchEvent(new (t.startsWith('pointer') && window.PointerEvent ? PointerEvent : MouseEvent)(t, o));
  return true;
};
// set an input's value so Vue/React notice
TDP.setVal = (input, value) => {
  const proto = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
// the label text next to a checkbox (Matchplay lists: name + labels + "Player #123 IFPA #456")
TDP.cbLabel = cb => { let n = cb.parentElement; for (let k = 0; k < 6 && n && !TDP.txt(n); k++) n = n.parentElement; return TDP.txt(n); };

// first line of that label (just the name)
TDP.cbFirst = cb => { let n = cb.parentElement; for (let k = 0; k < 6 && n && !TDP.txt(n); k++) n = n.parentElement; return ((n && n.innerText) || '').split('\n').map(s => s.trim()).filter(Boolean)[0] || ''; };

// tournament id from the URL, e.g. /tournaments/280051/matches -> 280051
TDP.routeTid = () => { const m = location.pathname.match(/^\/tournaments\/(\d+)(?:\/([^/?#]+))?/); return m ? Number(m[1]) : null; };
TDP.routePage = () => { const m = location.pathname.match(/^\/tournaments\/\d+\/?([^/?#]*)/); return m ? (m[1] || 'overview') : null; };
