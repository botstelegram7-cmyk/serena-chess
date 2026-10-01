# Changelog

## 1.8 — 2026-10-01

### Engine and performance
- **The search no longer blocks the interface.** `rootScores` held the thread
  for its entire time budget, so a long think froze the clock, animations and
  input. `rootScoresAsync` slices the same search and yields between slices.
  A Web Worker would be the usual answer, but workers cannot be constructed
  from a `file://` origin and moving the assets to a served origin would
  relocate `localStorage` and wipe every existing player's data. Measured
  steady-state overhead is within noise; the longest uninterrupted block drops
  from the full budget to about 100 ms.
- Searches are now cancellable, and `pickMoveAsync` is guaranteed asynchronous
  even when it finishes inside its first slice.
- Opponents using the human model degrade under time pressure.

### New
- **Your progress** — rating curve, opening scores, puzzle strength by theme,
  and 20 achievements, all derived from data already stored.
- **The climb** — the 60 characters as an unlockable ladder.
- **Rated puzzles** and a deterministic **daily puzzle** with a streak.
- **Account & backup** — export and restore a signed, checksummed JSON file.
- **Haptics**, **launcher shortcuts**, **rating-based online matchmaking**.

### Fixed
- `targetSdk` raised to 35 with window insets handled, so the layout is correct
  on Android 15 and the app is publishable on Google Play.
- The WebView file chooser honoured only `image/*`, so no backup file could
  ever be selected. It now respects the accept types the page asks for.
- The relay enforces message rate limits and a maximum frame size.
- A missing optional script now costs only its own feature instead of
  white-screening the whole app.


## 1.7.1 — 2026-10-01

- **All 60 characters are now illustrated.** Wednesday, Homelander, Gojo,
  Ragnar, Lelouch, Tyrion, Aizen and Mycroft were still rendering as plain
  lettered placeholder tiles; they now have portraits in the same style as
  the rest of the roster.
- `tests/style_test.js` now fails if any character's avatar file is missing
  or is small enough to be a placeholder, so an unreplaced tile cannot ship
  again. Placeholder tiles compress to about 2 KB; the thinnest real
  portrait in the roster is 6 KB, and the threshold sits between them.


## 1.7 — 2026-10-01

- **Profile pictures.** Tap your avatar on the profile screen and choose any
  photo from the device gallery. It is centre-cropped square, resized to
  256px and re-encoded, so a multi-megabyte camera JPEG becomes about 20 KB
  before it is stored. Needed a `WebChromeClient` on the Android side — a
  plain file input does nothing in a WebView without one.
- **Rename yourself with the pencil icon** next to your name, instead of a
  permanently open text field.
- **Removed the avatar colour swatches.** A picture replaces them; without
  one you get your initial on a neutral background.
- **What's new, in the app.** Settings → What's new shows the full history,
  rendered from `assets/js/changelog.js`, and opens itself once after an
  update. A test asserts that `changelog.js`, `CHANGELOG.md` and
  `AndroidManifest.xml` all agree on the version and build number.
- **Fixed the CI failure.** Every test script hardcoded `/home/user/...`
  paths, so the suite only ever ran on the original machine and failed in a
  clean checkout. Everything now resolves relative to the repository, and
  the suite is verified to pass from any working directory.


## 1.6 — 2026-10-01

### The adjustable human opponent
- New **Human** opponent at the top of the opponent grid, with a slider from
  400 to 2800. Strength comes from a rating-dependent search horizon, an
  attention weighting over candidate moves, softmax sampling and a separate
  error ceiling — not from a weakened engine making random bad moves.
- Human pacing: long-tailed thinking time, instant forced recaptures, the
  occasional long stare. Ordinary username, default avatar, no in-character
  chat.
- Measured average centipawn loss by setting: 600 → 162, 1000 → 84,
  1400 → 74, 2200 → 42, 2600 → 22. Reproduce with `tests/human_calib.js`.

### Roster
- **28 new characters**, bringing the roster to 60. The ladder had 150-point
  gaps below 1600; the largest gap is now 50.

