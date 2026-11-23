import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cacheRule = (vercel, source) => vercel.headers.find(entry => entry.source === source)
  ?.headers.find(h => h.key === 'Cache-Control')?.value || '';

// /js and /css keep the same file names across deploys (app.bundle.js,
// components.css). If a browser may reuse them for a day without asking,
// a new index.html can run against yesterday's CSS or bundle. They
// revalidate instead: a 304 when unchanged. Most returning visitors don't
// notice, because the service worker serves from its own per-deploy cache.
test('scripts and stylesheets revalidate on every load', async () => {
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  for (const source of ['/js/(.*)', '/css/(.*)']) {
    const value = cacheRule(vercel, source);
    assert.match(value, /max-age=0/, `${source}: ${value}`);
    assert.match(value, /must-revalidate/, `${source}: ${value}`);
    assert.doesNotMatch(value, /stale-while-revalidate|immutable/, `${source}: ${value}`);
  }
});
