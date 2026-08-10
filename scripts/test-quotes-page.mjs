import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aggregateLibraryQuotes, createQuotesPage, filterLibraryQuotes } from '../frontend/js/features/quotes/quotesPage.js';

const books = [
  {
    id: 'book-1',
    title: 'Dune',
    author: 'Frank Herbert',
    quotes: [
      { id: 'manual-1', text: 'A beginning is the time for taking care.', note: 'Opening line', page: 3 },
      { id: 'kindle-highlight', text: 'Fear is the mind-killer.', note: '', page: 42, source: 'kindle' },
      { id: 'kindle-note', text: '', note: 'Compare this with chapter two.', page: 43, source: 'kindle' },
    ],
  },
  {
    id: 'book-2',
    title: 'Cien años de soledad',
    author: 'Gabriel García Márquez',
    quotes: [{ id: 'unicode', text: '百年孤独 — memoria 📚', note: 'Único', page: null, source: 'kindle' }],
  },
  { id: 'book-3', title: 'Empty Book', author: 'Nobody', quotes: [] },
];

const quotes = aggregateLibraryQuotes(books);
assert.equal(quotes.length, 4);
assert.deepEqual(quotes.map(quote => quote.bookId), ['book-1', 'book-1', 'book-1', 'book-2']);
assert.equal(filterLibraryQuotes(quotes, { query: 'MIND-KILLER' }).length, 1);
assert.equal(filterLibraryQuotes(quotes, { query: 'opening LINE' })[0].id, 'manual-1');
assert.equal(filterLibraryQuotes(quotes, { query: 'CIEN AÑOS' })[0].id, 'unicode');
assert.equal(filterLibraryQuotes(quotes, { query: 'frank HERBERT' }).length, 3);
assert.equal(filterLibraryQuotes(quotes, { query: '百年孤独' })[0].id, 'unicode');
assert.deepEqual(filterLibraryQuotes(quotes, { filter: 'manual' }).map(quote => quote.id), ['manual-1']);
assert.deepEqual(filterLibraryQuotes(quotes, { filter: 'kindle-highlights' }).map(quote => quote.id), ['kindle-highlight', 'unicode']);
assert.deepEqual(filterLibraryQuotes(quotes, { filter: 'kindle-notes' }).map(quote => quote.id), ['kindle-note']);
assert.deepEqual(aggregateLibraryQuotes([{ quotes: [null, {}, { text: '', note: '' }] }, null]), []);

function createPageHarness(libraryBooks) {
  const listeners = {};
  const list = { innerHTML: '' };
  const input = { id: 'quotesSearchInput', value: '' };
  const clear = { hidden: true, dataset: { action: 'clear-quotes-search' } };
  const main = {
    innerHTML: '',
    addEventListener(type, handler) { listeners[type] = handler; },
    querySelector(selector) { return selector === '[data-action="clear-quotes-search"]' ? clear : null; },
    querySelectorAll() { return []; },
  };
  const elements = { mainContent: main, quotesLibraryList: list, quotesSearchInput: input };
  const opened = [];
  const render = createQuotesPage({
    storage: { getBooks: () => libraryBooks },
    utils: { sanitize: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') },
    actions: { showBookDetails: id => opened.push(id) },
    documentRoot: { getElementById: id => elements[id] || null },
  });
  render();
  return { main, list, input, clear, listeners, opened };
}

const page = createPageHarness(books);
assert.match(page.main.innerHTML, /id="quotesPage"/);
assert.match(page.main.innerHTML, /Search quotes, notes, titles, or authors/);
assert.match(page.list.innerHTML, /Fear is the mind-killer\./);
assert.match(page.list.innerHTML, /Compare this with chapter two\./);
assert.match(page.list.innerHTML, /Dune · Frank Herbert/);
assert.match(page.list.innerHTML, /p\. 42/);
assert.match(page.list.innerHTML, /Kindle highlight/);
assert.match(page.list.innerHTML, /Kindle note/);
assert.match(page.list.innerHTML, /百年孤独 — memoria 📚/u);
assert.doesNotMatch(page.main.innerHTML + page.list.innerHTML, /onclick\s*=/i);

page.listeners.input({ target: { id: 'quotesSearchInput', value: 'not present anywhere' } });
assert.match(page.list.innerHTML, /No matching quotes/);
assert.equal(page.clear.hidden, false);

page.listeners.input({ target: { id: 'quotesSearchInput', value: 'garcía márquez' } });
assert.match(page.list.innerHTML, /Cien años de soledad/);
assert.doesNotMatch(page.list.innerHTML, /Fear is the mind-killer/);

page.listeners.click({
  target: { closest: () => ({ dataset: { action: 'open-quote-book', bookId: 'book-2' } }) },
  preventDefault() {},
});
assert.deepEqual(page.opened, ['book-2']);

const emptyPage = createPageHarness([]);
assert.match(emptyPage.list.innerHTML, /No saved quotes yet/);

const navigationSource = fs.readFileSync('frontend/js/navigation.js', 'utf8');
assert.match(navigationSource, /createQuotesPage/);
assert.match(navigationSource, /quotes:\s+quotesFeature/);

console.log('Quotes page tests passed.');
