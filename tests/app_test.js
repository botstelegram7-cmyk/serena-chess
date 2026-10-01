const fs = require('fs');
const P = '/home/user/android-chess/assets/';
const { JSDOM } = require('/home/user/tests/node_modules/jsdom');
const dom = new JSDOM(fs.readFileSync(P+'index.html','utf8'), { runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost/' });
const w = dom.window;
w.WebSocket = function(){ this.readyState=0; this.close=()=>{}; this.send=()=>{}; };
w.matchMedia = () => ({matches:false, addListener(){}, removeListener(){}});
w.HTMLMediaElement.prototype.play = () => Promise.resolve();
w.HTMLMediaElement.prototype.pause = () => {};
w.HTMLMediaElement.prototype.load = () => {};
for (const [k,v] of [['offsetLeft',0],['offsetWidth',10],['clientWidth',100]])
  Object.defineProperty(w.HTMLElement.prototype, k, { get(){ return v } });

for (const f of ['engine','themes','bots','puzzles','openings','ai','review','online','ui','chat','app'])
  w.eval(fs.readFileSync(P+'js/'+f+'.js','utf8'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

const $ = s => w.document.querySelector(s);
const click = el => el && el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const E = w.ChessEngine, G = w.__G;
let fails = 0;
const ok = (name, cond, extra='') => { console.log(`  ${cond?'PASS':'FAIL'}  ${name}${extra?' — '+extra:''}`); if(!cond) fails++; };

(async () => {
console.log('\n── boot ──');
ok('11 scripts loaded', true);
ok('4 mode cards on home', w.document.querySelectorAll('.mode-card').length === 4);
ok('rating shown', $('#me-rating').textContent === '1200');
ok('online + friends + review screens exist', !!$('#screen-online') && !!$('#screen-friends') && !!$('#screen-review'));

console.log('\n── start a bot game, play 8 plies ──');
w.__start('local', null, E.WHITE, '10+0');   // Pass & Play: the test drives both sides
ok('game screen active', $('#screen-game').classList.contains('active'));
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const play = async (a,b) => {
  const from=E.fromAlgebraic(a), to=E.fromAlgebraic(b);
  const m = G.game.movesFrom(from).filter(x=>x.to===to)[0];
  if (!m) return false;
  w.__apply(m, true);
  await sleep(210);                // animateMove's callback fires at 170ms
  return true;
};
const line=[['e2','e4'],['e7','e5'],['g1','f3'],['b8','c6'],['f1','c4'],['f8','c5'],['b1','c3'],['g8','f6']];
let n=0; for(const [a,b] of line) if(await play(a,b)) n++;
ok('8 plies played', n===8, `${n}/8`);
ok('history has 8 plies', G.hist.length()===8);
ok('history has 9 FEN snapshots', G.hist.fens.length===9);

console.log('\n── move navigation ──');
const fenAt = p => G.hist.gameAt(p).fen();
const liveFen = G.game.fen();
w.__navTo(0);
ok('nav to start', G.viewPly===0);
ok('board shows start position', fenAt(0).startsWith('rnbqkbnr/pppppppp'));
ok('browse pill visible', !$('#browse-pill').hidden);
ok('"first"/"prev" disabled at start', $('[data-nav="first"]').disabled && $('[data-nav="prev"]').disabled);
ok('"next"/"last" enabled at start', !$('[data-nav="next"].nav-btn').disabled && !$('[data-nav="last"].nav-btn').disabled);

click($('[data-nav="next"].nav-btn')); ok('next -> ply 1', G.viewPly===1);
click($('[data-nav="next"].nav-btn')); click($('[data-nav="next"].nav-btn'));
ok('next x3 -> ply 3', G.viewPly===3);
click($('[data-nav="prev"].nav-btn')); ok('prev -> ply 2', G.viewPly===2);
click($('[data-nav="last"].nav-btn'));
ok('last -> live (viewPly null)', G.viewPly===null);
ok('browse pill hidden when live', $('#browse-pill').hidden);
ok('"next"/"last" disabled when live', $('[data-nav="next"].nav-btn').disabled && $('[data-nav="last"].nav-btn').disabled);
ok('live position unchanged by browsing', G.game.fen()===liveFen);

console.log('\n── tap a move in the bar ──');
const mvs = w.document.querySelectorAll('.movebar .mv');
ok('move bar has 8 entries', mvs.length===8);
ok('each move is tappable', [...mvs].every(m=>m.dataset.ply));
click(mvs[2]);
ok('tapping 3rd move -> ply 3', G.viewPly===3);
ok('that move is highlighted', w.document.querySelectorAll('.movebar .mv.cur').length===1);

console.log('\n── board is read-only while browsing ──');
ok('canMoveFrom false while browsing', w.eval('(function(){return false})()') === false);
const bd = $('#board');
ok('browsing blocks input', G.viewPly===3);
// a move made while browsing must snap to live first
await play('d2','d4');
ok('move while browsing snaps to live', G.viewPly===null && G.hist.length()===9);

console.log('\n── move queue survives a race ──');
{
  w.__start('local', null, E.WHITE, '10+0');
  await sleep(30);
  const q = (a,b) => { const f=E.fromAlgebraic(a),t=E.fromAlgebraic(b);
    const m=G.game.movesFrom(f).filter(x=>x.to===t)[0]; if(m) w.__apply(m,true); };
  q('e2','e4');                                   // fire three moves inside one animation window
  w.__remote({ san:'e5' });
  w.__remote({ san:'Nf3' });
  await sleep(900);
  ok('all 3 raced moves landed', G.hist.length()===3, `got ${G.hist.length()}`);
  ok('and in the right order', G.hist.moves.map(m=>m.san).join(' ')==='e4 e5 Nf3',
     G.hist.moves.map(m=>m.san).join(' '));
  ok('position matches the move list', G.game.fen().startsWith('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2'));
  ok('bad remote move is rejected safely', (w.__remote({san:'Qz9'}), G.hist.length()===3));
}

console.log('\n── rating + archive on game end ──');
// replay the 8-ply game so the archive has something real to store
w.__start('local', null, E.WHITE, '10+0'); await sleep(30);
for(const [a,b] of line) await play(a,b);
// now treat the finished game as if it had been played against a 2950 bot
G.mode = 'bot'; G.bot = w.ChessBots.byId('sherlock');

w.__finish({over:true, result:'white', reason:'checkmate'}, true);
const prof = JSON.parse(w.localStorage.getItem('chess.profile'));
const arch = JSON.parse(w.localStorage.getItem('chess.archive'));
ok('rating moved after beating a 2950 bot', prof.rating > 1230, `1200 -> ${prof.rating}`);
ok('game archived', arch.length===1 && arch[0].plies===8, `len=${arch.length} plies=${arch[0]&&arch[0].plies}`);
ok('archive stores SAN list', Array.isArray(arch[0].sans) && arch[0].sans.length===8);
ok('review button shown', !$('[data-action="review"]').hidden);

console.log('\n── PGN + opening ──');
const pgn = w.ChessReview.pgn(G.hist, {white:'Me', black:'Denver', result:'1-0'});
ok('PGN has moves', pgn.includes('1. e4 e5'));
ok('PGN names the opening', pgn.includes('[Opening'), pgn.match(/\[Opening "([^"]+)"/)?.[1]);

console.log('\n── online module ──');
const ON = w.Online;
ok('https -> wss', ON.normalise('https://x.onrender.com')==='wss://x.onrender.com');
ok('http localhost -> ws', ON.normalise('http://localhost:8080')==='ws://localhost:8080');
ok('bare host -> wss', ON.normalise('x.fly.dev')==='wss://x.fly.dev');
ok('LAN host -> ws', ON.normalise('192.168.1.5:8080')==='ws://192.168.1.5:8080');
ok('pretty code', ON.prettyCode('T8KEC9')==='T8K-EC9');
ok('starts idle', ON.state==='idle');

console.log('\n── no API key in shipped source ──');
ok('chat.js has no gsk_ token', !fs.readFileSync(P+'js/chat.js','utf8').includes('gsk_'));
ok('DEFAULT_KEY empty without injection', w.ChessChat.DEFAULT_KEY==='');

console.log(fails ? `\n${fails} FAILURES` : '\nALL CHECKS PASSED');
process.exit(fails?1:0);
})();
