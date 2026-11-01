// mpui.setCutoffs against a mock of Matchplay's Manage cutoffs window, starting EMPTY ("Add cutoff", then
// "Add another cutoff") - the 0.22.0 bug - and with existing lines (one extra removed).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://app.matchplay.events/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><main><button id="mc">Manage cutoffs</button></main></body></html>' }));
  await page.route('https://api.matchplay.events/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"data":[]}' }));
  await page.goto('https://app.matchplay.events/organized');
  await page.evaluate(() => {
    window.__saved = null;
    document.getElementById('mc').onclick = () => {
      let lines = (window.__start || []).slice();
      const d = document.createElement('div'); d.setAttribute('role', 'dialog'); document.body.appendChild(d);
      const draw = () => {
        d.innerHTML = lines.map((l, i) => `<div><div>Cutoff ${i + 1}<button data-rm="${i}">Remove</button></div><label>Players above cutoff</label><div class="mt-1"><div class="flex"><button>-</button><div><input type="text" value="${l.above}"></div><button>+</button></div></div><input type="text" value="${l.text}"><button>red</button><button>green</button></div>`).join('') + `<button id="add">${lines.length ? 'Add another cutoff' : 'Add cutoff'}</button><button id="up">Update</button><button>Cancel</button>`;
        d.querySelectorAll('input').forEach((inp, k) => inp.addEventListener('input', () => { const i = Math.floor(k / 2); lines[i][k % 2 ? 'text' : 'above'] = inp.value; }));
        d.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { lines.splice(+b.dataset.rm, 1); draw(); });
        d.querySelector('#add').onclick = () => { lines.push({ above: 4, text: 'FINALS CUTOFF' }); draw(); };
        d.querySelector('#up').onclick = () => { window.__saved = JSON.parse(JSON.stringify(lines)); d.remove(); };
      };
      draw();
    };
  });
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(1000);
  for (const [name, start] of [['empty', []], ['3 lines -> 2', [{ above: 8, text: 'A' }, { above: 8, text: 'B' }, { above: 8, text: 'C' }]]]) {
    const res = await page.evaluate(async st => { window.__start = st; try { await TDP.mp.setCutoffs([{ above: 8, text: 'A FINALS CUTOFF' }, { above: 6, text: 'B FINALS CUTOFF' }]); return JSON.stringify(window.__saved); } catch (e) { return 'ERR ' + e.message; } }, start);
    console.log(name + ':', res);
  }
  console.log('errors', errors); await browser.close();
})();
