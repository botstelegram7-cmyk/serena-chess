/* Fast structural + ordering guarantees for the human opponent. The slow
   full ACPL sweep lives in human_calib.js and is run by hand when the
   curves change. */
const E = require('/home/user/android-chess/assets/js/engine.js');
require('/home/user/android-chess/assets/js/openings.js');
const AI = require('/home/user/android-chess/assets/js/ai.js');
const H  = require('/home/user/android-chess/assets/js/human.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  FAIL:', m); } };

/* ── profile shape ── */
const p1 = H.profile(400), p9 = H.profile(2800);
ok(H.profile(50).elo === 400, 'elo clamps to floor');
ok(H.profile(9999).elo === 2800, 'elo clamps to ceiling');
ok(p9.horizon > p1.horizon, 'stronger players calculate deeper');
ok(p9.temp < p1.temp, 'stronger players are less random');
ok(p9.maxLoss < p1.maxLoss, 'stronger players have a tighter error ceiling');
ok(p9.slip < p1.slip, 'stronger players slip less often');
ok(p9.bookOdds > p1.bookOdds, 'stronger players know more theory');
ok(p9.timeMs > p1.timeMs, 'stronger players think longer');

/* ── always returns a legal move, never throws ── */
let legalOk = true;
for (const elo of [400, 900, 1500, 2100, 2800]) {
  const g = new E.Chess(); const hist = [];
  for (let i = 0; i < 24; i++) {
    const legal = g.moves(); if (!legal.length) break;
    const mv = H.pickMove(g, { elo, lastTo: -1 }, hist);
    if (!mv || !legal.some(l => l.from === mv.from && l.to === mv.to && (l.promo||0) === (mv.promo||0))) {
      legalOk = false; break;
    }
    hist.push(g.moveToSan(mv, legal)); g.makeMove(mv);
  }
}
ok(legalOk, 'every rating returns only legal moves over a full opening');

/* ── takes a mate in one when it can see it ── */
let sawMate = 0;
for (let i = 0; i < 12; i++) {
  const g = new E.Chess('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  const mv = H.pickMove(g, { elo: 1800 }, ['x','x','x','x','x','x','x','x','x','x','x','x']);
  const san = g.moveToSan(mv, g.moves());
  if (san.indexOf('#') >= 0 || san === 'Ra8') sawMate++;
}
ok(sawMate >= 9, 'a 1800 finds back-rank mate in one (' + sawMate + '/12)');

/* ── a weak player is measurably worse than a strong one ──
   Measured as centipawn loss against a reference search that is DEEPER than
   either player's horizon. An earlier version of this test compared the
   model to a depth-4 reference and "failed" the 2700, which was wrong: a
   player searching seven plies legitimately disagrees with a four-ply
   reference. The reference has to outrank both sides or it measures
   disagreement rather than error. The full sweep lives in human_calib.js. */
function acpl(elo, n) {
  const losses = []; let guard = 0;
  const cl = v => Math.max(-2000, Math.min(2000, v));
  while (losses.length < n && guard++ < 16) {
    const g = new E.Chess(); const hist = [];
    for (let ply = 0; ply < 42 && losses.length < n; ply++) {
      if (!g.moves().length) break;
      const mv = H.pickMove(g, { elo }, hist);
      if (!mv) break;
      if (ply >= 10) {
        const ref = new AI.Search(g, { contempt: 0, style: AI.DEFAULT_STYLE }).rootScores(6, 650);
        const hit = ref.find(r => r.move.from === mv.from && r.move.to === mv.to);
        if (hit && ref.length > 2) losses.push(Math.max(0, cl(ref[0].score) - cl(hit.score)));
      }
      hist.push(g.moveToSan(mv, g.moves())); g.makeMove(mv);
    }
  }
  return losses.reduce((a, b) => a + b, 0) / (losses.length || 1);
}
const weak = acpl(500, 26), strong = acpl(2200, 26);
ok(weak > strong * 2,
   `a 500 loses far more per move than a 2200 (${Math.round(weak)}cp vs ${Math.round(strong)}cp)`);
ok(strong < 80, `a 2200 stays accurate (${Math.round(strong)}cp average loss)`);
ok(weak > 90, `a 500 really does play badly (${Math.round(weak)}cp average loss)`);

/* ── identity looks like a person, not a product ── */
const names = new Set();
/* word boundaries matter here: "bishoppair" contains the letters a-i and a
   naive /ai/ would flag a perfectly human handle */
const LEAK = /\bbots?\b|\bai\b|engine|computer|\bcpu\b|\bbot[0-9_]/i;
let leaked = null, malformed = null;
for (let i = 0; i < 200; i++) {
  const id = H.identity(1500);
  names.add(id.name);
  if (LEAK.test(id.name)) leaked = leaked || id.name;
  if (!id.avatar.startsWith('avatars/player') || !/^[A-Z]{2}$/.test(id.country)) malformed = malformed || JSON.stringify(id);
}
ok(!leaked, 'identity never leaks that it is software (' + leaked + ')');
ok(!malformed, 'identity fields well formed (' + malformed + ')');
ok(names.size > 60, `identities are varied (${names.size} distinct in 200)`);
ok(H.identity(2000).rating === 2000, 'identity carries the chosen rating');

/* ── band labels cover the slider ── */
const bands = new Set();
for (let e = 400; e <= 2800; e += 50) bands.add(H.band(e));
ok(bands.size >= 6, 'slider shows several distinct skill descriptions');
ok(!/bot|engine|level/i.test([...bands].join(' ')), 'band labels never mention bots or levels');

/* ── thinking time is variable, not a metronome ── */
const g2 = new E.Chess();
const times = []; for (let i = 0; i < 40; i++) times.push(H.thinkMs(g2, { elo: 1500 }, false));
const mean = times.reduce((a,b)=>a+b,0)/times.length;
const sd = Math.sqrt(times.reduce((a,b)=>a+(b-mean)**2,0)/times.length);
ok(sd / mean > 0.35, `think time varies like a person (cv=${(sd/mean).toFixed(2)})`);
ok(H.thinkMs(g2, { elo: 1500 }, true) < 600, 'forced recaptures are near-instant');

console.log(`\nhuman_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
