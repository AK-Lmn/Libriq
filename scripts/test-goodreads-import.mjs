import assert from 'node:assert/strict';
import { parseCsvRows, parseGoodreadsCsv } from '../frontend/js/services/goodreadsCsvParser.js';
import { createGoodreadsImportService, mapGoodreadsShelf, buildGoodreadsImportPlan } from '../frontend/js/services/goodreadsImportService.js';
import { executeGoodreadsImport } from '../frontend/js/services/goodreadsImportExecution.js';

console.log('Testing CSV parser...');

// Test 1: basic CSV parsing with quotes and commas
const csvInput = `Title,Author,Notes\n"Dune","Frank Herbert","Epic sci-fi, must read"\n"1984","George Orwell","Classic"`;
const parsedRows = parseCsvRows(csvInput);
assert.equal(parsedRows.length, 3);
assert.deepEqual(parsedRows[0], ['Title', 'Author', 'Notes']);
assert.deepEqual(parsedRows[1], ['Dune', 'Frank Herbert', 'Epic sci-fi, must read']);
assert.deepEqual(parsedRows[2], ['1984', 'George Orwell', 'Classic']);

// Test 2: CSV with escaped quotes and multiline fields
const multilineCsv = `Title,Author,Review\n"Project Hail Mary","Andy Weir","First line\nSecond line with ""quoted text"""`;
const multilineRows = parseCsvRows(multilineCsv);
assert.equal(multilineRows.length, 2);
assert.equal(multilineRows[1][2], 'First line\nSecond line with "quoted text"');

console.log('Testing Goodreads CSV export parsing...');

// Test 3: Standard Goodreads export file format
const sampleGoodreadsCsv = `Book Id,Title,Author,Author l-f,Additional Authors,ISBN,ISBN13,My Rating,Average Rating,Publisher,Binding,Number of Pages,Year Published,Original Publication Year,Date Read,Date Added,Bookshelves,Bookshelves with positions,Exclusive Shelf,My Review,Spoiler,Private Notes,Read Count,Recommended For,Recommended By,Owned Copies,Original Purchase Date,Original Purchase Location,Condition,Condition Description,BCID
11870085,"The Fault in Our Stars","John Green","Green, John","",="0525478817",="9780525478812",5,4.14,"Dutton Books","Hardcover",313,2012,2012,2023/04/10,2022/11/01,"favorites, ya",favorites (#1),read,"Heartbreaking and beautiful.","","Keep personal box of tissues",1,,,,,,,
2767052,"The Hunger Games","Suzanne Collins","Collins, Suzanne","",="0439023483",="9780439023481",4,4.34,"Scholastic Press","Hardcover",374,2008,2008,,2023/01/15,"sci-fi",sci-fi (#2),currently-reading,"Compelling survival story.","","",1,,,,,,,
41865,"Setting Sun","Osamu Dazai","Dazai, Osamu","",="081120032X",="9780811200325",0,3.95,"New Directions","Paperback",175,1956,1947,,2024/02/01,"japanese",japanese (#3),to-read,"","","",0,,,,,,,
`;

const goodreadsParsed = parseGoodreadsCsv(sampleGoodreadsCsv);
assert.equal(goodreadsParsed.ok, true);
assert.equal(goodreadsParsed.books.length, 3);
assert.equal(goodreadsParsed.totals.total, 3);
assert.equal(goodreadsParsed.totals.read, 1);
assert.equal(goodreadsParsed.totals.currentlyReading, 1);
assert.equal(goodreadsParsed.totals.toRead, 1);
assert.equal(goodreadsParsed.totals.rated, 2);
assert.equal(goodreadsParsed.totals.reviewed, 2);

