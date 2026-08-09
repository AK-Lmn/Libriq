import assert from 'node:assert/strict';
import { buildYearlyRecap, getRecapYears, rankRatedBooks } from '../frontend/js/features/statistics/statisticsCalculations.js';

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const options = { finishedStatus: 'finished', monthLabels };
const books = [
  { id: 'top', status: 'finished', dateFinished: '2025-12-31T23:59:59Z', pageCount: 300, rating: 5, genres: ['Fantasy'], tags: ['Owned'] },
  { id: 'second', status: 'finished', dateFinished: '2025-06-15T12:00:00Z', pageCount: '200', rating: 4, genres: ['Fantasy'], tags: ['Owned'] },
  { id: 'fallback', status: 'finished', updatedAt: '2025-01-02T00:00:00Z', pageCount: 100, rating: 3 },
  { id: 'boundary', status: 'finished', dateFinished: '2026-01-01T00:00:00Z', pageCount: 500, rating: 5 },
  { id: 'reading', status: 'reading', dateFinished: '2025-08-01T00:00:00Z', pageCount: 900, rating: 5 },
];

const recap = buildYearlyRecap(books, 2025, options);
assert.equal(recap.finishedCount, 3);
assert.equal(recap.pagesRead, 600);
assert.equal(recap.avgRating, '4.0');
assert.deepEqual(recap.highestRatedBooks.map(book => book.id), ['top']);
assert.equal(recap.longestBook.id, 'top');
assert.deepEqual(recap.topBucket, { name: 'Owned', count: 2, type: 'shelf' });
assert.equal(recap.missingFinishDates, 1);

const empty = buildYearlyRecap([], 2025, options);
assert.equal(empty.finishedCount, 0);
assert.equal(empty.pagesRead, 0);
assert.equal(empty.avgRating, null);
assert.deepEqual(empty.highestRatedBooks, []);
assert.equal(empty.longestBook, null);
assert.equal(empty.topBucket, null);

assert.equal(buildYearlyRecap(books, 2026, options).finishedCount, 1);
assert.deepEqual(getRecapYears(books, 2027, 'finished'), [2027, 2026, 2025]);
assert.deepEqual(rankRatedBooks(books).map(book => book.id), ['top', 'boundary', 'reading', 'second', 'fallback']);

console.log('Statistics calculation tests passed');
