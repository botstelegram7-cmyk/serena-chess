/* =========================================================================
   online.js — client for the relay server in /server
   -------------------------------------------------------------------------
   Powers "Play Online" (random opponent) and "Play with Friends" (invite
   code). The server never validates chess; both sides run the local engine,
   so this module only has to stay connected and pass messages around.

   Usage:
     Online.configure('wss://my-relay.onrender.com');
     Online.on('start', fn); Online.on('move', fn); ...
     Online.connect(); Online.createRoom('10+0');
   ========================================================================= */
(function (root) {
  'use strict';

  var HANDLERS = {};
  var ws = null;
  var url = '';
  var me = { name: 'Player', rating: 1200 };
  var state = 'idle';          // idle | connecting | online | queued | hosting | playing
  var wantOpen = false;        // did the user ask to be connected?
  var retry = 0;
  var retryTimer = null;
  var pingTimer = null;
  var lastPing = 0;
  var latency = null;
  var pending = [];            // messages queued while the socket opens
  var session = { code: null, color: null, opp: null, tc: null };

  /* ------------------------------------------------------------- events */
  function on(evt, fn) { (HANDLERS[evt] || (HANDLERS[evt] = [])).push(fn); }
  function emit(evt, data) {
    var list = HANDLERS[evt];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try { list[i](data); } catch (e) { /* a bad listener must not kill the socket */ }
    }
  }

  function setState(s) {
    if (state === s) return;
    state = s;
    emit('state', { state: s, latency: latency, session: session });
  }

  /* ------------------------------------------------------------- config */
  function configure(serverUrl) {
    var next = normalise(serverUrl);
    if (next === url) return;
    url = next;
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
    if (wantOpen && url) connect();
  }

  /** accept http(s):// or ws(s):// or a bare host and end up with a ws URL */
  function normalise(u) {
    u = String(u || '').trim();
    if (!u) return '';
    u = u.replace(/\/+$/, '');
    if (/^https:\/\//i.test(u)) return 'wss://' + u.slice(8);
    if (/^http:\/\//i.test(u))  return 'ws://'  + u.slice(7);
    if (/^wss?:\/\//i.test(u))  return u;
    return (/^(localhost|127\.|192\.168\.|10\.|172\.)/.test(u) ? 'ws://' : 'wss://') + u;
  }

  function identify(name, rating) {
    me.name = String(name || 'Player').slice(0, 20);
    me.rating = rating || 1200;
    if (state !== 'idle' && state !== 'connecting') {
      send({ t: 'hello', name: me.name, rating: me.rating });
    }
  }

  function configured() { return !!url; }

  /* --------------------------------------------------------- connection */
  function connect() {
    wantOpen = true;
    if (!url) { emit('error', { code: 'no_server', msg: 'No server URL set. Add one in Settings → Online.' }); return; }
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;

    setState('connecting');
    try { ws = new WebSocket(url); }
    catch (e) { scheduleRetry(); return; }

    ws.onopen = function () {
      retry = 0;
      send({ t: 'hello', name: me.name, rating: me.rating });
      while (pending.length) send(pending.shift());
      setState('online');
      startPing();
    };

    ws.onmessage = function (ev) {
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      handle(m);
    };

    ws.onclose = function () {
      stopPing();
      ws = null;
      if (state === 'playing') emit('oppLeft', { permanent: false, self: true });
      if (wantOpen) scheduleRetry(); else setState('idle');
    };

    ws.onerror = function () { /* onclose always follows; handled there */ };
  }

  function disconnect() {
    wantOpen = false;
    clearTimeout(retryTimer);
    stopPing();
    if (ws) { send({ t: 'leave' }); try { ws.close(); } catch (e) {} }
    ws = null;
    session = { code: null, color: null, opp: null, tc: null };
    setState('idle');
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    setState('connecting');
    // 1s, 2s, 4s, 8s … capped at 20s. Free hosts can take ~30s to wake up.
    var wait = Math.min(20000, 1000 * Math.pow(2, Math.min(retry, 5)));
    retry++;
    emit('retry', { attempt: retry, inMs: wait });
    retryTimer = setTimeout(function () { if (wantOpen) connect(); }, wait);
  }

  function startPing() {
    stopPing();
    pingTimer = setInterval(function () {
      lastPing = Date.now();
      send({ t: 'ping', ts: lastPing });
    }, 15000);
  }
  function stopPing() { if (pingTimer) { clearInterval(pingTimer); pingTimer = null; } }

  function send(obj) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    if (obj.t !== 'ping') pending.push(obj);
    return false;
  }

  /* ---------------------------------------------------------- messages */
  function handle(m) {
    switch (m.t) {
      case 'welcome':
        emit('ready', m);
        break;

      case 'created':
        session.code = m.code; session.tc = m.tc;
        setState('hosting');
        emit('created', m);
        break;

      case 'queued':
        setState('queued');
        emit('queued', m);
        break;

      case 'cancelled':
        setState('online');
        emit('cancelled', m);
        break;

      case 'start':
        session = { code: m.code, color: m.color, opp: m.opp, tc: m.tc };
        setState('playing');
        emit('start', m);
        break;

      case 'move':     emit('move', m); break;
      case 'chat':     emit('chat', m); break;
      case 'resign':   emit('resign', m); break;
      case 'draw':     emit('drawOffer', m); break;
      case 'drawAccept':  emit('drawAccept', m); break;
      case 'drawDecline': emit('drawDecline', m); break;
      case 'flag':     emit('flag', m); break;
      case 'rematch':  emit('rematchOffer', m); break;

      case 'oppLeft':
        emit('oppLeft', m);
        if (m.permanent) { session.code = null; setState('online'); }
        break;

      case 'roomClosed':
        session = { code: null, color: null, opp: null, tc: null };
        setState(ws ? 'online' : 'idle');
        emit('roomClosed', m);
        break;

      case 'error':
        emit('error', m);
        break;

      case 'pong':
        if (m.ts) { latency = Date.now() - m.ts; emit('latency', { ms: latency }); }
        break;
    }
  }

  /* -------------------------------------------------------- public API */
  function createRoom(tc) { if (!ws) connect(); send({ t: 'create', tc: tc || '10+0' }); }
  function joinRoom(code) {
    if (!ws) connect();
    send({ t: 'join', code: String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) });
  }
  function findGame(tc) { if (!ws) connect(); send({ t: 'queue', tc: tc || '10+0' }); }
  function cancelSearch() { send({ t: 'cancel' }); }
  function sendMove(mv) { send({ t: 'move', san: mv.san, from: mv.from, to: mv.to, promo: mv.promo || null, ms: mv.ms || null }); }
  function sendChat(text) { send({ t: 'chat', text: text }); }
  function resign() { send({ t: 'resign' }); }
  function offerDraw() { send({ t: 'draw' }); }
  function acceptDraw() { send({ t: 'drawAccept' }); }
  function declineDraw() { send({ t: 'drawDecline' }); }
  function flag(color) { send({ t: 'flag', color: color }); }
  function askRematch() { send({ t: 'rematch' }); }
  function okRematch() { send({ t: 'rematchOk' }); }
  function leaveRoom() {
    send({ t: 'leave' });
    session = { code: null, color: null, opp: null, tc: null };
    if (state === 'playing' || state === 'hosting' || state === 'queued') setState('online');
  }

  /** a code a human can read out, grouped for legibility: ABC-123 */
  function prettyCode(c) {
    c = String(c || '');
    return c.length === 6 ? c.slice(0, 3) + '-' + c.slice(3) : c;
  }

  function shareText(code) {
    return 'Play chess with me. Open the Chess app, tap Play with Friends → Join, '
         + 'and enter code ' + prettyCode(code) + '.';
  }

  var API = {
    configure: configure, configured: configured, normalise: normalise,
    identify: identify, connect: connect, disconnect: disconnect,
    createRoom: createRoom, joinRoom: joinRoom, findGame: findGame,
    cancelSearch: cancelSearch, sendMove: sendMove, sendChat: sendChat,
    resign: resign, offerDraw: offerDraw, acceptDraw: acceptDraw,
    declineDraw: declineDraw, flag: flag, askRematch: askRematch,
    okRematch: okRematch, leaveRoom: leaveRoom,
    on: on, prettyCode: prettyCode, shareText: shareText,
    get state() { return state; },
    get session() { return session; },
    get latency() { return latency; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Online = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
