/* Explicit VPS Stockfish client behaviour and URL normalisation. */
'use strict';
const assert = require('assert');

let next = { status: 200, body: { ok: true, stockfish: false } };
class FakeXHR {
  open(method, url) { this.method = method; this.url = url; }
  setRequestHeader() {}
  abort() {}
  send() {
    const response = next;
    setTimeout(() => {
      this.status = response.status;
      this.responseText = JSON.stringify(response.body);
      if (this.onload) this.onload();
    }, 0);
  }
}
global.XMLHttpRequest = FakeXHR;
const Hybrid = require('../assets/js/hybrid.js');

(async () => {
  Hybrid.configure('wss://chess.example.test/');
  assert.strictEqual(Hybrid.httpBase('wss://chess.example.test/'), 'https://chess.example.test');
  assert.strictEqual(Hybrid.httpBase('ws://localhost:8080/'), 'http://localhost:8080');
  assert.strictEqual(Hybrid.configured(), true);

  let health = await new Promise(resolve => Hybrid.checkHealth((err, value) => resolve({ err, value })));
  assert.strictEqual(health.err, null);
  assert.strictEqual(health.value.stockfish, false);
  assert.strictEqual(Hybrid.isOnline(), true);
  assert.strictEqual(Hybrid.isServerReachable(), true);
  assert.strictEqual(Hybrid.isStockfishAvailable(), false);

  next = { status: 200, body: { ok: true, stockfish: true } };
  health = await new Promise(resolve => Hybrid.checkHealth((err, value) => resolve({ err, value })));
  assert.strictEqual(health.err, null);
  assert.strictEqual(Hybrid.isStockfishAvailable(), true);

  next = { status: 503, body: { error: 'stockfish_missing' } };
  const move = await new Promise(resolve => Hybrid.getStockfishMove('startfen', 'w', (err, value) => resolve({ err, value })));
  assert(move.err, 'strict Stockfish mode must report VPS failures');
  assert.strictEqual(move.err.message, 'stockfish_missing');
  assert.strictEqual(Hybrid.isServerReachable(), true);
  assert.strictEqual(Hybrid.isStockfishAvailable(), false);
  assert.strictEqual(move.value, null, 'strict Stockfish mode must not substitute a local move');
  console.log('Hybrid engine checks passed (wss normalization, health capability, strict VPS errors).');
})().catch(err => { console.error(err); process.exitCode = 1; });
