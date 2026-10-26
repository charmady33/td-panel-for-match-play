// Game categories: Matchplay's EM / SS / DMD, plus LCD for modern screens Matchplay files under DMD.
//  - display type comes from Matchplay's OPDB data (/api/opdb/entry/{opdbId}, same site, no token), saved per OPDB ID
//  - a TD override per arena (saved per arena ID, so it covers every tournament using that arena) always wins
var TDP = window.TDP || (window.TDP = {});

TDP.cats = (() => {
  const T = TDP;
  const CATS = ['EM', 'SS', 'DMD', 'LCD'];
  const MP = { 1: 'EM', 2: 'SS', 3: 'DMD' };
  let over = {}, disp = {}, loaded = false;   // arenaId -> cat ; opdbId -> display ('lcd', 'dmd', 'alphanumeric', 'reels'...)

  async function load() {
    if (loaded) return;
    over = await T.store.get('arenaCat', {}); disp = await T.store.get('opdbDisp', {}); loaded = true;
  }
  const mpCat = a => MP[a && a.categoryId] || 'Unknown';
  const opdbCat = a => {
    const d = a && a.opdbId && disp[a.opdbId];
    if (!d) return null;
    return { lcd: 'LCD', dmd: 'DMD', alphanumeric: 'SS', cga: 'SS', reels: 'EM', lights: 'EM' }[String(d).toLowerCase()] || null;
  };
  // the category every tool uses: override > OPDB says LCD > Matchplay's category
  function of(a) {
    if (!a) return 'Unknown';
    if (over[a.arenaId]) return over[a.arenaId];
    const o = opdbCat(a), m = mpCat(a);
    if (o === 'LCD' && (m === 'DMD' || m === 'Unknown')) return 'LCD';
    return m !== 'Unknown' ? m : (o || 'Unknown');
  }
  const source = a => over[a && a.arenaId] ? 'override' : (of(a) !== mpCat(a) ? 'opdb' : 'matchplay');
  async function setOverride(arenaId, cat) {
    over = await T.store.get('arenaCat', {});
    if (cat) over[arenaId] = cat; else delete over[arenaId];
    await T.store.set('arenaCat', over);
  }

  // look up display types for arenas we haven't checked yet (one request at a time, saved for good)
  let busy = false;
  async function lookup(arenas, onDone) {
    await load();
    if (busy) return 0;
    const todo = [...new Set((arenas || []).map(a => a.opdbId).filter(id => id && !(id in disp)))];
    if (!todo.length) return 0;
    busy = true; let n = 0;
    try {
      for (const id of todo) {
        try {
          const r = await fetch(`/api/opdb/entry/${encodeURIComponent(id)}`, { credentials: 'include', headers: { Accept: 'application/json' } });
          if (r.ok) { const j = await r.json(); disp[id] = ((j && j.data) || j || {}).display || ''; n++; }
          else if (r.status === 404) disp[id] = '';
        } catch (e) { /* offline: try again later */ }
        await T.sleep(400);
      }
      await T.store.set('opdbDisp', disp);
    } finally { busy = false; }
    if (n && onDone) onDone();
    return n;
  }

  return { CATS, load, of, mpCat, opdbCat, source, setOverride, lookup, display: a => (a && a.opdbId && disp[a.opdbId]) || '', overrides: () => over };
})();
