/*
 * selfplay.js — play two versions of the engine against each other.
 * The only honest way to tell whether a change made the bots stronger.
 *
 * usage: node tools/selfplay.js [games] [depth] [ms]
 */
'use strict';
const path = require('path');
const P = (f) => path.join(__dirname, '..', 'assets', 'js', f);
const E = require(P('engine.js'));
require(P('openings.js'));

const NEW = require(P('ai.js'));
delete require.cache[require.resolve(path.join(__dirname, 'ai_baseline_v18.js'))];
const OLD = require(path.join(__dirname, 'ai_baseline_v18.js'));

const GAMES = +(process.argv[2] || 40);
const DEPTH = +(process.argv[3] || 5);
const MS = +(process.argv[4] || 120);

/* Both engines are deterministic, so a fixed opening list caps how many
   DISTINCT games exist -- with 20 openings and 2 colours there are only 40,
   and asking for more just replays them, which quietly understates the
   sample size. These openings are generated from a seeded PRNG instead, so
   the match size can grow honestly. */
function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomOpening(rnd, plies) {
  for (var attempt = 0; attempt < 40; attempt++) {
    var g = new E.Chess();
    var ok = true;
    for (var i = 0; i < plies; i++) {
      var legal = g.moves();
      if (!legal.length) { ok = false; break; }
      g.makeMove(legal[Math.floor(rnd() * legal.length)]);
    }
    if (!ok) continue;
    /* reject starts where one side is already busted, so the match measures
       play rather than who was handed a won position */
    var v = NEW.evaluate(g, {});
    var white = g.turn === E.WHITE ? v : -v;
    if (Math.abs(white) < 120) return g.history.map(function (h) { return h; }) && g.fen();
  }
  return null;
}

function pickBest(AI, g) {
  const s = new AI.Search(g, {});
  /* false = best-move mode, the path the strong bots use. The v1.8 baseline
     ignores this third argument, so it keeps its original behaviour, which
     makes this a fair "what the top bot did before vs now" comparison. */
  const scored = s.rootScores(DEPTH, MS, false);
  return scored.length ? scored[0].move : null;
}

function playGame(whiteAI, blackAI, startFen) {
  const g = new E.Chess(startFen);
  for (let ply = 0; ply < 180; ply++) {
    const st = g.status && g.status();
    if (st && st.over) {
      if (/checkmate/i.test(st.reason || '')) return g.turn === E.WHITE ? 'b' : 'w';
      return 'd';
    }
    const legal = g.moves();
    if (!legal.length) {
      const inCheck = g.isAttacked(g.kings[g.turn], g.turn ^ 1);
      if (!inCheck) return 'd';
      return g.turn === E.WHITE ? 'b' : 'w';
    }
    if (g.halfMoves >= 100 || g.insufficientMaterial()) return 'd';
    const AI = g.turn === E.WHITE ? whiteAI : blackAI;
    const mv = pickBest(AI, g) || legal[0];
    g.makeMove(mv);
  }
  /* adjudicate a long game on material */
  const v = NEW.evaluate(g, {});
  const white = g.turn === E.WHITE ? v : -v;
  if (white > 250) return 'w';
  if (white < -250) return 'b';
  return 'd';
}

let nw = 0, nd = 0, nl = 0;
const rnd = mulberry(20261001);
const starts = [];
while (starts.length < Math.ceil(GAMES / 2)) {
  const f = randomOpening(rnd, 6 + Math.floor(rnd() * 4));
  if (f) starts.push(f);
}
const t0 = Date.now();
for (let i = 0; i < GAMES; i++) {
  const op = starts[Math.floor(i / 2)];          /* same start, both colours */
  const newIsWhite = i % 2 === 0;
  const r = playGame(newIsWhite ? NEW : OLD, newIsWhite ? OLD : NEW, op);
  let pt;
  if (r === 'd') { nd++; pt = '='; }
  else if ((r === 'w') === newIsWhite) { nw++; pt = '+'; }
  else { nl++; pt = '-'; }
  process.stdout.write(pt);
}
const secs = ((Date.now() - t0) / 1000).toFixed(0);
const score = nw + nd / 2;
const pct = score / GAMES;
const elo = pct <= 0 || pct >= 1 ? (pct >= 1 ? '+inf' : '-inf')
          : (-400 * Math.log10(1 / pct - 1)).toFixed(0);
console.log(`\n\nnew vs baseline  depth ${DEPTH}  ${MS}ms/move  ${GAMES} games in ${secs}s`);
console.log(`  +${nw}  =${nd}  -${nl}   score ${score}/${GAMES} = ${(pct * 100).toFixed(1)}%`);
const se = Math.sqrt(Math.max(pct * (1 - pct), 0.01) / GAMES);
const lo = pct - 1.96 * se, hi = pct + 1.96 * se;
const toElo = (q) => (q <= 0 || q >= 1 ? (q >= 1 ? 999 : -999) : -400 * Math.log10(1 / q - 1));
console.log(`  estimated Elo difference: ${elo}  (95% CI ${toElo(lo).toFixed(0)} to ${toElo(hi).toFixed(0)})`);
console.log(`  ${Math.abs(+elo) > 1.96 * (toElo(hi) - toElo(lo)) / 2 ? '' : 'NOT SIGNIFICANT at this sample size'}`);
