/*
 * bench.js — measure engine strength, so changes can be judged instead of
 * guessed at. Two measures:
 *   1. tactical solve rate over the 140 shipped puzzles (known best move)
 *   2. nodes and time, to see what a change costs
 *
 * usage: node tools/bench.js [depth] [ms]
 */
'use strict';
const path = require('path');
const P = (f) => path.join(__dirname, '..', 'assets', 'js', f);
const E = require(P('engine.js'));
require(P('openings.js'));
const AI = require(P('ai.js'));
const PZ = require(P('puzzles.js'));

const depth = +(process.argv[2] || 6);
const ms = +(process.argv[3] || 1500);

const bands = {};
let solved = 0, total = 0, nodes = 0;
const t0 = Date.now();
const failures = [];

for (const p of PZ.PUZZLES) {
  let g;
  try { g = new E.Chess(p.fen); } catch (e) { continue; }
  const s = new AI.Search(g, {});
  const scored = s.rootScores(depth, ms);
  if (!scored.length) continue;
  const mv = scored[0].move;
  const uci = E.algebraic(mv.from) + E.algebraic(mv.to) +
              (mv.promo ? 'nbrq'[mv.promo - 2] || '' : '');
  const good = uci === p.uci;
  total++; if (good) solved++;
  nodes += s.nodes || 0;
  const band = Math.floor((p.rating || 1000) / 400) * 400;
  bands[band] = bands[band] || { n: 0, ok: 0 };
  bands[band].n++; if (good) bands[band].ok++;
  if (!good && failures.length < 6) failures.push({ id: p.id, want: p.uci, got: uci, kind: p.kind, rating: p.rating });
}

const secs = (Date.now() - t0) / 1000;
console.log(`\ndepth ${depth}  budget ${ms}ms`);
console.log(`SOLVED ${solved}/${total}  = ${(solved / total * 100).toFixed(1)}%`);
console.log(`time ${secs.toFixed(1)}s   nodes ${(nodes / 1e6).toFixed(2)}M   ${Math.round(nodes / secs / 1000)}k nps`);
console.log('by puzzle rating:');
Object.keys(bands).sort((a, b) => a - b).forEach((b) => {
  const x = bands[b];
  console.log(`  ${b}-${+b + 399}  ${x.ok}/${x.n}  ${(x.ok / x.n * 100).toFixed(0)}%`);
});
if (failures.length) {
  console.log('sample misses:');
  failures.forEach((f) => console.log(`  #${f.id} ${f.kind} r${f.rating}  wanted ${f.want} played ${f.got}`));
}
