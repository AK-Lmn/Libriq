import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { classifyScript, selectScripts } from '../scripts/run-tests.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('test scripts are split into a unit tier and a browser tier', () => {
  assert.equal(classifyScript("import { chromium } from 'playwright';"), 'browser');
  assert.equal(classifyScript("import assert from 'node:assert/strict';"), 'unit');
  // A script that imports a sibling browser script needs a browser too
  // (test-integrated-actions.mjs reuses test-integration-design.mjs).
  const siblings = {
    'test-design.mjs': "import { chromium } from 'playwright';",
    'helper.mjs': "import { x } from './test-design.mjs';",
    'loop-a.mjs': "import './loop-b.mjs';",
    'loop-b.mjs': "import './loop-a.mjs';",
  };
  const readSibling = name => siblings[name] ?? null;
  assert.equal(classifyScript("import { browser } from './test-design.mjs';", readSibling), 'browser');
  assert.equal(classifyScript("import { x } from './helper.mjs';", readSibling), 'browser', 'follows imports more than one level deep');
  assert.equal(classifyScript("import './loop-a.mjs';", readSibling), 'unit', 'import cycles terminate');
  assert.equal(classifyScript("import { readFile } from '../frontend/js/data.js';", readSibling), 'unit', 'app modules are not scripts');
  const scripts = [
    { name: 'test-a.mjs', tier: 'unit' },
    { name: 'test-b.mjs', tier: 'browser' },
  ];
  assert.deepEqual(selectScripts(scripts, 'unit').map(s => s.name), ['test-a.mjs']);
  assert.deepEqual(selectScripts(scripts, 'browser').map(s => s.name), ['test-b.mjs']);
  assert.equal(selectScripts(scripts, 'all').length, 2);
});

test('CI runs every test script, not a hand-picked few', async () => {
  const ci = await read('.github/workflows/ci.yml');
  // The unit scripts run inside `npm test` through tests/unit-scripts.test.js.
  assert.match(ci, /run: npm test$/m);
  assert.match(await read('tests/unit-scripts.test.js'), /tier === 'unit'/);
  assert.match(ci, /npm run test:browser/);
  assert.match(ci, /npx playwright install --with-deps chromium/);
  assert.match(ci, /node-version-file: \.nvmrc/);
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.scripts['test:unit'], 'node scripts/run-tests.mjs --tier unit');
  assert.equal(pkg.scripts['test:browser'], 'node scripts/run-tests.mjs --tier browser --retries 1');
  assert.equal(pkg.scripts['test:all'], 'node scripts/run-tests.mjs --tier all');
  const scripts = (await readdir(new URL('../scripts/', import.meta.url))).filter(f => /^test-.*\.mjs$/.test(f));
  assert.ok(scripts.length > 60, 'the runner has the full set to pick from');
});

test('Node version is pinned in one place', async () => {
  assert.equal((await read('.nvmrc')).trim(), '22');
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.engines?.node, '>=22');
});

test('line endings are normalised to LF', async () => {
  const attrs = await read('.gitattributes');
  assert.match(attrs, /^\* text=auto eol=lf$/m);
  for (const binary of ['*.png', '*.woff2', '*.ico', '*.jpg']) assert.match(attrs, new RegExp(`^\\${binary} binary$`, 'm'));
});

test('Dependabot watches npm and GitHub Actions', async () => {
  const config = await read('.github/dependabot.yml');
  assert.match(config, /package-ecosystem: npm/);
  assert.match(config, /package-ecosystem: github-actions/);
});

test('QA artifacts are not tracked', async () => {
  const ignore = await read('.gitignore');
  assert.match(ignore, /^qa-screenshots\/$/m);
  assert.match(ignore, /^qa-report\.md$/m);
});
