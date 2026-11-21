import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildPrecacheList } from '../scripts/precache-list.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
// Array.from: an array made in another vm context fails deepStrictEqual.
const shellAssets = sw => Array.from(vm.runInNewContext(sw.match(/const SHELL_ASSETS = (\[[\s\S]*?\]);/)[1]));

// npm run build writes the list from the files on disk. If a file is added
// or removed without a build, the committed service worker goes stale.
test('the service worker precache list matches the files on disk', async () => {
  const committed = shellAssets(await read('frontend/service-worker.js'));
  const generated = await buildPrecacheList(new URL('../frontend', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
  assert.deepEqual(committed, generated, 'run npm run build and commit frontend/service-worker.js');
});

test('the precache list covers the legal pages and leaves out local-only files', async () => {
  const list = shellAssets(await read('frontend/service-worker.js'));
  for (const needed of ['./privacy.html', './terms.html', './css/legal.css', './js/legal.js', './js/app.bundle.js', './css/icons.css']) {
    assert.ok(list.includes(needed), `${needed} is precached`);
  }
  for (const excluded of ['./js/config.local.js', './vendor/phosphor/style.css', './assets/fonts/OFL-inter.txt']) {
    assert.ok(!list.includes(excluded), `${excluded} is not precached`);
  }
  assert.equal(new Set(list).size, list.length, 'no duplicates');
});
