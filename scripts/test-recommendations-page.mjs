import assert from 'node:assert/strict';
import { createRecommendationsPage } from '../frontend/js/features/recommendations/recommendationsPage.js';

const listeners = new Map();
const main = {
  innerHTML: '',
  addEventListener(type, handler) { listeners.set(type, handler); },
};
const subjectRoot = {
  innerHTML: '',
  querySelectorAll: () => [],
};
const gutenbergRoot = {
  innerHTML: '',
  querySelector: () => null,
};
let books = [{
  id: 'book-1', title: 'Recommended Book', author: 'Known Author',
  status: 'finished', rating: 5, isFavorite: true,
  genres: ['Fantasy'], subjects: ['Fantasy'], dateAdded: '2026-01-01T00:00:00Z',
}];
const calls = [];
const render = createRecommendationsPage({
  storage: {
    getBooks: () => books,
    getBookById: id => books.find(book => book.id === id) || null,
  },
  library: {
    showDetailsModal: id => calls.push(['details', id]),
    showAddModal: book => calls.push(['add', book.id]),
  },
  bookApi: {
    isSameBook: (left, right) => left.id === right.id,
    buildSourceBadgeData: () => ({ sourceBadges: [], sources: [] }),
    searchBySubject: async () => [],
    searchCuratedClassics: async () => [],
  },
  utils: {
    sanitize: value => String(value ?? ''),
    formatDisplayName: value => String(value),
    statusLabel: value => String(value),
    statusBadgeClass: () => 'badge-finished',
    buildCover: () => '<div class="cover"></div>',
  },
  constants: { STATUS: { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished' } },
  actions: {
    isOnline: () => true,
    openSearch: () => calls.push(['search']),
    navigate: page => calls.push(['navigate', page]),
  },
  documentRoot: {
    getElementById(id) {
      if (id === 'mainContent') return main;
      if (id === 'subjectDiscoveryRoot') return subjectRoot;
      if (id === 'gutenbergDiscoveryRoot') return gutenbergRoot;
      return null;
    },
  },
});

render();
assert.match(main.innerHTML, /id="recommendationsPage"/);
assert.match(main.innerHTML, /Recommended Book/);
assert.match(main.innerHTML, /recommendation-card/);
assert.match(subjectRoot.innerHTML, /Loading subject picks from Open Library/);
assert.match(gutenbergRoot.innerHTML, /Loading free classics/);
assert.doesNotMatch(`${main.innerHTML}${subjectRoot.innerHTML}${gutenbergRoot.innerHTML}`, /onclick=/);

const click = listeners.get('click');
click({ target: { closest: () => ({ dataset: { action: 'open-search' } }) } });
click({ target: { closest: () => ({ dataset: { action: 'open-recommendation', bookId: 'book-1', bookSaved: '1' } }) } });
assert.deepEqual(calls, [['search'], ['details', 'book-1']]);

books = [];
render();
assert.match(main.innerHTML, /Save a few more books/);
assert.match(main.innerHTML, /data-action="open-library"/);

console.log('Recommendations page tests passed');
