/* =========================================================================
   Chess relay server — Serena Chess
   -------------------------------------------------------------------------
   Powers three things in the app:

     • Play with Friends — one player creates a room and gets a 6-character
       invite code. The friend joins with that code.
     • Play Online       — players drop into a matchmaking queue per time
       control and are paired with whoever is waiting.
     • Stockfish Cloud API — POST /stockfish with a FEN returns the engine's
       best move, computed by a native Stockfish binary on the server.
       Used when the device is online so old Android WebViews don't have to
       calculate locally. Falls back to the local JS engine when offline.

   The server never validates chess moves; both clients run the same rules
   engine locally, so the server only relays, pairs and keeps score.

   Run:    npm install && npm start
   Env:    PORT (default 8080), STOCKFISH_BIN (path to stockfish binary)
   ========================================================================= */
'use strict';

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_MS = 1000 * 60 * 60 * 3;
const HEARTBEAT_MS = 30000;
const DATA_FILE = path.join(__dirname, 'data.json');

/* ------------------------------------------------------------- state ----- */
const rooms = new Map();
const queues = new Map();
let totalGames = 0;

/* User profiles: { id: { name, rating, gold, items: [...] } } keyed by a
   client-generated id sent in the `hello` message. Stored to DATA_FILE so
   Elo and gold survive restarts. */
const profiles = new Map();

function loadProfiles() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      for (const [id, p] of Object.entries(raw)) profiles.set(id, p);
    }
  } catch (e) { /* start empty */ }
}
function saveProfiles() {
  try {
    const obj = {};
    for (const [id, p] of profiles) obj[id] = p;
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { console.warn('could not save profiles:', e.message); }
}
setInterval(saveProfiles, 30000).unref?.();
loadProfiles();

const DEFAULT_ITEMS = {
  board: ['classic', 'green', 'wood', 'marble', 'neon', 'dark'],
  piece: ['classic', 'bases', 'bandclass', 'sky', 'staunton3d', 'tigers'],
};
const ITEM_COST = { board: 50, piece: 100, avatar: 200 };

function ensureProfile(id, name) {
  let p = profiles.get(id);
  if (!p) {
    p = {
      name: name || 'Player',
      rating: 1200,
      gold: 200,           /* starting gold */
      items: {
        board: ['classic'],   /* unlocked */
        piece: ['classic'],
        avatar: ['default'],
      },
      equipped: { board: 'classic', piece: 'classic', avatar: 'default' },
      played: 0, wins: 0, losses: 0, draws: 0,
    };
    profiles.set(id, p);
    saveProfiles();
  }
  return p;
}

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) {
    try { ws.send(JSON.stringify(obj)); } catch (_) { /* closed mid-write */ }
  }
}

function other(room, ws) {
  return room.players.find(p => p && p.ws !== ws);
}

/* ------------------------------------------------------------------- room */
class Room {
  constructor(code, tc, isPublic, rated = false) {
    this.code = code;
    this.tc = tc || '10+0';
    this.public = !!isPublic;
    this.rated = !!rated;
    this.players = [];   // [{ ws, id, name, rating, color, connected, profile }]
    this.started = false;
    this.createdAt = Date.now();
    this.moves = [];
    this.result = null;
  }

  add(ws, id, name, rating) {
    const p = { ws, id, name: name || 'Player', rating: rating || 1200, color: null, connected: true, profile: null };
    this.players.push(p);
    ws.room = this;
    ws.player = p;
    return p;
  }

  broadcast(obj, except) {
    for (const p of this.players) if (p.ws !== except) send(p.ws, obj);
  }

  start() {
    if (this.started || this.players.length < 2) return;
    this.started = true;
    totalGames++;
    const whiteFirst = crypto.randomInt(0, 2) === 0;
    this.players[0].color = whiteFirst ? 'w' : 'b';
    this.players[1].color = whiteFirst ? 'b' : 'w';
    for (const p of this.players) {
      const o = this.players.find(x => x !== p);
      send(p.ws, {
        t: 'start', code: this.code, color: p.color, tc: this.tc,
        rated: this.rated,
        opp: { name: o.name, rating: o.rating, id: o.id },
      });
    }
  }

