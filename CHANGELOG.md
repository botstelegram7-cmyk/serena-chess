# Changelog

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
