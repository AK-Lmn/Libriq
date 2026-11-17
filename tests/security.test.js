import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { escapeHtml } from '../frontend/js/shared/escapeHtml.js';
import { hasRecentSignIn } from '../frontend/js/firebase-client.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('escapeHtml escapes every HTML-significant character', () => {
  assert.equal(escapeHtml(`<img src=x onerror="a('1')">&`), '&lt;img src=x onerror=&quot;a(&#39;1&#39;)&quot;&gt;&amp;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(42), '42');
});

test('no module falls back to unescaped text when Utils is missing', async () => {
  const design = await read('frontend/js/features/library/libraryDesign.js');
  assert.doesNotMatch(design, /sanitize\s*\|\|\s*\(\s*\w+\s*=>\s*String\(/, 'identity sanitize fallback');
  assert.match(design, /utils\?\.sanitize \|\| escapeHtml/);
  for (const file of [
    'frontend/js/features/goodreadsImport/goodreadsImportPage.js',
    'frontend/js/features/kindleImport/kindleImportPage.js',
  ]) {
    const source = await read(file);
    assert.match(source, /<h3>\$\{escapeHtml\(title\)\}<\/h3><p>\$\{escapeHtml\(body\)\}<\/p>/, `${file} escapes its messages`);
  }
});

test('hasRecentSignIn accepts only sign-ins from the last four minutes', () => {
  const now = Date.parse('2026-11-17T12:00:00Z');
  assert.equal(hasRecentSignIn('2026-11-17T11:58:00Z', now), true);
  assert.equal(hasRecentSignIn('2026-11-17T11:56:30Z', now), true);
  assert.equal(hasRecentSignIn('2026-11-17T11:55:30Z', now), false);
  assert.equal(hasRecentSignIn('2026-11-16T12:00:00Z', now), false);
  assert.equal(hasRecentSignIn('', now), false);
  assert.equal(hasRecentSignIn(null, now), false);
  assert.equal(hasRecentSignIn('2026-11-17T12:30:00Z', now), false, 'far-future auth time is not trusted');
});

test('account deletion checks the sign-in before deleting any data', async () => {
  const source = await read('frontend/js/firebase-client.js');
  const body = source.slice(source.indexOf('async function deleteCurrentUserAccount'), source.indexOf('function subscribe('));
  const check = body.indexOf('await assertRecentSignIn()');
  const wipe = body.indexOf('await deleteCurrentUserLibraryData()');
  const remove = body.indexOf('await deleteUser(');
  assert.ok(check > -1 && wipe > -1 && remove > -1);
  assert.ok(check < wipe && wipe < remove, 'order: sign-in check, data wipe, deleteUser');
  assert.doesNotMatch(body, /'backups', 'current'/, 'backups/current is deleted once, in deleteCurrentUserLibraryData');
});

test('CI workflows use a read-only token and actions pinned to commits', async () => {
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/sync-ci.yml']) {
    const workflow = await read(file);
    assert.match(workflow, /^permissions:\r?\n  contents: read\r?$/m, `${file} sets read-only permissions`);
    for (const [, ref] of workflow.matchAll(/uses:\s*[\w.-]+\/[\w.-]+@(\S+)/g)) {
      assert.match(ref, /^[0-9a-f]{40}$/, `${file} pins ${ref} to a commit SHA`);
    }
    assert.match(workflow, /persist-credentials: false/);
  }
});
