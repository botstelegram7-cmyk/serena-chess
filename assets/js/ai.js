/* =========================================================================
   ai.js — bot search
   Negamax + alpha-beta, iterative deepening, transposition table,
   MVV-LVA capture ordering, killer + history heuristics, quiescence search,
   tapered piece-square evaluation, and Elo-calibrated weakening.
   ========================================================================= */
(function (root) {
  'use strict';

  var E = root.ChessEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  var PAWN = E.PAWN, KNIGHT = E.KNIGHT, BISHOP = E.BISHOP,
      ROOK = E.ROOK, QUEEN = E.QUEEN, KING = E.KING;
  var WHITE = E.WHITE, BLACK = E.BLACK;
  var typeOf = E.typeOf, colorOf = E.colorOf, offBoard = E.offBoard;

  var VALUE = [0, 100, 320, 330, 500, 900, 20000];
  var MATE = 100000;
  var INF = 1e9;

  /* ------------------------------------------------- piece-square tables */
  var PST_PAWN = [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0];
  var PST_KNIGHT = [
   -50,-40,-30,-30,-30,-30,-40,-50,
   -40,-20,  0,  0,  0,  0,-20,-40,
   -30,  0, 10, 15, 15, 10,  0,-30,
   -30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,
   -30,  5, 10, 15, 15, 10,  5,-30,
   -40,-20,  0,  5,  5,  0,-20,-40,
   -50,-40,-30,-30,-30,-30,-40,-50];
  var PST_BISHOP = [
   -20,-10,-10,-10,-10,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5, 10, 10,  5,  0,-10,
   -10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,
   -10, 10, 10, 10, 10, 10, 10,-10,
   -10,  5,  0,  0,  0,  0,  5,-10,
   -20,-10,-10,-10,-10,-10,-10,-20];
  var PST_ROOK = [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0];
  var PST_QUEEN = [
   -20,-10,-10, -5, -5,-10,-10,-20,
   -10,  0,  0,  0,  0,  0,  0,-10,
   -10,  0,  5,  5,  5,  5,  0,-10,
    -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,
   -10,  5,  5,  5,  5,  5,  0,-10,
   -10,  0,  5,  0,  0,  0,  0,-10,
   -20,-10,-10, -5, -5,-10,-10,-20];
  var PST_KING_MG = [
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,
   -10,-20,-20,-20,-20,-20,-20,-10,
    20, 20,  0,  0,  0,  0, 20, 20,
    20, 30, 10,  0,  0, 10, 30, 20];
  var PST_KING_EG = [
   -50,-40,-30,-20,-20,-30,-40,-50,
   -30,-20,-10,  0,  0,-10,-20,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 30, 40, 40, 30,-10,-30,
   -30,-10, 20, 30, 30, 20,-10,-30,
   -30,-30,  0,  0,  0,  0,-30,-30,
   -50,-30,-30,-30,-30,-30,-30,-50];

  var PST = [null, PST_PAWN, PST_KNIGHT, PST_BISHOP, PST_ROOK, PST_QUEEN, PST_KING_MG];

  function idx64(sq) { return (sq >> 4) * 8 + (sq & 7); }
  function fileOf(sq) { return sq & 7; }
  function rankOf(sq) { return sq >> 4; }          // 0 = rank 8

  /* ---------------------------------------------------- playing styles */
  /* Every weight multiplies one evaluation term, so a bot's personality
     changes what it actually wants on the board, not just how deep it looks. */
  var DEFAULT_STYLE = {
    material: 1.00, kingAttack: 1.00, centre: 1.00, pawns: 1.00,
    passers: 1.00, rooks: 1.00, bishops: 1.00, safety: 1.00,
    aggression: 0.00,   // centipawn bonus weight for checks / attacking moves
    trade: 0.00         // >0 happily trades, <0 keeps pieces on
  };

  var CENTRE = new Int8Array(64);
  (function () {
    var core = [27, 28, 35, 36];                    // d4 e4 d5 e5
    var ring = [18,19,20,21,26,29,34,37,42,43,44,45];
    for (var i = 0; i < core.length; i++) CENTRE[core[i]] = 12;
    for (var j = 0; j < ring.length; j++) CENTRE[ring[j]] = 5;
  })();

  /* ------------------------------------------------------------ evaluate */
  function evaluate(g, opts) {
    opts = opts || {};
    var S = opts.style || DEFAULT_STYLE;
    var contempt = opts.contempt || 0;
    var b = g.board;
    var mg = 0, eg = 0, phase = 0;
    var pawnsFile = [new Int8Array(8), new Int8Array(8)];
    var minR = [new Int8Array(8), new Int8Array(8)];   // smallest rank index per file
    var maxR = [new Int8Array(8), new Int8Array(8)];   // largest rank index per file
    var bishops = [0, 0];
    var sq, p, t, c, i64;

    for (var f = 0; f < 8; f++) {
      minR[0][f] = minR[1][f] = 99;
      maxR[0][f] = maxR[1][f] = -1;
    }

    /* pass 1 — pawn skeleton */
    for (sq = 0; sq < 128; sq++) {
      if (offBoard(sq)) { sq += 7; continue; }
      p = b[sq];
      if (!p || typeOf(p) !== PAWN) continue;
      c = colorOf(p);
      var fl = fileOf(sq), rk = rankOf(sq);
      pawnsFile[c][fl]++;
      if (rk < minR[c][fl]) minR[c][fl] = rk;
      if (rk > maxR[c][fl]) maxR[c][fl] = rk;
    }

    var attackScore = 0, centreScore = 0, passerScore = 0, rookScore = 0, safetyScore = 0;
    var wk = g.kings[WHITE], bk = g.kings[BLACK];

    /* pass 2 — everything else */
    for (sq = 0; sq < 128; sq++) {
      if (offBoard(sq)) { sq += 7; continue; }
      p = b[sq];
      if (p === 0) continue;
      t = typeOf(p); c = colorOf(p);
      i64 = c === WHITE ? idx64(sq) : (idx64(sq) ^ 56);
      var sign = c === WHITE ? 1 : -1;
      var v = VALUE[t] * S.material;

      if (t === BISHOP) bishops[c]++;
      if (t !== PAWN && t !== KING) phase += (t === QUEEN ? 4 : (t === ROOK ? 2 : 1));

      var pstMg = (t === KING) ? PST_KING_MG[i64] : PST[t][i64];
      var pstEg = (t === KING) ? PST_KING_EG[i64] : PST[t][i64];
      if (c === WHITE) { mg += v + pstMg; eg += v + pstEg; }
      else             { mg -= v + pstMg; eg -= v + pstEg; }

      /* centre occupation */
      if (t === PAWN || t === KNIGHT || t === BISHOP) centreScore += sign * CENTRE[idx64(sq)];

      /* pressure on the enemy king */
      if (t !== PAWN && t !== KING) {
        var ek = c === WHITE ? bk : wk;
        var df = Math.abs(fileOf(sq) - fileOf(ek));
        var dr = Math.abs(rankOf(sq) - rankOf(ek));
        var cheb = df > dr ? df : dr;
        if (cheb <= 4) {
          var near = (5 - cheb);
          var wgt = (t === QUEEN ? 5 : (t === ROOK ? 3 : 2));
          attackScore += sign * near * wgt;
        }
      }

      /* passed pawns */
      if (t === PAWN) {
        var fl2 = fileOf(sq), rk2 = rankOf(sq), opp = c ^ 1;
        var blocked = false;
        for (var d = -1; d <= 1; d++) {
          var nf = fl2 + d;
          if (nf < 0 || nf > 7) continue;
          if (pawnsFile[opp][nf] === 0) continue;
          // "ahead" = toward the mover's promotion square (white travels to rank index 0)
          if (c === WHITE ? (minR[opp][nf] < rk2) : (maxR[opp][nf] > rk2)) { blocked = true; break; }
        }
        if (!blocked) {
          var adv = c === WHITE ? (6 - rk2) : (rk2 - 1);
          if (adv > 0) passerScore += sign * (8 + adv * adv * 3);
        }
      }

      /* rooks like open and half-open files */
      if (t === ROOK) {
        var rf = fileOf(sq);
        if (pawnsFile[c][rf] === 0) rookScore += sign * (pawnsFile[c ^ 1][rf] === 0 ? 22 : 11);
      }

      /* pawn shield in front of the king */
      if (t === KING) {
        var kf = fileOf(sq), shield = 0;
        for (var sfd = -1; sfd <= 1; sfd++) {
          var sf = kf + sfd;
          if (sf < 0 || sf > 7) continue;
          if (pawnsFile[c][sf] > 0) shield++;
        }
        safetyScore += sign * (shield * 9 - 14);
      }
    }

    if (bishops[WHITE] >= 2) { mg += 30 * S.bishops; eg += 45 * S.bishops; }
    if (bishops[BLACK] >= 2) { mg -= 30 * S.bishops; eg -= 45 * S.bishops; }

    /* doubled and isolated pawns */
    for (var c2 = 0; c2 < 2; c2++) {
      var sg = c2 === WHITE ? 1 : -1;
      for (var ff = 0; ff < 8; ff++) {
        var n = pawnsFile[c2][ff];
        if (n === 0) continue;
        if (n > 1) { mg -= sg * 18 * (n - 1) * S.pawns; eg -= sg * 28 * (n - 1) * S.pawns; }
        var left = ff > 0 ? pawnsFile[c2][ff - 1] : 0;
        var right = ff < 7 ? pawnsFile[c2][ff + 1] : 0;
        if (left === 0 && right === 0) { mg -= sg * 16 * S.pawns; eg -= sg * 22 * S.pawns; }
      }
    }

    var ph = phase > 24 ? 24 : phase;
    var score = ((mg * ph) + (eg * (24 - ph))) / 24;

    score += attackScore * S.kingAttack * (ph / 24);     // attacks matter in the middlegame
    score += centreScore * S.centre * (ph / 24);
    score += passerScore * S.passers * (1 + (24 - ph) / 24);
    score += rookScore * S.rooks;
    score += safetyScore * S.safety * (ph / 24);

    score += (g.turn === WHITE ? 8 : -8);
    if (contempt) score += (g.turn === WHITE ? -contempt : contempt);

    return g.turn === WHITE ? score : -score;
  }

  /* ------------------------------------------------------- search object */
  function Search(game, opts) {
    this.g = game;
    this.opts = opts || {};
    this.tt = new Map();
    this.killers = [];
    this.history = {};
    this.nodes = 0;
    this.stopAt = 0;
    this.aborted = false;
  }

  Search.prototype.timeUp = function () {
    if (this.aborted) return true;
    if ((this.nodes & 1023) === 0 && Date.now() > this.stopAt) this.aborted = true;
    return this.aborted;
  };

  /** order moves: TT move, then MVV-LVA captures, killers, history */
  Search.prototype.order = function (moves, ply, ttMove) {
    var g = this.g, hist = this.history;
    var k = this.killers[ply] || (this.killers[ply] = [null, null]);
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i], s = 0;
      if (ttMove && m.from === ttMove.from && m.to === ttMove.to && m.promo === ttMove.promo) {
        s = 1000000;
      } else if (m.flags & E.FLAG_CAPTURE) {
        var victim = m.captured ? VALUE[typeOf(m.captured)] : 100;
        var attacker = VALUE[typeOf(g.board[m.from])];
        s = 100000 + victim * 10 - attacker;
      } else if (k[0] && m.from === k[0].from && m.to === k[0].to) {
        s = 90000;
      } else if (k[1] && m.from === k[1].from && m.to === k[1].to) {
        s = 89000;
      } else {
        s = hist[(m.from << 8) | m.to] || 0;
      }
      if (m.flags & E.FLAG_PROMO) s += VALUE[m.promo] * 5;
      m._s = s;
    }
    moves.sort(function (a, b) { return b._s - a._s; });
    return moves;
  };

  /** captures-only search to reach a quiet position */
  Search.prototype.quiesce = function (alpha, beta, ply) {
    this.nodes++;
    if (this.timeUp()) return alpha;

    var stand = evaluate(this.g, this.opts);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 24) return stand;

    var g = this.g;
    var moves = this.order(g.generateMoves({ captures: true }), ply, null);

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      // delta pruning
      if (m.captured && stand + VALUE[typeOf(m.captured)] + 200 < alpha) continue;

      g.makeMove(m);
      if (g.isAttacked(g.kings[g.turn ^ 1], g.turn)) { g.undoMove(); continue; }
      var score = -this.quiesce(-beta, -alpha, ply + 1);
      g.undoMove();

      if (this.aborted) return alpha;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  Search.prototype.negamax = function (depth, alpha, beta, ply, allowNull) {
    this.nodes++;
    if (this.timeUp()) return alpha;

    var g = this.g;
    var alphaOrig = alpha;

    // draw detection inside the tree
    if (ply > 0) {
      if (g.halfMoves >= 100 || g.insufficientMaterial()) return 0;
      var rep = 0;
      for (var h = g.history.length - 2; h >= 0 && h >= g.history.length - 40; h -= 2) {
        if (g.history[h].hash === g.hash) { rep++; break; }
      }
      if (rep) return 0;
    }

    var key = g.hash;
    var entry = this.tt.get(key);
    var ttMove = null;
    if (entry) {
      ttMove = entry.move;
      if (entry.depth >= depth && ply > 0) {
        if (entry.flag === 0) return entry.score;
        if (entry.flag === 1 && entry.score > alpha) alpha = entry.score;
        if (entry.flag === 2 && entry.score < beta) beta = entry.score;
        if (alpha >= beta) return entry.score;
      }
    }

    var inCheck = g.isAttacked(g.kings[g.turn], g.turn ^ 1);
    if (inCheck) depth++;                                  // check extension

    if (depth <= 0) return this.quiesce(alpha, beta, ply);

    // null-move pruning
    if (allowNull && !inCheck && depth >= 3 && ply > 0 && this.hasNonPawn(g.turn)) {
      var savedEp = g.epSquare, savedHash = g.hash;
      g.turn ^= 1; g.epSquare = -1; g.hash = g.computeHash();
      var nullScore = -this.negamax(depth - 3, -beta, -beta + 1, ply + 1, false);
      g.turn ^= 1; g.epSquare = savedEp; g.hash = savedHash;
      if (this.aborted) return alpha;
      if (nullScore >= beta) return beta;
    }

    var moves = this.order(g.generateMoves(), ply, ttMove);
    var best = -INF, bestMove = null, legal = 0;

    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      g.makeMove(m);
      if (g.isAttacked(g.kings[g.turn ^ 1], g.turn)) { g.undoMove(); continue; }
      legal++;

      var score;
      if (legal === 1) {
        score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
      } else {
        // late move reduction for quiet moves
        var red = (depth >= 3 && legal > 4 && !(m.flags & E.FLAG_CAPTURE) && !inCheck) ? 1 : 0;
        score = -this.negamax(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (score > alpha && score < beta) {
          score = -this.negamax(depth - 1, -beta, -alpha, ply + 1, true);
        }
      }
      g.undoMove();
      if (this.aborted) return best > -INF ? best : alpha;

      if (score > best) { best = score; bestMove = m; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!(m.flags & E.FLAG_CAPTURE)) {
          var k = this.killers[ply] || (this.killers[ply] = [null, null]);
          k[1] = k[0]; k[0] = m;
          var hk = (m.from << 8) | m.to;
          this.history[hk] = (this.history[hk] || 0) + depth * depth;
        }
        break;
      }
    }

    if (legal === 0) return inCheck ? -MATE + ply : 0;      // mate or stalemate

    var flag = best <= alphaOrig ? 2 : (best >= beta ? 1 : 0);
    if (this.tt.size < 300000) this.tt.set(key, { depth: depth, score: best, flag: flag, move: bestMove });
    return best;
  };

  Search.prototype.hasNonPawn = function (color) {
    var b = this.g.board;
    for (var sq = 0; sq < 128; sq++) {
      if (offBoard(sq)) { sq += 7; continue; }
      var p = b[sq];
      if (p === 0) continue;
      var t = typeOf(p);
      if (colorOf(p) === color && t !== PAWN && t !== KING) return true;
    }
    return false;
  };

  /** Score every root move; returns [{move, score, san}] best-first. */
  Search.prototype.rootScores = function (maxDepth, budgetMs) {
    var g = this.g;
    this.stopAt = Date.now() + budgetMs;
    this.aborted = false;

    var roots = g.moves();
    if (roots.length === 0) return [];

    var scored = roots.map(function (m) { return { move: m, score: -INF }; });
    var completed = null;

    for (var d = 1; d <= maxDepth; d++) {
      var pass = [], alpha = -INF;
      for (var i = 0; i < scored.length; i++) {
        var m = scored[i].move;
        g.makeMove(m);
        var s = -this.negamax(d - 1, -INF, INF, 1, true);
        g.undoMove();
        if (this.aborted) break;
        pass.push({ move: m, score: s });
      }
      if (this.aborted) break;
      pass.sort(function (a, b) { return b.score - a.score; });
      scored = pass;
      completed = pass;
      this.depthReached = d;
      // stop early on forced mate
      if (pass[0].score > MATE - 100) break;
      if (Date.now() > this.stopAt) break;
    }
    return completed || scored;
  };

  /* ------------------------------------------------------ public wrapper */

  /**
   * Pick a move for `bot` in position `game`.
   * Weakening model: search honestly, then choose from the root list with a
   * bot-specific tolerance window so weaker bots genuinely miss things.
   */
  function cheb(a, b) {
    var df = Math.abs(fileOf(a) - fileOf(b));
    var dr = Math.abs(rankOf(a) - rankOf(b));
    return df > dr ? df : dr;
  }

  /** personality nudge applied to root scores, in centipawns */
  function styleBias(g, m, style) {
    var bonus = 0;
    if (style.aggression) {
      var mover = colorOf(g.board[m.from]);
      var ek = g.kings[mover ^ 1];
      g.makeMove(m);
      var check = g.isAttacked(g.kings[g.turn], g.turn ^ 1);
      g.undoMove();
      if (check) bonus += 50 * style.aggression;
      if (m.flags & E.FLAG_CAPTURE) bonus += 16 * style.aggression;
      var closer = cheb(m.from, ek) - cheb(m.to, ek);
      if (closer > 0) bonus += closer * 11 * style.aggression;
    }
    if (style.trade && (m.flags & E.FLAG_CAPTURE)) bonus += 18 * style.trade;
    return bonus;
  }

  function pickMove(game, bot, sanHistory) {
    var legal = game.moves();
    if (legal.length === 0) return null;

    /* follow the bot's opening repertoire while it lasts */
    var OB = root.ChessOpenings;
    if (OB && bot.book && sanHistory && sanHistory.length < 18) {
      var want = OB.next(sanHistory, bot.book);
      if (want) {
        var tgt = want.replace(/[+#!?]/g, '');
        for (var bi = 0; bi < legal.length; bi++) {
          if (game.moveToSan(legal[bi], legal).replace(/[+#!?]/g, '') === tgt) return legal[bi];
        }
      }
    }
    if (legal.length === 1) return legal[0];

    var style = bot.style || DEFAULT_STYLE;
    var s = new Search(game, { contempt: bot.contempt || 0, style: style });
    var scored = s.rootScores(bot.depth || 3, bot.timeMs || 800);
    if (!scored.length) return legal[Math.floor(Math.random() * legal.length)];

    if (style.aggression || style.trade) {
      for (var k = 0; k < scored.length; k++) {
        scored[k].score += styleBias(game, scored[k].move, style);
      }
      scored.sort(function (a, b) { return b.score - a.score; });
    }

    var best = scored[0].score;

    // outright blunder: pick from the weaker half of the move list
    if (bot.blunder && Math.random() < bot.blunder && scored.length > 2) {
      var tail = scored.slice(Math.max(1, Math.floor(scored.length * 0.35)));
      // never blunder away a forced mate that's available
      if (best < MATE - 100) {
        return tail[Math.floor(Math.random() * tail.length)].move;
      }
    }

    // otherwise choose randomly among moves within `spread` centipawns of best
    var window = bot.spread || 0;
    var pool = scored.filter(function (x) { return x.score >= best - window; });
    if (!pool.length) pool = [scored[0]];

    // weight the better moves a little higher
    var weights = pool.map(function (x, i) { return 1 / (1 + i * 0.6); });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i].move;
    }
    return pool[0].move;
  }

  /** Quick eval in pawns, from white's point of view (for the eval bar). */
  function quickEval(game) {
    var v = evaluate(game, {});
    return (game.turn === WHITE ? v : -v) / 100;
  }

  /** A short honest search, used for hints. */
  function bestMove(game, depth, ms) {
    var s = new Search(game, {});
    var scored = s.rootScores(depth || 4, ms || 1200);
    return scored.length ? scored[0].move : null;
  }

  var API = { pickMove: pickMove, bestMove: bestMove, evaluate: evaluate,
              quickEval: quickEval, Search: Search, VALUE: VALUE, MATE: MATE,
              DEFAULT_STYLE: DEFAULT_STYLE, styleBias: styleBias };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessAI = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