  close(reason) {
    this.broadcast({ t: 'roomClosed', reason: reason || 'closed' });
    for (const p of this.players) { if (p.ws) { p.ws.room = null; p.ws.player = null; } }
    rooms.delete(this.code);
  }
}

/* --------------------------------------------------------- matchmaking -----
   Rating window widens with wait time so a good match you never get is worse
   than an imperfect one you do. Mutual: both sides must accept the gap. */
function ratingWindow(waitedMs) {
  return 100 + Math.floor(waitedMs / 4000) * 150;
}

function findOpponent(q, ws, now) {
  let best = null, bestGap = Infinity;
  for (const peer of q) {
    if (peer === ws || peer.readyState !== 1) continue;
    const gap = Math.abs((peer.prating || 1200) - (ws.prating || 1200));
    const peerWindow = ratingWindow(now - (peer.queuedAt || now));
    const myWindow = ratingWindow(now - (ws.queuedAt || now));
    if (gap <= Math.min(peerWindow, myWindow) && gap < bestGap) { best = peer; bestGap = gap; }
  }
  return best;
}

function enqueue(ws, tc) {
  dequeue(ws);
  if (!queues.has(tc)) queues.set(tc, []);
  const q = queues.get(tc);
  ws.queuedAt = Date.now();

  for (;;) {
    const peer = findOpponent(q, ws, Date.now());
    if (!peer) break;
    q.splice(q.indexOf(peer), 1);
    if (peer.readyState !== 1 || peer.room) continue;
    const room = new Room(makeCode(), tc, true, true);   // rated online game
    rooms.set(room.code, room);
    room.add(peer, peer.pid, peer.pname, peer.prating);
    room.add(ws, ws.pid, ws.pname, ws.prating);
    room.start();
    return;
  }

  q.push(ws);
  ws.queuedIn = tc;
  send(ws, { t: 'queued', tc, waiting: q.length });
}

setInterval(function sweepQueues() {
  const now = Date.now();
  for (const [tc, q] of queues) {
    for (let i = 0; i < q.length; i++) {
      const ws = q[i];
      if (!ws || ws.readyState !== 1 || ws.room) continue;
      const rest = q.filter((x) => x !== ws);
      const peer = findOpponent(rest, ws, now);
      if (!peer) continue;
      q.splice(q.indexOf(peer), 1);
      q.splice(q.indexOf(ws), 1);
      const room = new Room(makeCode(), tc, true, true);
      rooms.set(room.code, room);
      room.add(peer, peer.pid, peer.pname, peer.prating);
      room.add(ws, ws.pid, ws.pname, ws.prating);
      room.start();
      i = -1;
    }
  }
}, 3000).unref?.();

function dequeue(ws) {
  if (!ws.queuedIn) return;
  const q = queues.get(ws.queuedIn);
  if (q) {
    const i = q.indexOf(ws);
    if (i >= 0) q.splice(i, 1);
  }
  ws.queuedIn = null;
}

/* ------------------------------------------------------- stockfish engine --
   Spawns a native Stockfish binary and answers "bestmove" for a FEN.
   If STOCKFISH_BIN is not set or the binary is missing, the endpoint
   returns 503 so the client falls back to its local JS engine. */
const STOCKFISH_BIN = process.env.STOCKFISH_BIN || 'stockfish';
let stockfishReady = false;

function stockfishBestMove(fen, color, cb) {
  if (!STOCKFISH_BIN) { return cb(new Error('no_stockfish_bin')); }
  const proc = spawn(STOCKFISH_BIN, []);
  proc.on('error', () => { cb(new Error('stockfish_missing')); });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; proc.kill(); cb(new Error('timeout')); }, 8000);

  let ready = false;
  let output = '';
  proc.stdout.on('data', (d) => { output += d.toString(); });
  proc.stderr.on('data', () => {});
  proc.on('close', (code) => {
    clearTimeout(timer);
    if (timedOut) return;
    if (!ready) { return cb(new Error('stockfish_not_ready')); }
    const m = output.match(/bestmove\s+([^\s]+)/);
    cb(m ? null : new Error('no_bestmove'), m ? m[1] : null);
  });

  const init = `uci\nsetoption name UCI_Chess960 value false\nposition fen ${fen}\ngo movetime 1000\n`;
  proc.stdin.write(init);
  proc.stdin.end();

  /* wait for readyok */
  const readyInt = setInterval(() => {
    if (output.includes('readyok') || ready) { clearInterval(readyInt); ready = true; }
  }, 50);
  setTimeout(() => { clearInterval(readyInt); }, 2000);
}

