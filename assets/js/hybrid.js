/* =========================================================================
   hybrid.js — Stockfish cloud API with local JS engine fallback
   -------------------------------------------------------------------------
   When online vs a bot, the app asks the Voroa backend (native Stockfish
   binary) for the best move. When offline, it falls back to the bundled
   JS engine so play never stops on old Android WebViews that cannot run
   WebAssembly or native binaries.

   Usage:
     Hybrid.configure('https://my-server.voroa.app');
     Hybrid.getBestMove(fen, color, (bestmove) => { ... });
     Hybrid.isOnline();      // true if network reachable
     Hybrid.useCloud();      // true if last answer came from the cloud
   ========================================================================= */
(function (root) {
  'use strict';

  var E = root.ChessEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var AI = root.ChessAI || (typeof require !== 'undefined' ? require('./ai.js') : null);
  var BOTS = root.ChessBots || (typeof require !== 'undefined' ? require('./bots.js') : null);

  var serverUrl = '';
  var wantCloud = false;
  var lastCloud = false;
  var online = typeof navigator !== 'undefined' ? !!navigator.onLine : true;
  var listeners = [];

  function onState(fn) { listeners.push(fn); }
  function emit() { for (var i = 0; i < listeners.length; i++) try { listeners[i](online, wantCloud, lastCloud); } catch (e) {} }

  function configure(url) {
    serverUrl = String(url || '').replace(/\/$/, '');
    wantCloud = !!serverUrl;
    emit();
  }

  function configured() { return !!serverUrl; }
  function useCloud() { return wantCloud && online && lastCloud; }
  function isOnline() { return online; }

  function setOnline(v) {
    if (v === online) return;
    online = v;
    emit();
  }

  /* ------------------------------------------------------ network detection */
  if (typeof window !== 'undefined') {
    window.addEventListener('online', function () { setOnline(true); });
    window.addEventListener('offline', function () { setOnline(false); });
    /* poll every 5s so a captive portal / dead wifi is detected */
    setInterval(function () {
      var probe = new XMLHttpRequest();
      var t = setTimeout(function () { probe.abort(); setOnline(false); }, 3000);
      probe.open('HEAD', serverUrl ? serverUrl + '/health' : '/health', true);
      probe.onload = function () { clearTimeout(t); setOnline(probe.status < 500); };
      probe.onerror = function () { clearTimeout(t); setOnline(false); };
      probe.send();
    }, 5000);
  }

  /* ------------------------------------------------------- cloud best move -- */
  function cloudBestMove(fen, color, cb) {
    if (!serverUrl) { return cb(new Error('no_server'), null); }
    var xhr = new XMLHttpRequest();
    var t = setTimeout(function () { xhr.abort(); cb(new Error('timeout'), null); }, 7000);
    xhr.open('POST', serverUrl + '/stockfish', true);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onload = function () {
      clearTimeout(t);
      if (xhr.status === 200) {
        try {
          var j = JSON.parse(xhr.responseText || '{}');
          lastCloud = true;
          emit();
          cb(null, j.bestmove || null);
        } catch (e) { cb(new Error('bad_response'), null); }
      } else {
        lastCloud = false;
        emit();
        cb(new Error('status_' + xhr.status), null);
      }
    };
    xhr.onerror = function () {
      clearTimeout(t);
      lastCloud = false;
      emit();
      cb(new Error('network'), null);
    };
    xhr.send(JSON.stringify({ fen: fen, color: color }));
  }

  /* ---------------------------------------------------- local best move ----- */
  function localBestMove(fen, color, bot, cb) {
    lastCloud = false;
    emit();
    var g = new E.Chess(fen);
    var b = bot || (BOTS && BOTS.byId && BOTS.byId('professor'));
    var mv = AI.pickMove(g, b, []);
    cb(null, mv ? E.algebraic(mv.from) + E.algebraic(mv.to) : null);
  }

  /** Get the engine's best move for a FEN.
   * Tries the Voroa cloud (native Stockfish) when online; falls back to the
   * local JS engine when offline or the cloud is unreachable. */
  function getBestMove(fen, color, bot, cb) {
    if (wantCloud && online) {
      cloudBestMove(fen, color, function (err, move) {
        if (!err && move) { cb(null, move, true); return; }
        /* cloud failed: fall back to local */
        localBestMove(fen, color, bot, function (e2, m2) { cb(e2, m2, false); });
      });
    } else {
      localBestMove(fen, color, bot, cb);
    }
  }

  var API = {
    configure: configure, configured: configured, isOnline: isOnline,
    useCloud: useCloud, onState: onState,
    getBestMove: getBestMove, cloudBestMove: cloudBestMove, localBestMove: localBestMove,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.Hybrid = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
