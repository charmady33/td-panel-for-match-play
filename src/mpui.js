// Drivers for Matchplay's own UI (the API is read-only, so every write is done by clicking Matchplay's controls).
// Learned live on app.matchplay.events - see matchplay-reference.md. Each driver throws a readable Error on failure.
var TDP = window.TDP || (window.TDP = {});

TDP.mp = (() => {
  const T = TDP;
  const fail = msg => { throw new Error(msg); };
  async function needBtn(match, root, timeout = 6000) {
    const b = await T.waitFor(() => T.findBtn(root || document, match), timeout);
    return b || fail(`Couldn't find "${match}" on the page.`);
  }
  // Matchplay's dialogs render their content a moment after the box appears: wait for text
  async function needDialog(timeout = 6000) { return (await T.waitFor(() => { const d = T.dialog(); return d && T.txt(d) ? d : null; }, timeout)) || fail('Matchplay dialog did not open.'); }
  async function dialogClosed(timeout = 8000) { await T.waitFor(() => !T.dialog(), timeout, 50); await T.sleep(150); }
  async function menu(trigger, item, root) {
    T.click(await needBtn(trigger, root));
    T.click(await needBtn(item));   // waits for the menu item to appear
    await T.sleep(150);
  }
  // click a Matchplay tab link (keeps the SPA, so dialogs that need the tournament loaded work)
  async function goTab(tid, page) {
    const href = `/tournaments/${tid}${page && page !== 'overview' ? '/' + page : ''}`;
    if (location.pathname === href) return;
    const a = [...document.querySelectorAll(`a[href$="${href}"]`)].find(T.visible);
    if (a) { a.click(); await T.waitFor(() => location.pathname === href, 6000, 50); await T.sleep(400); }
    else { location.assign(href); await T.sleep(10000); }
  }

  // ---------- Players tab ----------
  const playerRows = () => [...document.querySelectorAll('main tr')].map(tr => {
    const a = tr.querySelector('a[href*="/players/"]'); const cb = tr.querySelector('input[type=checkbox]');
    const m = a && a.getAttribute('href').match(/\/players\/(\d+)/);
    return m ? { tr, id: Number(m[1]), cb, name: T.txt(a) } : null;
  }).filter(Boolean);
  async function waitPlayers() { return (await T.waitFor(() => playerRows().length && playerRows(), 10000)) || fail('Players list did not load.'); }
  // Matchplay re-renders the table when the selection changes, so look the rows up again after every click
  async function clearSelection() {
    for (let k = 0; k < 200; k++) { const r = playerRows().find(x => x.cb && x.cb.checked); if (!r) return; r.cb.click(); await T.waitFor(() => !r.cb.isConnected || !r.cb.checked, 1500, 30); await T.sleep(40); }
  }
  async function selectPlayers(ids) {
    await waitPlayers(); await clearSelection();
    const want = new Set(ids.map(Number));
    for (let k = 0; k < ids.length * 4 + 10; k++) {
      const r = playerRows().find(x => want.has(x.id) && x.cb && !x.cb.checked);
      if (!r) break;
      r.cb.click(); await T.waitFor(() => !r.cb.isConnected || r.cb.checked, 1500, 30); await T.sleep(40);
    }
    const n = playerRows().filter(x => want.has(x.id) && x.cb && x.cb.checked).length;
    if (n !== want.size) fail(`Only selected ${n} of ${want.size} players in the list.`);
    await T.sleep(100);
  }
  // Set label REPLACES a player's labels, so callers pass the full list (existing + new)
  async function setLabels(ids, labels, color) {
    await selectPlayers(ids);
    T.click((await T.waitFor(() => bulkBtn('Set label'), 5000)) || fail('No "Set label" button.'));
    const d = await needDialog();
    const input = d.querySelector('input[type=text], input:not([type])') || fail('Label box not found.');
    T.setVal(input, labels.join(', '));
    pickColor(d, color);
    T.click(await needBtn(/^Update/, d));
    await dialogClosed();
  }
  // color swatches are radios named lime, sky, purple, orange, rose, gray, trans, pride
  function pickColor(d, name) {
    if (!name) return;
    const r = [...d.querySelectorAll('[role=radio]')].find(x => T.txt(x).toLowerCase() === String(name).toLowerCase());
    if (r) r.click();
  }
  // the bulk bar's button (not the per-row Activate/Deactivate links)
  const bulkBtn = text => [...document.querySelectorAll('main button')].filter(T.visible).find(b => T.txt(b) === text && !(b.closest('tr') && b.closest('tr').querySelector('a[href*="/players/"]')));
  async function bulk(ids, action /* 'Activate' | 'Deactivate' */) {
    await selectPlayers(ids);
    T.click((await T.waitFor(() => bulkBtn(action), 5000)) || fail(`No bulk "${action}" button.`));
    await T.waitFor(() => !bulkBtn(action), 4000, 50); await T.sleep(200);   // the bar goes once Matchplay has done it
    await clearSelection();
  }
  async function setActive(id, active) {
    await waitPlayers();
    const r = playerRows().find(x => x.id === Number(id)) || fail('Player not in this tournament.');
    const b = [...r.tr.querySelectorAll('button')].find(x => T.txt(x) === (active ? 'Activate' : 'Deactivate'));
    if (b) { b.click(); await T.waitFor(() => !b.isConnected || T.txt(b) !== (active ? 'Activate' : 'Deactivate'), 4000, 50); await T.sleep(150); }
  }
  // Matchplay's own IFPA Rankings table (Players tab -> "IFPA rankings"): name -> rank
  async function readIfpaRanks() {
    await waitPlayers();
    T.click(await needBtn('IFPA rankings'));
    await needDialog();
    const d = await T.waitFor(() => { const x = T.dialog(); return x && x.querySelectorAll('tr td').length ? x : null; }, 10000) || fail('IFPA Rankings list did not load.');
    { let n = -1, since = Date.now(); await T.waitFor(() => { const k = T.dialog().querySelectorAll('tr').length; if (k !== n) { n = k; since = Date.now(); } return Date.now() - since > 300; }, 4000, 50); }   // until the list stops growing
    const out = {};
    for (const tr of T.dialog().querySelectorAll('tr')) {
      const td = [...tr.querySelectorAll('td')].map(T.txt);
      if (td.length >= 2) { const rank = parseInt(td[td.length - 1].replace(/[^\d]/g, ''), 10); out[td[0]] = isFinite(rank) ? rank : null; }
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));   // closes Matchplay's dialog
    await dialogClosed(3000);
    return out;
  }

  // ---------- Add players from qualifying (finals Players tab -> "Add from qualifying") ----------
  async function addFromQualifying(ids) {
    T.click(await needBtn('Add from qualifying'));
    let d = await needDialog();
    const other = [...d.querySelectorAll('label, li, div')].find(e => /^Other player amount$/i.test(T.txt(e)));
    if (other) other.click();
    T.click(await needBtn('Select players', d));
    await T.sleep(200);
    d = await needDialog();
    const boxes = await T.waitFor(() => { const b = [...d.querySelectorAll('input[type=checkbox]')]; return b.length ? b : null; }, 8000) || fail('Qualifying player list did not load.');
    const want = new Set(ids.map(Number)); let hit = 0;
    for (const b of boxes) {
      const m = T.cbLabel(b).match(/Player #(\d+)/); const id = m ? Number(m[1]) : null;
      if (b.disabled) continue;
      const on = id != null && want.has(id);
      if (on) hit++;
      if (b.checked !== on) { b.click(); await T.sleep(20); }
    }
    if (hit !== want.size) { T.click(T.findBtn(d, 'Cancel')); fail(`Only ${hit} of ${want.size} players could be selected (already added?).`); }
    await T.sleep(100);
    T.click(await needBtn(/^Add \d+ players?$/, d));
    await dialogClosed(10000);
  }

  // ---------- seeds (Players -> Actions -> Update seeds): click-to-move rows ----------
  async function setSeeds(namesInOrder) {
    await menu('Actions', 'Update seeds');
    // smallest elements whose text is "S<n> <name>" (the clickable seed rows)
    const rows = () => [...document.querySelectorAll('main *')].filter(e => T.visible(e) && /^S\d+\s\S/.test(T.txt(e)) && ![...e.children].some(c => /^S\d+\s\S/.test(T.txt(c))));
    const list = () => { const seen = new Map(); for (const e of rows()) { const m = T.txt(e).match(/^S(\d+)\s+(.+)$/); if (m && !seen.has(m[1])) seen.set(m[1], { el: e, seed: +m[1], name: m[2].trim() }); } return [...seen.values()].sort((a, b) => a.seed - b.seed); };
    await T.waitFor(() => list().length, 8000) || fail('Seeding list did not open.');
    for (let i = 0; i < namesInOrder.length; i++) {
      const cur = list(); if (!cur[i]) break;
      if (cur[i].name === namesInOrder[i]) continue;
      const from = cur.find(r => r.name === namesInOrder[i]); if (!from) continue;
      from.el.click(); await T.sleep(200);
      list()[i].el.click(); await T.waitFor(() => (list()[i] || {}).name === namesInOrder[i], 1500, 40); await T.sleep(60);
    }
    T.click(await needBtn('Save changes'));
    await T.waitFor(() => !T.findBtn(document, 'Save changes'), 5000, 50); await T.sleep(200);
  }

  // ---------- rounds (Matches tab) ----------
  async function closeRound() { T.click(await needBtn(/Close round$/)); await T.waitFor(() => !T.findBtn(document, /Close round$/), 8000, 50); await T.sleep(300); }
  // publish: false = start it unpublished ("Publish round immediately" unticked), to set banks first
  async function startNextRound(opts = {}) {
    const b = T.findBtn(document, /^Start next round$/); if (!b) return false;
    T.click(b);
    const d = await needDialog();
    if (opts.category != null) {   // Limit arenas to… ("-1" = Don't draw arenas)
      const sel = await T.waitFor(() => d.querySelector('select#categoryId, select[name=categoryId]'), 3000);
      if (!sel || ![...sel.options].some(o => o.value === String(opts.category))) { T.click(T.findBtn(d, 'Cancel')); fail('No "Limit arenas to…" choice in the Start round window.'); }
      T.setVal(sel, String(opts.category)); await T.sleep(150);
    }
    if (opts.publish === false) {
      const cb = [...d.querySelectorAll('input[type=checkbox]')].find(c => /Publish round immediately/i.test(T.cbLabel(c)));
      if (!cb) { T.click(T.findBtn(d, 'Cancel')); fail('No "Publish round immediately" option in the Start round window.'); }
      if (cb.checked) { cb.click(); await T.waitFor(() => !cb.checked, 1500); }
    }
    T.click(await needBtn('Start round', d));
    await dialogClosed(15000);
    return true;
  }
  // an unpublished ("Pending") round: its green Publish button
  async function publishRound() {
    const b = await T.waitFor(() => T.findBtn(document.querySelector('main') || document, /^Publish$/), 8000) || fail('No "Publish" button (is the round already published?).');
    T.click(b);
    await T.waitFor(() => !T.findBtn(document.querySelector('main') || document, /^Publish$/), 10000);
    await T.sleep(300);
  }

  // ---------- banks (Banks tab) ----------
  // tick is the progress callback: called once per game added/removed and once for the play order
  const noTick = () => {};

  // the "Add arenas" dialog: wait until the list stops growing, find each game fresh right before ticking it
  // (the filter box finds any it can't see), check the button counts them all, then add
  async function pickArenas(d, names, bankName, tick, where) {
    where = where || `Bank "${bankName}"`;
    const boxes = () => [...d.querySelectorAll('input[type=checkbox]')];
    let last = -1, since = Date.now();
    await T.waitFor(() => { const n = boxes().length; if (n !== last) { last = n; since = Date.now(); } return n > 0 && Date.now() - since > 300; }, 12000, 50);
    if (!boxes().length) { T.click(T.findBtn(d, 'Close')); fail(`${where}: the Add arenas list did not load.`); }
    const filter = [...d.querySelectorAll('input')].find(i => i.type !== 'checkbox' && /filter|search/i.test(i.placeholder || ''));
    const find = nm => boxes().find(b => T.cbFirst(b) === nm);
    for (const nm of names) {
      let b = find(nm);
      if (!b && filter) { T.setVal(filter, nm); b = await T.waitFor(() => find(nm), 4000); }
      if (!b) { T.click(T.findBtn(d, 'Close')); fail(`${where}: couldn't find ${nm} in the Add arenas list.`); }
      if (!b.checked) { b.click(); await T.sleep(80); }
      if (!b.isConnected || !b.checked) { const again = await T.waitFor(() => find(nm), 2000); if (again && !again.checked) { again.click(); await T.sleep(80); } }
      if (filter && filter.value) { T.setVal(filter, ''); await T.waitFor(() => boxes().length > 1, 2000, 40); await T.sleep(80); }
      tick(`adding ${nm}`);
    }
    const btn = await T.waitFor(() => T.findBtn(d, /^Add \d+ arenas?$/), 4000);
    const k = btn ? +T.txt(btn).match(/\d+/)[0] : 0;
    if (k !== names.length) {
      const ticked = names.filter(nm => { const b = find(nm); return b && b.checked; });
      T.click(T.findBtn(d, 'Close'));
      fail(`${where}: ${k} of ${names.length} games got ticked${ticked.length < names.length ? ` (couldn't tick ${names.filter(n => !ticked.includes(n)).join(', ')})` : ''}.`);
    }
    T.click(btn);
    await dialogClosed();
  }

  async function createBank(name, arenaNames, tick = noTick) {
    T.click(await needBtn('Add bank'));
    let d = await needDialog();
    const input = d.querySelector('input') || fail('Bank name box not found.');
    T.setVal(input, name);
    T.click(await needBtn('Save', d));
    await dialogClosed();
    const card = await T.waitFor(() => [...document.querySelectorAll('main div')].filter(T.visible).find(e => {
      const head = e.firstElementChild; return head && T.txt(head) === name && T.findBtn(e, /^Add arenas/);
    }), 8000) || fail(`Bank "${name}" was not created.`);
    tick(`${name} created`);
    T.click(T.findBtn(card, /^Add arenas/));
    d = await needDialog();
    await pickArenas(d, arenaNames, name, tick);
    await reorderBank(name, arenaNames);
    tick(`${name} play order`);
  }

  // ---------- banks: play order = the bank's arena order (Re-order: click a game, then "Move to arena N") ----------
  async function reorderBank(name, arenaNames) {
    let card = await T.waitFor(() => bankCard(name), 8000) || fail(`Bank "${name}" not found.`);
    const listed = () => { const c = bankCard(name); return c ? [...c.querySelectorAll('li')].map(T.txt).filter(t => t && !/^Add arenas/.test(t)) : []; };
    await T.waitFor(() => arenaNames.every(n => listed().includes(n)), 4000, 50);   // the bank shows all its games
    card = bankCard(name) || card;
    if (listed().join('|') === arenaNames.join('|')) return;
    let box = card; for (let k = 0; k < 4 && box && !T.findBtn(box, /^Re-order$/); k++) box = box.parentElement;
    T.click((box && T.findBtn(box, /^Re-order$/)) || fail(`No Re-order button on "${name}".`));
    const d = await needDialog();
    const rows = () => [...d.querySelectorAll('button')].filter(b => /^A\d+/.test(T.txt(b)));
    const order = () => rows().map(b => T.txt(b).replace(/^A\d+\s*/, ''));
    await T.waitFor(() => rows().length >= arenaNames.length, 5000);
    for (let i = 0; i < arenaNames.length; i++) {
      const cur = order();
      if (cur[i] === arenaNames[i]) continue;
      const src = rows().find(b => T.txt(b).replace(/^A\d+\s*/, '') === arenaNames[i]) || fail(`"${arenaNames[i]}" is not in bank "${name}".`);
      src.click();
      const tgt = await T.waitFor(() => rows().find(b => new RegExp('Move to arena ' + (i + 1) + '$').test(T.txt(b))), 3000, 40) || fail('Re-order: no target slot.');
      tgt.click(); await T.waitFor(() => order()[i] === arenaNames[i], 1500, 40);
    }
    if (order().join('|') !== arenaNames.join('|')) { T.click(T.findBtn(d, 'Cancel')); fail(`Bank "${name}": couldn't set the play order.`); }
    T.click(await needBtn('Save', d));
    await dialogClosed();
  }

  // ---------- banks: change an existing bank's games (trash icons remove instantly, no confirm) ----------
  const bankCard = name => [...document.querySelectorAll('main div')].filter(T.visible).find(e => {
    const head = e.firstElementChild; return head && T.txt(head) === name && T.findBtn(e, /^Add arenas/);
  });
  async function setBankArenas(name, arenaNames, tick = noTick) {
    let card = await T.waitFor(() => bankCard(name), 8000);
    if (!card) return createBank(name, arenaNames, tick);
    const want = new Set(arenaNames);
    for (let k = 0; k < 30; k++) {   // remove games that shouldn't be there (re-find after each removal)
      card = bankCard(name);
      const li = [...card.querySelectorAll('li')].find(x => x.querySelector('button') && !/^Add arenas/.test(T.txt(x)) && !want.has(T.txt(x)));
      if (!li) break;
      const gone = T.txt(li), before = [...card.querySelectorAll('li')].length;
      li.querySelector('button').click();
      await T.waitFor(() => { const c = bankCard(name); return c && [...c.querySelectorAll('li')].length < before; }, 4000, 50); await T.sleep(100);
      tick(`removing ${gone}`);
    }
    card = bankCard(name);
    const have = new Set([...card.querySelectorAll('li')].map(T.txt));
    const missing = arenaNames.filter(n => !have.has(n));
    if (missing.length) {
      T.click(T.findBtn(card, /^Add arenas/));
      const d = await needDialog();
      await pickArenas(d, missing, name, tick);
    }
    await reorderBank(name, arenaNames);   // play order = the order given
    tick(`${name} play order`);
  }

  // ---------- Arenas tab: add existing arenas to this tournament (Add… -> Existing arenas) ----------
  async function addArenas(names, tick = noTick) {
    T.click(await needBtn(/^Add(…|\.\.\.)$/));
    const d = await needDialog();
    const tab = T.findBtn(d, /^Existing arenas$/); if (tab) T.click(tab);
    await pickArenas(d, names, '', tick, 'This tournament');
  }

  // ---------- a round's own Actions menu (Matches tab): Clear all arenas / Assign arenas (category) ----------
  function roundActions(name) {
    const isActions = b => T.txt(b) === 'Actions' && !b.closest('table') && !b.closest('[data-tdp]');
    const heads = [...document.querySelectorAll('main h2, main h3, main div, main span')].filter(e => e.children.length <= 2 && name && T.txt(e).startsWith(name) && T.txt(e).length < name.length + 20 && T.visible(e));
    for (const h of heads) { let c = h; for (let k = 0; k < 6 && c; k++, c = c.parentElement) { const b = [...c.querySelectorAll('button')].find(isActions); if (b) return b; } }
    return [...document.querySelectorAll('main button')].find(isActions) || null;
  }
  async function roundMenu(name, item) {
    const b = await T.waitFor(() => roundActions(name), 8000) || fail(`No Actions menu for ${name || 'the round'}.`);
    T.click(b);
    T.click(await needBtn(item));
    return needDialog();
  }
  async function roundArenas(name, value, clear, tick = noTick) {
    if (clear) {
      tick('Clearing the arenas (games in progress)');
      const d = await roundMenu(name, /^Clear all arenas$/);
      const box = await T.waitFor(() => d.querySelector('input'), 4000) || fail('No confirm box in Clear all arenas.');
      T.setVal(box, 'clear arenas'); await T.sleep(200);
      T.click(await needBtn(/^Remove arena assignments$/, d)); await dialogClosed(15000);
    }
    tick('Assigning arenas');
    const d = await roundMenu(name, /^Assign arenas$/);
    const sel = await T.waitFor(() => d.querySelector('select'), 4000) || fail('No arena choice in Assign arenas.');
    if (![...sel.options].some(o => o.value === value)) { T.click(T.findBtn(d, 'Cancel')); fail(`"${value}" isn't a choice in Assign arenas.`); }
    T.setVal(sel, value); await T.sleep(200);
    T.click(await needBtn(/^Assign arenas$/, d)); await dialogClosed(20000);
  }

  // ---------- quick test tournament: N existing players (random), N existing arenas (by era or random) ----------
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  async function listLoaded(d) {
    const boxes = () => [...d.querySelectorAll('input[type=checkbox]')];
    let last = -1, since = Date.now();
    // wait for rows (an empty list that hasn't loaded yet isn't "empty"), then for the list to stop growing
    await T.waitFor(() => { const n = boxes().length; if (n !== last) { last = n; since = Date.now(); } return n > 0 && Date.now() - since > 500; }, 12000, 50);
    return boxes();
  }
  // returns how many were added from the list; the rest (if any) go in by name on the Batch tab
  async function addTestPlayers(n, tick = noTick) {
    T.click(await needBtn(/^Add players$/, document.querySelector('main')));
    let d = await needDialog();
    const tab = T.findBtn(d, /^Existing players/); if (tab) T.click(tab);
    const boxes = (await listLoaded(d)).filter(b => !b.disabled && !b.checked);
    const names = boxes.map(b => T.cbFirst(b));
    const pick = shuffle(boxes).slice(0, n);
    for (const b of pick) { b.click(); await T.sleep(25); }
    let added = 0;
    if (pick.length) {
      const btn = await T.waitFor(() => T.findBtn(d, /^Add \d+ players?$/), 4000) || fail('No "Add players" button in the list.');
      added = +T.txt(btn).match(/\d+/)[0];
      T.click(btn); await dialogClosed(15000); tick(`${added} existing players added`);
    } else { T.click(T.findBtn(d, 'Close')); await dialogClosed(); }
    const short = n - added;
    if (short > 0) {
      // "Test Player N": numbered after the ones you already have, so they're reused next time
      const top = Math.max(0, ...names.map(x => +((x.match(/^Test Player (\d+)$/) || [])[1] || 0)));
      T.click(await needBtn(/^Add players$/, document.querySelector('main')));
      d = await needDialog();
      T.click(await needBtn(/^Batch$/, d));
      const ta = await T.waitFor(() => d.querySelector('textarea'), 4000) || fail('No Batch box in Add players.');
      T.setVal(ta, Array.from({ length: short }, (_, i) => `Test Player ${top + i + 1}`).join('\n'));
      await T.sleep(200);
      T.click(await needBtn(/^Add players$/, d)); await dialogClosed(20000); tick(`${short} test players added by name`);
    }
    return { added, created: Math.max(0, short) };
  }
  async function addTestArenas(n, mix, tick = noTick) {
    T.click(await needBtn(/^Add arenas$/, document.querySelector('main')));
    const d = await needDialog();
    const tab = T.findBtn(d, /^Existing arenas$/); if (tab) T.click(tab);
    const rows = (await listLoaded(d)).filter(b => !b.disabled && !b.checked).map(b => { const name = T.cbFirst(b), m = T.cbLabel(b).slice(name.length).match(/\b(EM|SS|DMD)\b/); return { name, era: m ? m[1] : 'Other' }; });
    let names;
    if (mix === 'random') names = shuffle(rows).slice(0, n).map(r => r.name);
    else {   // by era: take turns EM, SS, DMD (random within each)
      const by = {}; shuffle(rows).forEach(r => (by[r.era] = by[r.era] || []).push(r));
      const eras = ['EM', 'SS', 'DMD', 'Other'].filter(e => by[e]); names = [];
      while (names.length < n && eras.some(e => by[e].length)) for (const e of eras) { if (names.length >= n) break; const r = by[e].shift(); if (r) names.push(r.name); }
    }
    if (!names.length) { T.click(T.findBtn(d, 'Close')); fail('No arenas in your Existing arenas list.'); }
    await pickArenas(d, names, '', tick, 'This tournament');
    return names.length;
  }

  // ---------- Matches tab: enter one game's finishing order (test tournaments: random results) ----------
  // Finds the game's "Results" / "Enter results" button: the one in the box holding all its players, nearest the
  // column (or card) headed by its arena. In the dialog, tapping names in order sets 1st, 2nd…; Matchplay fills last.
  async function enterResults(names, arena, order) {
    const all = () => [...document.querySelectorAll('main button, main a')].filter(T.visible).filter(b => /^(enter results|results)$/i.test(T.txt(b)));
    const holder = b => { let c = b; while (c && c.tagName !== 'MAIN') { const t = T.txt(c); if (names.every(n => t.includes(n))) return c; c = c.parentElement; } return null; };
    const pick = () => {
      const cands = all().map(b => ({ b, box: holder(b) })).filter(x => x.box);
      if (!cands.length) return null;
      const size = x => T.txt(x.box).length; cands.sort((x, y) => size(x) - size(y));
      const smallest = cands.filter(x => x.box === cands[0].box);
      if (smallest.length === 1) return smallest[0].b;
      const head = [...smallest[0].box.querySelectorAll('th, h3, h4, div, span, a')].find(e => e.children.length <= 1 && T.txt(e) === arena);
      if (!head) return null;
      const hx = head.getBoundingClientRect(), cx = hx.left + hx.width / 2;
      return smallest.map(x => ({ b: x.b, d: Math.abs(x.b.getBoundingClientRect().left + x.b.getBoundingClientRect().width / 2 - cx) })).sort((x, y) => x.d - y.d)[0].b;
    };
    const btn = await T.waitFor(pick, 8000) || fail(`No results button for ${arena} (${names.join(', ')}).`);
    T.click(btn);
    const d = await needDialog();
    const nameEl = n => [...d.querySelectorAll('div, span, td')].find(e => e.children.length === 0 && T.txt(e) === n && T.visible(e));
    for (const n of order.slice(0, Math.max(1, order.length - 1))) {
      const el = await T.waitFor(() => nameEl(n), 3000) || (T.click(T.findBtn(d, 'Cancel')), fail(`${n} isn't in the results window for ${arena}.`));
      T.click(el); await T.sleep(100);
    }
    T.click(await needBtn('Save', d));
    await dialogClosed();
  }

  // ---------- Matches tab: group Actions -> Assign bank -> tick one bank -> Update arenas ----------
  // the group's heading cell ("Group 2" / "Group 2 - Bank 4"); our own Assign bank button inside it doesn't count
  const ownTxt = e => [...e.childNodes].filter(n => !(n.dataset && n.dataset.tdp)).map(n => n.textContent).join('').replace(/\s+/g, ' ').trim();
  const isGroupHead = (e, no) => [...e.children].every(c => c.dataset && c.dataset.tdp) && new RegExp('^Group ' + no + '(\\s|$|-)').test(ownTxt(e)) && T.visible(e);
  const groupHead = no => [...document.querySelectorAll('main th, main td, main div, main span')].find(e => isGroupHead(e, no));
  // group Actions -> Assign bank: leaves Matchplay's dialog open (the TD picks the bank) or returns it
  async function openAssign(groupNo) {
    const head = await T.waitFor(() => groupHead(groupNo), 8000) || fail(`Group ${groupNo} not found on the Matches tab.`);
    const box = head.closest('table') || head.parentElement;
    let scope = box; while (scope && ![...scope.querySelectorAll('button')].some(b => T.txt(b) === 'Actions')) scope = scope.parentElement;
    const btn = scope && [...scope.querySelectorAll('button')].find(b => T.txt(b) === 'Actions') || fail(`Group ${groupNo} has no Actions menu (round finished?).`);
    T.click(btn);
    T.click(await needBtn('Assign bank'));
    return needDialog();
  }
  // group Actions -> Change player order: click a player, then "Move to player N" (Save)
  async function setPlayerOrder(groupNo, names) {
    const head = await T.waitFor(() => groupHead(groupNo), 8000) || fail(`Group ${groupNo} not found on the Matches tab.`);
    let scope = head.closest('table') || head.parentElement; while (scope && ![...scope.querySelectorAll('button')].some(b => T.txt(b) === 'Actions')) scope = scope.parentElement;
    const btn = scope && [...scope.querySelectorAll('button')].find(b => T.txt(b) === 'Actions') || fail(`Group ${groupNo} has no Actions menu.`);
    T.click(btn);
    T.click(await needBtn(/^Change player order$/));
    const d = await needDialog();
    const rows = () => [...d.querySelectorAll('li button')];
    const nameOf = b => { const t = (b.innerText || '').split('\n').map(x => x.trim()).filter(Boolean); return t.find(x => !/^P\d+$/.test(x) && !/^Seed:/.test(x) && !/^Move to player/.test(x)) || ''; };
    await T.waitFor(() => rows().length >= names.length, 5000);
    for (let i = 0; i < names.length; i++) {
      if (nameOf(rows()[i]) === names[i]) continue;
      const src = rows().find(b => nameOf(b) === names[i]) || (T.click(T.findBtn(d, 'Cancel')), fail(`${names[i]} isn't in Group ${groupNo}.`));
      src.click();
      const tgt = await T.waitFor(() => rows().find(b => new RegExp('Move to player ' + (i + 1) + '$').test(T.txt(b))), 3000, 40) || (T.click(T.findBtn(d, 'Cancel')), fail('Change player order: no target position.'));
      tgt.click(); await T.waitFor(() => nameOf(rows()[i]) === names[i], 1500, 40);
    }
    if (rows().map(nameOf).slice(0, names.length).join('|') !== names.join('|')) { T.click(T.findBtn(d, 'Cancel')); fail(`Group ${groupNo}: couldn't set the player order.`); }
    T.click(await needBtn(/^Save$/, d)); await dialogClosed();
  }
  async function assignBank(groupNo, bankName) {
    const d = await openAssign(groupNo);
    const boxes = await T.waitFor(() => { const b = [...d.querySelectorAll('input[type=checkbox]')]; return b.length ? b : null; }, 8000) || fail('Bank list did not load.');
    let hit = false;
    for (const b of boxes) { const on = T.cbFirst(b) === bankName; if (on) hit = true; if (b.checked !== on) { b.click(); await T.sleep(30); } }
    if (!hit) { T.click(T.findBtn(d, 'Cancel')); fail(`Bank "${bankName}" is not in Matchplay.`); }
    T.click(await needBtn('Update arenas', d));
    await dialogClosed();
  }

  // ---------- Overview: More… -> Delete tournament -> Matchplay's confirm ----------
  // Matchplay's window: title "Delete tournament", "Are you sure…", red button "Delete tournament permanently"
  // (it only allows test tournaments; otherwise it shows "Not a test tournament").
  // dryRun: open the window, check the button is there, then Cancel (nothing deleted).
  async function deleteTournament(name, opts = {}) {
    const note = opts.note || (async () => {});
    await note('Opening More…');
    T.click(T.findBtn(document.querySelector('main') || document, /^More/) || fail('No More… menu on the Overview.'));
    await note('Clicking Delete tournament');
    T.click(await needBtn(/^Delete tournament$/));
    await note("Waiting for Matchplay's delete window");
    const d = await needDialog();
    const cancel = () => { const c = T.findBtn(d, /^(Cancel|Close|OK|Okay)$/); if (c) T.click(c); };
    if (/Not a test tournament/i.test(T.txt(d))) { cancel(); fail('Matchplay says it is not a test tournament'); }
    const input = d.querySelector('input[type=text], input:not([type])');
    if (input) {   // (in case Matchplay ever asks to type the name / DELETE)
      const m = T.txt(d).match(/type\s+["“']?([^"”'\s]+)["”']?/i);
      T.setVal(input, T.txt(d).includes(name) ? name : m ? m[1] : 'DELETE');
    }
    const ok = await T.waitFor(() => [...d.querySelectorAll('button')].find(b => T.visible(b) && !b.disabled && /^(delete tournament permanently|delete( tournament)?|yes,? delete( it)?|confirm)$/i.test(T.txt(b))), 4000);
    if (!ok) { cancel(); fail("Couldn't find Matchplay's \"Delete tournament permanently\" button."); }
    if (opts.dryRun) { cancel(); await dialogClosed(5000); return T.txt(ok); }
    await note('Clicking Delete tournament permanently');
    T.click(ok);
    await note('Waiting for Matchplay to delete it');
    // wait for Matchplay's "Tournament deleted" (or an error in the window)
    const res = await T.waitFor(() => {
      if ([...document.querySelectorAll('body *')].some(e => e.children.length === 0 && /^Tournament deleted$/i.test(T.txt(e)))) return 'ok';
      if (!d.isConnected || !T.visible(d)) return 'closed';
      const err = /error|went wrong|not allowed|cannot/i.test(T.txt(d)) && !/Are you sure/i.test(T.txt(d)); return err ? 'err' : null;
    }, 20000, 100);
    if (res === 'err') { const msg = T.txt(d).slice(0, 160); cancel(); fail('Matchplay: ' + msg); }
    if (!res) { cancel(); fail('Matchplay did not finish deleting (no "Tournament deleted").'); }
    await dialogClosed(5000);
  }

  // ---------- one game's arena (e.g. Matchplay's tiebreaker game, "No arena"): Assign arena, or Details -> Change arena ----------
  // the game = the smallest card holding all its players' names (smaller than the group's table)
  function gameCard(names) {
    const has = el => { const t = T.txt(el); return names.every(n => t.includes(n)); };
    const cands = [...document.querySelectorAll('main a, main button')].filter(b => T.visible(b) && !b.closest('[data-tdp]') && /^(Assign arena|View details|Details|Enter results|Results)$/i.test(T.txt(b)))
      .map(b => { let c = b; while (c && c.tagName !== 'MAIN' && !has(c)) c = c.parentElement; return c && c.tagName !== 'MAIN' ? c : null; }).filter(Boolean);
    cands.sort((a, b) => T.txt(a).length - T.txt(b).length);
    return cands[0] || null;
  }
  // one game by its id (Matches tab): the "Arena" button in its cell, or Details -> Change arena; arena chosen by id
  async function setArenaById(gameId, arenaId, arenaName) {
    const link = await T.waitFor(() => document.querySelector(`main a[href$="/matches/${gameId}"]`), 8000) || fail(`Game ${gameId} not found on the Matches tab.`);
    const cell = link.closest('td') || link.parentElement;
    const btn = [...cell.querySelectorAll('button')].find(b => /^(Arena|Assign arena)$/.test(T.txt(b)) && !b.closest('[data-tdp]'));
    if (btn) T.click(btn);
    else { link.click(); T.click(await needBtn(/^Change arena$/)); }
    const d = await needDialog();
    const sel = await T.waitFor(() => d.querySelector('select'), 4000) || fail('Arena list not found.');
    const opt = [...sel.options].find(o => o.value === String(arenaId)) || [...sel.options].find(o => T.txt(o) === arenaName) || (T.click(T.findBtn(d, 'Cancel')), fail(`Arena "${arenaName}" is not in this tournament.`));
    T.setVal(sel, opt.value);
    T.click(await needBtn('Save', d));
    await dialogClosed();
    if (/\/matches\/\d+/.test(location.pathname)) { history.back(); await T.sleep(400); }
  }
  async function setGameArena(names, arena) {
    const card = await T.waitFor(() => gameCard(names), 8000) || fail(`Game for ${names.join(', ')} not found on the Matches tab.`);
    const assign = T.findBtn(card, /^Assign arena$/);
    if (assign) T.click(assign);
    else {
      T.click(T.findBtn(card, /^(View details|Details)$/) || fail('No details link for that game.'));
      T.click(await needBtn(/^Change arena$/));
    }
    const d = await needDialog();
    const sel = await T.waitFor(() => d.querySelector('select'), 4000) || fail('Arena list not found.');
    const opt = [...sel.options].find(o => T.txt(o) === arena) || (T.click(T.findBtn(d, 'Cancel')), fail(`Arena "${arena}" is not in this tournament.`));
    T.setVal(sel, opt.value);
    T.click(await needBtn('Save', d));
    await dialogClosed();
    // back from the game's details (if we opened them)
    if (/\/matches\/\d+/.test(location.pathname)) { history.back(); await T.sleep(400); }
  }

  // ---------- Resolve ties page: open the "Positions from-to" tie, put players in this order, Save ----------
  async function resolveTie(from, namesInOrder) {
    const isHead = e => e.children.length === 0 && new RegExp('^Positions\\s+' + from + '\\s*[-–]\\s*\\d+$').test(T.txt(e));
    const h = await T.waitFor(() => [...document.querySelectorAll('main *')].find(e => isHead(e) && T.visible(e)), 10000) || fail(`Tie at position ${from} not found under Unresolved ties.`);
    let card = h; while (card.parentElement && !T.findBtn(card, /^Resolve$/)) card = card.parentElement;
    T.click(T.findBtn(card, /^Resolve$/) || fail('No Resolve button for that tie.'));
    const d = await needDialog();
    const rows = () => [...d.querySelectorAll('button')].filter(b => /^#\d+\s/.test(T.txt(b)));
    const nm = b => T.txt(b).replace(/^#\d+\s+/, '');
    await T.waitFor(() => rows().length, 5000) || fail('Resolve window did not list the players.');
    for (let i = 0; i < namesInOrder.length; i++) {
      const cur = rows(); if (!cur[i]) break;
      if (nm(cur[i]) === namesInOrder[i]) continue;
      const src = cur.find(b => nm(b) === namesInOrder[i]) || fail(`${namesInOrder[i]} is not in this tie.`);
      src.click(); await T.sleep(400);
      rows()[i].click(); await T.sleep(500);   // the picked player drops out of the list, so slot i is still index i
    }
    const got = rows().map(nm);
    if (got.join('|') !== namesInOrder.join('|')) fail('Could not put the players in order (got: ' + got.join(', ') + ').');
    T.click(await needBtn('Save', d));
    await dialogClosed();
  }

  return { deleteTournament, setPlayerOrder, roundArenas, addTestPlayers, addTestArenas, setArenaById, setGameArena, gameCard, openAssign, groupHead, goTab, menu, playerRows, selectPlayers, setLabels, bulk, setActive, readIfpaRanks, addFromQualifying, setSeeds, closeRound, startNextRound, publishRound, createBank, setBankArenas, reorderBank, assignBank, enterResults, addArenas, resolveTie, needBtn, needDialog, dialogClosed };
})();
