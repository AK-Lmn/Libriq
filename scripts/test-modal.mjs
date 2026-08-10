import assert from 'node:assert/strict';
import { createBookDetailsPage } from '../frontend/js/features/bookDetails/bookDetailsPage.js';

function createElement(id = '') {
  return {
    id,
    hidden: false,
    innerHTML: '',
    textContent: '',
    value: '',
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
    focus() {},
  };
}

const elements = new Map();
const modal = createElement('bookDetailsModal');
const body = createElement('bookDetailsBody');
const footer = createElement('bookDetailsFooter');
const closeButton = createElement('closeBookDetails');
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
const book = {
  id: 'book-1',
  title: 'Sample Book',
  author: 'Sample Author',
  status: 'reading',
  currentPage: 40,
  pageCount: 100,
  rating: null,
  genres: ['Genre'],
  tags: ['Shelf'],
  notes: '',
  quotes: [],
};
const feature = createBookDetailsPage({
  storage: {
    getBookById: id => id === book.id ? book : null,
    updateBook: () => book,
    removeBook() {},
  },
  utils: {
    sanitize: value => String(value ?? ''),
    readingProgress: () => 40,
    formatDate: value => String(value || ''),
    buildCover: () => '',
    statusBadgeClass: () => 'badge-reading',
    statusLabel: () => 'Reading',
    show: target => { target.hidden = false; },
    hide: target => { target.hidden = true; },
    toast() {},
  },
  constants: { STATUS: { READING: 'reading', FINISHED: 'finished' } },
  bookApi: { getSourceLabels: () => [], normalizeSource: value => value },
  documentRoot,
  createId: () => 'quote-id',
  confirmAction: () => true,
  actions: {
    getMetadataQuality: () => ({ className: 'ok', label: 'OK' }),
    parseShelfInput: () => [],
    showProgressModal() {},
    setStatus() {},
    setRating() {},
    refreshMetadata: async () => ({ status: 'no-new' }),
    toggleFavorite: () => book,
    updateBadges() {},
    renderCurrentPage() {},
    logActivity() {},
  },
});

function countButtons(fragment) {
  const visit = node => (String(node?.innerHTML || '').includes(fragment) ? 1 : 0)
    + (node?.children || []).reduce((sum, child) => sum + visit(child), 0);
  return visit(footer);
}

feature.render('book-1');
assert.equal(modal.hidden, false);
assert.equal(countButtons('Update Progress'), 1);
assert.equal(countButtons('Mark Finished'), 1);
assert.equal(countButtons('Refresh metadata'), 1);
assert.equal(countButtons('ph-trash'), 1);

feature.render('book-1');
assert.equal(countButtons('Update Progress'), 1);
assert.equal(countButtons('Mark Finished'), 1);
assert.equal(countButtons('Refresh metadata'), 1);
assert.equal(countButtons('ph-trash'), 1);

closeButton.listeners.click();
assert.equal(modal.hidden, true);
feature.render('book-1');
modal.listeners.click({ target: modal });
assert.equal(modal.hidden, true);

console.log('Modal regression test passed.');
