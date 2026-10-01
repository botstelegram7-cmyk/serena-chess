/*!
 * account.js — identity and data portability for Serena Chess.
 *
 * DESIGN NOTE, because this is the part people get wrong.
 *
 * This app has no backend and no database, and that is a feature: nothing to
 * breach, nothing to bill, nothing to shut down. So "log in" here does not
 * mean "authenticate against our server" — there is no our server. It means
 * two separate things that usually get bundled together and should not be:
 *
 *   1. IDENTITY  — what name and picture appear next to your moves.
 *   2. CONTINUITY — not losing your rating and games when you change phone.
 *
 * (2) is the one people actually care about, and it does not need an account
 * at all. It needs an export file. So that is the primary mechanism here, it
 * works offline, it works across Android and any future platform, and it is
 * readable JSON the user owns.
 *
 * Google sign-in is offered as an optional convenience for (1) and for
 * stashing that same backup in the user's own Drive. It is deliberately NOT
 * required, NOT a gate, and the app is fully usable forever without it.
 *
 * Facebook login is intentionally not implemented — see docs/ACCOUNTS.md.
 *
 * Part of Serena Chess by @TechnicalSerena with @XioquiXin — Apache-2.0.
 */
(function (root) {
  'use strict';

  var BACKUP_MAGIC = 'serena-chess-backup';
  var BACKUP_FORMAT = 1;

  /* Keys that belong to the player. Anything not listed is derived state and
     is deliberately left out so a restore cannot resurrect a stale game. */
  var BACKUP_KEYS = [
    'chess.profile', 'chess.stats', 'chess.archive', 'chess.settings',
    'chess.puzzles', 'chess.daily', 'chess.ladder', 'chess.achievements',
    'chess.account', 'chess.seenVersion'
  ];

  /* Settings that must never leave the device in a backup file: the API key
     is a credential, not a preference. Stripped on export, preserved on
     import from whatever the receiving device already had. */
  var SECRET_SETTINGS = ['groqKey'];

  function blankAccount() {
    return { kind: 'guest', id: localId(), name: '', email: '', photo: '',
             since: Date.now(), provider: null };
  }

  /* A stable random id so a guest still has a durable identity for things
     like achievement attribution, without any personal data in it. */
  function localId() {
    var s = '';
    var abc = '0123456789abcdef';
    for (var i = 0; i < 16; i++) s += abc[Math.floor(Math.random() * 16)];
    return 'g-' + s;
  }

  function label(acc) {
    if (!acc || acc.kind === 'guest') return 'Playing as guest';
    if (acc.kind === 'google') return acc.email || 'Signed in with Google';
    return 'Signed in';
  }

  /* ──────────────────────────────────────────────────────── backup ─── */

  function checksum(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }

  /* `read` is a function(key) -> parsed value or null. Kept injectable so
     this is testable without localStorage. */
  function buildBackup(read, meta) {
    var data = {};
    BACKUP_KEYS.forEach(function (k) {
      var v = read(k);
      if (v === null || v === undefined) return;
      if (k === 'chess.settings' && v && typeof v === 'object') {
        v = Object.assign({}, v);
        SECRET_SETTINGS.forEach(function (s) { delete v[s]; });
      }
      data[k] = v;
    });
    var body = { magic: BACKUP_MAGIC, format: BACKUP_FORMAT,
                 app: (meta && meta.version) || '0', build: (meta && meta.build) || 0,
                 at: new Date().toISOString(), data: data };
    body.sum = checksum(JSON.stringify(body.data));
    return body;
  }

  function backupFilename(body) {
    var d = (body.at || '').slice(0, 10) || 'backup';
    return 'serena-chess-' + d + '.json';
  }

  /* Validate hard before touching anything. A half-applied restore is worse
     than a refused one. */
  function validateBackup(obj) {
    if (!obj || typeof obj !== 'object') return { ok: false, why: 'Not a readable file.' };
    if (obj.magic !== BACKUP_MAGIC) return { ok: false, why: 'This is not a Serena Chess backup.' };
    if (!obj.data || typeof obj.data !== 'object') return { ok: false, why: 'The backup has no data in it.' };
    if (obj.format > BACKUP_FORMAT) {
      return { ok: false, why: 'This backup was made by a newer version of the app. Update first.' };
    }
    if (obj.sum && obj.sum !== checksum(JSON.stringify(obj.data))) {
      return { ok: false, why: 'The backup is damaged — the contents do not match its checksum.' };
    }
    var keys = Object.keys(obj.data).filter(function (k) { return BACKUP_KEYS.indexOf(k) >= 0; });
    if (!keys.length) return { ok: false, why: 'The backup contains nothing this app can use.' };
    return { ok: true, keys: keys, summary: summarise(obj) };
  }

  /* So the confirm dialog can say what is actually about to be overwritten
     rather than a blank "are you sure?". */
  function summarise(obj) {
    var d = obj.data || {};
    var p = d['chess.profile'] || {}, s = d['chess.stats'] || {};
    var a = d['chess.archive'] || [], z = d['chess.puzzles'] || {};
    var games = (s.w || 0) + (s.l || 0) + (s.d || 0);
    return {
      name: p.name || 'Unnamed player',
      rating: p.rating || 1200,
      games: games,
      archived: a.length || 0,
      puzzles: z.solved || 0,
      when: (obj.at || '').slice(0, 10)
    };
  }

  /* `write` is function(key, value). Secrets already on the device survive. */
  function applyBackup(obj, read, write) {
    var v = validateBackup(obj);
    if (!v.ok) return v;
    var current = read('chess.settings') || {};
    var n = 0;
    v.keys.forEach(function (k) {
      var val = obj.data[k];
      if (k === 'chess.settings' && val && typeof val === 'object') {
        val = Object.assign({}, val);
        SECRET_SETTINGS.forEach(function (s) {
          if (current[s]) val[s] = current[s];   /* keep this device's key */
        });
      }
      write(k, val);
      n++;
    });
    return { ok: true, restored: n, summary: v.summary };
  }

  /* ───────────────────────────────────────────── google sign-in ─── */

  /* OAuth 2.0 authorisation-code flow with PKCE, run in the system browser.
     No Play Services dependency and no client secret, which is what makes it
     viable in an app built without Gradle.

     It stays switched off until an owner supplies an OAuth client id — a
     half-configured sign-in button that always errors is worse than no
     button, so the UI hides it entirely when this returns false. */
  function googleEnabled(settings) {
    return !!(settings && settings.googleClientId && String(settings.googleClientId).indexOf('.apps.googleusercontent.com') > 0);
  }

  function randomVerifier() {
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    var s = '';
    for (var i = 0; i < 64; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return s;
  }

  function authUrl(clientId, redirect, challenge, state) {
    return 'https://accounts.google.com/o/oauth2/v2/auth'
      + '?client_id=' + encodeURIComponent(clientId)
      + '&redirect_uri=' + encodeURIComponent(redirect)
      + '&response_type=code&scope=' + encodeURIComponent('openid email profile')
      + '&code_challenge=' + encodeURIComponent(challenge)
      + '&code_challenge_method=S256'
      + '&state=' + encodeURIComponent(state);
  }

  /* The id_token is only read for display fields. It is NOT treated as proof
     of anything, because with no backend there is nothing to prove it to —
     claiming otherwise would be security theatre. */
  function parseIdToken(jwt) {
    try {
      var part = String(jwt).split('.')[1];
      if (!part) return null;
      part = part.replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      var json = typeof atob === 'function'
        ? decodeURIComponent(escape(atob(part)))
        : Buffer.from(part, 'base64').toString('utf8');
      var c = JSON.parse(json);
      return { id: c.sub, email: c.email || '', name: c.name || '', photo: c.picture || '' };
    } catch (e) { return null; }
  }

  function fromGoogle(claims) {
    if (!claims || !claims.id) return null;
    return { kind: 'google', id: 'go-' + claims.id, name: claims.name || '',
             email: claims.email || '', photo: claims.photo || '',
             since: Date.now(), provider: 'google' };
  }

  root.ChessAccount = {
    BACKUP_KEYS: BACKUP_KEYS, BACKUP_MAGIC: BACKUP_MAGIC, BACKUP_FORMAT: BACKUP_FORMAT,
    blankAccount: blankAccount, localId: localId, label: label,
    checksum: checksum, buildBackup: buildBackup, backupFilename: backupFilename,
    validateBackup: validateBackup, applyBackup: applyBackup, summarise: summarise,
    googleEnabled: googleEnabled, randomVerifier: randomVerifier,
    authUrl: authUrl, parseIdToken: parseIdToken, fromGoogle: fromGoogle
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.ChessAccount;
})(typeof window !== 'undefined' ? window : globalThis);
