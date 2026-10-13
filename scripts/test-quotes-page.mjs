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
  const input = { id: 'quotesSearchInput', value: '', focused: false, focus() { this.focused = true; } };
  const status = { textContent: '' };
  const chips = ['all', 'manual', 'kindle-highlights', 'kindle-notes'].map(value => ({
    dataset: { action: 'filter-quotes', filter: value },
    active: false,
    attributes: {},
    classList: { toggle(name, active) { chips.find(chip => chip.classList === this).active = active; } },
    setAttribute(name, value) { this.attributes[name] = value; },
  }));
  const clear = { hidden: true, dataset: { action: 'clear-quotes-search' } };
  const main = {
    innerHTML: '',
    addEventListener(type, handler) { listeners[type] = handler; },
    querySelector(selector) { return selector === '[data-action="clear-quotes-search"]' ? clear : null; },
    querySelectorAll() { return chips; },
  };
  const elements = { mainContent: main, quotesLibraryList: list, quotesSearchInput: input, quotesResultsStatus: status };
  const opened = [];
  const render = createQuotesPage({
    storage: { getBooks: () => libraryBooks },
    utils: { sanitize: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') },
    actions: { showBookDetails: id => opened.push(id) },
    documentRoot: { getElementById: id => elements[id] || null },
  });
  render();
  return { main, list, input, clear, listeners, opened, chips, status, render };
}

const page = createPageHarness(books);
assert.match(page.main.innerHTML, /id="quotesPage"/);
assert.match(page.main.innerHTML, /Your private collection/);
assert.match(page.main.innerHTML, /for="quotesSearchInput"/);
assert.match(page.main.innerHTML, /aria-pressed="true"/);
assert.equal(page.status.textContent, '4 of 4 saved quotes');
assert.match(page.main.innerHTML, /Search quotes, notes, titles, or authors/);
assert.match(page.list.innerHTML, /Fear is the mind-killer\./);
assert.match(page.list.innerHTML, /Compare this with chapter two\./);
assert.match(page.list.innerHTML, /Dune · Frank Herbert/);
assert.match(page.list.innerHTML, /p\. 42/);
assert.match(page.list.innerHTML, /Kindle highlight/);
assert.match(page.list.innerHTML, /Kindle note/);
assert.match(page.list.innerHTML, /百年孤独 — memoria 📚/u);
assert.match(page.list.innerHTML, /<blockquote class="quote-list-text">/);
assert.match(page.list.innerHTML, /Personal note/);
assert.doesNotMatch(page.main.innerHTML + page.list.innerHTML, /onclick\s*=/i);

page.listeners.input({ target: { id: 'quotesSearchInput', value: 'not present anywhere' } });
assert.match(page.list.innerHTML, /No matching quotes/);
assert.equal(page.clear.hidden, false);
assert.equal(page.status.textContent, '0 of 4 saved quotes match your search and filters');

page.listeners.input({ target: { id: 'quotesSearchInput', value: 'garcía márquez' } });
assert.match(page.list.innerHTML, /Cien años de soledad/);
assert.doesNotMatch(page.list.innerHTML, /Fear is the mind-killer/);

page.listeners.click({
  target: { closest: () => ({ dataset: { action: 'open-quote-book', bookId: 'book-2' } }) },
  preventDefault() {},
});
assert.deepEqual(page.opened, ['book-2']);

page.listeners.click({ target: { closest: () => page.clear }, preventDefault() {} });
assert.equal(page.input.value, '');
assert.equal(page.input.focused, true);
assert.equal(page.clear.hidden, true);
page.listeners.click({ target: { closest: () => page.chips[3] }, preventDefault() {} });
assert.match(page.list.innerHTML, /Compare this with chapter two/);
assert.doesNotMatch(page.list.innerHTML, /Fear is the mind-killer/);
assert.equal(page.status.textContent, '1 of 4 saved quotes match your search and filters');
assert.deepEqual(page.chips.map(chip => chip.attributes['aria-pressed']), ['false', 'false', 'false', 'true']);
page.render();
assert.match(page.main.innerHTML, /aria-pressed="true" data-action="filter-quotes" data-filter="kindle-notes"/);

const escaped = createPageHarness([{ id: 'unsafe', title: '<script>title</script>', author: '<svg onload=alert(1)>', quotes: [{ text: '<img src=x onerror=alert(1)>', note: '<b>note</b>', page: 0, location: '12–19' }] }]);
assert.doesNotMatch(escaped.list.innerHTML, /<script>|<img src=x|<svg onload/);
assert.match(escaped.list.innerHTML, /&lt;img/);
assert.match(escaped.list.innerHTML, /p\. 0/);
assert.match(escaped.list.innerHTML, /Location 12–19/);

const emptyPage = createPageHarness([]);
assert.match(emptyPage.list.innerHTML, /No saved quotes yet/);

const navigationSource = fs.readFileSync('frontend/js/navigation.js', 'utf8');
assert.match(navigationSource, /createQuotesPage/);
assert.match(navigationSource, /quotes:\s+quotesFeature/);

console.log('Quotes page tests passed.');
