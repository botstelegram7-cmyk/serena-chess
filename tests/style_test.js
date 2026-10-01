const E = require('../assets/js/engine.js'); global.ChessEngine = E;
global.ChessOpenings = require('../assets/js/openings.js');
const AI = require('../assets/js/ai.js');
const BOTS = require('../assets/js/bots.js');

// ---- 1. perft regression: the rules engine must be untouched by eval changes
const t0 = Date.now();
const g = new E.Chess();
function perft(g, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of g.moves()) { g.makeMove(m); if (!g.isAttacked(g.kings[g.turn^1], g.turn)) n += perft(g, d-1); g.undoMove(); }
  return n;
}
const p5 = perft(g, 5);
console.log(`perft(5) = ${p5.toLocaleString()} ${p5 === 4865609 ? 'OK' : 'FAIL'}  (${Date.now()-t0} ms)`);

// ---- 2. do different bots pick different opening moves?
function play(white, black, maxPly = 24, fast = true) {
  const g = new E.Chess(); const hist = [];
  for (let ply = 0; ply < maxPly; ply++) {
    const st = g.status(); if (st && st.over) break;
    const bot = (g.turn === E.WHITE) ? white : black;
    const b = fast ? Object.assign({}, bot, { depth: Math.min(bot.depth, 3), timeMs: 220 }) : bot;
    const mv = AI.pickMove(g, b, hist);
    if (!mv) break;
    hist.push(g.moveToSan(mv, g.moves()));
    g.makeMove(mv);
  }
  return { hist, g };
}

console.log('\n--- opening fingerprints (same opponent, 10 plies) ---');
const foil = BOTS.byId('poe');
const sample = ['tokyo','gus','levi','elliot','tywin','jonas','lucifer','helsinki'];
const seen = new Map();
for (const id of sample) {
  const b = BOTS.byId(id);
  const { hist } = play(b, foil, 10);
  const line = hist.join(' ');
  seen.set(id, line);
  console.log(`  ${b.name.padEnd(10)} ${line}`);
}
console.log(`  distinct lines: ${new Set(seen.values()).size}/${sample.length}`);

// ---- 3. does the style actually change what a bot wants? (same position, different eval)
console.log('\n--- same position, different bots, different best move ---');
const mid = new E.Chess('r1bq1rk1/pp2ppbp/2np1np1/2p5/2B1P3/2NP1N1P/PPP2PP1/R1BQ1RK1 w - - 0 8');
const picks = {};
for (const id of ['tokyo','gus','tywin','levi','heisenberg','pablo']) {
  const b = Object.assign({}, BOTS.byId(id), { depth: 4, timeMs: 700, blunder: 0, spread: 0 });
  const m = AI.pickMove(mid, b, null);
  picks[BOTS.byId(id).name] = mid.moveToSan(m, mid.moves());
}
console.log(' ', JSON.stringify(picks));
console.log(`  distinct choices: ${new Set(Object.values(picks)).size}/6`);

// ---- 4. ladder sanity: stronger bot should beat much weaker bot
console.log('\n--- strength ladder (higher Elo should win) ---');
const pairs = [['denver','berlin'], ['eleven','heisenberg'], ['scofield','jonas'], ['tommy','light']];
for (const [lo, hi] of pairs) {
  let hiScore = 0, games = 2;
  for (let i = 0; i < games; i++) {
    const L = BOTS.byId(lo), H = BOTS.byId(hi);
    const w = i % 2 === 0 ? H : L, b2 = i % 2 === 0 ? L : H;
    const { g } = play(w, b2, 90);
    const st = g.status() || {};
    let res = 'draw';
    if (st.over && st.reason === 'checkmate') res = (g.turn === E.WHITE) ? 'black' : 'white';
    const hiIsWhite = (i % 2 === 0);
    if (res === 'draw') hiScore += 0.5;
    else if ((res === 'white') === hiIsWhite) hiScore += 1;
  }
  const H = BOTS.byId(hi), L = BOTS.byId(lo);
  console.log(`  ${H.name}(${H.elo}) vs ${L.name}(${L.elo}): ${hiScore}/${games} ${hiScore >= games/2 ? 'OK' : 'UPSET'}`);
}

