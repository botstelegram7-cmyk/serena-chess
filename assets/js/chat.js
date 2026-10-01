/* =========================================================================
   chat.js — in-character bot trash-talk, powered by Groq
   ------------------------------------------------------------------------
   Network goes through the native AndroidNet bridge when running inside the
   app (avoids CORS on the file:// origin) and falls back to fetch() in a
   normal browser. With no API key the bots still talk, using built-in lines.
   ========================================================================= */
(function (root) {
  'use strict';

  var API_URL = 'https://api.groq.com/openai/v1/chat/completions';
  var MODEL = 'openai/gpt-oss-120b';

  /* Pre-filled so the feature works out of the box. Editable in Settings.
     Anyone who unpacks the APK can read this — rotate it if it leaks. */
  /* No API key is committed to source control.
     build.sh substitutes the __GROQ_KEY__ placeholder with the contents of
     local.key (which is gitignored) when packaging a private build. Leave it
     empty and the bots still chat using their built-in lines. */
  var DEFAULT_KEY = '__GROQ_KEY__'.indexOf('GROQ_KEY') >= 0 ? '' : '__GROQ_KEY__';

  /* ───────────────────────────────────────────── native POST bridge ─── */
  var seq = 0, pending = {};

  root.__netDone = function (id, ok, text) {
    var p = pending[id];
    if (!p) return;
    delete pending[id];
    if (ok) p.resolve(text); else p.reject(new Error(text || 'network error'));
  };

  function post(url, key, bodyObj) {
    var body = JSON.stringify(bodyObj);
    if (root.AndroidNet && root.AndroidNet.post) {
      return new Promise(function (resolve, reject) {
        var id = 'n' + (++seq);
        pending[id] = { resolve: resolve, reject: reject };
        setTimeout(function () {
          if (pending[id]) { delete pending[id]; reject(new Error('timeout')); }
        }, 45000);
        root.AndroidNet.post(id, url, key, body);
      });
    }
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
      body: body
    }).then(function (r) { return r.text(); });
  }

  /* ─────────────────────────────────────────────────────── personas ─── */
  var VOICES = {
    denver:     'You laugh at everything, shout a lot, use short excited bursts. Loveable idiot energy.',
    jesse:      'Casual street slang, says "yo" and "man", insecure but tries to sound tough.',
    gihun:      'Desperate, over-familiar, slightly pleading, jokes about luck and money.',
    rio:        'Young, nerdy, talks about patterns and computers, gets flustered easily.',
    helsinki:   'Very few words. Blunt, warm, broken grammar. Calls people "my friend".',
    eleven:     'Very short flat sentences. Sometimes just one or two words. Quietly certain.',
    lucifer:    'Charming, flirtatious, theatrical, delighted by your bad decisions.',
    nairobi:    'Loud, confident, motivational, takes command of the conversation.',
    geralt:     'Gruff one-liners. Sighs. Says "hmm". Reluctant to talk at all.',
    ortega:     'Clipped cop talk, sarcastic, treats the board like an investigation.',
    tokyo:      'Reckless and poetic, dramatic first-person narration of the game.',
    villanelle: 'Playful, unsettling, compliments you while threatening you. Childlike glee.',
    harvey:     'Slick lawyer confidence, deal-making metaphors, never admits doubt.',
    berlin:     'Aristocratic, condescending, speaks about art and inevitability.',
    poe:        'Impeccably polite Victorian hotel host. Apologises constantly while destroying you.',
    scofield:   'Calm, precise, speaks in steps and blueprints. Always three moves ahead.',
    kovacs:     'Tired soldier philosophy, cynical, references sleeves and lifetimes.',
    heisenberg: 'Cold, measured, menacing. Chemistry metaphors. Quiet authority.',
    frontman:   'Formal, detached, ominous. Refers to you as "player". Never emotional.',
    professor:  'Precise, academic, kind but absolutely certain. Explains as if lecturing.'
  };

  /* daily-reminder lines, one per bot, used by the notification scheduler */
  var NUDGES = {
    denver:     'One game! Come on, you are not scared of me. Are you?',
    jesse:      'Yo, you coming back or what? I been practising, man.',
    gihun:      'Just one more game. I promise this one counts for nothing.',
    rio:        'I ran the numbers. You are due for a win. Probably.',
    helsinki:   'My friend. Board is ready. You come now.',
    eleven:     'Board. Now. Please.',
    lucifer:    'Darling, the board is warm and I am terribly bored. Come play.',
    nairobi:    'Get up, get the board, let us go. No excuses today.',
    geralt:     'Hmm. The pieces are set. Do not keep me waiting.',
    ortega:     'You have been avoiding me. That is suspicious. Let us talk over a board.',
    tokyo:      'I have been staring at this board all day. Come and lose to me.',
    villanelle: 'I picked out something special for you today. Come and see.',
    harvey:     'Winners show up. Board is set. Do not make me close this alone.',
    berlin:     'I have set the pieces. Do try to make it interesting this time.',
    poe:        'Good evening. Your board has been dusted and awaits you, sir.',
    scofield:   'Step one was setting the board. Step two is you sitting down.',
    kovacs:     'Another day, another sleeve. Board is up. Let us see what you learned.',
    heisenberg: 'You know what time it is. Sit down. Let us cook.',
    frontman:   'Player. Your next game is scheduled. Attendance is expected.',
    professor:  'I have prepared a position I think you will enjoy. Shall we?'
  };

  /* offline fallback lines, keyed by moment */
  var CANNED = {
    start:    ['*sits down* Let us begin.', 'Your move.', "*cracks knuckles* Let's see what you've got.", 'Good luck.'],
    goodMove: ['*raises an eyebrow* Not bad.', 'Interesting.', "*pauses* Didn't expect that.", 'Clever.'],
    blunder:  ['*smiles slowly* Are you sure about that?', 'That was a gift.', '*sighs* Oh dear.', 'Thank you for that.'],
    capture:  ['*takes the piece* Mine.', "I'll take that.", 'Thank you kindly.'],
    lost:     ['*frowns* That hurt.', 'Hm.', 'Fine. Well played.'],
    check:    ['Check.', '*leans in* Watch your king.', 'Careful now.'],
    winning:  ['*settles back* This is going well.', 'I can see the end from here.', 'Almost done.'],
    losing:   ['*rubs forehead* This is not ideal.', 'Hmph.', 'I misjudged that.'],
    thinking: ['*studies the board*', '*taps the table, thinking*', '*narrows eyes*'],
    win:      ['Good game.', '*stands up* As expected.', 'Better luck next time.'],
    lose:     ['*nods slowly* Well played. Truly.', 'You earned that.', 'I underestimated you.'],
    draw:     ['A draw. Acceptable.', '*shrugs* Neither of us blinked.', 'Even.']
  };

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  function systemPrompt(bot) {
    return [
      'You are ' + bot.name + ', ' + bot.title + ' from ' + bot.series + '.',
      'Personality: ' + bot.blurb,
      'Playing style: ' + (bot.tactic || 'balanced') + '. Chess rating: ' + bot.elo + ' Elo.',
      'Speaking voice: ' + (VOICES[bot.id] || 'Confident and brief.'),
      '',
      'You are playing a casual chess game against the user and chatting between moves.',
      'RULES:',
      '- Reply with ONE short line, at most 20 words total.',
      '- Roughly half the time, open with a SHORT physical action wrapped in asterisks',
      '  before you speak, e.g. *leans back* or *taps the table* or *stares at the board*.',
      '  Pick actions that suit your character and the moment (thinking, smirking, sighing).',
      '- Everything outside the asterisks is spoken dialogue, in your own voice.',
      '- Stay fully in character at all times. React to what just happened.',
      '- Plain text only. No markdown headings, no emoji, no quotation marks.',
      '- Never mention that you are an AI, a model, or that you are playing a role.',
      '- Do not use chess notation unless the user does first.',
      '- Never repeat a line you have already used. Vary rhythm and wording.'
    ].join('\n');
  }

  /* ─────────────────────────────────────────────────────── the chat ─── */
  var Chat = {
    enabled: true,
    apiKey: DEFAULT_KEY,
    bot: null,
    history: [],          // {role, content}
    busy: false,
    lastAt: 0,
    minGapMs: 7000,
    onMessage: null,      // (text, fromBot) => void
    onTyping: null,       // (bool) => void

    reset: function (bot) {
      this.bot = bot;
      this.history = [];
      this.lastAt = 0;
      this.busy = false;
    },

    hasKey: function () { return !!(this.apiKey && this.apiKey.trim().length > 20); },

    /** an automatic in-game remark; `force` skips the cooldown */
    say: function (moment, context, force) {
      if (!this.enabled || !this.bot) return;
      var now = Date.now();
      if (!force && now - this.lastAt < this.minGapMs) return;
      if (this.busy) return;
      this.lastAt = now;

      if (!this.hasKey()) {
        var line = pick(CANNED[moment] || CANNED.goodMove);
        this._emit(line);
        return;
      }
      this._ask(this._momentPrompt(moment, context), true);
    },

    /** the user typed something in the chat sheet */
    send: function (text) {
      if (!this.bot) return;
      this._emitUser(text);
      if (!this.hasKey()) {
        var self = this;
        setTimeout(function () { self._emit(pick(CANNED.goodMove)); }, 500);
        return;
      }
      this._ask(text, false);
    },

    _momentPrompt: function (moment, ctx) {
      var c = ctx || {};
      var m = {
        start:    'The game is starting. Greet your opponent in character.',
        goodMove: 'Your opponent just played a strong move. React briefly.',
        blunder:  'Your opponent just blundered and lost material. Taunt them lightly.',
        capture:  'You just captured their ' + (c.piece || 'piece') + '. Say something.',
        lost:     'They just captured your ' + (c.piece || 'piece') + '. React.',
        check:    'You just put their king in check. Say something.',
        winning:  'You are clearly winning now. Say something.',
        losing:   'You are clearly losing now. Say something.',
        thinking: 'You are deep in thought about a difficult position. Show it with an action and few or no words.',
        win:      'You won the game. Say a closing line.',
        lose:     'You lost the game. Say a closing line, in character.',
        draw:     'The game ended in a draw. Say a closing line.'
      }[moment] || 'Say something brief in character about the game.';
      return '[GAME EVENT] ' + m + ' Reply with one short in-character line only.';
    },

    _ask: function (userContent, isEvent) {
      var self = this;
      this.busy = true;
      if (this.onTyping) this.onTyping(true);

      var msgs = [{ role: 'system', content: systemPrompt(this.bot) }];
      // keep the last few turns for continuity
      var tail = this.history.slice(-8);
      for (var i = 0; i < tail.length; i++) msgs.push(tail[i]);
      msgs.push({ role: 'user', content: userContent });

      post(API_URL, this.apiKey, {
        model: MODEL,
        messages: msgs,
        temperature: 1,
        max_completion_tokens: 120,
        top_p: 1,
        stream: false,
        reasoning_effort: 'low'
      }).then(function (text) {
        self.busy = false;
        if (self.onTyping) self.onTyping(false);
        var out = self._extract(text);
        if (!out) { self._emit(pick(CANNED.goodMove)); return; }
        if (!isEvent) self.history.push({ role: 'user', content: userContent });
        self.history.push({ role: 'assistant', content: out });
        self._emit(out);
      }).catch(function () {
        self.busy = false;
        if (self.onTyping) self.onTyping(false);
        self._emit(pick(CANNED.goodMove));
      });
    },

    _extract: function (raw) {
      try {
        var j = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (j.error) return null;
        var c = j.choices && j.choices[0];
        if (!c) return null;
        var txt = (c.message && (c.message.content || c.message.reasoning)) || '';
        txt = String(txt).replace(/^["'\s]+|["'\s]+$/g, '').replace(/\s+/g, ' ');
        if (txt.length > 180) txt = txt.slice(0, 177).trim() + '…';
        return txt || null;
      } catch (e) { return null; }
    },

    _emit: function (t) { if (this.onMessage) this.onMessage(t, true); },
    _emitUser: function (t) {
      this.history.push({ role: 'user', content: t });
      if (this.onMessage) this.onMessage(t, false);
    },

    /** one fresh in-character reminder line for tomorrow's notification */
    nudge: function (bot, cb) {
      if (!this.hasKey()) { cb(NUDGES[bot.id] || null); return; }
      post(API_URL, this.apiKey, {
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt(bot) },
          { role: 'user', content: '[NOTIFICATION] Write one short line, max 14 words, ' +
            'inviting the user to come back and play a game of chess today. In character. ' +
            'No asterisk actions here, just the spoken line.' }
        ],
        temperature: 1.1, max_completion_tokens: 80, stream: false, reasoning_effort: 'low'
      }).then(function (t) {
        var j; try { j = JSON.parse(t); } catch (e) { cb(null); return; }
        var m = j.choices && j.choices[0] && j.choices[0].message;
        var s = m && m.content ? String(m.content).replace(/^["'\s*]+|["'\s*]+$/g, '') : '';
        cb(s && s.length < 160 ? s : (NUDGES[bot.id] || null));
      }).catch(function () { cb(NUDGES[bot.id] || null); });
    },

    /** Settings → Test connection */
    test: function (key, cb) {
      if (!key || key.trim().length < 20) { cb(false, 'No API key entered'); return; }
      post(API_URL, key.trim(), {
        model: MODEL,
        messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
        max_completion_tokens: 20, stream: false, reasoning_effort: 'low'
      }).then(function (text) {
        try {
          var j = JSON.parse(text);
          if (j.error) { cb(false, j.error.message || 'API error'); return; }
          cb(true, 'Connected — model responded');
        } catch (e) { cb(false, 'Bad response'); }
      }).catch(function (e) { cb(false, String(e.message || e)); });
    }
  };

  root.ChessChat = Chat;
  root.ChessChat.DEFAULT_KEY = DEFAULT_KEY;
  root.ChessChat.MODEL = MODEL;
  root.ChessChat.NUDGES = NUDGES;

})(typeof globalThis !== 'undefined' ? globalThis : this);
