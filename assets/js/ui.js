/* =========================================================================
   ui.js — board rendering, drag & drop, hint arrows and themed sound
   ========================================================================= */
(function (root) {
  'use strict';

  var E = root.ChessEngine;
  var T = root.ChessThemes;

  var LETTER = ['', 'P', 'N', 'B', 'R', 'Q', 'K'];
  function pieceSrc(set, color, type) {
    return 'pieces/' + set + '/' + (color === E.WHITE ? 'w' : 'b') + LETTER[type] + '.svg';
  }

  /* ───────────────────────────────────────────────────────── sound ─── */
  var EVENTS = ['move', 'moveOpp', 'capture', 'castle', 'check', 'promote',
                'illegal', 'notify', 'gameStart', 'gameEnd', 'checkmate', 'tenSecond'];

  /* The user's uploaded pack is 12 numbered clips; this is the event order. */
  var DEFAULT_MAP = {
    gameStart: 'sound_01', move: 'sound_02', moveOpp: 'sound_03',
    capture: 'sound_04', castle: 'sound_05', check: 'sound_06',
    promote: 'sound_07', illegal: 'sound_08', notify: 'sound_09',
    tenSecond: 'sound_10', gameEnd: 'sound_11', checkmate: 'sound_12'
  };

  var Sound = {
    enabled: true,
    theme: 'default',
    _cache: {},
    _unlocked: false,
    EVENTS: EVENTS,

    url: function (event, themeId) {
      var id = themeId || this.theme;
      var def = T.sound(id);
      if (def.silent) return null;
      if (def.numbered) return 'sounds/default/' + DEFAULT_MAP[event] + '.mp3';
      return 'sounds/' + id + '/' + event + '.mp3';
    },

    setTheme: function (id) {
      this.theme = id;
      this._cache = {};
      var def = T.sound(id);
      if (def.silent) return;
      for (var i = 0; i < EVENTS.length; i++) {
        var u = this.url(EVENTS[i]);
        if (!u) continue;
        try {
          var a = new Audio(u);
          a.preload = 'auto';
          a.volume = 0.9;
          this._cache[EVENTS[i]] = a;
        } catch (e) { /* ignore */ }
      }
    },

    /* some WebView builds need a gesture before the first playback */
    unlock: function () {
      if (this._unlocked) return;
      this._unlocked = true;
      for (var k in this._cache) {
        var a = this._cache[k];
        try {
          a.volume = 0;
          var p = a.play();
          if (p && p.then) p.then(function () {}).catch(function () {});
          a.pause(); a.currentTime = 0; a.volume = 0.9;
        } catch (e) { /* ignore */ }
      }
    },

    play: function (event) {
      if (!this.enabled) return;
      var base = this._cache[event];
      if (!base) return;
      try {
        var a = base.cloneNode();
        a.volume = 0.9;
        var p = a.play();
        if (p && p.catch) p.catch(function () {});
      } catch (e) { /* ignore */ }
    }
  };

  /* ────────────────────────────────────────────────────── the board ─── */
  function Board(el, opts) {
    this.el = el;
    this.opts = Object.assign({
      set: 'classic', theme: 'green', coords: true, hints: true,
      lastMove: true, animate: true, interactive: true, arrowId: 'arrow-layer'
    }, opts || {});

    this.game = null;
    this.flipped = false;
    this.selected = -1;
    this.legalForSel = [];
    this.lastMove = null;
    this.pieces = {};
    this.onMove = null;
    this.canMoveFrom = null;
    this.arrowEl = document.getElementById(this.opts.arrowId);

    this._squares = [];
    this._drag = null;
    this._buildSquares();
    this._bindPointer();
    this.applyTheme();
  }

  Board.prototype._buildSquares = function () {
    this.el.innerHTML = '';
    this._squares = [];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 64; i++) {
      var d = document.createElement('div');
      d.className = 'sq';
      frag.appendChild(d);
      this._squares.push(d);
    }
    this.el.appendChild(frag);
    this.layer = document.createElement('div');
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    this.el.appendChild(this.layer);
  };

  Board.prototype.vIndex = function (sq) {
    var r = sq >> 4, f = sq & 7;
    if (this.flipped) { r = 7 - r; f = 7 - f; }
    return r * 8 + f;
  };
  Board.prototype.vRowCol = function (sq) {
    var r = sq >> 4, f = sq & 7;
    if (this.flipped) { r = 7 - r; f = 7 - f; }
    return [r, f];
  };
  Board.prototype.squareAt = function (row, col) {
    if (this.flipped) { row = 7 - row; col = 7 - col; }
    return row * 16 + col;
  };

  Board.prototype.applyTheme = function () {
    var t = T.board(this.opts.theme);
    this.el.style.setProperty('--sq-light', t.light);
    this.el.style.setProperty('--sq-dark', t.dark);
  };

  Board.prototype.setPosition = function (game, lastMove) {
    this.game = game;
    this.lastMove = lastMove || null;
    this.selected = -1;
    this.legalForSel = [];
    this.clearArrow();
    this.render();
  };

  Board.prototype.render = function () {
    if (!this.game) return;
    var g = this.game, self = this;

    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 8; col++) {
        var vi = row * 8 + col;
        var sq = this.squareAt(row, col);
        var d = this._squares[vi];
        var isLight = ((sq >> 4) + (sq & 7)) % 2 === 0;
        var cls = 'sq ' + (isLight ? 'light' : 'dark');

        if (this.opts.lastMove && this.lastMove &&
            (sq === this.lastMove.from || sq === this.lastMove.to)) cls += ' last';
        if (sq === this.selected) cls += ' sel';

        var p = g.board[sq];
        if (p && E.typeOf(p) === E.KING && g.isAttacked(sq, E.colorOf(p) ^ 1)) cls += ' check';

        if (this.marks && this.marks[sq]) cls += ' ' + this.marks[sq];

        d.className = cls;
        d.innerHTML = '';

        if (this.opts.coords) {
          if (row === 7) {
            var f = document.createElement('span');
            f.className = 'coord file';
            f.textContent = 'abcdefgh'[sq & 7];
            d.appendChild(f);
          }
          if (col === 0) {
            var rk = document.createElement('span');
            rk.className = 'coord rank';
            rk.textContent = String(8 - (sq >> 4));
            d.appendChild(rk);
          }
        }
      }
    }

    if (this.opts.hints && this.selected >= 0) {
      this.legalForSel.forEach(function (m) {
        var dot = document.createElement('div');
        dot.className = 'dot' + ((m.flags & E.FLAG_CAPTURE) ? ' cap' : '');
        self._squares[self.vIndex(m.to)].appendChild(dot);
      });
    }

    this.layer.innerHTML = '';
    this.pieces = {};
    for (var s = 0; s < 128; s++) {
      if (E.offBoard(s)) { s += 7; continue; }
      var pc = g.board[s];
      if (!pc) continue;
      this.layer.appendChild(this._makePiece(s, E.typeOf(pc), E.colorOf(pc)));
    }
  };

  Board.prototype._makePiece = function (sq, type, color) {
    var el = document.createElement('div');
    el.className = 'piece';
    el.style.backgroundImage = 'url("' + pieceSrc(this.opts.set, color, type) + '")';
    var rc = this.vRowCol(sq);
    el.style.transform = 'translate(' + (rc[1] * 100) + '%,' + (rc[0] * 100) + '%)';
    el.dataset.sq = sq;
    this.pieces[sq] = el;
    return el;
  };

  Board.prototype.animateMove = function (move, cb) {
    var self = this;
    this.clearArrow();
    if (!this.opts.animate) { if (cb) cb(); return; }
    var el = this.pieces[move.from];
    if (!el) { if (cb) cb(); return; }

    var capEl = this.pieces[move.to];
    if (capEl && capEl !== el) { capEl.style.transition = 'opacity .12s'; capEl.style.opacity = '0'; }

    var rc = this.vRowCol(move.to);
    el.classList.add('anim');
    el.style.transform = 'translate(' + (rc[1] * 100) + '%,' + (rc[0] * 100) + '%)';

    if (move.flags & (E.FLAG_KCASTLE | E.FLAG_QCASTLE)) {
      var rookFrom = (move.flags & E.FLAG_KCASTLE) ? move.to + 1 : move.to - 2;
      var rookTo   = (move.flags & E.FLAG_KCASTLE) ? move.to - 1 : move.to + 1;
      var rEl = this.pieces[rookFrom];
      if (rEl) {
        var rrc = this.vRowCol(rookTo);
        rEl.classList.add('anim');
        rEl.style.transform = 'translate(' + (rrc[1] * 100) + '%,' + (rrc[0] * 100) + '%)';
      }
    }
    setTimeout(function () { if (cb) cb(); }, 170);
  };

  /* ───────────────────────────────────────────────── hint arrows ─── */
  Board.prototype.drawArrow = function (from, to, color) {
    var svg = this.arrowEl;
    if (!svg) return;
    var a = this.vRowCol(from), b = this.vRowCol(to);
    var x1 = a[1] * 12.5 + 6.25, y1 = a[0] * 12.5 + 6.25;
    var x2 = b[1] * 12.5 + 6.25, y2 = b[0] * 12.5 + 6.25;

    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len;

    var head = 4.6;                         // arrow-head length
    var sx = x1 + ux * 3.4;                 // start a little off the centre
    var ex = x2 - ux * head, ey = y2 - uy * head;
    var sy = y1 + uy * 3.4;

    var px = -uy, py = ux;                  // perpendicular
    var hw = 3.0;                           // head half-width
    var pts = [
      (x2) + ',' + (y2),
      (ex + px * hw) + ',' + (ey + py * hw),
      (ex - px * hw) + ',' + (ey - py * hw)
    ].join(' ');

    var c = color || '#4caf50';
    svg.innerHTML =
      '<line x1="' + sx + '" y1="' + sy + '" x2="' + ex + '" y2="' + ey + '" ' +
        'stroke="' + c + '" stroke-width="2.6" stroke-linecap="round" opacity=".92"/>' +
      '<polygon points="' + pts + '" fill="' + c + '" opacity=".92"/>';
    svg.hidden = false;
  };

  Board.prototype.clearArrow = function () {
    if (this.arrowEl) { this.arrowEl.innerHTML = ''; this.arrowEl.hidden = true; }
  };

  /** ring a square so the player can see *which piece* without being told the move.
      Marks are kept on the board object so they survive a re-render (picking the
      piece up should not make the hint disappear). */
  Board.prototype.markSquare = function (sq, cls) {
    if (!this.marks) this.marks = {};
    this.marks[sq] = cls || 'hintsq';
    var el = this._squares[this.vIndex(sq)];
    if (el) el.classList.add(this.marks[sq]);
  };

  Board.prototype.clearMarks = function () {
    this.marks = {};
    for (var i = 0; i < this._squares.length; i++) {
      this._squares[i].classList.remove('hintsq', 'hintto');
    }
  };

  /* ─────────────────────────────────────────────── pointer handling ─── */
  Board.prototype._bindPointer = function () {
    var self = this;
    var el = this.el;

    function rc(ev) {
      var r = el.getBoundingClientRect();
      var cx = ev.clientX !== undefined ? ev.clientX : (ev.touches && ev.touches[0].clientX);
      var cy = ev.clientY !== undefined ? ev.clientY : (ev.touches && ev.touches[0].clientY);
      var x = cx - r.left, y = cy - r.top;
      var col = Math.floor(x / (r.width / 8));
      var row = Math.floor(y / (r.height / 8));
      return { row: row, col: col, x: x, y: y, w: r.width / 8,
               inside: col >= 0 && col < 8 && row >= 0 && row < 8 };
    }

    function down(ev) {
      if (!self.opts.interactive || !self.game) return;
      var pos = rc(ev);
      if (!pos.inside) return;
      var sq = self.squareAt(pos.row, pos.col);
      self.clearArrow();

      if (self.selected >= 0) {
        var target = null;
        for (var i = 0; i < self.legalForSel.length; i++)
          if (self.legalForSel[i].to === sq) { target = self.legalForSel[i]; break; }
        if (target) {
          ev.preventDefault();
          var from = self.selected;
          self.selected = -1; self.legalForSel = [];
          if (self.onMove) self.onMove(from, sq);
          return;
        }
      }

      var p = self.game.board[sq];
      if (p && (!self.canMoveFrom || self.canMoveFrom(sq))) {
        ev.preventDefault();
        self.selected = sq;
        self.legalForSel = self.game.movesFrom(sq);
        self.render();
        var pel = self.pieces[sq];
        if (pel) {
          self._drag = { sq: sq, el: pel, startX: pos.x, startY: pos.y, moved: false, w: pos.w };
          pel.classList.add('dragging');
        }
      } else if (self.selected >= 0) {
        self.selected = -1; self.legalForSel = [];
        self.render();
      }
    }

    function move(ev) {
      var d = self._drag;
      if (!d) return;
      var pos = rc(ev);
      var dx = pos.x - d.startX, dy = pos.y - d.startY;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      d.moved = true;
      if (ev.cancelable) ev.preventDefault();

      var base = self.vRowCol(d.sq);
      d.el.style.transform =
        'translate(' + (base[1] * 100 + dx / d.w * 100) + '%,' +
                       (base[0] * 100 + dy / d.w * 100) + '%) scale(1.08)';

      var hoverSq = pos.inside ? self.squareAt(pos.row, pos.col) : -1;
      for (var i = 0; i < self.legalForSel.length; i++) {
        self._squares[self.vIndex(self.legalForSel[i].to)]
            .classList.toggle('hover-to', self.legalForSel[i].to === hoverSq);
      }
    }

    function up(ev) {
      var d = self._drag;
      if (!d) return;
      self._drag = null;
      d.el.classList.remove('dragging');
      for (var i = 0; i < self._squares.length; i++) self._squares[i].classList.remove('hover-to');
      if (!d.moved) return;

      var src = ev.changedTouches ? ev.changedTouches[0] : ev;
      var pos = rc(src);
      var to = pos.inside ? self.squareAt(pos.row, pos.col) : -1;

      var legal = null;
      for (var j = 0; j < self.legalForSel.length; j++)
        if (self.legalForSel[j].to === to) { legal = self.legalForSel[j]; break; }

      if (legal) {
        var from = d.sq;
        self.selected = -1; self.legalForSel = [];
        if (self.onMove) self.onMove(from, to);
      } else {
        self.render();
      }
    }

    if (window.PointerEvent) {
      el.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    } else {
      el.addEventListener('touchstart', down, { passive: false });
      window.addEventListener('touchmove', move, { passive: false });
      window.addEventListener('touchend', up);
      el.addEventListener('mousedown', down);
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
  };

  Board.prototype.setFlipped = function (f) { this.flipped = !!f; this.render(); };
  Board.prototype.setOption = function (k, v) {
    this.opts[k] = v;
    if (k === 'theme') this.applyTheme();
    this.render();
  };

  root.ChessUI = { Board: Board, Sound: Sound, pieceSrc: pieceSrc, EVENTS: EVENTS };

})(typeof globalThis !== 'undefined' ? globalThis : this);
