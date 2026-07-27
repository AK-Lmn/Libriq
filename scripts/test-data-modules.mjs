import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const dataSource = await readFile(new URL('../frontend/js/data.js', import.meta.url), 'utf8');
const appModulesSource = await readFile(new URL('../frontend/js/appModules.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../frontend/index.html', import.meta.url), 'utf8');
const serviceWorkerSource = await readFile(new URL('../frontend/service-worker.js', import.meta.url), 'utf8');

let browserAccesses = 0;
const guardedNames = ['localStorage', 'document', 'window', 'navigator', 'location', 'fetch', 'addEventListener'];
for (const name of guardedNames) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      browserAccesses += 1;
      throw new Error(`Unexpected browser access: ${name}`);
    },
  });
}
const globalsBeforeImport = new Set(Reflect.ownKeys(globalThis));
const importProbe = await import(`../frontend/js/data.js?side-effect-test=${Date.now()}`);
const globalsAddedByImport = Reflect.ownKeys(globalThis).filter(key => !globalsBeforeImport.has(key));
for (const name of guardedNames) delete globalThis[name];
assert.equal(browserAccesses, 0);
assert.deepEqual(globalsAddedByImport, []);
assert.equal(importProbe.LIBRIQ.VERSION, packageJson.version);

const { LIBRIQ, createBook, createBookPatch, createProfile, SEED_BOOKS } =
  await import('../frontend/js/data.js');

