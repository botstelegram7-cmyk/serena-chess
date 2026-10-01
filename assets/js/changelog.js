/* =========================================================================
   changelog.js — what shipped when, shown in-app under Settings -> What's new
   Mirrors CHANGELOG.md. Newest first. Keep the two in step.
   ========================================================================= */
(function (root) {
  'use strict';

  var VERSION = '1.8';
  var BUILD = 10;

  var LOG = [
    { v: '1.8', date: '2026-10-01', title: 'Progress, backups and a smoother board',
      items: [
        ['fix', 'Bots no longer freeze the app while they think. The engine now hands control back between slices of its search, so the clock keeps ticking, animations keep running and taps keep landing even during a long think.'],
        ['new', 'Your progress: a rating curve, which openings you actually score with, your puzzle strength broken down by theme, and twenty achievements.'],
        ['new', 'The climb. All sixty characters as a ladder from 250 to 3200. Beat one to unlock the next; losing never costs you a rung.'],
        ['new', 'Puzzles are now rated. Every attempt moves a puzzle rating, tracked per theme, and only your first miss on a puzzle counts.'],
        ['new', 'A daily puzzle, the same one for everyone, with a streak.'],
        ['new', 'Account and backup. Export everything to a file and restore it on another phone. Android also backs the app up to your Google account automatically.'],
        ['new', 'Vibration feedback on moves, captures and checks. Turn it off in Settings.'],
        ['new', 'Long-press the app icon to jump straight to the daily puzzle or your game.'],
        ['new', 'Online matchmaking now pairs you by rating, widening the search the longer you wait, rather than taking whoever is first in the queue.'],
        ['fix', 'Android 15 support. The board no longer risks sliding under the status bar or the navigation bar.'],
        ['fix', 'Choosing a file now offers the right kind of file. The picker was locked to images, so a backup could never be selected.'],
        ['note', 'Opponents using the human model now play worse under time pressure, as people do.']
      ] },

    { v: '1.7.1', date: '2026-10-01', title: 'All 60 characters illustrated',
      items: [
        ['fix', 'Eight characters were still showing a plain lettered tile instead of a portrait. Wednesday, Homelander, Gojo, Ragnar, Lelouch, Tyrion, Aizen and Mycroft now have their artwork, so every one of the 60 opponents is illustrated.'],
        ['note', 'The test suite now refuses to build if any character avatar is missing or is still a placeholder, so this cannot happen again unnoticed.']
      ] },

    { v: '1.7', date: '2026-10-01', title: 'Your profile, your face',
      items: [
        ['new', 'Set a profile picture from your gallery. Tap your avatar on the profile screen and pick any photo; it is cropped square, resized and stored on the device.'],
        ['new', 'Rename yourself with the pencil icon next to your name.'],
        ['new', 'This screen. Settings now shows the version and the full history of what changed.'],
        ['gone', 'The avatar colour swatches. A picture replaces them.'],
        ['fix', 'The test suite used absolute paths, so it only ran on one machine and the CI build failed. Everything now resolves relative to the repository.']
      ] },

    { v: '1.6', date: '2026-10-01', title: 'The adjustable human opponent',
      items: [
        ['new', 'A Human opponent with a slider from 400 to 2800 Elo. Strength comes from a rating-dependent calculating horizon, an attention bias toward moves people actually notice, and a separate error ceiling, so the mistakes have a human shape rather than being random.'],
        ['new', '28 more characters, bringing the roster to 60. The largest gap in the ladder drops from 150 Elo to 50.'],
        ['fix', 'The hint ring was green, and so is the green board, so on that theme it could not be seen at all. Hints now use a fixed amber with a dark counter-ring, independent of the board theme.'],
        ['new', 'Settings now lets you choose whether a hint shows a highlight, an arrow, or both.'],
        ['new', 'The project moved to the Apache 2.0 licence, with contributing, security and self-hosting documentation.']
      ] },

    { v: '1.5', date: '2026-09-30', title: 'Reading the finished game',
      items: [
        ['fix', 'The game-over card covered the board and could not be dismissed. It now closes, leaving a slim result strip, and move navigation keeps working underneath.'],
        ['fix', 'Hints are shown on the board instead of being written out as text. First tap rings the piece, second tap draws the arrow.'],
        ['new', 'Hints can be enabled in online games. Off by default, and your opponent is told when you use one.'],
        ['fix', '"You wins" now reads "You win".']
      ] },

    { v: '1.4', date: '2026-09-29', title: 'Online play and review',
      items: [
        ['new', 'Play Online with matchmaking, and Play with Friends using six-character invite codes.'],
        ['new', 'Move navigation. Step through any game, or tap a move to jump to it.'],
        ['new', 'Game Review: every move classified, per-side accuracy, an evaluation graph and PGN export.'],
        ['new', 'A redesigned home screen and a 40-game archive.']
      ] },

    { v: '1.3', date: '2026-09-28', title: 'Characters with opinions',
      items: [
        ['new', 'Every bot got its own evaluation weights and opening repertoire, so they want different things on the board instead of sharing one brain at different depths.'],
        ['new', 'More high-rated opponents, and playing-style tags on every card.']
      ] },

    { v: '1.2', date: '2026-09-27', title: 'Puzzles and practice',
      items: [
        ['new', '140 tactics puzzles and 12 endgame drills.'],
        ['new', 'Chess clocks and the full set of time controls.']
      ] },

    { v: '1.0', date: '2026-09-26', title: 'First release',
      items: [
        ['new', 'The engine, the board, Play vs Bot and Pass & Play, themes, piece sets and sounds.']
      ] }
  ];

  var API = { VERSION: VERSION, BUILD: BUILD, LOG: LOG };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessChangelog = API;

})(typeof globalThis !== 'undefined' ? globalThis : this);
