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
assert.match(worker, /shell-v4-glass/);
const files = await fs.readdir(root, { recursive: true });
for (const file of files.filter(file => /\.(?:css|js|svg)$/.test(file))) {
  if (/^assets\/revamp\//.test(file)) assert.ok(assets.includes(`./${file}`), `${file} is precached`);
  if (!file.endsWith('.css')) continue;
  const css = await fs.readFile(path.join(root, file), 'utf8');
  for (const match of css.matchAll(/url\(\s*["']?([^"'()\s;]+)["']?\s*\)?|@import\s+["']([^"']+)["']/g)) {
    const reference = match[1] || match[2];
    if (/^(?:data:|https?:|#|var\()/.test(reference)) continue;
    const target = path.resolve(root, path.dirname(file), reference.split(/[?#]/)[0]);
    assert.ok((await fs.stat(target)).size > 0, `${file}: ${reference} exists and is nonempty`);
    assert.ok(assets.includes(`./${path.relative(root, target)}`), `${file}: ${reference} is precached`);
  }
}

// The local-dev worker intentionally unregisters. Exercise the unchanged production
// caching branches through a fixture-only response; no authentication bootstrap runs.
const index = (await fs.readFile(path.join(root, 'index.html'), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
  try {
    const content = pathname === '/' || pathname === '/index.html' ? index
      : pathname === '/service-worker.js' ? worker.replace(/const IS_LOCAL_DEV = [^;]+;/, 'const IS_LOCAL_DEV = false;')
        : await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }[path.extname(file)] || 'text/html' }).end(content);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(origin);
  await page.evaluate(async () => {
    await caches.open('libriq-obsolete-integration-fixture');
    await navigator.serviceWorker.register('/service-worker.js');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cached = await page.evaluate(async () => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find(key => key.endsWith('-shell-v4-glass')));
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
  console.log(`Integration asset/import and production-cache fixture checks passed (${assets.length} cached resources).`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
