import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const cssDir = path.join(process.cwd(), 'frontend', 'css');
const BOM = '﻿';

async function listCss(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listCss(full);
    return entry.name.endsWith('.css') ? [full] : [];
  }));
  return nested.flat();
}

// A byte-order mark in the middle of the bundle becomes part of the next
// selector ("﻿.btn"), so the browser drops that whole rule.
test('bundled components.css contains no byte-order marks', async () => {
  const bundle = await readFile(path.join(cssDir, 'components.css'), 'utf8');
  assert.equal(bundle.includes(BOM), false, 'components.css contains U+FEFF; a rule after it is being dropped');
});

test('bundled components.css keeps the base .btn and .modal-overlay rules', async () => {
  const bundle = await readFile(path.join(cssDir, 'components.css'), 'utf8');
  assert.match(bundle, /(^|\n)\.btn \{/);
  assert.match(bundle, /(^|\n)\.modal-overlay \{/);
});

test('CSS source files are saved without a byte-order mark', async () => {
  const files = await listCss(cssDir);
  const withBom = [];
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    if (text.startsWith(BOM)) withBom.push(path.relative(cssDir, file));
  }
  assert.deepEqual(withBom, []);
});

// `npm run build` rewrites components.css from the list in
// generate-config.mjs, so a stylesheet missing from that list silently
// disappears in CI and on deploy even when it works locally.
test('every component and feature stylesheet is bundled or linked directly', async () => {
  const [script, html] = await Promise.all([
    readFile(path.join(process.cwd(), 'scripts', 'generate-config.mjs'), 'utf8'),
    readFile(path.join(process.cwd(), 'frontend', 'index.html'), 'utf8'),
  ]);
  const files = (await listCss(cssDir))
    .map(file => path.relative(cssDir, file).split(path.sep).join('/'))
    .filter(file => /^(components|features)\//.test(file));
  const missing = files.filter(file => !script.includes(`'${file}'`) && !html.includes(`css/${file}`));
  assert.deepEqual(missing, []);
});
