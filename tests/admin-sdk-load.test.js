// Vercel's Node runtime cannot require() an ES module, and firebase-admin's
// jwks-rsa does require('jose'). jose 6 is ESM-only, so every route that
// started the Admin SDK failed with "admin init failed require() of ES Module"
// and answered "not-configured". package.json pins jwks-rsa to a jose that
// ships CommonJS. These tests load the SDK the way Vercel does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const run = code => spawnSync(
  process.execPath,
  ['--no-experimental-require-module', '--input-type=module', '-e', code],
  { encoding: 'utf8' },
);

test('firebase-admin auth and firestore load when require() cannot load ES modules', () => {
  const result = run(`
    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore } = await import('firebase-admin/firestore');
    if (typeof getAuth !== 'function' || typeof getFirestore !== 'function') process.exit(2);
  `);
  assert.equal(result.status, 0, result.stderr);
});

test('jwks-rsa is pinned to a jose with a CommonJS entry', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.overrides?.['jwks-rsa']?.jose, '5.10.0');
});
