# Contributing

Pull requests are welcome, including large ones. This file covers what the
project expects so your PR does not bounce on something avoidable.

## The one hard rule

**Attribution stays.** Specifically:

- The in-app credits screen (Settings → About) stays reachable in any build
  you redistribute.
- The copyright headers at the top of source files stay.
- [`NOTICE`](NOTICE) stays in your fork.

This is not a preference, it is Apache 2.0 sections 4(c) and 4(d). Fork it,
sell it, rename it, strip out half the features — all fine. Removing the
author is not.

Everything else in this document is ordinary engineering guidance.

## Getting set up

```bash
git clone https://github.com/botstelegram7-cmyk/serena-chess.git
cd serena-chess
npm install --no-save jsdom
node tests/app_test.js            # should print ALL CHECKS PASSED
```

You do not need an Android toolchain to work on the engine, the AI, the
review logic or the UI — it is all plain JavaScript running in Node or a
browser. Open `assets/index.html` directly in a desktop browser and most of
the app works, minus the Android share bridge and notifications.

To build an actual APK, see [Building from source](README.md#building-from-source).

## Running the tests

| Script | Covers | Run it when |
|---|---|---|
| `tests/book_test.js` | every opening line is legal | you touch `openings.js` |
| `tests/style_test.js` | perft(5), all 60 bots, style separation | **any** engine, AI or bot change |
| `tests/review_test.js` | move classification, accuracy maths | you touch `review.js` |
| `tests/human_test.js` | the human opponent's calibration | you touch `human.js` |
| `tests/app_test.js` | the app end to end, through jsdom | almost anything |
| `tests/human_calib.js` | full ACPL sweep — slow, minutes | you change the human curves |

`style_test.js` asserts `perft(5) == 4865609` from the start position. If that
number moves, move generation is broken; nothing else matters until it is
back.

There is no test framework on purpose. Each file is a plain script that prints
its results and exits non-zero on failure. Add assertions in the same style.

## House style

**JavaScript.** ES5-compatible syntax in `assets/js/` — the app targets
Android 5 WebViews, which predate a lot of ES6. No build step, no transpiler,
no bundler. Two-space indent. `var`, not `let`/`const`, in the shipped
modules. Test scripts run in modern Node and may use whatever they like.

**Modules.** Every file in `assets/js/` is an IIFE that hangs one object off
the global and also supports `module.exports`, so the same file works in the
app and in a Node test. Follow the existing pattern.

> `app.js`'s IIFE takes no `root` parameter. Inside it, reach globals as
> `window.X`. This has caught people out before.

**CSS.** One stylesheet. Themes are CSS custom properties — do not hardcode a
colour that should follow the theme. The inverse is also true: hint marks and
other overlays are deliberately *not* theme-derived, because a green hint on
the green board was invisible. If something must stay readable on every
theme, give it a fixed colour and a contrasting outline.

**No emoji in the interface.** Every icon is an inline SVG symbol in
`index.html`. This is a deliberate product decision.

**Strings.** Sentence case. No exclamation marks. Say "Undo", not "Take back".

## Things worth knowing before you change them

- **`Board.prototype.render()` assigns `className` wholesale.** Any class you
  add from outside is wiped on the next render. Persistent square decorations
  have to be stored on the board object and merged inside the render loop —
  see `markSquare` / `this.marks`.
- **Moves are applied through a serialising queue.** `animateMove` finishes
  via a 170 ms timeout, so two moves arriving inside that window used to reach
  `makeMove()` out of order. Remote moves are resolved against the position at
  apply time, not arrival time. Do not bypass the queue.
- **Mate scores must be clamped before they reach centipawn arithmetic.**
  A leaked mate score produces an accuracy of -100000.
- **The engine is 0x88.** Squares are not 0–63. Use `E.algebraic`,
  `E.rankOf`, `E.fileOf` rather than arithmetic you worked out by hand.

## Adding a character

Add an entry to the `BOTS` array in `assets/js/bots.js` and a 220×220 JPEG to
`assets/avatars/`. Keep the roster sorted by Elo — `style_test.js` checks it.
The `style` weights are what make a bot distinct; copying another bot's
weights and changing only the depth produces a character nobody can tell
apart, and the test for style separation will say so.

Characters are affectionate nods to popular series. The artwork must be
original stylised illustration, not a traced likeness and not official art.

## Commit and PR

Write commit subjects in the imperative, under about 70 characters:

```
add a loss ceiling to the human opponent
fix hint ring invisible on the green board
```

Fill in the PR template. Say what you ran. If you changed the engine, paste
the perft line.

## Security

Never commit `local.key`, `release.keystore`, or any token. CI fails the build
if it finds one, but do not rely on that. For vulnerabilities see
[SECURITY.md](SECURITY.md) — report privately, not as a public issue.
