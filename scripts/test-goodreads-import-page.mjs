import assert from 'node:assert/strict';
import { createGoodreadsImportPage } from '../frontend/js/features/goodreadsImport/goodreadsImportPage.js';

class FakeElement {
  constructor(id = '') {
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

  querySelectorAll() {
    return [];
  }

  setAttribute() {}
  removeAttribute() {}

  async emit(type, event) {
    return this.listeners[type]?.(event);
  }
}

const modal = new FakeElement('goodreadsImportModal');
const preview = new FakeElement('goodreadsImportPreview');
const continueButton = new FakeElement('continueGoodreadsImport');
const elements = { goodreadsImportModal: modal, goodreadsImportPreview: preview, continueGoodreadsImport: continueButton };
const documentRoot = {
  getElementById: id => elements[id] || null,
  createElement: id => elements[id] || new FakeElement(id),
};

const calls = { parse: 0, plan: 0, continue: 0, cancel: 0, preview: 0 };
const existingBooks = [{ id: 'b-1', title: '1984', author: 'George Orwell', status: 'finished' }];

const feature = createGoodreadsImportPage({
  documentRoot,
  parseCsv(text) {
    calls.parse += 1;
    if (text === 'invalid') return { ok: false, error: 'Invalid CSV' };
    return {
      ok: true,
      books: [
        { title: '1984', author: 'George Orwell', exclusiveShelf: 'read' },
        { title: 'Animal Farm', author: 'George Orwell', exclusiveShelf: 'to-read' },
      ],
      totals: { total: 2, read: 1, currentlyReading: 0, toRead: 1, rated: 0, reviewed: 0 },
    };
  },
  buildImportPlan({ parsedBooks, existingBooks: providedBooks }) {
    calls.plan += 1;
    assert.equal(parsedBooks.length, 2);
    assert.equal(providedBooks, existingBooks);
    return {
      matchedBooks: [{ existingBook: existingBooks[0], parsedBook: parsedBooks[0], mappedStatus: 'finished' }],
      booksToCreate: [{ candidate: { title: 'Animal Farm', author: 'George Orwell', status: 'wishlist' }, parsedBook: parsedBooks[1], mappedStatus: 'wishlist' }],
      totals: { total: 2, toCreate: 1, matched: 1, finished: 1, reading: 0, wishlist: 1, rated: 0, reviewed: 0 },
    };
  },
  actions: {
    getExistingBooks: () => existingBooks,
    previewReady: () => { calls.preview += 1; },
    continueImport: result => {
      calls.continue += 1;
      assert.equal(result.importPlan.totals.total, 2);
      assert.equal(result.importPlan.totals.toCreate, 1);
      return true;
    },
    cancel: () => { calls.cancel += 1; },
  },
});

assert.equal(feature.open(), true);
assert.equal(modal.hidden, false);
assert.match(modal.innerHTML, /Import Goodreads Library/);
assert.match(modal.innerHTML, /Continue Import/);
assert.match(modal.innerHTML, /aria-describedby="goodreadsFileHint"/);
assert.match(preview.innerHTML, /Preview before you import/);
assert.equal(continueButton.disabled, true);
assert.doesNotMatch(modal.innerHTML, /onclick\s*=/i);

// Upload valid CSV file
const validFile = { name: 'goodreads_library_export.csv', text: async () => 'Book Id,Title,Author...' };
await modal.emit('change', { target: { matches: selector => selector.includes('select-goodreads-file'), files: [validFile] } });
assert.deepEqual({ parse: calls.parse, plan: calls.plan, preview: calls.preview }, { parse: 1, plan: 1, preview: 1 });
assert.match(preview.innerHTML, /Import Preview/);
assert.match(preview.innerHTML, /goodreadsBooksToCreate">1</);
assert.match(preview.innerHTML, /goodreadsBooksMatched">1</);
assert.match(preview.innerHTML, /goodreadsBooksFinished">1</);
assert.match(preview.innerHTML, /goodreadsBooksWishlist">1</);
assert.match(preview.innerHTML, /Animal Farm/);
assert.equal(continueButton.disabled, false);

// Click continue import
await modal.emit('click', {
  target: { closest: () => ({ dataset: { action: 'continue-goodreads-import' } }) },
  preventDefault() {},
});
assert.equal(calls.continue, 1);

// Test empty file
feature.open();
await modal.emit('change', { target: { matches: () => true, files: [{ text: async () => '   ' }] } });
assert.match(preview.innerHTML, /No books found/);

// Test invalid file
feature.open();
await modal.emit('change', { target: { matches: () => true, files: [{ text: async () => 'invalid' }] } });
assert.match(preview.innerHTML, /Could not read this Goodreads CSV/);

console.log('Goodreads import page tests passed successfully!');
