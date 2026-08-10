import assert from 'node:assert/strict';
import { createBookDetailsPage } from '../frontend/js/features/bookDetails/bookDetailsPage.js';

function createElement(id = '') {
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
    focus() { this.focused = true; },
    hasAttribute(name) { return name === 'hidden' ? this.hidden : false; },
  };
}

function createHarness(initialBook) {
  let book = structuredClone(initialBook);
  const updates = [];
  const toasts = [];
  const elements = new Map();
  const modal = createElement('bookDetailsModal');
  const body = createElement('bookDetailsBody');
  const footer = createElement('bookDetailsFooter');
  const close = createElement('closeBookDetails');
  modal.hidden = true;
  modal.querySelector = selector => {
    if (selector === '#bookDetailsFooter') return footer;
    if (selector === '.book-details-modal') return modal;
    if (selector === '.modal-close') return close;
    return null;
  };
  Object.defineProperty(body, 'innerHTML', {
    get() { return this._html || ''; },
    set(value) {
      this._html = String(value || '');
      for (const match of this._html.matchAll(/id="([^"]+)"/g)) {
        if (!elements.has(match[1])) elements.set(match[1], createElement(match[1]));
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
    createElement: () => createElement(),
  };
  const storage = {
    getBookById: id => id === book.id ? book : null,
    updateBook(id, patch) {
      if (id !== book.id) return null;
      updates.push(structuredClone(patch));
      book = { ...book, ...structuredClone(patch) };
      return book;
    },
    removeBook() {},
  };
  const sanitize = value => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const utils = {
      sanitize,
      readingProgress: () => 0,
      formatDate: value => String(value || ''),
      buildCover: () => '',
      statusBadgeClass: () => '',
      statusLabel: value => value,
      show: element => { element.hidden = false; },
      hide: element => { element.hidden = true; },
      toast: (message, type) => toasts.push({ message, type }),
  };
  let generatedId = 0;
  const feature = createBookDetailsPage({
    storage,
    utils,
    constants: { STATUS: { READING: 'reading', FINISHED: 'finished' } },
    bookApi: { getSourceLabels: () => [], normalizeSource: value => value },
    documentRoot,
    createId: () => `generated-${++generatedId}`,
    confirmAction: () => true,
    actions: {
      getMetadataQuality: () => ({ className: 'ok', label: 'OK' }),
      parseShelfInput: value => String(value || '').split(',').map(item => item.trim()).filter(Boolean),
      showProgressModal() {},
      setStatus() {},
      setRating() {},
      refreshMetadata: async () => ({ status: 'no-new' }),
      toggleFavorite() {},
      updateBadges() {},
      renderCurrentPage() {},
      logActivity() {},
    },
  });
  return {
    show: () => feature.render(book.id),
    element: id => elements.get(id),
    getBook: () => book,
    updates,
    toasts,
    body,
    modal,
  };
}

function baseBook(quotes) {
  return {
    id: 'book-1',
    title: 'Kindle Library',
    author: 'Reader',
    status: 'finished',
    currentPage: 0,
    pageCount: 500,
    rating: null,
    genres: [],
    tags: [],
    notes: '',
    quotes,
  };
}

const mixed = createHarness(baseBook([
  { id: 'kindle-highlight', text: 'Fear is the mind-killer.', page: 42, note: '', source: 'kindle' },
  { id: 'kindle-note', text: '', page: 43, note: 'Compare this with chapter two.', source: 'kindle' },
  { id: 'manual', text: 'A manually saved quote.', page: 12, note: 'My context' },
  { id: 'unicode', text: '百年孤独 — García Márquez 📚', page: null, note: '', source: 'kindle' },
  { id: 'missing-fields', source: 'kindle' },
]));
mixed.show();
const mixedMarkup = mixed.element('bookQuotesList').innerHTML;
assert.match(mixedMarkup, /Fear is the mind-killer\./);
assert.match(mixedMarkup, /Kindle highlight/);
assert.match(mixedMarkup, /Compare this with chapter two\./);
assert.match(mixedMarkup, /Kindle note/);
assert.match(mixedMarkup, /p\. 42/);
assert.match(mixedMarkup, /p\. 43/);
assert.match(mixedMarkup, /A manually saved quote\./);
assert.match(mixedMarkup, /My context/);
assert.match(mixedMarkup, /百年孤独 — García Márquez 📚/u);
assert.match(mixedMarkup, /Untitled quote/);
assert.doesNotMatch(mixedMarkup, /onclick\s*=/i);

const mixedQuoteList = mixed.element('bookQuotesList');
mixedQuoteList.listeners.click({
  target: { closest: () => ({ dataset: { quoteAction: 'edit', quoteId: 'manual' } }) },
});
assert.equal(mixed.element('bookQuoteTextInput').value, 'A manually saved quote.');
mixed.element('bookQuoteTextInput').value = 'An edited manual quote.';
mixed.element('saveBookQuoteBtn').listeners.click();
assert.equal(mixed.getBook().quotes.find(quote => quote.id === 'manual').text, 'An edited manual quote.');
mixedQuoteList.listeners.click({
  target: { closest: () => ({ dataset: { quoteAction: 'delete', quoteId: 'manual' } }) },
});
assert.equal(mixed.getBook().quotes.some(quote => quote.id === 'manual'), false);

const empty = createHarness(baseBook([]));
empty.show();
assert.match(empty.element('bookQuotesList').innerHTML, /No private quotes yet\./);

const kindleOnly = createHarness(baseBook([
  { id: 'note-only', text: '', page: 88, note: 'Original Kindle note', source: 'kindle' },
]));
kindleOnly.show();
const quoteList = kindleOnly.element('bookQuotesList');
quoteList.listeners.click({
  target: { closest: () => ({ dataset: { quoteAction: 'edit', quoteId: 'note-only' } }) },
});
assert.equal(kindleOnly.element('bookQuoteTextInput').value, '');
assert.equal(kindleOnly.element('bookQuotePageInput').value, 88);
assert.equal(kindleOnly.element('bookQuoteNoteInput').value, 'Original Kindle note');
kindleOnly.element('bookQuoteNoteInput').value = 'Edited Kindle note';
kindleOnly.element('saveBookQuoteBtn').listeners.click();
assert.equal(kindleOnly.getBook().quotes[0].note, 'Edited Kindle note');
assert.equal(kindleOnly.getBook().quotes[0].source, 'kindle');
assert.equal(kindleOnly.toasts.at(-1).message, 'Quote updated');

quoteList.listeners.click({
  target: { closest: () => ({ dataset: { quoteAction: 'delete', quoteId: 'note-only' } }) },
});
assert.equal(kindleOnly.getBook().quotes.length, 0);
assert.equal(kindleOnly.toasts.at(-1).message, 'Quote deleted');
assert.ok(kindleOnly.updates.length >= 2);

console.log('Book Details Kindle quote tests passed.');
