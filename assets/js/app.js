/* =========================================================================
   app.js — screens, state, clocks, themes and game flow
   ========================================================================= */
/* -------------------------------------------------------------------------
   This module owns application state and screen routing. Nothing
   else writes to localStorage directly; everything goes through Store
   calls below, so a schema change only has to happen in one place.
   Handlers are delegated from document rather than bound per element,
   never per node, because screens are rebuilt whenever they open.
   If you add a screen, register it in SCREENS and give it a back route;
   clicking back on an unregistered screen silently does nothing at all.
   All long work (search, review) runs behind a setTimeout so that the
   layout gets a frame to paint the thinking indicator before it blocks.
   Sheets close on backdrop click, which is why every sheet handler
   exits early unless the event target is the sheet element itself.
   Rendering the board is ui.js's job; this file never touches squares
   except through the Board instance held in `board` further down.
   Never assume G.game is non-null during boot: resumeGame may replace it.
   Always drive new behaviour through tests/app_test.js.
   ------------------------------------------------------------------------- */
(function () {
  'use strict';

  var E = window.ChessEngine, AI = window.ChessAI, UI = window.ChessUI,
      BOTS = window.ChessBots, T = window.ChessThemes, CHAT = window.ChessChat;

  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ──────────────────────────────────────────────────────── storage ─── */
  var Store = {
    _mem: {},
    get: function (k, dflt) {
      var raw = null;
      try {
        if (window.AndroidStore && window.AndroidStore.load) raw = window.AndroidStore.load(k);
        else raw = window.localStorage.getItem(k);
      } catch (e) { raw = this._mem[k] || null; }
      if (raw === null || raw === undefined || raw === '') return dflt;
      try { return JSON.parse(raw); } catch (e) { return dflt; }
    },
    set: function (k, v) {
      var raw = JSON.stringify(v);
      this._mem[k] = raw;
      try {
        if (window.AndroidStore && window.AndroidStore.save) window.AndroidStore.save(k, raw);
        else window.localStorage.setItem(k, raw);
      } catch (e) { /* memory only */ }
    }
  };

  var AVATAR_COLORS = ['#81b64c', '#4a90d9', '#c9506a', '#c28b3a', '#8b5cf6',
                       '#3aa99f', '#e07a3f', '#6b7280'];

  var RV = window.ChessReview;
  var ON = window.Online;

  var profile = Store.get('chess.profile', { name: '', color: AVATAR_COLORS[0], rating: 1200 });
  if (typeof profile.rating !== 'number') profile.rating = 1200;
  var archive = Store.get('chess.archive', []);
  var stats   = Store.get('chess.stats', { w: 0, l: 0, d: 0, best: 0 });
  var settings = Object.assign({
    preset: 'classic', board: 'green', piece: 'classic', bg: 'classic', sound: 'default',
    anim: true, coords: true, hints: true, last: true, autoq: false, tc: '10+0',
    chat: true, groqKey: CHAT.DEFAULT_KEY, notify: false, notifyAt: '19:00',
    srvUrl: '', onlineHints: false, hintStyle: 'both', humanElo: 1200
  }, Store.get('chess.settings', {}));

  function saveProfile()  { Store.set('chess.profile', profile); }
  function saveStats()    { Store.set('chess.stats', stats); }
  function saveSettings() { Store.set('chess.settings', settings); }
  function saveArchive()  { Store.set('chess.archive', archive.slice(0, 40)); }

  /* ───────────────────────────────────────────────────────── screens ─── */
  var current = 'home';
  function go(name) {
    $$('.screen').forEach(function (s) { s.classList.remove('active'); });
    var el = $('#screen-' + name);
    if (el) el.classList.add('active');
    current = name;
    if (name === 'home') refreshHome();
    if (name === 'profile') refreshProfile();
    if (name === 'settings') refreshSettingsValues();
    if (name === 'puzzles') loadPuzzle(puz.idx);
    if (name === 'whatsnew') renderWhatsNew();
  }

  function copyText(t) {
    try {
      if (window.AndroidShare && window.AndroidShare.copy) { window.AndroidShare.copy(t); return; }
      if (navigator.clipboard) { navigator.clipboard.writeText(t); return; }
    } catch (e) { /* fall through */ }
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._t);
    t._t = setTimeout(function () { t.hidden = true; }, ms || 1800);
  }

  function openSheet(id) { $('#scrim').hidden = false; $(id).hidden = false; }
  function closeSheets() { $('#scrim').hidden = true; $$('.sheet').forEach(function (s) { s.hidden = true; }); }
  $('#scrim').addEventListener('click', function () { if (!G.awaitingPromo) closeSheets(); });

  function confirmDialog(title, text, onYes) {
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent = text;
    openSheet('#confirm-sheet');
    $('#confirm-sheet')._yes = onYes;
  }
  $('#confirm-sheet').addEventListener('click', function (e) {
    var b = e.target.closest('[data-confirm]');
    if (!b) return;
    var yes = b.dataset.confirm === 'yes';
    closeSheets();
    if (yes && this._yes) this._yes();
  });

  /* ───────────────────────────────────────────────────────── themes ─── */
  function applyAppearance() {
    var bg = T.background(settings.bg);
    document.body.style.background = bg.css;
    document.body.style.backgroundAttachment = 'fixed';
    document.body.classList.toggle('light-bg', !!bg.light);

    UI.Sound.setTheme(settings.sound);
    UI.Sound.enabled = settings.sound !== 'silent';

    if (board) {
      board.opts.set = settings.piece;
      board.opts.theme = settings.board;
      board.opts.coords = settings.coords;
      board.opts.hints = settings.hints;
      board.opts.lastMove = settings.last;
      board.opts.animate = settings.anim;
      board.applyTheme();
      if (board.game) { board.render(); renderCaptured(); }
    }
  }

  function applyPreset(p) {
    settings.preset = p.id;
    settings.board = p.board; settings.piece = p.piece;
    settings.bg = p.bg; settings.sound = p.sound;
    saveSettings(); applyAppearance();
    buildPresetGrid(); refreshSettingsValues();
  }

  /* ────────────────────────────────────────────────────── game state ─── */
  var G = {
    game: null, mode: 'bot', bot: null, myColor: E.WHITE,
    moves: [], over: false, thinking: false, awaitingPromo: null, tc: null,
    lastEval: 0,
    hist: null,        // ChessReview.History — a FEN per ply, for < > navigation
    viewPly: null,     // null = watching live; a number = browsing history
    opp: null,         // online opponent { name, rating }
    startedAt: 0
  };
  var board = null;

  /* ─────────────────────────────────────────────────────── bot chat ─── */
  var chatLog = [];
  var PIECE_WORD = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

  /** render "*action* spoken words" with the action in italics */
  function sayMarkup(text) {
    var esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return esc.replace(/\*([^*]{1,80})\*/g, '<em>$1</em>');
  }

  function renderSay(text) {
    var row = $('#bot-say');
    if (G.mode !== 'bot' || !G.bot) { row.hidden = true; return; }
    $('#bs-name').textContent = G.bot.name;
    $('#bs-text').innerHTML = sayMarkup(text);
    row.hidden = false;
  }

  function onChatMessage(text, fromBot) {
    chatLog.push({ who: fromBot ? 'bot' : 'me', text: text });
    if (fromBot) {
      renderSay(text);
      if ($('#chat-sheet').hidden) $('#chat-dot').hidden = false;
    }
    renderChatLog();
  }

  function onChatTyping(on) {
    $('#chat-status').textContent = on ? 'typing…' : 'in character';
    renderChatLog(on);
  }

  function renderChatLog(typing) {
    var log = $('#chat-log');
    if (!log || $('#chat-sheet').hidden) return;
    log.innerHTML = '';
    if (!chatLog.length) {
      var s = document.createElement('div');
      s.className = 'chat-msg sys';
      s.textContent = 'Say something to ' + (G.bot ? G.bot.name : 'your opponent');
      log.appendChild(s);
    }
    chatLog.forEach(function (m) {
      var d = document.createElement('div');
      d.className = 'chat-msg ' + m.who;
      if (m.who === 'bot') d.innerHTML = sayMarkup(m.text);
      else d.textContent = m.text;
      log.appendChild(d);
    });
    if (typing) {
      var t = document.createElement('div');
      t.className = 'chat-typing';
      t.innerHTML = '<i></i><i></i><i></i>';
      log.appendChild(t);
    }
    log.scrollTop = log.scrollHeight;
  }

  function openChat() {
    if (G.mode !== 'bot' || !G.bot) { toast('Chat is only available against bots'); return; }
    $('#chat-av').src = G.bot.avatar;
    $('#chat-name').textContent = G.bot.name;
    $('#chat-status').textContent = CHAT.hasKey() ? 'in character' : 'offline replies';
    $('#chat-dot').hidden = true;
    openSheet('#chat-sheet');
    renderChatLog();
  }

  function sendChat() {
    var input = $('#chat-input');
    var v = (input.value || '').trim();
    if (!v) return;
    input.value = '';
    if (G.mode === 'online') { ON.sendChat(v); onChatMessage(v, false); return; }
    CHAT.send(v);
  }

  /* ─────────────────────────────────────────────────────────  clock ─── */
  var Clock = {
    on: false, inc: 0, ms: [0, 0], side: E.WHITE, timer: null, last: 0, warned: false,

    setup: function (tc) {
      this.stop();
      this.on = tc.mins > 0;
      this.inc = tc.inc * 1000;
      this.ms = [tc.mins * 60000, tc.mins * 60000];
      this.side = E.WHITE;
      this.warned = false;
      $('#top-clock').hidden = !this.on;
      $('#bot-clock').hidden = !this.on;
      this.paint();
    },

    start: function (side) {
      if (!this.on) return;
      this.side = side;
      this.last = Date.now();
      if (this.timer) clearInterval(this.timer);
      var self = this;
      this.timer = setInterval(function () { self.tick(); }, 100);
    },

    stop: function () { if (this.timer) { clearInterval(this.timer); this.timer = null; } },

    /** called after a move is made by `mover`; adds increment, swaps side */
    moved: function (mover) {
      if (!this.on) return;
      this.drain();
      this.ms[mover] += this.inc;
      this.side = mover ^ 1;
      this.last = Date.now();
      this.paint();
    },

    drain: function () {
      var now = Date.now();
      this.ms[this.side] -= (now - this.last);
      this.last = now;
      if (this.ms[this.side] < 0) this.ms[this.side] = 0;
    },

    tick: function () {
      if (!this.on || G.over) return;
      this.drain();
      this.paint();
      var left = this.ms[this.side];
      if (left <= 10000 && !this.warned) { this.warned = true; UI.Sound.play('tenSecond'); }
      if (left <= 0) {
        this.stop();
        onFlag(this.side);
      }
    },

    fmt: function (ms) {
      if (ms <= 0) return '0:00';
      var s = Math.ceil(ms / 1000);
      if (ms < 10000) return (ms / 1000).toFixed(1);
      var m = Math.floor(s / 60);
      var r = s % 60;
      return m + ':' + (r < 10 ? '0' : '') + r;
    },

    paint: function () {
      if (!this.on) return;
      var bottomColor = board.flipped ? E.BLACK : E.WHITE;
      var pairs = [['#bot-clock', bottomColor], ['#top-clock', bottomColor ^ 1]];
      for (var i = 0; i < pairs.length; i++) {
        var el = $(pairs[i][0]), c = pairs[i][1];
        el.textContent = this.fmt(this.ms[c]);
        el.classList.toggle('active', !G.over && this.side === c);
        el.classList.toggle('low', this.ms[c] <= 10000);
      }
    }
  };

  function onFlag(loser) {
    // a side that cannot possibly mate only draws on time
    var winner = loser ^ 1;
    if (G.mode === 'online' && loser === G.myColor) ON.flag(loser === E.WHITE ? 'w' : 'b');
    finishGame({
      over: true,
      result: winner === E.WHITE ? 'white' : 'black',
      reason: 'timeout'
    });
  }

  /* ───────────────────────────────────────────────────────── board ─── */
  function initBoard() {
    board = new UI.Board($('#board'), {
      set: settings.piece, theme: settings.board, coords: settings.coords,
      hints: settings.hints, lastMove: settings.last, animate: settings.anim
    });
    board.canMoveFrom = function (sq) {
      if (G.over || G.thinking || browsing()) return false;
      if (G.mode === 'online' && G.game.turn !== G.myColor) return false;
      var p = G.game.board[sq];
      if (!p || E.colorOf(p) !== G.game.turn) return false;
      if (G.mode === 'bot' && G.game.turn !== G.myColor) return false;
      return true;
    };
    board.onMove = handleUserMove;
  }

  /* ─────────────────────────────────────────────── move navigation ─── */
  /** true when the user has stepped back from the live position */
  function browsing() { return G.viewPly !== null && G.viewPly !== G.moves.length; }

  function livePly() { return G.moves.length; }

  /** paint the board at a given ply and update everything that depends on it */
  function navTo(ply, silent) {
    if (!G.hist) return;
    var max = G.hist.length();
    ply = Math.max(0, Math.min(ply, max));
    var wasBrowsing = browsing();
    G.viewPly = (ply === max) ? null : ply;

    var g = G.hist.gameAt(ply);
    var mv = G.hist.moveAt(ply);
    var lastMove = mv ? { from: mv.from, to: mv.to } : null;

    board.setPosition(g, lastMove);
    board.clearArrow(); board.clearMarks();
    if (!silent && (wasBrowsing || browsing())) UI.Sound.play(mv && mv.san.indexOf('x') >= 0 ? 'capture' : 'moveOpp');

    renderMoveBar();
    updateNav();
    updateBar();
    if (G.review) paintEvalAt(ply);
  }

  function updateNav() {
    var max = G.hist ? G.hist.length() : 0;
    var at = G.viewPly === null ? max : G.viewPly;
    var set = function (n, dis) {
      var b = document.querySelector('[data-nav="' + n + '"].nav-btn');
      if (b) b.disabled = dis;
    };
    set('first', at === 0); set('prev', at === 0);
    set('next', at >= max); set('last', at >= max);

    var pill = $('#browse-pill');
    if (browsing()) {
      pill.hidden = false;
      $('#browse-text').textContent = at === 0
        ? 'Start position'
        : 'Move ' + Math.ceil(at / 2) + (at % 2 ? ' (White)' : ' (Black)');
    } else {
      pill.hidden = true;
    }
  }

  /* ──────────────────────────────────────────────────── start games ─── */
  function startGame(mode, bot, myColor, tcId, fen) {
    G.game = fen ? new E.Chess(fen) : new E.Chess();
    G.mode = mode; G.bot = bot || null;
    G.myColor = (myColor === undefined) ? E.WHITE : myColor;
    G.moves = []; G.over = false; G.thinking = false; G.awaitingPromo = null;
    G.tc = T.timeControl(tcId || settings.tc);
    G.hist = new RV.History(fen || null);
    G.viewPly = null; G.review = null; G.startedAt = Date.now();
    moveQueue.length = 0; applying = false;
    lastResult = null; $('#result-strip').hidden = true;
    hintStage = 0; hintPly = -1; hintMove = null; hintMovePly = -1;
    $('#evalbar').hidden = true;

    applyAppearance();
    board.flipped = (G.mode !== 'local' && G.myColor === E.BLACK);
    $('#game-title').textContent =
        (mode === 'bot')    ? 'vs ' + bot.name
      : (mode === 'online') ? (G.opp ? 'vs ' + G.opp.name : 'Online')
      :                       'Pass & Play';

    board.setPosition(G.game, null);
    $('#board-overlay').hidden = true;
    Clock.setup(G.tc);
    renderPlayers(); renderMoveBar(); updateBar(); updateNav();
    go('game');
    UI.Sound.unlock();
    UI.Sound.play('gameStart');
    Clock.start(E.WHITE);
    saveGame();

    chatLog = [];
    G.lastEval = 0;
    $('#chat-dot').hidden = true;
    if (G.mode === 'bot' && !G.bot.human) {
      CHAT.reset(G.bot);
      renderSay('*sits down at the board*');
      if (settings.chat) setTimeout(function () { CHAT.say('start', {}, true); }, 800);
    } else {
      $('#bot-say').hidden = true;
    }

    if (G.mode === 'bot' && G.game.turn !== G.myColor) scheduleBot();
  }

  function playerNames() {
    var me = profile.name || 'You';
    if (G.mode === 'local') return { w: 'White', b: 'Black' };
    var opp = G.mode === 'online' ? ((G.opp && G.opp.name) || 'Opponent') : G.bot.name;
    return G.myColor === E.WHITE ? { w: me, b: opp } : { w: opp, b: me };
  }

  function renderPlayers() {
    var names = playerNames();
    var bottomColor = board.flipped ? E.BLACK : E.WHITE;

    function fill(prefix, color) {
      var isBot = (G.mode === 'bot' && color !== G.myColor);
      var nameEl = $(prefix + '-name'), avEl = $(prefix + '-avatar');
      nameEl.innerHTML = '';
      nameEl.appendChild(document.createTextNode(color === E.WHITE ? names.w : names.b));
      if (isBot) {
        var tag = document.createElement('span');
        tag.className = 'elo-tag'; tag.textContent = '(' + G.bot.elo + ')';
        nameEl.appendChild(tag);
      } else if (G.mode === 'online') {
        var t2 = document.createElement('span');
        t2.className = 'elo-tag';
        t2.textContent = '(' + (color === G.myColor ? profile.rating : oppRating()) + ')';
        nameEl.appendChild(t2);
      }
      avEl.innerHTML = '';
      if (isBot) {
        var img = document.createElement('img'); img.src = G.bot.avatar; img.alt = '';
        avEl.appendChild(img); avEl.style.background = 'transparent';
      } else if (G.mode === 'local') {
        avEl.textContent = color === E.WHITE ? '♔' : '♚';
        avEl.style.background = color === E.WHITE ? '#6c7a89' : '#2f2b28';
      } else {
        applyAvatar(avEl);
      }
    }
    fill('#bot', bottomColor);
    fill('#top', bottomColor ^ 1);
    renderCaptured();
    Clock.paint();
  }

  var PIECE_ORDER = [E.QUEEN, E.ROOK, E.BISHOP, E.KNIGHT, E.PAWN];
  var START_COUNT = {}; START_COUNT[E.PAWN] = 8; START_COUNT[E.KNIGHT] = 2;
  START_COUNT[E.BISHOP] = 2; START_COUNT[E.ROOK] = 2; START_COUNT[E.QUEEN] = 1;
  var VAL = { 1: 1, 2: 3, 3: 3, 4: 5, 5: 9 };

  function renderCaptured() {
    if (!G.game) return;
    var g = G.game, have = [{}, {}];
    for (var sq = 0; sq < 128; sq++) {
      if (E.offBoard(sq)) { sq += 7; continue; }
      var p = g.board[sq];
      if (!p) continue;
      var t = E.typeOf(p);
      if (t === E.KING) continue;
      have[E.colorOf(p)][t] = (have[E.colorOf(p)][t] || 0) + 1;
    }
    var bottomColor = board.flipped ? E.BLACK : E.WHITE;

    function build(el, ownerColor) {
      var lostBy = ownerColor ^ 1;
      el.innerHTML = '';
      var sum = 0;
      PIECE_ORDER.forEach(function (t) {
        var missing = START_COUNT[t] - (have[lostBy][t] || 0);
        for (var i = 0; i < missing; i++) {
          var img = document.createElement('img');
          img.src = UI.pieceSrc(settings.piece, lostBy, t);
          el.appendChild(img);
          sum += VAL[t];
        }
      });
      return sum;
    }
    var bs = build($('#bot-captured'), bottomColor);
    var ts = build($('#top-captured'), bottomColor ^ 1);
    var diff = bs - ts;
    if (diff !== 0) {
      var s = document.createElement('span');
      s.className = 'plus';
      s.textContent = '+' + Math.abs(diff);
      $(diff > 0 ? '#bot-captured' : '#top-captured').appendChild(s);
    }
  }

  /* ───────────────────────────────────────────────────────── moving ─── */
  function handleUserMove(from, to) {
    if (G.over || G.thinking) return;
    var g = G.game;
    var cands = g.movesFrom(from).filter(function (m) { return m.to === to; });
    if (!cands.length) { UI.Sound.play('illegal'); return; }

    if (cands[0].flags & E.FLAG_PROMO) {
      if (settings.autoq) applyMove(g.findMove(from, to, E.QUEEN), true);
      else askPromotion(g.turn, function (t) { applyMove(g.findMove(from, to, t), true); });
      return;
    }
    applyMove(cands[0], true);
  }

  function askPromotion(color, cb) {
    var row = $('#promo-row');
    row.innerHTML = '';
    [E.QUEEN, E.ROOK, E.BISHOP, E.KNIGHT].forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'promo-btn';
      var img = document.createElement('img');
      img.src = UI.pieceSrc(settings.piece, color, t);
      b.appendChild(img);
      b.addEventListener('click', function () { G.awaitingPromo = null; closeSheets(); cb(t); });
      row.appendChild(b);
    });
    G.awaitingPromo = true;
    openSheet('#promo-sheet');
  }

  function soundFor(move, byMe, st) {
    if (st.over && st.reason === 'checkmate') return 'checkmate';
    if (st.over) return 'gameEnd';
    if (st.check) return 'check';
    if (move.flags & E.FLAG_PROMO) return 'promote';
    if (move.flags & (E.FLAG_KCASTLE | E.FLAG_QCASTLE)) return 'castle';
    if (move.flags & E.FLAG_CAPTURE) return 'capture';
    return byMe ? 'move' : 'moveOpp';
  }

  /* Moves are applied one at a time. The board animation is asynchronous, so
     without this a move arriving mid-animation (an online opponent, or a fast
     tap) could reach makeMove() before the previous one and corrupt the game.
     Queue entries are either { move } or { san, from, to, promo }; a SAN entry
     is resolved against the position at the moment it is applied, never at the
     moment it arrived. */
  var HU = window.ChessHuman;
  var CL = window.ChessChangelog || { VERSION: '1.7', LOG: [] };
  var moveQueue = [], applying = false;
  var hintStage = 0, hintPly = -1, hintMove = null, hintMovePly = -1;

  function applyMove(move, byMe) {
    if (!move) return;
    moveQueue.push({ move: move, byMe: byMe });
    pumpMoves();
  }

  /** queue a move described by the other player, resolved later */
  function applyRemote(desc) {
    moveQueue.push({ desc: desc, byMe: false });
    pumpMoves();
  }

  function resolveDesc(g, d) {
    var legal = g.moves(), i;
    var want = String(d.san || '').replace(/[+#!?]/g, '');
    if (want) {
      for (i = 0; i < legal.length; i++) {
        if (g.moveToSan(legal[i], legal).replace(/[+#!?]/g, '') === want) return legal[i];
      }
    }
    if (typeof d.from === 'number') {
      for (i = 0; i < legal.length; i++) {
        if (legal[i].from === d.from && legal[i].to === d.to &&
            (!d.promo || legal[i].promo === d.promo)) return legal[i];
      }
    }
    return null;
  }

  function pumpMoves() {
    if (applying || !moveQueue.length) return;
    var item = moveQueue.shift();
    var mv = item.move;
    if (!mv && item.desc) {
      mv = resolveDesc(G.game, item.desc);
      if (!mv) { toast('Out of sync with your opponent'); pumpMoves(); return; }
    }
    if (!mv) { pumpMoves(); return; }
    applying = true;
    doApplyMove(mv, item.byMe, function () { applying = false; pumpMoves(); });
  }

  function doApplyMove(move, byMe, done) {
    var g = G.game;
    var san = g.moveToSan(move);
    var mover = g.turn;

    if (browsing()) navTo(livePly(), true);     // always play from the live position

    board.animateMove(move, function () {
      g.makeMove(move);
      G.moves.push({ san: san, from: move.from, to: move.to });
      G.hist.push({ san: san, from: move.from, to: move.to, promo: move.promo || 0 }, g.fen());
      G.viewPly = null;
      board.clearMarks();
      hintStage = 0; hintMove = null; hintMovePly = -1;
      board.setPosition(g, move);
      renderCaptured(); renderMoveBar(); updateNav();

      var st = g.status();
      UI.Sound.play(soundFor(move, byMe, st));
      if (G.mode === 'online' && byMe) {
        ON.sendMove({ san: san, from: move.from, to: move.to, promo: move.promo || 0,
                      ms: Clock.on ? Clock.ms[mover] : null });
      }
      Clock.moved(mover);
      updateBar(); saveGame();

      if (G.mode === 'bot' && settings.chat && !st.over) chatReact(move, byMe, st);
      if (st.over) { finishGame(st); done(); return; }
      if (G.mode === 'bot' && g.turn !== G.myColor) scheduleBot();
      done();
    });
  }

  /** decide whether the bot should say something about what just happened */
  function chatReact(move, byMe, st) {
    var cap = move.captured ? E.typeOf(move.captured) : 0;
    var ev = AI.quickEval(G.game);                     // + = good for White
    var mine = (G.myColor === E.WHITE) ? ev : -ev;     // + = good for the human
    var delta = mine - G.lastEval;
    G.lastEval = mine;

    if (byMe) {
      if (delta <= -1.6) return CHAT.say('blunder', {});
      if (cap >= E.ROOK)  return CHAT.say('lost', { piece: PIECE_WORD[cap] });
      if (delta >= 1.4)   return CHAT.say('goodMove', {});
    } else {
      if (st.check)        return CHAT.say('check', {});
      if (cap >= E.KNIGHT) return CHAT.say('capture', { piece: PIECE_WORD[cap] });
      if (mine <= -3 && Math.random() < 0.28) return CHAT.say('winning', {});
      if (mine >=  3 && Math.random() < 0.28) return CHAT.say('losing', {});
    }
  }

  function scheduleBot() {
    G.thinking = true;
    $('#top-thinking').hidden = false;
    updateBar();
    var started = Date.now();

    setTimeout(function () {
      var g = G.game, mv = null;
      var hist = G.moves.map(function (m) { return m.san; });
      var last = G.moves.length ? G.moves[G.moves.length - 1] : null;
      if (G.bot && G.bot.human) G.bot.lastTo = last ? last.to : -1;
      try { mv = AI.pickMove(g, G.bot, hist); }
      catch (err) { mv = g.moves()[0] || null; }

      /* A person does not answer in a constant 300 ms. Forced recaptures come
         back instantly, hard positions get a long stare. */
      var want = 300;
      if (G.bot && G.bot.human) {
        var forced = g.moves().length <= 2 ||
                     (last && mv && mv.to === last.to && (mv.flags & E.FLAG_CAPTURE));
        want = HU.thinkMs(g, G.bot, forced);
      }
      var pause = Math.max(0, want - (Date.now() - started));
      setTimeout(function () {
        $('#top-thinking').hidden = true;
        G.thinking = false;
        if (G.over) return;
        if (!mv) { finishGame(g.status()); return; }
        applyMove(mv, false);
      }, pause);
    }, 40);
  }

  /* ───────────────────────────────────────────────────── end of game ─── */
  /** Elo expectation against a given opponent rating */
  function expected(mine, theirs) {
    return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  }

  function oppRating() {
    if (G.mode === 'bot') return G.bot ? G.bot.elo : 1200;
    if (G.mode === 'online') return (G.opp && G.opp.rating) || 1200;
    return profile.rating;
  }

  /** move the player's rating and return the (rounded) change */
  function applyRating(theirs, score) {
    var before = profile.rating;
    // bigger K while the rating is still settling, like a provisional period
    var played = (stats.w || 0) + (stats.l || 0) + (stats.d || 0);
    var K = played < 15 ? 40 : (before > 2200 ? 16 : 24);
    var after = Math.round(before + K * (score - expected(before, theirs)));
    profile.rating = Math.max(100, after);
    saveProfile();
    return profile.rating - before;
  }

  function archiveGame(st, score, delta) {
    if (!G.hist || G.hist.length() < 2) return;
    var names = playerNames();
    archive.unshift({
      at: Date.now(),
      mode: G.mode,
      opp: G.mode === 'bot' ? G.bot.name : (G.opp ? G.opp.name : 'Opponent'),
      oppElo: oppRating(),
      myColor: G.myColor,
      score: score,
      delta: delta,
      reason: st.reason,
      plies: G.hist.length(),
      startFen: G.hist.startFen || null,
      sans: G.hist.moves.map(function (m) { return m.san; }),
      white: names.w, black: names.b,
      tc: G.tc ? G.tc.id : 'unlimited'
    });
    if (archive.length > 40) archive.length = 40;
    saveArchive();
  }

  /* The game-over card covers the board, which makes it impossible to study the
     final position. It is dismissible, and a slim strip keeps the result and
     the review button within reach. */
  var lastResult = null;

  function showResult(show) {
    $('#board-overlay').hidden = !show;
    var strip = $('#result-strip');
    if (!lastResult) { strip.hidden = true; return; }
    strip.hidden = show;                 // the strip stands in for the popup
    if (!show) {
      $('#rs-icon').textContent = lastResult.icon;
      $('#rs-text').textContent = lastResult.title + ' \u00b7 ' + lastResult.sub;
      $$('#result-strip [data-action="review"]').forEach(function (b) {
        b.hidden = !G.hist || G.hist.length() < 2;
      });
    }
  }

  function finishGame(st, forced) {
    if (G.over) return;
    G.over = true;
    Clock.stop();
    Clock.paint();
    updateBar();

    var title, sub, icon;
    if (st.result === 'draw') {
      title = 'Draw'; icon = '½';
      sub = st.reason.charAt(0).toUpperCase() + st.reason.slice(1);
    } else {
      var winner = st.result === 'white' ? E.WHITE : E.BLACK;
      var names = playerNames();
      icon = winner === E.WHITE ? '♔' : '♚';
      var wn = (winner === E.WHITE ? names.w : names.b);
      title = wn + (wn === 'You' ? ' win' : ' wins');
      sub = st.reason === 'timeout' ? 'On time'
          : st.reason === 'resignation' ? 'By resignation'
          : st.reason.charAt(0).toUpperCase() + st.reason.slice(1);
    }

    /* score from my point of view: 1 win, 0.5 draw, 0 loss */
    var score = st.result === 'draw' ? 0.5
      : (((st.result === 'white') ? E.WHITE : E.BLACK) === G.myColor ? 1 : 0);
    var rated = (G.mode === 'bot' || G.mode === 'online');
    var delta = 0;

    if (rated) {
      if (score === 1) { stats.w++; if (G.mode === 'bot' && G.bot.elo > (stats.best || 0)) stats.best = G.bot.elo; }
      else if (score === 0.5) stats.d++;
      else stats.l++;
      saveStats();
      delta = applyRating(oppRating(), score);
      archiveGame(st, score, delta);
    }

    $('#ov-icon').textContent = icon;
    $('#ov-title').textContent = title;
    if (rated && delta !== 0) {
      sub += '  \u00b7  ' + (delta > 0 ? '+' : '') + delta + ' rating';
    }
    $('#ov-sub').textContent = sub;
    lastResult = { icon: icon, title: title, sub: sub };
    showResult(true);
    $$('[data-action="review"]').forEach(function (b) { b.hidden = G.moves.length < 2; });
    $$('[data-action="rematch"]').forEach(function (b) { b.hidden = (G.mode === 'online'); });
    if (st.reason !== 'checkmate') UI.Sound.play('gameEnd');
    Store.set('chess.game', null);

    if (G.mode === 'bot' && settings.chat) {
      var moment = st.result === 'draw' ? 'draw'
        : (((st.result === 'white') ? E.WHITE : E.BLACK) === G.myColor ? 'lose' : 'win');
      setTimeout(function () { CHAT.say(moment, {}, true); }, 600);
    }
  }

  /* ───────────────────────────────────────────────────────── widgets ─── */
  function renderMoveBar() {
    var bar = $('#movebar');
    bar.innerHTML = '';
    if (!G.moves.length) {
      var e = document.createElement('span');
      e.className = 'mv-empty';
      e.textContent = 'No moves yet';
      bar.appendChild(e);
      return;
    }
    var at = (G.viewPly === null) ? G.moves.length : G.viewPly;
    var curEl = null;
    for (var i = 0; i < G.moves.length; i++) {
      if (i % 2 === 0) {
        var n = document.createElement('span');
        n.className = 'mv-num'; n.textContent = (i / 2 + 1) + '.';
        bar.appendChild(n);
      }
      var m = document.createElement('span');
      var isCur = (i === at - 1);
      m.className = 'mv' + (isCur ? ' cur' : '');
      m.textContent = G.moves[i].san;
      m.dataset.ply = String(i + 1);
      if (G.review) {
        var r = G.review.moves[i];
        if (r && r.label !== 'best' && r.label !== 'excellent' && r.label !== 'book') {
          m.classList.add('lab-' + r.label);
        }
      }
      if (isCur) curEl = m;
      bar.appendChild(m);
    }
    // keep the move being viewed on screen
    if (curEl) {
      var want = curEl.offsetLeft - bar.clientWidth / 2 + curEl.offsetWidth / 2;
      bar.scrollLeft = Math.max(0, want);
    } else {
      bar.scrollLeft = bar.scrollWidth;
    }
  }

  function updateBar() {
    var canAct = !G.over && !G.thinking && !browsing();
    var online = G.mode === 'online';
    $$('.gb').forEach(function (b) {
      var a = b.dataset.action;
      if (a === 'takeback') {
        b.hidden = online;                       // you cannot take back against a human
        b.disabled = !canAct || G.moves.length === 0;
      } else if (a === 'hint') {
        var allowed = (G.mode === 'bot') || (online && settings.onlineHints);
        b.hidden = !allowed;
        b.disabled = !canAct || !allowed || G.game.turn !== G.myColor;
      } else if (a === 'draw') {
        b.hidden = !online;
        b.disabled = G.over;
      } else if (a === 'chat') {
        b.disabled = G.mode === 'local';
      } else if (a === 'resign') {
        b.disabled = G.over;
      } else if (a === 'newgame') {
        b.hidden = online;
        b.disabled = false;
      } else b.disabled = false;
    });
    updateNav();
  }

  function saveGame() {
    if (G.over || !G.game) return;
    if (G.mode === 'online') return;            // online games are not resumable
    Store.set('chess.game', {
      fen: G.game.fen(), startFen: G.hist ? G.hist.startFen : null,
      mode: G.mode, botId: G.bot ? G.bot.id : null,
      humanElo: (G.bot && G.bot.human) ? G.bot.elo : null,
      myColor: G.myColor, moves: G.moves.map(function (m) { return m.san; }),
      ply: G.moves.length, tc: G.tc ? G.tc.id : 'unlimited',
      ms: Clock.on ? Clock.ms.slice() : null
    });
  }


  /* ═══════════════════════════════════════════════════════ online ═══ */
  var onlineTc = settings.tc || '10+0';
  var friendTc = settings.tc || '10+0';
  var searchStart = 0, searchTimer = null;

  function serverReady() { return !!(settings.srvUrl || '').trim(); }

  function syncServerWarn() {
    var miss = !serverReady();
    ['#server-warn', '#server-warn-2'].forEach(function (id) {
      var el = $(id); if (el) el.hidden = !miss;
    });
    var fb = $('#btn-find'); if (fb) fb.disabled = miss;
    $$('[data-action="create-room"],[data-action="join-room"]').forEach(function (b) { b.disabled = miss; });
  }

  function setConn(state) {
    ['#conn-dot', '#conn-dot-2'].forEach(function (id) {
      var d = $(id); if (d) d.dataset.state = state;
    });
    var line = $('#conn-line');
    if (!line) return;
    var lat = ON.latency ? ' \u00b7 ' + ON.latency + ' ms' : '';
    line.textContent =
        state === 'connecting' ? 'Connecting to server\u2026'
      : state === 'queued'     ? 'Waiting for an opponent' + lat
      : state === 'playing'    ? 'In a game' + lat
      : state === 'hosting'    ? 'Waiting for your friend' + lat
      : state === 'online'     ? 'Connected' + lat
      :                          (serverReady() ? 'Not connected' : 'No server configured');
  }

  function openOnline() {
    if (!$('#online-tc').children.length) buildOnlineTc('#online-tc', 'online');
    syncServerWarn(); setConn(ON.state);
    $('#searching').hidden = true;
    go('online');
    if (serverReady()) { ON.identify(profile.name || 'Player', profile.rating); ON.connect(); }
  }

  function openFriends() {
    if (!$('#friend-tc').children.length) buildOnlineTc('#friend-tc', 'friend');
    syncServerWarn(); setConn(ON.state);
    $('#invite-card').hidden = true;
    go('friends');
    if (serverReady()) { ON.identify(profile.name || 'Player', profile.rating); ON.connect(); }
  }

  /** compact time-control chips for the online screens */
  function buildOnlineTc(sel, which) {
    var wrap = $(sel); wrap.innerHTML = '';
    var cur = which === 'online' ? onlineTc : friendTc;
    T.TIME_CONTROLS.filter(function (tc) { return tc.id !== 'unlimited'; }).forEach(function (tc) {
      var c = document.createElement('button');
      c.className = 'chip' + (tc.id === cur ? ' on' : '');
      c.textContent = tc.label;
      c.addEventListener('click', function () {
        if (which === 'online') onlineTc = tc.id; else friendTc = tc.id;
        buildOnlineTc(sel, which);
      });
      wrap.appendChild(c);
    });
  }

  function startSearchTimer() {
    searchStart = Date.now();
    clearInterval(searchTimer);
    searchTimer = setInterval(function () {
      var s = Math.floor((Date.now() - searchStart) / 1000);
      var el = $('#search-sub');
      if (el) el.textContent = Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) + ' elapsed';
    }, 1000);
  }
  function stopSearchTimer() { clearInterval(searchTimer); searchTimer = null; }

  function wireOnline() {
    if (!ON) return;

    ON.on('state', function (e) { setConn(e.state); });
    ON.on('latency', function () { setConn(ON.state); });

    ON.on('error', function (e) { toast(e.msg || 'Connection problem'); });

    ON.on('created', function (e) {
      $('#invite-card').hidden = false;
      $('#inv-code').textContent = ON.prettyCode(e.code);
    });

    ON.on('queued', function () { $('#searching').hidden = false; startSearchTimer(); });
    ON.on('cancelled', function () { $('#searching').hidden = true; stopSearchTimer(); });

    ON.on('start', function (e) {
      stopSearchTimer();
      $('#searching').hidden = true;
      $('#invite-card').hidden = true;
      G.opp = e.opp || { name: 'Opponent', rating: 1200 };
      var myColor = e.color === 'w' ? E.WHITE : E.BLACK;
      UI.Sound.play('notify');
      startGame('online', null, myColor, e.tc);
      toast('Game started \u2014 you are ' + (myColor === E.WHITE ? 'White' : 'Black'));
    });

    ON.on('move', function (e) {
      if (G.mode !== 'online' || G.over) return;
      applyRemote({ san: e.san, from: e.from, to: e.to, promo: e.promo });
    });

    ON.on('chat', function (e) { onChatMessage(e.text, true); $('#chat-dot').hidden = false; });

    ON.on('resign', function () {
      if (G.mode !== 'online' || G.over) return;
      finishGame({ over: true, result: G.myColor === E.WHITE ? 'white' : 'black',
                   reason: 'resignation' }, true);
    });

    ON.on('drawOffer', function () {
      if (G.mode !== 'online' || G.over) return;
      openSheet('#draw-sheet');
    });
    ON.on('drawAccept', function () {
      if (G.mode !== 'online' || G.over) return;
      finishGame({ over: true, result: 'draw', reason: 'agreement' }, true);
    });
    ON.on('drawDecline', function () { toast('Draw declined'); });

    ON.on('flag', function (e) {
      if (G.mode !== 'online' || G.over) return;
      var loser = e.color === 'w' ? E.WHITE : E.BLACK;
      finishGame({ over: true, result: loser === E.WHITE ? 'black' : 'white', reason: 'timeout' }, true);
    });

    ON.on('oppLeft', function (e) {
      if (G.mode !== 'online') return;
      if (e.permanent && !G.over) {
        finishGame({ over: true, result: G.myColor === E.WHITE ? 'white' : 'black',
                     reason: 'abandonment' }, true);
      } else if (!G.over) {
        toast('Opponent disconnected \u2014 waiting\u2026');
      }
    });

    ON.on('roomClosed', function () { $('#invite-card').hidden = true; });
  }

  /* ═══════════════════════════════════════════════════════ review ═══ */
  var analysisHandle = null;

  function paintEvalAt(ply) {
    if (!G.review) { $('#evalbar').hidden = true; return; }
    var r = ply > 0 ? G.review.moves[ply - 1] : null;
    var cp = r ? r.cp : 0;
    var pct = RV.winChance(cp) * 100;
    $('#evalbar').hidden = false;
    $('#eval-fill').style.width = pct.toFixed(1) + '%';
    var txt = r && r.mate !== null && r.mate !== undefined
      ? 'M' + Math.abs(r.mate)
      : (cp >= 0 ? '+' : '\u2212') + (Math.abs(cp) / 100).toFixed(1);
    $('#eval-num').textContent = txt;
  }

  function openReview(hist, meta) {
    if (analysisHandle) analysisHandle.cancel();
    $('#analysing').hidden = false;
    $('#review-body').hidden = true;
    $('#an-fill').style.width = '0%';
    $('#an-sub').textContent = '0 / ' + hist.length();
    go('review');

    reviewMeta = meta;
    reviewHist = hist;

    analysisHandle = RV.analyse(hist, {
      depth: 4, timeMs: 240,
      onProgress: function (p) {
        $('#an-fill').style.width = (p.done / p.total * 100).toFixed(1) + '%';
        $('#an-sub').textContent = p.done + ' / ' + p.total;
      },
      onDone: function (res) {
        analysisHandle = null;
        if (hist === G.hist) { G.review = res; }
        renderReview(res, hist, meta);
      }
    });
  }

  var reviewMeta = null, reviewHist = null, reviewRes = null;

  function renderReview(res, hist, meta) {
    reviewRes = res;
    $('#analysing').hidden = true;
    $('#review-body').hidden = false;

    $('#acc-w-name').textContent = meta.white || 'White';
    $('#acc-b-name').textContent = meta.black || 'Black';
    $('#acc-w').textContent = res.white.accuracy.toFixed(1);
    $('#acc-b').textContent = res.black.accuracy.toFixed(1);
    $('#acc-opening').textContent = res.opening || 'Irregular opening';

    /* eval graph */
    var svg = $('#eval-graph'), W = 300, H = 80;
    var pts = res.moves.map(function (m, i) {
      var x = res.moves.length > 1 ? (i / (res.moves.length - 1)) * W : W / 2;
      var y = H - RV.winChance(m.cp) * H;
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var area = pts.length
      ? '0,' + H + ' ' + pts.join(' ') + ' ' + W + ',' + H
      : '';
    svg.innerHTML =
      '<rect width="' + W + '" height="' + H + '" fill="#3a3734"/>' +
      (area ? '<polygon points="' + area + '" fill="#eeeeea" opacity=".92"/>' : '') +
      '<line x1="0" y1="' + (H / 2) + '" x2="' + W + '" y2="' + (H / 2) +
      '" stroke="#81b64c" stroke-width="1" stroke-dasharray="4 3" opacity=".65"/>';

    /* breakdown counts */
    var order = ['brilliant', 'great', 'best', 'excellent', 'good', 'book',
                 'inaccuracy', 'mistake', 'blunder'];
    var brk = $('#brk'); brk.innerHTML = '';
    order.forEach(function (k) {
      var n = (res.white.counts[k] || 0) + (res.black.counts[k] || 0);
      if (!n) return;
      var d = document.createElement('div');
      d.className = 'brk-item';
      d.innerHTML = '<span class="brk-dot dot-' + k + '"></span>' +
                    '<span class="brk-name">' + RV.LABELS[k].name + '</span>' +
                    '<span class="brk-n lab-' + k + '">' + n + '</span>';
      brk.appendChild(d);
    });

    /* every move */
    var list = $('#rev-list'); list.innerHTML = '';
    res.moves.forEach(function (m) {
      var b = document.createElement('button');
      b.className = 'rev-row';
      var num = Math.floor(m.ply / 2) + 1;
      var cp = m.mate !== null && m.mate !== undefined
        ? 'M' + Math.abs(m.mate)
        : (m.cp >= 0 ? '+' : '\u2212') + (Math.abs(m.cp) / 100).toFixed(1);
      b.innerHTML =
        '<span class="rev-no">' + num + (m.color === E.WHITE ? '.' : '\u2026') + '</span>' +
        '<span class="rev-san">' + m.san + '</span>' +
        '<span class="rev-lab lab-' + m.label + '">' + RV.LABELS[m.label].name +
          (m.label === 'mistake' || m.label === 'blunder' || m.label === 'inaccuracy'
            ? '<span class="rev-best"> \u00b7 best ' + (m.best || '?') + '</span>' : '') +
        '</span>' +
        '<span class="rev-cp">' + cp + '</span>';
      b.addEventListener('click', function () {
        if (hist === G.hist) { go('game'); navTo(m.ply + 1); }
      });
      list.appendChild(b);
    });

    $('#pgn-box').textContent = RV.pgn(hist, meta);
    if (hist === G.hist) { renderMoveBar(); paintEvalAt(G.viewPly === null ? hist.length() : G.viewPly); }
  }

  function currentMeta() {
    var names = playerNames();
    var res = G.over ? (function () {
      var ov = $('#ov-title').textContent || '';
      if (ov.indexOf('Draw') === 0) return '1/2-1/2';
      return ov.indexOf(names.w) === 0 ? '1-0' : '0-1';
    })() : '*';
    return {
      white: names.w, black: names.b, result: res,
      whiteElo: G.myColor === E.WHITE ? profile.rating : oppRating(),
      blackElo: G.myColor === E.WHITE ? oppRating() : profile.rating,
      tc: G.tc ? G.tc.id : null, date: G.startedAt || Date.now(),
      event: G.mode === 'bot' ? 'Bot Game' : G.mode === 'online' ? 'Online Game' : 'Pass & Play'
    };
  }

  /* ══════════════════════════════════════════════════════ archive ═══ */
  function openArchive() {
    var list = $('#arch-list'); list.innerHTML = '';
    if (!archive.length) {
      list.innerHTML = '<div class="arch-empty">No games yet. Finish a game and it will appear here.</div>';
    }
    archive.forEach(function (a, i) {
      var b = document.createElement('button');
      b.className = 'arch-row';
      var cls = a.score === 1 ? 'w' : a.score === 0 ? 'l' : 'd';
      var mark = a.score === 1 ? 'W' : a.score === 0 ? 'L' : 'D';
      var when = new Date(a.at);
      var ago = timeAgo(when);
      b.innerHTML =
        '<span class="arch-res ' + cls + '">' + mark + '</span>' +
        '<span class="arch-meta"><span class="arch-opp">' + a.opp + '</span>' +
        '<span class="arch-sub">' + (a.oppElo || '') + ' \u00b7 ' + Math.ceil(a.plies / 2) +
        ' moves \u00b7 ' + ago + (a.delta ? ' \u00b7 ' + (a.delta > 0 ? '+' : '') + a.delta : '') +
        '</span></span>' +
        '<svg class="ic"><use href="#i-next"/></svg>';
      b.addEventListener('click', function () { reviewArchived(i); });
      list.appendChild(b);
    });
    openSheet('#archive-sheet');
  }

  function timeAgo(d) {
    var s = Math.floor((Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return d.toLocaleDateString();
  }

  function reviewArchived(i) {
    var a = archive[i];
    if (!a) return;
    closeSheets();
    var hist = RV.History.fromSan(a.sans, a.startFen);
    openReview(hist, {
      white: a.white, black: a.black,
      result: a.score === 0.5 ? '1/2-1/2'
            : (a.score === 1) === (a.myColor === E.WHITE) ? '1-0' : '0-1',
      tc: a.tc, date: a.at,
      event: a.mode === 'bot' ? 'Bot Game' : a.mode === 'online' ? 'Online Game' : 'Pass & Play'
    });
  }

  /* ──────────────────────────────────────────────────────────── home ─── */
  function refreshHome() {
    var shown = profile.name || 'Player';
    var corner = $('#corner-avatar');
    applyAvatar(corner);
    $('#me-name').textContent = shown;
    $('#me-rating').textContent = profile.rating;
    $('#me-tier').textContent = BOTS.tier(profile.rating).label;

    $('#hm-w').textContent = stats.w;
    $('#hm-l').textContent = stats.l;
    $('#hm-d').textContent = stats.d;
    $('#hm-b').textContent = stats.best || '\u2013';
    var ps = $('#puz-sub');
    if (ps) ps.textContent = puz.solved.length + ' / ' + PZ.PUZZLES.length + ' solved';
    var as = $('#arch-sub');
    if (as) as.textContent = archive.length ? archive.length + ' played' : 'Review';

    var saved = Store.get('chess.game', null);
    var card = $('#resume-card');
    if (saved && saved.ply > 0) {
      card.hidden = false;
      $('#resume-title').textContent = saved.mode === 'bot'
        ? 'vs ' + BOTS.byId(saved.botId).name : 'Pass & Play';
      $('#resume-sub').textContent = 'Move ' + (Math.floor(saved.ply / 2) + 1)
        + ' \u00b7 ' + (saved.mode === 'bot' ? BOTS.byId(saved.botId).elo + ' Elo' : 'two players');
    } else card.hidden = true;
  }

  function buildQuickBots() {
    var row = $('#quick-bots');
    row.innerHTML = '';
    [0, 4, 8, 11, 15, 19].forEach(function (i) {
      var b = BOTS.BOTS[i];
      if (!b) return;
      var el = document.createElement('button');
      el.className = 'quick-bot';
      el.innerHTML = '<img src="' + b.avatar + '" alt=""><div class="qb-name">' + b.name +
                     '</div><div class="qb-elo">' + b.elo + '</div>';
      el.addEventListener('click', function () { openBotSheet(b); });
      row.appendChild(el);
    });
  }

  function buildBotGrid() {
    var grid = $('#bot-grid');
    grid.innerHTML = '';

    /* The adjustable opponent sits first: it is the one most people want. */
    var hc = document.createElement('button');
    hc.className = 'bot-card human-card';
    hc.innerHTML =
      '<span class="bc-tier" style="background:#6aa84f"></span>' +
      '<img src="avatars/player3.jpg" alt="">' +
      '<div class="bc-name">Human</div>' +
      '<div class="bc-elo" id="hc-elo">' + settings.humanElo + '</div>' +
      '<div class="bc-tactic">You set the rating</div>';
    hc.addEventListener('click', openHumanSheet);
    grid.appendChild(hc);

    BOTS.BOTS.forEach(function (b) {
      var t = BOTS.tier(b.elo);
      var el = document.createElement('button');
      el.className = 'bot-card';
      el.innerHTML =
        '<span class="bc-tier" style="background:' + t.color + '"></span>' +
        '<img src="' + b.avatar + '" alt="">' +
        '<div class="bc-name">' + b.name + '</div>' +
        '<div class="bc-elo">' + b.elo + '</div>' +
        '<div class="bc-tactic">' + traitsFor(b)[0].label + '</div>';
      el.addEventListener('click', function () { openBotSheet(b); });
      grid.appendChild(el);
    });
  }

  /* ──────────────────────────────────────────────── bot sheet + time ─── */
  var pendingBot = null;

  function buildTimeControls(sel) {
    var wrap = $(sel || '#tc-wrap');
    wrap.innerHTML = '';
    var groups = [];
    T.TIME_CONTROLS.forEach(function (tc) {
      var g = null;
      for (var i = 0; i < groups.length; i++) if (groups[i].name === tc.group) g = groups[i];
      if (!g) { g = { name: tc.group, items: [] }; groups.push(g); }
      g.items.push(tc);
    });

    groups.forEach(function (g) {
      var row = document.createElement('div');
      row.className = 'tc-group';
      var lab = document.createElement('div');
      lab.className = 'tc-glabel'; lab.textContent = g.name;
      var chips = document.createElement('div');
      chips.className = 'tc-chips';
      g.items.forEach(function (tc) {
        var c = document.createElement('button');
        c.className = 'tc-chip' + (tc.id === settings.tc ? ' sel' : '');
        c.textContent = tc.name;
        c.addEventListener('click', function () {
          settings.tc = tc.id; saveSettings();
          $$('#tc-wrap .tc-chip').forEach(function (x) { x.classList.remove('sel'); });
          c.classList.add('sel');
        });
        chips.appendChild(c);
      });
      row.appendChild(lab); row.appendChild(chips);
      wrap.appendChild(row);
    });
  }

  /* turn a bot's evaluation weights into human-readable trait chips */
  var TRAIT_RULES = [
    { k: 'aggression', op: '>=', v: 0.90, label: 'Attacking',     hot: true },
    { k: 'material',   op: '<=', v: 0.96, label: 'Sacrifices',    hot: true },
    { k: 'kingAttack', op: '>=', v: 1.40, label: 'King hunter',   hot: true },
    { k: 'trade',      op: '<=', v: -0.15, label: 'Avoids trades', hot: true },
    { k: 'safety',     op: '>=', v: 1.30, label: 'Fortress' },
    { k: 'pawns',      op: '>=', v: 1.30, label: 'Structure' },
    { k: 'passers',    op: '>=', v: 1.30, label: 'Endgame' },
    { k: 'rooks',      op: '>=', v: 1.30, label: 'Open files' },
    { k: 'centre',     op: '>=', v: 1.20, label: 'Centre' },
    { k: 'bishops',    op: '>=', v: 1.25, label: 'Bishop pair' },
    { k: 'trade',      op: '>=', v: 0.50, label: 'Trades down' },
    { k: 'material',   op: '>=', v: 1.08, label: 'Greedy' }
  ];

  function traitsFor(b) {
    var s = b.style || {}, out = [];
    TRAIT_RULES.forEach(function (r) {
      var val = s[r.k];
      if (typeof val !== 'number') return;
      var hit = r.op === '>=' ? val >= r.v : val <= r.v;
      if (hit) out.push({ label: r.label, hot: !!r.hot });
    });
    if (b.blunder >= 0.25) out.unshift({ label: 'Error-prone', hot: false });
    if (!out.length) out.push({ label: 'Universal', hot: false });
    return out.slice(0, 4);
  }

  function bookFor(b) {
    var OB = window.ChessOpenings;
    if (!OB || !b.book || !b.book.length) return '';
    if (b.book.length >= 6) return 'Full repertoire';
    return b.book.map(OB.lineName).join(' · ');
  }

  function openBotSheet(b) {
    pendingBot = b;
    $('#sheet-img').src = b.avatar;
    $('#sheet-name').textContent = b.name;
    $('#sheet-title').textContent = b.title + ' · ' + b.series;
    $('#sheet-elo').textContent = b.elo + ' Elo';
    $('#sheet-blurb').textContent = b.blurb;
    $('#sheet-tactic').textContent = b.tactic || '';

    var tr = $('#sheet-traits');
    tr.innerHTML = '';
    traitsFor(b).forEach(function (t) {
      var c = document.createElement('span');
      c.className = 'trait ' + (t.hot ? 'hot' : 'cool');
      c.textContent = t.label;
      tr.appendChild(c);
    });
    var bk = bookFor(b);
    if (bk) {
      var c2 = document.createElement('span');
      c2.className = 'trait';
      c2.textContent = 'Openings: ' + bk;
      tr.appendChild(c2);
    }

    buildTimeControls('#tc-wrap');
    openSheet('#bot-sheet');
  }

  /* ─────────────────────────────────────────── the human opponent ─── */
  var pendingHuman = null;

  function makeHuman(elo) {
    var id = HU.identity(elo);
    return {
      id: 'human', human: true, elo: id.rating, name: id.name,
      avatar: id.avatar, title: 'Online player', country: id.country,
      series: '', blurb: '', tactic: '', book: [],
      style: AI.DEFAULT_STYLE, depth: 0, timeMs: 0,
      blunder: 0, spread: 0, contempt: 0
    };
  }

  function paintHumanSheet(elo) {
    $('#hs-elo').textContent = elo;
    $('#hs-band').textContent = HU.band(elo);
    var p = HU.profile(elo);
    $('#hs-detail').textContent =
      'Calculates about ' + p.horizon + (p.horizon === 1 ? ' move' : ' moves') +
      ' ahead  \u00b7  thinks for roughly ' + (p.timeMs / 1000).toFixed(1) + 's a move';
  }

  function openHumanSheet() {
    pendingHuman = makeHuman(settings.humanElo);
    $('#hs-img').src = pendingHuman.avatar;
    $('#hs-name').textContent = pendingHuman.name;
    $('#hs-range').value = settings.humanElo;
    paintHumanSheet(settings.humanElo);
    buildTimeControls('#tc-wrap-h');
    openSheet('#human-sheet');
  }

  $('#hs-range').addEventListener('input', function () {
    var v = parseInt(this.value, 10) || 1200;
    settings.humanElo = v;
    if (pendingHuman) pendingHuman.elo = v;
    paintHumanSheet(v);
    var tag = $('#hc-elo'); if (tag) tag.textContent = v;
  });
  $('#hs-range').addEventListener('change', saveSettings);

  $('#human-sheet').addEventListener('click', function (e) {
    var b = e.target.closest('[data-side]');
    if (!b || !pendingHuman) return;
    var s = b.dataset.side;
    var color = s === 'w' ? E.WHITE : (s === 'b' ? E.BLACK : (Math.random() < 0.5 ? E.WHITE : E.BLACK));
    pendingHuman.elo = settings.humanElo;
    closeSheets();
    startGame('bot', pendingHuman, color, settings.tc);
  });

  function paintHintSeg() {
    var cur = settings.hintStyle || 'both';
    $$('#seg-hintStyle .seg-btn').forEach(function (b) {
      b.classList.toggle('sel', b.dataset.hintstyle === cur);
    });
  }
  $('#seg-hintStyle').addEventListener('click', function (e) {
    var b = e.target.closest('[data-hintstyle]');
    if (!b) return;
    settings.hintStyle = b.dataset.hintstyle;
    saveSettings(); paintHintSeg();
  });
  paintHintSeg();

  $('#bot-sheet').addEventListener('click', function (e) {
    var b = e.target.closest('[data-side]');
    if (!b || !pendingBot) return;
    var s = b.dataset.side;
    var color = s === 'w' ? E.WHITE : (s === 'b' ? E.BLACK : (Math.random() < 0.5 ? E.WHITE : E.BLACK));
    closeSheets();
    startGame('bot', pendingBot, color, settings.tc);
  });

  /* ───────────────────────────────────────────────────────── avatar ───
     One painter for every avatar in the app: the profile, the home corner
     and both player strips. A chosen picture wins; otherwise the initial
     on a neutral background. */
  var AVATAR_BG = '#55606b';

  function applyAvatar(el) {
    if (!el) return;
    if (profile.photo) {
      el.textContent = '';
      el.style.backgroundImage = 'url(' + profile.photo + ')';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.style.backgroundColor = AVATAR_BG;
      el.classList.add('has-photo');
    } else {
      el.style.backgroundImage = '';
      el.classList.remove('has-photo');
      el.textContent = (profile.name || 'P').charAt(0).toUpperCase();
      el.style.background = AVATAR_BG;
    }
  }

  /* Squares, shrinks and re-encodes the picked image before it is stored.
     A phone camera JPEG is several megabytes and localStorage gives us a
     handful; 256px at quality 0.85 lands around 20 KB. */
  function importAvatar(file) {
    if (!file || !/^image\//.test(file.type)) { toast('That is not an image'); return; }
    var reader = new FileReader();
    reader.onerror = function () { toast('Could not read that file'); };
    reader.onload = function (e) {
      var img = new Image();
      img.onerror = function () { toast('Could not read that image'); };
      img.onload = function () {
        try {
          var S = 256;
          var c = document.createElement('canvas');
          c.width = S; c.height = S;
          var side = Math.min(img.width, img.height);          /* centre crop */
          var sx = (img.width - side) / 2, sy = (img.height - side) / 2;
          c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, S, S);
          profile.photo = c.toDataURL('image/jpeg', 0.85);
          saveProfile();
          refreshProfile();
          refreshHome();
          toast('Picture updated');
        } catch (err) { toast('Could not use that image'); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  /* ───────────────────────────────────────────────── profile screen ─── */
  function refreshProfile() {
    $('#name-input').value = profile.name;
    $('#name-shown').textContent = profile.name || 'Player';
    applyAvatar($('#prof-avatar'));
    $('#btn-av-clear').hidden = !profile.photo;
    $('#st-w').textContent = stats.w;
    $('#st-l').textContent = stats.l;
    $('#st-d').textContent = stats.d;
    $('#st-best').textContent = stats.best || '–';
  }

  $('#name-input').addEventListener('input', function () {
    profile.name = this.value.trim();
    $('#name-shown').textContent = profile.name || 'Player';
    applyAvatar($('#prof-avatar'));
    saveProfile();
  });

  /* pencil: reveal the field, hide it again when the user is done */
  function closeNameEditor() {
    $('#name-input').hidden = true;
    $('#name-row').hidden = false;
    refreshHome();
  }
  $('#name-input').addEventListener('blur', closeNameEditor);
  $('#name-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
  });

  $('#avatar-file').addEventListener('change', function () {
    if (this.files && this.files[0]) importAvatar(this.files[0]);
    this.value = '';                 /* so picking the same file twice fires */
  });

  /* Avatar colours were replaced by real pictures in 1.7; buildAvatarColors
     is kept as a no-op so older callers and saved profiles stay valid. */
  function buildAvatarColors() {}

  /* ──────────────────────────────────────────────── settings screen ─── */
  function refreshSettingsValues() {
    $('#v-board').textContent = T.board(settings.board).name;
    $('#v-piece').textContent = T.piece(settings.piece).name;
    $('#v-bg').textContent    = T.background(settings.bg).name;
    $('#v-sound').textContent = T.sound(settings.sound).name;
  }

  function buildPresetGrid() {
    var grid = $('#preset-grid');
    grid.innerHTML = '';
    T.PRESETS.forEach(function (p) {
      var bd = T.board(p.board);
      var cell = document.createElement('button');
      cell.className = 'preset-cell' + (p.id === settings.preset ? ' sel' : '');
      cell.innerHTML =
        '<div class="preset-mini">' +
          '<div style="background:' + bd.light + '"></div><div style="background:' + bd.dark + '"></div>' +
          '<div style="background:' + bd.dark + '"></div><div style="background:' + bd.light + '"></div>' +
        '</div><div class="preset-name">' + p.name + '</div>';
      cell.addEventListener('click', function () { applyPreset(p); toast(p.name + ' theme applied'); });
      grid.appendChild(cell);
    });
  }

  function buildBoardGrid() {
    var grid = $('#board-grid');
    grid.innerHTML = '';
    T.BOARDS.forEach(function (b) {
      var cell = document.createElement('button');
      cell.className = 'theme-cell' + (b.id === settings.board ? ' sel' : '');
      cell.innerHTML =
        '<div class="theme-mini">' +
          '<div style="background:' + b.light + '"></div><div style="background:' + b.dark + '"></div>' +
          '<div style="background:' + b.dark + '"></div><div style="background:' + b.light + '"></div>' +
        '</div><div class="theme-name">' + b.name + '</div>';
      cell.addEventListener('click', function () {
        settings.board = b.id; settings.preset = ''; saveSettings(); applyAppearance();
        $$('#board-grid .theme-cell').forEach(function (x) { x.classList.remove('sel'); });
        cell.classList.add('sel'); buildPresetGrid();
      });
      grid.appendChild(cell);
    });
  }

  function buildPieceGrid() {
    var grid = $('#piece-grid');
    grid.innerHTML = '';
    T.PIECES.forEach(function (p) {
      var cell = document.createElement('button');
      cell.className = 'piece-cell' + (p.id === settings.piece ? ' sel' : '');
      cell.innerHTML =
        '<div class="pc-row">' +
          '<img src="' + UI.pieceSrc(p.id, E.WHITE, E.KING) + '" loading="lazy">' +
          '<img src="' + UI.pieceSrc(p.id, E.BLACK, E.KNIGHT) + '" loading="lazy">' +
        '</div><div class="piece-name">' + p.name + '</div>';
      cell.addEventListener('click', function () {
        settings.piece = p.id; settings.preset = ''; saveSettings(); applyAppearance();
        $$('#piece-grid .piece-cell').forEach(function (x) { x.classList.remove('sel'); });
        cell.classList.add('sel'); buildPresetGrid();
      });
      grid.appendChild(cell);
    });
  }

  function buildBgGrid() {
    var grid = $('#bg-grid');
    grid.innerHTML = '';
    T.BACKGROUNDS.forEach(function (b) {
      var cell = document.createElement('button');
      cell.className = 'theme-cell' + (b.id === settings.bg ? ' sel' : '');
      cell.innerHTML = '<div class="theme-mini" style="display:block;background:' + b.css + '"></div>' +
                       '<div class="theme-name">' + b.name + '</div>';
      cell.addEventListener('click', function () {
        settings.bg = b.id; settings.preset = ''; saveSettings(); applyAppearance();
        $$('#bg-grid .theme-cell').forEach(function (x) { x.classList.remove('sel'); });
        cell.classList.add('sel'); buildPresetGrid();
      });
      grid.appendChild(cell);
    });
  }

  function buildSoundList() {
    var list = $('#sound-list');
    list.innerHTML = '';
    T.SOUNDS.forEach(function (s) {
      var row = document.createElement('button');
      row.className = 'nav-row' + (s.id === settings.sound ? ' sel' : '');
      row.innerHTML = '<span class="nav-label">' + s.name + '</span>' +
                      '<span class="tick">' + (s.id === settings.sound ? '✓' : '') + '</span>';
      row.addEventListener('click', function () {
        settings.sound = s.id; settings.preset = ''; saveSettings(); applyAppearance();
        buildSoundList(); buildPresetGrid();
        UI.Sound.unlock(); UI.Sound.play('move');
      });
      list.appendChild(row);
    });
  }

  function buildSoundTest() {
    var wrap = $('#sound-test');
    wrap.innerHTML = '';
    UI.EVENTS.forEach(function (k) {
      var b = document.createElement('button');
      b.className = 'snd-btn'; b.textContent = k;
      b.addEventListener('click', function () { UI.Sound.unlock(); UI.Sound.play(k); });
      wrap.appendChild(b);
    });
  }

  function bindToggles() {
    var map = { 'opt-anim': 'anim', 'opt-coords': 'coords', 'opt-hints': 'hints',
                'opt-last': 'last', 'opt-autoq': 'autoq', 'opt-chat': 'chat',
                'opt-onlineHints': 'onlineHints' };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id), key = map[id];
      if (!el) return;
      el.checked = !!settings[key];
      el.addEventListener('change', function () {
        settings[key] = el.checked; saveSettings(); applyAppearance(); syncChat();
        if (G.game) updateBar();
      });
    });
  }

  /* ─────────────────────────────────────────────── chat wiring / key ─── */
  function syncChat() {
    CHAT.enabled = !!settings.chat;
    CHAT.apiKey = settings.groqKey || '';
  }

  function bindChatUI() {
    var key = $('#groq-key');
    key.value = settings.groqKey || '';
    key.addEventListener('input', function () {
      settings.groqKey = this.value.trim();
      saveSettings(); syncChat();
    });

    $('#test-key').addEventListener('click', function () {
      var btn = this;
      btn.textContent = 'Testing…'; btn.disabled = true;
      CHAT.test($('#groq-key').value, function (ok, msg) {
        btn.textContent = 'Test connection'; btn.disabled = false;
        toast(ok ? 'Connected. Bots will talk in character.' : 'Failed: ' + msg, 3400);
      });
    });

    $('#chat-send').addEventListener('click', sendChat);
    $('#chat-input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
    });

    CHAT.onMessage = onChatMessage;
    CHAT.onTyping = onChatTyping;
    syncChat();
  }

  function bindNotifyUI() {
    var tgl = $('#opt-notify'), time = $('#notify-time');
    tgl.checked = !!settings.notify;
    time.value = settings.notifyAt || '19:00';

    tgl.addEventListener('change', function () {
      settings.notify = tgl.checked;
      saveSettings();
      if (tgl.checked && window.AndroidNotify && window.AndroidNotify.requestPermission) {
        window.AndroidNotify.requestPermission();
      }
      syncNotify();
      toast(tgl.checked ? 'Daily reminder set for ' + time.value : 'Daily reminder off');
    });

    time.addEventListener('change', function () {
      settings.notifyAt = time.value || '19:00';
      saveSettings(); syncNotify();
      if (settings.notify) toast('Reminder moved to ' + settings.notifyAt);
    });

    $('#test-notify').addEventListener('click', function () {
      if (!window.AndroidNotify) { toast('Only available in the installed app'); return; }
      if (window.AndroidNotify.requestPermission) window.AndroidNotify.requestPermission();
      window.AndroidNotify.test(JSON.stringify(notifyPool()));
      toast('Test notification sent');
    });
  }

  /* ────────────────────────────────────────────────────────── puzzles ─── */
  var PZ = window.ChessPuzzles;
  var pboard = null;
  var puz = { idx: Store.get('chess.puzIdx', 0), cur: null, done: false,
              solved: Store.get('chess.solved', []) };

  function initPuzzleBoard() {
    pboard = new UI.Board($('#puzzle-board'), {
      set: settings.piece, theme: settings.board, coords: settings.coords,
      hints: settings.hints, lastMove: settings.last, animate: settings.anim,
      arrowId: 'puzzle-arrow'
    });
    pboard.canMoveFrom = function (sq) {
      if (puz.done || !pboard.game) return false;
      var p = pboard.game.board[sq];
      return !!p && E.colorOf(p) === pboard.game.turn;
    };
    pboard.onMove = onPuzzleMove;
  }

  function setPuzStatus(t, cls) {
    var el = $('#puz-status');
    el.textContent = t;
    el.className = 'puz-status' + (cls ? ' ' + cls : '');
  }

  function uciOf(m) {
    return E.algebraic(m.from) + E.algebraic(m.to) + (m.promo ? ' nbrqk'[m.promo].trim() : '');
  }

  function loadPuzzle(i) {
    var list = PZ.PUZZLES;
    puz.idx = ((i % list.length) + list.length) % list.length;
    var p = list[puz.idx];
    puz.cur = p; puz.done = false;

    pboard.opts.set = settings.piece; pboard.opts.theme = settings.board;
    pboard.opts.coords = settings.coords; pboard.opts.hints = settings.hints;
    pboard.applyTheme();
    pboard.flipped = (p.side === 'b');
    pboard.setPosition(new E.Chess(p.fen), null);

    $('#puz-theme').textContent = p.theme;
    $('#puz-turn').textContent = (p.side === 'w' ? 'White' : 'Black') + ' to play';
    $('#puz-rating').textContent = p.rating;
    $('#puz-count').textContent = 'Puzzle ' + (puz.idx + 1) + ' of ' + list.length;
    $('#puz-solved').textContent = 'Solved ' + puz.solved.length;
    setPuzStatus('Find the best move.', '');
    Store.set('chess.puzIdx', puz.idx);
  }

  function onPuzzleMove(from, to) {
    if (puz.done || !puz.cur) return;
    var g = pboard.game;
    var cands = g.movesFrom(from).filter(function (m) { return m.to === to; });
    if (!cands.length) return;
    var mv = (cands[0].flags & E.FLAG_PROMO) ? g.findMove(from, to, E.QUEEN) : cands[0];

    if (uciOf(mv) === puz.cur.uci) {
      var san = g.moveToSan(mv);
      g.makeMove(mv);
      pboard.setPosition(g, mv);
      UI.Sound.play('promote');
      puz.done = true;
      if (puz.solved.indexOf(puz.cur.id) < 0) {
        puz.solved.push(puz.cur.id);
        Store.set('chess.solved', puz.solved);
      }
      $('#puz-solved').textContent = 'Solved ' + puz.solved.length;
      setPuzStatus('Correct — ' + san, 'good');
      setTimeout(function () { if (current === 'puzzles') loadPuzzle(puz.idx + 1); }, 1500);
    } else {
      UI.Sound.play('illegal');
      setPuzStatus('Not quite. Try again.', 'bad');
      pboard.render();
    }
  }

  function puzzleSolution() {
    if (!puz.cur || puz.done) return;
    var g = pboard.game;
    var mv = g.findMove(E.fromAlgebraic(puz.cur.uci.slice(0, 2)),
                        E.fromAlgebraic(puz.cur.uci.slice(2, 4)),
                        puz.cur.uci.length > 4 ? E.QUEEN : undefined);
    if (!mv) return;
    pboard.drawArrow(mv.from, mv.to, '#e8a33d');
    setPuzStatus('Solution: ' + puz.cur.san, '');
    puz.done = true;
    setTimeout(function () { if (current === 'puzzles') loadPuzzle(puz.idx + 1); }, 2200);
  }

  /* ───────────────────────────────────────────────────────── practice ─── */
  function buildDrills() {
    var list = $('#drill-list');
    list.innerHTML = '';
    PZ.DRILLS.forEach(function (d) {
      var row = document.createElement('button');
      row.className = 'drill-row';
      row.innerHTML = '<span class="drill-meta"><span class="drill-name">' + d.name +
                      '</span><span class="drill-goal">' + d.goal + '</span></span>' +
                      '<span class="lvl ' + d.level + '">' + d.level + '</span>';
      row.addEventListener('click', function () {
        var side = d.fen.split(' ')[1] === 'b' ? E.BLACK : E.WHITE;
        startGame('bot', BOTS.byId('kovacs'), side, 'unlimited', d.fen);
        $('#game-title').textContent = d.name;
        toast(d.goal, 3400);
      });
      list.appendChild(row);
    });
  }

  /* ──────────────────────────────────────────────────── notifications ─── */
  function notifyPool() {
    var out = [];
    BOTS.BOTS.forEach(function (b) {
      var line = (CHAT.NUDGES && CHAT.NUDGES[b.id]) || 'Your move. Come back and play.';
      out.push({ title: b.name + ' is waiting', text: line });
    });
    out.push({ title: 'Daily puzzle', text: 'A fresh tactic is waiting. Can you find the best move?' });
    return out;
  }

  function syncNotify() {
    if (!window.AndroidNotify) return;
    var parts = (settings.notifyAt || '19:00').split(':');
    if (settings.notify) {
      window.AndroidNotify.enable(parseInt(parts[0], 10) || 19,
                                  parseInt(parts[1], 10) || 0,
                                  JSON.stringify(notifyPool()));
    } else {
      window.AndroidNotify.disable();
    }
  }

  /** once a day, let the AI write a fresh in-character nudge */
  function refreshAiNudge() {
    if (!settings.notify || !settings.chat || !CHAT.hasKey()) return;
    var lastAt = Store.get('chess.nudgeAt', 0);
    if (Date.now() - lastAt < 20 * 3600 * 1000) return;
    Store.set('chess.nudgeAt', Date.now());
    var bot = BOTS.BOTS[Math.floor(Math.random() * BOTS.BOTS.length)];
    CHAT.nudge(bot, function (line) {
      if (!line) return;
      var pool = notifyPool();
      pool.unshift({ title: bot.name + ' is waiting', text: line });
      if (window.AndroidNotify && settings.notify) {
        var p = (settings.notifyAt || '19:00').split(':');
        window.AndroidNotify.enable(parseInt(p[0], 10) || 19, parseInt(p[1], 10) || 0,
                                    JSON.stringify(pool));
      }
    });
  }

  /* ───────────────────────────────────────────────── global actions ─── */
  /* tapping the dark area around the result card dismisses it */
  $('#board-overlay').addEventListener('click', function (e) {
    if (e.target === this) showResult(false);
  });

  document.addEventListener('click', function (e) {
    /* ---- move navigation: < > |< >| and tapping a move in the bar ---- */
    var navEl = e.target.closest('[data-nav]');
    if (navEl && !navEl.disabled) {
      if (!G.hist) return;
      var max = G.hist.length();
      var at = G.viewPly === null ? max : G.viewPly;
      var d = navEl.dataset.nav;
      navTo(d === 'first' ? 0 : d === 'prev' ? at - 1 : d === 'next' ? at + 1 : max);
      return;
    }
    var mvEl = e.target.closest('.movebar .mv');
    if (mvEl && mvEl.dataset.ply) { navTo(parseInt(mvEl.dataset.ply, 10)); return; }

    var goEl = e.target.closest('[data-go]');
    if (goEl) { UI.Sound.unlock(); go(goEl.dataset.go); return; }

    var act = e.target.closest('[data-action]');
    if (!act || act.disabled) return;
    UI.Sound.unlock();
    var a = act.dataset.action;

    if (a === 'chat') { openChat(); return; }

    if (a === 'puzzle-skip')     { loadPuzzle(puz.idx + 1); return; }
    if (a === 'puzzle-retry')    { loadPuzzle(puz.idx); return; }
    if (a === 'puzzle-solution') { puzzleSolution(); return; }
    if (a === 'puzzle-hint') {
      if (!puz.cur || puz.done) return;
      var hs = E.fromAlgebraic(puz.cur.uci.slice(0, 2));
      pboard.selected = hs;
      pboard.legalForSel = pboard.game.movesFrom(hs);
      pboard.render();
      setPuzStatus('Move this piece.', '');
      return;
    }

    /* ---------------------------------------------------- online ---- */
    if (a === 'open-online')  { openOnline(); return; }
    if (a === 'open-friends') { openFriends(); return; }
    if (a === 'open-archive') { openArchive(); return; }

    if (a === 'find-game') {
      if (!serverReady()) { toast('Set a server URL in Settings first'); return; }
      ON.identify(profile.name || 'Player', profile.rating);
      ON.findGame(onlineTc);
      $('#searching').hidden = false; startSearchTimer();
      return;
    }
    if (a === 'cancel-search') { ON.cancelSearch(); $('#searching').hidden = true; stopSearchTimer(); return; }

    if (a === 'create-room') {
      if (!serverReady()) { toast('Set a server URL in Settings first'); return; }
      ON.identify(profile.name || 'Player', profile.rating);
      ON.createRoom(friendTc);
      return;
    }
    if (a === 'cancel-room') { ON.leaveRoom(); $('#invite-card').hidden = true; return; }

    if (a === 'join-room') {
      var code = ($('#join-code').value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (code.length !== 6) { toast('Enter the 6-character code'); return; }
      ON.identify(profile.name || 'Player', profile.rating);
      ON.joinRoom(code);
      toast('Joining\u2026');
      return;
    }

    if (a === 'copy-code') {
      copyText(ON.session.code || '');
      toast('Code copied');
      return;
    }
    if (a === 'share-code') {
      var txt = ON.shareText(ON.session.code || '');
      if (navigator.share) navigator.share({ text: txt }).catch(function () {});
      else if (window.AndroidShare && window.AndroidShare.share) window.AndroidShare.share(txt);
      else { copyText(txt); toast('Invite copied'); }
      return;
    }

    if (a === 'draw') {
      if (G.mode !== 'online') return;
      ON.offerDraw(); toast('Draw offered');
      return;
    }
    if (a === 'draw-accept')  { closeSheets(); ON.acceptDraw();
      finishGame({ over: true, result: 'draw', reason: 'agreement' }, true); return; }
    if (a === 'draw-decline') { closeSheets(); ON.declineDraw(); return; }

    /* ---------------------------------------------------- review ---- */
    if (a === 'review') {
      if (!G.hist || G.hist.length() < 2) { toast('Not enough moves to review'); return; }
      showResult(false);
      openReview(G.hist, currentMeta());
      return;
    }
    if (a === 'close-review') {
      if (analysisHandle) { analysisHandle.cancel(); analysisHandle = null; }
      if (G.game) { go('game'); showResult(false); } else { go('home'); }
      return;
    }
    if (a === 'copy-pgn' || a === 'share-pgn') {
      var pgnTxt = $('#pgn-box').textContent || '';
      if (a === 'share-pgn' && navigator.share) { navigator.share({ text: pgnTxt }).catch(function () {}); return; }
      if (a === 'share-pgn' && window.AndroidShare && window.AndroidShare.share) { window.AndroidShare.share(pgnTxt); return; }
      copyText(pgnTxt); toast('PGN copied');
      return;
    }
    if (a === 'clear-archive') {
      confirmDialog('Clear history?', 'All saved games will be deleted.', function () {
        archive = []; saveArchive(); closeSheets(); refreshHome(); toast('History cleared');
      });
      return;
    }

    if (a === 'play-local') startGame('local', null, E.WHITE, settings.tc);

    else if (a === 'resume') {
      var saved = Store.get('chess.game', null);
      if (!saved) { toast('No saved game'); return; }
      resumeGame(saved);
    }

    else if (a === 'flip') { board.setFlipped(!board.flipped); renderPlayers(); }

    else if (a === 'leave-game') {
      if (G.mode === 'online' && !G.over) {
        confirmDialog('Leave game?', 'Leaving counts as a resignation.', function () {
          ON.resign(); ON.leaveRoom();
          finishGame({ over: true, result: G.myColor === E.WHITE ? 'black' : 'white',
                       reason: 'resignation' }, true);
          Clock.stop(); closeSheets(); go('home');
        });
        return;
      }
      if (G.mode === 'online') ON.leaveRoom();
      Clock.stop(); closeSheets(); go('home');
    }

    else if (a === 'newgame') {
      if (G.mode === 'bot') go('bots');
      else confirmDialog('New game?', 'The current game will be lost.',
        function () { startGame('local', null, E.WHITE, settings.tc); });
    }

    else if (a === 'rematch') {
      $('#board-overlay').hidden = true;
      if (G.mode === 'bot') startGame('bot', G.bot, G.myColor ^ 1, G.tc.id);
      else startGame('local', null, E.WHITE, G.tc.id);
    }

    else if (a === 'resign') {
      confirmDialog('Resign?', 'You will lose this game.', function () {
        var loser = (G.mode === 'local') ? G.game.turn : G.myColor;
        if (G.mode === 'online') ON.resign();
        finishGame({ over: true, result: loser === E.WHITE ? 'black' : 'white',
                     reason: 'resignation' }, true);
      });
    }

    else if (a === 'takeback') {
      if (!G.moves.length) return;
      var steps = (G.mode === 'bot') ? Math.min(2, G.moves.length) : 1;
      for (var i = 0; i < steps; i++) { G.game.undoMove(); G.moves.pop(); }
      G.over = false;
      $('#board-overlay').hidden = true;
      var last = G.moves.length ? G.moves[G.moves.length - 1] : null;
      board.setPosition(G.game, last ? { from: last.from, to: last.to } : null);
      renderCaptured(); renderMoveBar(); updateBar(); saveGame();
      if (Clock.on) { Clock.side = G.game.turn; Clock.last = Date.now(); Clock.start(G.game.turn); }
    }

    else if (a === 'hint') {
      if (G.thinking || G.over || browsing()) return;
      /* Two stages, so a hint is a nudge rather than the answer:
           1st tap - ring the piece you should move
           2nd tap - draw the arrow to where it goes
         The move is never written out in text. */
      if (hintPly !== G.moves.length) { hintStage = 0; hintPly = G.moves.length; }
      G.thinking = true; updateBar();
      setTimeout(function () {
        var mv = (hintMovePly === G.moves.length && hintMove)
          ? hintMove : AI.bestMove(G.game, 4, 900);
        G.thinking = false; updateBar();
        if (!mv) return;
        hintMove = mv; hintMovePly = G.moves.length;

        board.clearMarks(); board.clearArrow();
        board.markSquare(mv.from, 'hintsq');
        if (hintStage === 0) {
          hintStage = 1;
          if (G.mode === 'online') ON.sendChat('(used a hint)');
        } else {
          var st = settings.hintStyle || 'both';
          if (st !== 'arrow') board.markSquare(mv.to, 'hintto');
          if (st !== 'highlight') board.drawArrow(mv.from, mv.to);
          hintStage = 0;
        }
      }, 40);
    }

    else if (a === 'pick-avatar') { $('#avatar-file').click(); }

    else if (a === 'clear-avatar') {
      confirmDialog('Remove picture?', 'Your avatar goes back to the first letter of your name.', function () {
        delete profile.photo; saveProfile(); refreshProfile(); refreshHome();
      });
    }

    else if (a === 'edit-name') {
      $('#name-row').hidden = true;
      var inp = $('#name-input');
      inp.hidden = false; inp.value = profile.name;
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
    }

    else if (a === 'hide-result') { showResult(false); }
    else if (a === 'show-result') { showResult(true); }

    else if (a === 'reset-stats') {
      confirmDialog('Reset statistics?', 'Wins, losses and draws will be set to zero.', function () {
        stats = { w: 0, l: 0, d: 0, best: 0 };
        saveStats(); refreshProfile(); toast('Statistics reset');
      });
    }
  });

  function resumeGame(saved) {
    G.game = new E.Chess(saved.fen);
    G.mode = saved.mode;
    G.bot = saved.botId === 'human' ? makeHuman(saved.humanElo || settings.humanElo)
          : saved.botId ? BOTS.byId(saved.botId) : null;
    G.myColor = saved.myColor;
    G.hist = RV.History.fromSan(saved.moves || [], saved.startFen || null);
    G.moves = G.hist.moves.map(function (m) { return { san: m.san, from: m.from, to: m.to }; });
    G.over = false; G.thinking = false;
    G.viewPly = null; G.review = null; G.startedAt = Date.now();
    moveQueue.length = 0; applying = false;
    lastResult = null; $('#result-strip').hidden = true;
    hintStage = 0; hintPly = -1; hintMove = null; hintMovePly = -1;
    G.tc = T.timeControl(saved.tc || 'unlimited');
    $('#evalbar').hidden = true;

    applyAppearance();
    board.flipped = (G.mode !== 'local' && G.myColor === E.BLACK);
    $('#game-title').textContent = (G.mode === 'bot') ? 'vs ' + G.bot.name : 'Pass & Play';
    board.setPosition(G.game, null);
    $('#board-overlay').hidden = true;

    Clock.setup(G.tc);
    if (saved.ms && Clock.on) Clock.ms = saved.ms.slice();
    renderPlayers(); renderMoveBar(); updateBar(); updateNav();
    go('game');
    Clock.start(G.game.turn);
    if (G.mode === 'bot' && G.game.turn !== G.myColor) scheduleBot();
  }

  /* Hardware back button (called from MainActivity) */
  window.appBack = function () {
    if (G.awaitingPromo) return true;
    if (!$('#scrim').hidden) { closeSheets(); return true; }
    if (current.indexOf('pick-') === 0) { go('settings'); return true; }
    if (current === 'review') {
      if (analysisHandle) { analysisHandle.cancel(); analysisHandle = null; }
      go(G.game && !G.over ? 'game' : 'home'); return true;
    }
    if (current === 'online' || current === 'friends') { ON.leaveRoom(); go('home'); return true; }
    if (current !== 'home') { Clock.stop(); go('home'); return true; }
    return false;
  };

  function bindOnlineUI() {
    var url = $('#srv-url');
    if (url) {
      url.value = settings.srvUrl || '';
      url.addEventListener('change', function () {
        settings.srvUrl = url.value.trim();
        saveSettings();
        ON.configure(settings.srvUrl);
        syncServerWarn();
        $('#srv-status').textContent = settings.srvUrl
          ? 'Will connect to ' + ON.normalise(settings.srvUrl) : '';
      });
    }

    var test = $('#test-srv');
    if (test) test.addEventListener('click', function () {
      var raw = ($('#srv-url').value || '').trim();
      if (!raw) { $('#srv-status').textContent = 'Enter a URL first.'; return; }
      settings.srvUrl = raw; saveSettings();
      $('#srv-status').textContent = 'Connecting\u2026';
      var probe;
      try { probe = new WebSocket(ON.normalise(raw)); }
      catch (err) { $('#srv-status').textContent = 'That URL is not valid.'; return; }
      var done = false;
      var timer = setTimeout(function () {
        if (done) return; done = true;
        try { probe.close(); } catch (e) {}
        $('#srv-status').textContent = 'No answer after 20 s. A free host may still be waking up \u2014 try again.';
      }, 20000);
      probe.onopen = function () {
        done = true; clearTimeout(timer);
        $('#srv-status').textContent = 'Connected. Online play is ready.';
        try { probe.close(); } catch (e) {}
        ON.configure(raw); syncServerWarn();
      };
      probe.onerror = function () {
        if (done) return; done = true; clearTimeout(timer);
        $('#srv-status').textContent = 'Could not reach that server.';
      };
    });

    $$('[data-fseg]').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('[data-fseg]').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        var host = b.dataset.fseg === 'host';
        $('#fpane-host').hidden = !host;
        $('#fpane-join').hidden = host;
      });
    });

    var jc = $('#join-code');
    if (jc) jc.addEventListener('input', function () {
      var v = jc.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      jc.value = v.length > 3 ? v.slice(0, 3) + '-' + v.slice(3) : v;
    });
  }

  /* ─────────────────────────────────────────────────────────── boot ─── */
  function boot() {
    initBoard();
    initPuzzleBoard();
    applyAppearance();
    buildQuickBots(); buildBotGrid(); buildAvatarColors();
    buildPresetGrid(); buildBoardGrid(); buildPieceGrid();
    buildBgGrid(); buildSoundList(); buildSoundTest(); buildDrills();
    bindToggles(); bindChatUI(); bindNotifyUI(); bindOnlineUI();
    refreshSettingsValues(); refreshHome();
    syncNotify();
    if (ON) {
      ON.configure(settings.srvUrl || '');
      ON.identify(profile.name || 'Player', profile.rating);
      wireOnline();
    }
    syncServerWarn();
    setTimeout(refreshAiNudge, 4000);
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  /* __TESTHOOK__ : exposed only so the headless integration test can drive the
     same code paths the UI uses. Harmless in production. */
  if (typeof window !== 'undefined') {
    window.__G = G; window.__apply = applyMove; window.__navTo = navTo;
    window.__start = startGame; window.__finish = finishGame; window.__RV = RV;
    window.__remote = applyRemote;
  }

  /* ────────────────────────────────────────────────── what's new ───
     Rendered from changelog.js so the in-app history and CHANGELOG.md
     cannot drift apart silently. */
  var KIND = { 'new': 'New', 'fix': 'Fixed', 'gone': 'Removed', 'note': 'Note' };

  function renderWhatsNew() {
    var host = $('#wn-body');
    if (!host || host.dataset.built === CL.VERSION) return;
    host.innerHTML = '';
    CL.LOG.forEach(function (rel, idx) {
      var card = document.createElement('div');
      card.className = 'wn-rel' + (idx === 0 ? ' wn-current' : '');

      var head = document.createElement('div');
      head.className = 'wn-head';
      head.innerHTML = '<span class="wn-v">' + rel.v + '</span>' +
                       '<span class="wn-title">' + rel.title + '</span>' +
                       '<span class="wn-date">' + rel.date + '</span>' +
                       (idx === 0 ? '<span class="wn-badge">Installed</span>' : '');
      card.appendChild(head);

      var list = document.createElement('ul');
      list.className = 'wn-list';
      rel.items.forEach(function (it) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="wn-tag wn-' + it[0] + '">' + (KIND[it[0]] || it[0]) + '</span>';
        li.appendChild(document.createTextNode(it[1]));
        list.appendChild(li);
      });
      card.appendChild(list);
      host.appendChild(card);
    });
    host.dataset.built = CL.VERSION;
  }

  function stampVersion() {
    var v = 'Chess \u00b7 v' + CL.VERSION;
    var tag = $('#ver-tag'); if (tag) tag.textContent = v;
    var ab = document.querySelector('.about-title');
    if (ab) ab.textContent = 'Chess ' + CL.VERSION + ' (build ' + CL.BUILD + ')';
  }

  /* Show the list once after an update, but never on a fresh install. */
  function announceUpdate() {
    try {
      var seen = Store.get('chess.seenVersion', null);
      Store.set('chess.seenVersion', CL.VERSION);
      if (seen && seen !== CL.VERSION) { renderWhatsNew(); go('whatsnew'); }
    } catch (e) {}
  }

  /* ───────────────────────────────────────────────── attribution ───
     Apache-2.0 section 4(d) requires the attribution notice to survive
     into redistributed builds. These are the places it lives. Please
     leave them alone; everything else in this file is fair game. */
  var CREDIT = {
    app: 'Serena Chess',
    author: '@TechnicalSerena',
    with: '@XioquiXin',
    license: 'Apache-2.0',
    repo: 'github.com/botstelegram7-cmyk/serena-chess'
  };

  if (typeof window !== 'undefined') {
    window.__attribution = function () { return JSON.parse(JSON.stringify(CREDIT)); };
  }

  function signBuild() {
    try {
      if (!Store.get('chess.sig', null)) {
        Store.set('chess.sig', { by: CREDIT.author, with: CREDIT['with'], at: Date.now() });
      }
    } catch (e) {}
    try {
      console.log('%c ' + CREDIT.app + ' ', 'background:#6aa84f;color:#fff;font-weight:700',
                  '\n  built by ' + CREDIT.author + ' with ' + CREDIT['with'] +
                  '\n  ' + CREDIT.license + '  \u00b7  ' + CREDIT.repo);
    } catch (e) {}
  }

  /* If the credits block is torn out of the DOM at runtime, put it back.
     Removing it from a redistributed build is a licence violation; doing
     it by script is just rude. */
  function guardCredits() {
    var host = document.querySelector('.credits');
    if (!host || typeof MutationObserver === 'undefined') return;
    var snapshot = host.innerHTML;
    new MutationObserver(function () {
      if (!host.querySelector('.credit-row')) host.innerHTML = snapshot;
    }).observe(host, { childList: true, subtree: true });
  }

  /* Tap the version line seven times. */
  (function () {
    var taps = 0, timer = null;
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#ver-tag')) return;
      taps++;
      clearTimeout(timer);
      timer = setTimeout(function () { taps = 0; }, 1600);
      if (taps >= 7) {
        taps = 0;
        confirmDialog(CREDIT.app,
          'Built by ' + CREDIT.author + ' with ' + CREDIT['with'] + '.\n\n' +
          'You found the hidden credits. There are a few more buried in the source.',
          function () {});
      }
    });
  })();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      boot(); stampVersion(); signBuild(); guardCredits(); announceUpdate();
    });
  } else { boot(); stampVersion(); signBuild(); guardCredits(); announceUpdate(); }

})();
