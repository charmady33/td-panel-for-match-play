// 0.15.2: Quick test setup box on Create new tournament (+ pending task), and the "extension was updated" bar.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('https://api.matchplay.events/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"data":[]}' }));
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main style="padding:24px 40px"><h1>Create new tournament</h1><form onsubmit="return false">
    <div class="sm:grid sm:grid-cols-3"><label>Tournament name</label><input name="name"></div>
    <div class="sm:grid sm:grid-cols-3"><label>Test tournament</label><div><div><label><input type="radio" name="test" value="real"> Regular tournament</label></div><div><label><input type="radio" name="test" value="test"> Test tournament</label></div></div></div>
    <button type="submit">Create tournament</button></form></main></body></html>`;
  await page.route('https://app.matchplay.events/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/new');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(1500);
  console.log('box before Test picked:', await page.evaluate(() => !!document.getElementById('tdp-quicktest')));
  await page.click('input[value=test]'); await page.waitForTimeout(800);
  console.log('box after:', await page.evaluate(() => { const h = document.getElementById('tdp-quicktest'); return h ? h.shadowRoot.textContent.replace(/\s+/g, ' ').slice(0, 160) : 'none'; }));
  await page.evaluate(() => { const i = document.getElementById('tdp-quicktest').shadowRoot.querySelector('[data-f=players]'); i.value = '20'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.click('button[type=submit]'); await page.waitForTimeout(300);
  console.log('pending:', await page.evaluate(() => localStorage.getItem('tdp:quicktest:pending')));
  await page.screenshot({ path: out + '/quicktest.png' });
  // the extension "updated": the old copy shows the reload bar and lifts any cover
  await page.evaluate(() => { TDP.busy.still(true); TDP.hasChrome = true; window.chrome = { runtime: {} }; });
  await page.waitForTimeout(3500);
  console.log('dead bar:', await page.evaluate(() => (document.getElementById('tdp-dead') || {}).innerText), '| cover left:', await page.evaluate(() => !!document.getElementById('tdp-cover')));
  console.log('errors', errors);
  await browser.close();
})();