assert.deepEqual(LIBRIQ.STATUS, {
  READING: 'reading',
  FINISHED: 'finished',
  WISHLIST: 'wishlist',
  DNF: 'dnf',
});
assert.deepEqual(LIBRIQ.GENRES, [
  'Fiction', 'Non-Fiction', 'Fantasy', 'Science Fiction', 'Mystery',
  'Thriller', 'Romance', 'Historical Fiction', 'Biography', 'Self-Help',
  'Philosophy', 'Psychology', 'Horror', 'Poetry', 'Graphic Novel',
  'Young Adult', 'Classic', 'Literary Fiction', 'Adventure', 'Business',
]);
assert.deepEqual(LIBRIQ.MONTHS, ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
assert.equal(LIBRIQ.VERSION, packageJson.version);

const defaultBook = createBook({ id: 'book-default' });
assert.deepEqual(Object.keys(defaultBook), [
  'id', 'title', 'author', 'coverUrl', 'isbn', 'pageCount', 'publishYear',
  'publisher', 'description', 'shortDescription', 'genres', 'subjects',
  'subjectPeople', 'subjectPlaces', 'subjectTimes', 'language',
  'firstPublishYear', 'editionCount', 'coverId', 'status', 'dateAdded',
  'dateStarted', 'dateFinished', 'createdAt', 'updatedAt', 'deletedAt',
  'currentPage', 'rating', 'review', 'isFavorite', 'tags', 'shelves',
  'notes', 'notesUpdatedAt', 'quotes', 'source', 'sources', 'sourceBadges',
  'sourceIds', 'identifiers', 'isbns', 'googleBooksId', 'openLibraryId',
  'openLibraryWorkKey', 'openLibraryEditionKey', 'openLibraryAuthorKeys',
  'gutendexId', 'gutenbergId', 'internetArchiveId', 'internetArchiveIds',
  'archiveUrl', 'readableSourceLinks', 'downloadLinks',
]);
assert.equal(defaultBook.title, 'Unknown Title');
assert.equal(defaultBook.author, 'Unknown Author');
assert.equal(defaultBook.status, 'wishlist');
assert.equal(defaultBook.language, 'English');
assert.deepEqual(defaultBook.quotes, []);

const suppliedBook = createBook({
  id: 'book-1',
  dateAdded: '2024-01-01T00:00:00.000Z',
  createdAt: '2024-01-02T00:00:00.000Z',
  updatedAt: '2024-01-03T00:00:00.000Z',
  deletedAt: '2024-01-04T00:00:00.000Z',
  quotes: [{
    id: 'quote-1',
    text: 42,
    page: 0,
    note: 'note',
    createdAt: '2024-02-01T00:00:00.000Z',
    updatedAt: '2024-02-02T00:00:00.000Z',
  }],
});
assert.equal(suppliedBook.id, 'book-1');
assert.equal(suppliedBook.createdAt, '2024-01-02T00:00:00.000Z');
assert.equal(suppliedBook.updatedAt, '2024-01-03T00:00:00.000Z');
assert.equal(suppliedBook.deletedAt, '2024-01-04T00:00:00.000Z');
assert.deepEqual(suppliedBook.quotes[0], {
  id: 'quote-1',
  text: '42',
  page: 0,
  note: 'note',
  createdAt: '2024-02-01T00:00:00.000Z',
  updatedAt: '2024-02-02T00:00:00.000Z',
});

const patch = createBookPatch({ title: 'Patch', createdAt: 'created', updatedAt: 'updated', deletedAt: '' });
assert.deepEqual(patch, { title: 'Patch', createdAt: 'created', updatedAt: 'updated', deletedAt: '' });
const profile = createProfile({
  name: 'Ada',
  joinDate: '2024-03-01T00:00:00.000Z',
  createdAt: '2024-03-02T00:00:00.000Z',
  updatedAt: '2024-03-03T00:00:00.000Z',
});
assert.deepEqual(profile, {
  name: 'Ada',
  displayName: 'Ada',
  avatar: null,
  bio: null,
  createdAt: '2024-03-02T00:00:00.000Z',
  updatedAt: '2024-03-03T00:00:00.000Z',
  joinDate: '2024-03-01T00:00:00.000Z',
  yearlyGoal: 12,
  preferredGenres: [],
  theme: 'dark',
  streakData: { current: 0, longest: 0, lastRead: null },
});

assert.deepEqual(SEED_BOOKS.map(({ id, title, author }) => ({ id, title, author })), [
  { id: 'seed-1', title: 'The Name of the Wind', author: 'Patrick Rothfuss' },
  { id: 'seed-2', title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman' },
  { id: 'seed-3', title: 'Dune', author: 'Frank Herbert' },
  { id: 'seed-4', title: 'Sapiens', author: 'Yuval Noah Harari' },
  { id: 'seed-5', title: 'The Midnight Library', author: 'Matt Haig' },
  { id: 'seed-6', title: 'Project Hail Mary', author: 'Andy Weir' },
]);
assert.equal(new Set(SEED_BOOKS.map(book => book.id)).size, SEED_BOOKS.length);

for (const exported of ['LIBRIQ', 'createBook', 'createBookPatch', 'createProfile', 'SEED_BOOKS']) {
  assert.match(dataSource, new RegExp(`export (?:const|function) ${exported}\\b`));
}

const directImports = new Map([
  ['app.js', ['LIBRIQ']],
  ['cloudBackup.js', ['LIBRIQ', 'createBook', 'createProfile']],
  ['dashboard.js', ['LIBRIQ']],
  ['library.js', ['LIBRIQ']],
  ['navigation.js', ['LIBRIQ', 'createBook']],
  ['sync.js', ['LIBRIQ', 'createBook']],
]);
for (const [file, names] of directImports) {
  const source = await readFile(new URL(`../frontend/js/${file}`, import.meta.url), 'utf8');
  assert.match(source, /from ['"]\.\/data\.js['"]/);
  for (const name of names) assert.match(source, new RegExp(`\\b${name}\\b`));
}

assert.doesNotMatch(appModulesSource, /window\.LIBRIQ\s*=/);
assert.doesNotMatch(appModulesSource, /loadClassicScript\(['"]\.\/storage\.js['"]\)/);
assert.doesNotMatch(appModulesSource, /loadClassicScript\(['"]\.\/utils\.js['"]\)/);
assert.doesNotMatch(indexSource, /<script(?:\s+type=["']text\/javascript["'])?\s+src=["']js\/data\.js["']/);
assert.doesNotMatch(indexSource, /<script(?:\s+type=["']text\/javascript["'])?\s+src=["']js\/(?:storage|utils)\.js["']/);
assert.equal((indexSource.match(/<script\s+type=["']module["']/g) || []).length, 1);
assert.match(indexSource, /<script\s+type=["']module["']\s+src=["']js\/appModules\.js["']/);
assert.match(serviceWorkerSource, /importScripts\(['"]\.\/js\/version-classic\.js['"]\)/);
assert.doesNotMatch(serviceWorkerSource, /libriq-v4\.\d+\.\d+/);

console.log('Data module tests passed.');
