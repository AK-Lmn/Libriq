import assert from 'node:assert/strict';
import {
  bookMergeKey, createImportMerge, getReliableBookTime, mergeActivityById, normalizeMergeText,
  preferNumeric, preferRating, preferStatus,
} from '../frontend/js/services/importMerge.js';

const statuses = { READING: 'reading', FINISHED: 'finished', WISHLIST: 'wishlist' };
const fixedNow = '2026-08-10T00:00:00.000Z';
const service = createImportMerge({
  createBook: book => ({ status: 'wishlist', tags: [], genres: [], quotes: [], ...book }),
  statuses, now: () => fixedNow, createId: () => 'generated-id',
});

assert.equal(normalizeMergeText('  The—BOOK!!  '), 'the book');
assert.equal(bookMergeKey({ title: 'The Book', author: 'A. Writer' }), 'the book|a writer');
assert.equal(getReliableBookTime({ notesUpdatedAt: '2024-01-01', dateFinished: '2025-01-01' }), new Date('2024-01-01').getTime());
assert.equal(getReliableBookTime({}), 0);

assert.equal(preferNumeric(20, 30), 30);
assert.equal(preferNumeric('bad', 12), 12);
assert.equal(preferNumeric('bad', 'also bad'), 0);
assert.equal(preferRating(3, 5), 5);
assert.equal(preferRating('bad', 4), 4);
assert.equal(preferRating('bad', 'also bad'), null);
assert.equal(preferStatus('reading', 'wishlist', statuses), 'reading');
assert.equal(preferStatus('dnf', 'finished', statuses), 'finished');
assert.equal(preferStatus(null, null, statuses), 'wishlist');

const mergedRecord = service.mergeBookRecords({
  id: 'local', title: 'Local title', notes: 'Local note', notesUpdatedAt: '2024-01-01',
  dateAdded: '2024-01-01', status: 'reading', currentPage: 80, rating: 3,
  tags: ['owned'], genres: ['Fantasy'], quotes: [{ id: 'q1', text: 'old', updatedAt: '2024-01-01' }],
}, {
  id: 'incoming', title: 'Newer title', notes: 'Imported note', notesUpdatedAt: '2025-01-01',
  dateAdded: '2025-01-01', status: 'finished', currentPage: 50, rating: 5,
  tags: ['owned', 'ebook'], genres: ['Fantasy', 'Adventure'],
  quotes: [{ id: 'q1', text: 'new', updatedAt: '2025-01-01' }, { id: 'q2', text: 'second' }],
});
assert.equal(mergedRecord.id, 'local');
assert.equal(mergedRecord.title, 'Newer title');
assert.equal(mergedRecord.notes, 'Local note');
assert.equal(mergedRecord.status, 'finished');
assert.equal(mergedRecord.currentPage, 80);
assert.equal(mergedRecord.rating, 5);
assert.deepEqual(mergedRecord.tags, ['owned', 'ebook']);
assert.deepEqual(mergedRecord.genres, ['Fantasy', 'Adventure']);
assert.equal(mergedRecord.quotes.find(quote => quote.id === 'q1').text, 'new');
assert.equal(mergedRecord.quotes.find(quote => quote.id === 'q2').createdAt, fixedNow);

const generated = service.mergeBookRecords({}, {});
assert.equal(generated.id, 'generated-id');
assert.equal(generated.dateAdded, fixedNow);

const current = [
  { id: 'id-match', isbn: '111', title: 'First', author: 'One', currentPage: 1 },
  { id: 'isbn-local', isbn: '222', title: 'Second', author: 'Two' },
  { id: 'title-local', title: 'Same Title', author: 'Same Author' },
];
const mergedBooks = service.mergeBooksForImport(current, [
  { id: 'id-match', isbn: '999', title: 'ID match', author: 'Other', currentPage: 10 },
  { id: 'other-id', isbn: '222', title: 'ISBN match', author: 'Other' },
  { id: 'third-id', title: 'same--title', author: 'same author' },
  { id: 'new-id', title: 'Brand New', author: 'Writer' },
]);
assert.equal(mergedBooks.length, 4);
assert.equal(mergedBooks[0].currentPage, 10);
assert.equal(mergedBooks[1].id, 'isbn-local');
assert.equal(mergedBooks[2].id, 'title-local');
assert.equal(mergedBooks[3].id, 'new-id');

const activities = mergeActivityById(
  [{ id: 'same', timestamp: '2025-01-02', value: 'local' }, { id: 'local', timestamp: '2025-01-03' }],
  [{ id: 'same', timestamp: '2025-01-01', value: 'imported' }, { id: 'new', timestamp: '2025-01-04' }],
);
assert.deepEqual(activities.map(event => event.id), ['same', 'local', 'new']);
assert.equal(activities[0].value, 'imported');

const summary = service.summarizeLibrary([
  { status: 'reading', notes: 'note', quotes: [{ id: 'q' }], updatedAt: '2025-01-02' },
  { status: 'finished', notes: '', quotes: [], dateFinished: '2025-01-03' },
], [{ id: 'event' }]);
assert.deepEqual(summary, {
  bookCount: 2, readingCount: 1, finishedCount: 1, notesCount: 1, quotesCount: 1,
  activityCount: 1, lastUpdatedAt: '2025-01-03T00:00:00.000Z',
});
assert.deepEqual(service.summarizeLibrary(null, null), {
  bookCount: 0, readingCount: 0, finishedCount: 0, notesCount: 0, quotesCount: 0,
  activityCount: 0, lastUpdatedAt: null,
});

console.log('Import merge tests passed');
