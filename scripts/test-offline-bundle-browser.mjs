// The live site runs js/app.bundle.js, and the service worker precaches only
// what the live site loads (no source modules). This test lets the app
// install its service worker the way it does on www.libriq.app, goes offline,
// and checks that the app and the legal pages still load from the cache.
//
// On 127.0.0.1 the app normally treats itself as local development: boot.js
// loads the source modules, localConfigLoader.js asks for config.local.js,
// and app.js removes the service worker and its caches. The test server
// rewrites "127.0.0.1" in those few checks so the app takes the production
// path; nothing else in the served files changes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const PRODUCTION_PATH = new Set(['/js/boot.js', '/js/app.bundle.js', '/js/localConfigLoader.js', '/service-worker.js']);
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    let content = await fs.readFile(file);
    if (PRODUCTION_PATH.has(pathname)) content = String(content).replaceAll('127.0.0.1', '127.0.0.0');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/html' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${origin}/`);
  await page.waitForFunction(() => Boolean(window.LibriqNavigation), null, { timeout: 30000 });
  // The app registers the worker after load. `ready` resolves once it is
  // active, which is after its install step has precached everything. The
  // test goes offline before any request passes through the worker, so only
  // the precache can answer (the worker also caches what it serves online).
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const cachedCount = await page.evaluate(async () => {
    const key = (await caches.keys()).find(name => name.endsWith('-shell-v5-complete-glass'));
    return key ? (await (await caches.open(key)).keys()).length : 0;
  });
  assert.ok(cachedCount > 100, `precache installed (${cachedCount} files)`);

  await context.setOffline(true);
  const errors = [];
  const failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => {
    const url = new URL(request.url());
    if (url.origin === origin) failed.push(`${url.pathname} ${request.failure()?.errorText}`);
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.LibriqNavigation), null, { timeout: 30000 });
  // Signed out with no network, the app leaves the boot screen for sign-in.
  await page.waitForFunction(() => !document.querySelector('.session-page--boot'), null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  const scripts = await page.evaluate(() => performance.getEntriesByType('resource')
    .map(entry => new URL(entry.name).pathname).filter(p => p.startsWith('/js/')));
  assert.ok(scripts.includes('/js/app.bundle.js'), 'the bundle ran');
  assert.ok(!scripts.includes('/js/appModules.js'), 'no source modules were needed');
  assert.deepEqual(failed, [], 'everything the app asked for came from the cache');
  assert.deepEqual(errors, [], 'no page errors offline');

  // The legal pages load their own scripts and stylesheet.
  await page.goto(`${origin}/privacy.html`);
  await page.waitForLoadState('load');
  assert.match(await page.locator('h1').first().textContent(), /Privacy Policy/, 'offline, /privacy.html is the privacy page (not the app)');
  const styled = await page.evaluate(() => [...document.styleSheets].some(sheet => {
    // A stylesheet that failed to load has no readable rules.
    try { return sheet.href?.endsWith('/css/legal.css') && sheet.cssRules.length > 0; } catch { return false; }
  }));
  assert.ok(styled, 'the privacy page has its styles offline');
  assert.deepEqual(failed, [], 'the privacy page loaded everything from the cache');
  console.log('Offline bundle browser test passed');
} finally {
  await browser.close();
  server.close();
}
