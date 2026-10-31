// Bar on Matchplay's Banks tab: Generate banks (none yet) / Refresh + Add (banks exist), with a preview to
// confirm before anything is created, and a Settings window (games to use/never/always, time sources).
var TDP = window.TDP || (window.TDP = {});

TDP.bankbar = (() => {
  const T = TDP;
  const lc = s => String(s || '').toLowerCase();
  let host = null, cur = null;   // modal host + state {mode, n, res}

  const active = D => (D.t.banks || []).filter(b => b.status !== 'inactive');
  const st = D => T.tstate[D.tid] || {};
  const sizeOf = D => D.t.gamesPerRound || 3;   // "Matches each round" on Matchplay's Overview
  const isFinals = D => !!(D.qual && D.qual.tournamentId !== D.tid);
  const locked = D => D.t.status !== 'planned' && active(D).length > 0;   // banks are built once: locked when the event starts (down games still get replaced)

  // ---------- the bar ----------
  // the row holding Matchplay's "Add bank" button; the bar goes right above the bank cards (or under that row).
  // Found from the button's own row, so the bar sitting there doesn't change where it's placed next time.
  function anchor() {
    const add = T.findBtn(document.querySelector('main') || document, /^Add bank$/);
    if (!add) return null;
    const row = add.closest('div.justify-between') || add.parentElement.parentElement;
    let nx = row.nextElementSibling;
    if (nx && nx.id === 'tdp-bankbar') nx = nx.nextElementSibling;
    return nx && /\bgrid\b/.test(nx.className || '') ? { el: nx, where: 'before' } : { el: row, where: 'after' };
  }
  function render(D) {
    const show = D && D.t && D.isTD && T.routePage() === 'banks' && /bank/i.test(D.t.arenaAssignment || '');
    const a = show ? anchor() : null;
    if (!a) return T.inpage.block('tdp-bankbar', null);
    const has = active(D).length, size = sizeOf(D), fin = isFinals(D);
    const html = locked(D) ? `<div class="card" style="margin:0 0 12px"><div class="cb gap" style="flex-wrap:wrap;align-items:center">
      <span class="h" style="margin-right:4px">Bank Builder</span>
      <span class="badge b-gray">${fin ? 'Finals' : 'Qualifying'} started: banks are locked</span>
      <span class="small flex1" style="text-align:right">${has} bank${has === 1 ? '' : 's'} · ${size} game${size === 1 ? '' : 's'} each · a game that goes down gets a replacement you can check first</span>
    </div>${clashHtml(D)}${backHtml(D)}</div>` : `<div class="card" style="margin:0 0 12px"><div class="cb gap" style="flex-wrap:wrap;align-items:center">
      <span class="h" style="margin-right:4px">Bank Builder</span>
      <span class="small" title="From &quot;Matches each round&quot; on Matchplay's Overview">${size} game${size === 1 ? '' : 's'} per bank (from Matchplay)</span>
      ${has ? `<button class="btn" data-act="refresh">Refresh banks</button><button class="btn sec" data-act="add">Add banks</button>` : `<button class="btn" data-act="generate">Generate banks</button>`}
      <button class="btn sec" data-act="settings" title="Games and time sources">⚙ Settings</button>
      <span class="small flex1" style="text-align:right">${has ? `${has} bank${has === 1 ? '' : 's'} in Matchplay` : 'No banks yet'} · set once, locked when ${fin ? 'the finals start' : 'the event starts'}</span>
    </div>${clashHtml(D)}</div>`;
    T.inpage.block('tdp-bankbar', a.el, a.where, html, onBar);
  }
  async function onBar(e) {
    const D = T.data.D; if (!D || !D.t) return;
    if (e.type !== 'click') return;
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'clashfix') {
      try { await T.jobs.start('Fix banks sharing a machine', [{ tid: D.tid, page: 'banks', op: 'bankFix', args: { tid: D.tid }, label: 'Re-ordering / replacing the clashing game' }]); }
      catch (err) { T.panel.say(err.message || String(err), 'err'); }
      return;
    }
    if (act === 'putback') {
      try { await T.jobs.start(`Put ${a.dataset.name} back in its banks`, [{ tid: D.tid, page: 'banks', op: 'downRestore', args: { tid: D.tid, downId: +a.dataset.id }, label: `Putting ${a.dataset.name} back` }]); }
      catch (err) { T.panel.say(err.message || String(err), 'err'); }
      return;
    }
    if (locked(D)) return;
    if (act === 'settings') return openSettings(D);
    if (act === 'generate') return ask(D, 'create', 'How many banks?');
    if (act === 'refresh') return preview(D, 'refresh', active(D).length);
    if (act === 'add') return ask(D, 'add', 'How many banks to add?');
  }

  // two active banks with the same machine at the same game number (e.g. after editing banks by hand) -> ⚠ + Fix
  function clashHtml(D) {
    const am = T.data.arenaMap(D.t), bs = active(D), seen = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) (bs[i].arenaIds || []).forEach((id, pos) => { if ((bs[j].arenaIds || [])[pos] === id) seen.push(`${(am[id] || {}).name || 'A game'} is game ${pos + 1} in ${bs[i].name} and ${bs[j].name}`); });
    if (!seen.length) return '';
    return `<div class="cb gap" style="border-top:1px solid var(--line);align-items:center;background:#fffbeb"><span class="flex1 small" style="color:#92400e">⚠ ${seen.map(T.esc).join(' · ')} - two groups would wait on the same machine.</span><button class="btn sm" data-act="clashfix" ${T.jobs.active() ? 'disabled' : ''}>Fix</button></div>`;
  }

  // down games that were replaced: when the machine works again, a button puts it back (never on its own)
  function backHtml(D) {
    const am = T.data.arenaMap(D.t), sw = st(D).downSwaps || [], seen = new Set(), rows = [];
    for (const s of sw) {
      if (seen.has(s.downId)) continue; seen.add(s.downId);
      const mine = sw.filter(x => x.downId === s.downId), back = !T.smart.isDown(am[s.downId]);
      rows.push(`<div class="small gap" style="align-items:center;padding:3px 0"><span class="flex1"><b>${T.esc(s.down)}</b> ${back ? 'works again' : 'is down'}: replaced by ${mine.map(x => `${T.esc(x.repl)} in ${T.esc(x.bank)}`).join(', ')}</span>${back ? `<button class="btn sm" data-act="putback" data-id="${s.downId}" data-name="${T.esc(s.down)}">Put ${T.esc(s.down)} back in its banks</button>` : ''}</div>`);
    }
    return rows.length ? `<div class="cb" style="border-top:1px solid var(--line)">${rows.join('')}</div>` : '';
  }

  // ---------- building ----------
  async function times(D) { return T.bankplan.estimates(D, st(D), await T.bankplan.extras(D)); }
  const namesOf = (D, ids) => { const am = T.data.arenaMap(D.t); return (ids || []).map(id => (am[id] || {}).name).filter(Boolean); };
  async function build(D, mode, n, pins) {
    const size = sizeOf(D), s = st(D), ctx = T.bankplan.context(D), est = await times(D);
    const existing = active(D).map(b => namesOf(D, b.arenaIds));
    const estBy = new Map(est.map(g => [lc(g.name), g]));
    // Add: the banks already there stay as they are. Leave their games out of the new banks when there are
    // enough other games; otherwise the fewest-used ones may repeat (and get spread out in time below).
    let exclude = [...(s.bankExclude || [])];
    if (mode === 'add') {
      const inUse = new Set(existing.flat().map(lc));
      const free = est.filter(g => !exclude.includes(g.arenaId) && !inUse.has(lc(g.name)));
      if (free.length >= n * size) exclude = [...exclude, ...est.filter(g => inUse.has(lc(g.name))).map(g => g.arenaId)];
    }
    const fixed = mode === 'add' ? active(D).map(b => ({ name: b.name, games: namesOf(D, b.arenaIds).map(nm => estBy.get(lc(nm)) || { name: nm, sec: T.banks.ERA_DEFAULT_SEC.Unknown }) })) : [];
    // never repeat an arrangement already shown or created: shown/existing banks count as history
    const shown = (s.bankShown || []).map(x => x.banks);
    const hist = [...ctx.history, ...shown, existing];
    const { avoid, usage } = T.banks.historyMaps(hist);
    if (mode === 'add') for (const names of existing) for (const nm of names) usage.set(lc(nm), (usage.get(lc(nm)) || 0) + 3);   // prefer games not in the banks already there
    const seen = new Set(shown.map(sig).concat([sig(existing)]));
    const fixedGames = fixed.map(f => f.games);
    // the most optimized arrangement first: many tries, each scored on bank times, eras, repeats from earlier rounds
    // and machines shared between banks (same game number / overlapping times). "Another arrangement" = next best.
    let best = null;
    for (let tries = 0; tries < 30; tries++) {
      const seed = Math.floor(Math.random() * 1e9);
      const res = T.banks.build(est, n, size, { seed, exclude, force: s.bankForce || [], avoid, usage });
      if (pins) applyPins(res.banks, pins, est);
      const k = sig(res.banks.map(b => b.games.map(g => g.name)));
      if (seen.has(k)) continue;
      const overlap = T.banks.schedule(res.banks, fixedGames);   // play order inside each bank
      const score = T.banks.cost(res.banks.map(b => b.games), avoid) + overlap;
      if (!best || score < best.score) best = { res, score, seed, overlap };
    }
    if (!best) throw new Error('Every arrangement of these games has been shown already. Change the games in Settings or the bank count.');
    best.res.overlap = best.overlap;
    best.res.fixed = fixed;
    best.res.est = est.filter(g => !(s.bankExclude || []).includes(g.arenaId));   // games the TD may pick by hand (not "Never")
    best.res.avoid = avoid;
    const names = active(D).map(b => b.name);
    const taken = new Set(names.map(lc));
    let k = names.length;
    best.res.banks.forEach((b, i) => {
      if (mode === 'refresh') b.name = names[i];
      else { do k++; while (taken.has(lc('Bank ' + k))); b.name = 'Bank ' + k; taken.add(lc(b.name)); }
    });
    best.res.when = T.banks.timeline(best.res.banks, fixed);
    // remember it so Refresh / Another arrangement never shows it again
    const list = [...(s.bankShown || []), { at: Date.now(), banks: best.res.banks.map(b => b.games.map(g => g.name)) }].slice(-20);
    await T.saveT(D.tid, { bankShown: list });
    return best.res;
  }
  const sig = banks => banks.map(b => [...b].map(lc).sort().join('|')).sort().join('#');
  // games the TD picked by hand stay in their bank: pins[bi] = [names]
  function applyPins(banks, pins, est) {
    const byName = new Map(est.map(g => [lc(g.name), g]));
    pins.forEach((names, bi) => {
      const b = banks[bi]; if (!b || !names) return;
      for (const nm of names) {
        if (b.games.some(g => lc(g.name) === lc(nm))) continue;
        const pinnedHere = new Set(names.map(lc));
        const slot = b.games.findIndex(g => !pinnedHere.has(lc(g.name))); if (slot < 0) continue;
        const out = b.games[slot];
        const bj = banks.findIndex((o, j) => j !== bi && o.games.some(g => lc(g.name) === lc(nm)));
        if (bj >= 0) { const gj = banks[bj].games.findIndex(g => lc(g.name) === lc(nm)); b.games[slot] = banks[bj].games[gj]; banks[bj].games[gj] = out; }
        else { const g = byName.get(lc(nm)); if (g) b.games[slot] = g; }
      }
    });
    banks.forEach(b => { b.total = b.games.reduce((t, g) => t + g.sec, 0); });
  }
  const spreadOf = banks => { const t = banks.map(b => b.total); return t.length ? Math.max(...t) - Math.min(...t) : 0; };

  // ---------- windows ----------
  const CSS = () => `${T.panel.CSS}
:host{all:initial}
.ov{position:fixed;inset:0;background:rgba(17,24,39,.5);z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 16px;overflow:auto}
.dlg{background:var(--card);border-radius:8px;box-shadow:0 20px 40px rgba(0,0,0,.25);width:800px;max-width:100%;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:var(--text)}
.dh{padding:16px 20px 8px;font-size:18px;font-weight:500}
.db{padding:4px 20px 16px;max-height:65vh;overflow:auto}
.df{background:var(--head);padding:12px 20px;display:flex;justify-content:flex-end;gap:8px;border-radius:0 0 8px 8px;flex-wrap:wrap}
.bk{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.bk .card{margin:0}
.bk li{display:flex;justify-content:space-between;gap:6px;padding:2px 0}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.seg button{border:0;background:var(--card);padding:3px 8px;font:inherit;font-size:12px;cursor:pointer;color:var(--text)}
.seg button.on{background:var(--pri);color:#fff}
table{width:100%;border-collapse:collapse}td{padding:4px 6px;border-top:1px solid var(--line)}
.gname{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;text-align:left;border-bottom:1px dashed var(--prib)}
.gname:hover,.gname.on{color:var(--pri2)}.gname .caret{font-size:10px;color:var(--soft)}
.gwrap{white-space:normal;word-break:break-word;min-width:0}
.bk li{align-items:flex-start}
.pop{position:fixed;z-index:5;width:380px;max-width:calc(100vw - 16px);background:var(--card);border:1px solid var(--prib);border-radius:8px;box-shadow:0 12px 30px rgba(0,0,0,.25);padding:6px}
.phead{display:flex;gap:6px;align-items:flex-start;font-size:12px;color:var(--muted);padding:2px 4px 6px}
.phead .x{background:none;border:0;font-size:16px;line-height:1;color:var(--soft);cursor:pointer}
.plist{max-height:300px;overflow:auto}
.popt{display:block;width:100%;background:none;border:0;border-radius:6px;padding:6px 8px;font:inherit;color:var(--text);cursor:pointer;text-align:left;border-bottom:1px solid var(--line)}
.popt:last-child{border-bottom:0}
.popt:hover{background:var(--head)}
.popt .pn{display:block;font-weight:600;font-size:14px;white-space:normal;word-break:break-word}
.popt .pd{display:block;font-size:12px;color:var(--soft);margin-top:1px}
.err{color:#be123c}`;
  function show(inner) {
    if (!host) {
      host = document.createElement('div'); host.id = 'tdp-bb-modal';
      host.attachShadow({ mode: 'open' });
      host.shadowRoot.addEventListener('click', onModal);
      host.shadowRoot.addEventListener('change', onModal);
      document.documentElement.appendChild(host);
    }
    const keep = host.shadowRoot.querySelector('.db'), y = keep ? keep.scrollTop : 0;
    host.shadowRoot.innerHTML = `<style>${CSS()}</style><div class="wrap${document.documentElement.classList.contains('dark') ? ' dark' : ''}"><div class="ov" data-act="bg"><div class="dlg">${inner}</div></div></div>`;
    const inp = host.shadowRoot.querySelector('input[data-autofocus]'); if (inp) inp.focus();
    if (y) { const db = host.shadowRoot.querySelector('.db'); if (db) db.scrollTop = y; }
    placePopover();
  }
  function close() { if (host) host.remove(); host = null; cur = null; }
  // the replacement list opens over the preview, lined up under the game that was clicked
  function placePopover() {
    const r = host && host.shadowRoot, pop = r && r.querySelector('.pop'); if (!pop || !cur || !cur.picking) return;
    const btn = r.querySelector(`[data-act=pick][data-b="${cur.picking.bi}"][data-g="${cur.picking.gi}"]`); if (!btn) return;
    // fixed to the screen, under the game (or above it when there's no room below); the list scrolls inside
    const b = btn.getBoundingClientRect(), w = Math.min(380, innerWidth - 16), list = pop.querySelector('.plist');
    pop.style.position = 'fixed'; pop.style.width = w + 'px';
    pop.style.left = Math.max(8, Math.min(b.left, innerWidth - w - 8)) + 'px';
    const below = innerHeight - b.bottom - 12, above = b.top - 12, room = below >= 220 || below >= above ? below : above;
    if (list) list.style.maxHeight = Math.max(120, Math.min(320, room - 50)) + 'px';
    pop.style.top = (room === below ? b.bottom + 4 : Math.max(8, b.top - 4 - pop.offsetHeight)) + 'px';
    const db = r.querySelector('.db'); if (db && !db.dataset.popScroll) { db.dataset.popScroll = '1'; db.addEventListener('scroll', () => { if (cur && cur.picking) placePopover(); }, { passive: true }); }
  }
  function ask(D, mode, q) {
    cur = { mode };
    show(`<div class="dh">${T.esc(q)}</div><div class="db"><input type="number" min="1" data-autofocus data-f="askN" value=""></div>
      <div class="df"><button class="btn sec" data-act="close">Cancel</button><button class="btn" data-act="askOk">Preview</button></div>`);
  }

  async function preview(D, mode, n, pins) {
    cur = { mode, n, pins: pins || [] };
    show(`<div class="dh">Building ${n} bank${n === 1 ? '' : 's'}…</div><div class="db small">Working out the arrangement.</div>`);
    try { cur.res = await build(D, mode, n, cur.pins.some(p => p && p.length) ? cur.pins : null); } catch (e) {
      return show(`<div class="dh">Can't build banks</div><div class="db"><div class="callout">${T.esc(e.message || String(e))}</div></div><div class="df"><button class="btn sec" data-act="settings">Settings</button><button class="btn" data-act="close">Close</button></div>`);
    }
    drawPreview();
  }
  function drawPreview() {
    const { mode, n, res } = cur, t = res.banks.map(b => b.total);
    const title = mode === 'refresh' ? `Refresh games in ${n} bank${n === 1 ? '' : 's'}` : mode === 'add' ? `Add ${n} bank${n === 1 ? '' : 's'}` : `Create ${n} bank${n === 1 ? '' : 's'}`;
    const at = sec => T.fmtDur(sec * 1000);
    const cards = res.banks.map((b, bi) => `<div class="card"><div class="ch"><span class="h">${T.esc(b.name)}</span><span class="small">${at(b.total)}</span></div><div class="cb"><ul style="margin:0;padding:0;list-style:none">${b.games.map((g, gi) => {
      const w = res.when[bi][gi], clash = w.also.filter(x => x.overlap > 0 || x.sameSlot), same = w.also.filter(x => x.sameSlot);
      const also = w.also.length ? `<div class="small ${clash.length ? 'err' : 'muted'}" style="padding-left:44px">${clash.length ? '⚠ ' : ''}also in ${w.also.map(x => `${T.esc(x.bank)} as game ${x.pos + 1} @ ${at(x.s)}`).join(', ')}${same.length ? ` - same game number as ${same.map(x => T.esc(x.bank)).join(', ')}` : clash.length ? ` - overlaps ~${Math.ceil(Math.max(...clash.map(x => x.overlap)) / 60)} min` : ''}</div>` : '';
      const pinned = (cur.pins[bi] || []).some(nm => lc(nm) === lc(g.name)), open = cur.picking && cur.picking.bi === bi && cur.picking.gi === gi;
      return `<li><span class="small" style="width:44px;flex:none">@${at(w.s)}</span><span class="flex1 gwrap"><button class="gname${open ? ' on' : ''}" data-act="pick" data-b="${bi}" data-g="${gi}" title="Change this game">${pinned ? '📌 ' : ''}${T.esc(g.name)} <span class="caret">▾</span></button>${g.repeat ? ' <span class="badge b-amber">repeat</span>' : ''}</span><span class="small" style="white-space:nowrap" title="${T.esc(g.src)}">${T.esc(g.era)} · ${at(g.sec)}</span></li>${also}`;
    }).join('')}</ul>${b.repeatPairs ? '<div class="small warn mt">Has a game pair from an earlier round</div>' : ''}</div></div>`).join('');
    const notes = [`Bank times ${at(Math.min(...t))} – ${at(Math.max(...t))} (spread ${at(Math.max(...t) - Math.min(...t))}). @ = expected start; games are played in this order.`];
    if (res.fixed.length) notes.push(res.fixed.length === 1 ? 'Your existing bank stays as it is.' : `Your ${res.fixed.length} existing banks stay as they are.`);
    if (res.banks.some((b, bi) => res.when[bi].some(w => w.also.some(x => x.overlap > 0 || x.sameSlot)))) notes.push('Some machines are in more than one bank at the same game number or at overlapping times (marked ⚠): two groups may wait on the same game. Try another arrangement, or add more games in Matchplay.');
    if (res.dropped.length) notes.push(`Not used this time: ${res.dropped.map(g => g.name).join(', ')}`);
    if (mode === 'refresh') notes.push('Bank names stay the same; their games are replaced.');
    notes.push('Click a game to change it (best choices first). Games you change are pinned 📌 and stay when you ask for another arrangement.');
    const pinned = cur.pins.some(p => p && p.length);
    show(`<div class="dh">${title}</div><div class="db" style="position:relative"><div class="small mb">${notes.map(T.esc).join('<br>')}</div><div class="bk">${cards}</div>${cur.picking ? pickerHtml(cur.picking.bi, cur.picking.gi) : ''}</div>
      <div class="df">${pinned ? '<button class="btn sec" data-act="unpin" style="margin-right:auto">Clear my changes</button>' : ''}<button class="btn sec" data-act="close">Cancel</button><button class="btn sec" data-act="another">Another arrangement</button><button class="btn" data-act="confirm">Confirm</button></div>`);
  }

  // ---------- change one game by hand ----------
  // every usable game, ranked by how good the banks would be with it in this slot (a game already in another bank swaps)
  function choices(bi, gi) {
    const res = cur.res, me = res.banks[bi].games[gi], fixedGames = res.fixed.map(f => f.games);
    const base = layoutScore(res.banks.map(b => ({ games: [...b.games] })), fixedGames, res.avoid);
    const out = [];
    for (const g of res.est) {
      if (lc(g.name) === lc(me.name) || res.banks[bi].games.some((x, k) => k !== gi && lc(x.name) === lc(g.name))) continue;
      const trial = res.banks.map(b => ({ games: [...b.games] }));
      const bj = trial.findIndex((b, j) => j !== bi && b.games.some(x => lc(x.name) === lc(g.name)));
      let swapWith = null;
      if (bj >= 0) {
        const gj = trial[bj].games.findIndex(x => lc(x.name) === lc(g.name));
        if (trial[bj].games.some((x, k) => k !== gj && lc(x.name) === lc(me.name))) continue;   // would put a machine twice in that bank
        trial[bj].games[gj] = me; swapWith = res.banks[bj].name;
      }
      trial[bi].games[gi] = g;
      const sc = layoutScore(trial, fixedGames, res.avoid);
      out.push({ g, swapWith, score: sc.score, clash: sc.overlap > base.overlap ? (sc.overlap >= 1e6 && base.overlap < 1e6 ? 'same game number' : 'overlap') : '' });
    }
    return out.sort((a, b) => a.score - b.score);
  }
  function layoutScore(banks, fixedGames, avoid) {
    const overlap = T.banks.schedule(banks, fixedGames);
    return { overlap, score: T.banks.cost(banks.map(b => b.games), avoid) + overlap };
  }
  function pickerHtml(bi, gi) {
    const list = choices(bi, gi), at = sec => T.fmtDur(sec * 1000);
    const me = cur.res.banks[bi].games[gi];
    const head = `<div class="phead"><span class="flex1">Replace <b>${T.esc(me.name)}</b> in ${T.esc(cur.res.banks[bi].name)} with (best first):</span><button class="x" data-act="pickClose" title="Close">×</button></div>`;
    if (!list.length) return `<div class="pop">${head}<div class="small" style="padding:6px">No other game fits here.</div></div>`;
    return `<div class="pop">${head}<div class="plist">${list.map((c, i) =>
      `<button class="popt" data-act="choose" data-name="${T.esc(c.g.name)}"><span class="pn">${T.esc(c.g.name)}${i === 0 ? ' <span class="badge b-green">best</span>' : ''}</span><span class="pd">${T.esc(c.g.era)} · ${at(c.g.sec)}${c.swapWith ? ` · swaps with ${T.esc(c.swapWith)}` : ' · not used yet'}${c.clash ? ` · <span class="err">⚠ ${c.clash}</span>` : ''}</span></button>`).join('')}</div></div>`;
  }
  function choose(name) {
    const { bi, gi } = cur.picking, res = cur.res, me = res.banks[bi].games[gi];
    const g = res.est.find(x => lc(x.name) === lc(name)); if (!g) return;
    const bj = res.banks.findIndex((b, j) => j !== bi && b.games.some(x => lc(x.name) === lc(name)));
    if (bj >= 0) { const gj = res.banks[bj].games.findIndex(x => lc(x.name) === lc(name)); res.banks[bj].games[gj] = me; }
    res.banks[bi].games[gi] = g;
    const pins = cur.pins[bi] = (cur.pins[bi] || []).filter(nm => lc(nm) !== lc(me.name));
    pins.push(g.name);
    res.overlap = T.banks.schedule(res.banks, res.fixed.map(f => f.games));
    res.banks.forEach(b => { b.total = b.games.reduce((t, x) => t + x.sec, 0); });
    res.when = T.banks.timeline(res.banks, res.fixed);
    res.dropped = res.est.filter(x => !res.banks.some(b => b.games.some(y => lc(y.name) === lc(x.name))) && !res.fixed.some(f => f.games.some(y => lc(y.name) === lc(x.name))));
    cur.picking = null;
    drawPreview();
  }

  async function confirm(D) {
    const { mode, res } = cur, banks = res.banks.map(b => ({ name: b.name, arenas: b.games.map(g => g.name) }));
    const step = mode === 'refresh'
      ? { tid: D.tid, page: 'banks', op: 'bankArenas', args: { banks }, label: `Replacing games in ${banks.length} banks` }
      : { tid: D.tid, page: 'banks', op: 'createBanks', args: { banks }, label: `Creating ${banks.length} banks` };
    close();
    await T.jobs.start(mode === 'refresh' ? 'Refresh banks' : mode === 'add' ? 'Add banks' : 'Generate banks', [step]);
  }

  // ---------- Assign banks (Matches tab button) ----------
  function assignPreview(D, k = 0) {
    const o = T.bankplan.assignOptions(D);
    if (!o.list.length) return T.panel.say(!o.ctx.groups.length ? 'No group in this round needs a bank.' : o.allBanks ? 'Every bank is already in use this round - add banks on the Banks tab.' : 'No banks yet - make them on the Banks tab.', 'err');
    k = k % o.list.length; cur = { mode: 'assign', k, o };
    const opt = o.list[k];
    const rows = opt.pairs.map(p => {
      const lines = [];
      if (p.similar.length) lines.push(`<div class="small err">⚠ Very like a bank already played: ${p.similar.map(x => `${T.esc(x.player)} (${x.same} of the same games in ${T.esc(x.round)})`).join(', ')}</div>`);
      if (p.repeats.length) lines.push(`<div class="small warn">Repeats: ${p.repeats.map(x => `${T.esc(x.player)} played ${T.esc(x.game)}${x.times > 1 ? ' ×' + x.times : ''}`).join(', ')}</div>`);
      return `<tr><td><b>Group ${p.group}</b></td><td>→ ${T.esc(p.bank)}</td><td class="small">${p.fresh} of ${p.total} new</td></tr>${lines.length ? `<tr><td></td><td colspan="2">${lines.join('')}</td></tr>` : ''}`;
    }).join('');
    const notes = [];
    if (o.usedBanks) notes.push(`${o.usedBanks} bank${o.usedBanks === 1 ? ' is' : 's are'} already in use this round and left out.`);
    if (o.shared) notes.push(`${o.ctx.groups.length} groups but ${o.banks.length} free bank${o.banks.length === 1 ? '' : 's'}: ${o.ctx.groups.length - o.banks.length} bank${o.ctx.groups.length - o.banks.length === 1 ? '' : 's'} will be shared. Add banks on the Banks tab so each group gets its own.`);
    if (opt.pairs.some(p => p.repeats.length || p.similar.length)) notes.push('Some repeats can\'t be avoided with these banks. Refresh or Add banks on the Banks tab for more variety.');
    show(`<div class="dh">Assign banks · ${T.esc(o.ctx.round.name || 'this round')}</div><div class="db">
      <div class="small mb">Picked so players get games they haven't played, avoiding banks close to one they already had (2+ of the same games).${o.list.length > 1 ? ` Option ${k + 1} of ${o.list.length}.` : ''}</div>
      <table>${rows}</table>${notes.map(n => `<div class="callout warn mt">${T.esc(n)}</div>`).join('')}</div>
      <div class="df"><button class="btn sec" data-act="close">Cancel</button>${o.list.length > 1 ? '<button class="btn sec" data-act="nextOpt">Another option</button>' : ''}<button class="btn" data-act="assignGo">Assign</button></div>`);
  }

  // ---------- Fill random results (Test tournaments) ----------
  async function fillConfirm(D) {
    const r = T.data.currentRound(); if (!r || D.t.test !== true) return;
    // the round straight from the API (a bank assigned a moment ago must count)
    let fresh = null;
    try { fresh = await T.data.roundGames(D.tid, r.roundId); D.games = D.games.filter(g => g.roundId !== r.roundId).concat(fresh); } catch (e) { /* use what we have */ }
    const open = D.games.filter(g => g.roundId === r.roundId && !g.bye && !T.timing.isDone(g));
    const ready = open.filter(g => g.arenaId != null || g.set === 9999), tbs = open.filter(g => g.set === 9999 && g.arenaId == null).length;
    cur = { mode: 'fill', r };
    show(`<div class="dh">Fill random results?</div><div class="db">
      <div class="mb">Enter a random finishing order for all <b>${ready.length}</b> open game${ready.length === 1 ? '' : 's'} in ${T.esc(r.name || 'this round')}.${tbs ? ` ${tbs} tiebreaker game${tbs === 1 ? ' gets' : 's get'} a random arena first.` : ''}</div>
      ${ready.length < open.length ? `<div class="callout warn">${open.length - ready.length} game${open.length - ready.length === 1 ? ' has' : 's have'} no arena yet and will be skipped. Assign banks first.</div>` : ''}
      <div class="small">Only on Test tournaments. Each game gets its own random order.</div></div>
      <div class="df"><button class="btn sec" data-act="close">Cancel</button><button class="btn" data-act="fillGo">Fill ${ready.length} game${ready.length === 1 ? '' : 's'}</button></div>`);
  }

  // ---------- settings ----------
  async function openSettings(D) {
    cur = { mode: 'settings' };
    const s = st(D), est = await times(D), ex = new Set(s.bankExclude || []), fo = new Set(s.bankForce || []);
    const hist = await T.store.get('hist', {}), use = new Set(s.histUse || []);
    const isFinals = D.qual && D.qual.tournamentId !== D.tid;
    const rows = [...est].sort((a, b) => (a.era > b.era) - (a.era < b.era) || a.name.localeCompare(b.name)).map(g => {
      const v = ex.has(g.arenaId) ? 'never' : fo.has(g.arenaId) ? 'always' : 'use';
      return `<tr><td>${T.esc(g.name)}</td><td class="small">${T.esc(g.era)}</td><td class="small" title="${T.esc(g.src)}">${T.fmtDur(g.sec * 1000)}</td><td style="text-align:right"><span class="seg">${['use', 'never', 'always'].map(x => `<button class="${x === v ? 'on' : ''}" data-act="mode" data-a="${g.arenaId}" data-v="${x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</span></td></tr>`;
    }).join('');
    const histRows = Object.entries(hist).filter(([id]) => +id !== D.tid).sort((a, b) => b[1].at - a[1].at).slice(0, 15).map(([id, x]) => `<label class="gap"><input type="checkbox" data-hist="${id}" ${use.has(id) ? 'checked' : ''}> <span class="flex1 ell">${T.esc(x.name)}</span><span class="small">${Object.keys(x.arenas).length} arenas</span></label>`).join('') || '<div class="small">None yet. Times are saved automatically from every tournament you open with the extension.</div>';
    show(`<div class="dh">Bank settings</div><div class="db">
      <div class="lab">Games</div><div class="small mb">Use = may be picked · Never = left out · Always = in every set of banks</div>
      <table>${rows}</table>
      <div class="lab mt">Game times from</div>
      <div class="small mb">All sources are combined, weighted by how many games each has: this tournament${isFinals ? ', the qualifying (automatic)' : ''}, the Matchplay IDs below, and the past events you tick. Same list as the Arenas tab.</div>
      <div class="gap mb"><input type="text" data-f="pastIds" placeholder="Matchplay tournament IDs, e.g. 201234, 205678" value="${T.esc(s.bankPast || '')}"><button class="btn sm sec" data-act="loadPast">Load</button></div>
      ${s.pastTimes ? `<div class="small mb">${Object.keys(s.pastTimes).length} arenas loaded from those IDs.</div>` : ''}
      <div class="lab mt">Past events run with the extension</div>${histRows}
    </div><div class="df"><button class="btn" data-act="close">Done</button></div>`);
  }

  async function onModal(e) {
    const D = T.data.D; if (!D) return;
    const el = e.target;
    if (e.type === 'change') {
      if (el.dataset.hist) { const s2 = new Set(st(D).histUse || []); el.checked ? s2.add(el.dataset.hist) : s2.delete(el.dataset.hist); await T.saveT(D.tid, { histUse: [...s2] }); }
      return;
    }
    const a = el.closest('[data-act]');
    if (cur && cur.picking && !el.closest('.pop') && !(a && a.dataset.act === 'pick')) { cur.picking = null; drawPreview(); if (!a || a.dataset.act === 'bg') return; }
    if (!a) return;
    if (a.dataset.act === 'bg' && el !== a) return;
    const act = a.dataset.act;
    try {
      if (act === 'bg' || act === 'close') return close();
      if (act === 'askOk') {
        const n = +host.shadowRoot.querySelector('[data-f=askN]').value;
        if (!n || n < 1) return T.panel.say('Enter how many banks.', 'err');
        return preview(D, cur.mode, n);
      }
      if (act === 'another') return preview(D, cur.mode, cur.n, cur.pins);
      if (act === 'unpin') return preview(D, cur.mode, cur.n, []);
      if (act === 'pick') { const bi = +a.dataset.b, gi = +a.dataset.g; cur.picking = cur.picking && cur.picking.bi === bi && cur.picking.gi === gi ? null : { bi, gi }; return drawPreview(); }
      if (act === 'choose') return choose(a.dataset.name);
      if (act === 'pickClose') { cur.picking = null; return drawPreview(); }
      if (act === 'nextOpt') return assignPreview(D, cur.k + 1);
      if (act === 'fillGo') { const r = cur.r; close(); return T.jobs.start(`Random results for ${r.name || 'this round'}`, [{ tid: D.tid, page: 'matches', op: 'fillResults', args: { tid: D.tid, roundId: r.roundId }, label: 'Entering random results' }]); }
      if (act === 'assignGo') { const { o, k } = cur; close(); return T.jobs.start(`Assign banks for ${o.ctx.round.name || 'this round'}`, T.bankplan.assignSteps(D, o.ctx, o.list[k])); }
      if (act === 'confirm') return confirm(D);
      if (act === 'settings') return openSettings(D);
      if (act === 'mode') {
        const id = +a.dataset.a, v = a.dataset.v, s = st(D);
        const ex = new Set(s.bankExclude || []), fo = new Set(s.bankForce || []);
        ex.delete(id); fo.delete(id); if (v === 'never') ex.add(id); if (v === 'always') fo.add(id);
        await T.saveT(D.tid, { bankExclude: [...ex], bankForce: [...fo] });
        return openSettings(D);
      }
      if (act === 'loadPast') {
        const ids = (host.shadowRoot.querySelector('[data-f=pastIds]').value.match(/\d+/g) || []).map(Number);
        a.disabled = true; a.textContent = 'Loading…';
        const k = await T.bankplan.loadPast(D, ids);
        T.panel.say(`Loaded times for ${k} arenas.`, 'ok');
        return openSettings(D);
      }
    } catch (err) { T.panel.say(err.message || String(err), 'err'); }
  }
  // keyboard: Enter in the "how many" box
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cur && cur.picking && host) { e.stopPropagation(); cur.picking = null; drawPreview(); return; } if (e.key === 'Enter' && cur && cur.mode !== 'settings' && host && e.composedPath().some(x => x.dataset && x.dataset.f === 'askN')) host.shadowRoot.querySelector('[data-act=askOk]').click(); }, true);

  return { render, close, assignPreview, fillConfirm };
})();
