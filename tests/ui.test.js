import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RELEASE_NOTES_VERSION, getReleaseNotes, hasSeenRelease } from '../frontend/js/services/releaseNotes.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('Discover eyebrow shows no design-system jargon', async () => {
  const source = await read('frontend/js/features/recommendations/recommendationsPage.js');
  assert.doesNotMatch(source, /GLASS|REDUCED TRANSPARENCY|EMPTY LIBRARY SIGNAL/);
});

test('favourite button renders one heart', async () => {
  const source = await read('frontend/js/library.js');
  assert.doesNotMatch(source, /ph-fill ph-heart|ph ph-heart/, 'Phosphor heart duplicates the sprite heart');
});

test('dashboard recent books use readable status labels', async () => {
  const source = await read('frontend/js/dashboard.js');
  assert.match(source, /dashboard-recent-status[^>]*>\$\{Utils\.statusLabel\(book\.status\)\}/);
});

test('release notes are keyed to their own version, not the app version', () => {
  const notes = getReleaseNotes();
  assert.ok(notes.title.includes(`v${RELEASE_NOTES_VERSION}`));
  assert.equal(hasSeenRelease('4.8.0', '4.8.0'), true);
  assert.equal(hasSeenRelease('4.8.4', '4.8.0'), true, 'a later patch counts as seen');
  assert.equal(hasSeenRelease('4.10.0', '4.9.0'), true, 'numeric, not string, comparison');
  assert.equal(hasSeenRelease('4.7.9', '4.8.0'), false);
  assert.equal(hasSeenRelease('', '4.8.0'), false);
  assert.equal(hasSeenRelease('test', '4.8.0'), false);
});
