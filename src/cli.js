#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 39777);
const dataDir = path.resolve(process.env.ONION_WHISPER_DATA || '.onion-whisper');
const torrc = path.join(dataDir, 'torrc');
const hiddenServiceDir = path.join(dataDir, 'hidden-service');
const onionFile = path.join(hiddenServiceDir, 'hostname');
const torCommand = process.env.TOR_PATH || 'tor';

function die(message) { console.error(`\n✗ ${message}`); process.exit(1); }
function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(probe, [command], { stdio: 'ignore', shell: false }).status === 0;
}
function waitFor(file, timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (fs.existsSync(file)) { clearInterval(timer); resolve(); }
      else if (Date.now() - start > timeoutMs) { clearInterval(timer); reject(new Error('Timed out waiting for Tor to publish the onion address.')); }
    }, 400);
  });
}
function safeClose(child) { if (child && !child.killed) child.kill(); }

async function host() {
  if (process.env.TOR_PATH ? !fs.existsSync(torCommand) : !commandExists(torCommand)) {
    die('Tor was not found. Install the official Tor Expert Bundle, then either add tor to PATH or run: $env:TOR_PATH = "C:\\path\\to\\Tor\\tor.exe"; npm start');
  }
  fs.mkdirSync(hiddenServiceDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  // Tor's config parser accepts quoted paths. Forward slashes also avoid Windows
  // backslash escaping surprises in a generated torrc.
  const torPath = (value) => JSON.stringify(value.replaceAll('\\', '/'));
  fs.writeFileSync(torrc, [
    'SocksPort 0',
    'ClientOnly 0',
    `DataDirectory ${torPath(path.join(dataDir, 'tor-data'))}`,
    `HiddenServiceDir ${torPath(hiddenServiceDir)}`,
    `HiddenServicePort 80 127.0.0.1:${PORT}`,
    'Log notice stdout'
  ].join('\n') + '\n', { mode: 0o600 });

  const assets = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/index.html', ['index.html', 'text/html; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/app.js', ['app.js', 'application/javascript; charset=utf-8']]
  ]);
  const server = http.createServer((req, res) => {
    const asset = assets.get(new URL(req.url, 'http://localhost').pathname);
    if (!asset || req.method !== 'GET') { res.writeHead(404); return res.end(); }
    const [file, type] = asset;
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; style-src 'self'; script-src 'self'", 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(path.resolve('public', file)).pipe(res);
  });
  server.listen(PORT, '127.0.0.1');
  const wss = new WebSocketServer({ server, maxPayload: 32 * 1024 });
  const clients = new Set();
  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('message', (raw, isBinary) => {
      if (isBinary || raw.length > 32 * 1024) return ws.close(1009, 'message too large');
      // This server is deliberately a blind relay. It never parses or stores chat text.
      for (const peer of clients) if (peer !== ws && peer.readyState === peer.OPEN) peer.send(raw, { binary: false });
    });
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });
  const tor = spawn(torCommand, ['-f', torrc], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  tor.on('error', (error) => die(`Could not launch Tor: ${error.message}`));
  tor.stderr.on('data', (data) => process.stderr.write(data));
  process.on('SIGINT', () => { safeClose(tor); server.close(); process.exit(0); });
  process.on('SIGTERM', () => { safeClose(tor); server.close(); process.exit(0); });
  console.log('\nStarting your private room…');
  try {
    await waitFor(onionFile);
    const onion = fs.readFileSync(onionFile, 'utf8').trim();
    console.log(`\n✓ Your room is ready\n\n  http://${onion}\n\nShare this link only with people you trust. They need Tor Browser and the shared passphrase you choose in the room. Keep this window open while chatting.\n`);
  } catch (error) { safeClose(tor); server.close(); die(error.message); }
}

if (process.argv[2] === 'host' || !process.argv[2]) host();
else die('Usage: npm start');
