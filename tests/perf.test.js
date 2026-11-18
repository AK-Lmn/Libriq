import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { coverImgAttrs, coverSources } from '../frontend/js/shared/coverSize.js';

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

test('Open Library covers offer medium and large; the browser picks by layout width', () => {
  const large = 'https://covers.openlibrary.org/b/id/8352507-L.jpg';
  const medium = 'https://covers.openlibrary.org/b/id/8352507-M.jpg';
  assert.deepEqual(coverSources(large, 'cover-md'), { src: medium, srcset: `${medium} 180w, ${large} 500w` });
  const isbn = 'https://covers.openlibrary.org/b/isbn/9780553418026-L.jpg?default=false';
  assert.equal(coverSources(isbn, 'cover-sm').src, 'https://covers.openlibrary.org/b/isbn/9780553418026-M.jpg?default=false');
  assert.deepEqual(coverSources(large, 'cover-xl'), { src: large, srcset: '' }, 'detail cover stays large');
  const google = 'https://books.google.com/books/content?id=x&printsec=frontcover&img=1&zoom=1';
  assert.deepEqual(coverSources(google, 'cover-md'), { src: google, srcset: '' });
  const spoof = 'https://evil.example/covers.openlibrary.org/b/id/1-L.jpg';
  assert.deepEqual(coverSources(spoof, 'cover-md'), { src: spoof, srcset: '' });
  assert.deepEqual(coverSources(null, 'cover-md'), { src: null, srcset: '' });
  const esc = value => String(value).replace(/"/g, '&quot;');
  assert.equal(coverImgAttrs(large, 'cover-md', esc), `src="${medium}" srcset="${medium} 180w, ${large} 500w" sizes="auto, 160px"`);
  assert.equal(coverImgAttrs(google, 'cover-md', esc), `src="${google}"`);
});

test('every cover <img> goes through coverImgAttrs, and error fallbacks clear srcset', async () => {
  const has = (source, text) => assert.ok(source.includes(text), text);
  const utils = await read('frontend/js/utils.js');
  has(utils, '<img ${coverImgAttrs(coverUrl, sizeClass, Utils.sanitize)}');
  // Fallbacks run in a delegated capture-phase error listener (no inline
  // onerror under the CSP); the image fallback drops srcset before swapping src.
  has(utils, "doc.addEventListener('error', _handleImageError, true);");
  has(utils, "img.removeAttribute('srcset');\n    img.src = img.dataset.fallbackSrc;");
  has(await read('frontend/js/features/library/libraryDesign.js'), "<img ${coverImgAttrs(book.coverUrl, 'cover-sm', sanitize)}");
  const nav = await read('frontend/js/navigation.js');
  has(nav, "<img ${coverImgAttrs(b.coverUrl, 'cover-sm', Utils.sanitize)} loading=\"lazy\"");
  has(nav, 'data-fallback-src="./assets/icons/icon-192.png"');
});

test('runWhenIdleAfterLoad waits for load, then for idle time', async () => {
  const { runWhenIdleAfterLoad } = await import('../frontend/js/shared/afterLoad.js');
  const listeners = {};
  const idle = [];
  const env = {
    document: { readyState: 'loading' },
    window: {
      addEventListener: (type, fn, options) => { listeners[type] = { fn, options }; },
      requestIdleCallback: (fn, options) => idle.push({ fn, options }),
    },
  };
  let ran = 0;
  runWhenIdleAfterLoad(() => { ran += 1; }, env);
  assert.equal(ran, 0);
  assert.equal(idle.length, 0, 'nothing is scheduled before load');
  assert.deepEqual(listeners.load.options, { once: true });
  listeners.load.fn();
  assert.equal(idle.length, 1);
  assert.equal(idle[0].options.timeout, 3000, 'runs within 3 s even if the page never idles');
  idle[0].fn();
  assert.equal(ran, 1);

  // Already loaded, and no requestIdleCallback (Safari): falls back to a timer.
  const timers = [];
  runWhenIdleAfterLoad(() => { ran += 1; }, { document: { readyState: 'complete' }, window: {}, setTimeout: (fn, ms) => timers.push({ fn, ms }) });
  assert.equal(timers.length, 1);
  timers[0].fn();
  assert.equal(ran, 2);
});

test('App Check starts after load instead of during boot', async () => {
  const client = await read('frontend/js/firebase-client.js');
  const body = client.slice(client.indexOf('function initAppCheck'), client.indexOf('function prepareRuntime'));
  assert.ok(body.includes('runWhenIdleAfterLoad(() => {'), 'App Check import is deferred');
});
