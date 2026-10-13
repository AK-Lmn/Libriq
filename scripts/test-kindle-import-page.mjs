import assert from 'node:assert/strict';
import { createKindleImportPage } from '../frontend/js/features/kindleImport/kindleImportPage.js';

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

  async emit(type, event) {
    return this.listeners[type]?.(event);
  }
}

const modal = new FakeElement('kindleImportModal');
const preview = new FakeElement('kindleImportPreview');
const continueButton = new FakeElement('continueKindleImport');
const elements = { kindleImportModal: modal, kindleImportPreview: preview, continueKindleImport: continueButton };
const documentRoot = { getElementById: id => elements[id] || null };
const calls = { parse: 0, plan: 0, quotes: 0, continue: 0, cancel: 0, preview: 0 };
const existingBooks = [{ id: 'book-1', title: 'Dune', author: 'Frank Herbert', quotes: [{ text: 'Existing', note: '', page: 5 }] }];

const feature = createKindleImportPage({
  documentRoot,
  parseClippings(text) {
    calls.parse += 1;
    if (text === 'invalid') return { books: [], totals: { books: 0, highlights: 0, notes: 0 } };
    return {
      books: [{ title: 'Dune', author: 'Frank Herbert', entries: [{ type: 'highlight', text: 'Fear is the mind-killer.' }, { type: 'note', text: 'Review this.' }] }],
      totals: { books: 1, highlights: 1, notes: 1 },
    };
  },
  buildImportPlan({ parsedBooks, existingBooks: providedBooks }) {
    calls.plan += 1;
    assert.equal(parsedBooks.length, 1);
    assert.equal(providedBooks, existingBooks);
    return { matchedBooks: [{ existingBook: existingBooks[0], entries: parsedBooks[0].entries }], booksToCreate: [], booksMatched: 1, booksCreated: 0, totalHighlights: 1, totalNotes: 1 };
  },
  applyKindleImportPlan({ importPlan, existingQuotesByBookId }) {
    calls.quotes += 1;
    assert.equal(importPlan.booksMatched, 1);
    assert.equal(existingQuotesByBookId['book-1'].length, 1);
    return { matchedBooks: [], booksToCreate: [], importedQuotes: 1, skippedQuotes: 1, booksCreated: 0 };
  },
  actions: {
    getExistingBooks: () => existingBooks,
    previewReady: () => { calls.preview += 1; },
    continueImport: result => {
      calls.continue += 1;
      assert.equal(result.importPlan.booksMatched, 1);
      assert.equal(result.quoteImportPlan.importedQuotes, 1);
    },
    cancel: () => { calls.cancel += 1; },
  },
});

assert.equal(feature.open(), true);
assert.equal(modal.hidden, false);
assert.match(modal.innerHTML, /Import Kindle Clippings/);
assert.match(modal.innerHTML, /Continue Import/);
assert.match(modal.innerHTML, /aria-describedby="kindleFileHint"/);
assert.match(preview.innerHTML, /Preview before you import/);
assert.equal(continueButton.disabled, true);
assert.doesNotMatch(modal.innerHTML, /onclick\s*=/i);

