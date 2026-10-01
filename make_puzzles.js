/* =========================================================================
   make_puzzles.js — generate and VERIFY tactics puzzles with our own engine.

   Positions come from randomised self-play. A position becomes a puzzle when
   the best move is either a forced mate or clearly winning compared to every
   alternative, and the solution is then re-verified by a deeper search.

   Output: assets/js/puzzles.js  (window.ChessPuzzles)
   ========================================================================= */
const path = require('path');
const fs = require('fs');

const ASSETS = path.join(__dirname, 'assets', 'js');
const E = require(path.join(ASSETS, 'engine.js'));
const AI = require(path.join(ASSETS, 'ai.js'));
const { Chess } = E;

const TARGET = 140;
const MATE = AI.MATE;

function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }

/** score every legal move at `depth`, best first */
function rootScores(g, depth, ms) {
  const s = new AI.Search(g, {});
  return s.rootScores(depth, ms);
}

function classify(scored, g) {
  if (scored.length < 2) return null;
  const best = scored[0].score;
  const second = scored[1].score;

  // forced mate that no other move achieves as quickly
  if (best > MATE - 100) {
    const mateIn = Math.ceil((MATE - best) / 2);
    if (mateIn >= 1 && mateIn <= 3 && second < MATE - 100) {
      return { theme: `Mate in ${mateIn}`, kind: 'mate', mateIn,
               rating: 900 + mateIn * 350 };
    }
    return null;
  }

  // clearly winning material, and uniquely so
  const gain = (best - second) / 100;
  if (gain >= 2.4 && best > 120) {
    const r = Math.max(800, Math.min(2400,
      Math.round(1500 - gain * 60 + (scored.length > 30 ? 200 : 0))));
    return { theme: 'Win material', kind: 'material', gain: +gain.toFixed(1), rating: r };
  }
  return null;
}

/** confirm the solution still looks best with a deeper search */
function verify(fen, uci) {
  const g = new Chess(fen);
  const deep = rootScores(g, 6, 2500);
  if (!deep.length) return false;
  const top = deep[0];
  return moveUci(top.move) === uci;
}

function moveUci(m) {
  return E.algebraic(m.from) + E.algebraic(m.to) +
         (m.promo ? ' nbrqk'[m.promo].trim() : '');
}

/* ─────────────────────────────────────────────────────── generation ─── */
const bots = [
  { depth: 1, timeMs: 60, blunder: 0.55, spread: 400 },
  { depth: 2, timeMs: 90, blunder: 0.35, spread: 250 },
  { depth: 2, timeMs: 120, blunder: 0.2, spread: 150 },
  { depth: 3, timeMs: 150, blunder: 0.12, spread: 90 },
];

const puzzles = [];
const seen = new Set();
let games = 0, positions = 0;
const started = Date.now();

outer:
while (puzzles.length < TARGET && games < 900 && Date.now() - started < 600000) {
  games++;
  const g = new Chess();
  const a = rnd(bots), b = rnd(bots);
  let ply = 0;

  while (ply < 140) {
    const st = g.status();
    if (st.over) break;

    // sample this position before the move is played
    if (ply >= 8 && ply % 2 === 0 && Math.random() < 0.55) {
      positions++;
      const fen = g.fen();
      const key = fen.split(' ').slice(0, 4).join(' ');
      if (!seen.has(key)) {
        const scored = rootScores(g, 4, 500);
        const cls = classify(scored, g);
        if (cls) {
          const best = scored[0].move;
          const uci = moveUci(best);
          const san = g.moveToSan(best);
          if (verify(fen, uci)) {
            seen.add(key);
            puzzles.push({
              fen, uci, san,
              side: g.turn === E.WHITE ? 'w' : 'b',
              theme: cls.theme,
              kind: cls.kind,
              rating: cls.rating
            });
            process.stdout.write(
              `\r  ${puzzles.length}/${TARGET} puzzles  (${games} games, ${positions} positions)   `);
            if (puzzles.length >= TARGET) break outer;
          }
        }
      }
    }

    const bot = g.turn === E.WHITE ? a : b;
    const m = AI.pickMove(g, bot);
    if (!m) break;
    g.makeMove(m);
    ply++;
  }
}

