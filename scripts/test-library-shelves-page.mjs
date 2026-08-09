import assert from 'node:assert/strict';
import { createLibraryShelvesPage } from '../frontend/js/features/library/libraryShelvesPage.js';

const grids = new Map();
const createGrid = () => ({ innerHTML: '', children: [], appendChild(node) { this.children.push(node); } });
grids.set('#statusGrid', createGrid());
grids.set('#favoritesGrid', createGrid());
const main = {
  innerHTML: '',
  listeners: new Map(),
  addEventListener(type, handler) { this.listeners.set(type, handler); },
  querySelector(selector) {
    if (!grids.has(selector)) grids.set(selector, createGrid());
    return grids.get(selector);
  },
};
const books = [
  { id: 'reading-1', status: 'reading', title: 'Reading' },
  { id: 'favorite-1', status: 'finished', title: 'Favorite', isFavorite: true },
];
const calls = [];
const shelves = createLibraryShelvesPage({
  storage: {
    getBooksByStatus: status => books.filter(book => book.status === status),
    getBooks: () => books,
  },
  library: { renderBookCard: book => ({ bookId: book.id }) },
  utils: {},
  actions: {
    openSearch: () => calls.push('search'),
    openManualEntry: () => calls.push('manual'),
    importBackup: () => calls.push('import'),
    getLibraryState: () => ({ shelf: 'all' }),
  },
  documentRoot: {
    getElementById(id) {
      if (id === 'mainContent') return main;
      return grids.get(`#${id}`) || null;
    },
  },
});

shelves.renderStatusPage('reading', 'Currently Reading', 'ph-book-open');
assert.match(main.innerHTML, /Currently Reading/);
assert.equal(grids.get('#statusGrid').children[0].bookId, 'reading-1');

shelves.renderFavoritesPage();
assert.match(main.innerHTML, /Favorites/);
assert.equal(grids.get('#favoritesGrid').children[0].bookId, 'favorite-1');

grids.set('#statusGrid', { innerHTML: '', children: [], appendChild() {} });
shelves.renderStatusPage('wishlist', 'Want to Read', 'ph-bookmark');
assert.match(grids.get('#statusGrid').innerHTML, /Queue is clear/);
assert.doesNotMatch(grids.get('#statusGrid').innerHTML, /onclick=/);

main.listeners.get('click')({ target: { closest: () => ({ dataset: { action: 'open-search' } }) } });
main.listeners.get('click')({ target: { closest: () => ({ dataset: { action: 'open-manual-entry' } }) } });
main.listeners.get('click')({ target: { closest: () => ({ dataset: { action: 'import-backup' } }) } });
assert.deepEqual(calls, ['search', 'manual', 'import']);

console.log('Library shelves page tests passed');
