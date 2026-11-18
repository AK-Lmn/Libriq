import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Google sign-in runs on our own domain: /__/auth/* and /__/firebase/* are
// proxied to the Firebase auth handler, so authDomain can be www.libriq.app
// and the sign-in popup no longer depends on third-party storage.

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const vercel = async () => JSON.parse(await read('vercel.json'));
const FIREBASE_HOST = 'https://libriq-61ad3.firebaseapp.com';

test('/__/auth and /__/firebase are proxied to the Firebase auth handler', async () => {
  const { rewrites = [] } = await vercel();
  const find = source => rewrites.find(r => r.source === source)?.destination;
  assert.equal(find('/__/auth/:path*'), `${FIREBASE_HOST}/__/auth/:path*`);
  assert.equal(find('/__/firebase/:path*'), `${FIREBASE_HOST}/__/firebase/:path*`);
});

test('site-wide CSP and frame blocking skip the proxied auth pages', async () => {
  // The handler page has its own nonce'd inline script and is framed by the
  // app (/__/auth/iframe), so our CSP and X-Frame-Options would break it.
  const { headers } = await vercel();
  const withCsp = headers.filter(h => h.headers.some(x => x.key === 'Content-Security-Policy'));
  assert.equal(withCsp.length, 1);
  const pattern = new RegExp(`^${withCsp[0].source.replace(/^\//, '/').replace(/\(\?!/g, '(?!')}$`);
  assert.ok(pattern.test('/'), 'applies to the app');
  assert.ok(pattern.test('/privacy.html'));
  assert.ok(!pattern.test('/__/auth/handler'), 'not the auth handler');
  assert.ok(!pattern.test('/__/auth/iframe'));
  assert.ok(!pattern.test('/__/firebase/init.json'));
  const authRule = headers.find(h => h.source === '/__/(.*)');
  assert.ok(authRule, 'auth paths keep the transport headers');
  assert.ok(authRule.headers.some(h => h.key === 'Strict-Transport-Security'));
  assert.ok(!authRule.headers.some(h => ['Content-Security-Policy', 'X-Frame-Options'].includes(h.key)));
});

test('the app may frame its own auth iframe', async () => {
  const { headers } = await vercel();
  const csp = headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy').value;
  const frameSrc = csp.split(';').map(s => s.trim()).find(s => s.startsWith('frame-src '));
  assert.match(frameSrc, /'self'/);
});

test('the service worker never answers for /__/ paths', async () => {
  const sw = await read('frontend/service-worker.js');
  const fetchHandler = sw.slice(sw.indexOf("self.addEventListener('fetch'"));
  const skip = fetchHandler.indexOf("url.pathname.startsWith('/__/')");
  assert.ok(skip !== -1, 'skips /__/');
  assert.ok(skip < fetchHandler.indexOf('respondWith('), 'before any respondWith');
});
