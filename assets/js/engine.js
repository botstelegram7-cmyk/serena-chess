/* =========================================================================
   engine.js — complete chess rules engine (0x88 board representation)
   Works in both the browser and Node (for perft testing).
   =========================================================================
   Squares: 0x00 = a8 ... 0x07 = h8 ... 0x70 = a1 ... 0x77 = h1
   (matches FEN reading order; white pawns move toward lower indices)
   ========================================================================= */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------ constants */
  var WHITE = 0, BLACK = 1;
  var EMPTY = 0;
  var PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;

  var FLAG_NORMAL = 0,
      FLAG_CAPTURE = 1,
      FLAG_BIGPAWN = 2,
      FLAG_EP = 4,
      FLAG_PROMO = 8,
      FLAG_KCASTLE = 16,
      FLAG_QCASTLE = 32;

  var C_WK = 1, C_WQ = 2, C_BK = 4, C_BQ = 8;

  var KNIGHT_DIRS = [-33, -31, -18, -14, 14, 18, 31, 33];
  var BISHOP_DIRS = [-17, -15, 15, 17];
  var ROOK_DIRS   = [-16, -1, 1, 16];
  var KING_DIRS   = [-17, -16, -15, -1, 1, 15, 16, 17];

  var PIECE_CHAR = ['', 'p', 'n', 'b', 'r', 'q', 'k'];
  var CHAR_PIECE = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };

  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  /* --------------------------------------------------------- small helpers */
  function piece(type, color) { return type | (color << 3); }
  function typeOf(p)  { return p & 7; }
  function colorOf(p) { return p >> 3; }
  function offBoard(sq) { return (sq & 0x88) !== 0; }
  function rankOf(sq) { return sq >> 4; }         // 0 = rank 8, 7 = rank 1
  function fileOf(sq) { return sq & 15; }         // 0 = a, 7 = h

  function algebraic(sq) {
    return 'abcdefgh'[fileOf(sq)] + (8 - rankOf(sq));
  }
  function fromAlgebraic(s) {
    var f = s.charCodeAt(0) - 97;
    var r = 8 - parseInt(s[1], 10);
    return r * 16 + f;
  }

  /* ----------------------------------------------------- zobrist hash keys */
  var Z_PIECES, Z_SIDE, Z_CASTLE, Z_EP;
  (function initZobrist() {
    // xorshift32 with a fixed seed -> deterministic keys across runs
    var seed = 0x2f6e2b1;
    function rnd() {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5;  seed >>>= 0;
      return seed >>> 0;
    }
    Z_PIECES = [];
    for (var p = 0; p < 16; p++) {
      Z_PIECES[p] = new Int32Array(128);
      for (var s = 0; s < 128; s++) Z_PIECES[p][s] = rnd() | 0;
    }
    Z_SIDE = rnd() | 0;
    Z_CASTLE = new Int32Array(16);
    for (var c = 0; c < 16; c++) Z_CASTLE[c] = rnd() | 0;
    Z_EP = new Int32Array(128);
    for (var e = 0; e < 128; e++) Z_EP[e] = rnd() | 0;
  })();

  /* ============================================================== the game */
  function Chess(fen) {
    this.board = new Int8Array(128);
    this.kings = [-1, -1];
    this.turn = WHITE;
    this.castling = 0;
    this.epSquare = -1;
    this.halfMoves = 0;
    this.moveNumber = 1;
    this.history = [];
    this.hash = 0;
    this.load(fen || START_FEN);
  }

  Chess.prototype.clear = function () {
    this.board = new Int8Array(128);
    this.kings = [-1, -1];
    this.turn = WHITE;
    this.castling = 0;
    this.epSquare = -1;
    this.halfMoves = 0;
    this.moveNumber = 1;
    this.history = [];
    this.hash = 0;
  };

  Chess.prototype.load = function (fen) {
    this.clear();
    var parts = fen.split(/\s+/);
    var rows = parts[0].split('/');
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var i = 0; i < rows[r].length; i++) {
        var ch = rows[r][i];
        if (ch >= '1' && ch <= '8') {
          f += parseInt(ch, 10);
        } else {
          var color = ch === ch.toUpperCase() ? WHITE : BLACK;
          var t = CHAR_PIECE[ch.toLowerCase()];
          var sq = r * 16 + f;
          this.board[sq] = piece(t, color);
          if (t === KING) this.kings[color] = sq;
          f++;
        }
      }
    }
    this.turn = (parts[1] === 'b') ? BLACK : WHITE;

    var cast = parts[2] || '-';
    if (cast.indexOf('K') > -1) this.castling |= C_WK;
    if (cast.indexOf('Q') > -1) this.castling |= C_WQ;
    if (cast.indexOf('k') > -1) this.castling |= C_BK;
    if (cast.indexOf('q') > -1) this.castling |= C_BQ;

    this.epSquare = (parts[3] && parts[3] !== '-') ? fromAlgebraic(parts[3]) : -1;
    this.halfMoves = parts[4] ? parseInt(parts[4], 10) : 0;
    this.moveNumber = parts[5] ? parseInt(parts[5], 10) : 1;
    this.hash = this.computeHash();
    return this;
  };

  Chess.prototype.fen = function () {
    var out = '';
    for (var r = 0; r < 8; r++) {
      var empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = this.board[r * 16 + f];
        if (p === EMPTY) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        var ch = PIECE_CHAR[typeOf(p)];
        out += colorOf(p) === WHITE ? ch.toUpperCase() : ch;
      }
      if (empty) out += empty;
      if (r < 7) out += '/';
    }
    var c = '';
    if (this.castling & C_WK) c += 'K';
    if (this.castling & C_WQ) c += 'Q';
    if (this.castling & C_BK) c += 'k';
    if (this.castling & C_BQ) c += 'q';
    return out + ' ' + (this.turn === WHITE ? 'w' : 'b') +
      ' ' + (c || '-') +
      ' ' + (this.epSquare >= 0 ? algebraic(this.epSquare) : '-') +
      ' ' + this.halfMoves + ' ' + this.moveNumber;
  };

  Chess.prototype.computeHash = function () {
    var h = 0;
    for (var sq = 0; sq < 128; sq++) {
      if (offBoard(sq)) continue;
      var p = this.board[sq];
      if (p !== EMPTY) h ^= Z_PIECES[p][sq];
    }
    if (this.turn === BLACK) h ^= Z_SIDE;
    h ^= Z_CASTLE[this.castling];
    if (this.epSquare >= 0) h ^= Z_EP[this.epSquare];
    return h | 0;
  };

  /* ------------------------------------------------------ attack detection */
  Chess.prototype.isAttacked = function (sq, byColor) {
    var b = this.board, i, d, t, p;

    // pawns
    var pawnDir = byColor === WHITE ? 16 : -16;   // attacker sits "behind"
    for (i = -1; i <= 1; i += 2) {
      var ps = sq + pawnDir + i;
      if (!offBoard(ps)) {
        p = b[ps];
        if (p !== EMPTY && colorOf(p) === byColor && typeOf(p) === PAWN) return true;
      }
    }
    // knights
    for (i = 0; i < 8; i++) {
      var ns = sq + KNIGHT_DIRS[i];
      if (offBoard(ns)) continue;
      p = b[ns];
      if (p !== EMPTY && colorOf(p) === byColor && typeOf(p) === KNIGHT) return true;
    }
    // king
    for (i = 0; i < 8; i++) {
      var ks = sq + KING_DIRS[i];
      if (offBoard(ks)) continue;
      p = b[ks];
      if (p !== EMPTY && colorOf(p) === byColor && typeOf(p) === KING) return true;
    }
    // bishops / queens
    for (i = 0; i < 4; i++) {
      d = BISHOP_DIRS[i];
      for (var s = sq + d; !offBoard(s); s += d) {
        p = b[s];
        if (p === EMPTY) continue;
        if (colorOf(p) === byColor) { t = typeOf(p); if (t === BISHOP || t === QUEEN) return true; }
        break;
      }
    }
    // rooks / queens
    for (i = 0; i < 4; i++) {
      d = ROOK_DIRS[i];
      for (var s2 = sq + d; !offBoard(s2); s2 += d) {
        p = b[s2];
        if (p === EMPTY) continue;
        if (colorOf(p) === byColor) { t = typeOf(p); if (t === ROOK || t === QUEEN) return true; }
        break;
      }
    }
    return false;
  };

  Chess.prototype.inCheck = function (color) {
    if (color === undefined) color = this.turn;
    return this.isAttacked(this.kings[color], color ^ 1);
  };

  /* ------------------------------------------------------ move  generation */
  function mkMove(from, to, promo, flags, captured) {
    return { from: from, to: to, promo: promo || 0, flags: flags, captured: captured || 0 };
  }

  /** Pseudo-legal moves. opts.captures = only captures/promotions (quiescence) */
  Chess.prototype.generateMoves = function (opts) {
    var b = this.board, us = this.turn, them = us ^ 1;
    var onlyCaps = opts && opts.captures;
    var moves = [];
    var i, d, sq, to, p, t;

    for (sq = 0; sq < 128; sq++) {
      if (offBoard(sq)) { sq += 7; continue; }
      p = b[sq];
      if (p === EMPTY || colorOf(p) !== us) continue;
      t = typeOf(p);

      if (t === PAWN) {
        var fwd = us === WHITE ? -16 : 16;
        var startRank = us === WHITE ? 6 : 1;
        var promoRank = us === WHITE ? 0 : 7;

        to = sq + fwd;
        if (!offBoard(to) && b[to] === EMPTY) {
          if (rankOf(to) === promoRank) {
            if (true) {
              moves.push(mkMove(sq, to, QUEEN, FLAG_PROMO));
              moves.push(mkMove(sq, to, ROOK, FLAG_PROMO));
              moves.push(mkMove(sq, to, BISHOP, FLAG_PROMO));
              moves.push(mkMove(sq, to, KNIGHT, FLAG_PROMO));
            }
          } else if (!onlyCaps) {
            moves.push(mkMove(sq, to, 0, FLAG_NORMAL));
            var dbl = sq + fwd * 2;
            if (rankOf(sq) === startRank && b[dbl] === EMPTY) {
              moves.push(mkMove(sq, dbl, 0, FLAG_BIGPAWN));
            }
          }
        }
        for (i = -1; i <= 1; i += 2) {
          to = sq + fwd + i;
          if (offBoard(to)) continue;
          var tp = b[to];
          if (tp !== EMPTY && colorOf(tp) === them) {
            if (rankOf(to) === promoRank) {
              moves.push(mkMove(sq, to, QUEEN,  FLAG_PROMO | FLAG_CAPTURE, tp));
              moves.push(mkMove(sq, to, ROOK,   FLAG_PROMO | FLAG_CAPTURE, tp));
              moves.push(mkMove(sq, to, BISHOP, FLAG_PROMO | FLAG_CAPTURE, tp));
              moves.push(mkMove(sq, to, KNIGHT, FLAG_PROMO | FLAG_CAPTURE, tp));
            } else {
              moves.push(mkMove(sq, to, 0, FLAG_CAPTURE, tp));
            }
          } else if (tp === EMPTY && to === this.epSquare) {
            moves.push(mkMove(sq, to, 0, FLAG_EP | FLAG_CAPTURE, piece(PAWN, them)));
          }
        }
        continue;
      }

      if (t === KNIGHT || t === KING) {
        var dirs = t === KNIGHT ? KNIGHT_DIRS : KING_DIRS;
        for (i = 0; i < 8; i++) {
          to = sq + dirs[i];
          if (offBoard(to)) continue;
          var q = b[to];
          if (q === EMPTY) {
            if (!onlyCaps) moves.push(mkMove(sq, to, 0, FLAG_NORMAL));
          } else if (colorOf(q) === them) {
            moves.push(mkMove(sq, to, 0, FLAG_CAPTURE, q));
          }
        }
        continue;
      }

      // sliding pieces
      var sdirs = t === BISHOP ? BISHOP_DIRS : (t === ROOK ? ROOK_DIRS : KING_DIRS);
      for (i = 0; i < sdirs.length; i++) {
        d = sdirs[i];
        for (to = sq + d; !offBoard(to); to += d) {
          var r = b[to];
          if (r === EMPTY) {
            if (!onlyCaps) moves.push(mkMove(sq, to, 0, FLAG_NORMAL));
          } else {
            if (colorOf(r) === them) moves.push(mkMove(sq, to, 0, FLAG_CAPTURE, r));
            break;
          }
        }
      }
    }

    /* castling */
    if (!onlyCaps) {
      var kSq = this.kings[us];
      if (kSq >= 0 && !this.isAttacked(kSq, them)) {
        var kRight = us === WHITE ? C_WK : C_BK;
        var qRight = us === WHITE ? C_WQ : C_BQ;
        if (this.castling & kRight) {
          if (b[kSq + 1] === EMPTY && b[kSq + 2] === EMPTY &&
              !this.isAttacked(kSq + 1, them) && !this.isAttacked(kSq + 2, them)) {
            moves.push(mkMove(kSq, kSq + 2, 0, FLAG_KCASTLE));
          }
        }
        if (this.castling & qRight) {
          if (b[kSq - 1] === EMPTY && b[kSq - 2] === EMPTY && b[kSq - 3] === EMPTY &&
              !this.isAttacked(kSq - 1, them) && !this.isAttacked(kSq - 2, them)) {
            moves.push(mkMove(kSq, kSq - 2, 0, FLAG_QCASTLE));
          }
        }
      }
    }
    return moves;
  };

  /** Fully legal moves (king-safety filtered). */
  Chess.prototype.moves = function (opts) {
    var pseudo = this.generateMoves(opts);
    var legal = [];
    for (var i = 0; i < pseudo.length; i++) {
      this.makeMove(pseudo[i]);
      if (!this.isAttacked(this.kings[this.turn ^ 1], this.turn)) legal.push(pseudo[i]);
      this.undoMove();
    }
    return legal;
  };

  Chess.prototype.movesFrom = function (sq) {
    var all = this.moves(), out = [];
    for (var i = 0; i < all.length; i++) if (all[i].from === sq) out.push(all[i]);
    return out;
  };

  /* ------------------------------------------------------- make / unmake */
  var CASTLE_MASK = new Int8Array(128);
  (function () {
    for (var i = 0; i < 128; i++) CASTLE_MASK[i] = 15;
    CASTLE_MASK[fromAlgebraic('a1')] = 15 & ~C_WQ;
    CASTLE_MASK[fromAlgebraic('e1')] = 15 & ~(C_WQ | C_WK);
    CASTLE_MASK[fromAlgebraic('h1')] = 15 & ~C_WK;
    CASTLE_MASK[fromAlgebraic('a8')] = 15 & ~C_BQ;
    CASTLE_MASK[fromAlgebraic('e8')] = 15 & ~(C_BQ | C_BK);
    CASTLE_MASK[fromAlgebraic('h8')] = 15 & ~C_BK;
  })();

  Chess.prototype.makeMove = function (m) {
    var b = this.board, us = this.turn, them = us ^ 1;
    var h = this.hash;

    this.history.push({
      move: m,
      castling: this.castling,
      epSquare: this.epSquare,
      halfMoves: this.halfMoves,
      moveNumber: this.moveNumber,
      kingW: this.kings[WHITE],
      kingB: this.kings[BLACK],
      hash: this.hash
    });

    var moving = b[m.from];

    // clear old ep from hash
    if (this.epSquare >= 0) h ^= Z_EP[this.epSquare];
    h ^= Z_CASTLE[this.castling];

    // remove captured piece
    if (m.flags & FLAG_EP) {
      var capSq = m.to + (us === WHITE ? 16 : -16);
      h ^= Z_PIECES[b[capSq]][capSq];
      b[capSq] = EMPTY;
    } else if (m.flags & FLAG_CAPTURE) {
      h ^= Z_PIECES[b[m.to]][m.to];
    }

    // move the piece
    h ^= Z_PIECES[moving][m.from];
    b[m.from] = EMPTY;
    var placed = (m.flags & FLAG_PROMO) ? piece(m.promo, us) : moving;
    b[m.to] = placed;
    h ^= Z_PIECES[placed][m.to];

    if (typeOf(moving) === KING) this.kings[us] = m.to;

    // rook hop when castling
    if (m.flags & FLAG_KCASTLE) {
      var rf = m.to + 1, rt = m.to - 1;
      h ^= Z_PIECES[b[rf]][rf];
      b[rt] = b[rf]; b[rf] = EMPTY;
      h ^= Z_PIECES[b[rt]][rt];
    } else if (m.flags & FLAG_QCASTLE) {
      var rf2 = m.to - 2, rt2 = m.to + 1;
      h ^= Z_PIECES[b[rf2]][rf2];
      b[rt2] = b[rf2]; b[rf2] = EMPTY;
      h ^= Z_PIECES[b[rt2]][rt2];
    }

    // rights
    this.castling &= CASTLE_MASK[m.from];
    this.castling &= CASTLE_MASK[m.to];
    h ^= Z_CASTLE[this.castling];

    // en passant square
    this.epSquare = (m.flags & FLAG_BIGPAWN) ? (m.from + (us === WHITE ? -16 : 16)) : -1;
    if (this.epSquare >= 0) h ^= Z_EP[this.epSquare];

    // clocks
    if (typeOf(moving) === PAWN || (m.flags & FLAG_CAPTURE)) this.halfMoves = 0;
    else this.halfMoves++;
    if (us === BLACK) this.moveNumber++;

    this.turn = them;
    h ^= Z_SIDE;
    this.hash = h | 0;
  };

  Chess.prototype.undoMove = function () {
    var st = this.history.pop();
    if (!st) return null;
    var m = st.move, b = this.board;

    this.turn ^= 1;
    var us = this.turn;

    this.castling = st.castling;
    this.epSquare = st.epSquare;
    this.halfMoves = st.halfMoves;
    this.moveNumber = st.moveNumber;
    this.kings[WHITE] = st.kingW;
    this.kings[BLACK] = st.kingB;
    this.hash = st.hash;

    var moved = b[m.to];
    b[m.from] = (m.flags & FLAG_PROMO) ? piece(PAWN, us) : moved;
    b[m.to] = EMPTY;

    if (m.flags & FLAG_EP) {
      b[m.to + (us === WHITE ? 16 : -16)] = m.captured;
    } else if (m.flags & FLAG_CAPTURE) {
      b[m.to] = m.captured;
    }

    if (m.flags & FLAG_KCASTLE) {
      b[m.to + 1] = b[m.to - 1]; b[m.to - 1] = EMPTY;
    } else if (m.flags & FLAG_QCASTLE) {
      b[m.to - 2] = b[m.to + 1]; b[m.to + 1] = EMPTY;
    }
    return m;
  };

  /* ------------------------------------------------------------- SAN text */
  Chess.prototype.moveToSan = function (m, legalList) {
    if (m.flags & FLAG_KCASTLE) return this.decorate('O-O', m);
    if (m.flags & FLAG_QCASTLE) return this.decorate('O-O-O', m);

    var p = this.board[m.from];
    var t = typeOf(p);
    var san = '';

    if (t === PAWN) {
      if (m.flags & FLAG_CAPTURE) san += 'abcdefgh'[fileOf(m.from)] + 'x';
      san += algebraic(m.to);
      if (m.flags & FLAG_PROMO) san += '=' + PIECE_CHAR[m.promo].toUpperCase();
    } else {
      san += PIECE_CHAR[t].toUpperCase();
      // disambiguation
      var list = legalList || this.moves();
      var sameFile = false, sameRank = false, ambiguous = false;
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (o.from === m.from || o.to !== m.to) continue;
        if (typeOf(this.board[o.from]) !== t) continue;
        ambiguous = true;
        if (fileOf(o.from) === fileOf(m.from)) sameFile = true;
        if (rankOf(o.from) === rankOf(m.from)) sameRank = true;
      }
      if (ambiguous) {
        if (!sameFile) san += 'abcdefgh'[fileOf(m.from)];
        else if (!sameRank) san += (8 - rankOf(m.from));
        else san += algebraic(m.from);
      }
      if (m.flags & FLAG_CAPTURE) san += 'x';
      san += algebraic(m.to);
    }
    return this.decorate(san, m);
  };

  Chess.prototype.decorate = function (san, m) {
    this.makeMove(m);
    var opponentHasMoves = this.moves().length > 0;
    var check = this.inCheck(this.turn);
    this.undoMove();
    if (check) san += opponentHasMoves ? '+' : '#';
    return san;
  };

  /* --------------------------------------------------------- game  status */
  Chess.prototype.insufficientMaterial = function () {
    var counts = {}, bishops = [], total = 0;
    for (var sq = 0; sq < 128; sq++) {
      if (offBoard(sq)) { sq += 7; continue; }
      var p = this.board[sq];
      if (p === EMPTY) continue;
      var t = typeOf(p);
      total++;
      counts[t] = (counts[t] || 0) + 1;
      if (t === BISHOP) bishops.push((rankOf(sq) + fileOf(sq)) & 1);
    }
    if (total === 2) return true;                                   // K vs K
    if (total === 3 && (counts[KNIGHT] === 1 || counts[BISHOP] === 1)) return true;
    if (total === 2 + bishops.length && bishops.length > 1) {       // only bishops
      var first = bishops[0], same = true;
      for (var i = 1; i < bishops.length; i++) if (bishops[i] !== first) same = false;
      if (same) return true;
    }
    return false;
  };

  Chess.prototype.isThreefold = function () {
    var key = this.hash, count = 1;
    // replay hashes stored in history
    for (var i = 0; i < this.history.length; i++) {
      if (this.history[i].hash === key) count++;
    }
    return count >= 3;
  };

  /** -> {over, result, reason}  result: 'white' | 'black' | 'draw' | null */
  Chess.prototype.status = function () {
    var legal = this.moves();
    if (legal.length === 0) {
      if (this.inCheck(this.turn)) {
        return { over: true, result: this.turn === WHITE ? 'black' : 'white', reason: 'checkmate' };
      }
      return { over: true, result: 'draw', reason: 'stalemate' };
    }
    if (this.halfMoves >= 100) return { over: true, result: 'draw', reason: 'fifty-move rule' };
    if (this.insufficientMaterial()) return { over: true, result: 'draw', reason: 'insufficient material' };
    if (this.isThreefold()) return { over: true, result: 'draw', reason: 'threefold repetition' };
    return { over: false, result: null, reason: null, check: this.inCheck(this.turn) };
  };

  /* ------------------------------------------------------------- utility */
  Chess.prototype.get = function (sq) {
    var p = this.board[sq];
    if (p === EMPTY) return null;
    return { type: typeOf(p), color: colorOf(p) };
  };

  Chess.prototype.findMove = function (from, to, promo) {
    var list = this.moves();
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.from === from && m.to === to) {
        if (m.flags & FLAG_PROMO) { if (m.promo === (promo || QUEEN)) return m; }
        else return m;
      }
    }
    return null;
  };

  Chess.prototype.perft = function (depth) {
    if (depth === 0) return 1;
    var moves = this.generateMoves(), nodes = 0;
    for (var i = 0; i < moves.length; i++) {
      this.makeMove(moves[i]);
      if (!this.isAttacked(this.kings[this.turn ^ 1], this.turn)) {
        nodes += depth === 1 ? 1 : this.perft(depth - 1);
      }
      this.undoMove();
    }
    return nodes;
  };

  /* ---------------------------------------------------------------- export */
  var API = {
    Chess: Chess,
    WHITE: WHITE, BLACK: BLACK, EMPTY: EMPTY,
    PAWN: PAWN, KNIGHT: KNIGHT, BISHOP: BISHOP, ROOK: ROOK, QUEEN: QUEEN, KING: KING,
    FLAG_NORMAL: FLAG_NORMAL, FLAG_CAPTURE: FLAG_CAPTURE, FLAG_BIGPAWN: FLAG_BIGPAWN,
    FLAG_EP: FLAG_EP, FLAG_PROMO: FLAG_PROMO,
    FLAG_KCASTLE: FLAG_KCASTLE, FLAG_QCASTLE: FLAG_QCASTLE,
    START_FEN: START_FEN,
    piece: piece, typeOf: typeOf, colorOf: colorOf,
    algebraic: algebraic, fromAlgebraic: fromAlgebraic,
    offBoard: offBoard, rankOf: rankOf, fileOf: fileOf,
    PIECE_CHAR: PIECE_CHAR
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessEngine = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