/* ------------------------------------------------------------ http + ws --- */
const server = http.createServer((req, res) => {
  const url = req.url;
  const base = url.split('?')[0];
  const enableCors = { 'access-control-allow-origin': '*' };

  if (base === '/health' || base === '/') {
    const body = JSON.stringify({
      ok: true,
      rooms: rooms.size,
      queued: [...queues.values()].reduce((n, q) => n + q.length, 0),
      games: totalGames,
      uptime: Math.round(process.uptime()),
      stockfish: stockfishReady,
    });
    res.writeHead(200, { 'content-type': 'application/json', ...enableCors });
    res.end(body);
    return;
  }

  /* ---------- stockfish cloud API ---------- */
  if (base === '/stockfish' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const j = JSON.parse(body || '{}');
        const fen = j.fen;
        const color = j.color || 'w';
        if (!fen) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'fen required' })); return; }
        stockfishBestMove(fen, color, (err, bestmove) => {
          res.writeHead(err ? 503 : 200, { 'content-type': 'application/json', ...enableCors });
          res.end(JSON.stringify(err ? { error: err.message } : { bestmove }));
        });
      } catch (e) {
        res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'bad json' }));
      }
    });
    return;
  }

  /* ---------- profile api ---------- */
  if (base === '/profile' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const j = JSON.parse(body || '{}');
        const id = j.id;
        const name = j.name;
        if (!id) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'id required' })); return; }
        const p = ensureProfile(id, name);
        res.writeHead(200, { 'content-type': 'application/json', ...enableCors });
        res.end(JSON.stringify(p));
      } catch (e) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'bad json' })); }
    });
    return;
  }

  if (base === '/profile' && req.method === 'GET') {
    const id = (req.headers['x-client-id'] || '').trim();
    const p = id ? profiles.get(id) : null;
    res.writeHead(200, { 'content-type': 'application/json', ...enableCors });
    res.end(JSON.stringify(p || { rating: 1200, gold: 0, items: { board: ['classic'], piece: ['classic'], avatar: ['default'] } }));
    return;
  }

  /* ---------- shop / purchase ---------- */
  if (base === '/shop' && req.method === 'GET') {
    const shop = {
      board: DEFAULT_ITEMS.board.map(b => ({ id: b, name: b.charAt(0).toUpperCase() + b.slice(1), type: 'board', cost: ITEM_COST.board })),
      piece: DEFAULT_ITEMS.piece.map(p => ({ id: p, name: p.charAt(0).toUpperCase() + p.slice(1), type: 'piece', cost: ITEM_COST.piece })),
    };
    res.writeHead(200, { 'content-type': 'application/json', ...enableCors });
    res.end(JSON.stringify(shop));
    return;
  }

  if (base === '/purchase' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const j = JSON.parse(body || '{}');
        const id = j.id;
        const type = j.type;   // 'board' | 'piece' | 'avatar'
        const item = j.item;
        if (!id || !type || !item) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'missing fields' })); return; }
        const p = ensureProfile(id);
        const cost = ITEM_COST[type] || 0;
        if (p.gold < cost) { res.writeHead(402, { ...enableCors }); res.end(JSON.stringify({ error: 'not enough gold' })); return; }
        if (!p.items[type]) p.items[type] = [];
        if (p.items[type].includes(item)) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'already owned' })); return; }
        p.gold -= cost;
        p.items[type].push(item);
        saveProfiles();
        res.writeHead(200, { 'content-type': 'application/json', ...enableCors });
        res.end(JSON.stringify({ ok: true, gold: p.gold, items: p.items }));
      } catch (e) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'bad json' })); }
    });
    return;
  }

  if (base === '/equip' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const j = JSON.parse(body || '{}');
        const id = j.id;
        const type = j.type;
        const item = j.item;
        if (!id || !type || !item) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'missing fields' })); return; }
        const p = ensureProfile(id);
        if (!p.items[type] || !p.items[type].includes(item)) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'not owned' })); return; }
        p.equipped = p.equipped || {};
        p.equipped[type] = item;
        saveProfiles();
        res.writeHead(200, { 'content-type': 'application/json', ...enableCors });
        res.end(JSON.stringify({ ok: true, equipped: p.equipped }));
      } catch (e) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'bad json' })); }
    });
    return;
  }

  /* ---------- game result (rated) ---------- */
  if (base === '/result' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const j = JSON.parse(body || '{}');
        const winnerId = j.winnerId;
        const loserId = j.loserId;
        const draw = j.draw === true;
        const winner = winnerId ? profiles.get(winnerId) : null;
        const loser = loserId ? profiles.get(loserId) : null;

        function expected(mine, theirs) { return 1 / (1 + Math.pow(10, (theirs - mine) / 400)); }

        if (winner && loser && !draw) {
          const K = 24;
          const wBefore = winner.rating, lBefore = loser.rating;
          const wChange = Math.round(K * (1 - expected(wBefore, lBefore)));
          const lChange = Math.round(K * (0 - expected(lBefore, wBefore)));
          winner.rating = Math.max(100, wBefore + wChange);
          loser.rating = Math.max(100, lBefore + lChange);
          winner.gold += 40;   /* win reward */
          loser.gold += 10;    /* participation */
          winner.played++; winner.wins++;
          loser.played++; loser.losses++;
        } else if (draw && winner && loser) {
          const K = 24;
          const wChange = Math.round(K * (0.5 - expected(winner.rating, loser.rating)));
          const lChange = Math.round(K * (0.5 - expected(loser.rating, winner.rating)));
          winner.rating = Math.max(100, winner.rating + wChange);
          loser.rating = Math.max(100, loser.rating + lChange);
          winner.gold += 20;
          loser.gold += 20;
          winner.played++; winner.draws++;
          loser.played++; loser.draws++;
        }
        saveProfiles();
        res.writeHead(200, { 'content-type': 'application/json', ...enableCors });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(400, { ...enableCors }); res.end(JSON.stringify({ error: 'bad json' })); }
    });
    return;
  }

  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.pid = crypto.randomBytes(8).toString('hex');   // persistent client id
  ws.pname = 'Player';
  ws.prating = 1200;
  ws.on('pong', () => { ws.isAlive = true; });

  send(ws, { t: 'welcome', v: 2, id: ws.pid });

  ws.bucket = { tokens: 40, at: Date.now() };
  ws.lastChat = 0;

  function allow(cost) {
    const now = Date.now();
    ws.bucket.tokens = Math.min(40, ws.bucket.tokens + (now - ws.bucket.at) * 0.025);
    ws.bucket.at = now;
    if (ws.bucket.tokens < cost) return false;
    ws.bucket.tokens -= cost;
    return true;
  }

  ws.on('message', (raw) => {
    if (raw && raw.length > 4096) return;
    if (!allow(1)) return;
    let m;
    try { m = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;
    const room = ws.room;

    switch (m.t) {
      case 'hello': {
        ws.pname = String(m.name || 'Player').slice(0, 20);
        ws.prating = Number(m.rating) || 1200;
        ensureProfile(ws.pid, ws.pname);
        const p = profiles.get(ws.pid);
        if (p.rating) ws.prating = p.rating;
        if (ws.player) { ws.player.name = ws.pname; ws.player.rating = ws.prating; }
        send(ws, { t: 'helloAck', id: ws.pid, rating: ws.prating });
        break;
      }

      case 'create': {
        if (room) break;
        dequeue(ws);
        const r = new Room(makeCode(), m.tc, false, false);
        rooms.set(r.code, r);
        r.add(ws, ws.pid, ws.pname, ws.prating);
        send(ws, { t: 'created', code: r.code, tc: r.tc });
        break;
      }

      case 'join': {
        if (room) break;
        const code = String(m.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) { send(ws, { t: 'error', code: 'no_room', msg: 'No game found with that code.' }); break; }
        if (r.players.length >= 2) { send(ws, { t: 'error', code: 'full', msg: 'That game is already full.' }); break; }
        dequeue(ws);
        r.add(ws, ws.pid, ws.pname, ws.prating);
        r.start();
        break;
      }

      case 'queue': {
        if (room) break;
        enqueue(ws, String(m.tc || '10+0'));
        break;
      }

      case 'cancel':
        dequeue(ws);
        send(ws, { t: 'cancelled' });
        break;

      case 'move': {
        if (!room || !room.started) break;
        const payload = { t: 'move', san: m.san, from: m.from, to: m.to, promo: m.promo || null, ms: m.ms || null, ply: room.moves.length };
        room.moves.push(payload);
        room.broadcast(payload, ws);
        break;
      }

      case 'chat': {
        const now = Date.now();
        if (now - ws.lastChat < 1200) break;
        ws.lastChat = now;
        if (typeof m.text === 'string' && m.text.length > 400) m.text = m.text.slice(0, 400);
        if (!room) break;
        const text = String(m.text || '').slice(0, 300);
        if (text) room.broadcast({ t: 'chat', text, from: ws.pname }, ws);
        break;
      }

      case 'resign':
        if (!room || !room.started) break;
        room.result = 'resign';
        room.broadcast({ t: 'resign' }, ws);
        break;

      case 'draw':
        if (room) room.broadcast({ t: 'draw' }, ws);
        break;

      case 'drawAccept':
        if (room) { room.result = 'draw'; room.broadcast({ t: 'drawAccept' }, ws); }
        break;

      case 'drawDecline':
        if (room) room.broadcast({ t: 'drawDecline' }, ws);
        break;

      case 'flag':
        if (room) room.broadcast({ t: 'flag', color: m.color }, ws);
        break;

      case 'rematch':
        if (!room) break;
        room.broadcast({ t: 'rematch' }, ws);
        break;

      case 'rematchOk':
        if (!room) break;
        room.moves = []; room.started = false; room.result = null; room.start();
        break;

      case 'leave':
        if (room) {
          const o = other(room, ws);
          if (o) send(o.ws, { t: 'oppLeft', permanent: !room.started });
          room.close('left');
        }
        dequeue(ws);
        break;

      case 'ping':
        send(ws, { t: 'pong', ts: m.ts });
        break;
    }
  });

  ws.on('close', () => {
    dequeue(ws);
    const room = ws.room;
    if (!room) return;
    const p = ws.player;
    if (p) p.connected = false;
    const o = other(room, ws);
    if (o && o.connected) {
      send(o.ws, { t: 'oppLeft', permanent: !room.started });
      if (!room.started) room.close('abandoned');
    } else {
      rooms.delete(room.code);
    }
  });
});

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (_) { /* already gone */ }
  });
}, HEARTBEAT_MS);

setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.createdAt > ROOM_TTL_MS) r.close('expired');
    else if (r.players.every(p => !p.connected)) r.close('empty');
  }
}, 60000);

/* detect stockfish binary availability at startup */
try {
  const test = spawn(STOCKFISH_BIN, []);
  let ready = false;
  const t = setTimeout(() => { test.kill(); stockfishReady = ready; console.log('stockfish unavailable (no readyok)'); }, 1500);
  test.stdout.on('data', (d) => { if (d.toString().includes('readyok')) ready = true; });
  test.on('error', () => { stockfishReady = false; });
  test.stdin.write('uci\n');
  test.stdin.end();
  test.on('close', () => { clearTimeout(t); if (!ready) stockfishReady = false; });
} catch (e) { stockfishReady = false; }

server.listen(PORT, '0.0.0.0', () => {
  console.log(`chess relay listening on :${PORT}  (stockfish: ${stockfishReady})`);
});
