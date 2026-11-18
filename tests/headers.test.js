import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const siteHeaders = async () => {
  const vercel = JSON.parse(await read('vercel.json'));
  const all = vercel.headers.find(entry => entry.headers.some(h => h.key === 'Content-Security-Policy'));
  return { vercel, get: key => all.headers.find(h => h.key === key)?.value };
};

test('HSTS covers subdomains for two years and is preload-ready', async () => {
  const { get } = await siteHeaders();
  assert.equal(get('Strict-Transport-Security'), 'max-age=63072000; includeSubDomains; preload');
});

test('COOP isolates the window but keeps the Google sign-in popup working', async () => {
  const { get } = await siteHeaders();
  // same-origin would cut the opener link signInWithPopup relies on.
  assert.equal(get('Cross-Origin-Opener-Policy'), 'same-origin-allow-popups');
});

test('security.txt is served at the well-known path with a contact and a future expiry', async () => {
  const { vercel } = await siteHeaders();
  const rewrite = (vercel.rewrites || []).find(r => r.source === '/.well-known/security.txt');
  assert.equal(rewrite?.destination, '/security.txt');
  const txt = await read('frontend/security.txt');
  assert.match(txt, /^Contact: mailto:support@libriq\.app$/m);
  assert.match(txt, /^Canonical: https:\/\/www\.libriq\.app\/\.well-known\/security\.txt$/m);
  assert.match(txt, /^Preferred-Languages: en$/m);
  const expires = Date.parse(txt.match(/^Expires: (.+)$/m)?.[1]);
  const now = Date.parse('2026-11-18T00:00:00Z');
  assert.ok(expires > now, 'not expired');
  assert.ok(expires - now <= 366 * 24 * 3600 * 1000, 'RFC 9116: at most a year ahead');
});
