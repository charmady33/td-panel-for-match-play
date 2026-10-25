// Matchplay official API (read-only). Each TD uses their own token (Settings tab).
// Standards: https://docs.matchplay.events/api - Bearer token, ~120 requests/min,
// standings no more than every 15 s while live, completed data fetched once and cached.
var TDP = window.TDP || (window.TDP = {});

TDP.API_BASE = 'https://api.matchplay.events/api';
TDP.api = (() => {
  const MIN_GAP = 650;            // ms between requests -> under 100/min
  let last = 0, chain = Promise.resolve(), backoffUntil = 0;
  const cache = new Map();         // path -> { at, data }
  const forever = new Set();       // paths that never change (completed tournaments)

  async function raw(path) {
    const token = TDP.settings.token;
    if (!token) throw new Error('NO_TOKEN');
    const wait = Math.max(0, last + MIN_GAP - Date.now(), backoffUntil - Date.now());
    if (wait) await TDP.sleep(wait);
    last = Date.now();
    const r = await fetch(TDP.API_BASE + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } });
    if (r.status === 429) { backoffUntil = Date.now() + 30000; throw new Error('RATE_LIMITED'); }
    if (r.status === 401) throw new Error('BAD_TOKEN');
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    const j = await r.json();
    return j && Object.prototype.hasOwnProperty.call(j, 'data') && !j.meta ? j.data : j;
  }

  // get(path, maxAgeMs): cached for maxAge; requests are queued one at a time
  function get(path, maxAge = 0) {
    const c = cache.get(path);
    if (c && (forever.has(path) || Date.now() - c.at < maxAge)) return Promise.resolve(c.data);
    const p = chain.then(() => raw(path)).then(data => { cache.set(path, { at: Date.now(), data }); return data; });
    chain = p.catch(() => {});
    return p;
  }
  // paginated list endpoints ({data, meta:{last_page}})
  async function all(path, maxAge = 0) {
    const out = [];
    for (let page = 1; page <= 20; page++) {
      const j = await get(path + (path.includes('?') ? '&' : '?') + 'page=' + page, maxAge);
      const rows = Array.isArray(j) ? j : (j && j.data) || [];
      out.push(...rows);
      const lastPage = j && j.meta && (j.meta.last_page || j.meta.lastPage);
      if (!lastPage || page >= lastPage) break;
    }
    return out;
  }
  const keepForever = path => forever.add(path);
  const clear = () => cache.clear();
  return { get, all, keepForever, clear };
})();

TDP.apiErrorText = e => {
  const m = String(e && e.message || e);
  if (m === 'NO_TOKEN') return 'Add your Matchplay API token in Settings (app.matchplay.events/account/tokens).';
  if (m === 'BAD_TOKEN') return 'Matchplay rejected the API token - check it in Settings.';
  if (m === 'RATE_LIMITED') return 'Matchplay asked us to slow down - pausing 30 seconds.';
  return m;
};
