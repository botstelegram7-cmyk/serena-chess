# Chess

A complete, offline-first chess app for Android. One WebView, no Gradle, no
Android Studio, no frameworks — a `build.sh` that produces a signed APK in
about six seconds.

**[Download the APK](releases/Chess-v1.5.apk)** · v1.5 · 1.5 MB · Android 5.0+

---

## What it does

| | |
|---|---|
| **32 bot opponents** | 250 → 3200, each with its own evaluation weights and opening repertoire |
| **Play Online** | random opponent via matchmaking |
| **Play with Friends** | 6-character invite code, shareable |
| **Pass & Play** | two players, one phone |
| **Move navigation** | `<` `>` step through the whole game, tap any move to jump |
| **Game Review** | per-move classification and accuracy, chess.com style |
| **Puzzles** | 140 verified tactics + 12 endgame drills |
| **Themes** | 32 piece sets, 24 boards, 26 backgrounds, 10 sound packs |
| **In-character chat** | bots talk to you while you play (optional, needs a Groq key) |

Everything except online play works with no network at all.

---

## The engine

A 0x88 board representation with negamax + alpha-beta, transposition table,
quiescence search, late move reductions, null-move pruning and tapered
piece-square tables.

It is **perft-verified against all six standard positions**:

```
startpos  depth 5  →  4,865,609    exact
Kiwipete  depth 4  →  4,085,603    exact
position3 depth 5  →    674,624    exact
position4 depth 4  →    422,333    exact
position5 depth 4  →  2,103,487    exact
```

`node tests/style_test.js` runs perft(5) as a regression gate in ~1.2 s.

### Bots that actually play differently

Three independent systems, not just "search deeper":

**1. Search strength** — `depth` (1–8 ply), `timeMs`, `blunder` (chance of
picking from the weaker 65% of moves) and `spread` (centipawn window for random
choice). This is what makes the ladder real — weak bots genuinely miss things.

**2. Evaluation weights** — each bot carries ten multipliers fed straight into
the evaluation function:

| Weight | Effect |
|---|---|
| `material` | value of raw piece count — below 1.00 it will sacrifice |
| `kingAttack` | reward for massing pieces near your king |
| `centre` | reward for occupying the centre |
| `pawns` | severity of doubled / isolated pawn penalties |
| `passers` | value of passed pawns |
| `rooks` | value of rooks on open and half-open files |
| `bishops` | value of the bishop pair |
| `safety` | value of its own king's pawn shield |
| `aggression` | root bonus for checks and moves toward your king |
| `trade` | above 0 seeks exchanges, below 0 keeps pieces on |

Given the same middlegame position, Tokyo, Levi and Pablo play the aggressive
`Bg5`; Gus and Heisenberg prefer the quiet `Be3`; Tywin grabs space with `d4`.
Same engine, same depth, different taste.

**3. Opening repertoire** — 35 book lines tagged `gambit`, `attack`,
`positional`, `solid`, `hyper`, `tricky`. Each bot draws only from its own
pools, so Lucifer opens the King's Gambit while Tywin plays the Réti. All 35
lines (270 plies) are verified legal by `tests/book_test.js`.

> Ratings above ~2400 are **relative difficulty tiers inside the app**, not
> FIDE-calibrated. At depth 7–8 this engine plays around 2200–2400 in practice.
> Jonas is genuinely much harder than Tywin; he is not literally 3200.

---

## Game Review

After any game, **Game Review** runs the engine over every position and labels
each move the way chess.com does:

`Brilliant` · `Great` · `Best` · `Excellent` · `Good` · `Book` ·
`Inaccuracy` · `Mistake` · `Blunder`

Accuracy uses the standard logistic win-expectancy model, so the numbers are
comparable to what you would see elsewhere. You also get an evaluation graph,
a move breakdown, the opening name, and PGN you can copy or share.

Scholar's Mate scores **White 91.6% / Black 66.7%**, with `6...Nf6` correctly
flagged as the blunder that allows mate.

