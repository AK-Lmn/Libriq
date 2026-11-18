import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compareTimes, mergeBooks } from '../frontend/js/services/syncMerge.js';

// Simple stand-ins for the sync helpers: content equality by JSON, field merge
// as a spread, local conversion as a copy.
const helpers = {
  fingerprint: book => JSON.stringify({ title: book.title, updatedAt: book.updatedAt, isFavorite: Boolean(book.isFavorite), deletedAt: book.deletedAt ?? null }),
  normalize: book => book,
  mergeOne: (local, remote) => ({ ...local, ...remote }),
  toLocal: remote => ({ ...remote, local: true }),
};
const T1 = '2026-11-18T10:00:00.000Z';
const T2 = '2026-11-18T11:00:00.000Z';
const run = (localBooks, remoteBooks) => mergeBooks({ localBooks, remoteBooks, ...helpers });

test('compareTimes orders ISO timestamps and treats invalid as equal', () => {
  assert.equal(compareTimes(T2, T1), 1);
  assert.equal(compareTimes(T1, T2), -1);
  assert.equal(compareTimes(T1, T1), 0);
  assert.equal(compareTimes('not a date', T1), 0);
});

test('a remote book this device lacks is added', () => {
  const r = run([], [{ id: 'a', title: 'A', updatedAt: T1 }]);
  assert.equal(r.changed, true);
  assert.deepEqual(r.books.map(b => [b.id, b.local]), [['a', true]]);
  assert.equal(r.conflicts, 0);
});

test('a newer remote copy is merged in; an older one queues our upload', () => {
  const local = [{ id: 'a', title: 'Old', updatedAt: T1 }];
  const newer = run(local, [{ id: 'a', title: 'New', updatedAt: T2 }]);
  assert.equal(newer.changed, true);
  assert.equal(newer.books[0].title, 'New');
  assert.equal(newer.uploadNeeded, false);

  const older = run([{ id: 'a', title: 'Mine', updatedAt: T2 }], [{ id: 'a', title: 'Theirs', updatedAt: T1 }]);
  assert.equal(older.changed, false);
  assert.equal(older.books[0].title, 'Mine', 'local newer is kept');
  assert.equal(older.uploadNeeded, true, 'and pushed back up');
});

test('a tombstone removes the book only when it is at least as new as the local edit', () => {
  const removed = run([{ id: 'a', title: 'A', updatedAt: T1 }], [{ id: 'a', deletedAt: T2, updatedAt: T2 }]);
  assert.equal(removed.changed, true);
  assert.deepEqual(removed.books, []);

  const kept = run([{ id: 'a', title: 'A', updatedAt: T2 }], [{ id: 'a', deletedAt: T1, updatedAt: T1 }]);
  assert.equal(kept.books.length, 1, 'an edit after the delete wins');
});

test('timestamp ties: an identical copy is an echo, a favourite flip is applied, anything else is a conflict', () => {
  const echo = run([{ id: 'a', title: 'A', updatedAt: T1 }], [{ id: 'a', title: 'A', updatedAt: T1 }]);
  assert.deepEqual([echo.changed, echo.conflicts], [false, 0], 'own upload coming back is not a conflict');

  const favourite = run([{ id: 'a', title: 'A', updatedAt: T1, isFavorite: false }], [{ id: 'a', title: 'A', updatedAt: T1, isFavorite: true }]);
  assert.equal(favourite.changed, true);
  assert.equal(favourite.books[0].isFavorite, true);

  const conflict = run([{ id: 'a', title: 'Mine', updatedAt: T1 }], [{ id: 'a', title: 'Theirs', updatedAt: T1 }]);
  assert.deepEqual([conflict.changed, conflict.conflicts], [false, 1]);
  assert.equal(conflict.books[0].title, 'Mine', 'the local copy is kept on a real conflict');
});

test('remote entries without an id are ignored, and inputs are not mutated', () => {
  const local = [{ id: 'a', title: 'A', updatedAt: T1 }];
  const snapshot = JSON.stringify(local);
  run(local, [{ title: 'no id' }, null, { id: 'a', title: 'B', updatedAt: T2 }]);
  assert.equal(JSON.stringify(local), snapshot);
});

test('sync.js delegates its merge decisions to mergeBooks', async () => {
  const sync = await readFile(new URL('../frontend/js/sync.js', import.meta.url), 'utf8');
  const apply = sync.slice(sync.indexOf('function applyRemoteBooks'), sync.indexOf('function applyInitialRemoteBooks'));
  assert.ok(apply.includes('mergeBooks({'), 'applyRemoteBooks uses mergeBooks');
  assert.ok(!apply.includes('remoteBooks.forEach'), 'the inline merge loop is gone');
});
