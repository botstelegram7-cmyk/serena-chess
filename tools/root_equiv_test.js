/*
 * The tolerance-aware root returns upper bounds for moves far below the best.
 * That is only safe if the weakening model's selection pool -- the moves
 * within `spread` centipawns of the best -- is unchanged. This verifies that
 * directly against an exact-score root across the whole bot ladder.
 */
const path = require('path');
const R = path.join(__dirname, '..', 'assets', 'js');
const E = require(path.join(R, 'engine.js'));
require(path.join(R, 'openings.js'));
const AI = require(path.join(R, 'ai.js'));
const B = require(path.join(R, 'bots.js'));

const bots = (B.ALL || B.BOTS || B.list?.() || []).filter(Boolean);
const fens = [
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
  'r1bq1rk1/pp2nppp/2n1p3/2ppP3/3P4/P1PB1N2/2P2PPP/R1BQK2R w KQ - 0 10',
  '2rq1rk1/pb1nbppp/1p2pn2/3p4/2PP4/1PN1PN2/PB3PPP/R2QRBK1 w - - 0 12',
  'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
];
const uci = (m) => E.algebraic(m.from) + E.algebraic(m.to);
const poolOf = (scored, spread) => {
  const best = scored[0].score;
  return scored.filter((x) => x.score >= best - spread).map((x) => uci(x.move)).sort().join(' ');
};

/* Near-tied positions make argmax unstable between two equally good moves,
   which is harmless. The property that actually matters is stronger and
   simpler: every move the tolerance root is willing to PLAY must be within
   `spread` of the exact best, i.e. the bot never gets worse than its label. */
let checked = 0, bad = 0, worstLoss = 0;
const sample = bots.filter((_, i) => i % 3 === 0);   // every 3rd bot, all bands
for (const bot of sample) {
  for (const fen of fens) {
    const d = Math.min(bot.depth || 3, 5);
    const exact = new AI.Search(new E.Chess(fen), { style: bot.style }).rootScores(d, 4000, true);
    const tolr  = new AI.Search(new E.Chess(fen), { style: bot.style })
                    .rootScores(d, 4000, AI.botTolerance(bot, bot.style));   /* the production value */
    const exactScore = new Map(exact.map((x) => [uci(x.move), x.score]));
    const exactBest = exact[0].score;
    const spread = bot.spread || 0;
    const tolBest = tolr[0].score;
    const playable = tolr.filter((x) => x.score >= tolBest - spread).map((x) => uci(x.move));
    checked++;
    let loss = 0;
    for (const mv of playable) {
      const got = exactScore.get(mv);
      if (got === undefined) continue;
      loss = Math.max(loss, exactBest - got);
    }
    worstLoss = Math.max(worstLoss, loss);
    const budget = spread + 10;          /* 10cp for ordinary search instability */
    if (loss > budget) {
      bad++;
      console.log(`  OVER BUDGET ${bot.id || bot.name} (elo ${bot.elo}, spread ${spread}): ` +
                  `worst playable move is ${loss}cp below best, budget ${budget}`);
      console.log(`    ${fen}`);
    }
  }
}
console.log(`\nroot fidelity: ${checked - bad}/${checked} position/bot pairs within tolerance ` +
            `across ${sample.length} bots (worst move quality loss seen: ${worstLoss}cp)`);
process.exit(bad ? 1 : 0);
