import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { STORAGE_KEYS } from '../frontend/js/shared/storageKeys.js';

const root = path.join(process.cwd(), 'frontend', 'js');
// shell-hint.js is a classic script and can't import STORAGE_KEYS (see the
// note in storageKeys.js); app.bundle.js is generated.
const SKIP = new Set(['shared/storageKeys.js', 'shell-hint.js', 'app.bundle.js', 'config.local.js']);

async function sources() {
  const out = [];
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (entry.isDirectory()) await walk(full);
      else if (rel.endsWith('.js') && !SKIP.has(rel)) out.push({ rel, text: await readFile(full, 'utf8') });
    }
  };
  await walk(root);
  return out;
}

const keyLiterals = text => new Set([...text.matchAll(/['"`](libriq_[a-z0-9_]+)['"`]/g)].map(m => m[1]));

test('a storage key written out in two modules belongs in STORAGE_KEYS', async () => {
  const where = new Map();
  for (const { rel, text } of await sources()) {
    for (const key of keyLiterals(text)) where.set(key, [...(where.get(key) || []), rel]);
  }
  const shared = [...where].filter(([, files]) => files.length > 1).map(([key, files]) => `${key}: ${files.join(', ')}`);
  assert.deepEqual(shared, [], 'move these to frontend/js/shared/storageKeys.js');
});

test('modules use STORAGE_KEYS instead of repeating its values', async () => {
  const values = new Set(Object.values(STORAGE_KEYS));
  const repeated = [];
  for (const { rel, text } of await sources()) {
    for (const key of keyLiterals(text)) if (values.has(key)) repeated.push(`${rel}: ${key}`);
  }
  assert.deepEqual(repeated, []);
});

test('shell-hint.js reads the same keys the app writes', async () => {
  const hint = await readFile(path.join(root, 'shell-hint.js'), 'utf8');
  assert.ok(hint.includes(`'${STORAGE_KEYS.SESSION_PREF}'`), 'session preference key matches');
  assert.ok(hint.includes(`'${STORAGE_KEYS.ACTIVE_ACCOUNT_UID}'`), 'active account key matches');
  const values = new Set(Object.values(STORAGE_KEYS));
  for (const key of keyLiterals(hint)) assert.ok(values.has(key), `${key} in shell-hint.js is a STORAGE_KEYS value`);
});
