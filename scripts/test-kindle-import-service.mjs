import assert from 'node:assert/strict';
import { createKindleImportService, normalizeKindleImportText } from '../frontend/js/services/kindleImportService.js';

let idSequence = 0;
const service = createKindleImportService({
  createBook: data => ({ status: 'wishlist', ...data }),
  createId: () => `kindle-${++idSequence}`,
  now: () => '2026-08-10T00:00:00.000Z',
});

const highlight = (text, location = '1') => ({ type: 'highlight', location, addedAt: '2026-01-01', text });
const note = (text, location = '2') => ({ type: 'note', location, addedAt: '2026-01-02', text });

const existingByTitle = { id: 'existing-dune', title: 'Dune', author: 'Frank Herbert', isbn: '9780441172719' };
const titleMatch = service.buildImportPlan({
  parsedBooks: [{ title: '  DUNE! ', author: ' frank   herbert ', entries: [highlight('Fear is the mind-killer.')] }],
  existingBooks: [existingByTitle],
});
assert.equal(titleMatch.booksMatched, 1);
assert.equal(titleMatch.booksCreated, 0);
assert.equal(titleMatch.matchedBooks[0].existingBook, existingByTitle);
assert.equal(titleMatch.highlightsToImport[0].bookId, 'existing-dune');

const idPriority = service.buildImportPlan({
  parsedBooks: [{ id: 'id-match', isbn: 'isbn-match', title: 'Different', author: 'Writer', entries: [note('ID wins')] }],
  existingBooks: [
    { id: 'id-match', isbn: 'other', title: 'First', author: 'Author' },
    { id: 'other', isbn: 'isbn-match', title: 'Second', author: 'Author' },
  ],
});
assert.equal(idPriority.matchedBooks[0].existingBook.id, 'id-match');

const isbnMatch = service.buildImportPlan({
  parsedBooks: [{ isbn: '9780000000001', title: 'Unknown Edition', author: 'Someone', entries: [highlight('ISBN match')] }],
  existingBooks: [{ id: 'isbn-book', isbn: '9780000000001', title: 'Known Edition', author: 'Someone' }],
});
assert.equal(isbnMatch.matchedBooks[0].existingBook.id, 'isbn-book');

const unmatched = service.buildImportPlan({
  parsedBooks: [{ title: 'New Kindle Book', author: 'New Author', entries: [highlight('New highlight'), note('New note')] }],
  existingBooks: [],
});
assert.equal(unmatched.booksMatched, 0);
assert.equal(unmatched.booksCreated, 1);
assert.equal(unmatched.booksToCreate[0].candidate.id, 'kindle-1');
assert.equal(unmatched.booksToCreate[0].candidate.source, 'kindle');
assert.equal(unmatched.booksToCreate[0].candidate.dateAdded, '2026-08-10T00:00:00.000Z');
assert.equal(unmatched.totalHighlights, 1);
assert.equal(unmatched.totalNotes, 1);

const duplicateParsed = service.buildImportPlan({
  parsedBooks: [
    { title: 'Duplicate Book', author: 'Same Author', entries: [highlight('First'), highlight('Repeated')] },
    { title: 'duplicate book', author: 'same author', entries: [highlight('Repeated'), note('Second')] },
  ],
  existingBooks: [],
});
assert.equal(duplicateParsed.booksCreated, 1);
assert.equal(duplicateParsed.totalHighlights, 2);
assert.equal(duplicateParsed.totalNotes, 1);

assert.equal(normalizeKindleImportText('  García—Márquez: One Hundred Years!  '), 'garc a m rquez one hundred years');

const missingAuthor = service.buildImportPlan({
  parsedBooks: [{ title: 'Authorless', author: null, entries: [highlight('No author')] }],
  existingBooks: [{ id: 'authorless-existing', title: 'Authorless', author: null }],
});
assert.equal(missingAuthor.booksMatched, 1);
assert.equal(missingAuthor.matchedBooks[0].existingBook.id, 'authorless-existing');

const missingAuthorCreate = service.buildImportPlan({
  parsedBooks: [{ title: 'New Authorless', entries: [note('Still valid')] }],
  existingBooks: [],
});
assert.equal(missingAuthorCreate.booksToCreate[0].candidate.author, 'Unknown Author');

const mixed = service.buildImportPlan({
  parsedBooks: [
    { title: 'Dune', author: 'Frank Herbert', entries: [highlight('Matched highlight'), note('Matched note')] },
    { title: 'Brand New', author: 'Writer', entries: [highlight('Created highlight')] },
  ],
  existingBooks: [existingByTitle],
});
assert.equal(mixed.booksMatched, 1);
assert.equal(mixed.booksCreated, 1);
assert.equal(mixed.totalHighlights, 2);
assert.equal(mixed.totalNotes, 1);
assert.equal(mixed.highlightsToImport[0].targetKind, 'existing');
assert.equal(mixed.highlightsToImport[1].targetKind, 'candidate');

assert.deepEqual(service.buildImportPlan({ parsedBooks: [], existingBooks: [] }), {
  matchedBooks: [],
  booksToCreate: [],
  highlightsToImport: [],
  notesToImport: [],
  booksMatched: 0,
  booksCreated: 0,
  totalHighlights: 0,
  totalNotes: 0,
});

const malformed = service.buildImportPlan({
  parsedBooks: [null, 'bad', {}, { title: '', entries: [] }, { title: 'No Entries' }, {
    title: 'Partly Valid',
    author: 'Reader',
    entries: [null, { type: 'bookmark', text: 'Ignore' }, { type: 'highlight', text: '' }, highlight('Keep')],
  }],
  existingBooks: [null, 'bad'],
});
assert.equal(malformed.booksCreated, 1);
assert.equal(malformed.totalHighlights, 1);
assert.equal(malformed.totalNotes, 0);
assert.equal(malformed.booksToCreate[0].parsedBook.title, 'Partly Valid');

assert.throws(() => createKindleImportService({}), /requires createBook, createId, and now/);

console.log('Kindle import service tests passed');
