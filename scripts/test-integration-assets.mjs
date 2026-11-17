import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import vm from 'node:vm';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const worker = await fs.readFile(path.join(root, 'service-worker.js'), 'utf8');
const assets = vm.runInNewContext(worker.match(/const SHELL_ASSETS = (\[[\s\S]*?\]);/)[1]);
assert.equal(new Set(assets).size, assets.length, 'precache paths must be unique');
for (const asset of assets) assert.ok((await fs.stat(path.resolve(root, asset))).size > 0, `${asset} exists and is nonempty`);
assert.ok(assets.includes('./css/components.css'));
assert.ok(assets.includes('./js/navigationChrome.js'));
assert.match(worker, /shell-v5-complete-glass/);
// readdir returns OS separators; precache entries use URL-style forward slashes.
const toPosix = value => value.split(path.sep).join('/');
const files = (await fs.readdir(root, { recursive: true })).map(toPosix);
for (const file of files.filter(file => /\.(?:css|js|svg)$/.test(file))) {
  if (/^assets\/revamp\//.test(file)) assert.ok(assets.includes(`./${file}`), `${file} is precached`);
  if (!file.endsWith('.css')) continue;
  const css = await fs.readFile(path.join(root, file), 'utf8');
  for (const match of css.matchAll(/url\(\s*["']?([^"'()\s;]+)["']?\s*\)?|@import\s+["']([^"']+)["']/g)) {
    const reference = match[1] || match[2];
    if (/^(?:data:|https?:|#|var\()/.test(reference)) continue;
    const target = path.resolve(root, path.dirname(file), reference.split(/[?#]/)[0]);
    assert.ok((await fs.stat(target)).size > 0, `${file}: ${reference} exists and is nonempty`);
    assert.ok(assets.includes(`./${toPosix(path.relative(root, target))}`), `${file}: ${reference} is precached`);
  }
}

// The local-dev worker intentionally unregisters. Exercise the unchanged production
// caching branches through a fixture-only response; no authentication bootstrap runs.
const index = (await fs.readFile(path.join(root, 'index.html'), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
const UPDATED_ASSET = '/js/shared/fetchClient.js';
const DEPLOY_B_MARKER = 'deploy-b-marker';
assert.ok(assets.includes(`.${UPDATED_ASSET}`), 'update fixture asset is precached');
const deploy = { build: 'build-a' };
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
  try {
    let content = pathname === '/' || pathname === '/index.html' ? index.replace('</body>', `<meta name="deploy" content="page-${deploy.build}"></body>`)
      : pathname === '/service-worker.js' ? `${worker.replace(/const IS_LOCAL_DEV = [^;]+;/, 'const IS_LOCAL_DEV = false;')}\n// ${deploy.build}\n`
        : pathname === '/js/version-classic.js' ? `self.LIBRIQ_APP_VERSION = "test";\nself.LIBRIQ_BUILD_ID = "${deploy.build}";\n`
          : await fs.readFile(file);
    if (pathname === UPDATED_ASSET && deploy.build === 'build-b') content = `${content}\n// ${DEPLOY_B_MARKER}\n`;
    // Like production (vercel.json): the worker and version file revalidate,
    // other files may come from the HTTP cache for a day.
    const cacheControl = /^\/(?:service-worker|js\/version-classic)\.js$/.test(pathname) ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, { 'Cache-Control': cacheControl, 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }[path.extname(file)] || 'text/html' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  // Put deploy A's copy in the HTTP cache, as a returning visitor would have it.
  await page.evaluate(asset => fetch(asset).then(r => r.text()), UPDATED_ASSET);
  await page.evaluate(async () => {
    await caches.open('libriq-obsolete-integration-fixture');
    await navigator.serviceWorker.register('/service-worker.js');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(key => key.endsWith('-shell-v5-complete-glass')));
    return { keys, paths: (await cache.keys()).map(request => new URL(request.url).pathname) };
  });
  assert.ok(!cached.keys.includes('libriq-obsolete-integration-fixture'), 'obsolete cache retired');
  for (const asset of assets) assert.ok(cached.paths.includes(`/${asset.slice(2)}`), `${asset} installed into cache`);
  await context.setOffline(true);
  await page.reload();
  assert.ok(await page.locator('#mainContent').count(), 'cached app shell available offline');
  for (const asset of assets) {
    const loaded = await page.evaluate(async asset => {
      try {
        const response = await fetch(asset, asset.endsWith('.html') ? { headers: { Accept: 'text/html' } } : {});
        return response.ok && (await response.arrayBuffer()).byteLength > 0;
      } catch { return false; }
    }, asset);
    assert.ok(loaded, `${asset} available offline`);
  }
  // Deploy B ships. The new worker must install fully, wait instead of taking
  // over the open page, and precache fresh files (not day-old HTTP-cache copies).
  await context.setOffline(false);
  await page.reload();
  deploy.build = 'build-b';
  const update = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration.update();
    const deadline = Date.now() + 15000;
    while (!registration.waiting && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
    return {
      waiting: Boolean(registration.waiting),
      controllerUnchanged: navigator.serviceWorker.controller?.scriptURL === registration.active?.scriptURL,
      keys: await caches.keys(),
    };
  });
  assert.ok(update.waiting, 'new deploy waits instead of taking over the open page');
  assert.ok(update.controllerUnchanged, 'open page keeps the worker it started with');
  const oldKey = update.keys.find(key => key.includes('-build-a-'));
  const newKey = update.keys.find(key => key.includes('-build-b-'));
  assert.ok(oldKey && newKey, `each deploy gets its own cache: ${update.keys.join(', ')}`);
  const cachedText = (key) => page.evaluate(async ({ key, asset }) => {
    const response = await (await caches.open(key)).match(asset);
    return response ? response.text() : '';
  }, { key, asset: UPDATED_ASSET });
  assert.ok((await cachedText(newKey)).includes(DEPLOY_B_MARKER), 'precache bypasses the HTTP cache');
  assert.ok(!(await cachedText(oldKey)).includes(DEPLOY_B_MARKER), 'deploy A cache is not refreshed with deploy B files');
  // Reloading while deploy B waits still gives deploy A's page, matching its modules.
  await page.reload();
  assert.ok((await page.content()).includes('page-build-a'), 'app page stays on the running deploy until the swap');

  // Reload: the waiting worker takes over and deploy A's cache is retired.
  const swapped = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const changed = new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    await changed;
    const deadline = Date.now() + 5000;
    let keys = await caches.keys();
    while (keys.some(key => key.includes('-build-a-')) && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 100));
      keys = await caches.keys();
    }
    return keys;
  });
  assert.ok(!swapped.some(key => key.includes('-build-a-')), 'old deploy cache removed after the swap');
  assert.ok(swapped.some(key => key.includes('-build-b-')), 'new deploy cache kept');
  await page.reload();
  assert.ok((await page.content()).includes('page-build-b'), 'after the swap the new deploy page loads');
  console.log(`Integration asset/import and production-cache fixture checks passed (${assets.length} cached resources). Deploy updates wait for reload and precache fresh files.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
