/*!
 * progress.js — long-term player progression for Serena Chess.
 *
 * Everything in here is pure data plus pure functions over that data, with no
 * DOM and no storage access, so the whole progression system can be unit
 * tested in node without a browser. app.js owns persistence and passes the
 * saved blob in.
 *
 * Four systems live here:
 *   • puzzle rating  — an Elo pass over the puzzle set, per theme as well as
 *                      overall, so "you are 1450 at pins but 1100 at mates"
 *                      is answerable.
 *   • daily puzzle   — deterministic from the date, identical for everyone,
 *                      with a streak that survives a missed day only once.
 *   • ladder         — the 60 characters as a climb instead of a flat list.
 *   • achievements   — derived purely from data already stored.
 *
 * Part of Serena Chess by @TechnicalSerena with @XioquiXin — Apache-2.0.
 */
(function (root) {
  'use strict';

  /* ───────────────────────────────────────────────── puzzle rating ─── */

  var PUZ_START = 1000;
  var PUZ_FLOOR = 400;

  function puzzleK(played) { return played < 10 ? 60 : played < 30 ? 40 : 24; }

  function expectedScore(mine, theirs) {
    return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  }

  function blankPuzzleState() {
    return { rating: PUZ_START, played: 0, solved: 0, streak: 0, bestStreak: 0,
             themes: {}, seen: {}, history: [] };
  }

  /* Apply one attempt. `solved` is a boolean; `rating` is the puzzle's own
     rating. Returns a NEW state rather than editing the one passed in -- an
     in-place version silently corrupted a caller that compared before and
     after, and quietly mutating a caller's saved state is a trap. */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function scorePuzzle(prev, puzzle, solved) {
    var st = prev ? clone(prev) : blankPuzzleState();
    if (!st.themes) st.themes = {};
    if (!st.seen) st.seen = {};
    if (!st.history) st.history = [];
    var k = puzzleK(st.played);
    var exp = expectedScore(st.rating, puzzle.rating || PUZ_START);
    var before = st.rating;
    st.rating = Math.max(PUZ_FLOOR, Math.round(st.rating + k * ((solved ? 1 : 0) - exp)));
    st.played += 1;
    if (solved) {
      st.solved += 1;
      st.streak += 1;
      if (st.streak > st.bestStreak) st.bestStreak = st.streak;
    } else {
      st.streak = 0;
    }

    /* per-theme rating, same maths on a smaller sample */
    var key = puzzle.kind || puzzle.theme || 'other';
    var t = st.themes[key] || { rating: PUZ_START, played: 0, solved: 0 };
    var tk = puzzleK(t.played);
    t.rating = Math.max(PUZ_FLOOR,
      Math.round(t.rating + tk * ((solved ? 1 : 0) - expectedScore(t.rating, puzzle.rating || PUZ_START))));
    t.played += 1;
    if (solved) t.solved += 1;
    st.themes[key] = t;

    if (puzzle.id != null) st.seen[puzzle.id] = solved ? 1 : 0;
    st.history.push({ d: today(), r: st.rating, s: solved ? 1 : 0 });
    if (st.history.length > 200) st.history.splice(0, st.history.length - 200);
    st.delta = st.rating - before;
    return st;
  }

  /* Pick the next puzzle near the player's strength. Prefers unseen puzzles
     and ones the player previously failed, and only widens the band if that
     leaves nothing — otherwise a strong player runs out of material. */
  function nextPuzzle(list, st, theme) {
    st = st || blankPuzzleState();
    var pool = list.filter(function (p) { return !theme || p.kind === theme || p.theme === theme; });
    if (!pool.length) pool = list.slice();
    var target = st.rating;

    function pick(band, wantUnseen) {
      var c = pool.filter(function (p) {
        var seen = st.seen && st.seen[p.id] != null;
        if (wantUnseen && seen && st.seen[p.id] === 1) return false;
        return Math.abs((p.rating || PUZ_START) - target) <= band;
      });
      return c;
    }
    var cand = pick(150, true);
    if (!cand.length) cand = pick(350, true);
    if (!cand.length) cand = pick(600, true);
    if (!cand.length) cand = pool.slice();
    /* deterministic-ish spread rather than pure random repeats */
    return cand[Math.floor(Math.random() * cand.length)];
  }

  function themeBreakdown(st) {
    var out = [];
    var t = (st && st.themes) || {};
    for (var k in t) if (Object.prototype.hasOwnProperty.call(t, k)) {
      out.push({ kind: k, rating: t[k].rating, played: t[k].played, solved: t[k].solved,
                 pct: t[k].played ? Math.round(t[k].solved / t[k].played * 100) : 0 });
    }
    return out.sort(function (a, b) { return b.rating - a.rating; });
  }

  /* ─────────────────────────────────────────────────── daily puzzle ─── */

  function today(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* FNV-1a over the date string: same puzzle for everyone, every day, with no
     server and no coordination. */
  function dateHash(key) {
    var h = 0x811c9dc5;
    for (var i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h >>> 0;
  }

  function dailyPuzzle(list, dateStr) {
    if (!list || !list.length) return null;
    return list[dateHash('serena-daily-' + (dateStr || today())) % list.length];
  }

  function daysBetween(a, b) {
    var pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    var da = Date.UTC(pa[0], pa[1] - 1, pa[2]), db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round((db - da) / 86400000);
  }

  /* Streak rules: consecutive days extend it, the same day is a no-op, any
     gap resets to 1. Deliberately not forgiving — a streak you cannot break
     is not a streak. */
  function recordDaily(prev, solved, dateStr) {
    var st = prev ? clone(prev) : { last: null, streak: 0, best: 0, solvedDays: [] };
    var d = dateStr || today();
    if (st.last === d) return st;
    var gap = st.last ? daysBetween(st.last, d) : null;
    if (!solved) { st.last = d; st.streak = 0; return st; }
    st.streak = (gap === 1) ? st.streak + 1 : 1;
    if (st.streak > st.best) st.best = st.streak;
    st.last = d;
    st.solvedDays = st.solvedDays || [];
    st.solvedDays.push(d);
    if (st.solvedDays.length > 400) st.solvedDays.shift();
    return st;
  }

  /* ─────────────────────────────────────────────────────── ladder ─── */

  /* The climb opens with the three easiest characters unlocked so there is
     always something to play, then each win opens the next rung. Losing never
     closes a rung — progress is a ratchet, because punishing a loss by taking
     away content is just an exit. */
  var LADDER_SEED = 3;

  function blankLadder() { return { beaten: {}, unlocked: LADDER_SEED, best: 0 }; }

  function ladderOrder(bots) {
    return bots.slice().sort(function (a, b) { return a.elo - b.elo; });
  }

  function ladderState(bots, st) {
    st = st || blankLadder();
    var order = ladderOrder(bots);
    var unlocked = Math.max(LADDER_SEED, st.unlocked || LADDER_SEED);
    return order.map(function (b, i) {
      return {
        bot: b, rung: i + 1,
        beaten: !!(st.beaten && st.beaten[b.id]),
        open: i < unlocked
      };
    });
  }

  function recordLadder(bots, prev, botId, won) {
    var st = prev ? clone(prev) : blankLadder();
    if (!st.beaten) st.beaten = {};
    var order = ladderOrder(bots);
    var idx = order.findIndex(function (b) { return b.id === botId; });
    if (idx < 0) return st;
    if (won && !st.beaten[botId]) {
      st.beaten[botId] = 1;
      /* opening the next rung only when the furthest one falls keeps the
         climb linear even if the player beats someone out of order */
      st.unlocked = Math.max(st.unlocked || LADDER_SEED, idx + 2);
      if (idx + 1 > (st.best || 0)) st.best = idx + 1;
    }
    return st;
  }

  function ladderSummary(bots, st) {
    var rows = ladderState(bots, st);
    var beaten = rows.filter(function (r) { return r.beaten; }).length;
    var next = rows.find(function (r) { return r.open && !r.beaten; }) || null;
    return { total: rows.length, beaten: beaten, next: next,
             pct: Math.round(beaten / rows.length * 100) };
  }

  /* ───────────────────────────────────────────────── achievements ─── */

  /* Every one of these is computed from data the app already stores, so no
     extra bookkeeping can drift out of sync with reality. */
  var ACHIEVEMENTS = [
    { id: 'first-win',   name: 'First blood',      desc: 'Win your first game.',
      test: function (c) { return c.stats.w >= 1; } },
    { id: 'win-10',      name: 'Getting serious',  desc: 'Win 10 games.',
      test: function (c) { return c.stats.w >= 10; } },
    { id: 'win-50',      name: 'Veteran',          desc: 'Win 50 games.',
      test: function (c) { return c.stats.w >= 50; } },
    { id: 'played-100',  name: 'Centurion',        desc: 'Play 100 games.',
      test: function (c) { return c.stats.w + c.stats.l + c.stats.d >= 100; } },
    { id: 'streak-5',    name: 'On a run',         desc: 'Win 5 games in a row.',
      test: function (c) { return streak(c.archive) >= 5; } },
    { id: 'beat-1500',   name: 'Club strength',    desc: 'Beat an opponent rated 1500+.',
      test: function (c) { return bestBeaten(c.archive) >= 1500; } },
    { id: 'beat-2000',   name: 'Expert scalp',     desc: 'Beat an opponent rated 2000+.',
      test: function (c) { return bestBeaten(c.archive) >= 2000; } },
    { id: 'beat-2500',   name: 'Giant killer',     desc: 'Beat an opponent rated 2500+.',
      test: function (c) { return bestBeaten(c.archive) >= 2500; } },
    { id: 'rating-1400', name: 'Climbing',         desc: 'Reach a rating of 1400.',
      test: function (c) { return (c.profile.rating || 0) >= 1400; } },
    { id: 'rating-1800', name: 'Strong player',    desc: 'Reach a rating of 1800.',
      test: function (c) { return (c.profile.rating || 0) >= 1800; } },
    { id: 'puzzle-50',   name: 'Tactician',        desc: 'Solve 50 puzzles.',
      test: function (c) { return c.puzzles.solved >= 50; } },
    { id: 'puzzle-200',  name: 'Calculating machine', desc: 'Solve 200 puzzles.',
      test: function (c) { return c.puzzles.solved >= 200; } },
    { id: 'puzzle-1500', name: 'Sharp eye',        desc: 'Reach a puzzle rating of 1500.',
      test: function (c) { return c.puzzles.rating >= 1500; } },
    { id: 'daily-7',     name: 'Seven days',       desc: 'Solve the daily puzzle 7 days running.',
      test: function (c) { return (c.daily.best || 0) >= 7; } },
    { id: 'daily-30',    name: 'Habit',            desc: 'A 30-day daily puzzle streak.',
      test: function (c) { return (c.daily.best || 0) >= 30; } },
    { id: 'ladder-10',   name: 'Ten rungs',        desc: 'Beat 10 characters on the ladder.',
      test: function (c) { return c.ladder.beaten >= 10; } },
    { id: 'ladder-30',   name: 'Halfway up',       desc: 'Beat 30 characters on the ladder.',
      test: function (c) { return c.ladder.beaten >= 30; } },
    { id: 'ladder-all',  name: 'Top of the ladder', desc: 'Beat every character.',
      test: function (c) { return c.ladder.beaten >= c.ladder.total; } },
    { id: 'drills',      name: 'Technique',        desc: 'Complete every endgame drill.',
      test: function (c) { return (c.drillsDone || 0) >= (c.drillsTotal || 12); } },
    { id: 'review-10',   name: 'Student',          desc: 'Review 10 of your games.',
      test: function (c) { return (c.reviewed || 0) >= 10; } }
  ];

  function streak(archive) {
    var n = 0;
    for (var i = 0; i < (archive || []).length; i++) {
      if (archive[i].result === 'win' || archive[i].score === 1) n++;
      else break;
    }
    return n;
  }

  function bestBeaten(archive) {
    var best = 0;
    (archive || []).forEach(function (a) {
      var won = a.result === 'win' || a.score === 1;
      var r = a.oppElo || a.oppRating || 0;
      if (won && r > best) best = r;
    });
    return best;
  }

  function evaluateAchievements(ctx, earnedBefore) {
    var ctx2 = {
      stats: ctx.stats || { w: 0, l: 0, d: 0 },
      archive: ctx.archive || [],
      profile: ctx.profile || {},
      puzzles: ctx.puzzles || blankPuzzleState(),
      daily: ctx.daily || {},
      ladder: ctx.ladder || { beaten: 0, total: 60 },
      drillsDone: ctx.drillsDone, drillsTotal: ctx.drillsTotal, reviewed: ctx.reviewed
    };
    var earned = Object.assign({}, earnedBefore || {});
    var fresh = [];
    ACHIEVEMENTS.forEach(function (a) {
      var ok = false;
      try { ok = !!a.test(ctx2); } catch (e) { ok = false; }
      if (ok && !earned[a.id]) { earned[a.id] = today(); fresh.push(a); }
    });
    return { earned: earned, fresh: fresh,
             count: Object.keys(earned).length, total: ACHIEVEMENTS.length };
  }

  root.ChessProgress = {
    blankPuzzleState: blankPuzzleState, scorePuzzle: scorePuzzle,
    nextPuzzle: nextPuzzle, themeBreakdown: themeBreakdown,
    dailyPuzzle: dailyPuzzle, recordDaily: recordDaily, today: today,
    daysBetween: daysBetween,
    blankLadder: blankLadder, ladderState: ladderState, ladderOrder: ladderOrder,
    recordLadder: recordLadder, ladderSummary: ladderSummary,
    ACHIEVEMENTS: ACHIEVEMENTS, evaluateAchievements: evaluateAchievements,
    streak: streak, bestBeaten: bestBeaten,
    PUZ_START: PUZ_START, LADDER_SEED: LADDER_SEED
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChessProgress;
})(typeof window !== 'undefined' ? window : globalThis);
