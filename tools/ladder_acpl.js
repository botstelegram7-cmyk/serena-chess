/*
 * Per-tier move quality across the bot ladder.
 *
 * For each sampled position an exact deep root gives a reference score for
 * EVERY legal move, so any bot's choice can be graded by lookup. We then ask
 * the old build (v1.8 engine + v1.8 roster) and the new build (current engine
 * + current roster) to move, and compare average centipawn loss and blunder
 * rate. Lower is stronger. Random seeds are reset identically before each
 * engine so the stochastic weakening model cannot favour either side.
 */
const path = require('path');
const R = path.join(__dirname, '..', 'assets', 'js');
const E = require(path.join(R, 'engine.js'));
require(path.join(R, 'openings.js'));
const NEWAI = require(path.join(R, 'ai.js'));
const OLDAI = require(path.join(__dirname, 'ai_baseline_v18.js'));
const NEWB = require(path.join(R, 'bots.js'));
const OLDB = require(path.join(__dirname, 'bots_baseline_v18.js'));

const POSITIONS = +(process.argv[2] || 20);
const REPS      = +(process.argv[3] || 2);
const MSCAP     = +(process.argv[4] || 1200);

const listOf = (M) => M.ALL || M.BOTS || (M.list && M.list()) || [];
const newBots = listOf(NEWB), oldBots = listOf(OLDB);
const uci = (m) => E.algebraic(m.from) + E.algebraic(m.to);

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Sample realistic positions: play a short sensible game with a decent
   engine and snapshot it, rather than random-walking into nonsense where
   every move is catastrophic and the tiers cannot be told apart. */
const rnd = mulberry(917733);
const positions = [];
while (positions.length < POSITIONS) {
  const g = new E.Chess();
  const plies = 10 + Math.floor(rnd() * 20);
  let ok = true;
  for (let i = 0; i < plies; i++) {
    const legal = g.moves();
    if (!legal.length) { ok = false; break; }
    /* mostly a reasonable move, occasionally a deliberate deviation so the
       sample is varied without being absurd */
    let mv;
    if (rnd() < 0.25) {
      mv = legal[Math.floor(rnd() * legal.length)];
    } else {
      const s = new NEWAI.Search(g, {});
      const sc = s.rootScores(4, 60, false);
      mv = sc.length ? sc[0].move : legal[0];
    }
    g.makeMove(mv);
  }
  if (!ok || g.moves().length < 6) continue;
  const v = NEWAI.evaluate(g, {});
  if (Math.abs(v) > 200) continue;            /* not already decided */
  positions.push(g.fen());
}

/* Reference judge: the strongest search available, on the FAST best-move
   path so the depth is real. Scores are cached per (position, move) because
   the tiers pick the same popular moves over and over. */
const REF_DEPTH = +(process.env.REF_DEPTH || 10);
const REF_MS    = +(process.env.REF_MS || 2000);
const cache = new Map();

function refBest(fen) {
  const k = fen + '|best';
  if (cache.has(k)) return cache.get(k);
  const s = new NEWAI.Search(new E.Chess(fen), {});
  const sc = s.rootScores(REF_DEPTH, REF_MS, false);
  const v = sc.length ? sc[0].score : 0;
  cache.set(k, v);
  return v;
}

/* Score of a specific move: play it, let the judge evaluate the reply, negate. */
function refMove(fen, mv) {
  const k = fen + '|' + uci(mv);
  if (cache.has(k)) return cache.get(k);
  const g = new E.Chess(fen);
  const legal = g.moves();
  const real = legal.find((m) => uci(m) === uci(mv));
  if (!real) return null;
  g.makeMove(real);
  if (g.moves().length === 0) {
    /* mate or stalemate delivered by this move */
    const over = g.isAttacked(g.kings[g.turn], g.turn ^ 1) ? 30000 : 0;
    cache.set(k, over);
    return over;
  }
  const s = new NEWAI.Search(g, {});
  const sc = s.rootScores(REF_DEPTH - 1, REF_MS, false);
  const v = sc.length ? -sc[0].score : 0;
  cache.set(k, v);
  return v;
}

process.stdout.write(`reference depth ${REF_DEPTH} on ${positions.length} positions`);
const ref = positions.map((fen) => { process.stdout.write('.'); return { fen, best: refBest(fen) }; });
console.log(' done\n');

const TIERS = [400, 800, 1200, 1600, 2000, 2400, 2800, 3200];
const pick = (bots, elo) =>
  bots.slice().sort((a, b) => Math.abs(a.elo - elo) - Math.abs(b.elo - elo))[0];

function measure(AI, bot) {
  let loss = 0, n = 0, blunders = 0;
  for (let pi = 0; pi < ref.length; pi++) {
    for (let r = 0; r < REPS; r++) {
      const seeded = mulberry(1000 + pi * 31 + r * 7);
      const realRandom = Math.random;
      Math.random = seeded;                            /* identical stream per side */
      let mv = null;
      try {
        const cfg = Object.assign({}, bot, { timeMs: Math.min(bot.timeMs || 800, MSCAP) });
        mv = AI.pickMove(new E.Chess(ref[pi].fen), cfg, []);
      } catch (e) { /* ignore, counted as skipped */ }
      Math.random = realRandom;
      if (!mv) continue;
      const got = refMove(ref[pi].fen, mv);
      if (got === null) continue;
      const l = Math.max(0, ref[pi].best - got);
      loss += l; n++;
      if (l > 150) blunders++;
    }
  }
  return { acpl: n ? loss / n : NaN, blunder: n ? (100 * blunders) / n : NaN, n };
}

console.log('tier    old ACPL   new ACPL    change    old blunder%  new blunder%');
console.log('------------------------------------------------------------------');
let sumOld = 0, sumNew = 0, tiers = 0;
for (const elo of TIERS) {
  const ob = pick(oldBots, elo), nb = pick(newBots, elo);
  const o = measure(OLDAI, ob), nw = measure(NEWAI, nb);
  const d = nw.acpl - o.acpl;
  sumOld += o.acpl; sumNew += nw.acpl; tiers++;
  console.log(
    String(elo).padStart(4) + '   ' +
    o.acpl.toFixed(1).padStart(8) + '   ' + nw.acpl.toFixed(1).padStart(8) + '   ' +
    (d <= 0 ? '' : '+') + d.toFixed(1).padStart(7) + '   ' +
    o.blunder.toFixed(1).padStart(11) + '%  ' + nw.blunder.toFixed(1).padStart(11) + '%');
}
console.log('------------------------------------------------------------------');
console.log(`mean ACPL  old ${(sumOld / tiers).toFixed(1)}   new ${(sumNew / tiers).toFixed(1)}`);
console.log('(ACPL = average centipawns lost per move vs a reference search; lower is stronger)');
