import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';

const repoRoot = process.cwd();

function loadScript(filePath, context) {
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, context, { filename: filePath });
}

function createContext() {
  const context = {
    console,
    window: null,
  };
  context.window = context;
  return context;
}

function main() {
  const context = createContext();
  context.crypto = { randomUUID: crypto.randomUUID };
  loadScript(path.join(repoRoot, 'frontend/js/api/bookIdentity.js'), context);
  loadScript(path.join(repoRoot, 'frontend/js/data.js'), context);
  loadScript(path.join(repoRoot, 'frontend/js/api/normalizeBook.js'), context);
  loadScript(path.join(repoRoot, 'frontend/js/api/mergeBooks.js'), context);

  const basics = vm.runInNewContext(`
    ({
      isbn: BookIdentity.normalizeIsbn('978-0-00-000000-0'),
      title: BookIdentity.normalizeTitle('The Hobbit: An Unexpected Journey!'),
      author: BookIdentity.normalizeAuthor('By J.R.R. Tolkien'),
    })
  `, context);

  assert.equal(basics.isbn, '9780000000000');
  assert.equal(basics.title, 'the hobbit an unexpected journey');
  assert.equal(basics.author, 'j r r tolkien');

  const bookShapes = vm.runInNewContext(`
    (() => {
      const ol = NormalizeBook.fromOpenLibrary({
        key: '/books/OL123M',
        title: 'The Hobbit',
        author_name: ['J.R.R. Tolkien'],
        isbn: ['9780000000000', '0000000000'],
        subject: ['Fantasy'],
        language: ['eng'],
      });
      const gb = NormalizeBook.fromGoogleBooks({
        id: 'gb-123',
        volumeInfo: {
          title: 'The Hobbit',
          authors: ['J.R.R. Tolkien'],
          industryIdentifiers: [
            { type: 'ISBN_13', identifier: '9780000000000' },
          ],
          categories: ['Fantasy'],
        },
      });
      const merged = MergeBooks.merge([ol], [gb]);
      return { ol, gb, merged, same: BookIdentity.isSameBook(ol, gb) };
    })()
  `, context);

  assert.ok(bookShapes.same);
  const merged = bookShapes.merged;
  assert.equal(merged.length, 1);
  assert.ok(Array.isArray(merged[0].sourceBadges));
  assert.ok(merged[0].sourceBadges.includes('Open Library'));
  assert.ok(merged[0].sourceBadges.includes('Google Books'));

  const savedBook = {
    id: 'saved-1',
    title: 'The Hobbit',
    author: 'J.R.R. Tolkien',
    isbn: '9780000000000',
    source: 'openlibrary',
  };
  assert.ok(vm.runInNewContext(`BookIdentity.isSameBook(${JSON.stringify(savedBook)}, ${JSON.stringify(bookShapes.gb)})`, context));

  const richBook = vm.runInNewContext(`createBook({
    id: 'rich-1',
    title: 'Rich Book',
    author: 'LibriQ',
    review: 'Great read',
    genres: ['Fantasy'],
    subjects: ['Magic'],
    subjectPeople: ['Wizard'],
    subjectPlaces: ['Hogwarts'],
    subjectTimes: ['1980s'],
    publisher: 'LibriQ Press',
    language: 'English',
    description: 'A rich test book.',
    dateAdded: '2024-01-01T00:00:00.000Z',
    dateStarted: '2024-01-02T00:00:00.000Z',
    dateFinished: '2024-01-03T00:00:00.000Z',
    notesUpdatedAt: '2024-01-04T00:00:00.000Z',
    source: 'openlibrary',
    sourceIds: { openlibrary: '/books/OL1M' },
    sources: ['Open Library'],
    sourceBadges: ['Open Library'],
    identifiers: [{ type: 'ISBN_13', identifier: '9780000000000' }],
    isbns: ['9780000000000'],
    googleBooksId: 'gb-1',
    openLibraryId: '/books/OL1M',
    openLibraryWorkKey: '/works/OL1W',
    openLibraryEditionKey: '/books/OL1M',
    openLibraryAuthorKeys: ['/authors/OL1A'],
    gutendexId: '42',
    gutenbergId: '4242',
    internetArchiveId: 'ia-1',
    internetArchiveIds: ['ia-1'],
    archiveUrl: 'https://archive.org/details/rich-book',
    readableSourceLinks: ['https://archive.org/details/rich-book'],
    downloadLinks: { html: 'https://example.com/book.html' },
  })`, context);

  assert.equal(richBook.review, 'Great read');
  assert.equal(JSON.stringify(richBook.genres), JSON.stringify(['Fantasy']));
  assert.equal(JSON.stringify(richBook.subjects), JSON.stringify(['Magic']));
  assert.equal(JSON.stringify(richBook.subjectPeople), JSON.stringify(['Wizard']));
  assert.equal(JSON.stringify(richBook.subjectPlaces), JSON.stringify(['Hogwarts']));
  assert.equal(JSON.stringify(richBook.subjectTimes), JSON.stringify(['1980s']));
  assert.equal(richBook.publisher, 'LibriQ Press');
  assert.equal(richBook.language, 'English');
  assert.equal(richBook.notesUpdatedAt, '2024-01-04T00:00:00.000Z');
  assert.equal(richBook.sourceIds.openlibrary, '/books/OL1M');
  assert.equal(richBook.googleBooksId, 'gb-1');
  assert.equal(richBook.openLibraryWorkKey, '/works/OL1W');
  assert.equal(richBook.openLibraryEditionKey, '/books/OL1M');
  assert.equal(JSON.stringify(richBook.openLibraryAuthorKeys), JSON.stringify(['/authors/OL1A']));
  assert.equal(richBook.archiveUrl, 'https://archive.org/details/rich-book');
  assert.equal(richBook.downloadLinks.html, 'https://example.com/book.html');

  const oldSavedBook = {
    id: 'legacy-1',
    title: 'Some Book',
    author: 'Some Author',
  };
  assert.doesNotThrow(() => vm.runInNewContext(`BookIdentity.getSourceLabels(${JSON.stringify(oldSavedBook)})`, context));

  console.log('book identity test passed');
}

main();
