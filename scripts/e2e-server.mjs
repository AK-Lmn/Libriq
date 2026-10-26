import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { handleApiRequest } from '../api/app.js';

const root = path.resolve(process.cwd(), 'frontend');
const port = Number(process.env.LIBRIQ_E2E_PORT || 4173);
const store = new Map();
const subscribers = new Map();
const sockets = new Set();

// TEST_MODE is only available when explicitly opted into, never on a default host.
const testModeEnabled = process.env.LIBRIQ_ENABLE_TEST_API === '1'
  || process.env.LIBRIQ_E2E_TEST_MODE === '1'
  || process.env.NODE_ENV === 'test';

function sendJson(res, code, data, extraHeaders = {}) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(data));
}

function collectionKey(pathValue) {
  return String(pathValue || '');
}

function getCollection(pathValue) {
  return store.get(collectionKey(pathValue)) || new Map();
}

function publish(pathValue) {
  const payload = [...getCollection(pathValue).values()];
  for (const res of subscribers.get(collectionKey(pathValue)) || []) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

const MIME_TYPES = {
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
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
};

function serveFile(res, filePath) {
  // Containment is checked via a relative path so sibling directories whose
  // names share a prefix cannot bypass the guard.
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'content-type': type,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  });
  fs.createReadStream(filePath).pipe(res);
}

function isPathAllowed(pathValue) {
  if (typeof pathValue !== 'string') return false;
  const segments = pathValue.split('/');
  if (segments.length === 0 || segments.length > 8) return false;
  if (segments.some(segment => !segment || segment.includes('..') || segment.includes('\\'))) return false;
  if (segments.some(segment => !/^[A-Za-z0-9._-]+$/.test(segment))) return false;
  // Only the documented test collections are addressable.
  if (!segments[0] || segments[0] !== 'users') return false;
  return true;
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname || '/';

  // Hard limits so a slow client cannot hold the server open indefinitely.
  res.setTimeout(30000);

  if (pathname.startsWith('/api/')) {
    const handled = await handleApiRequest(req, res);
    if (handled) return;
  }

  if (pathname.startsWith('/__libriq_test_api')) {
    if (!testModeEnabled) {
      sendJson(res, 404, { error: 'not found' });
      return;
    }

    if (pathname === '/__libriq_test_api/reset' && req.method === 'POST') {
      store.clear();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/__libriq_test_api/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (pathname === '/__libriq_test_api/doc') {
      const pathValue = parsed.query.path;
      if (!isPathAllowed(pathValue)) {
        sendJson(res, 400, { error: 'invalid path' });
        return;
      }
      const segments = String(pathValue).split('/');
      const id = segments.pop();
      const collectionPath = segments.join('/');
      const collection = getCollection(collectionPath);

      if (req.method === 'GET') {
        sendJson(res, 200, collection.get(id) || null);
        return;
      }
      if (req.method === 'DELETE') {
        collection.delete(id);
        store.set(collectionPath, collection);
        publish(collectionPath);
        sendJson(res, 200, { ok: true });
        return;
      }
      if (req.method === 'PUT') {
        let body;
        try {
          body = await new Promise((resolve, reject) => {
            let raw = '';
            let bytes = 0;
            const timer = setTimeout(() => reject(new Error('timeout')), 10000);
            req.on('data', (chunk) => {
              bytes += chunk.length;
              if (bytes > 1048576) { req.destroy(); reject(new Error('too large')); return; }
              raw += chunk;
            });
            req.on('end', () => { clearTimeout(timer); try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
            req.on('error', reject);
          });
        } catch (parseErr) {
          sendJson(res, 400, { error: 'Invalid JSON payload', details: parseErr.message });
          return;
        }
        if (!body || typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) {
          sendJson(res, 400, { error: 'invalid data' });
          return;
        }
        collection.set(id, body.data);
        store.set(collectionPath, collection);
        publish(collectionPath);
        sendJson(res, 200, { ok: true });
        return;
      }
    }

    if (pathname === '/__libriq_test_api/collection' && req.method === 'GET') {
      const pathValue = parsed.query.path;
      if (!isPathAllowed(pathValue)) {
        sendJson(res, 400, { error: 'invalid path' });
        return;
      }
      sendJson(res, 200, [...getCollection(pathValue).values()]);
      return;
    }

    if (pathname === '/__libriq_test_api/subscribe' && req.method === 'GET') {
      const pathValue = parsed.query.path;
      if (!isPathAllowed(pathValue)) {
        sendJson(res, 400, { error: 'invalid path' });
        return;
      }
      const key = collectionKey(pathValue);
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-content-type-options': 'nosniff',
      });
      const list = subscribers.get(key) || new Set();
      list.add(res);
      subscribers.set(key, list);
      res.write(`data: ${JSON.stringify([...getCollection(key).values()])}\n\n`);
      req.on('close', () => { list.delete(res); });
      // Cap each SSE stream so a leaked client cannot hold it forever.
      const cap = setTimeout(() => res.end(), 30 * 60 * 1000);
      res.on('close', () => clearTimeout(cap));
      return;
    }

    sendJson(res, 404, { error: 'not found' });
    return;
  }

  let filePath = path.join(root, pathname === '/' ? 'index.html' : pathname);
  serveFile(res, filePath);
});

server.requestTimeout = 30000;
server.headersTimeout = 10000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;

server.listen(port, '127.0.0.1', () => {
  console.log(`LibriQ E2E server running at http://127.0.0.1:${port}`);
});

server.on('connection', socket => {
  sockets.add(socket);
  socket.once('close', () => sockets.delete(socket));
});

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const responses of subscribers.values()) {
    for (const response of responses) response.end();
  }
  subscribers.clear();
  server.close(() => process.exit(0));
  setTimeout(() => {
    for (const socket of sockets) socket.destroy();
    process.exit(0);
  }, 2000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
