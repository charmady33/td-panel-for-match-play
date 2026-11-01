// 0.23.2: switching tabs of the same event - the linked-events row (and other parts) never missing in a painted frame
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const F = require('./fixtures');
const order = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'))).content_scripts.find(c => c.js.includes('src/main.js')).js;
const bundle = order.map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
const q = F.qual; q.status = 'started';
const TAB = 'whitespace-nowrap border-b-2 border-solid px-1 pb-1 text-sm font-medium inline-block';
(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (/warn|error/.test(m.type())) errors.push(m.text()); });
  await page.route('https://api.matchplay.events/**', async route => { const u = new URL(route.request().url()), p = u.pathname, json = d => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(d) });
    await new Promise(r => setTimeout(r, 700));
    if (p === '/api/users/profile') return json({ data: F.me }); let m;
    if ((m = p.match(/^\/api\/tournaments\/(\d+)$/))) return json({ data: { 280051: q, 280073: F.finalsA, 280074: F.finalsB }[m[1]] });
    if (p.match(/\/standings$/)) return json(F.standings); if (p.match(/\/rounds$/)) return json({ data: F.rounds }); if (p.match(/\/games$/)) return json({ data: F.games, meta: { last_page: 1 } }); return json({ data: [] }); });
  const HTML = `<!doctype html><html><head><meta charset=utf-8></head><body><main id="m"></main><script>
    const nav = cur => '<div class="border-b pt-4"><nav class="-mb-px">' + ['', '/players', '/arenas'].map(p => '<a class="${TAB}" href="/tournaments/280051' + p + '">' + (p || 'Overview') + '</a>').join('') + '</nav></div>';
    function draw() { document.getElementById('m').innerHTML = ''; setTimeout(() => { document.getElementById('m').innerHTML = '<a href="/tournaments/280051/edit">Edit</a><h1>test</h1>' + nav() + '<div>' + location.pathname + '<table><tr><td>x</td></tr></table></div>'; }, 40); }
    addEventListener('popstate', draw); draw();
  </script></body></html>`;
  await page.route('https://app.matchplay.events/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto('https://app.matchplay.events/tournaments/280051');
  await page.evaluate(() => localStorage.setItem('tdp:settings', JSON.stringify({ token: 't' })));
  await page.addScriptTag({ content: bundle }); await page.waitForTimeout(8000);
  console.log('links at start:', await page.evaluate(() => !!document.getElementById('tdp-links')));
  for (const p of ['/players', '/arenas', '']) {
    const r = await page.evaluate(async p => {
      const t0 = performance.now(); let frames = 0, missing = 0, navFrames = 0;
      history.pushState(null, '', '/tournaments/280051' + p); dispatchEvent(new PopStateEvent('popstate'));
      await new Promise(res => { const f = () => { if (performance.now() - t0 > 3000) return res(); const nav = document.querySelector('main nav'); if (nav) { navFrames++; if (!document.getElementById('tdp-links')) missing++; } frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
      return `${missing} of ${navFrames} painted frames without the links row`;
    }, p);
    console.log(p || '/', '->', r);
  }
  console.log('errors', errors.slice(0, 5)); await browser.close();
})();
