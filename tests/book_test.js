const E = require('../assets/js/engine.js');
const OB = require('../assets/js/openings.js');
let bad = 0, lines = 0, plies = 0;
for (const key in OB.LINES) {
  OB.LINES[key].forEach((line, i) => {
    lines++;
    const g = new E.Chess();
    for (let p = 0; p < line.length; p++) {
      const legal = g.moves().filter(m => { g.makeMove(m); const ok = !g.isAttacked(g.kings[g.turn^1], g.turn); g.undoMove(); return ok; });
      const want = line[p].replace(/[+#!?]/g,'');
      const hit = legal.find(m => g.moveToSan(m, legal).replace(/[+#!?]/g,'') === want);
      if (!hit) { console.log(`  ILLEGAL  ${key}[${i}] ply ${p+1}: "${line[p]}"  after: ${line.slice(0,p).join(' ')}`); bad++; break; }
      g.makeMove(hit); plies++;
    }
  });
}
console.log(`${lines} book lines, ${plies} plies verified, ${bad} broken`);
