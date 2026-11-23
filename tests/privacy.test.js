import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { shouldLoadAnalytics } from '../frontend/js/analytics.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const SUPPORT = 'support@libriq.app';

test('Google Analytics is gone from the page and the CSP', async () => {
  const html = await read('frontend/index.html');
  assert.doesNotMatch(html, /googletagmanager|gtag\(/);
  assert.match(await read('frontend/js/appModules.js'), /^import '\.\/analytics\.js';/m);
  const vercel = await read('vercel.json');
  assert.doesNotMatch(vercel, /googletagmanager|google-analytics/);
});

test('cookieless analytics loads only on real hosts', () => {
  assert.equal(shouldLoadAnalytics('libriq.app'), true);
  assert.equal(shouldLoadAnalytics('libriq.vercel.app'), true);
  for (const host of ['localhost', '127.0.0.1', '[::1]', 'app.localhost', 'libriq.test', '']) {
    assert.equal(shouldLoadAnalytics(host), false, host);
  }
});

test('privacy and terms pages exist and name every processor', async () => {
  const privacy = await read('frontend/privacy.html');
  const terms = await read('frontend/terms.html');
  for (const page of [privacy, terms]) {
    assert.match(page, /<html lang="en"/);
    assert.match(page, /<title>[^<]+· LibriQ<\/title>/);
    assert.match(page, /<h1[\s>]/);
    assert.ok(page.includes(SUPPORT));
  }
  for (const name of ['Firebase', 'Vercel', 'Resend', 'Google Books', 'Open Library', 'Gutendex', 'Internet Archive', 'Wikipedia']) {
    assert.ok(privacy.includes(name), `privacy policy names ${name}`);
  }
  assert.doesNotMatch(privacy, /Google Analytics|cookie banner/i);
});

test('policies are linked from sign-in, Settings and email footers', async () => {
  const links = /href="[^"]*privacy\.html"[\s\S]*href="[^"]*terms\.html"|href="[^"]*terms\.html"[\s\S]*href="[^"]*privacy\.html"/;
  assert.match(await read('frontend/js/navigation.js'), links);
  assert.match(await read('frontend/js/features/settings/settingsPage.js'), links);
  assert.match(await read('emails/mobile-poll.html'), /https:\/\/libriq\.app\/privacy\.html/);
  assert.match(await read('emails/template.js'), /https:\/\/libriq\.app\/privacy\.html/);
});

test('no personal Gmail address ships in the app or scripts', () => {
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-c', '-I', '-E', '[A-Za-z0-9._%+-]+@gmail\\.com', '--', 'frontend', 'scripts', 'emails'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (error) {
    if (error.status !== 1) throw error; // 1 means no match
  }
  assert.equal(hits, '', 'files still containing a Gmail address (counts only)');
});

// The signed-out landing page lists importing from Goodreads and Kindle next
// to privacy and sync, since it's a main reason to switch from another app.
test('the landing page mentions the Goodreads and Kindle import', async () => {
  const nav = await read('frontend/js/navigation.js');
  const points = nav.slice(nav.indexOf('<div class="session-points">'), nav.indexOf('<div class="session-product-preview"'));
  assert.match(points, /Goodreads library and Kindle highlights/);
  assert.match(points, /ph-download-simple/);
});
