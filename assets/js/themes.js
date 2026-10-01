/* =========================================================================
   themes.js — the full appearance catalogue
     · 32 piece sets      · 24 board styles
     · 26 backgrounds     · 10 sound themes
     · 12 preset themes that bind them together
   ========================================================================= */
(function (root) {
  'use strict';

  /* ─────────────────────────────────────────────────── piece sets ─── */
  /* id = folder under assets/pieces/ */
  var PIECES = [
    { id: 'neo',        name: 'Neo' },
    { id: 'neo-angle',  name: 'Neo Angle' },
    { id: 'classic',    name: 'Classic' },
    { id: 'wood',       name: 'Wood' },
    { id: 'glass',      name: 'Glass' },
    { id: 'gothic',     name: 'Gothic' },
    { id: 'metal',      name: 'Metal' },
    { id: 'bases',      name: 'Bases' },
    { id: 'neo-wood',   name: 'Neo-Wood' },
    { id: 'book',       name: 'Book' },
    { id: 'alpha',      name: 'Alpha' },
    { id: 'bubblegum',  name: 'Bubblegum' },
    { id: 'dash',       name: 'Dash' },
    { id: 'graffiti',   name: 'Graffiti' },
    { id: 'light',      name: 'Light' },
    { id: 'lolz',       name: 'Lolz' },
    { id: 'luca',       name: 'Luca' },
    { id: 'maya',       name: 'Maya' },
    { id: 'modern',     name: 'Modern' },
    { id: 'nature',     name: 'Nature' },
    { id: 'neon',       name: 'Neon' },
    { id: 'sky',        name: 'Sky' },
    { id: 'tigers',     name: 'Tigers' },
    { id: 'tournament', name: 'Tournament' },
    { id: 'vintage',    name: 'Vintage' },
    { id: 'real3d',     name: 'Real 3D' },
    { id: 'staunton3d', name: '3D Staunton' },
    { id: 'plastic3d',  name: '3D Plastic' },
    { id: 'gameroom',   name: 'Game Room' },
    { id: 'bandclass',  name: 'Band Class' },
    { id: 'merida',     name: 'Merida' },
    { id: 'maestro',    name: 'Maestro' }
  ];

  /* ─────────────────────────────────────────────────── board styles ─── */
  var BOARDS = [
    { id: 'green',      name: 'Green',       light: '#ebecd0', dark: '#739552' },
    { id: 'brown',      name: 'Brown',       light: '#f0d9b5', dark: '#b58863' },
    { id: 'blue',       name: 'Blue',        light: '#dee3e6', dark: '#8ca2ad' },
    { id: 'pink',       name: 'Pink',        light: '#f6dfe4', dark: '#d087a0' },
    { id: 'walnut',     name: 'Red / Walnut',light: '#f0d8c0', dark: '#a6533a' },
    { id: 'wood',       name: 'Wood',        light: '#e3c088', dark: '#9c6b3f' },
    { id: 'glass',      name: 'Glass',       light: '#e8eef2', dark: '#9bb8c9' },
    { id: 'icysea',     name: 'Icy Sea',     light: '#e0e7ef', dark: '#7a9cc6' },
    { id: 'newspaper',  name: 'Newspaper',   light: '#e8e6e1', dark: '#a8a49c' },
    { id: 'sand',       name: 'Sand',        light: '#efe2c6', dark: '#c2a878' },
    { id: 'tan',        name: 'Tan',         light: '#eadbc0', dark: '#b99b6b' },
    { id: 'classic',    name: 'Classic',     light: '#eeeed2', dark: '#769656' },
    { id: 'neon',       name: 'Neon',        light: '#1d3b3a', dark: '#0d9c86' },
    { id: 'sky',        name: 'Sky',         light: '#e6f0f7', dark: '#7fa7c7' },
    { id: 'nature',     name: 'Nature',      light: '#e9edc9', dark: '#6a8e4e' },
    { id: 'gameroom',   name: 'Game Room',   light: '#e5d6c3', dark: '#8c6a4a' },
    { id: 'tournament', name: 'Tournament',  light: '#eeeed2', dark: '#4b7399' },
    { id: 'gothic',     name: 'Gothic',      light: '#cfc7bb', dark: '#5a5048' },
    { id: 'marble',     name: 'Marble',      light: '#ece9e2', dark: '#9a9187' },
    { id: 'metal',      name: 'Metal',       light: '#dfe2e5', dark: '#8e969e' },
    { id: 'bases',      name: 'Bases',       light: '#e6e2d3', dark: '#7d8a6a' },
    { id: 'ocean',      name: 'Ocean',       light: '#dbe9f4', dark: '#4f7fa8' },
    { id: 'light',      name: 'Light',       light: '#f6f6f6', dark: '#c6c6c6' },
    { id: 'darkwood',   name: 'Dark Wood',   light: '#b98863', dark: '#6b4226' }
  ];

  /* ────────────────────────────────────────────────── backgrounds ─── */
  /* css = value for `background`; dim = colour for panels on top of it */
  var BACKGROUNDS = [
    { id: '8bit',       name: '8-Bit',      css: 'repeating-conic-gradient(#1b1f3b 0% 25%, #232a52 0% 50%) 0 0/28px 28px' },
    { id: 'bases',      name: 'Bases',      css: 'linear-gradient(160deg,#3a4433,#232a20)' },
    { id: 'blues',      name: 'Blues',      css: 'linear-gradient(160deg,#16324f,#0d1f33)' },
    { id: 'bubblegum',  name: 'Bubblegum',  css: 'linear-gradient(160deg,#5c2a3e,#33182a)' },
    { id: 'classic',    name: 'Classic',    css: 'linear-gradient(160deg,#3a3734,#262522)' },
    { id: 'cosmos',     name: 'Cosmos',     css: 'radial-gradient(120% 90% at 20% 0%,#2b2050 0%,#120e26 60%,#08060f 100%)' },
    { id: 'dash',       name: 'Dash',       css: 'repeating-linear-gradient(45deg,#2c2f36 0 14px,#33373f 14px 28px)' },
    { id: 'gameroom',   name: 'Game Room',  css: 'linear-gradient(160deg,#4a3826,#291d13)' },
    { id: 'glass',      name: 'Glass',      css: 'linear-gradient(160deg,#2a3b45,#16222a)' },
    { id: 'gothic',     name: 'Gothic',     css: 'linear-gradient(160deg,#2c2724,#14110f)' },
    { id: 'graffiti',   name: 'Graffiti',   css: 'linear-gradient(135deg,#3b1f4d,#1d2a4d 50%,#123b3b)' },
    { id: 'icysea',     name: 'Icy Sea',    css: 'linear-gradient(160deg,#27455e,#13212e)' },
    { id: 'light',      name: 'Light',      css: 'linear-gradient(160deg,#e9e9ea,#cfd0d2)', light: true },
    { id: 'lolz',       name: 'Lolz',       css: 'linear-gradient(160deg,#4d3b16,#2a2109)' },
    { id: 'marble',     name: 'Marble',     css: 'linear-gradient(160deg,#42403c,#26241f)' },
    { id: 'metal',      name: 'Metal',      css: 'linear-gradient(160deg,#3c4248,#1e2226)' },
    { id: 'nature',     name: 'Nature',     css: 'linear-gradient(160deg,#2f4326,#182313)' },
    { id: 'neon',       name: 'Neon',       css: 'radial-gradient(110% 80% at 50% 0%,#0d3b38 0%,#07201f 55%,#04100f 100%)' },
    { id: 'newspaper',  name: 'Newspaper',  css: 'linear-gradient(160deg,#dedbd4,#bdb9b0)', light: true },
    { id: 'ocean',      name: 'Ocean',      css: 'linear-gradient(160deg,#123a52,#06202f)' },
    { id: 'sky',        name: 'Sky',        css: 'linear-gradient(160deg,#2b4f6e,#16293a)' },
    { id: 'staunton',   name: 'Staunton',   css: 'linear-gradient(160deg,#39332c,#1f1b16)' },
    { id: 'tigers',     name: 'Tigers',     css: 'linear-gradient(160deg,#4d3210,#241706)' },
    { id: 'tournament', name: 'Tournament', css: 'linear-gradient(160deg,#25384a,#121c26)' },
    { id: 'walnut',     name: 'Walnut',     css: 'linear-gradient(160deg,#402a1c,#20140d)' },
    { id: 'wood',       name: 'Wood',       css: 'linear-gradient(160deg,#4a3524,#2a1d12)' }
  ];

  /* ───────────────────────────────────────────────── sound themes ─── */
  /* 'default' is the user-supplied pack (numbered clips), the rest are
     synthesised and use event-named files. 'silent' plays nothing.        */
  var SOUNDS = [
    { id: 'default',    name: 'Default',    numbered: true },
    { id: 'standard',   name: 'Standard' },
    { id: 'wood',       name: 'Wood' },
    { id: 'metal',      name: 'Metal' },
    { id: 'marble',     name: 'Marble' },
    { id: 'bubble',     name: 'Bubble' },
    { id: 'futuristic', name: 'Futuristic' },
    { id: 'arcade',     name: 'Arcade' },
    { id: 'robot',      name: 'Robot' },
    { id: 'silent',     name: 'Silent',     silent: true }
  ];

  /* ─────────────────────────────────────────────────────── presets ─── */
  var PRESETS = [
    { id: 'classic',   name: 'Classic',    board: 'classic',    piece: 'classic',    bg: 'classic',    sound: 'default' },
    { id: 'wooden',    name: 'Wooden',     board: 'wood',       piece: 'wood',       bg: 'wood',       sound: 'wood' },
    { id: 'neon',      name: 'Neon',       board: 'neon',       piece: 'neon',       bg: 'neon',       sound: 'futuristic' },
    { id: 'glass',     name: 'Glass',      board: 'glass',      piece: 'glass',      bg: 'glass',      sound: 'marble' },
    { id: 'nature',    name: 'Nature',     board: 'nature',     piece: 'nature',     bg: 'nature',     sound: 'bubble' },
    { id: 'ocean',     name: 'Ocean',      board: 'ocean',      piece: 'sky',        bg: 'ocean',      sound: 'bubble' },
    { id: 'gothic',    name: 'Gothic',     board: 'gothic',     piece: 'gothic',     bg: 'gothic',     sound: 'metal' },
    { id: 'three-d',   name: '3D',         board: 'darkwood',   piece: 'real3d',     bg: 'staunton',   sound: 'wood' },
    { id: 'tournament',name: 'Tournament', board: 'tournament', piece: 'tournament', bg: 'tournament', sound: 'standard' },
    { id: 'metal',     name: 'Metal',      board: 'metal',      piece: 'metal',      bg: 'metal',      sound: 'metal' },
    { id: 'bubblegum', name: 'Bubblegum',  board: 'pink',       piece: 'bubblegum',  bg: 'bubblegum',  sound: 'bubble' },
    { id: 'arcade',    name: '8-Bit',      board: 'neon',       piece: 'neon',       bg: '8bit',       sound: 'arcade' }
  ];

  /* ──────────────────────────────────────────────── time controls ─── */
  var TIME_CONTROLS = [
    { id: 'unlimited', group: 'Unlimited', name: 'Unlimited', mins: 0,  inc: 0 },
    { id: '1+0',   group: 'Bullet',    name: '1 min',       mins: 1,  inc: 0 },
    { id: '2+1',   group: 'Bullet',    name: '2 | 1',       mins: 2,  inc: 1 },
    { id: '3+0',   group: 'Blitz',     name: '3 min',       mins: 3,  inc: 0 },
    { id: '3+2',   group: 'Blitz',     name: '3 | 2',       mins: 3,  inc: 2 },
    { id: '5+0',   group: 'Blitz',     name: '5 min',       mins: 5,  inc: 0 },
    { id: '10+0',  group: 'Rapid',     name: '10 min',      mins: 10, inc: 0 },
    { id: '15+10', group: 'Rapid',     name: '15 | 10',     mins: 15, inc: 10 },
    { id: '30+0',  group: 'Classical', name: '30 min',      mins: 30, inc: 0 },
    { id: '60+0',  group: 'Classical', name: '1 hour',      mins: 60, inc: 0 }
  ];

  function find(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  var API = {
    PIECES: PIECES, BOARDS: BOARDS, BACKGROUNDS: BACKGROUNDS,
    SOUNDS: SOUNDS, PRESETS: PRESETS, TIME_CONTROLS: TIME_CONTROLS,
    piece: function (id) { return find(PIECES, id); },
    board: function (id) { return find(BOARDS, id); },
    background: function (id) { return find(BACKGROUNDS, id); },
    sound: function (id) { return find(SOUNDS, id); },
    preset: function (id) { return find(PRESETS, id); },
    timeControl: function (id) { return find(TIME_CONTROLS, id); }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ChessThemes = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
