import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const ORIGIN = 'https://www.libriq.app';
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const meta = (html, attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`))?.[1];

test('home page has a descriptive title and a canonical URL', async () => {
  const html = await read('frontend/index.html');
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  assert.notEqual(title, 'LibriQ');
  assert.match(title, /LibriQ/);
  assert.ok(title.length <= 65, `title is ${title.length} chars`);
  assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}/" />`));
});

test('social cards use absolute URLs and a large image', async () => {
  const html = await read('frontend/index.html');
  for (const [attr, name] of [['property', 'og:image'], ['name', 'twitter:image'], ['property', 'og:url']]) {
    assert.match(meta(html, attr, name) || '', new RegExp(`^${ORIGIN}/`), `${name} is absolute`);
  }
  assert.equal(meta(html, 'name', 'twitter:card'), 'summary_large_image');
  assert.equal(meta(html, 'property', 'og:image:width'), '1200');
  assert.equal(meta(html, 'property', 'og:image:height'), '630');
  const image = meta(html, 'property', 'og:image').replace(ORIGIN, 'frontend');
  assert.ok((await stat(new URL(`../${image}`, import.meta.url))).size > 0, 'og image file exists');
  const description = meta(html, 'name', 'description');
  assert.equal(meta(html, 'property', 'og:description'), description, 'descriptions match');
  assert.equal(meta(html, 'name', 'twitter:description'), description);
});

test('JSON-LD describes the app and parses', async () => {
  const html = await read('frontend/index.html');
  const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(block, 'JSON-LD block present');
  const data = JSON.parse(block[1]);
  const types = (data['@graph'] || [data]).map(node => node['@type']);
  assert.ok(types.includes('WebApplication'));
  assert.ok(types.includes('WebSite'));
});

test('robots.txt, sitemap.xml and llms.txt are served from the site root', async () => {
  const robots = await read('frontend/robots.txt');
  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, new RegExp(`^Sitemap: ${ORIGIN}/sitemap.xml$`, 'm'));
  const sitemap = await read('frontend/sitemap.xml');
  for (const path of ['/', '/privacy.html', '/terms.html']) assert.ok(sitemap.includes(`<loc>${ORIGIN}${path}</loc>`), path);
  const llms = await read('frontend/llms.txt');
  assert.match(llms, /^# LibriQ/);
  assert.ok(llms.includes(`${ORIGIN}/privacy.html`));
});

test('apple-touch-icon is available at the root', async () => {
  assert.ok((await stat(new URL('../frontend/apple-touch-icon.png', import.meta.url))).size > 0);
});

test('policy pages point their canonical at the www host', async () => {
  for (const page of ['privacy', 'terms']) {
    assert.match(await read(`frontend/${page}.html`), new RegExp(`<link rel="canonical" href="${ORIGIN}/${page}.html" />`));
  }
});

test('the sign-in route keeps the descriptive title', async () => {
  const nav = (await read('frontend/js/navigation.js')) + (await read('frontend/js/features/session/sessionPage.js'));
  assert.doesNotMatch(nav, /: 'LibriQ';/, 'no hard-coded bare title');
});

const FEATURE_PAGES = ['goodreads-import', 'kindle-highlights', 'private-reading-tracker'];
const words = html => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

test('the home page ships a static landing block crawlers can read without JavaScript', async () => {
  const html = await read('frontend/index.html');
  const block = html.match(/<section class="seo-intro"[\s\S]*?<\/section>/)?.[0];
  assert.ok(block, 'seo-intro section present in the static HTML');
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'exactly one h1 in the static page');
  assert.match(block, /<h1[\s>]/, 'the h1 is in the landing block');
  const count = words(block);
  assert.ok(count >= 250 && count <= 450, `landing block is ${count} words`);
  for (const page of FEATURE_PAGES) assert.ok(block.includes(`href="./${page}.html"`), `links to ${page}`);
});

test('feature pages have their own title, description, canonical, h1 and real content', async () => {
  const titles = new Set();
  for (const page of FEATURE_PAGES) {
    const html = await read(`frontend/${page}.html`);
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
    assert.match(title, /LibriQ/, `${page} title names LibriQ`);
    assert.ok(title.length <= 65, `${page} title is ${title.length} chars`);
    assert.ok(!titles.has(title), `${page} title is unique`);
    titles.add(title);
    const description = meta(html, 'name', 'description') || '';
    assert.ok(description.length >= 70 && description.length <= 160, `${page} description is ${description.length} chars`);
    assert.match(html, new RegExp(`<link rel="canonical" href="${ORIGIN}/${page}.html" />`));
    assert.equal(meta(html, 'property', 'og:url'), `${ORIGIN}/${page}.html`);
    assert.match(meta(html, 'property', 'og:image') || '', new RegExp(`^${ORIGIN}/`));
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, `${page} has one h1`);
    assert.ok(words(html.match(/<main[\s\S]*<\/main>/)[0]) >= 300, `${page} has at least 300 words`);
    assert.match(html, /href="\.\/"[^>]*>[^<]*(Start|Create|Open)/, `${page} links back to the app`);
    assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)(?![^>]*application\/ld\+json)[^>]*>/, `${page} has no inline scripts (CSP)`);
  }
});

test('feature pages are in the sitemap and llms.txt', async () => {
  const sitemap = await read('frontend/sitemap.xml');
  const llms = await read('frontend/llms.txt');
  for (const page of FEATURE_PAGES) {
    assert.ok(sitemap.includes(`<loc>${ORIGIN}/${page}.html</loc>`), `sitemap lists ${page}`);
    assert.ok(llms.includes(`${ORIGIN}/${page}.html`), `llms.txt lists ${page}`);
  }
});
