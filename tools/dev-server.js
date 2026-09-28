#!/usr/bin/env node
/* ==========================================================================
   Luvli ♡ — tools/dev-server.js
   --------------------------------------------------------------------------
   One command that runs the whole thing locally, for real:

     npm run dev

   No dependencies: a tiny static file server, so the app (and service worker,
   which needs http/https) works on http://localhost:8080 with no deploy.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);

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

const server = http.createServer(serveStatic);

server.listen(PORT, () => {
  console.log('');
  console.log('  Luvli ♡ is running');
  console.log('  ------------------');
  console.log('  App:      http://localhost:' + PORT);
  console.log('  Sign in:  http://localhost:' + PORT + '/login.html');
  console.log('');
  console.log('  Press Ctrl+C to stop.');
  console.log('');
});
