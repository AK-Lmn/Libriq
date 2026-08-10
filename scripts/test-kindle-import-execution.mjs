import assert from 'node:assert/strict';

globalThis.fetch = async () => { throw new Error('Unexpected fetch'); };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.setTimeout = () => 0;
globalThis.localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
};
globalThis.sessionStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
};
const classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
globalThis.document = {
  body: { classList, style: {}, appendChild() {} },
  documentElement: { classList, getAttribute: () => 'dark', setAttribute() {} },
  getElementById: () => null,
  querySelectorAll: () => [],
  createTextNode: value => ({ textContent: String(value) }),
};
globalThis.LibriqFirebase = { getState: () => ({ ready: true, user: null, signedOutConfirmed: true }) };
globalThis.LibriqSyncBeta = { getState: () => ({ enabled: false }), refresh() {} };
globalThis.LibriqCloudBackup = { refresh() {} };

const { completeKindleImport } = await import('../frontend/js/navigation.js');
const { createKindleImportPage } = await import('../frontend/js/features/kindleImport/kindleImportPage.js');

const books = [{
  id: 'matched-book',
  title: 'Dune',
  author: 'Frank Herbert',
  rating: 5,
  quotes: [{ id: 'existing-quote', text: 'Existing quote', note: '', page: 1 }, { text: 'Legacy quote', note: '', page: 2 }],
}];
const activity = [];
const calls = { updates: 0, adds: 0, toast: 0, rerender: 0 };
const storage = {
  getBookById: id => books.find(book => book.id === id) || null,
  updateBook(id, updates) {
    calls.updates += 1;
    const index = books.findIndex(book => book.id === id);
    if (index < 0) return null;
    books[index] = { ...books[index], ...updates };
    return books[index];
  },
  addBook(book) {
    calls.adds += 1;
    const created = { ...book, quotes: book.quotes.map(quote => ({ ...quote })) };
    books.push(created);
    return created;
  },
  buildActivityEvent: (type, book, payload, source) => ({ type, book, payload, source }),
  addActivityEvent(event) {
    activity.push(event);
    return event;
  },
};
const previewResult = {
  importPlan: { booksMatched: 1, booksCreated: 1, totalHighlights: 2, totalNotes: 1 },
  quoteImportPlan: {
    matchedBooks: [{
      bookId: 'matched-book',
      quotes: [
        { id: 'existing-quote', text: 'Existing quote', note: '', page: 1 },
        { text: 'Legacy quote', note: '', page: 2 },
        { id: 'kindle-quote-1', text: 'Fear is the mind-killer.', note: '', page: 5, source: 'kindle' },
      ],
    }],
    booksToCreate: [{
      candidateBook: { id: 'new-book', title: 'New Kindle Book', author: 'Reader', source: 'kindle' },
      quotes: [{ id: 'kindle-quote-2', text: '', note: 'A Kindle note', page: 9, source: 'kindle' }],
    }],
    importedQuotes: 2,
    skippedQuotes: 2,
    booksCreated: 1,
  },
};
const previewSnapshot = structuredClone(previewResult);
const result = completeKindleImport({
  previewResult,
  storage,
  toast(message, type) {
    calls.toast += 1;
    assert.equal(type, 'success');
    assert.match(message, /1 books created/);
    assert.match(message, /1 books matched/);
    assert.match(message, /2 quotes imported/);
    assert.match(message, /2 duplicates skipped/);
  },
  rerender: () => { calls.rerender += 1; },
});

assert.deepEqual(result, {
  booksCreated: 1,
  booksMatched: 1,
  quotesImported: 2,
  duplicatesSkipped: 2,
  highlightsImported: 2,
  notesImported: 1,
});
assert.equal(calls.updates, 1);
assert.equal(calls.adds, 1);
assert.equal(calls.toast, 1);
assert.equal(calls.rerender, 1);
assert.equal(books[0].rating, 5);
assert.deepEqual(books[0].quotes.map(quote => quote.id).filter(Boolean), ['existing-quote', 'kindle-quote-1']);
assert.equal(books[0].quotes.length, 3);
assert.deepEqual(books[1].quotes.map(quote => quote.id), ['kindle-quote-2']);
assert.equal(activity.length, 1);
assert.equal(activity[0].type, 'kindle_imported');
assert.equal(activity[0].source, 'import');
assert.deepEqual(previewResult, previewSnapshot);

const emptyWrites = { updates: 0, adds: 0, activity: 0 };
const emptyResult = completeKindleImport({
  previewResult: { importPlan: {}, quoteImportPlan: {} },
  storage: {
    updateBook() { emptyWrites.updates += 1; },
    addBook() { emptyWrites.adds += 1; },
    buildActivityEvent: () => ({}),
    addActivityEvent() { emptyWrites.activity += 1; },
  },
});
assert.deepEqual(emptyResult, {
  booksCreated: 0,
  booksMatched: 0,
  quotesImported: 0,
  duplicatesSkipped: 0,
  highlightsImported: 0,
  notesImported: 0,
});
assert.deepEqual(emptyWrites, { updates: 0, adds: 0, activity: 0 });

class FakeElement {
  constructor(id) {
    this.id = id;
    this.hidden = true;
    this.disabled = false;
    this.innerHTML = '';
    this.listeners = {};
  }

  addEventListener(type, handler) {
    this.listeners[type] = handler;
  }

  querySelector() {
    return { focus() {} };
  }

  async emit(type, event) {
    return this.listeners[type]?.(event);
  }
}

const modal = new FakeElement('kindleImportModal');
const preview = new FakeElement('kindleImportPreview');
const continueButton = new FakeElement('continueKindleImport');
const elements = { kindleImportModal: modal, kindleImportPreview: preview, continueKindleImport: continueButton };
let continueCalls = 0;
const feature = createKindleImportPage({
  parseClippings: () => ({ books: [{ title: 'Dune', author: 'Frank Herbert', entries: [{ type: 'highlight', text: 'Text' }] }] }),
  buildImportPlan: () => ({ matchedBooks: [], booksToCreate: [], booksMatched: 0, booksCreated: 0, totalHighlights: 1, totalNotes: 0 }),
  applyKindleImportPlan: () => ({ matchedBooks: [], booksToCreate: [], importedQuotes: 1, skippedQuotes: 0 }),
  documentRoot: { getElementById: id => elements[id] || null },
  actions: {
    getExistingBooks: () => [],
    continueImport: () => {
      continueCalls += 1;
      return { quotesImported: 1 };
    },
  },
});
feature.open();
await modal.emit('change', { target: { matches: () => true, files: [{ text: async () => 'clippings' }] } });
await modal.emit('click', {
  target: { closest: () => ({ dataset: { action: 'continue-kindle-import' } }) },
  preventDefault() {},
});
assert.equal(continueCalls, 1);
assert.equal(modal.hidden, true);
assert.equal(feature.getPreview(), null);
assert.doesNotMatch(modal.innerHTML, /onclick\s*=/i);

console.log('Kindle import execution tests passed.');
