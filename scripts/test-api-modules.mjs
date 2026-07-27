import assert from 'node:assert/strict';
import fs from 'node:fs';

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('Importing the API must not fetch');
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const { BookAPI } = await import('../frontend/js/api/index.js');
const { NormalizeBook } = await import('../frontend/js/api/normalizeBook.js');
const { BookCache } = await import('../frontend/js/api/cache.js');

assert.equal(fetchCalls, 0);
assert.equal(typeof BookAPI.searchBooks, 'function');
assert.equal(typeof BookAPI.searchBySubject, 'function');

const google = NormalizeBook.fromGoogleBooks({
  id: 'gb-test',
  volumeInfo: {
    title: 'Module Book', authors: ['Test Author'], language: 'en',
    description: '<p>This is a useful full description for the module regression test.</p>',
    industryIdentifiers: [{ type: 'ISBN_13', identifier: '9781234567890' }],
  },
});
assert.equal(google.googleBooksId, 'gb-test');
assert.equal(google.description.includes('<p>'), false);

const descriptions = [
  { text: 'Short but still useful description for this test book.', source: 'openlibrary', language: 'en' },
  { text: 'This substantially richer Google Books description should be selected because it is a full English description.', source: 'google-description', language: 'en', full: true },
];
assert.equal(NormalizeBook.chooseBestDescription(descriptions), descriptions[1].text);

BookCache.clear();
BookCache.set(' Dune ', [{ title: 'Dune' }]);
assert.equal(BookCache.has('dune'), true);
assert.equal(BookCache.get('DUNE')[0].title, 'Dune');
BookCache.invalidate('dune');
assert.equal(BookCache.has('dune'), false);

const html = fs.readFileSync('frontend/index.html', 'utf8');
const moduleEntries = html.match(/<script\s+type="module"\s+src="js\/appModules\.js"><\/script>/g) || [];
assert.equal(moduleEntries.length, 1);
assert.doesNotMatch(html, /<script[^>]+src="js\/(?:search|library)\.js"/);
assert.doesNotMatch(html, /<script[^>]+src="js\/(?:dashboard|navigation)\.js"/);
for (const name of ['bookIdentity', 'normalizeBook', 'openLibrary', 'googleBooks', 'gutendex', 'internetArchive', 'mergeBooks', 'cache']) {
  assert.doesNotMatch(html, new RegExp(`<script[^>]+src="js/api/${name}\\.js"`));
}
assert.doesNotMatch(html, /gemini/i);
const app = fs.readFileSync('frontend/js/app.js', 'utf8');
assert.equal(app.includes(['libriq', 'app-modules-ready'].join(':')), false);
assert.match(app, /export function bootApp/);
const entry = fs.readFileSync('frontend/js/api/index.js', 'utf8');
assert.doesNotMatch(entry, /window\.BookAPI\s*=/);
assert.doesNotMatch(entry, /libriq:api-ready/);

console.log('API module and script-order tests passed');
