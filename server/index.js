/* =========================================================================
   Chess relay server
   -------------------------------------------------------------------------
   A tiny, dependency-light WebSocket relay that powers two things in the app:

     • Play with Friends — one player creates a room and gets a 6-character
       invite code (and a share link). The friend joins with that code.
     • Play Online       — players drop into a matchmaking queue per time
       control and are paired with whoever is waiting.

   The server is deliberately *dumb about chess*: it never validates moves.
   Both clients run the same rules engine locally, so the server only has to
   relay, pair and keep score of who is connected. That keeps it cheap enough
   to run on a free tier and impossible to cheat via the server.

   Run:    npm install && npm start
   Env:    PORT (default 8080)
   ========================================================================= */
'use strict';

const http = require('http');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 — easier to read aloud
const ROOM_TTL_MS = 1000 * 60 * 60 * 3;   // abandoned rooms are swept after 3h
const HEARTBEAT_MS = 30000;

/* ------------------------------------------------------------------ state */
/** @type {Map<string, Room>} */
const rooms = new Map();
/** queues[tc] = array of sockets waiting for a random opponent */
const queues = new Map();

let totalGames = 0;

function makeCode() {
  let code;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    }
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
  constructor(code, tc, isPublic) {
    this.code = code;
    this.tc = tc || '10+0';
    this.public = !!isPublic;
    this.players = [];          // [{ ws, name, rating, color, connected }]
    this.started = false;
    this.createdAt = Date.now();
    this.moves = [];            // replayed to a reconnecting player
    this.result = null;
  }

  add(ws, name, rating) {
    const p = { ws, name: name || 'Player', rating: rating || 1200, color: null, connected: true };
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
    // random colours, then tell each player what they got
    const whiteFirst = crypto.randomInt(0, 2) === 0;
    this.players[0].color = whiteFirst ? 'w' : 'b';
    this.players[1].color = whiteFirst ? 'b' : 'w';
    for (const p of this.players) {
      const o = this.players.find(x => x !== p);
      send(p.ws, {
        t: 'start',
        code: this.code,
        color: p.color,
        tc: this.tc,
        opp: { name: o.name, rating: o.rating }
      });
    }
  }

  close(reason) {
    this.broadcast({ t: 'roomClosed', reason: reason || 'closed' });
    for (const p of this.players) { if (p.ws) { p.ws.room = null; p.ws.player = null; } }
    rooms.delete(this.code);
  }
}

/* ---------------------------------------------------------- matchmaking */
/* How far apart two ratings may be and still be paired. Starts tight so an
   800 is not fed to a 2200, then widens every few seconds because a good
   match you never get is worse than an imperfect one you do. */
function ratingWindow(waitedMs) {
  return 100 + Math.floor(waitedMs / 4000) * 150;   /* 100 -> +150 per 4s */
}

/* Best available opponent inside a mutually acceptable window. Mutual
   matters: the player who has waited longer has a wider window, and pairing
   on only one side would let a fresh arrival be dragged into a bad game. */
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

  // someone already waiting at a compatible rating? pair them up immediately
  for (;;) {
    const peer = findOpponent(q, ws, Date.now());
    if (!peer) break;                      /* nobody in range yet — wait */
    q.splice(q.indexOf(peer), 1);
    if (peer.readyState !== 1 || peer.room) continue;   /* stale socket, try the next */
    const room = new Room(makeCode(), tc, true);
    rooms.set(room.code, room);
    room.add(peer, peer.pname, peer.prating);
    room.add(ws, ws.pname, ws.prating);
    room.start();
    return;
  }

  q.push(ws);
  ws.queuedIn = tc;
  send(ws, { t: 'queued', tc, waiting: q.length });
}

/* Windows widen with waiting time, but nothing re-examines the queue unless
   somebody new arrives -- so two players just outside each other's window
   would sit there forever while their windows grew. This sweep retries the
   pairing every few seconds. */
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
      const room = new Room(makeCode(), tc, true);
      rooms.set(room.code, room);
      room.add(peer, peer.pname, peer.prating);
      room.add(ws, ws.pname, ws.prating);
      room.start();
      i = -1;                                /* queue changed, start over */
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

