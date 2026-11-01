'use strict';
/* Tune the bot roster:
   - blunder x0.75 for elo >= 1200 (fewer outright gifts across the ladder)
   - timeMs x1.25 (rounded to 10ms) for elo >= 1600
   - trapWeight on the strategic/tricky characters (force-opponent-mistake layer)
   - Professor: depth 14, more clock, strategic style, trapWeight 80
*/
const fs = require('fs');
const path = 'assets/js/bots.js';
let s = fs.readFileSync(path, 'utf8');

const trapWeight = {
  professor: 80, lelouch: 65, lawliet: 60, sherlock: 55, scofield: 55, tommy: 50,
  elliot: 50, aizen: 65, light: 45, tyrion: 45, gus: 45, sangwoo: 40, jonas: 50,
  mycroft: 40, dolores: 35, villanelle: 30, pablo: 35, ragnar: 35, arya: 35,
  jimmy: 45, wednesday: 25, lucifer: 30, nairobi: 30, frontman: 25, heisenberg: 30,
  kovacs: 40, vi: 20
};

const blocks = s.split(/(?=^    \{ id: ')/m);
let out = '';
for (const block of blocks) {
  if (!/^    \{ id: '/.test(block)) { out += block; continue; }

  const id = block.match(/id: '([^']+)'/)[1];
  const eloM = block.match(/elo: (\d+),/);
  const elo = eloM ? +eloM[1] : 0;

  let b = block;

  // --- Professor: full rewrite ---
  if (id === 'professor') {
    b = `    { id: 'professor', name: 'The Professor', elo: 2800, avatar: 'avatars/professor.jpg',\n` +
      `      title: 'The Mastermind', country: 'ES', series: 'Money Heist',\n` +
      `      blurb: 'He planned for this position. He planned for every position. He sees the traps before they are sprung, converts the smallest edge and never blunders. The strongest bot here.',\n` +
      `      tactic: 'Every line prepared in advance, quiet traps, surgical endgame conversion, zero mistakes',\n` +
      `      book: ['gambit', 'attack', 'positional', 'solid', 'hyper', 'tricky'],\n` +
      `      style: { material:1.02, kingAttack:1.15, centre:1.35, pawns:1.25, passers:1.45, rooks:1.35, bishops:1.05, safety:1.15, aggression:0.05, trade:0.45 },\n` +
      `      depth: 14, timeMs: 5000, blunder: 0, spread: 0, contempt: 16, trapWeight: 80 },\n`;
    out += b;
    continue;
  }

  // blunder reduction for elo >= 1200
  b = b.replace(/blunder: ([\d.]+),/, (m, v) => {
    if (elo >= 1200) {
      const nv = Math.round((+v) * 0.75 * 1000) / 1000;
      return 'blunder: ' + nv.toFixed(3) + ',';
    }
    return m;
  });

  // more thinking time for elo >= 1600
  b = b.replace(/timeMs: (\d+),/, (m, v) => {
    if (elo >= 1600) {
      const nv = Math.round((+v) * 1.25 / 10) * 10;
      return 'timeMs: ' + nv + ',';
    }
    return m;
  });

  // trapWeight inserted on the contempt line for chosen characters
  if (trapWeight[id]) {
    b = b.replace(/(contempt: \d+)( })/, (m, p1, p2) => p1 + ', trapWeight: ' + trapWeight[id] + p2);
  }

  out += b;
}

fs.writeFileSync(path, out);
console.log('done');