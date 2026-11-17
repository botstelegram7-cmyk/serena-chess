/* Android WebView touch-routing regression checks. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'assets', 'js', 'app.js');
const htmlPath = path.join(__dirname, '..', 'assets', 'index.html');
const cssPath = path.join(__dirname, '..', 'assets', 'css', 'style.css');
const app = fs.readFileSync(appPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

assert(app.includes("document.addEventListener('touchstart'"), 'tap tracking must start on touchstart');
assert(app.includes("document.addEventListener('touchend'"), 'touchend must replay a tap as a click');
assert(app.includes("e.target.closest('#board, #puzzle-board')"), 'touch replay must leave chessboard gestures alone');
assert(app.includes("Object.defineProperty(click, '__touchReplay'"), 'replayed clicks must be identified');
assert(app.includes("!e.__touchReplay && Date.now() - lastTouchActionAt < 750"), 'native click after replay must be suppressed');
assert(app.includes("e.target.closest('input, textarea, select, [contenteditable=\"true\"]')"), 'form fields must retain native focus and keyboard behaviour');
assert(!/\sontouchend\s*=/.test(html), 'empty inline touch handlers must not interfere with native input');
assert(!/\sonclick\s*=/.test(html), 'routing should have one delegated click path, not duplicate inline handlers');
assert(!html.includes('Touch fix for Android WebView'), 'obsolete inline touch workaround must not duplicate the shared click route');
assert(css.includes('touch-action: manipulation'), 'interactive controls should use responsive tap behaviour');
assert(app.includes("if (!profile.equipped) profile.equipped = { board: 'classic', piece: 'classic', avatar: 'default' };"), 'equipped avatar fallback must stay a string');
console.log('Android WebView touch-routing checks passed (unified tap replay, board-safe).');
