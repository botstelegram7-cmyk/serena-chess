/* =========================================================================
   human.js — the adjustable human opponent
   -------------------------------------------------------------------------
   Takes a target rating from the slider and plays like a person of roughly
   that strength: same openings, same hesitations, same kinds of mistakes.

   The important idea is that strength is NOT produced by crippling the
   engine. A weakened engine still plays like an engine — it just plays a
   random bad move now and then, which is instantly recognisable because the
   mistakes make no sense. People are different. People play moves that look
   right. Their errors have a shape.

   So three mechanisms run together:

     1. HORIZON. The search only looks as far ahead as a player of that
        rating reliably calculates. A 700 sees one exchange. A 2400 sees six
        plies. Pieces get hung because the refutation was genuinely over the
        horizon, not because a dice roll said "blunder now".

     2. ATTENTION. Humans do not weigh every legal move equally. Recaptures,
        checks, captures and forward moves get looked at. Quiet retreats and
        rim knight moves barely get considered at all. Each move is weighted
        by how much a person would even notice it.

     3. TEMPERATURE. Among the moves that survive the first two filters, the
        choice is sampled rather than maximised. The spread narrows as the
        rating climbs.

   Calibration targets are real average-centipawn-loss figures by rating
   band; tests/human_test.js measures the realised ACPL and asserts it lands
   in the right range.
   ========================================================================= */