const validFile = { name: 'My Clippings.txt', text: async () => 'valid clippings' };
await modal.emit('change', { target: { matches: selector => selector.includes('select-kindle-file'), files: [validFile] } });
assert.deepEqual({ parse: calls.parse, plan: calls.plan, quotes: calls.quotes, preview: calls.preview }, { parse: 1, plan: 1, quotes: 1, preview: 1 });
assert.match(preview.innerHTML, /Books matched/);
assert.match(preview.innerHTML, /Books to create/);
assert.match(preview.innerHTML, /Highlights detected/);
assert.match(preview.innerHTML, /Notes detected/);
assert.match(preview.innerHTML, /Quotes to import/);
assert.match(preview.innerHTML, /Quotes skipped as duplicates/);
assert.match(preview.innerHTML, /kindleBooksMatched">1</);
assert.match(preview.innerHTML, /kindleQuotesToImport">1</);
assert.match(preview.innerHTML, /kindleQuotesSkipped">1</);
assert.equal(continueButton.disabled, false);

await modal.emit('click', {
  target: { closest: () => ({ dataset: { action: 'continue-kindle-import' } }) },
  preventDefault() {},
});
assert.equal(calls.continue, 1);
assert.equal(existingBooks[0].quotes.length, 1);

feature.open();
await modal.emit('change', { target: { matches: () => true, files: [{ text: async () => '   ' }] } });
assert.match(preview.innerHTML, /No clippings found/);
assert.equal(continueButton.disabled, true);
assert.equal(calls.plan, 1);
assert.equal(calls.quotes, 1);

feature.open();
await modal.emit('change', { target: { matches: () => true, files: [{ text: async () => 'invalid' }] } });
assert.match(preview.innerHTML, /Could not read this clippings file/);
assert.equal(continueButton.disabled, true);
assert.equal(calls.plan, 1);
assert.equal(calls.quotes, 1);

await modal.emit('click', {
  target: { closest: () => ({ dataset: { action: 'cancel-kindle-import' } }) },
  preventDefault() {},
});
assert.equal(modal.hidden, true);
assert.equal(calls.cancel, 1);
assert.equal(feature.getPreview(), null);

// Only the latest selected file may publish a preview, including rejection paths.
feature.open();
let resolveOld;
const oldRead = modal.emit('change', { target: { matches: () => true, files: [{ text: () => new Promise(resolve => { resolveOld = resolve; }) }] } });
assert.match(preview.innerHTML, /Reading your clippings/);
assert.equal(continueButton.disabled, true);
await modal.emit('change', { target: { matches: () => true, files: [validFile] } });
const current = feature.getPreview();
resolveOld('invalid');
await oldRead;
assert.equal(feature.getPreview(), current);
assert.equal(continueButton.disabled, false);

let rejectOld;
const rejectedRead = modal.emit('change', { target: { matches: () => true, files: [{ text: () => new Promise((_, reject) => { rejectOld = reject; }) }] } });
await modal.emit('change', { target: { matches: () => true, files: [validFile] } });
const newCurrent = feature.getPreview();
rejectOld(new Error('Old file could not be read'));
await rejectedRead;
assert.equal(feature.getPreview(), newCurrent);

let resolveCancelled;
const cancelledRead = modal.emit('change', { target: { matches: () => true, files: [{ text: () => new Promise(resolve => { resolveCancelled = resolve; }) }] } });
await modal.emit('keydown', { key: 'Escape', preventDefault() {} });
resolveCancelled('valid clippings');
await cancelledRead;
assert.equal(feature.getPreview(), null);
assert.equal(modal.hidden, true);

feature.open();
await modal.emit('change', { target: { matches: () => true, files: [{ text: async () => { throw new Error('Unreadable'); } }] } });
assert.match(preview.innerHTML, /Could not read this clippings file/);
assert.equal(continueButton.disabled, true);
await modal.emit('change', { target: { matches: () => true, files: [] } });
assert.match(preview.innerHTML, /Preview before you import/);
assert.equal(feature.getSelectedFile(), null);

let settleImport;
let executions = 0;
const guarded = createKindleImportPage({
  documentRoot,
  parseClippings: () => ({ books: [{}] }),
  buildImportPlan: () => ({ booksMatched: 1 }),
  applyKindleImportPlan: () => ({ importedQuotes: 1 }),
  actions: { continueImport: () => { executions += 1; return new Promise(resolve => { settleImport = resolve; }); } },
});
guarded.open();
await modal.emit('change', { target: { matches: () => true, files: [validFile] } });
const continueEvent = { target: { closest: () => ({ dataset: { action: 'continue-kindle-import' } }) }, preventDefault() {} };
const importing = modal.emit('click', continueEvent);
assert.match(preview.innerHTML, /Importing your clippings/);
assert.equal(continueButton.disabled, true);
await modal.emit('click', continueEvent);
await modal.emit('keydown', { key: 'Escape', preventDefault() {} });
assert.equal(modal.hidden, false);
assert.equal(executions, 1);
settleImport(false);
await importing;
assert.match(preview.innerHTML, /Could not complete the import/);
assert.match(preview.innerHTML, /Some changes may already have been applied/);
assert.match(preview.innerHTML, /Import Preview/);
assert.equal(continueButton.disabled, false);
assert.ok(guarded.getPreview());

const secondImport = modal.emit('click', continueEvent);
settleImport({ quotesImported: 1 });
await secondImport;
assert.equal(executions, 2);
assert.equal(modal.hidden, true);
assert.equal(guarded.getPreview(), null);

assert.throws(() => createKindleImportPage({}), /requires parseClippings/);
console.log('Kindle import page tests passed.');
