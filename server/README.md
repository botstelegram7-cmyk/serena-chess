# Chess relay server

A ~250-line WebSocket relay that powers **Play Online** and **Play with Friends**
in the Chess app.

It is deliberately *dumb about chess*: it never validates a move. Both phones run
the same rules engine locally, so the server only pairs players and forwards
messages. That keeps it small enough for any free tier.

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
2. New → **Web Service** → point at this repo, set **Root Directory** to `server`.
3. Build `npm install`, start `npm start`. Free instance type is fine.
4. Your URL will be `https://something.onrender.com` → use **`wss://something.onrender.com`** in the app.

`render.yaml` is included, so "New → Blueprint" also works.

> Render's free tier sleeps after 15 minutes idle. The first connection then takes
> ~30 s to wake. The app shows "Connecting…" during that and retries automatically.

### Fly.io / Railway / Koyeb
Any Node host works. A `Dockerfile` is included:

```bash
fly launch --dockerfile Dockerfile
```

## Health check

```
GET /health → { "ok": true, "rooms": 0, "queued": 0, "games": 12, "uptime": 420 }
```

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
