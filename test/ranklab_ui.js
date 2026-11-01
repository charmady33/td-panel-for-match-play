// 0.24.2: mpui.rankLabels when Matchplay swaps in a NEW window for the "Set player labels" step (the real behaviour)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://app.matchplay.events/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body><main><button id="act">Actions</button><table><tr><td><input type=checkbox><a href="/players/1">Ann</a></td></tr></table></main></body></html>' }));
  await page.route('https://api.matchplay.events/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"data":[]}' }));
  await page.goto('https://app.matchplay.events/organized');
  await page.evaluate(() => {
    window.__done = null;
    document.getElementById('act').onclick = () => { const m = document.createElement('div'); m.setAttribute('role', 'menu'); m.innerHTML = '<button>Set rank labels</button><button>Copy names</button>'; document.body.appendChild(m);
      m.querySelector('button').onclick = () => { m.remove(); const d = document.createElement('div'); d.setAttribute('role', 'dialog'); d.innerHTML = '<button>IFPA</button><input type="text" placeholder="E.g. 0"><input type="text" placeholder="E.g. 1000"><label><input type="checkbox">Refresh IFPA data</label><label><input type="checkbox">Only update players without labels</label><button id="cont">Continue</button><button>Cancel</button>'; document.body.appendChild(d);
        d.querySelector('#cont').onclick = () => { const f = d.querySelectorAll('input[type=text]')[0].value, t = d.querySelectorAll('input[type=text]')[1].value, ref = d.querySelectorAll('input[type=checkbox]')[0].checked; d.querySelector('#cont').disabled = true;
          setTimeout(() => { d.remove(); const d2 = document.createElement('div'); d2.setAttribute('role', 'dialog'); d2.innerHTML = '<div>Set player labels</div><input type="text" placeholder="Enter label…"><div role="radio">rose</div><div role="radio">orange</div><button id="up">Update 10 players</button><button>Cancel</button>'; document.body.appendChild(d2);
            d2.querySelector('#up').onclick = () => { window.__done = { f, t, ref, label: d2.querySelector('input').value }; d2.remove(); }; }, ref ? 2500 : 300); }; }; };
  });
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(800);
  await page.evaluate(() => { TDP.mp.waitPlayersOverride = true; });
  const res = await page.evaluate(async () => { try { const n = await TDP.mp.rankLabels({ from: 1, to: 1000, label: 'B/C Ineligible', color: 'rose', only: false, refresh: true }); return n + ' ' + JSON.stringify(window.__done); } catch (e) { return 'ERR ' + e.message; } });
  console.log('rankLabels:', res);
  console.log('errors', errors); await browser.close();
})();
