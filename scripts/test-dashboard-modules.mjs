import assert from 'node:assert/strict';
import fs from 'node:fs';

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('Dashboard import must not fetch');
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const eventListeners = new Map();
globalThis.window = globalThis;
globalThis.addEventListener = (type, listener) => {
  const list = eventListeners.get(type) || [];
  list.push(listener);
  eventListeners.set(type, list);
};
globalThis.dispatchEvent = (event) => {
  for (const listener of eventListeners.get(event.type) || []) listener(event);
  return true;
};

const main = { hidden: true, style: {}, innerHTML: '' };
globalThis.document = {
  getElementById: id => id === 'mainContent' ? main : null,
};
globalThis.LIBRIQ = {
  STATUS: { READING: 'reading', FINISHED: 'finished', WISHLIST: 'wishlist' },
};
globalThis.Utils = {
  sanitize: value => String(value ?? ''),
  formatDisplayName: value => String(value || ''),
  formatEmailPrefixName: value => String(value || '').split('@')[0],
  readingProgress: (current, total) => total ? Math.round(current / total * 100) : 0,
  buildCover: () => '<div class="cover"></div>',
  formatDate: value => String(value || ''),
  formatNumber: value => String(value ?? 0),
  genreColor: () => '#000',
  timeAgo: () => 'now',
};
globalThis.LibriqSyncBeta = { getState: () => ({ status: 'synced', enabled: true }) };
globalThis.LibriqFirebase = { getState: () => ({ user: null }) };

let books = [];
let activity = [];
globalThis.Storage = {
  getStats: () => ({
    total: books.length,
    reading: books.filter(book => book.status === 'reading').length,
    finishedThisYear: books.filter(book => book.status === 'finished').length,
    totalPagesRead: 220,
    avgRating: 4,
    topGenres: books.length ? [['Fiction', books.length]] : [],
    monthlyPages: Array(12).fill(0),
  }),
  getStreak: () => ({ current: 3, longest: 5 }),
  getGoals: () => ({ yearly: 12 }),
  getProfile: () => ({ name: 'Module Reader' }),
  getBooksByStatus: status => books.filter(book => book.status === status),
  getBooks: () => books,
  getActivityLog: () => activity,
};
const { Storage } = await import('../frontend/js/storage.js');
Object.assign(Storage, globalThis.Storage);

const { Dashboard } = await import('../frontend/js/dashboard.js');
assert.equal(fetchCalls, 0);
assert.equal(globalThis.Dashboard, undefined);
assert.deepEqual(Object.keys(Dashboard), ['render']);

Dashboard.render();
assert.match(main.innerHTML, /Your next session starts here/);
assert.match(main.innerHTML, /Reading Goal/);

books = [
  {
    id: 'reading-1', title: 'Reading Book', author: 'Reader', status: 'reading',
    currentPage: 40, pageCount: 200, dateAdded: '2026-01-01', genres: ['Fiction'],
  },
  {
    id: 'finished-1', title: 'Finished Book', author: 'Finisher', status: 'finished',
    currentPage: 220, pageCount: 220, rating: 4, dateFinished: '2026-02-01', genres: ['Fiction'],
  },
];
activity = [{
  type: 'book_finished', bookTitle: 'Finished Book', bookAuthor: 'Finisher',
  timestamp: '2026-02-01', payload: { status: 'finished' },
}];
Dashboard.render();
assert.match(main.innerHTML, /Reading Book/);
assert.match(main.innerHTML, /Finished this year/);
assert.match(main.innerHTML, /Finished Book/);
assert.match(main.innerHTML, /3 Days/);
assert.match(main.innerHTML, /Library\.showProgressModal/);
assert.match(main.innerHTML, /Library\.showDetailsModal/);

assert.equal(globalThis.Dashboard, undefined);

const source = fs.readFileSync('frontend/js/dashboard.js', 'utf8');
assert.match(source, /import\s+\{\s*Library\s*\}\s+from\s+'\.\/library\.js'/);
assert.match(source, /import\s+\{\s*Search\s*\}\s+from\s+'\.\/search\.js'/);
assert.doesNotMatch(source, /window\.(?:BookAPI|Library|Search)|globalThis\.(?:BookAPI|Library|Search)/);
assert.match(source, /Search\.open/);
assert.match(source, /Search\.openManualEntry/);
assert.match(source, /Library\.toggleFavorite/);

const html = fs.readFileSync('frontend/index.html', 'utf8');
assert.doesNotMatch(html, /<script[^>]+src="js\/dashboard\.js"/);
assert.equal((html.match(/src="js\/appModules\.js"/g) || []).length, 1);

console.log('Dashboard module tests passed');