(function (root) {
  'use strict';

  var E  = root.ChessEngine;
  var AI = root.ChessAI;

  var MIN_ELO = 400, MAX_ELO = 2800;
  var VAL = [0, 100, 320, 330, 500, 950, 20000];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* piecewise-linear interpolation over a table of [elo, value] pairs */
  function curve(table, elo) {
    if (elo <= table[0][0]) return table[0][1];
    for (var i = 1; i < table.length; i++) {
      if (elo <= table[i][0]) {
        var span = table[i][0] - table[i - 1][0];
        var t = span ? (elo - table[i - 1][0]) / span : 0;
        return table[i - 1][1] + (table[i][1] - table[i - 1][1]) * t;
      }
    }
    return table[table.length - 1][1];
  }

  /* ─────────────────────────────────────────── calibration curves ─── */

  /* plies of tactics the player reliably sees */
  var T_HORIZON = [[400, 1], [700, 2], [1100, 2], [1400, 3], [1700, 4],
                   [2000, 5], [2300, 6], [2600, 7], [2800, 8]];

  /* softmax temperature, centipawns */
  var T_TEMP = [[400, 345], [700, 248], [1000, 180], [1300, 136], [1600, 104],
                [1900, 78], [2200, 56], [2500, 38], [2800, 24]];

  /* The worst a move can be and still get played "normally". This is what
     separates a weak player from a strong one far more than average
     accuracy does: a 2400 makes plenty of 40-point errors and almost never
     hangs a rook. Without a ceiling the sampler occasionally throws a piece
     away at every rating, which reads as a bot immediately. Genuine
     blunders come from the slip path below instead, at a controlled rate. */
  var T_MAXLOSS = [[400, 2000], [800, 1250], [1200, 800], [1600, 430],
                   [2000, 300], [2400, 190], [2800, 120]];

  /* how strongly "looks like a move" beats "is a good move" */
  var T_SURFACE = [[400, 2.7], [800, 2.15], [1200, 1.6], [1600, 1.15],
                   [2000, 0.75], [2400, 0.42], [2800, 0.22]];

  /* chance of a true slip: a move chosen with the horizon cut to the bone */
  var T_SLIP = [[400, 0.06], [800, 0.045], [1200, 0.035], [1600, 0.028],
                [2000, 0.022], [2400, 0.016], [2800, 0.008]];

  /* chance of staying in a known opening line */
  var T_BOOK = [[400, 0.14], [800, 0.3], [1200, 0.5], [1600, 0.72],
                [2000, 0.87], [2400, 0.95], [2800, 0.99]];

  /* median seconds of thought, in ms */
  var T_MS = [[400, 240], [800, 400], [1200, 620], [1600, 920],
              [2000, 1450], [2400, 2200], [2800, 3200]];

  function profile(elo) {
    elo = clamp(Math.round(elo || 1200), MIN_ELO, MAX_ELO);
    return {
      elo:      elo,
      horizon:  Math.max(1, Math.round(curve(T_HORIZON, elo))),
      temp:     curve(T_TEMP, elo),
      surface:  curve(T_SURFACE, elo),
      slip:     curve(T_SLIP, elo),
      bookOdds: curve(T_BOOK, elo),
      maxLoss:  curve(T_MAXLOSS, elo),
      timeMs:   curve(T_MS, elo)
    };
  }

  /* ───────────────────────────────────────────────────── attention ─── */
  /* How likely is a person to even look at this move? Returns a positive
     multiplier; 1.0 is "an ordinary move I would consider". */
  function attention(g, m, ctx) {
    var b = g.board;
    var mover = E.typeOf(b[m.from]);
    var us = g.turn, them = us ^ 1;
    var w = 1;

    if (m.flags & E.FLAG_CAPTURE) {
      var victim = m.captured ? E.typeOf(m.captured) : E.PAWN;
      w *= (VAL[victim] >= VAL[mover]) ? 1.9 : 1.35;
      if (m.to === ctx.lastTo) w *= 1.8;          /* recapture — automatic */
    }
    if (m.flags & E.FLAG_PROMO) w *= 2.1;
    if (m.flags & (E.FLAG_KCASTLE | E.FLAG_QCASTLE)) w *= 1.5;

    /* direction of travel: rankOf is 0 at the 8th rank */
    var dr = E.rankOf(m.from) - E.rankOf(m.to);
    var forward = (us === E.WHITE) ? dr : -dr;
    if (forward > 0) w *= 1.14;
    else if (forward < 0) w *= 0.6;               /* retreats: the blind spot */

    if (mover === E.KNIGHT) {
      var f = E.fileOf(m.to);
      if (f === 0 || f === 7) w *= 0.7;           /* a knight on the rim */
    }

    /* opening development reads as obviously correct */
    if (ctx.ply < 20 && (mover === E.KNIGHT || mover === E.BISHOP)) {
      var home = (us === E.WHITE) ? 7 : 0;
      if (E.rankOf(m.from) === home) w *= 1.3;
    }

    /* strolling the king about mid-game does not occur to most people */
    if (mover === E.KING && !(m.flags & (E.FLAG_KCASTLE | E.FLAG_QCASTLE))) w *= 0.72;

    /* a piece that is currently attacked shouts for attention */
    if (mover !== E.KING && g.isAttacked(m.from, them)) w *= 1.65;

    return w;
  }

  /* ───────────────────────────────────────────────── move selection ─── */

  function sample(cands) {
    var total = 0, i;
    for (i = 0; i < cands.length; i++) total += cands[i].w;
    if (total <= 0) return cands[0].move;
    var r = Math.random() * total;
    for (i = 0; i < cands.length; i++) {
      r -= cands[i].w;
      if (r <= 0) return cands[i].move;
    }
    return cands[cands.length - 1].move;
  }

  function choose(game, p, ctx, horizon, slipping) {
    var style = AI.DEFAULT_STYLE;
    var s = new AI.Search(game, { contempt: 0, style: style });
    var scored = s.rootScores(horizon, Math.max(120, p.timeMs));
    if (!scored.length) return null;

    var best = scored[0].score;

    /* a forced mate in hand is taken by anyone who can see it */
    if (best > AI.MATE - 100 && horizon >= 2) return scored[0].move;

    var ceiling = slipping ? Infinity : p.maxLoss;
    var cands = [], i;
    for (i = 0; i < scored.length; i++) {
      var loss = best - scored[i].score;
      if (loss > ceiling) continue;
      var att = attention(game, scored[i].move, ctx);
      var w = Math.exp(-loss / p.temp) * Math.pow(att, p.surface);
      if (w > 0 && isFinite(w)) cands.push({ move: scored[i].move, w: w });
    }
    if (!cands.length) return scored[0].move;
    return sample(cands);
  }

  /* ──────────────────────────────────────────────────── public API ─── */

  /**
   * Real players fall apart on the clock, and an opponent that plays its
   * normal strength with four seconds left is the last obvious tell that it
   * is not human. Below roughly thirty seconds the effective rating sags,
   * the oversight rate climbs and the horizon shortens -- gently at first,
   * then sharply inside the last ten seconds.
   *
   * Returns a multiplier set rather than mutating anything, so a game with
   * no clock is completely unaffected.
   */
  function timePressure(msLeft) {
    if (typeof msLeft !== 'number' || msLeft <= 0 || msLeft > 60000) {
      return { slip: 1, maxloss: 1, horizon: 0, temp: 1 };
    }
    var sec = msLeft / 1000;
    /* 0 at 60s rising to 1 at 0s, curved so most of the damage is late */
    var p = Math.pow(Math.max(0, (60 - sec) / 60), 2.2);
    return {
      slip: 1 + p * 3.2,        /* up to ~4x more oversights        */
      maxloss: 1 + p * 2.4,     /* tolerate much worse moves        */
      horizon: p > 0.72 ? -2 : p > 0.42 ? -1 : 0,
      temp: 1 + p * 1.5         /* choice gets noisier              */
    };
  }

  function pickMove(game, opts, sanHistory) {
    var legal = game.moves();
    if (!legal.length) return null;
    if (legal.length === 1) return legal[0];

    var p = profile(opts && opts.elo);
    var hist = sanHistory || [];

    /* opening repertoire, followed loosely at low ratings */
    var OB = root.ChessOpenings;
    if (OB && hist.length < 16 && Math.random() < p.bookOdds) {
      var want = OB.next(hist, ['solid', 'positional', 'attack', 'gambit']);
      if (want) {
        var tgt = want.replace(/[+#!?]/g, '');
        for (var bi = 0; bi < legal.length; bi++) {
          if (game.moveToSan(legal[bi], legal).replace(/[+#!?]/g, '') === tgt) {
            return legal[bi];
          }
        }
      }
    }

    var ctx = {
      ply: hist.length,
      lastTo: (opts && opts.lastTo != null) ? opts.lastTo : -1
    };

    /* a genuine oversight: the same machinery, horizon cut to one ply, so
       the move still looks sensible and simply loses something */
    var slipping = Math.random() < p.slip;
    var horizon = slipping ? 1 : p.horizon;

    return choose(game, p, ctx, horizon, slipping) || legal[0];
  }

  /* How long this player would sit there. Humans are not metronomes: mostly
     quick, occasionally a long stare, and instant on a forced recapture. */
  function thinkMs(game, opts, forced) {
    var p = profile(opts && opts.elo);
    if (forced) return 220 + Math.random() * 260;

    var n = game.moves().length;
    var complexity = clamp(n / 32, 0.45, 1.9);

    /* log-normal-ish: median around timeMs, with a long right tail */
    var u = Math.random(), v = Math.random();
    var gauss = Math.sqrt(-2 * Math.log(u || 1e-9)) * Math.cos(2 * Math.PI * v);
    var ms = p.timeMs * complexity * Math.exp(gauss * 0.55);

    if (Math.random() < 0.07) ms *= 2.4;          /* the occasional long think */
    return clamp(ms, 300, 12000);
  }

  /* ───────────────────────────────────────────────────── identity ─── */
  /* The opponent should not announce itself as software. A plain handle and
     a default avatar is exactly what a real casual account looks like. */

  var HANDLES = [
    'pawnstorm', 'quietmove', 'rookend', 'knightmare', 'backrank', 'tempo',
    'zugzwang', 'luft', 'enpassant', 'fianchetto', 'perpetual', 'bishoppair',
    'openfile', 'passedpawn', 'skewer', 'overload', 'prophylaxis', 'trebuchet',
    'woodpusher', 'patzer', 'coffeehouse', 'timescramble', 'flagfall'
  ];
  var FIRSTS = [
    'Aarav', 'Mika', 'Sofia', 'Dan', 'Yusuf', 'Lena', 'Tom', 'Priya', 'Marco',
    'Nina', 'Omar', 'Ela', 'Rohit', 'Ana', 'Kaito', 'Sam', 'Zoe', 'Ibrahim',
    'Clara', 'Noah', 'Mei', 'Luca', 'Hana', 'Ivan', 'Jade', 'Felix'
  ];
  var COUNTRIES = ['IN', 'US', 'GB', 'DE', 'ES', 'BR', 'FR', 'PL', 'NG', 'JP',
                   'KR', 'IT', 'TR', 'ID', 'PH', 'AR', 'NL', 'SE', 'MX', 'VN'];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function identity(elo) {
    var r = Math.random(), name;
    if (r < 0.34) {
      name = pick(HANDLES) + (Math.random() < 0.6
        ? String(Math.floor(Math.random() * 90) + 10)
        : '');
    } else if (r < 0.62) {
      name = pick(FIRSTS) + pick(['_', '.', '']) +
             pick(['K', 'R', 'S', 'M', 'B', String(Math.floor(Math.random() * 9000) + 1000)]);
    } else if (r < 0.82) {
      name = pick(FIRSTS).toLowerCase() + pick(HANDLES).slice(0, 4);
    } else {
      name = pick(HANDLES) + '_' + pick(HANDLES).slice(0, 4);
    }
    return {
      name: name.slice(0, 16),
      country: pick(COUNTRIES),
      avatar: 'avatars/player' + (1 + Math.floor(Math.random() * 8)) + '.jpg',
      rating: clamp(Math.round(elo), MIN_ELO, MAX_ELO)
    };
  }

  /* band label for the slider */
  function band(elo) {
    if (elo < 700)  return 'Learning the moves';
    if (elo < 1000) return 'Casual club player';
    if (elo < 1300) return 'Knows the openings';
    if (elo < 1600) return 'Solid amateur';
    if (elo < 1900) return 'Strong club player';
    if (elo < 2200) return 'Tournament regular';
    if (elo < 2500) return 'Candidate master';
    return 'Master strength';
  }

  var API = {
    timePressure: timePressure, MIN_ELO: MIN_ELO, MAX_ELO: MAX_ELO,
    profile: profile, pickMove: pickMove, thinkMs: thinkMs,
    identity: identity, band: band, attention: attention
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessHuman = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
