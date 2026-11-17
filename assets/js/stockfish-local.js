/* =========================================================================
   stockfish-local.js — Local Stockfish WebAssembly engine for Serena Chess
   -------------------------------------------------------------------------
   Embeds Stockfish 19 Lite (WebAssembly) so the app can run Grandmaster-level
   analysis entirely on the device, without needing a VPS.

   Loads wasm/stockfish.js (Emscripten module) which exposes a global
   `Stockfish` factory. Wraps it in a UCI engine adapter compatible with
   hybrid.js.

   Usage:

     var engine = StockfishLocal.create();
     engine.getBestMove(fen, color, function(err, move, cloud) { ... });
   ========================================================================= */
(function (root) {
  'use strict';

  /* stockfish.js is loaded via <script src="wasm/stockfish.js"> in index.html.
     It exposes `Stockfish` globally (UMD). */
  var Stockfish = root.Stockfish || (typeof window !== 'undefined' && window.Stockfish) || null;

  function StockfishLocal() {
    var engine = null;
    var ready = false;
    var pending = [];   // queue of { fen, color, cb } while loading
    var listeners = [];

    function onState(fn) { if (typeof fn === 'function') listeners.push(fn); }
    function emit() {
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](ready); } catch (e) {}
      }
    }

    function init() {
      if (!Stockfish) {
        ready = false;
        emit();
        while (pending.length) {
          var p = pending.shift();
          p.cb(new Error('stockfish_module_not_loaded'), null, false);
        }
        return;
      }
      try {
        engine = Stockfish({
          locateFile: function (path) {
            if (path.indexOf('.wasm') > -1) return 'wasm/stockfish.wasm';
            return path;
          },
          listener: function (msg) {
            if (!msg || typeof msg !== 'string') return;
            if (msg.indexOf('bestmove ') === 0) {
              var parts = msg.split(' ');
              var mv = parts[1];
              var p = pending.shift();
              if (p && p.cb) {
                p.cb(null, mv, false);
              }
            }
          }
        });
        engine.postMessage('uci');
        ready = true;
        emit();
        /* Process any queued requests */
        while (pending.length) {
          var p = pending.shift();
          if (engine && ready) {
            engine.postMessage('position fen ' + p.fen);
            engine.postMessage('go wtime 5000 btime 5000');
          } else {
            p.cb(new Error('engine_not_ready'), null, false);
          }
        }
      } catch (e) {
        ready = false;
        emit();
        while (pending.length) {
          var p2 = pending.shift();
          p2.cb(e, null, false);
        }
      }
    }

    init();

    return {
      getBestMove: function (fen, color, cb) {
        if (!engine || !ready) {
          pending.push({ fen: fen, color: color, cb: cb });
          return;
        }
        engine.postMessage('position fen ' + fen);
        engine.postMessage('go wtime 5000 btime 5000');
        pending.push({ fen: fen, color: color, cb: cb });
      },
      isReady: function () { return ready; },
      terminate: function () {
        if (engine) { engine.postMessage('quit'); engine = null; }
        ready = false;
      },
      onState: onState
    };
  }

  var API = {
    StockfishLocal: StockfishLocal,
    create: function () { return new StockfishLocal(); },
    isAvailable: function () { return !!Stockfish; }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.StockfishLocal = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
