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
  const nav = await read('frontend/js/navigation.js');
  assert.doesNotMatch(nav, /: 'LibriQ';/, 'no hard-coded bare title');
});