/* ------------------------------------------------------------ http + ws */
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const body = JSON.stringify({
      ok: true,
      rooms: rooms.size,
      queued: [...queues.values()].reduce((n, q) => n + q.length, 0),
      games: totalGames,
      uptime: Math.round(process.uptime())
    });
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(body);
    return;
  }
  res.writeHead(404); res.end('not found');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.pname = 'Player';
  ws.prating = 1200;
  ws.on('pong', () => { ws.isAlive = true; });

  send(ws, { t: 'welcome', v: 1 });

  /* Abuse limits. A relay with no limits is a free amplifier: one client can
     flood a room, or pin the process with huge payloads. Generous enough that
     no honest client in a bullet game will ever touch them. */
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
    if (raw && raw.length > 4096) return;            /* no giant frames   */
    if (!allow(1)) return;                           /* ~25 msg/s sustained */
    let m;
    try { m = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!m || typeof m.t !== 'string') return;
    const room = ws.room;

    switch (m.t) {
      case 'hello':
        ws.pname = String(m.name || 'Player').slice(0, 20);
        ws.prating = Number(m.rating) || 1200;
        if (ws.player) { ws.player.name = ws.pname; ws.player.rating = ws.prating; }
        break;

      /* ---- play with friends ------------------------------------- */
      case 'create': {
        if (room) break;
        dequeue(ws);
        const r = new Room(makeCode(), m.tc, false);
        rooms.set(r.code, r);
        r.add(ws, ws.pname, ws.prating);
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
        r.add(ws, ws.pname, ws.prating);
        r.start();
        break;
      }

      /* ---- random online opponent -------------------------------- */
      case 'queue':
        if (room) break;
        enqueue(ws, String(m.tc || '10+0'));
        break;

      case 'cancel':
        dequeue(ws);
        send(ws, { t: 'cancelled' });
        break;

      /* ---- in-game relay ----------------------------------------- */
      case 'move': {
        if (!room || !room.started) break;
        const payload = {
          t: 'move', san: m.san, from: m.from, to: m.to,
          promo: m.promo || null, ms: m.ms || null, ply: room.moves.length
        };
        room.moves.push(payload);
        room.broadcast(payload, ws);
        break;
      }

      case 'chat': {
      const now = Date.now();
      if (now - ws.lastChat < 1200) break;           /* one line per 1.2s */
      ws.lastChat = now;
      if (typeof m.text === 'string' && m.text.length > 400) m.text = m.text.slice(0, 400);
    } {
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

      case 'draw':        // offer
        if (room) room.broadcast({ t: 'draw' }, ws);
        break;

      case 'drawAccept':
        if (room) { room.result = 'draw'; room.broadcast({ t: 'drawAccept' }, ws); }
        break;

      case 'drawDecline':
        if (room) room.broadcast({ t: 'drawDecline' }, ws);
        break;

      case 'flag':        // local clock ran out
        if (room) room.broadcast({ t: 'flag', color: m.color }, ws);
        break;

      case 'rematch':
        if (!room) break;
        room.broadcast({ t: 'rematch' }, ws);
        break;

      case 'rematchOk':
        if (!room) break;
        room.moves = [];
        room.started = false;
        room.result = null;
        room.start();
        break;

      case 'leave':
        if (room) {
          const o = other(room, ws);
          if (o) send(o.ws, { t: 'oppLeft', permanent: true });
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
      // an unstarted room with nobody in it is pointless
      if (!room.started) room.close('abandoned');
    } else {
      rooms.delete(room.code);
    }
  });
});

/* keep-alive: drop sockets that stop answering */
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch (_) { /* already gone */ }
  });
}, HEARTBEAT_MS);

/* sweep rooms nobody came back to */
setInterval(() => {
  const now = Date.now();
  for (const [code, r] of rooms) {
    if (now - r.createdAt > ROOM_TTL_MS) r.close('expired');
    else if (r.players.every(p => !p.connected)) r.close('empty');
  }
}, 60000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`chess relay listening on :${PORT}`);
});
