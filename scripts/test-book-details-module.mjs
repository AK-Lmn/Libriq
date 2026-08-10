import assert from 'node:assert/strict';
import { createBookDetailsPage } from '../frontend/js/features/bookDetails/bookDetailsPage.js';

function element(id = '') {
  return {
    id,
    hidden: false,
    value: '',
    textContent: '',
    innerHTML: '',
    className: '',
    title: '',
    dataset: {},
    style: {},
    children: [],
    listeners: {},
    get childElementCount() { return this.children.length; },
    appendChild(child) { this.children.push(child); return child; },
    replaceChildren(...children) { this.children = children; },
    addEventListener(type, handler) { this.listeners[type] = handler; },
    hasAttribute(name) { return name === 'hidden' ? this.hidden : false; },
    focus() { this.focused = true; },
  };
}

const elements = new Map();
const modal = element('bookDetailsModal');
const body = element('bookDetailsBody');
const footer = element('bookDetailsFooter');
const closeButton = element('closeBookDetails');
modal.hidden = true;
modal.querySelector = selector => {
  if (selector === '#bookDetailsFooter') return footer;
  if (selector === '.book-details-modal') return modal;
  if (selector === '.modal-close') return closeButton;
  return null;
};
Object.defineProperty(body, 'innerHTML', {
  get() { return this.html || ''; },
  set(value) {
    this.html = String(value || '');
    for (const match of this.html.matchAll(/id="([^"]+)"/g)) {
      if (!elements.has(match[1])) elements.set(match[1], element(match[1]));
    }
  },
});
body.querySelector = selector => selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null;
elements.set('bookDetailsModal', modal);
elements.set('bookDetailsBody', body);
elements.set('bookDetailsFooter', footer);
const documentRoot = {
  body: { style: {} },
  getElementById: id => elements.get(id) || null,
  createElement: () => element(),
};

let book = {
  id: 'book-1',
  title: 'Dune',
  author: 'Frank Herbert',
  status: 'reading',
  currentPage: 40,
  pageCount: 100,
  rating: 4,
  genres: ['Science Fiction'],
  tags: ['Classic'],
  notes: '',
  quotes: [{ id: 'kindle-note', text: '', note: 'Kindle note', page: 44, source: 'kindle' }],
};
const calls = { progress: 0, metadata: 0, favorite: 0, rating: 0, activity: [], renders: 0, badges: 0 };
const toasts = [];
const storage = {
  getBookById: id => id === book.id ? book : null,
  updateBook(id, updates) {
    if (id !== book.id) return null;
    book = { ...book, ...structuredClone(updates) };
    return book;
  },
  removeBook() {},
};
const utils = {
  sanitize: value => String(value ?? ''),
  readingProgress: () => 40,
  formatDate: value => String(value || ''),
  buildCover: () => '',
  statusBadgeClass: () => 'badge-reading',
  statusLabel: () => 'Reading',
  show: target => { target.hidden = false; },
  hide: target => { target.hidden = true; },
  toast: (message, type) => toasts.push({ message, type }),
};
let id = 0;
const feature = createBookDetailsPage({
  storage,
  utils,
  constants: { STATUS: { READING: 'reading', FINISHED: 'finished' } },
  bookApi: { getSourceLabels: () => [], normalizeSource: value => value },
  documentRoot,
  createId: () => `quote-${++id}`,
  confirmAction: () => true,
  actions: {
    logActivity: (...args) => calls.activity.push(args),
    getMetadataQuality: () => ({ className: 'complete', label: 'Complete' }),
    parseShelfInput: value => String(value).split(',').map(item => item.trim()).filter(Boolean),
    showProgressModal: () => { calls.progress += 1; },
    setStatus: () => {},
    setRating: (bookId, rating) => { calls.rating += 1; assert.equal(bookId, book.id); assert.equal(rating, 5); },
    refreshMetadata: async () => { calls.metadata += 1; return { status: 'updated' }; },
    toggleFavorite: () => { calls.favorite += 1; book = { ...book, isFavorite: true }; return book; },
    updateBadges: () => { calls.badges += 1; },
    renderCurrentPage: () => { calls.renders += 1; },
  },
});

assert.equal(feature.render('book-1'), undefined);
assert.equal(modal.hidden, false);
assert.match(body.html, /Dune/);
assert.match(body.html, /40% Complete/);
assert.match(body.html, /4\/5/);
assert.match(elements.get('bookQuotesList').innerHTML, /Kindle note/);
assert.match(elements.get('bookQuotesList').innerHTML, /p\. 44/);
assert.doesNotMatch(body.html, /onclick\s*=/i);

elements.get('bookNotesTextarea').value = 'Updated thoughts';
elements.get('saveBookNoteBtn').listeners.click();
assert.equal(book.notes, 'Updated thoughts');

elements.get('bookQuoteTextInput').value = 'New quote';
elements.get('bookQuotePageInput').value = '12';
elements.get('bookQuoteNoteInput').value = 'Context';
elements.get('saveBookQuoteBtn').listeners.click();
assert.equal(book.quotes[0].text, 'New quote');
const createdId = book.quotes[0].id;

elements.get('bookQuotesList').listeners.click({ target: { closest: () => ({ dataset: { quoteAction: 'edit', quoteId: createdId } }) } });
elements.get('bookQuoteTextInput').value = 'Edited quote';
elements.get('saveBookQuoteBtn').listeners.click();
assert.equal(book.quotes.find(quote => quote.id === createdId).text, 'Edited quote');

elements.get('bookQuotesList').listeners.click({ target: { closest: () => ({ dataset: { quoteAction: 'delete', quoteId: createdId } }) } });
assert.equal(book.quotes.some(quote => quote.id === createdId), false);

elements.get('bookDetailsRating').listeners.click({ target: { closest: () => ({ dataset: { rating: '5' } }) } });
assert.equal(calls.rating, 1);

function findButton(fragment) {
  const queue = [...footer.children];
  while (queue.length) {
    const current = queue.shift();
    if (String(current.innerHTML || '').includes(fragment) || String(current.title || '').includes(fragment)) return current;
    queue.push(...(current.children || []));
  }
  return null;
}

findButton('Update Progress').listeners.click();
assert.equal(calls.progress, 1);
assert.equal(modal.hidden, true);

feature.render('book-1');
await findButton('Refresh metadata').listeners.click();
assert.equal(calls.metadata, 1);
assert.ok(calls.renders >= 1);

findButton('favorites').listeners.click();
assert.equal(calls.favorite, 1);
assert.ok(calls.badges >= 1);

closeButton.listeners.click();
assert.equal(modal.hidden, true);
feature.render('book-1');
modal.listeners.click({ target: modal });
assert.equal(modal.hidden, true);

assert.ok(calls.activity.some(args => args[0] === 'note_saved'));
assert.ok(calls.activity.some(args => args[0] === 'quote_saved'));
assert.ok(calls.activity.some(args => args[0] === 'quote_updated'));
assert.ok(calls.activity.some(args => args[0] === 'quote_deleted'));
assert.ok(toasts.some(toast => toast.message === 'Quote saved'));

console.log('Book Details module tests passed.');
