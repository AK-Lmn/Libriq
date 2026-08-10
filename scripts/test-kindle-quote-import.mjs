import assert from 'node:assert/strict';
import { createKindleQuoteImport, extractKindlePage } from '../frontend/js/services/kindleQuoteImport.js';

let idSequence = 0;
const service = createKindleQuoteImport({
  createId: () => `quote-${++idSequence}`,
  now: () => '2026-08-10T00:00:00.000Z',
});

const highlightPlan = {
  matchedBooks: [{ bookId: 'book-1', entries: [{ type: 'highlight', location: '120-121', text: 'A memorable passage.' }] }],
  booksToCreate: [],
};
const highlightResult = service.applyKindleImportPlan({ importPlan: highlightPlan });
assert.equal(highlightResult.importedQuotes, 1);
assert.equal(highlightResult.skippedQuotes, 0);
assert.deepEqual(highlightResult.matchedBooks[0], {
  bookId: 'book-1',
  quotes: [{
    id: 'quote-1',
    text: 'A memorable passage.',
    page: 120,
    note: '',
    source: 'kindle',
    createdAt: '2026-08-10T00:00:00.000Z',
    updatedAt: '2026-08-10T00:00:00.000Z',
  }],
});

const noteResult = service.applyKindleImportPlan({
  importPlan: {
    matchedBooks: [{ bookId: 'book-2', entries: [{ type: 'note', location: 'Location 44', text: 'Compare this with chapter two.' }] }],
    booksToCreate: [],
  },
});
assert.equal(noteResult.matchedBooks[0].quotes[0].text, '');
assert.equal(noteResult.matchedBooks[0].quotes[0].note, 'Compare this with chapter two.');
assert.equal(noteResult.matchedBooks[0].quotes[0].page, 44);

const mixedResult = service.applyKindleImportPlan({
  importPlan: {
    matchedBooks: [{
      bookId: 'book-3',
      entries: [
        { type: 'highlight', location: '8', text: 'Highlight text' },
        { type: 'note', location: '9', text: 'Note text' },
      ],
    }],
    booksToCreate: [],
  },
});
assert.equal(mixedResult.importedQuotes, 2);
assert.equal(mixedResult.matchedBooks[0].quotes.length, 2);
assert.deepEqual(mixedResult.matchedBooks[0].quotes.map(quote => quote.page), [8, 9]);

assert.equal(extractKindlePage('200-205'), 200);
assert.equal(extractKindlePage('Location 77'), 77);
assert.equal(extractKindlePage('No location'), null);
assert.equal(extractKindlePage(null), null);

const existingQuote = {
  id: 'existing-quote',
  text: 'Same punctuation!',
  page: 12,
  note: '',
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
};
const duplicateExisting = service.applyKindleImportPlan({
  importPlan: {
    matchedBooks: [{ bookId: 'book-4', entries: [{ type: 'highlight', location: '12', text: ' same punctuation ' }] }],
    booksToCreate: [],
  },
  existingQuotesByBookId: { 'book-4': [existingQuote] },
});
assert.equal(duplicateExisting.importedQuotes, 0);
assert.equal(duplicateExisting.skippedQuotes, 1);
assert.deepEqual(duplicateExisting.matchedBooks[0].quotes, [existingQuote]);

const duplicateImport = service.applyKindleImportPlan({
  importPlan: {
    matchedBooks: [{
      bookId: 'book-5',
      entries: [
        { type: 'highlight', location: '30', text: 'Repeated quote' },
        { type: 'highlight', location: '30', text: 'Repeated quote!' },
      ],
    }],
    booksToCreate: [],
  },
});
assert.equal(duplicateImport.importedQuotes, 1);
assert.equal(duplicateImport.skippedQuotes, 1);

const emptyEntries = service.applyKindleImportPlan({
  importPlan: {
    matchedBooks: [{
      bookId: 'book-6',
      entries: [
        { type: 'highlight', location: '1', text: '' },
        { type: 'note', location: '2', text: '   ' },
        null,
      ],
    }],
    booksToCreate: [],
  },
});
assert.equal(emptyEntries.importedQuotes, 0);
assert.equal(emptyEntries.skippedQuotes, 3);

const unicodeResult = service.applyKindleImportPlan({
  importPlan: {
    matchedBooks: [{ bookId: 'book-7', entries: [{ type: 'highlight', location: null, text: '百年孤独 — García Márquez 📚' }] }],
    booksToCreate: [],
  },
});
assert.equal(unicodeResult.matchedBooks[0].quotes[0].text, '百年孤独 — García Márquez 📚');
assert.equal(unicodeResult.matchedBooks[0].quotes[0].page, null);

const candidateBook = { id: 'candidate-1', title: 'New Book', quotes: [] };
const multipleBooks = service.applyKindleImportPlan({
  importPlan: {
    matchedBooks: [{ bookId: 'book-8', entries: [{ type: 'note', text: 'Existing book note' }] }],
    booksToCreate: [{ candidateBook, entries: [{ type: 'highlight', location: '5', text: 'New book highlight' }] }],
  },
});
assert.equal(multipleBooks.matchedBooks.length, 1);
assert.equal(multipleBooks.booksToCreate.length, 1);
assert.equal(multipleBooks.booksToCreate[0].candidateBook, candidateBook);
assert.equal(multipleBooks.importedQuotes, 2);
assert.equal(multipleBooks.booksCreated, 1);

const phaseTwoCandidate = { id: 'candidate-2', title: 'Phase Two Shape', quotes: [] };
const phaseTwoCompatibility = service.applyKindleImportPlan({
  importPlan: {
    matchedBooks: [{ existingBook: { id: 'book-9' }, entries: [{ type: 'highlight', text: 'Compatible match' }] }],
    booksToCreate: [{ candidate: phaseTwoCandidate, entries: [{ type: 'note', text: 'Compatible candidate' }] }],
  },
});
assert.equal(phaseTwoCompatibility.matchedBooks[0].bookId, 'book-9');
assert.equal(phaseTwoCompatibility.booksToCreate[0].candidateBook, phaseTwoCandidate);

assert.deepEqual(service.applyKindleImportPlan({ importPlan: {} }), {
  matchedBooks: [],
  booksToCreate: [],
  importedQuotes: 0,
  skippedQuotes: 0,
  booksCreated: 0,
});

assert.throws(() => createKindleQuoteImport({}), /requires createId and now/);

console.log('Kindle quote import tests passed');
