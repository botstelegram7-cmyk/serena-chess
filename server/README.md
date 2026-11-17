# Chess relay server

A WebSocket relay and optional VPS Stockfish service for the Chess app. It powers
**Play Online**, **Play with Friends**, and (when Stockfish is installed) games
against the full Stockfish engine.

The `server/Dockerfile` installs a native Stockfish binary and the relay verifies
the UCI `uci` / `isready` handshake before `/health` reports `stockfish: true`.
The mobile app explicitly distinguishes its built-in character engine from VPS
Stockfish; a failed Stockfish request is never silently presented as a Stockfish move.

## Run locally

```bash
cd server
npm install
npm start          # listens on :8080
```

Then in the app: **Settings → Online → Server URL** → `ws://YOUR-LAN-IP:8080`
(use your computer's LAN address, not `localhost`, or the phone can't reach it).

## Deploy free

### Render
1. Push this repo to GitHub.
2. In Render, choose **New → Blueprint** and select this repo; `server/render.yaml` configures the service to build with Docker and install Stockfish.
3. Or create a **Docker** web service manually, using `server` as the root directory and the included `Dockerfile`.
4. Your URL will be `https://something.onrender.com`; use the matching URL in **Settings → Relay server URL** in the app.

The blueprint is configured for Docker; do not deploy this Stockfish service using the Node-only build/start commands.

> Render's free tier sleeps after 15 minutes idle. The first connection then takes
> ~30 s to wake. The app shows "Connecting…" during that and retries automatically.

### Fly.io / Railway / Koyeb
Any Node host works. A `Dockerfile` is included:

```bash
fly launch --dockerfile Dockerfile
```

## Stockfish readiness check

Deploy with Docker (the included Dockerfile installs Stockfish) or install a native
Stockfish executable on the VPS and set `STOCKFISH_BIN` to its absolute path. The
app's **Stockfish VPS** option stays unavailable until this check returns true:

```sh
curl https://YOUR-SERVER/health
# { "ok": true, "rooms": 0, "queued": 0, "games": 12, "uptime": 420, "stockfish": true }
```

The move endpoint is `POST /stockfish` with JSON `{ "fen": "...", "color": "w" }`.
It returns `{ "bestmove": "e2e4" }`; unavailable engines return HTTP 503 with a
reason. CORS preflight is enabled for the app's JSON request.

## Protocol

JSON over WebSocket. Client → server:

| Message | Purpose |
|---|---|
| `{t:'hello', name, rating}` | identify yourself |
| `{t:'create', tc}` | open a friend room, replies `{t:'created', code}` |
| `{t:'join', code}` | join a friend room |
| `{t:'queue', tc}` | enter matchmaking for a time control |
| `{t:'cancel'}` | leave the queue |
| `{t:'move', san, from, to, promo, ms}` | relay a move |
| `{t:'chat', text}` | relay a chat line |
| `{t:'resign'}` / `{t:'draw'}` / `{t:'drawAccept'}` / `{t:'drawDecline'}` | game control |
| `{t:'flag', color}` | local clock hit zero |
| `{t:'rematch'}` / `{t:'rematchOk'}` | play again |
| `{t:'leave'}` | close the room |
| `{t:'ping', ts}` | latency probe |

Server → client adds `{t:'welcome'}`, `{t:'start', color, opp, tc}`,
`{t:'queued', waiting}`, `{t:'oppLeft', permanent}`, `{t:'roomClosed'}`,
`{t:'error', code, msg}` and `{t:'pong', ts}`.

Room codes are 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` — no
`I`, `O`, `0` or `1`, so they survive being read out over the phone.
