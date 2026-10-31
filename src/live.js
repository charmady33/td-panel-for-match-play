// Matchplay's real-time events (experimental Real time API: a Pusher web socket, channel tournaments.{id}).
// An open tournament tab listens to its tournament (and the linked qualifying / finals): a new round, a score from a
// phone, an arena change... and the page and our parts update within a second or two instead of the 15 s refresh.
var TDP = window.TDP || (window.TDP = {});

TDP.live = (() => {
  const T = TDP;
  const URL = 'wss://ws.app.matchplay.events/app/tnrxzkahdeullnwje83e?protocol=7&client=js&version=8.5.0&flash=false';
  let ws = null, want = new Set(), subbed = new Set(), ok = false, retry = 0, pingT = null, timer = null, lastMsg = 0;
  const listeners = new Set();

  function connect() {
    if (T.isFrame || T.dead || (T.settings && T.settings.off) || typeof WebSocket === 'undefined') return;
    try { ws = new WebSocket(URL); } catch (e) { return later(); }
    ws.onmessage = m => {
      lastMsg = Date.now();
      let d; try { d = JSON.parse(m.data); } catch (e) { return; }
      if (d.event === 'pusher:connection_established') { ok = true; retry = 0; subbed.clear(); sync(); return; }
      if (d.event === 'pusher:ping') { send({ event: 'pusher:pong', data: {} }); return; }
      if (!d.channel || !/^tournaments\.\d+$/.test(d.channel) || /^pusher/.test(d.event)) return;
      const tid = +d.channel.split('.')[1], name = String(d.event).replace(/^.*\\/, '');
      let data = d.data; try { if (typeof data === 'string') data = JSON.parse(data); } catch (e) { /* keep text */ }
      listeners.forEach(f => { try { f(tid, name, data); } catch (e) { T.warn('live', e); } });
    };
    ws.onclose = () => { ok = false; subbed.clear(); clearInterval(pingT); later(); };
    ws.onerror = () => { try { ws.close(); } catch (e) { /* */ } };
    clearInterval(pingT);
    // keep it open: a ping when Matchplay has been quiet (its timeout is 30 s)
    pingT = setInterval(() => { if (ok && Date.now() - lastMsg > 20000) send({ event: 'pusher:ping', data: {} }); }, 10000);
  }
  function later() { clearTimeout(timer); timer = setTimeout(connect, Math.min(60000, 2000 * Math.pow(2, retry++))); }
  function send(o) { try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); } catch (e) { /* */ } }
  function sync() {
    if (!ok) return;
    for (const t of want) if (!subbed.has(t)) { send({ event: 'pusher:subscribe', data: { auth: '', channel: 'tournaments.' + t } }); subbed.add(t); }
    for (const t of [...subbed]) if (!want.has(t)) { send({ event: 'pusher:unsubscribe', data: { channel: 'tournaments.' + t } }); subbed.delete(t); }
  }
  // the tournaments to listen to (replaces the list)
  function watch(ids) {
    want = new Set(ids.filter(Boolean).map(Number));
    if (!want.size) return;
    if (!ws || ws.readyState > 1) connect(); else sync();
  }
  function stop() { want.clear(); clearTimeout(timer); clearInterval(pingT); try { if (ws) ws.close(); } catch (e) { /* */ } ws = null; ok = false; }
  return { watch, stop, on: f => listeners.add(f), ok: () => ok };
})();
