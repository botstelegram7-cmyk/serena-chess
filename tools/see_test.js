/* Static exchange evaluation regression tests. */
const path = require('path');
const E = require(path.join(__dirname, '..', 'assets', 'js', 'engine.js'));
const AI = require(path.join(__dirname, '..', 'assets', 'js', 'ai.js'));

const cases = [
  ['7k/8/8/3p4/8/8/8/R2K4 w - - 0 1', 'a1a5', null, 'quiet rook move, no capture'],
  ['7k/8/8/3p4/8/8/8/3RK3 w - - 0 1', 'd1d5', 100, 'RxP undefended = +pawn'],
  ['4k3/3p4/8/8/8/8/8/3QK3 w - - 0 1', 'd1d7', -800, 'QxP defended by king'],
  ['4k3/2p5/3n4/8/4N3/8/8/4K3 w - - 0 1', 'e4d6', 0, 'NxN, pawn recaptures = even'],
  ['4k3/1p6/8/2r5/8/8/8/3QK3 w - - 0 1', 'd1c5', -400, 'QxR defended by pawn'],
  ['4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 'e4d5', 900, 'PxQ undefended'],
];

let pass = 0, fail = 0;
for (const [fen, uci, want, note] of cases) {
  const g = new E.Chess(fen);
  const mv = g.moves().find((m) => E.algebraic(m.from) + E.algebraic(m.to) === uci);
  if (!mv) { console.log('SKIP (illegal in position)', uci, note); continue; }
  if (want === null) { pass++; continue; }
  const got = AI.see(g, mv);
  if (got === want) { pass++; console.log('  ok  ', uci, got, '-', note); }
  else { fail++; console.log('  FAIL', uci, 'got', got, 'want', want, '-', note); }
}
console.log(`\nSEE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