// ---- 5. every bot must produce a legal move from the start position
console.log('\n--- every bot in the roster returns a legal first move ---');
let bad = [];
for (const b of BOTS.BOTS) {
  const gg = new E.Chess();
  const fast = Object.assign({}, b, { depth: 2, timeMs: 150 });
  const mv = AI.pickMove(gg, fast, []);
  const legal = gg.moves().some(x => x.from === mv.from && x.to === mv.to);
  if (!mv || !legal) bad.push(b.id);
}
console.log(bad.length ? '  FAIL: ' + bad.join(',') : '  all ' + BOTS.BOTS.length + ' OK');
if (bad.length) process.exitCode = 1;

console.log('\n--- roster integrity ---');
var elos = BOTS.BOTS.map(function (b) { return b.elo; });
var sorted = elos.every(function (v, i) { return i === 0 || elos[i-1] <= v; });
var ids = BOTS.BOTS.map(function (b) { return b.id; });
var uniqIds = new Set(ids).size === ids.length;
var uniqNames = new Set(BOTS.BOTS.map(function (b) { return b.name; })).size === ids.length;
var gap = 0; for (var gi = 1; gi < elos.length; gi++) gap = Math.max(gap, elos[gi] - elos[gi-1]);
var fields = BOTS.BOTS.filter(function (b) {
  return !b.name || !b.avatar || !b.title || !b.blurb || !b.tactic || !b.style ||
         !b.book || !b.book.length || typeof b.depth !== 'number';
});
var styleKeys = ['material','kingAttack','centre','pawns','passers','rooks','bishops','safety','aggression','trade'];
var badStyle = BOTS.BOTS.filter(function (b) { return styleKeys.some(function (k) { return typeof b.style[k] !== 'number'; }); });
console.log('  count:', BOTS.BOTS.length);
console.log('  sorted by elo:', sorted ? 'yes' : 'NO');
console.log('  unique ids / names:', (uniqIds && uniqNames) ? 'yes' : 'NO');
console.log('  largest elo gap:', gap);
console.log('  entries missing fields:', fields.length ? fields.map(function(b){return b.id;}).join(',') : 'none');
console.log('  entries with bad style weights:', badStyle.length ? badStyle.map(function(b){return b.id;}).join(',') : 'none');
var fs = require('fs'), pathm = require('path');
var AVDIR = pathm.join(__dirname, '..', 'assets');
/* Every character needs real artwork. Placeholder monogram tiles are flat
   colour and compress to about 2 KB, while an illustrated 220x220 portrait
   never does -- that difference is the cheapest reliable way to notice a
   placeholder that was never replaced, which is exactly what shipped in
   1.6 and had to be fixed in 1.7.1. */
var MIN_ART_BYTES = 4500;   /* placeholder tiles ~2.2 KB, thinnest real portrait ~6.0 KB */
var noFile = [], tooFlat = [];
BOTS.BOTS.forEach(function (b) {
  var p = pathm.join(AVDIR, b.avatar);
  if (!fs.existsSync(p)) { noFile.push(b.id); return; }
  if (fs.statSync(p).size < MIN_ART_BYTES) tooFlat.push(b.id);
});
console.log('  avatars missing:', noFile.length ? noFile.join(',') : 'none');
console.log('  avatars that look like placeholders:', tooFlat.length ? tooFlat.join(',') : 'none');
if (noFile.length || tooFlat.length) process.exitCode = 1;

if (!sorted || !uniqIds || !uniqNames || gap > 150 || fields.length || badStyle.length) process.exitCode = 1;
