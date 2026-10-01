# Architecture

## Why a WebView app

A chess app is mostly interface: screens, lists, sheets, themes, animation.
Native Android gives you very little help with that and charges a lot for it
— a Gradle project, a build toolchain, an IDE, and a rebuild cycle measured
in tens of seconds.

The parts that actually need performance are move generation and search, and
those are pure arithmetic on typed arrays. A modern WebView JIT runs that
within a small factor of native, which costs perhaps one ply of depth at the
top ratings and nothing at all anywhere else.

So the whole app is one `WebView` pointed at `file:///android_asset/index.html`.
The trade is deliberate: a slightly weaker engine ceiling in exchange for a
six-second build, a 1.5 MB APK, no dependencies, and a codebase that also
runs in a desktop browser and in Node for testing.

The native side is about 60 lines: one Activity, and a JavaScript bridge for
the Android share sheet.

## Build pipeline

`build.sh` does the whole thing without Gradle:

```
assets/ ──► staged copy ──► key injection (__GROQ_KEY__ ◄── local.key)
                                 │
res/ ──► aapt2 compile ──► aapt2 link ──► resources.apk
                                 │
java/ ──► javac ──► d8 ──► classes.dex
                                 │
                          zip ──► zipalign ──► apksigner ──► Chess.apk
```

Key injection happens on a staged copy, never in the working tree, so the
repository cannot accidentally gain a credential.

## Module graph

Each file in `assets/js/` is an IIFE that exports one object both as a global
and through `module.exports`, so every module loads unchanged in the app, in
a browser, and in a Node test.

```
engine.js      no dependencies
  ├── ai.js            needs engine, openings
  │     ├── human.js   needs engine, ai, openings
  │     └── bots.js    data only
  ├── review.js        needs engine, ai
  ├── ui.js            needs engine
  ├── online.js        no dependencies (WebSocket client)
  ├── chat.js          no dependencies (fetch client)
  └── app.js           needs all of the above
```

`app.js` is the only file that touches the DOM for application state. `ui.js`
owns the board surface and nothing else.

## The engine

`engine.js` is a 0x88 board. Squares are indices into a 128-entry array where
the high nibble is the rank and the low nibble the file, so `sq & 0x88`
tests off-board in one operation. That is the whole reason for the layout.

- Move generation is fully legal, not pseudo-legal plus filtering.
- Zobrist hashing from a seeded PRNG, so hashes are stable across runs.
- `perft(5)` from the start position is asserted at **4,865,609** nodes in
  `tests/style_test.js`. Any change to move generation is checked against
  that number first.

`ai.js` is negamax with alpha-beta, plus the usual furniture: a transposition
table, quiescence search, late move reductions, null-move pruning, killer and
history heuristics, and a tapered piece-square evaluation that blends
midgame and endgame tables by remaining material.

What makes the bots distinct is that evaluation is **weighted per bot**. Each
character supplies multipliers for material, king attack, centre, pawn
structure, passed pawns, rooks, bishops, king safety, aggression and trading.
Two bots at the same depth with different weights produce visibly different
games, which is the thing a plain depth ladder cannot do.

## The human opponent

`human.js` does not reuse the bot machinery, because weakening an engine does
not produce human play. See
[the README section](../README.md#the-adjustable-human-opponent) for the
model. The short version: a rating-dependent search horizon, an attention
weighting over candidate moves, softmax sampling, and a separate error
ceiling so that typical accuracy and blunder frequency can be tuned
independently.

## State and persistence

Everything is `localStorage`, under five keys:

| Key | Holds |
|---|---|
| `chess.profile` | name, colour, rating |
| `chess.settings` | every preference |
| `chess.stats` | wins, losses, draws, best win |
| `chess.archive` | the last 40 finished games |
| `chess.game` | the one resumable game in progress |

No accounts, no sync, no server-side anything.

## The move queue

Moves are applied through a serialising queue. `animateMove` completes via a
170 ms timeout, so before the queue existed, two moves arriving inside that
window could reach `makeMove()` in the wrong order — reproducible in online
play with a fast opponent, and it corrupted the position.

Queue entries are either a resolved move object or a description
(`{san, from, to, promo}`). Descriptions are resolved against the position at
the moment they are applied, never at the moment they arrived.

## Online play

`online.js` is a thin WebSocket client with automatic reconnect and backoff
capped at 20 seconds. The server relays; it does not adjudicate. Each client
runs its own copy of the rules and rejects anything illegal, so a malicious
peer cannot force an illegal position — it can only disconnect itself.

Protocol, client to server:

```
hello{name,rating}  create{tc}  join{code}  queue{tc}  cancel
move{san,from,to,promo,ms}  chat{text}  resign  draw
drawAccept  drawDecline  flag{color}  rematch  rematchOk  leave  ping{ts}
```

Server to client adds `welcome`, `created{code}`, `queued{waiting}`,
`start{code,color,tc,opp}`, `oppLeft{permanent}`, `roomClosed`,
`error{code,msg}`, `pong{ts}`.

Invite codes are six characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` —
no I, O, 0 or 1, because they get misread aloud. Displayed as `ABC-123`,
accepted in any case with or without the dash.

## Review

`review.js` walks the finished game, searching each position, and classifies
each move by centipawn loss with special cases for book moves, only-moves and
sacrifices:

| Class | Condition |
|---|---|
| Book | still inside the opening table |
| Brilliant | loss ≤ 15, sacrifice ≥ 200, position still ≥ -120 |
| Great | loss ≤ 15 and it was the only move |
| Best / Excellent / Good | loss ≤ 12 / 45 / 95 |
| Inaccuracy / Mistake / Blunder | loss ≤ 190 / ≤ 380 / above |

Accuracy per side is `103.1668·exp(-0.04354·drop) - 3.1669`, and win
probability is `1/(1+exp(-0.00368208·cp))`.

Mate scores are clamped to ±2000 before any of this. An unclamped mate score
leaking into the centipawn arithmetic produced accuracies like -100000, which
is how the clamp came to exist.
