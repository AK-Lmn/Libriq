import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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
  loadScript(path.join(repoRoot, 'frontend/js/api/bookIdentity.js'), context);
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

  const oldSavedBook = {
    id: 'legacy-1',
    title: 'Some Book',
    author: 'Some Author',
  };
  assert.doesNotThrow(() => vm.runInNewContext(`BookIdentity.getSourceLabels(${JSON.stringify(oldSavedBook)})`, context));

  console.log('book identity test passed');
}

main();
