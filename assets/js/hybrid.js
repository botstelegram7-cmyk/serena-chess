/* =========================================================================
   hybrid.js — explicit VPS Stockfish access + local engine fallback helpers
   -------------------------------------------------------------------------
   The app now chooses its engine per game. VPS Stockfish requests are strict:
   they never silently switch to the local engine. The local character engine
   remains available offline and keeps each bot's individual style.
   ========================================================================= */
(function (root) {
  'use strict';

  var E = root.ChessEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var AI = root.ChessAI || (typeof require !== 'undefined' ? require('./ai.js') : null);
  var BOTS = root.ChessBots || (typeof require !== 'undefined' ? require('./bots.js') : null);

  var serverUrl = '';
  var online = typeof navigator !== 'undefined' ? !!navigator.onLine : true;
  var stockfishAvailable = null; // null = not checked, otherwise a server capability result
  var serverReachable = null;    // null = not checked; separates VPS health from device connectivity
  var lastCloud = false;
  var listeners = [];

  function onState(fn) { if (typeof fn === 'function') listeners.push(fn); }
  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](online, stockfishAvailable === true, lastCloud, stockfishAvailable); } catch (e) {}
    }
  }

  function httpBase(url) {
    var value = String(url || '').trim();
    if (/^wss:\/\//i.test(value)) value = value.replace(/^wss:/i, 'https:');
    else if (/^ws:\/\//i.test(value)) value = value.replace(/^ws:/i, 'http:');
    else if (!/^https?:\/\//i.test(value) && value) value = 'https://' + value;
    return value.replace(/\/+$/, '');
  }

  function configure(url) {
    var next = httpBase(url);
    if (next !== serverUrl) {
      serverUrl = next;
      stockfishAvailable = null;
      serverReachable = null;
      lastCloud = false;
    }
    emit();
  }

  function configured() { return !!serverUrl; }
  function isOnline() { return online; }
  function isServerReachable() { return serverReachable; }
  function isStockfishAvailable() { return stockfishAvailable === true; }
  function useCloud() { return online && isStockfishAvailable() && lastCloud; }

  function setOnline(value) {
    var next = !!value;
    if (online === next) return;
    online = next;
    if (!online) { serverReachable = false; stockfishAvailable = false; lastCloud = false; }
    emit();
  }

  function checkHealth(cb) {
    cb = typeof cb === 'function' ? cb : function () {};
    if (!serverUrl) {
      online = false; serverReachable = false; stockfishAvailable = false; emit();
      cb(new Error('no_server'), null);
      return;
    }
    var xhr = new XMLHttpRequest(), finished = false;
    var timer = setTimeout(function () {
      if (finished) return;
      finished = true;
      try { xhr.abort(); } catch (e) {}
      online = false; serverReachable = false; stockfishAvailable = false; lastCloud = false; emit();
      cb(new Error('health_timeout'), null);
    }, 6000);
    xhr.open('GET', serverUrl + '/health', true);
    xhr.onload = function () {
      if (finished) return;
      finished = true; clearTimeout(timer);
      var health = null;
      try { health = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
      if (xhr.status >= 200 && xhr.status < 300 && health && health.ok) {
        online = true; serverReachable = true;
        stockfishAvailable = health.stockfish === true;
        emit();
        cb(null, health);
      } else {
        online = false; serverReachable = false; stockfishAvailable = false; lastCloud = false; emit();
        cb(new Error('health_status_' + xhr.status), health);
      }
    };
    xhr.onerror = function () {
      if (finished) return;
      finished = true; clearTimeout(timer);
      online = false; serverReachable = false; stockfishAvailable = false; lastCloud = false; emit();
      cb(new Error('health_network'), null);
    };
    xhr.send();
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () {
      if (serverUrl) checkHealth(); else setOnline(true);
    });
    window.addEventListener('offline', function () { setOnline(false); });
    /* Capability is polled too: a running relay without Stockfish is not ready. */
    setInterval(function () { if (serverUrl) checkHealth(); }, 15000);
  }

  function cloudBestMove(fen, color, cb) {
    cb = typeof cb === 'function' ? cb : function () {};
    if (!serverUrl) return cb(new Error('no_server'), null);
    var xhr = new XMLHttpRequest(), finished = false;
    var timer = setTimeout(function () {
      if (finished) return;
      finished = true;
      try { xhr.abort(); } catch (e) {}
      serverReachable = false; lastCloud = false; emit();
      cb(new Error('stockfish_timeout'), null);
    }, 15000);
    xhr.open('POST', serverUrl + '/stockfish', true);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onload = function () {
      if (finished) return;
      finished = true; clearTimeout(timer);
      var result = {};
      try { result = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
      if (xhr.status === 200 && typeof result.bestmove === 'string' && result.bestmove) {
        online = true; serverReachable = true; stockfishAvailable = true; lastCloud = true; emit();
        cb(null, result.bestmove, true);
      } else {
        serverReachable = true;
        if (xhr.status === 503 && /stockfish_missing|stockfish_not_ready|no_stockfish_bin/.test(result.error || '')) {
          stockfishAvailable = false;
        }
        lastCloud = false; emit();
        cb(new Error(result.error || ('stockfish_http_' + xhr.status)), null, false);
      }
    };
    xhr.onerror = function () {
      if (finished) return;
      finished = true; clearTimeout(timer);
      online = false; serverReachable = false; lastCloud = false; emit();
      cb(new Error('stockfish_network'), null, false);
    };
    xhr.send(JSON.stringify({ fen: fen, color: color }));
  }

  function localBestMove(fen, color, bot, cb) {
    lastCloud = false; emit();
    try {
      var g = new E.Chess(fen);
      var b = bot || (BOTS && BOTS.byId && BOTS.byId('professor'));
      var mv = AI.pickMove(g, b, []);
      cb(null, mv ? E.algebraic(mv.from) + E.algebraic(mv.to) : null, false);
    } catch (e) { cb(e, null, false); }
  }

  /* Legacy auto mode retained for integrations; the main app uses the explicit
     cloudBestMove or local engine path so a VPS failure cannot masquerade as
     a Stockfish game. */
  function getBestMove(fen, color, bot, cb) {
    if (serverUrl && online && isStockfishAvailable()) {
      cloudBestMove(fen, color, function (err, move, cloud) {
        if (!err && move) { cb(null, move, cloud); return; }
        localBestMove(fen, color, bot, cb);
      });
    } else localBestMove(fen, color, bot, cb);
  }

  var API = {
    configure: configure, configured: configured, isOnline: isOnline,
    isStockfishAvailable: isStockfishAvailable, isServerReachable: isServerReachable,
    checkHealth: checkHealth,
    useCloud: useCloud, onState: onState,
    getBestMove: getBestMove, cloudBestMove: cloudBestMove,
    getStockfishMove: cloudBestMove, localBestMove: localBestMove,
    httpBase: httpBase
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Hybrid = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
