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

  /* ---------------------------------------------- static exchange eval */

  /* 0x88 direction tables, mirrored from the engine so SEE can walk rays
     without generating moves. */
  var SEE_KN = [-33, -31, -18, -14, 14, 18, 31, 33];
  var SEE_BI = [-17, -15, 15, 17];
  var SEE_RK = [-16, -1, 1, 16];
  var SEE_KG = [-17, -16, -15, -1, 1, 15, 16, 17];

  var seeGone = new Uint8Array(128);
  var seeTouched = [];

  /* Cheapest piece of `side` that attacks `sq`, skipping squares already
     consumed by the exchange. Rays continue through consumed squares, which
     is what gives x-ray attackers (a rook behind a rook) for free. */
  function smallestAttacker(b, sq, side) {
    var i, s, p, t, best = -1, bestVal = 1e9, d;

    var pd = side === WHITE ? 16 : -16;      /* attacker sits "behind" */
    for (i = -1; i <= 1; i += 2) {
      s = sq + pd + i;
      if (s < 0 || offBoard(s) || seeGone[s]) continue;
      p = b[s];
      if (p && colorOf(p) === side && typeOf(p) === PAWN && VALUE[PAWN] < bestVal) {
        bestVal = VALUE[PAWN]; best = s;
      }
    }
    for (i = 0; i < 8; i++) {
      s = sq + SEE_KN[i];
      if (s < 0 || offBoard(s) || seeGone[s]) continue;
      p = b[s];
      if (p && colorOf(p) === side && typeOf(p) === KNIGHT && VALUE[KNIGHT] < bestVal) {
        bestVal = VALUE[KNIGHT]; best = s;
      }
    }
    for (i = 0; i < 4; i++) {
      d = SEE_BI[i];
      for (s = sq + d; s >= 0 && !offBoard(s); s += d) {
        if (seeGone[s]) continue;            /* x-ray straight through */
        p = b[s];
        if (!p) continue;
        if (colorOf(p) === side) {
          t = typeOf(p);
          if ((t === BISHOP || t === QUEEN) && VALUE[t] < bestVal) { bestVal = VALUE[t]; best = s; }
        }
        break;
      }
    }
    for (i = 0; i < 4; i++) {
      d = SEE_RK[i];
      for (s = sq + d; s >= 0 && !offBoard(s); s += d) {
        if (seeGone[s]) continue;
        p = b[s];
        if (!p) continue;
        if (colorOf(p) === side) {
          t = typeOf(p);
          if ((t === ROOK || t === QUEEN) && VALUE[t] < bestVal) { bestVal = VALUE[t]; best = s; }
        }
        break;
      }
    }
    for (i = 0; i < 8; i++) {
      s = sq + SEE_KG[i];
      if (s < 0 || offBoard(s) || seeGone[s]) continue;
      p = b[s];
      if (p && colorOf(p) === side && typeOf(p) === KING && VALUE[KING] < bestVal) {
        bestVal = VALUE[KING]; best = s;
      }
    }
    return best;
  }

  /**
   * What a capture is actually worth once both sides trade everything on the
   * square. Negative means the capture loses material. Without this the
   * quiescence search happily explored QxP-defended-by-a-pawn, which both
   * wasted an enormous number of nodes and polluted the scores it returned.
   */
  function see(g, move) {
    var b = g.board;
    var target = move.to;
    var attacker = b[move.from];
    if (!attacker) return 0;

    seeTouched.length = 0;

    var captured = move.captured ? VALUE[typeOf(move.captured)] : 0;
    if (move.flags & E.FLAG_EP) captured = VALUE[PAWN];

    var gain = [captured];
    var onSquare = VALUE[typeOf(attacker)];
    var side = colorOf(attacker) ^ 1;
    seeGone[move.from] = 1; seeTouched.push(move.from);

    var d = 0;
    for (;;) {
      var from = smallestAttacker(b, target, side);
      if (from < 0) break;
      d++;
      gain[d] = onSquare - gain[d - 1];
      onSquare = VALUE[typeOf(b[from])];
      seeGone[from] = 1; seeTouched.push(from);
      side ^= 1;
      /* once continuing the exchange cannot help either side, stop */
      if (Math.max(-gain[d - 1], gain[d]) < 0) break;
    }
    /* Fold the exchange back: each side takes the trade only if it beats
       standing still. This must run for d === 1 as well -- writing it as
       `while (--d > 0)` skipped the single-recapture case, which is by far
       the most common one, and made every defended capture look free. */
    while (d > 0) { gain[d - 1] = -Math.max(-gain[d - 1], gain[d]); d--; }

    for (var i = 0; i < seeTouched.length; i++) seeGone[seeTouched[i]] = 0;
    return gain[0];
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

    var g = this.g;
    if (ply > 32) return evaluate(g, this.opts);

    var inCheck = g.isAttacked(g.kings[g.turn], g.turn ^ 1);
    var stand = 0, moves;

    if (inCheck) {
      /* You are not allowed to decline to answer a check, so there is no
         standing pat here. The old code evaluated the position statically and
         looked only at captures, which meant a side being mated or about to
         lose a piece to a check could be scored as perfectly healthy. That is
         the single biggest reason the bots blundered and defended badly. */
      moves = this.order(g.generateMoves(), ply, null);
    } else {
      stand = evaluate(g, this.opts);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      moves = this.order(g.generateMoves({ captures: true }), ply, null);
    }

    var legal = 0;
    /* SEE ordering: the captures that gain the most material go first, so
       quiescence cutoffs arrive much earlier and the quiet search stays deep. */
    for (var i = 0; i < moves.length; i++) moves[i]._see = see(g, moves[i]);
    moves.sort(function (a, b) { return b._see - a._see; });
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];

      if (!inCheck) {
        /* delta pruning: even winning this piece would not reach alpha */
        if (m.captured && stand + VALUE[typeOf(m.captured)] + 200 < alpha) continue;
        /* and never burn nodes on a capture that simply loses material */
        if (!(m.flags & E.FLAG_PROMO) && see(g, m) < 0) continue;
      }

      g.makeMove(m);
      if (g.isAttacked(g.kings[g.turn ^ 1], g.turn)) { g.undoMove(); continue; }
      legal++;
      var score = -this.quiesce(-beta, -alpha, ply + 1);
      g.undoMove();

      if (this.aborted) return alpha;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    /* no way out of check at all is mate, and it must be reported as mate */
    if (inCheck && legal === 0) return -MATE + ply;
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

    /* mate distance pruning: a mate already found closer to the root can
       never be beaten by one found deeper, so stop looking. */
    if (ply > 0) {
      var mdA = alpha > -MATE + ply ? alpha : -MATE + ply;
      var mdB = beta < MATE - ply - 1 ? beta : MATE - ply - 1;
      if (mdA >= mdB) return mdA;
      alpha = mdA; beta = mdB;
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
      var R = depth > 6 ? 4 : 3;      /* reduce harder when there is depth to spare */
      var nullScore = -this.negamax(depth - R, -beta, -beta + 1, ply + 1, false);
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
        /* Reduce quiet moves further the later they appear and the deeper
           the search: the move ordering is good enough that move 15 at depth
           8 is very unlikely to be best, and the re-search catches mistakes. */
        var red = 0;
        if (depth >= 3 && legal > 3 && !(m.flags & E.FLAG_CAPTURE) && !(m.flags & E.FLAG_PROMO) && !inCheck) {
          red = 1;
          if (legal > 6 && depth >= 5) red = 2;
          if (legal > 12 && depth >= 7) red = 3;
          if (red >= depth - 1) red = depth - 2;
          if (red < 0) red = 0;
        }
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
    /* The table used to simply stop storing once full, so every deep search
       ran the back half of its time with no table at all. Clearing is crude
       but keeps the most recent, most relevant entries flowing. */
    if (this.tt.size >= 400000) this.tt.clear();
    this.tt.set(key, { depth: depth, score: best, flag: flag, move: bestMove });
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
  /**
   * Search the root move list.
   *
   * `needAllScores` exists because the weakening model picks from the scored
   * list within a tolerance window, so the weaker bots genuinely need a real
   * score for every root move. That forces a full window on every move and
   * throws away alpha-beta at the root entirely, which is enormously
   * expensive -- it was costing the strongest bots about two ply.
   *
   * Bots that always play the best move (spread 0, blunder 0) do not need
   * those scores, so they get proper principal variation search at the root
   * plus an aspiration window, and search far deeper in the same time.
   */
  /**
   * Normalise the root score-fidelity argument.
   *
   *   true  / undefined -> Infinity, an exact score for every root move
   *   false             -> 0, best move only (full principal variation search)
   *   a number          -> exact scores only for moves within that many
   *                        centipawns of the best; anything worse may come
   *                        back as an upper bound.
   *
   * The weakening model only ever inspects moves inside its tolerance window,
   * and its blunder path samples the tail uniformly, so bounds below the
   * window cannot change which move is chosen.
   */
  function rootTolerance(v) {
    if (v === undefined || v === true) return Infinity;
    if (v === false) return 0;
    var n = +v;
    return isFinite(n) && n > 0 ? n : 0;
  }

  /** Search one already-made root move at the required fidelity. */
  Search.prototype.rootProbe = function (d, isFirst, alpha, beta, tol) {
    if (tol === Infinity) return -this.negamax(d - 1, -INF, INF, 1, true);
    if (isFirst) return -this.negamax(d - 1, -beta, -alpha, 1, true);
    var lo = alpha - tol;
    if (!(lo > -INF)) lo = -INF;
    var sc = -this.negamax(d - 1, -lo - 1, -lo, 1, true);
    if (sc > lo) sc = -this.negamax(d - 1, -beta, -lo, 1, true);
    return sc;
  };

  /** How far below the best move this bot could still pick from. */
  function botTolerance(bot, style) {
    if (!bot) return 0;
    style = style || bot.style || DEFAULT_STYLE;
    var tol = bot.spread || 0;
    tol += 170 * (style.aggression || 0) + 20 * (style.trade || 0);
    if (bot.blunder) tol += 150;
    /* headroom for the small score drift the narrow root windows introduce */
    tol += 300;
    return tol;
  }

  Search.prototype.rootScores = function (maxDepth, budgetMs, needAllScores) {
    var tol = rootTolerance(needAllScores);
    needAllScores = tol === Infinity;
    var g = this.g;
    this.stopAt = Date.now() + budgetMs;
    this.aborted = false;

    var roots = g.moves();
    if (roots.length === 0) return [];

    var scored = roots.map(function (m) { return { move: m, score: -INF }; });
    var completed = null;
    var prevBest = 0;

    for (var d = 1; d <= maxDepth; d++) {
      var pass = [];
      var alpha, beta, window = 40;

      for (;;) {                       /* aspiration, widening on failure */
        /* Aspiration only in pure best-move mode; with a tolerance window the
           scores below best must stay comparable, so keep the window open. */
        if (tol === 0 && d >= 4) {
          alpha = prevBest - window; beta = prevBest + window;
        } else {
          alpha = -INF; beta = INF;
        }
        pass = [];
        var failed = false;

        for (var i = 0; i < scored.length; i++) {
          var m = scored[i].move;
          g.makeMove(m);
          var sc = this.rootProbe(d, i === 0, alpha, beta, tol);
          g.undoMove();
          if (this.aborted) break;
          pass.push({ move: m, score: sc });
          if (tol !== Infinity && sc > alpha) alpha = sc;
        }

        if (this.aborted) break;
        if (tol !== 0 || d < 4) break;

        var bestNow = pass.length ? Math.max.apply(null, pass.map(function (x) { return x.score; })) : 0;
        if (bestNow <= alphaFloor(prevBest, window) || bestNow >= prevBest + window) {
          /* the true score lay outside the window: widen and redo this depth */
          window *= 4;
          if (window > 2000) { window = INF; }
          failed = true;
        }
        if (!failed) break;
        if (window === INF) {
          alpha = -INF; beta = INF;
        }
        if (Date.now() > this.stopAt) break;
      }

      if (this.aborted) break;
      if (!pass.length) break;
      pass.sort(function (a, b) { return b.score - a.score; });
      scored = pass;
      completed = pass;
      prevBest = pass[0].score;
      this.depthReached = d;
      if (pass[0].score > MATE - 100) break;        /* forced mate found */
      if (Date.now() > this.stopAt) break;
    }
    return completed || scored;
  };

  function alphaFloor(prev, window) { return prev - window; }

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

    /* the adjustable human opponent runs on a different model entirely */
    if (bot && bot.human && root.ChessHuman) {
      return root.ChessHuman.pickMove(game, bot, sanHistory);
    }

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
    /* A bot that never deviates from the best move does not need a score
       for every root move, so it can use real alpha-beta at the root. */
    var scored = s.rootScores(bot.depth || 3, bot.timeMs || 800, botTolerance(bot, style));
    if (!scored.length) return legal[Math.floor(Math.random() * legal.length)];

    return selectFromScored(game, bot, scored, style);
  }

  /* ------------------------------------------------------------------ traps */
  /* For every candidate root move, count how many of the opponent's replies
     walk into a tactic we can punish on the following move. A move that
     poisons the position -- most replies lose material -- is a trap, and
     trap-loving personalities (The Professor, Lelouch, Sherlock, ...) are
     biased toward playing them. This is the "make the opponent blunder"
     layer: the move looks innocent, but most answers lose material. */
  function trapBias(game, m, style, bot) {
    var w = (style && style.trapWeight) || (bot && bot.trapWeight) || 0;
    if (!w || game.inCheck(game.turn)) return 0;
    var g2 = new E.Chess(game.fen());
    g2.makeMove(m);
    var replies = g2.moves();
    var n = replies.length, checked = 0, traps = 0;
    if (!n) return 0;
    for (var j = 0; j < n && checked < 16; j++) {
      var r = replies[j];
      g2.makeMove(r);
      checked++;
      var canPunish = false;
      var our = g2.moves();
      for (var k = 0; k < our.length && !canPunish; k++) {
        var o = our[k];
        if ((o.flags & E.FLAG_CAPTURE) && see(g2, o) >= 0) canPunish = true;
      }
      g2.undoMove();
      if (canPunish) traps++;
    }
    return (traps / checked) * w;
  }

  /* ------------------------------------------------------------------ quick win */
  /* "Beat the opponent in as few moves as possible" layer. Used by the most
     attacking characters (The Professor, Levi, Pablo, ...). It nudges the
     choice toward moves that give check, squeeze the enemy king's mobility,
     and close the mate net -- so the bot hunts a fast finish instead of
     drifting into a long, drawish grind. */
  function quickWinBias(game, m, bot) {
    var w = bot && bot.quickWin || 0;
    if (!w) return 0;
    var bonus = 0;
    var g2 = new E.Chess(game.fen());
    g2.makeMove(m);
    var check = g2.isAttacked(g2.kings[g2.turn], g2.turn ^ 1);
    if (check) bonus += 50 * w;                                // a check forces a reply
    var after = g2.moves().length;                             // opponent mobility now
    if (after <= 2) bonus += 120 * w;                          // almost mated
    else if (after <= 5) bonus += 60 * w;                      // king boxing in
    g2.undoMove();
    return bonus;
  }

  /**
   * Turn a scored root-move list into an actual choice.
   * Extracted so the synchronous and asynchronous search paths cannot drift
   * apart — a bot must play identically whichever driver produced the list.
   *
   * Deterministic bots (spread 0, blunder 0) play the engine's exact best
   * move — full strength, no personality distortion. Personality bias
   * (aggression / traps / quick-win) only ever acts as a tiebreaker among
   * moves already inside the tolerance window of a weaker, randomised bot.
   */
  function selectFromScored(game, bot, scored, style) {
    style = style || bot.style || DEFAULT_STYLE;
    var deterministic = bot && bot.spread === 0 && bot.blunder === 0;

    var best = scored[0].score;
    if (best > MATE - 100) return scored[0].move;   // take the forced mate

    if (!deterministic) {
      var needBias = style.aggression || style.trade || (bot && bot.trapWeight) || (bot && bot.quickWin);
      if (needBias) {
        for (var k = 0; k < scored.length; k++) {
          scored[k].score += styleBias(game, scored[k].move, style);
          if (bot && bot.trapWeight) scored[k].score += trapBias(game, scored[k].move, style, bot);
          if (bot && bot.quickWin) scored[k].score += quickWinBias(game, scored[k].move, bot);
        }
        scored.sort(function (a, b) { return b.score - a.score; });
        best = scored[0].score;
      }

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

    // deterministic full-strength bot: engine best, every time
    return scored[0].move;
  }

  /* ---------------------------------------------- non-blocking search */

  /**
   * The synchronous search holds the thread for its entire time budget, so a
   * three-second think at high Elo freezes the clock, the animations and
   * every tap. A Web Worker would be the textbook answer, but workers cannot
   * be constructed from a file:// origin, and serving the assets over a real
   * origin instead would move localStorage and silently wipe the saved games
   * of everyone upgrading. So the search is sliced on the main thread: it
   * runs for a few milliseconds, hands control back so the UI can paint, and
   * resumes. Same moves, same strength, no freeze.
   */
  /* 90ms: the timer clamp costs a fixed ~4ms per yield, so a short slice is
     dominated by that overhead -- at 20ms it doubled the search time. 90ms
     keeps the longest block well under the ~100ms that reads as instant,
     while cutting the yield tax down to a few per cent. Long enough that the ~4ms minimum timer delay
     costs only about a sixth of the search, short enough that no slice can be
     felt as a stutter. A MessageChannel yield avoids that 4ms clamp, but it
     starves timers (the clock stops ticking) and keeps a node process alive
     forever, which broke the test runner -- so a plain timer it is. */
  var SLICE_MS = 90;

  function yieldThen(fn) { setTimeout(fn, 0); }

  Search.prototype.rootScoresAsync = function (maxDepth, budgetMs, done, needAllScores) {
    var tol = rootTolerance(needAllScores);
    needAllScores = tol === Infinity;
    var self = this, g = this.g;
    this.stopAt = Date.now() + budgetMs;
    this.aborted = false;

    var roots = g.moves();
    if (roots.length === 0) return void done([]);

    var scored = roots.map(function (m) { return { move: m, score: -INF }; });
    var completed = null, d = 1, i = 0, pass = [];
    /* Mirrors the synchronous rootScores: principal variation search plus an
       aspiration window whenever the caller does not need an exact score for
       every root move. This is the path the app actually runs, so it has to
       carry the same strength as the sync version, just spread across slices. */
    var prevBest = 0, window = 40, alpha = -INF, beta = INF;

    function openWindow() {
      if (tol === 0 && d >= 4 && window !== INF) {
        alpha = prevBest - window; beta = prevBest + window;
      } else { alpha = -INF; beta = INF; }
    }
    openWindow();

    function finish() { done(completed || scored); }

    function step() {
      if (self.cancelled) return void finish();
      var sliceEnd = Date.now() + SLICE_MS;
      for (;;) {
        if (i >= scored.length) {
          if (tol === 0 && d >= 4 && window !== INF && pass.length) {
            var bestNow = -INF;
            for (var k = 0; k < pass.length; k++) {
              if (pass[k].score > bestNow) bestNow = pass[k].score;
            }
            if (bestNow <= prevBest - window || bestNow >= prevBest + window) {
              window = window > 500 ? INF : window * 4;   /* widen and redo */
              i = 0; pass = []; openWindow();
              if (Date.now() > self.stopAt) return void finish();
              continue;
            }
          }
          pass.sort(function (a, b) { return b.score - a.score; });
          scored = pass; completed = pass; self.depthReached = d;
          var forced = pass.length && pass[0].score > MATE - 100;
          if (pass.length) prevBest = pass[0].score;
          d++; i = 0; pass = []; window = 40; openWindow();
          if (forced || d > maxDepth || Date.now() > self.stopAt) return void finish();
          continue;
        }
        var m = scored[i].move;
        g.makeMove(m);
        var sc = self.rootProbe(d, i === 0, alpha, beta, tol);
        g.undoMove();
        if (self.aborted) return void finish();
        pass.push({ move: m, score: sc });
        if (!needAllScores && sc > alpha) alpha = sc;
        i++;
        if (Date.now() >= sliceEnd) break;
      }
      yieldThen(step);
    }
    /* Always defer the first slice. A fast search can finish inside one
       slice, and if that ran inline the callback would fire before this
       function had even returned -- so the caller could not hold, let alone
       cancel, the handle. An async API must never sometimes be synchronous. */
    yieldThen(step);
  };

  /**
   * Asynchronous twin of pickMove. Calls back with the chosen move.
   * Returns a handle with .cancel() so a new game or a takeback can abandon a
   * search already in flight instead of letting it land on a dead position.
   */
  function pickMoveAsync(game, bot, sanHistory, cb) {
    var handle = { cancelled: false, cancel: function () { this.cancelled = true; } };

    /* The human model and the opening book both answer instantly; defer them
       by one tick anyway so callers always see consistent async behaviour. */
    var quick = null, haveQuick = false;
    try {
      var legalNow = game.moves();
      if (legalNow.length === 1) { quick = legalNow[0]; haveQuick = true; }
    } catch (e) { /* fall through to the search */ }

    if (!haveQuick && bot && bot.human) {
      try { quick = pickMove(game, bot, sanHistory); haveQuick = true; } catch (e) {}
    }
    if (haveQuick) {
      yieldThen(function () { if (!handle.cancelled) cb(quick); });
      return handle;
    }

    var style = (bot && bot.style) || DEFAULT_STYLE;
    var s = new Search(game, { contempt: (bot && bot.contempt) || 0, style: style });
    handle.cancel = function () { handle.cancelled = true; s.cancelled = true; s.aborted = true; };

    /* Bots that always play the best move do not need a score for every root
       move, which lets the root use real alpha-beta and reach ~2 ply deeper. */
    s.rootScoresAsync((bot && bot.depth) || 3, (bot && bot.timeMs) || 800, function (scored) {
      if (handle.cancelled) return;
      if (!scored.length) {
        var legal = game.moves();
        return cb(legal.length ? legal[Math.floor(Math.random() * legal.length)] : null);
      }
      cb(selectFromScored(game, bot || {}, scored, style));
    }, botTolerance(bot, style));
    return handle;
  }

  /** Asynchronous twin of bestMove, used for hints and the eval bar. */
  function bestMoveAsync(game, depth, ms, cb) {
    var s = new Search(game, {});
    var handle = { cancel: function () { s.cancelled = true; s.aborted = true; } };
    s.rootScoresAsync(depth || 4, ms || 1200, function (scored) {
      cb(scored.length ? scored[0].move : null, scored);
    }, false);
    return handle;
  }

  /** Quick eval in pawns, from white's point of view (for the eval bar). */
  function quickEval(game) {
    var v = evaluate(game, {});
    return (game.turn === WHITE ? v : -v) / 100;
  }

  /** A short honest search, used for hints. */
  function bestMove(game, depth, ms) {
    var s = new Search(game, {});
    var scored = s.rootScores(depth || 4, ms || 1200, false);
    return scored.length ? scored[0].move : null;
  }

  var API = { pickMove: pickMove, bestMove: bestMove, evaluate: evaluate, see: see, botTolerance: botTolerance,
              pickMoveAsync: pickMoveAsync, bestMoveAsync: bestMoveAsync,
              selectFromScored: selectFromScored,
              quickEval: quickEval, Search: Search, VALUE: VALUE, MATE: MATE,
              DEFAULT_STYLE: DEFAULT_STYLE, styleBias: styleBias };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessAI = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
