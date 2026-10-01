# Self-hosting guide

There are two separate things you might want to host, and they are
independent. Most people only need the first.

1. **[The relay server](#part-1-the-relay-server)** — needed only for online
   play against other people. Everything else in the app works without it.
2. **[The app itself](#part-2-hosting-the-app)** — as a web page, or as an
   APK your users download.

---

# Part 1 — the relay server

## Why it is needed at all

Two phones on mobile networks cannot open a connection to each other. Both
sit behind carrier NAT, neither has a reachable address. So something with a
public address has to sit in the middle and pass messages across.

That is all this server does. It does not run the chess engine, does not
store games, does not have a database, and does not know who you are. It
keeps a list of rooms in memory and forwards messages between the two players
in each one. If it restarts, in-progress games drop and everything else is
unaffected.

About 250 lines, one dependency (`ws`). It idles at a few megabytes of RAM.

## Before you start

You need the `server/` folder from this repository. Nothing else.

```bash
git clone https://github.com/botstelegram7-cmyk/serena-chess.git
cd serena-chess/server
```

## Option A — Render (easiest, free)

Render reads the included `render.yaml` and configures everything itself.

1. Push this repository to your own GitHub account (or fork it).
2. Go to [dashboard.render.com](https://dashboard.render.com) → **New** →
   **Web Service**.
3. Connect your GitHub and pick the repository.
4. Render detects `render.yaml`. Confirm the settings:
   - **Root directory:** `server`
   - **Environment:** Node
   - **Build command:** `npm install`
   - **Start command:** `node index.js`
   - **Instance type:** Free
5. Click **Create Web Service** and wait about two minutes.

You get a URL like `https://serena-relay.onrender.com`. Check it works:

```bash
curl https://serena-relay.onrender.com/health
# {"ok":true,"rooms":0,"queued":0,"games":0,"uptime":12}
```

Then put `https://serena-relay.onrender.com` into the app under
**Settings → Relay server URL**. The app converts `https://` to `wss://`
automatically — you do not need to type the WebSocket scheme.

> **The free tier sleeps.** After 15 minutes with no traffic Render suspends
> the service, and the next connection takes 30–50 seconds to wake it. The
> app will look like it is hanging. Either warn your players, or keep it warm
> by pinging `/health` every 10 minutes from a free cron service such as
> [cron-job.org](https://cron-job.org), or pay for the always-on tier.

## Option B — Railway

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub
   repo**.
2. Pick the repository, then in **Settings → Root Directory** enter `server`.
3. Railway detects Node and runs `npm install` then `npm start`.
4. **Settings → Networking → Generate Domain** to get a public URL.

Railway does not sleep, but the free allowance is credit-based rather than
unlimited.

## Option C — Fly.io

Uses the included `Dockerfile`.

```bash
cd server
fly launch --name serena-relay --no-deploy
fly deploy
fly status            # shows the hostname
```

Fly keeps a small always-on allowance and has edge locations, so latency is
usually the best of the free options.

## Option D — Docker, anywhere

```bash
cd server
docker build -t serena-relay .
docker run -d --name relay --restart unless-stopped -p 8080:8080 serena-relay
curl http://localhost:8080/health
```

## Option E — a plain VPS

Any £4/month box is enormously more than this needs.

```bash
# as root
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs nginx certbot python3-certbot-nginx

# as a normal user
git clone https://github.com/botstelegram7-cmyk/serena-chess.git
cd serena-chess/server
npm install --omit=dev
```

Keep it running with systemd — `/etc/systemd/system/serena-relay.service`:

```ini
[Unit]
Description=Serena Chess relay
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/home/youruser/serena-chess/server
ExecStart=/usr/bin/node index.js
Environment=PORT=8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now serena-relay
sudo systemctl status serena-relay
```

**You must put TLS in front of it.** The app is served over HTTPS inside a
WebView, and a secure page cannot open an insecure `ws://` socket — the
browser blocks it. So a bare `http://your-ip:8080` will not work from a
phone. Nginx as a reverse proxy, with the WebSocket upgrade headers:

```nginx
server {
    server_name relay.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 3600s;     # games are long and mostly idle
    }
}
```

```bash
sudo certbot --nginx -d relay.example.com
```

Then use `https://relay.example.com` in the app.

> The long `proxy_read_timeout` matters. Nginx defaults to 60 seconds, which
> silently kills a socket whenever someone thinks for more than a minute.

## Option F — on your own network, for testing

```bash
cd server && npm install && node index.js
```

Then enter your computer's LAN address, `192.168.1.50:8080`, in the app. The
app recognises private ranges (`localhost`, `127.`, `192.168.`, `10.`, `172.`)
and uses plain `ws://` for them, so no certificate is needed. This only works
while both devices are on the same Wi-Fi.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port to listen on. Most hosts set this for you. |

There is nothing else to configure. No database, no secrets, no accounts.

## Checking it works

```bash
curl https://your-relay/health
```

```json
{ "ok": true, "rooms": 0, "queued": 0, "games": 0, "uptime": 341 }
```

| Field | Meaning |
|---|---|
| `rooms` | private invite rooms currently open |
| `queued` | players waiting in matchmaking |
| `games` | games in progress |
| `uptime` | seconds since the process started |

## When it goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| "No server set" | URL blank in Settings | Paste the address |
| Hangs ~40s then connects | Render free tier waking up | Ping `/health` on a cron, or upgrade |
| Connects then drops after a minute | Proxy read timeout too short | Raise `proxy_read_timeout` |
| Works on Wi-Fi, not on mobile data | You used a LAN address | Use a public hostname |
| Fails only on the phone | `ws://` from an `https://` page | Put TLS in front, use `https://` |
| Invite code "not found" | Codes are per-server; the other player is on a different relay | Both players need the same URL |

To watch what is happening:

```bash
sudo journalctl -u serena-relay -f      # systemd
docker logs -f relay                    # docker
```

## Capacity

A game is two sockets exchanging a few hundred bytes a move. A single free
instance handles a few hundred concurrent games comfortably; the limit you
hit first is the host's connection cap, not CPU. Memory is a few kilobytes
per room and rooms are freed when both players leave.

---

# Part 2 — hosting the app

## As a web page

The app is plain HTML, CSS and JavaScript. `assets/` is already a working
static site — no build step.

**GitHub Pages**

```bash
git subtree push --prefix assets origin gh-pages
```

Then **Settings → Pages → Branch: gh-pages**. It will be at
`https://yourname.github.io/serena-chess/`.

**Netlify or Vercel** — point the project at the repository and set the
publish directory to `assets`. Leave the build command empty.

**Any web server** — copy `assets/` into the document root. That is the
entire deployment.

What you lose in a browser: the Android share bridge (PGN export falls back
to clipboard), daily notifications, and installing as a real app. What you
keep: everything else, including online play.

Serve it over HTTPS if you want online play to work, for the `wss://`
reason above.

## As an APK

**Distributing the official build** — point people at the
[releases page](https://github.com/botstelegram7-cmyk/serena-chess/releases/latest).
GitHub serves the APK directly and the download URL is stable.

**Distributing your own build** — see
[Building from source](../README.md#building-from-source). Two things to
get right:

1. **Keep your keystore.** An APK signed with a different key cannot upgrade
   one already installed; Android refuses it and the user has to uninstall
   first, losing their games. Back the keystore up somewhere you will still
   have it in two years.
2. **Use your own AI key**, or none. If you ship a build with a key in it,
   that key is public — see [SECURITY.md](../SECURITY.md).

**On a private network** — host the APK on any web server and give people the
link. Android will warn about installing from an unknown source, which is
expected.
