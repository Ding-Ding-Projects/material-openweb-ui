#!/usr/bin/env node
// A static server for looking at the two surfaces during development.
//
// It exists because both surfaces are untranspiled ES modules, and a module
// script will not load over file:// — the browser refuses it as a cross-origin
// request. Nothing here is part of the shipped application; the desktop shell
// loads app/index.html from disk and the documentation site is served by GitHub.
//
//   node scripts/serve.mjs [port]

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.argv[2] || 5173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(req.url.split('?')[0]);
    // Normalise first, then confirm the result is still inside the tree. A
    // request may not walk out of the repository with ../ segments.
    let rel = normalize(url);
    const SEPARATORS = ['/', String.fromCharCode(92)];
    while (rel.length && SEPARATORS.includes(rel[0])) rel = rel.slice(1);
    let path = join(ROOT, rel);
    if (!path.startsWith(ROOT)) {
      res.writeHead(403).end('Outside the tree.');
      return;
    }
    let info = await stat(path).catch(() => null);
    if (info && info.isDirectory()) {
      path = join(path, 'index.html');
      info = await stat(path).catch(() => null);
    }
    if (!info) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not here: ' + url);
      return;
    }
    const body = await readFile(path);
    res.writeHead(200, {
      'content-type': TYPES[extname(path).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store'
    }).end(body);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(e && e.message));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log('Serving ' + ROOT + ' on http://127.0.0.1:' + PORT);
  console.log('  the application:       http://127.0.0.1:' + PORT + '/app/');
  console.log('  the documentation:     http://127.0.0.1:' + PORT + '/docs/');
});
