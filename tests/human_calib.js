/* Measures what the human model actually does, by scoring every move it
   plays against a deeper reference search. ACPL = average centipawn loss. */
const E = require('../assets/js/engine.js');
require('../assets/js/openings.js');
const AI = require('../assets/js/ai.js');
const H  = require('../assets/js/human.js');

const REF_DEPTH = 6, REF_MS = 520, SAMPLES = Number(process.argv[3] || 24);
const MATE = AI.MATE;
const clampCp = v => Math.max(-2000, Math.min(2000, v));

function measure(elo) {
  let losses = [], blunders = 0, samples = 0, guard = 0;
  while (samples < SAMPLES && guard++ < 40) {
    const g = new E.Chess();
    const hist = [];
    let lastTo = -1;
    for (let ply = 0; ply < 70 && samples < SAMPLES; ply++) {
      if (g.moves().length === 0) break;
      const st = g.status && g.status(); if (st && st.over) break;

      const mv = H.pickMove(g, { elo, lastTo }, hist);
      if (!mv) break;

      if (ply >= 10) {                      // out of book, into real decisions
        const s = new AI.Search(g, { contempt: 0, style: AI.DEFAULT_STYLE });
        const ref = s.rootScores(REF_DEPTH, REF_MS);
        if (ref.length > 1) {
          const best = clampCp(ref[0].score);
          const hit = ref.find(r => r.move.from === mv.from && r.move.to === mv.to
                                 && (r.move.promo || 0) === (mv.promo || 0));
          if (hit) {
            const loss = Math.max(0, best - clampCp(hit.score));
            losses.push(loss);
            if (loss > 200) blunders++;
            samples++;
          }
        }
      }
      hist.push(g.moveToSan(mv, g.moves()));
      lastTo = mv.to;
      g.makeMove(mv);
    }
  }
  const acpl = losses.reduce((a, b) => a + b, 0) / (losses.length || 1);
  return { elo, acpl: Math.round(acpl), blunderPct: +(100 * blunders / (losses.length || 1)).toFixed(1), n: losses.length };
}

const bands = (process.argv[2] || '800,1200,1600,2000,2400').split(',').map(Number);
console.log('elo   ACPL   blunder%   n');
const out = [];
for (const b of bands) { const r = measure(b); out.push(r);
  console.log(String(r.elo).padStart(4), String(r.acpl).padStart(6), String(r.blunderPct).padStart(9), String(r.n).padStart(4)); }
const mono = out.every((r, i) => i === 0 || out[i-1].acpl >= r.acpl);
console.log('\nmonotonic (stronger => fewer errors):', mono ? 'YES' : 'NO');
process.exit(0);