### Hints
- **Fixed the invisible hint.** The ring was green and so is the green board,
  so on that theme the hint simply could not be seen. Hint marks now use a
  fixed amber with a dark counter-ring and a translucent fill, independent of
  the board theme, and the arrow is drawn over a dark outline so it reads on
  any square, piece set or background image.
- New **Settings → Hints** control: Highlight, Arrow, or Both.

### Project
- Relicensed to **Apache 2.0** with a `NOTICE` file, so attribution is a
  licence condition rather than a request.
- Added `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, issue and PR
  templates, an `.editorconfig`, and CI that runs every test plus a
  credential scan on each push.
- Added `docs/SELF-HOSTING.md` (Render, Railway, Fly.io, Docker, VPS, LAN,
  plus hosting the app itself as a web build) and `docs/ARCHITECTURE.md`.
- Rewrote the README.


## v1.5 — Analysis you can actually see

### Fixed
- **The game-over card blocked the board.** You could not see your last move or
  study the final position. It now has a close button, dismisses when you tap
  the area around it, and leaves behind a slim strip with the result plus a
  Review button. Move navigation stays fully live underneath, so a finished
  game can be stepped through move by move.
- **Hint gave the answer away in text** ("Try Nf3"). It is now purely visual and
  progressive: the first tap rings the piece you should move, a second tap draws
  the arrow to its destination. Nothing is ever written out. The ring survives
  picking the piece up.
- "You wins" now reads "You win".
- Closing Game Review returns to the board instead of the home screen.

### Added
- **Hints in online games**, off by default under Settings → Online. An engine
  hint against a human is assistance, so when it is on your opponent is told in
  chat each time you use one.

## v1.4 — Online, navigation and review

### Added
- **Move navigation** — `|<` `<` `>` `>|` step through any game; tap a move in
  the bar to jump straight to it. The board is read-only while browsing and a
  pill shows which move you are on, with a one-tap return to live.
- **Play Online** — matchmaking against a random opponent per time control.
- **Play with Friends** — create a 6-character invite code, copy or share it;
  your friend joins with the code. Codes avoid `I`, `O`, `0` and `1` so they
  survive being read out loud.
- **Relay server** (`/server`) — ~250 lines, one dependency, deployable free on
  Render or Fly. Never validates chess, so it cannot be cheated through.
- **Game Review** — engine analysis of every move with chess.com-style labels
  (Brilliant / Great / Best / Excellent / Good / Book / Inaccuracy / Mistake /
  Blunder), accuracy per side, an evaluation graph and a move breakdown.
- **Player rating** — a real Elo that moves with your results, with a larger
  K-factor for your first 15 games.
- **My Games** — the last 40 games are archived and can be reviewed later.
- **PGN export** — copy or share, with correct tags and the opening name.
- **Opening names** — 72 openings recognised by longest matching prefix.
- **Redesigned home screen** — profile bar with live rating, a resume card,
  four large mode cards, a training row and your record.
- Android share-sheet and clipboard bridges.

### Fixed
- **Move ordering race.** Moves applied while the board animation was still
  running could reach `makeMove()` out of order and corrupt the game. Harmless
  against a bot, but online an opponent's move can arrive at any moment. Moves
  now go through a serialising queue, and a remote move is resolved against the
  position at the moment it is applied rather than when it arrived.
- Book detection in analysis matched any prefix, so whole games were labelled
  "Book". It now uses the length of the longest matching opening line.
- Mate scores leaked into centipawn loss, showing `-100019` instead of a
  blunder. Clamped, with mate distance reported separately.

### Changed
- **No API key in source control.** `chat.js` ships a `__GROQ_KEY__`
  placeholder; `build.sh` substitutes `local.key` (gitignored) at build time.
- `release.keystore` is no longer tracked.

## v1.3 — More bots, real playing styles
- Roster grew from 20 to 32, up to 3200.
- Style-weighted evaluation: ten per-bot multipliers covering king attack,
  centre, pawn structure, passers, rook files, king safety, aggression, trade.
- Opening book with six style pools; each bot plays its own repertoire.

## v1.2 and earlier
- Rules engine, bots, puzzles, drills, themes, sounds, clocks, chat,
  notifications.
