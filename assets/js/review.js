/* =========================================================================
   review.js — move navigation, game analysis, PGN and opening names
   -------------------------------------------------------------------------
   Three jobs:

   1. History    a FEN snapshot per ply so < and > can step through a game
                 instantly without replaying from the start every time.
   2. Analysis   runs the engine once per position and turns the result into
                 chess.com-style move labels (Best / Mistake / Blunder …) plus
                 an accuracy percentage for each side.
   3. Paperwork  PGN export and naming the opening that was played.
   ========================================================================= */
(function (root) {
  'use strict';

  var E = root.ChessEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var AI = root.ChessAI || (typeof require !== 'undefined' ? require('./ai.js') : null);
  var VALUE = [0, 100, 320, 330, 500, 900, 20000];

  /* ═══════════════════════════════════════════════════ opening names ═══ */
  /* Longest matching prefix wins, so "e4 e5 Nf3 Nc6 Bb5" beats "e4 e5". */
  var OPENINGS = [
    [['e4'], 'King\u2019s Pawn'],
    [['d4'], 'Queen\u2019s Pawn'],
    [['c4'], 'English Opening'],
    [['Nf3'], 'R\u00e9ti Opening'],
    [['g3'], 'Benko Opening'],
    [['b3'], 'Larsen Attack'],
    [['f4'], 'Bird Opening'],
    [['e4', 'e5'], 'Open Game'],
    [['e4', 'c5'], 'Sicilian Defence'],
    [['e4', 'e6'], 'French Defence'],
    [['e4', 'c6'], 'Caro-Kann Defence'],
    [['e4', 'd5'], 'Scandinavian Defence'],
    [['e4', 'd6'], 'Pirc Defence'],
    [['e4', 'g6'], 'Modern Defence'],
    [['e4', 'Nf6'], 'Alekhine Defence'],
    [['e4', 'b6'], 'Owen Defence'],
    [['e4', 'Nc6'], 'Nimzowitsch Defence'],
    [['d4', 'd5'], 'Closed Game'],
    [['d4', 'Nf6'], 'Indian Defence'],
    [['d4', 'f5'], 'Dutch Defence'],
    [['d4', 'e6'], 'Horwitz Defence'],
    [['e4', 'e5', 'Nf3'], 'King\u2019s Knight Opening'],
    [['e4', 'e5', 'f4'], 'King\u2019s Gambit'],
    [['e4', 'e5', 'Nc3'], 'Vienna Game'],
    [['e4', 'e5', 'Bc4'], 'Bishop\u2019s Opening'],
    [['e4', 'e5', 'd4'], 'Centre Game'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], 'Ruy L\u00f3pez'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], 'Italian Game'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'd4'], 'Scotch Game'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Nc3'], 'Three Knights'],
    [['e4', 'e5', 'Nf3', 'Nf6'], 'Petrov Defence'],
    [['e4', 'e5', 'Nf3', 'd6'], 'Philidor Defence'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], 'Giuoco Piano'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], 'Two Knights Defence'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'], 'Evans Gambit'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'], 'Ruy L\u00f3pez, Morphy Defence'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'], 'Ruy L\u00f3pez, Exchange'],
    [['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'], 'Ruy L\u00f3pez, Berlin Defence'],
    [['e4', 'c5', 'Nf3'], 'Sicilian, Open'],
    [['e4', 'c5', 'Nc3'], 'Sicilian, Closed'],
    [['e4', 'c5', 'd4'], 'Smith-Morra Gambit'],
    [['e4', 'c5', 'c3'], 'Sicilian, Alapin'],
    [['e4', 'c5', 'b4'], 'Sicilian, Wing Gambit'],
    [['e4', 'c5', 'Nf3', 'd6'], 'Sicilian, Open'],
    [['e4', 'c5', 'Nf3', 'Nc6'], 'Sicilian, Old'],
    [['e4', 'c5', 'Nf3', 'e6'], 'Sicilian, Taimanov'],
    [['e4', 'e6', 'd4', 'd5', 'Nc3'], 'French, Classical'],
    [['e4', 'e6', 'd4', 'd5', 'Nd2'], 'French, Tarrasch'],
    [['e4', 'e6', 'd4', 'd5', 'e5'], 'French, Advance'],
    [['e4', 'e6', 'd4', 'd5', 'exd5'], 'French, Exchange'],
    [['e4', 'c6', 'd4', 'd5', 'Nc3'], 'Caro-Kann, Main Line'],
    [['e4', 'c6', 'd4', 'd5', 'e5'], 'Caro-Kann, Advance'],
    [['d4', 'd5', 'c4'], 'Queen\u2019s Gambit'],
    [['d4', 'd5', 'c4', 'e6'], 'Queen\u2019s Gambit Declined'],
    [['d4', 'd5', 'c4', 'c6'], 'Slav Defence'],
    [['d4', 'd5', 'c4', 'dxc4'], 'Queen\u2019s Gambit Accepted'],
    [['d4', 'd5', 'c4', 'e6', 'Nc3', 'c6'], 'Semi-Slav Defence'],
    [['d4', 'd5', 'e4'], 'Blackmar-Diemer Gambit'],
    [['d4', 'Nf6', 'c4'], 'Indian Game'],
    [['d4', 'Nf6', 'c4', 'e6'], 'Indian, Queen\u2019s Pawn'],
    [['d4', 'Nf6', 'c4', 'g6'], 'King\u2019s Indian Defence'],
    [['d4', 'Nf6', 'c4', 'c5'], 'Benoni Defence'],
    [['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'], 'Nimzo-Indian Defence'],
    [['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'], 'Queen\u2019s Indian Defence'],
    [['d4', 'Nf6', 'c4', 'e6', 'g3'], 'Catalan Opening'],
    [['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'], 'Gr\u00fcnfeld Defence'],
    [['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5'], 'Benko Gambit'],
    [['c4', 'e5'], 'English, Reversed Sicilian'],
    [['c4', 'c5'], 'English, Symmetrical'],
    [['c4', 'Nf6'], 'English, Anglo-Indian'],
    [['Nf3', 'd5', 'g3'], 'R\u00e9ti, King\u2019s Indian Attack']
  ];

  /** @returns {{name: string|null, plies: number}} longest matching prefix */
  function openingInfo(sanList) {
    var best = null, bestLen = 0;
    var hist = (sanList || []).map(function (s) { return String(s).replace(/[+#!?]/g, ''); });
    for (var i = 0; i < OPENINGS.length; i++) {
      var pre = OPENINGS[i][0];
      if (pre.length > hist.length || pre.length <= bestLen) continue;
      var ok = true;
      for (var j = 0; j < pre.length; j++) {
        if (pre[j] !== hist[j]) { ok = false; break; }
      }
      if (ok) { best = OPENINGS[i][1]; bestLen = pre.length; }
    }
    return { name: best, plies: bestLen };
  }

  function openingName(sanList) { return openingInfo(sanList).name; }

  /* ═════════════════════════════════════════════════════════ history ═══ */
  /**
   * Snapshots every position of a game so navigation is instant.
   * ply 0 is the starting position; ply n is "after n moves".
   */
  function History(startFen) {
    this.startFen = startFen || null;
    this.fens = [new E.Chess(startFen || undefined).fen()];
    this.moves = [];            // { san, from, to, promo }
  }

  History.prototype.push = function (entry, fenAfter) {
    this.moves.push(entry);
    this.fens.push(fenAfter);
  };

  History.prototype.truncate = function (ply) {
    this.moves.length = ply;
    this.fens.length = ply + 1;
  };

  History.prototype.length = function () { return this.moves.length; };

  History.prototype.gameAt = function (ply) {
    ply = Math.max(0, Math.min(ply, this.moves.length));
    return new E.Chess(this.fens[ply]);
  };

  History.prototype.moveAt = function (ply) {
    return ply > 0 ? this.moves[ply - 1] : null;
  };

  /** rebuild from a list of SAN strings (used when resuming a saved game) */
  History.fromSan = function (sanList, startFen) {
    var h = new History(startFen);
    var g = new E.Chess(startFen || undefined);
    for (var i = 0; i < (sanList || []).length; i++) {
      var want = String(sanList[i]).replace(/[+#!?]/g, '');
      var legal = g.moves(), hit = null;
      for (var k = 0; k < legal.length; k++) {
        if (g.moveToSan(legal[k], legal).replace(/[+#!?]/g, '') === want) { hit = legal[k]; break; }
      }
      if (!hit) break;
      var san = g.moveToSan(hit, legal);
      g.makeMove(hit);
      h.push({ san: san, from: hit.from, to: hit.to, promo: hit.promo || 0 }, g.fen());
    }
    return h;
  };

  /* ════════════════════════════════════════════════════════ analysis ═══ */
  var LABELS = {
    brilliant:  { name: 'Brilliant',  cls: 'brilliant',  mark: '!!' },
    great:      { name: 'Great',      cls: 'great',      mark: '!'  },
    best:       { name: 'Best',       cls: 'best',       mark: ''   },
    excellent:  { name: 'Excellent',  cls: 'excellent',  mark: ''   },
    good:       { name: 'Good',       cls: 'good',       mark: ''   },
    book:       { name: 'Book',       cls: 'book',       mark: ''   },
    inaccuracy: { name: 'Inaccuracy', cls: 'inaccuracy', mark: '?!' },
    mistake:    { name: 'Mistake',    cls: 'mistake',    mark: '?'  },
    blunder:    { name: 'Blunder',    cls: 'blunder',    mark: '??' }
  };

  /** centipawns → expected score 0..1, the standard logistic used by Lichess */
  function winChance(cp) {
    return 1 / (1 + Math.exp(-0.00368208 * Math.max(-1500, Math.min(1500, cp))));
  }

  /** one move's accuracy 0..100 from the win-chance it threw away */
  function moveAccuracy(winBefore, winAfter) {
    var drop = Math.max(0, winBefore - winAfter) * 100;
    var acc = 103.1668 * Math.exp(-0.04354 * drop) - 3.1669;
    return Math.max(0, Math.min(100, acc));
  }

  /** two-ply static exchange: how much material can the opponent win right now? */
  function hangingAfter(g) {
    var caps = g.moves().filter(function (m) { return m.flags & E.FLAG_CAPTURE; });
    var best = 0;
    for (var i = 0; i < caps.length; i++) {
      var c = caps[i];
      var gain = VALUE[E.typeOf(c.captured || 0)] || 0;
      g.makeMove(c);
      if (g.isAttacked(g.kings[g.turn ^ 1], g.turn)) { g.undoMove(); continue; }  // illegal
      var back = 0;
      var re = g.moves();
      for (var k = 0; k < re.length; k++) {
        if (re[k].to === c.to && (re[k].flags & E.FLAG_CAPTURE)) {
          back = VALUE[E.typeOf(g.board[c.to])] || 0;
          break;
        }
      }
      g.undoMove();
      var net = gain - back;
      if (net > best) best = net;
    }
    return best;
  }

  function classify(cpLoss, sacrifice, evalAfter, onlyMove, inBook) {
    if (inBook) return 'book';
    if (cpLoss <= 15 && sacrifice >= 200 && evalAfter >= -120) return 'brilliant';
    if (cpLoss <= 15 && onlyMove) return 'great';
    if (cpLoss <= 12) return 'best';
    if (cpLoss <= 45) return 'excellent';
    if (cpLoss <= 95) return 'good';
    if (cpLoss <= 190) return 'inaccuracy';
    if (cpLoss <= 380) return 'mistake';
    return 'blunder';
  }

  /**
   * Analyse a whole game, one ply at a time, yielding to the UI between
   * positions so the progress bar can actually paint on a phone.
   *
   * @param history  a History
   * @param opts     { depth, timeMs, onProgress, onDone }
   * @returns        a handle with .cancel()
   */
  function analyse(history, opts) {
    opts = opts || {};
    var depth = opts.depth || 4;
    var timeMs = opts.timeMs || 260;
    var total = history.length();
    var out = [];
    var cancelled = false;
    var bookDepth = 0;

    // how far into a known opening did the game stay? openingInfo returns the
    // length of the longest matching prefix, which is exactly the book depth.
    var sans = history.moves.map(function (m) { return m.san; });
    bookDepth = Math.min(openingInfo(sans).plies, 12);

    function step(ply) {
      if (cancelled) return;
      if (ply >= total) { finish(); return; }

      var g = history.gameAt(ply);
      var mv = history.moves[ply];
      var mover = g.turn;

      var legal = g.moves().filter(function (m) {
        g.makeMove(m);
        var ok = !g.isAttacked(g.kings[g.turn ^ 1], g.turn);
        g.undoMove();
        return ok;
      });

      var scored = [];
      try {
        var s = new AI.Search(g, { contempt: 0, style: AI.DEFAULT_STYLE });
        scored = s.rootScores(depth, timeMs) || [];
      } catch (e) { scored = []; }

      var bestScore = scored.length ? scored[0].score : 0;
      var playedScore = bestScore;
      var bestSan = null;

      if (scored.length) {
        try { bestSan = g.moveToSan(scored[0].move, legal); } catch (e) { bestSan = null; }
        for (var i = 0; i < scored.length; i++) {
          var sm = scored[i].move;
          if (sm.from === mv.from && sm.to === mv.to &&
              (!mv.promo || !sm.promo || sm.promo === mv.promo)) {
            playedScore = scored[i].score; break;
          }
        }
      }

      var MATE = AI.MATE || 100000;
      var isMate = Math.abs(playedScore) > MATE - 1000;
      var mateIn = isMate ? Math.ceil((MATE - Math.abs(playedScore)) / 2) * (playedScore > 0 ? 1 : -1) : null;
      // a mate score is not a centipawn value: clamp so one blunder before mate
      // reads as "lost the game", not "-100019 centipawns"
      var cpLoss = Math.min(2000, Math.max(0, bestScore - playedScore));
      var onlyMove = scored.length > 1 && (scored[0].score - scored[1].score) > 250;

      // how much material the move hands over, if any
      var sacrifice = 0;
      var applied = null;
      for (var j = 0; j < legal.length; j++) {
        if (legal[j].from === mv.from && legal[j].to === mv.to) { applied = legal[j]; break; }
      }
      if (applied) {
        g.makeMove(applied);
        sacrifice = hangingAfter(g);
        g.undoMove();
      }

      // bestScore and playedScore are both from the mover's point of view,
      // so accuracy is simply the win chance the mover threw away.
      var inBook = ply < bookDepth;
      var label = classify(cpLoss, sacrifice, playedScore, onlyMove, inBook);

      out.push({
        ply: ply,
        san: mv.san,
        color: mover,
        label: label,
        cpLoss: Math.round(cpLoss),
        cp: Math.max(-2000, Math.min(2000, Math.round(mover === E.WHITE ? playedScore : -playedScore))),
        mate: mateIn === null ? null : (mover === E.WHITE ? mateIn : -mateIn),
        best: bestSan,
        accuracy: moveAccuracy(winChance(bestScore), winChance(playedScore))
      });

      if (opts.onProgress) opts.onProgress({ done: ply + 1, total: total, last: out[out.length - 1] });
      setTimeout(function () { step(ply + 1); }, 0);
    }

    function finish() {
      var sum = { 0: { n: 0, acc: 0 }, 1: { n: 0, acc: 0 } };
      var counts = { 0: {}, 1: {} };
      for (var i = 0; i < out.length; i++) {
        var r = out[i];
        sum[r.color].n++;
        sum[r.color].acc += r.accuracy;
        counts[r.color][r.label] = (counts[r.color][r.label] || 0) + 1;
      }
      var result = {
        moves: out,
        white: {
          accuracy: sum[0].n ? Math.round(sum[0].acc / sum[0].n * 10) / 10 : 0,
          counts: counts[0]
        },
        black: {
          accuracy: sum[1].n ? Math.round(sum[1].acc / sum[1].n * 10) / 10 : 0,
          counts: counts[1]
        },
        opening: openingName(sans)
      };
      if (opts.onDone) opts.onDone(result);
    }

    setTimeout(function () { step(0); }, 0);
    return { cancel: function () { cancelled = true; } };
  }

  /* ═════════════════════════════════════════════════════════════ PGN ═══ */
  function pgn(history, meta) {
    meta = meta || {};
    var d = meta.date ? new Date(meta.date) : new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var tags = [
      ['Event', meta.event || 'Casual Game'],
      ['Site', meta.site || 'Chess (Android)'],
      ['Date', d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate())],
      ['Round', '-'],
      ['White', meta.white || 'White'],
      ['Black', meta.black || 'Black'],
      ['Result', meta.result || '*'],
      ['Annotator', 'Serena Chess \u00b7 @TechnicalSerena']
    ];
    if (meta.whiteElo) tags.push(['WhiteElo', String(meta.whiteElo)]);
    if (meta.blackElo) tags.push(['BlackElo', String(meta.blackElo)]);
    if (meta.tc) tags.push(['TimeControl', String(meta.tc)]);
    if (history.startFen) { tags.push(['SetUp', '1']); tags.push(['FEN', history.startFen]); }
    var op = openingName(history.moves.map(function (m) { return m.san; }));
    if (op) tags.push(['Opening', op]);

    var head = tags.map(function (t) { return '[' + t[0] + ' "' + String(t[1]).replace(/"/g, "'") + '"]'; }).join('\n');

    var body = '', line = '';
    for (var i = 0; i < history.moves.length; i++) {
      var tok = (i % 2 === 0 ? (i / 2 + 1) + '. ' : '') + history.moves[i].san;
      if ((line + ' ' + tok).length > 78) { body += line + '\n'; line = tok; }
      else line = line ? line + ' ' + tok : tok;
    }
    var res = meta.result || '*';
    if ((line + ' ' + res).length > 78) { body += line + '\n' + res; }
    else body += line + (line ? ' ' : '') + res;

    return head + '\n\n' + body + '\n';
  }

  var API = {
    History: History, analyse: analyse, pgn: pgn,
    openingName: openingName, openingInfo: openingInfo, LABELS: LABELS,
    winChance: winChance, moveAccuracy: moveAccuracy
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessReview = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