console.log('');

/* spread across difficulty, easiest first */
puzzles.sort((x, y) => x.rating - y.rating);
puzzles.forEach((p, i) => { p.id = i + 1; });

const byTheme = {};
puzzles.forEach(p => { byTheme[p.theme] = (byTheme[p.theme] || 0) + 1; });
console.log('themes:', byTheme);
console.log('rating range:', puzzles[0].rating, '→', puzzles[puzzles.length - 1].rating);

/* ───────────────────────────────────────────────── endgame practice ─── */
const DRILLS = [
  { id: 'kq',      name: 'Queen mate',        fen: '8/8/4k3/8/8/3K4/8/6Q1 w - - 0 1',
    goal: 'Checkmate with king and queen.', level: 'Basic' },
  { id: 'kr',      name: 'Rook mate',         fen: '8/8/4k3/8/8/3K4/8/6R1 w - - 0 1',
    goal: 'Checkmate with king and rook.', level: 'Basic' },
  { id: 'ktwob',   name: 'Two bishops',       fen: '8/8/4k3/8/8/3K4/8/5BB1 w - - 0 1',
    goal: 'Checkmate with two bishops.', level: 'Hard' },
  { id: 'opp',     name: 'Opposition',        fen: '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1',
    goal: 'Promote the pawn using opposition.', level: 'Basic' },
  { id: 'lucena',  name: 'Lucena position',   fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1',
    goal: 'Build a bridge and promote.', level: 'Advanced' },
  { id: 'philidor',name: 'Philidor defence',  fen: '8/8/8/8/4pk2/8/r7/4K2R w K - 0 1',
    goal: 'Hold the draw as White.', level: 'Advanced' },
  { id: 'race',    name: 'Pawn race',         fen: '8/5p2/8/8/8/8/2P5/K6k w - - 0 1',
    goal: 'Win the race to promotion.', level: 'Medium' },
  { id: 'rookend', name: 'Rook vs pawn',      fen: '8/8/8/8/8/4k3/4p3/4K2R w - - 0 1',
    goal: 'Stop the pawn and win.', level: 'Medium' },
  { id: 'knightp', name: 'Knight and pawn',   fen: '8/8/3k4/8/8/3K1N2/4P3/8 w - - 0 1',
    goal: 'Convert the extra piece.', level: 'Medium' },
  { id: 'qvr',     name: 'Queen vs rook',     fen: '8/8/4k3/4r3/8/4K3/8/6Q1 w - - 0 1',
    goal: 'Win the rook or mate.', level: 'Hard' },
  { id: 'bishopp', name: 'Wrong bishop',      fen: '7k/8/8/8/8/8/5PK1/6B1 w - - 0 1',
    goal: 'Try to win — can you?', level: 'Hard' },
  { id: 'zug',     name: 'Zugzwang',          fen: '8/8/1p6/1P6/1K6/8/8/1k6 w - - 0 1',
    goal: 'Use zugzwang to break through.', level: 'Advanced' }
];

const out =
`/* =========================================================================
   puzzles.js — GENERATED by make_puzzles.js, do not edit by hand.
   ${puzzles.length} tactics puzzles, each mined from engine self-play and
   verified with a depth-6 search. Plus ${DRILLS.length} endgame drills.
   ========================================================================= */
(function (root) {
  'use strict';
  var PUZZLES = ${JSON.stringify(puzzles)};
  var DRILLS = ${JSON.stringify(DRILLS)};
  var API = {
    PUZZLES: PUZZLES,
    DRILLS: DRILLS,
    byId: function (id) { for (var i=0;i<PUZZLES.length;i++) if (PUZZLES[i].id===id) return PUZZLES[i]; return null; },
    drill: function (id) { for (var i=0;i<DRILLS.length;i++) if (DRILLS[i].id===id) return DRILLS[i]; return null; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessPuzzles = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

fs.writeFileSync(path.join(ASSETS, 'puzzles.js'), out);
console.log(`wrote assets/js/puzzles.js — ${puzzles.length} puzzles, ${DRILLS.length} drills, ` +
            `${(fs.statSync(path.join(ASSETS,'puzzles.js')).size/1024).toFixed(1)} KB`);
