# Tests

Plain Node scripts — no test framework, no CI required.

```bash
node tests/book_test.js      # every opening-book line is legal (35 lines, 270 plies)
node tests/style_test.js     # perft(5) regression + bots really do play differently
node tests/review_test.js    # history navigation, move classification, PGN
npm i jsdom && node tests/app_test.js   # full UI integration in a headless DOM
```

`app_test.js` boots the real `index.html` with all eleven scripts in jsdom and
drives the actual code paths: move navigation, the move queue under a race,
rating changes, the archive, PGN and the online client's URL handling.
