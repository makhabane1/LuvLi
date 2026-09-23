#!/usr/bin/env node
/* ==========================================================================
   Luvli ♡ — tools/dev-server.js
   --------------------------------------------------------------------------
   One command that runs the whole thing locally, for real:

     npm run dev

   It serves the static app AND runs the coach function at /api/luvli-coach, so
   the real AI works on http://localhost:8080 with no deploy at all. If your
   .env has no COACH_API_KEY, the endpoint honestly reports { degraded: true }
   and the page falls back to its on-device brain — exactly as in production.

   No dependencies: a tiny static file server plus a small router that loads
   the same handler Netlify would run (netlify/functions/luvli-coach.js).
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);

/* ------------------------------ load .env -------------------------------- */
/* A tiny .env reader (no dotenv dependency). Existing real env wins. */
function loadEnv() {
  const file = path.join(root, '.env');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  });
}
loadEnv();

/* ------------------------------ the coach fn ----------------------------- */
let coachHandler = null;
try {
  coachHandler = require(path.join(root, 'netlify', 'functions', 'luvli-coach.js')).handler;
} catch (err) {
  console.warn('  ! Could not load the coach function:', err.message);
}

/* ------------------------------ static files ----------------------------- */
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function serveStatic(req, res) {
  let rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel === '/') rel = '/index.html';

  // Never serve outside the project folder.
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(file).pipe(res);
  });
}

/* --------------------------- read a JSON body ---------------------------- */
function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

/* -------------------------------- router -------------------------------- */
const server = http.createServer(async (req, res) => {
  const url = (req.url || '').split('?')[0];

  /* The coach endpoint the browser calls. */
  if (url === '/api/luvli-coach' || url === '/.netlify/functions/luvli-coach') {
    if (!coachHandler) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'coach function not loaded' }));
      return;
    }
    const body = await readBody(req);
    const event = { httpMethod: req.method, body, headers: req.headers };
    try {
      const result = await coachHandler(event);
      res.writeHead(result.statusCode || 200, result.headers || { 'Content-Type': 'application/json' });
      res.end(result.body || '');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: String(err && err.message) }));
    }
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  const key = process.env.COACH_API_KEY ? 'set ✓' : 'not set — coach uses its on-device brain';
  console.log('');
  console.log('  Luvli ♡ is running');
  console.log('  ------------------');
  console.log('  App:            http://localhost:' + PORT);
  console.log('  Sign in:        http://localhost:' + PORT + '/login.html');
  console.log('  Coach:          http://localhost:' + PORT + '/ai-coach.html');
  console.log('  Coach endpoint: http://localhost:' + PORT + '/api/luvli-coach');
  console.log('  COACH_API_KEY:  ' + key);
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
