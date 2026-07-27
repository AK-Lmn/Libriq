import assert from 'node:assert/strict';
import * as BookIdentity from '../frontend/js/api/bookIdentity.js';
import { NormalizeBook } from '../frontend/js/api/normalizeBook.js';
import { MergeBooks } from '../frontend/js/api/mergeBooks.js';

const basics = {
  isbn: BookIdentity.normalizeIsbn('978-0-00-000000-0'),
  title: BookIdentity.normalizeTitle('The Hobbit: An Unexpected Journey!'),
  author: BookIdentity.normalizeAuthor('By J.R.R. Tolkien'),
};
assert.equal(basics.isbn, '9780000000000');
assert.equal(basics.title, 'the hobbit an unexpected journey');
assert.equal(basics.author, 'j r r tolkien');

const ol = NormalizeBook.fromOpenLibrary({
  key: '/books/OL123M', title: 'The Hobbit', author_name: ['J.R.R. Tolkien'],
  isbn: ['9780000000000', '0000000000'], subject: ['Fantasy'], language: ['eng'],
});
const gb = NormalizeBook.fromGoogleBooks({
  id: 'gb-123',
  volumeInfo: {
    title: 'The Hobbit', authors: ['J.R.R. Tolkien'],
    industryIdentifiers: [{ type: 'ISBN_13', identifier: '9780000000000' }],
    categories: ['Fantasy'],
  },
});
assert.ok(BookIdentity.isSameBook(ol, gb));
const merged = MergeBooks.merge([ol], [gb]);
assert.equal(merged.length, 1);
assert.ok(merged[0].sourceBadges.includes('Open Library'));
assert.ok(merged[0].sourceBadges.includes('Google Books'));
assert.ok(BookIdentity.isSameBook({ title: 'The Hobbit', author: 'J.R.R. Tolkien', isbn: '9780000000000' }, gb));
assert.doesNotThrow(() => BookIdentity.getSourceLabels({ title: 'Legacy Book' }));

console.log('book identity test passed');