// Check first book details
const b1 = goodreadsParsed.books[0];
assert.equal(b1.title, 'The Fault in Our Stars');
assert.equal(b1.author, 'John Green');
assert.equal(b1.isbn10, '0525478817');
assert.equal(b1.isbn13, '9780525478812');
assert.equal(b1.rating, 5);
assert.equal(b1.publisher, 'Dutton Books');
assert.equal(b1.pageCount, 313);
assert.equal(b1.publishYear, 2012);
assert.equal(b1.dateRead, '2023-04-10');
assert.equal(b1.dateAdded, '2022-11-01');
assert.equal(b1.exclusiveShelf, 'read');
assert.equal(b1.isFavorite, true);
assert.match(b1.notes, /Review: Heartbreaking and beautiful/);
assert.match(b1.notes, /Private Notes: Keep personal box of tissues/);

// Check unrated book
const b3 = goodreadsParsed.books[2];
assert.equal(b3.rating, null); // 0 becomes null
assert.equal(b3.exclusiveShelf, 'to-read');

console.log('Testing Goodreads import service & plan building...');

// Test 4: Shelf mapping
assert.equal(mapGoodreadsShelf('read'), 'finished');
assert.equal(mapGoodreadsShelf('currently-reading'), 'reading');
assert.equal(mapGoodreadsShelf('to-read'), 'wishlist');
assert.equal(mapGoodreadsShelf('did-not-finish'), 'abandoned');
assert.equal(mapGoodreadsShelf('custom-shelf'), 'wishlist');

// Test 5: Build import plan with existing book matching
const existingBooks = [
  {
    id: 'existing-hunger-games',
    title: 'The Hunger Games',
    author: 'Suzanne Collins',
    isbn: '9780439023481',
    status: 'reading',
    rating: null,
    notes: '',
  },
];

let idCounter = 1;
const service = createGoodreadsImportService({
  createBook: data => ({ ...data }),
  createId: () => `gen-id-${idCounter++}`,
  now: () => '2026-10-15T12:00:00.000Z',
});

const plan = service.buildImportPlan({
  parsedBooks: goodreadsParsed.books,
  existingBooks,
});

assert.equal(plan.totals.total, 3);
assert.equal(plan.totals.matched, 1);
assert.equal(plan.totals.toCreate, 2);
assert.equal(plan.matchedBooks[0].existingBook.id, 'existing-hunger-games');
assert.equal(plan.booksToCreate.length, 2);
assert.equal(plan.booksToCreate[0].candidate.title, 'The Fault in Our Stars');
assert.equal(plan.booksToCreate[0].candidate.status, 'finished');
assert.equal(plan.booksToCreate[0].candidate.source, 'goodreads');
assert.equal(plan.booksToCreate[1].candidate.title, 'Setting Sun');
assert.equal(plan.booksToCreate[1].candidate.status, 'wishlist');

console.log('Testing Goodreads import execution...');

// Test 6: Execute import and verify storage updates
const mockBooks = [...existingBooks];
const activityEvents = [];
const mockStorage = {
  getBooks: () => mockBooks,
  getBookById: id => mockBooks.find(b => b.id === id),
  addBook: book => {
    mockBooks.push(book);
    return true;
  },
  updateBook: (id, patch) => {
    const idx = mockBooks.findIndex(b => b.id === id);
    if (idx !== -1) {
      mockBooks[idx] = { ...mockBooks[idx], ...patch };
      return true;
    }
    return false;
  },
  buildActivityEvent: (type, target, details, category) => ({ type, target, details, category }),
  addActivityEvent: event => activityEvents.push(event),
};

const execResult = executeGoodreadsImport({
  importPlan: plan,
  storage: mockStorage,
  mergeMatched: true,
});

assert.equal(execResult.booksCreated, 2);
assert.equal(execResult.booksMatched, 1);
assert.equal(execResult.totalImported, 3);
assert.equal(mockBooks.length, 3);

// Verify matched book got enriched
const enriched = mockBooks.find(b => b.id === 'existing-hunger-games');
assert.equal(enriched.rating, 4); // Enriched from Goodreads rating
assert.equal(enriched.review, 'Compelling survival story.');
assert.equal(activityEvents.length, 1);
assert.equal(activityEvents[0].type, 'goodreads_imported');

console.log('All Goodreads import tests passed successfully!');
