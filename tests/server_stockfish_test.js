/* VPS relay integration test using a tiny fake UCI engine. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serena-stockfish-'));
  const fake = path.join(dir, 'stockfish');
  fs.writeFileSync(fake, [
    '#!/bin/sh',
    'while IFS= read -r line; do',
    '  case "$line" in',
    '    uci) printf "id name test-engine\\nuciok\\n" ;;',
    '    isready) printf "readyok\\n" ;;',
    '    go*) printf "info depth 1 score cp 0\\nbestmove e2e4\\n" ;;',
    '    quit) exit 0 ;;',
    '  esac',
    'done',
    ''
  ].join('\n'));
  fs.chmodSync(fake, 0o755);

  const port = await freePort();
  const serverPath = path.join(__dirname, '..', 'server', 'index.js');
  const proc = spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: Object.assign({}, process.env, { PORT: String(port), STOCKFISH_BIN: fake }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  proc.stdout.on('data', d => { logs += d.toString(); });
  proc.stderr.on('data', d => { logs += d.toString(); });
  const base = 'http://127.0.0.1:' + port;

  try {
    let health = null;
    for (let i = 0; i < 80 && !health; i++) {
      try {
        const r = await fetch(base + '/health');
        if (r.ok) health = await r.json();
      } catch (_) {}
      if (!health) await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(health && health.stockfish === true, 'UCI probe must advertise Stockfish ready: ' + logs);

    const preflight = await fetch(base + '/stockfish', {
      method: 'OPTIONS',
      headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' }
    });
    assert.strictEqual(preflight.status, 204);
    assert(/content-type/i.test(preflight.headers.get('access-control-allow-headers') || ''));

    const result = await fetch(base + '/stockfish', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', color: 'w' })
    });
    const move = await result.json();
    assert.strictEqual(result.status, 200);
    assert.strictEqual(move.bestmove, 'e2e4');
    console.log('Server Stockfish integration passed (readiness, CORS, UCI bestmove).');
  } finally {
    proc.kill('SIGTERM');
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
