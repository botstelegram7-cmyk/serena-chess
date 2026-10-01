<div align="center">

# Serena Chess

**A complete chess app for Android in a single 1.5 MB APK.**
61 opponents, online play, and chess.com-style game review — all of it offline-first.

[![CI](https://github.com/botstelegram7-cmyk/serena-chess/actions/workflows/ci.yml/badge.svg)](https://github.com/botstelegram7-cmyk/serena-chess/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/botstelegram7-cmyk/serena-chess?label=release)](https://github.com/botstelegram7-cmyk/serena-chess/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/botstelegram7-cmyk/serena-chess/total)](https://github.com/botstelegram7-cmyk/serena-chess/releases)
[![Android](https://img.shields.io/badge/Android-5.0%2B-3ddc84.svg)](#installing)

[**Download the APK**](https://github.com/botstelegram7-cmyk/serena-chess/releases/latest) ·
[Self-hosting the server](docs/SELF-HOSTING.md) ·
[Architecture](docs/ARCHITECTURE.md) ·
[Contributing](CONTRIBUTING.md)

</div>

---

## What it is

A full chess application — engine, opponents, analysis, online play, puzzles —
built as one WebView app with no Gradle, no Android Studio, and no runtime
dependencies. The whole thing compiles to a signed APK in about six seconds on
a laptop.

It is offline-first by design. Every feature except online multiplayer works
with the radio switched off, because the engine runs on the device rather than
on somebody's server.

## Contents

- [Features](#features)
- [The adjustable human opponent](#the-adjustable-human-opponent)
- [Installing](#installing)
- [Building from source](#building-from-source)
- [Online play](#online-play)
- [Project layout](#project-layout)
- [Testing](#testing)
- [Contributing](#contributing)
- [Licence](#licence)

## Features

### Opponents

**60 characters from 250 to 3200**, each with its own evaluation weights, so
they genuinely want different things on the board rather than sharing one
brain at different depths. One wants your king, one wants your pawn structure,
one will trade into any endgame it can reach. Each has an opening repertoire,
a playing-style description, and a chat personality.

**One adjustable human** whose rating you set yourself. See below.

### Analysis

- **Game Review** — every move classified (Brilliant, Great, Best, Excellent,
  Good, Book, Inaccuracy, Mistake, Blunder) with per-side accuracy, an
  evaluation graph, and the opening named from a 72-entry table.
- **Move navigation** — step through any game with `|<` `<` `>` `>|`, or tap
  any move in the bar to jump straight to that position.
- **PGN export** with full headers, sharable through the Android share sheet.
- **A 40-game archive** you can reopen and review later.

### Play

- Pass and Play on one device
- Online matchmaking and private invites (see [Online play](#online-play))
- 140 tactics puzzles and 12 endgame drills
- Full time controls with real chess clocks, from bullet to unlimited
- Elo that moves with your results

### Presentation

- 12 preset themes plus custom board, piece, background and sound pickers
- 32 piece sets and 24 boards
- No emoji anywhere in the interface — every icon is an inline SVG
- Optional daily reminder notification

## The adjustable human opponent

Pick **Human** at the top of the opponent grid and drag the slider anywhere
from 400 to 2800.

The interesting part is how the strength is produced. The obvious approach —
take a strong engine and make it play a random bad move every so often — does
not work, because the mistakes are the wrong *shape*. A person watching can
tell within a few moves: the opponent plays six perfect moves and then hangs
its queen for no reason. Nobody plays like that.

So three mechanisms run together instead:

| Mechanism | What it models |
|---|---|
| **Horizon** | The search only looks as far ahead as a player of that rating reliably calculates — one ply at 400, eight at 2800. Pieces get hung because the refutation was genuinely over the horizon. |
| **Attention** | People do not weigh every legal move equally. Recaptures, checks and forward moves get considered; quiet retreats and rim knight moves barely get looked at. Every move is weighted by how likely a person is to even notice it. |
| **Temperature** | Among the moves that survive, the choice is sampled rather than maximised, with the spread narrowing as the rating climbs. |

A fourth control, the **error ceiling**, keeps the whole thing honest. Without
it the sampler occasionally throws a rook away at every rating, which gives
the game away immediately. Strong players make plenty of 40-point errors and
almost never hang a rook, so the ceiling tightens with rating and real
blunders come from a separate, rate-controlled slip path.

It also does not move like software: thinking time is drawn from a long-tailed
distribution, forced recaptures come back instantly, and hard positions get a
long stare. The opponent is given an ordinary username and a default avatar,
and the in-character chat is switched off.

Measured average centipawn loss against a deeper reference search:

| Setting | 600 | 1000 | 1400 | 1800 | 2200 | 2600 |
|---|---|---|---|---|---|---|
| **Measured ACPL** | 162 | 84 | 74 | 82 | 42 | 22 |

Those are real human figures for those bands. Reproduce them with
`node tests/human_calib.js`, and see [`assets/js/human.js`](assets/js/human.js)
for the calibration curves.

> **On ratings above ~2400:** these are relative difficulty tiers inside the
> app, not FIDE-calibrated. The underlying engine plays somewhere around
> 2200–2400 at depth 7–8.

## Installing

Download the APK from the [latest release](https://github.com/botstelegram7-cmyk/serena-chess/releases/latest)
and open it on your phone. Android will ask you to allow installation from
your browser or file manager — this is the normal prompt for anything not from
the Play Store.

Requires **Android 5.0 or newer**. The app asks for network access (online
play and the optional AI chat) and notifications (the optional daily
reminder). Nothing else.

## Building from source

No Gradle, no Android Studio. You need a JDK and the Android build-tools; the
script fetches the SDK pieces itself if they are missing.

```bash
git clone https://github.com/botstelegram7-cmyk/serena-chess.git
cd serena-chess

# 1. a signing key (every APK must be signed, even a debug one)
keytool -genkeypair -v -keystore release.keystore -alias chesskey \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass serenachess -keypass serenachess \
  -dname "CN=Serena Chess, OU=Mobile, O=Serena, C=IN"

# 2. optional: pre-fill a Groq key so in-character bot chat works
echo "gsk_your_key_here" > local.key

# 3. build
bash build.sh ./Chess.apk
```

`local.key` and `release.keystore` are both gitignored and must stay that way.

**About the AI key.** `assets/js/chat.js` ships a `__GROQ_KEY__` placeholder.
`build.sh` substitutes the real key from `local.key` into a staged copy at
build time, so a working key reaches the APK without ever entering the
repository. Anything embedded in an APK is extractable in seconds, so treat
any key you ship as public. Users can paste their own in Settings.

> An APK signed with a different key cannot upgrade an installed one — Android
> will refuse it. Keep your keystore safe; losing it means your users have to
> uninstall before they can update.

## Online play

Two phones cannot find each other on their own, so online play needs a small
relay in the middle. One is included in [`server/`](server): about 250 lines
of Node, one dependency, and it holds no state worth protecting.

It is free to run. **[docs/SELF-HOSTING.md](docs/SELF-HOSTING.md)** walks
through Render, Railway, Fly.io, Docker and a plain VPS, with the exact
commands for each.

Once it is up, put the address into **Settings → Relay server URL** and both
Play Online and Play with Friends start working. Until then the app says so
plainly rather than pretending to connect.

Everything else in the app works with no server at all.

## Project layout

```
assets/
  index.html          14 screens, 30 inline SVG symbols
  css/style.css       all styling, themes as CSS custom properties
  js/
    engine.js         0x88 move generation and rules, perft-verified
    ai.js             negamax, alpha-beta, TT, quiescence, LMR, null-move
    human.js          the adjustable human opponent
    bots.js           the 60-character roster
    openings.js       35 book lines across 6 style pools
    review.js         move classification, accuracy, opening naming
    online.js         relay client with auto-reconnect
    ui.js             board rendering, animation, arrows, square marks
    app.js            screens, state, settings, glue
    chat.js           Groq client for in-character bot chat
server/               the WebSocket relay, Dockerfile and render.yaml
tests/                node test scripts, no framework
java/                 the single Activity and the share bridge
res/                  launcher icons and the manifest's resources
build.sh              aapt2 -> javac -> d8 -> zipalign -> apksigner
```

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains why it is a WebView app
and how the pieces fit together.

## Testing

No framework — each file is a plain Node script that exits non-zero on
failure. CI runs all of them on every push.

```bash
npm install --no-save jsdom     # only app_test.js needs it

node tests/book_test.js         # every book line is legal
node tests/style_test.js        # perft + all 60 bots + style separation
node tests/review_test.js       # classification and accuracy
node tests/human_test.js        # human opponent calibration
node tests/app_test.js          # the app itself, driven through jsdom
node tests/human_calib.js       # slow: full ACPL sweep by rating
```

`style_test.js` runs `perft(5)` from the start position and asserts exactly
**4,865,609** nodes. If you touch move generation, that number is the first
thing to check.

## Contributing

Pull requests are welcome, including large ones.
[CONTRIBUTING.md](CONTRIBUTING.md) covers the house style, what the tests
expect, and the one hard rule: **the in-app credits and the copyright headers
stay**. Everything else is open to change.

## Licence

[Apache License 2.0](LICENSE) — fork it, modify it, ship it, sell it.

Section 4(d) requires that the attribution notices in [NOTICE](NOTICE) survive
into anything you redistribute, which for this project means keeping the
credits screen reachable and the file headers intact. See [NOTICE](NOTICE) for
what that means in practice.

---

<div align="center">

Built by **@TechnicalSerena** · with **@XioquiXin**

</div>
