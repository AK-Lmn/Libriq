import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('cache-first lookups ignore ?v= query strings so versioned icons work offline', async () => {
  const sw = await read('frontend/service-worker.js');
  const body = sw.slice(sw.indexOf('async function cacheFirst'), sw.indexOf('function isNavigationRequest'));
  assert.match(body, /cache\.match\(request, \{ ignoreSearch: true \}\)/);
});

test('the precache skips the unused Phosphor Bold font', async () => {
  const sw = await read('frontend/service-worker.js');
  assert.doesNotMatch(sw, /Phosphor-Bold\.woff2/);
  const used = await read('frontend/js/features/library/libraryDesign.js');
  assert.match(used, /ph-fill/, 'Fill is still used, so it stays precached');
  assert.match(sw, /Phosphor-Fill\.woff2/);
  const css = await read('frontend/vendor/phosphor/style.css');
  assert.doesNotMatch(css, /Phosphor-Bold|\.ph-bold/, 'unused Bold weight is not shipped');
});

test('the service worker registers after the page has loaded', async () => {
  const app = await read('frontend/js/app.js');
  const body = app.slice(app.indexOf('function registerServiceWorker'), app.indexOf('function waitForAuthThenRoute'));
  assert.match(body, /document\.readyState === 'complete'/);
  assert.match(body, /addEventListener\('load', register, \{ once: true \}\)/);
});

test('/vendor/ files get a browser cache rule', async () => {
  const vercel = JSON.parse(await read('vercel.json'));
  const rule = vercel.headers.find(entry => entry.source === '/vendor/(.*)');
  assert.ok(rule, 'vendor rule exists');
  const value = rule.headers.find(h => h.key === 'Cache-Control')?.value || '';
  assert.match(value, /max-age=86400/);
  assert.match(value, /stale-while-revalidate=604800/);
});

test('manifest has an id, categories and an accurate description', async () => {
  const manifest = JSON.parse(await read('frontend/manifest.json'));
  assert.equal(manifest.id, '/');
  assert.ok(Array.isArray(manifest.categories) && manifest.categories.includes('books'));
  assert.doesNotMatch(manifest.description, /local-first/i);
});
