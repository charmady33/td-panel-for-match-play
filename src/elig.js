// Qualifying Players tab: "Add eligibility" - IFPA-rank cuts for B, C, D… finals, applied as Matchplay labels that
// say what a player CAN'T play ("B/C Ineligible", "C Ineligible"…). Eligible for everything = no label. Only A finals
// = nothing to do. The cuts are the same ones the side panel's Finals tab uses.
var TDP = window.TDP || (window.TDP = {});

TDP.elig = (() => {
  const T = TDP;
  const COLORS = ['rose', 'orange', 'purple', 'sky', 'gray'];   // B…, C…, D… labels
  let host = null, cur = null;

  const isQual = D => D && D.qual && D.tid === D.qual.tournamentId && D.isTD;
  const divs = D => T.finals.divisions(D);
  const qst = D => T.tstate[D.qual.tournamentId] || {};

  // the label each player should carry for these cuts (null = eligible everywhere)
  function want(D, cuts) {
    const ranks = T.finals.ranksOf(D), out = new Map();
    for (const p of D.qual.players || []) {
      const r = ranks[p.playerId];
      const letters = Object.keys(cuts).filter(L => cuts[L] && r && r <= cuts[L]).sort();
      out.set(p.playerId, T.finals.eligLabel(letters));
    }
    return out;
  }
  const isEligLabel = l => T.finals.ELIG_RE.test(String(l).trim());
  // players whose labels change: keep their other labels, swap the eligibility one
  function changes(D, target) {
    const groups = new Map();
    for (const p of D.qual.players || []) {
      const have = T.finals.labelsOf(p), keep = have.filter(l => !isEligLabel(l)), w = target.get(p.playerId);
      const next = w ? [...keep, w] : keep;
      if (next.join('|') === have.join('|')) continue;
      const k = next.join('|');
      if (!groups.has(k)) groups.set(k, { ids: [], labels: next, color: w ? COLORS[(w.charCodeAt(0) - 66) % COLORS.length] : undefined });
      groups.get(k).ids.push(p.playerId);
    }
    return [...groups.values()];
  }
  function counts(D) {
    const c = {}; let none = 0;
    for (const p of D.qual.players || []) { if (p.tournamentPlayer && p.tournamentPlayer.status === 'inactive') continue; const l = T.finals.labelsOf(p).find(isEligLabel); if (l) c[l] = (c[l] || 0) + 1; else none++; }
    return { c, none };
  }

  // ---------- the bar on the Players tab ----------
  function anchor() {
    const table = document.querySelector('main table');
    if (!table) return null;
    let w = table;
    while (w.parentElement && w.parentElement.tagName !== 'MAIN' && !T.findBtn(w.parentElement, /^Add players$/)) w = w.parentElement;
    return w;
  }
  function render(D) {
    const a = T.routePage() === 'players' && isQual(D) ? anchor() : null;
    if (!a) return T.inpage.block('tdp-elig-bar', null);
    const ds = divs(D), { c, none } = counts(D);
    const anyLabels = Object.keys(c).length;
    const ranks = Object.keys(T.finals.ranksOf(D)).length;
    let html;
    if (ds.length <= 1) {
      html = `<div class="card" style="margin:0 0 12px"><div class="cb gap" style="align-items:center"><span class="h">Eligibility</span><span class="small flex1">${ds.length ? 'Only A finals: everyone is eligible, no labels needed.' : 'No finals cut lines in Matchplay yet.'}</span>${anyLabels ? '<button class="btn sm sec" data-act="clear">Remove eligibility labels</button>' : ''}</div></div>`;
    } else {
      const known = new Set(ds.slice(1).map(d => d.letter));
      const stale = Object.keys(c).filter(l => l.match(T.finals.ELIG_RE)[1].split('/').some(x => !known.has(x.trim().toUpperCase())));
      html = `<div class="card" style="margin:0 0 12px"><div class="cb gap" style="flex-wrap:wrap;align-items:center"><span class="h">Eligibility</span>
        <button class="btn sm" data-act="open">${anyLabels ? 'Edit eligibility' : 'Add eligibility'}</button>
        <span class="small flex1">${anyLabels ? Object.entries(c).sort().map(([l, n]) => `${T.esc(l)}: ${n}`).join(' · ') + ` · no label: ${none}` : `No eligibility labels yet.${ranks ? '' : ' IFPA ranks not loaded yet.'}`}</span>
        ${stale.length ? `<span class="callout warn" style="margin:0;padding:4px 8px">${T.esc(stale.join(', '))} name a division Matchplay no longer has. <button class="btn sm sec" data-act="open">Fix</button></span>` : ''}
      </div></div>`;
    }
    T.inpage.block('tdp-elig-bar', a, 'before', html, onBar);
  }
  async function onBar(e) {
    if (e.type !== 'click') return;
    const b = e.target.closest('[data-act]'); if (!b) return;
    const D = T.data.D;
    if (b.dataset.act === 'open') return open(D);
    if (b.dataset.act === 'clear') {
      const g = changes(D, new Map());
      if (g.length) await T.jobs.start('Remove eligibility labels', [{ tid: D.qual.tournamentId, page: 'players', op: 'labels', args: { groups: g, color: 'rose' }, label: 'Removing eligibility labels' }]);
    }
  }

  // ---------- the window ----------
  const CSS = () => `${T.panel.CSS}
:host{all:initial}
.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:600px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}
.dh{padding:16px 20px 8px;font-size:18px;font-weight:500}.db{padding:4px 20px 16px;max-height:65vh;overflow:auto}
.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px;flex-wrap:wrap}
.cut{display:flex;align-items:center;gap:8px;margin:6px 0}.cut input{width:110px}
table{width:100%;border-collapse:collapse}td,th{padding:4px 6px;border-top:1px solid var(--line);text-align:left}`;
  // preset = the cuts typed before the window closed to load IFPA ranks (it reopens with them)
  function open(D, preset) {
    const ds = divs(D).slice(1), st = qst(D).divs || {};
    const cuts = {}; ds.forEach(d => { if (st[d.letter] && st[d.letter].cutoff) cuts[d.letter] = +st[d.letter].cutoff; });
    if (preset && preset.cuts) Object.assign(cuts, preset.cuts);
    cur = { cuts, shown: Math.max(1, (preset && preset.shown) || 0, ds.filter(d => cuts[d.letter]).length) };
    if (!host) { host = document.createElement('div'); host.id = 'tdp-elig-dlg'; host.attachShadow({ mode: 'open' }); host.shadowRoot.addEventListener('click', onClick); host.shadowRoot.addEventListener('input', onInput); document.documentElement.appendChild(host); }
    draw();
  }
  function close() { if (host) host.remove(); host = null; cur = null; }
  function valid(ds) {
    let prev = 0;
    for (const d of ds.slice(0, cur.shown)) { const v = cur.cuts[d.letter]; if (!v) continue; if (v <= prev) return `The ${d.letter} cut must be a bigger rank number than the one before it.`; prev = v; }
    return null;
  }
  function draw() {
    const D = T.data.D, ds = divs(D).slice(1), ranks = Object.keys(T.finals.ranksOf(D)).length;
    const err = valid(ds), target = want(D, cur.cuts), groups = err ? [] : changes(D, target);
    const tally = {}; let none = 0; for (const [, l] of target) { if (l) tally[l] = (tally[l] || 0) + 1; else none++; }
    const rows = ds.slice(0, cur.shown).map(d => `<div class="cut"><b style="width:56px">${d.letter} cut</b>IFPA rank <input type="number" min="1" data-cut="${d.letter}" value="${cur.cuts[d.letter] || ''}" placeholder="e.g. 1000"> or better can't play in ${d.letter}${d.letter !== ds[0].letter ? ' <span class="small">(empty = everyone can)</span>' : ''}</div>`).join('');
    const pm = T.data.playerMap(D.qual);
    const list = groups.flatMap(g => g.ids.map(id => `<tr><td>${T.esc((pm[id] || {}).name || id)}</td><td class="small">${T.finals.ranksOf(D)[id] || 'unranked'}</td><td>${T.esc(g.labels.filter(isEligLabel).join(', ') || 'no label')}</td></tr>`)).join('');
    host.shadowRoot.innerHTML = `<style>${CSS()}</style><div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg">
      <div class="dh">Finals eligibility</div><div class="db">
        ${ranks ? `<div class="small mb">${ranks} players have an IFPA rank (read from Matchplay's IFPA rankings list). <button class="btn sm sec" data-act="ranks">Reload ranks</button></div>` : `<div class="callout warn">IFPA ranks aren't loaded yet. <button class="btn sm" data-act="ranks">Load IFPA ranks</button></div>`}
        ${rows}
        ${cur.shown < ds.length ? `<button class="btn sm sec" data-act="more">+ Add another cut (${ds[cur.shown].letter})</button>` : ''}
        ${err ? `<div class="callout err mt">${T.esc(err)}</div>` : `<div class="lab mt">Result</div><div class="small mb">${Object.entries(tally).sort().map(([l, n]) => `${T.esc(l)}: ${n}`).join(' · ') || 'Nobody ineligible'} · no label: ${none}</div>
          ${groups.length ? `<div class="small mb">${groups.reduce((s, g) => s + g.ids.length, 0)} player${groups.reduce((s, g) => s + g.ids.length, 0) === 1 ? '' : 's'} change:</div><table>${list}</table>` : '<div class="small">Labels already match these cuts.</div>'}`}
      </div><div class="df"><button class="btn sec" data-act="close">Cancel</button><button class="btn" data-act="apply" ${err || !ranks ? 'disabled' : ''}>${groups.length ? `Apply to ${groups.reduce((s, g) => s + g.ids.length, 0)} players` : 'Save cuts'}</button></div></div></div></div>`;
  }
  function onInput(e) {
    const L = e.target.dataset && e.target.dataset.cut; if (!L) return;
    const v = parseInt(e.target.value, 10); if (v > 0) cur.cuts[L] = v; else delete cur.cuts[L];
    clearTimeout(onInput.t); onInput.t = setTimeout(() => { const f = host && host.shadowRoot.activeElement, pos = f && f.selectionStart; draw(); const i = host && host.shadowRoot.querySelector(`[data-cut="${L}"]`); if (i) { i.focus(); try { i.setSelectionRange(pos, pos); } catch (x) { /* number inputs */ } } }, 400);
  }
  async function onClick(e) {
    const a = e.target.closest('[data-act]'); if (!a || !cur) return;
    if (a.dataset.act === 'bg' && e.target !== a) return;
    const D = T.data.D, act = a.dataset.act, qid = D.qual.tournamentId;
    if (act === 'bg' || act === 'close') return close();
    if (act === 'more') { cur.shown++; return draw(); }
    if (act === 'ranks') { const keep = { what: 'elig', cuts: { ...cur.cuts }, shown: cur.shown }; close(); return T.jobs.start('Load IFPA ranks', [{ tid: qid, page: 'players', op: 'readRanks', args: { tid: qid }, label: "Reading Matchplay's IFPA Rankings" }], { after: keep }); }
    if (act === 'apply') {
      const ds = divs(D).slice(1), st = { ...(qst(D).divs || {}) };
      ds.forEach(d => { st[d.letter] = { ...(st[d.letter] || {}), cutoff: cur.cuts[d.letter] || null, label: null }; });
      await T.saveT(qid, { divs: st });
      const groups = changes(D, want(D, cur.cuts));
      close();
      if (groups.length) await T.jobs.start('Eligibility labels', [{ tid: qid, page: 'players', op: 'labels', args: { groups, color: 'rose' }, label: 'Setting eligibility labels' }]);
    }
  }

  // reopen after "Load IFPA ranks" (the page refreshes when a task ends): wait for the tournament's data first
  T.jobs.afterHandlers.elig = async a => {
    const ok = await T.waitFor(() => { const D = T.data.D; return D && D.qual && (D.qual.players || []).length && D.isTD ? D : null; }, 15000, 200);
    if (ok) { await T.loadT(ok.qual.tournamentId); open(ok, a); }
  };
  return { render, open };
})();
