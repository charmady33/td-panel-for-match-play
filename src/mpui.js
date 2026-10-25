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
  async function dialogClosed(timeout = 8000) { await T.waitFor(() => !T.dialog(), timeout); await T.sleep(400); }
  async function menu(trigger, item, root) {
    T.click(await needBtn(trigger, root));
    await T.sleep(350);
    T.click(await needBtn(item));
    await T.sleep(500);
  }
  // click a Matchplay tab link (keeps the SPA, so dialogs that need the tournament loaded work)
  async function goTab(tid, page) {
    const href = `/tournaments/${tid}${page && page !== 'overview' ? '/' + page : ''}`;
    if (location.pathname === href) return;
    const a = [...document.querySelectorAll(`a[href$="${href}"]`)].find(T.visible);
    if (a) { a.click(); await T.waitFor(() => location.pathname === href, 6000); await T.sleep(900); }
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
    for (let k = 0; k < 200; k++) { const r = playerRows().find(x => x.cb && x.cb.checked); if (!r) return; r.cb.click(); await T.sleep(120); }
  }
  async function selectPlayers(ids) {
    await waitPlayers(); await clearSelection();
    const want = new Set(ids.map(Number));
    for (let k = 0; k < ids.length * 4 + 10; k++) {
      const r = playerRows().find(x => want.has(x.id) && x.cb && !x.cb.checked);
      if (!r) break;
      r.cb.click(); await T.sleep(150);
    }
    const n = playerRows().filter(x => want.has(x.id) && x.cb && x.cb.checked).length;
    if (n !== want.size) fail(`Only selected ${n} of ${want.size} players in the list.`);
    await T.sleep(300);
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
    await T.sleep(1500);
    await clearSelection();
  }
  async function setActive(id, active) {
    await waitPlayers();
    const r = playerRows().find(x => x.id === Number(id)) || fail('Player not in this tournament.');
    const b = [...r.tr.querySelectorAll('button')].find(x => T.txt(x) === (active ? 'Activate' : 'Deactivate'));
    if (b) { b.click(); await T.sleep(1200); }
  }
  // Matchplay's own IFPA Rankings table (Players tab -> "IFPA rankings"): name -> rank
  async function readIfpaRanks() {
    await waitPlayers();
    T.click(await needBtn('IFPA rankings'));
    await needDialog();
    const d = await T.waitFor(() => { const x = T.dialog(); return x && x.querySelectorAll('tr td').length ? x : null; }, 10000) || fail('IFPA Rankings list did not load.');
    await T.sleep(500);
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
    await T.sleep(800);
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
    await T.sleep(300);
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
      from.el.click(); await T.sleep(350);
      list()[i].el.click(); await T.sleep(450);
    }
    T.click(await needBtn('Save changes'));
    await T.sleep(1500);
  }

  // ---------- rounds (Matches tab) ----------
  async function closeRound() { T.click(await needBtn(/Close round$/)); await T.sleep(2000); }
  async function startNextRound() {
    const b = T.findBtn(document, /^Start next round$/); if (!b) return false;
    T.click(b);
    const d = await needDialog();
    T.click(await needBtn('Start round', d));
    await dialogClosed(15000);
    return true;
  }

  // ---------- banks (Banks tab) ----------
  async function createBank(name, arenaNames) {
    T.click(await needBtn('Add bank'));
    let d = await needDialog();
    const input = d.querySelector('input') || fail('Bank name box not found.');
    T.setVal(input, name);
    T.click(await needBtn('Save', d));
    await dialogClosed();
    const card = await T.waitFor(() => [...document.querySelectorAll('main div')].filter(T.visible).find(e => {
      const head = e.firstElementChild; return head && T.txt(head) === name && T.findBtn(e, /^Add arenas/);
    }), 8000) || fail(`Bank "${name}" was not created.`);
    T.click(T.findBtn(card, /^Add arenas/));
    d = await needDialog();
    const want = new Set(arenaNames); let hit = 0;
    const boxes = await T.waitFor(() => { const b = [...d.querySelectorAll('input[type=checkbox]')]; return b.length ? b : null; }, 8000) || fail('Arena list did not load.');
    for (const b of boxes) { const nm = TDP.cbFirst(b); if (want.has(nm) && !b.checked) { b.click(); hit++; await T.sleep(20); } }
    if (hit !== want.size) { T.click(T.findBtn(d, 'Close')); fail(`Bank "${name}": only matched ${hit} of ${want.size} arenas.`); }
    T.click(await needBtn(/^Add \d+ arenas?$/, d));
    await dialogClosed();
  }

  // ---------- banks: change an existing bank's games (trash icons remove instantly, no confirm) ----------
  const bankCard = name => [...document.querySelectorAll('main div')].filter(T.visible).find(e => {
    const head = e.firstElementChild; return head && T.txt(head) === name && T.findBtn(e, /^Add arenas/);
  });
  async function setBankArenas(name, arenaNames) {
    let card = await T.waitFor(() => bankCard(name), 8000);
    if (!card) return createBank(name, arenaNames);
    const want = new Set(arenaNames);
    for (let k = 0; k < 30; k++) {   // remove games that shouldn't be there (re-find after each removal)
      card = bankCard(name);
      const li = [...card.querySelectorAll('li')].find(x => x.querySelector('button') && !/^Add arenas/.test(T.txt(x)) && !want.has(T.txt(x)));
      if (!li) break;
      li.querySelector('button').click(); await T.sleep(900);
    }
    card = bankCard(name);
    const have = new Set([...card.querySelectorAll('li')].map(T.txt));
    const missing = arenaNames.filter(n => !have.has(n));
    if (missing.length) {
      T.click(T.findBtn(card, /^Add arenas/));
      const d = await needDialog();
      const boxes = await T.waitFor(() => { const b = [...d.querySelectorAll('input[type=checkbox]')]; return b.length ? b : null; }, 8000) || fail('Arena list did not load.');
      let hit = 0;
      for (const b of boxes) if (missing.includes(T.cbFirst(b)) && !b.checked) { b.click(); hit++; await T.sleep(20); }
      if (hit !== missing.length) { T.click(T.findBtn(d, 'Close')); fail(`Bank "${name}": only matched ${hit} of ${missing.length} new arenas.`); }
      T.click(await needBtn(/^Add \d+ arenas?$/, d));
      await dialogClosed();
    }
    // play order = the order given (Re-order modal is click-to-move like seeds; skipped when already right)
  }

  // ---------- Matches tab: group Actions -> Assign bank -> tick one bank -> Update arenas ----------
  async function assignBank(groupNo, bankName) {
    const head = await T.waitFor(() => [...document.querySelectorAll('main th, main td, main div, main span')].find(e => e.children.length === 0 && new RegExp('^Group ' + groupNo + '(\\s|$|-)').test(T.txt(e)) && T.visible(e)), 8000) || fail(`Group ${groupNo} not found on the Matches tab.`);
    const box = head.closest('table') || head.parentElement;
    let scope = box; while (scope && ![...scope.querySelectorAll('button')].some(b => T.txt(b) === 'Actions')) scope = scope.parentElement;
    const btn = scope && [...scope.querySelectorAll('button')].find(b => T.txt(b) === 'Actions') || fail(`Group ${groupNo} has no Actions menu (round finished?).`);
    T.click(btn); await T.sleep(400);
    T.click(await needBtn('Assign bank'));
    const d = await needDialog();
    const boxes = await T.waitFor(() => { const b = [...d.querySelectorAll('input[type=checkbox]')]; return b.length ? b : null; }, 8000) || fail('Bank list did not load.');
    let hit = false;
    for (const b of boxes) { const on = T.cbFirst(b) === bankName; if (on) hit = true; if (b.checked !== on) { b.click(); await T.sleep(30); } }
    if (!hit) { T.click(T.findBtn(d, 'Cancel')); fail(`Bank "${bankName}" is not in Matchplay.`); }
    T.click(await needBtn('Update arenas', d));
    await dialogClosed();
  }

  return { goTab, menu, playerRows, selectPlayers, setLabels, bulk, setActive, readIfpaRanks, addFromQualifying, setSeeds, closeRound, startNextRound, createBank, setBankArenas, assignBank, needBtn, needDialog, dialogClosed };
})();
