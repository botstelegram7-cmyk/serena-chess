const E = require('../assets/js/engine.js'); global.ChessEngine = E;
global.ChessOpenings = require('../assets/js/openings.js');
const AI = require('../assets/js/ai.js'); global.ChessAI = AI;
const R = require('../assets/js/review.js');

// --- history round-trip & navigation
const scholars = ['e4','e5','Bc4','Nc6','Qh5','Nf6','Qxf7#'];
const h = R.History.fromSan(scholars);
console.log('history plies:', h.length(), '| fens:', h.fens.length, h.length()===7 ? 'OK':'FAIL');
const g3 = h.gameAt(3);
console.log('ply3 turn is black:', g3.turn === E.BLACK, '| ply0 = startpos:', h.gameAt(0).fen().startsWith('rnbqkbnr/pppppppp'));
const gEnd = h.gameAt(7);
console.log('final is checkmate:', (gEnd.status()||{}).reason === 'checkmate');
// navigation must be reversible
let ok = true;
for (let p = 0; p <= h.length(); p++) if (h.gameAt(p).fen() !== h.fens[p]) ok = false;
console.log('all plies reconstruct:', ok);

// --- opening names
const cases = [
  [['e4','e5','Nf3','Nc6','Bb5','a6'], 'Ruy'],
  [['d4','Nf6','c4','e6','Nc3','Bb4'], 'Nimzo'],
  [['e4','c5','Nf3','d6'], 'Sicilian'],
  [['d4','d5','c4','c6'], 'Slav'],
  [['c4','e5'], 'English'],
];
for (const [mv, want] of cases) {
  const n = R.openingName(mv);
  console.log(`  ${mv.join(' ').padEnd(26)} -> ${String(n).padEnd(28)} ${n && n.includes(want)?'OK':'?'}`);
}

// --- analysis on scholar's mate: black's 6...Nf6?? must be a blunder
R.analyse(h, { depth: 4, timeMs: 300, onDone(res) {
  console.log('\nanalysis:');
  for (const m of res.moves) console.log(`  ${String(m.ply+1).padStart(2)}. ${m.san.padEnd(7)} ${m.label.padEnd(11)} cpLoss=${String(m.cpLoss).padStart(5)} acc=${m.accuracy.toFixed(1)}`);
  console.log(`  white acc ${res.white.accuracy} | black acc ${res.black.accuracy} | opening: ${res.opening}`);
  const last = res.moves[5]; // black's Nf6 allowing mate
  console.log('  black blundered before mate:', ['blunder','mistake'].includes(last.label) ? 'OK' : 'got ' + last.label);
  console.log('  white more accurate than black:', res.white.accuracy > res.black.accuracy ? 'OK':'FAIL');
  console.log('  accuracy in range:', res.white.accuracy<=100 && res.black.accuracy>=0 ? 'OK':'FAIL');

  // --- PGN
  const p = R.pgn(h, { white:'Serena', black:'Jonas', result:'1-0', whiteElo:1450, blackElo:3200, tc:'600' });
  console.log('\nPGN:\n' + p);
  console.log('pgn has result:', p.includes('1-0'), '| has opening tag:', p.includes('[Opening'));
}});
