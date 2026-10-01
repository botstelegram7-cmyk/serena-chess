/*
 * progress_test.js — the progression, account and chart modules.
 *
 * These are pure functions over plain data, so they can be checked properly
 * without a browser. Run: node tests/progress_test.js
 */
'use strict';
const path = require('path');
const P = (f) => path.join(__dirname, '..', 'assets', 'js', f);
const PR = require(P('progress.js'));
const ACC = require(P('account.js'));
const CH = require(P('charts.js'));
const PZ = require(P('puzzles.js'));
const BOTS = require(P('bots.js'));

let fails = 0;
const ok = (name, cond) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}`); if (!cond) fails++; };
const sec = (t) => console.log(`\n── ${t} ──`);

/* ─────────────────────────────────────────────── puzzle rating ─── */
sec('puzzle rating');
let st = PR.blankPuzzleState();
const before = st.rating;
st = PR.scorePuzzle(st, { id: 1, rating: 1200, kind: 'material' }, true);
ok('solving a harder puzzle raises the rating', st.rating > before);
let st2 = PR.scorePuzzle(PR.blankPuzzleState(), { id: 1, rating: 600, kind: 'material' }, false);
ok('failing an easier puzzle lowers it', st2.rating < before);
const easyWin = PR.scorePuzzle(PR.blankPuzzleState(), { id: 2, rating: 400, kind: 'm' }, true).rating - before;
const hardWin = PR.scorePuzzle(PR.blankPuzzleState(), { id: 3, rating: 1800, kind: 'm' }, true).rating - before;
ok('beating a hard puzzle is worth more than an easy one', hardWin > easyWin);

let k = PR.blankPuzzleState();
for (let i = 0; i < 40; i++) k = PR.scorePuzzle(k, { id: i, rating: 1000, kind: 'm' }, i % 2 === 0);
const settled = Math.abs(PR.scorePuzzle(k, { id: 99, rating: 1000, kind: 'm' }, true).rating - k.rating);
const raw = PR.blankPuzzleState();
const firstJump = Math.abs(PR.scorePuzzle(raw, { id: 99, rating: 1000, kind: 'm' }, true).rating - raw.rating);
ok('the K factor shrinks as a player settles', settled < firstJump);
ok('scoring does not mutate the state handed in', k.played === 40);
ok('streaks are tracked', k.bestStreak >= 1 && k.played === 40);
ok('per-theme ratings are kept', PR.themeBreakdown(k).length === 1);

let floor = PR.blankPuzzleState();
for (let i = 0; i < 80; i++) floor = PR.scorePuzzle(floor, { id: i, rating: 400, kind: 'm' }, false);
ok('the rating cannot fall through the floor', floor.rating >= 400);

const near = PR.nextPuzzle(PZ.PUZZLES, { rating: 1500, seen: {}, themes: {} });
ok('the next puzzle is near the player strength', near && Math.abs(near.rating - 1500) <= 600);
const themed = PR.nextPuzzle(PZ.PUZZLES, PR.blankPuzzleState(), 'mate1');
ok('a theme filter still returns something', !!themed);

/* ──────────────────────────────────────────────── daily puzzle ─── */
sec('daily puzzle');
const d1 = PR.dailyPuzzle(PZ.PUZZLES, '2026-03-04');
const d2 = PR.dailyPuzzle(PZ.PUZZLES, '2026-03-04');
const d3 = PR.dailyPuzzle(PZ.PUZZLES, '2026-03-05');
ok('the same date always gives the same puzzle', d1.id === d2.id);
ok('a different date gives a different one', d1.id !== d3.id);
const spread = new Set();
for (let i = 1; i <= 60; i++) spread.add(PR.dailyPuzzle(PZ.PUZZLES, `2026-01-${String(i % 28 + 1).padStart(2, '0')}`).id);
ok('dates spread across the set rather than repeating', spread.size > 15);

let day = PR.recordDaily(null, true, '2026-03-01');
day = PR.recordDaily(day, true, '2026-03-02');
day = PR.recordDaily(day, true, '2026-03-03');
ok('consecutive days build a streak', day.streak === 3);
day = PR.recordDaily(day, true, '2026-03-03');
ok('solving twice on one day does not double count', day.streak === 3);
const gapped = PR.recordDaily(day, true, '2026-03-06');
ok('a missed day resets the streak', gapped.streak === 1);
ok('the best streak is remembered', gapped.best === 3);
ok('day arithmetic crosses a month end', PR.daysBetween('2026-01-31', '2026-02-01') === 1);

/* ───────────────────────────────────────────────────── ladder ─── */
sec('ladder');
const all = BOTS.BOTS;
let lad = PR.blankLadder();
let rows = PR.ladderState(all, lad);
ok('every character has a rung', rows.length === all.length);
ok('rungs are ordered by strength', rows[0].bot.elo <= rows[rows.length - 1].bot.elo);
ok('a few are open from the start', rows.filter((r) => r.open).length === PR.LADDER_SEED);
/* The first three rungs start open, so beating rung 1 opens nothing new --
   only clearing the highest open rung extends the climb. */
lad = PR.recordLadder(all, lad, rows[0].bot.id, true);
ok('beating an already-surpassed rung opens nothing new',
   PR.ladderState(all, lad).filter((r) => r.open).length === PR.LADDER_SEED);
lad = PR.recordLadder(all, lad, rows[PR.LADDER_SEED - 1].bot.id, true);
ok('clearing the top open rung unlocks the next',
   PR.ladderState(all, lad).filter((r) => r.open).length === PR.LADDER_SEED + 1);
const openBefore = PR.ladderState(all, lad).filter((r) => r.open).length;
lad = PR.recordLadder(all, lad, rows[1].bot.id, false);
ok('losing never closes a rung', PR.ladderState(all, lad).filter((r) => r.open).length === openBefore);
lad = PR.recordLadder(all, lad, rows[20].bot.id, true);
ok('an out-of-order win unlocks up to that point', PR.ladderSummary(all, lad).next.rung <= 22);
ok('progress is summarised', PR.ladderSummary(all, lad).beaten === 3);

/* ─────────────────────────────────────────────── achievements ─── */
sec('achievements');
const ctx = { stats: { w: 0, l: 0, d: 0 }, archive: [], profile: { rating: 1200 },
              puzzles: PR.blankPuzzleState(), daily: {}, ladder: { beaten: 0, total: 60 } };
let a1 = PR.evaluateAchievements(ctx, {});
ok('a new player has earned nothing', a1.count === 0);
const won = Object.assign({}, ctx, { stats: { w: 1, l: 0, d: 0 } });
let a2 = PR.evaluateAchievements(won, {});
ok('the first win unlocks exactly one', a2.fresh.length === 1 && a2.fresh[0].id === 'first-win');
let a3 = PR.evaluateAchievements(won, a2.earned);
ok('an achievement only fires once', a3.fresh.length === 0);
const big = Object.assign({}, ctx, {
  archive: [{ score: 1, oppElo: 2600 }, { score: 1, oppElo: 1200 }],
  stats: { w: 2, l: 0, d: 0 } });
ok('beating a strong opponent is detected', PR.bestBeaten(big.archive) === 2600);
ok('a win streak is counted from the newest game', PR.streak(big.archive) === 2);
ok('a loss breaks the streak', PR.streak([{ score: 1 }, { score: 0 }, { score: 1 }]) === 1);
ok('a broken test cannot crash evaluation',
   PR.evaluateAchievements({ stats: null, archive: null }, {}).total > 0);

/* ───────────────────────────────────────────── backup account ─── */
sec('backup and restore');
const store = {
  'chess.profile': { name: 'Serena', rating: 1640, photo: 'data:x' },
  'chess.stats': { w: 12, l: 4, d: 2 },
  'chess.archive': [{ at: 1, score: 1, delta: 8 }],
  'chess.settings': { board: 'green', groqKey: 'gsk_SECRET_VALUE' },
  'chess.puzzles': { rating: 1480, solved: 60 }
};
const read = (k) => (k in store ? store[k] : null);
const body = ACC.buildBackup(read, { version: '1.8', build: 10 });
ok('the backup is tagged so it can be recognised', body.magic === ACC.BACKUP_MAGIC);
ok('it carries a checksum', !!body.sum);
ok('the API key is stripped out', JSON.stringify(body).indexOf('gsk_SECRET_VALUE') < 0);
ok('ordinary settings survive', body.data['chess.settings'].board === 'green');
ok('the filename is dated', /^serena-chess-\d{4}-\d{2}-\d{2}\.json$/.test(ACC.backupFilename(body)));

ok('a valid backup validates', ACC.validateBackup(body).ok);
ok('rubbish is rejected', !ACC.validateBackup({ hello: 'world' }).ok);
ok('null is rejected', !ACC.validateBackup(null).ok);
const tampered = JSON.parse(JSON.stringify(body));
tampered.data['chess.profile'].rating = 2900;
ok('a tampered backup fails its checksum', !ACC.validateBackup(tampered).ok);
const future = JSON.parse(JSON.stringify(body));
future.format = 99;
ok('a backup from a newer app is refused', !ACC.validateBackup(future).ok);

const summary = ACC.validateBackup(body).summary;
ok('the summary names the player', summary.name === 'Serena' && summary.rating === 1640);

const dest = { 'chess.settings': { groqKey: 'gsk_THIS_DEVICE_KEY', board: 'brown' } };
const res = ACC.applyBackup(body, (k) => dest[k] || null, (k, v) => { dest[k] = v; });
ok('a restore reports success', res.ok && res.restored >= 4);
ok('restored data lands', dest['chess.profile'].rating === 1640);
ok("this device's API key is preserved, not wiped", dest['chess.settings'].groqKey === 'gsk_THIS_DEVICE_KEY');
ok('the backup still overwrote other settings', dest['chess.settings'].board === 'green');
ok('a bad restore changes nothing', !ACC.applyBackup({ nope: 1 }, () => null, () => { throw new Error('wrote!'); }).ok);

sec('identity');
ok('new players are guests', ACC.blankAccount().kind === 'guest');
ok('guests still get a stable id', /^g-[0-9a-f]{16}$/.test(ACC.blankAccount().id));
ok('ids are not shared between players', ACC.localId() !== ACC.localId());
ok('guest label reads plainly', ACC.label(ACC.blankAccount()) === 'Playing as guest');
ok('google stays off without a client id', !ACC.googleEnabled({}));
ok('a junk client id does not switch it on', !ACC.googleEnabled({ googleClientId: 'hello' }));
ok('a real client id switches it on',
   ACC.googleEnabled({ googleClientId: '123-abc.apps.googleusercontent.com' }));
const jwt = 'x.' + Buffer.from(JSON.stringify({ sub: '42', email: 'a@b.c', name: 'A B' })).toString('base64') + '.y';
const claims = ACC.parseIdToken(jwt);
ok('an id token is read for display fields', claims && claims.email === 'a@b.c');
ok('a malformed token does not throw', ACC.parseIdToken('rubbish') === null);
ok('PKCE verifiers are long and unique',
   ACC.randomVerifier().length === 64 && ACC.randomVerifier() !== ACC.randomVerifier());
ok('the auth url carries the challenge method',
   ACC.authUrl('cid', 'app://cb', 'chal', 'st').indexOf('code_challenge_method=S256') > 0);

/* ─────────────────────────────────────────────────────  charts ─── */
sec('charts');
const arch = [{ at: 300, delta: +10 }, { at: 200, delta: -8 }, { at: 100, delta: +12 }];
const series = CH.ratingSeries(arch, 1500);
ok('the series has a point per game plus the present', series.length === 4);
ok('it is in chronological order', series[0].at <= series[series.length - 1].at);
ok('it ends at the current rating', series[series.length - 1].r === 1500);
ok('it walks the deltas backwards correctly', series[0].r === 1500 - 10 + 8 - 12);
ok('an empty archive gives no usable curve', CH.ratingChart(CH.ratingSeries([], 1200)) === '');
const svg = CH.ratingChart(series);
ok('a chart renders as svg', svg.indexOf('<svg') === 0 && svg.indexOf('polyline') > 0);
ok('a flat run still produces a chart',
   CH.ratingChart([{ at: 1, r: 1200 }, { at: 2, r: 1200 }]).indexOf('<svg') === 0);

const games = [
  { sans: ['e4', 'c5'], score: 1, myColor: 0 }, { sans: ['e4', 'c5'], score: 0, myColor: 0 },
  { sans: ['d4', 'd5'], score: 1, myColor: 0 }
];
const ops = CH.openingStats(games, (s) => s.join(' '), 1);
ok('openings are grouped', ops.length === 2);
ok('the most played comes first', ops[0].n === 2);
ok('the score percentage is right', ops[0].pct === 50);
ok('a win/draw/loss bar renders', CH.wdlBar(ops[0]).indexOf('wdl-w') > 0);
ok('html is escaped in chart output', CH.esc('<b>&"').indexOf('&lt;') === 0);

console.log(fails ? `\n${fails} CHECK(S) FAILED\n` : '\nALL CHECKS PASSED\n');
process.exitCode = fails ? 1 : 0;
