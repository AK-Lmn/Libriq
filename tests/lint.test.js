import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ESLint } from 'eslint';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('CI runs ESLint before the tests', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.scripts.lint, 'eslint .');
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /run: npm run lint/);
  assert.ok(ci.indexOf('npm run lint') < ci.indexOf('run: npm test'), 'lint runs before the test suite');
});

test('navigation.js has no names that only exist in another scope', async () => {
  // routeAfterAuthReady and renderSessionChoicePage sit outside the Navigation
  // closure; calling its private helpers there threw ReferenceError.
  const [result] = await new ESLint().lintFiles(['frontend/js/navigation.js']);
  const undef = result.messages.filter(m => m.ruleId === 'no-undef').map(m => `${m.line}: ${m.message}`);
  assert.deepEqual(undef, []);
});