---

## Online play

Online needs a relay server, because two phones cannot find each other on their
own. One ships with this repo in [`server/`](server) — about 250 lines, one
dependency.

```bash
cd server && npm install && npm start      # listens on :8080
```

Then in the app: **Settings → Online → Relay server URL**.

Deploy it free on Render (a `render.yaml` and `Dockerfile` are included), then
paste `wss://your-app.onrender.com`. See [`server/README.md`](server/README.md)
for the full protocol and other hosts.

The server is **deliberately dumb about chess** — it never validates a move.
Both phones run the same rules engine locally, so the server only pairs players
and forwards messages. That keeps it free to host and impossible to cheat
through.

**Without a server, every other feature still works.** The app says so plainly
rather than showing a broken screen.

---

## Building

```bash
git clone https://github.com/USER/REPO.git
cd REPO
bash build.sh ./Chess.apk
```

`build.sh` downloads the Android build-tools and platform JAR on first run
(~30 s), then builds in about six seconds. You need a JDK and `curl`. There is
no Gradle and no Android Studio.

### Signing key

`release.keystore` is **not** in this repo — a signing key is a secret. The
build script will fail without one; create your own:

```bash
keytool -genkeypair -v -keystore release.keystore -alias chesskey \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass YOURPASS -keypass YOURPASS \
  -dname "CN=Your Name, OU=Mobile, O=You, C=IN"
```

Then update `STOREPASS` and `ALIAS` at the top of `build.sh`. Note that an APK
signed with a different key cannot upgrade over an existing install.

### API keys

**No API key is committed to this repository.** `assets/js/chat.js` contains a
`__GROQ_KEY__` placeholder. At build time `build.sh` replaces it with the
contents of `local.key` if that file exists:

```bash
echo "gsk_your_key_here" > local.key     # gitignored
bash build.sh ./Chess.apk
```

Without `local.key` the placeholder becomes an empty string and the bots fall
back to their built-in chat lines. You can also paste a key into
**Settings → Groq API key** on the device at any time.

> Anything embedded in an APK is extractable. Treat a key shipped this way as
> public and rotate it if it leaks.

---

## Project layout

```
assets/
  index.html          single-page UI, 14 screens
  css/style.css
  js/engine.js        0x88 rules engine, perft-verified
  js/ai.js            negamax + alpha-beta, style-weighted evaluation
  js/bots.js          the 32-bot roster
  js/openings.js      opening book, tagged by style
  js/review.js        history navigation, analysis, PGN, opening names
  js/online.js        relay client
  js/ui.js            board rendering, drag/tap input, sounds
  js/chat.js          Groq client, in-character prompts
  js/app.js           screens, game flow, state
  pieces/  sounds/  avatars/  bg/
java/com/serena/chess/
  MainActivity.java   WebView host + JS bridges (storage, net, notify, share)
  NotifyReceiver.java BootReceiver.java
server/               WebSocket relay for online play
tests/                plain Node test scripts
build.sh              aapt2 → javac → d8 → zipalign → apksigner
```

---

## Tests

```bash
node tests/book_test.js      # 35 opening lines, 270 plies, all legal
node tests/style_test.js     # perft(5) + bots demonstrably differ
node tests/review_test.js    # navigation, classification, PGN
npm i jsdom && node tests/app_test.js   # full UI in a headless DOM
```

`app_test.js` boots the real `index.html` in jsdom and exercises the actual
code paths — including a race test that fires three moves inside one animation
window to prove the move queue keeps them in order (this caught a real bug
where an online opponent's move could be applied before your own).

---

## Credits

Built by **[@TechnicalSerena](https://t.me/TechnicalSerena)** and
**[@XioquiXin](https://t.me/XioquiXin)**.

Piece sets from [Lichess](https://github.com/lichess-org/lila). Character names
are affectionate nods to popular series; all artwork is original stylised
illustration and not a likeness of any actor.

MIT licensed — see [LICENSE](LICENSE).
