import assert from 'node:assert/strict';
import { createLibraryPage } from '../frontend/js/features/library/libraryPage.js';

function createGrid() {
  let html = '';
  return {
    nodes: [],
    get innerHTML() { return html; },
    set innerHTML(value) { html = value; this.nodes = []; },
    appendChild(node) { this.nodes.push(node); },
  };
}

const books = [
  { id: 'b', title: 'Beta', author: 'Zulu', status: 'reading', dateAdded: '2026-01-02', coverUrl: 'b.jpg', description: 'Second', pageCount: 200, genres: ['Fiction'], publishYear: 2020, publisher: 'P', language: 'en', tags: ['Owned'] },
  { id: 'a', title: 'Alpha', author: 'Able', status: 'finished', dateAdded: '2026-01-01', coverUrl: 'a.jpg', description: 'First', pageCount: 100, genres: ['History'], publishYear: 2019, publisher: 'P', language: 'en', tags: ['Owned'], isFavorite: true },
];
const state = new Map();
const listeners = new Map();
const grid = createGrid();
const searchInput = { id: 'librarySearchInput', value: '', focus() {} };
const clearButton = { id: 'clearLibrarySearch', hidden: true };
const main = {
  innerHTML: '',
  addEventListener(type, handler) { listeners.set(type, handler); },
  querySelectorAll() { return []; },
};
const calls = [];
const documentRoot = {
  getElementById(id) {
    return { mainContent: main, libraryGrid: grid, librarySearchInput: searchInput, clearLibrarySearch: clearButton }[id] || null;
  },
};
const page = createLibraryPage({
  storage: { getBooks: () => books },
  library: { renderBookCard: book => ({ bookId: book.id }) },
  utils: {
    sanitize: value => String(value ?? ''),
    debounce: callback => callback,
    readingProgress: (current, total) => total ? current / total : 0,
  },
  constants: { STATUS: { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished' } },
  actions: {
    stateStorage: { getItem: key => state.get(key) || null, setItem: (key, value) => state.set(key, String(value)) },
    openSearch: () => calls.push('open-search'),
    showBookDetails: id => calls.push(`details:${id}`),
  },
  documentRoot,
});

page();
assert.match(main.innerHTML, /id="libraryPage"/);
assert.match(main.innerHTML, /My Library/);
assert.match(main.innerHTML, /2 books total/);
assert.deepEqual(grid.nodes.map(node => node.bookId), ['b', 'a']);
assert.doesNotMatch(main.innerHTML, /onclick=|oninput=|onchange=/);

listeners.get('change')({ target: { id: 'librarySortSelect', value: 'title-az' } });
assert.deepEqual(grid.nodes.map(node => node.bookId), ['a', 'b']);

listeners.get('input')({ target: { id: 'librarySearchInput', value: 'Beta' } });
assert.deepEqual(grid.nodes.map(node => node.bookId), ['b']);
assert.equal(clearButton.hidden, false);

listeners.get('click')({
  target: { closest: () => ({ dataset: { action: 'open-search' } }) },
  preventDefault() {}, stopPropagation() {},
});
assert.deepEqual(calls, ['open-search']);

listeners.get('click')({
  target: { closest: () => ({ dataset: { action: 'filter-library', filter: 'finished' } }) },
  preventDefault() {}, stopPropagation() {},
});
assert.equal(page.getState().filter, 'finished');

page.clearSearch();
assert.equal(page.getState().query, '');
assert.deepEqual(grid.nodes.map(node => node.bookId), ['a']);

const emptyGrid = createGrid();
const emptyMain = { innerHTML: '', addEventListener() {} };
const emptyPage = createLibraryPage({
  storage: { getBooks: () => [] },
  library: { renderBookCard() { throw new Error('No cards expected'); } },
  utils: { sanitize: String, debounce: callback => callback, readingProgress: () => 0 },
  constants: { STATUS: { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished' } },
  actions: { stateStorage: { getItem: () => null, setItem() {} } },
  documentRoot: { getElementById: id => id === 'mainContent' ? emptyMain : id === 'libraryGrid' ? emptyGrid : null },
});
emptyPage();
assert.match(emptyGrid.innerHTML, /Your library is empty/);

console.log('Library page tests passed');
