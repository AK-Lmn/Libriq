import assert from 'node:assert/strict';
import {
  aggregateLibraryQuotes,
  buildQuoteFilename,
  createQuotesPage,
  formatQuoteCitation,
  formatQuoteMarkdown,
  getQuoteContent,
} from '../frontend/js/features/quotes/quotesPage.js';

const books = [{
  id: 'book-1',
  title: 'Cien años de soledad',
  author: 'Gabriel García Márquez',
  quotes: [
    { id: 'highlight', text: '百年孤独 — memoria 📚', note: 'Remember this', page: 27, source: 'kindle' },
    { id: 'note', text: '', note: 'Kindle note only', page: 31, source: 'kindle' },
    { id: 'manual', text: 'Manual quotation', note: '', page: null },
  ],
}];
const [highlight, note, manual] = aggregateLibraryQuotes(books);

assert.equal(getQuoteContent(highlight), '百年孤独 — memoria 📚');
assert.equal(getQuoteContent(note), 'Kindle note only');
assert.equal(getQuoteContent(manual), 'Manual quotation');
assert.equal(formatQuoteCitation(highlight), '"百年孤独 — memoria 📚"\n\n— Gabriel García Márquez, Cien años de soledad, p. 27');
assert.equal(formatQuoteCitation(manual), '"Manual quotation"\n\n— Gabriel García Márquez, Cien años de soledad');
assert.equal(formatQuoteMarkdown(highlight), [
  '> 百年孤独 — memoria 📚',
  '',
  'Author: Gabriel García Márquez',
  'Book: Cien años de soledad',
  'Page: 27',
  'Note: Remember this',
].join('\n'));
assert.match(formatQuoteMarkdown(note), /^> Kindle note only/m);
assert.match(formatQuoteMarkdown(note), /Page: 31/);
assert.match(formatQuoteMarkdown(note), /Note: Kindle note only/);
assert.equal(buildQuoteFilename(highlight), 'cien-anos-de-soledad-quote.md');

function createHarness({ failClipboard = false } = {}) {
  const listeners = {};
  const clipboardWrites = [];
  const downloads = [];
  const toasts = [];
  const errors = [];
  const list = { innerHTML: '' };
  const main = {
    innerHTML: '',
    addEventListener(type, handler) { listeners[type] = handler; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const page = createQuotesPage({
    storage: { getBooks: () => books },
    utils: {
      sanitize: value => String(value ?? ''),
      toast: (message, type) => toasts.push({ message, type }),
    },
    clipboard: {
      async writeText(text) {
        if (failClipboard) throw new Error('Clipboard denied');
        clipboardWrites.push(text);
      },
    },
    downloadMarkdown: async payload => downloads.push(payload),
    actions: { quoteActionError: (error, action) => errors.push({ error, action }) },
    documentRoot: {
      getElementById(id) {
        if (id === 'mainContent') return main;
        if (id === 'quotesLibraryList') return list;
        return null;
      },
    },
  });
  page();
  const click = async (action, quoteKey) => {
    listeners.click({
      target: { closest: () => ({ dataset: { action, quoteKey } }) },
      preventDefault() {},
    });
    await new Promise(resolve => setTimeout(resolve, 0));
  };
  return { main, list, clipboardWrites, downloads, toasts, errors, click };
}

const harness = createHarness();
assert.match(harness.list.innerHTML, /Copy Quote/);
assert.match(harness.list.innerHTML, /Copy \+ Citation/);
assert.match(harness.list.innerHTML, /Export Markdown/);
assert.doesNotMatch(harness.list.innerHTML, /onclick\s*=/i);

await harness.click('copy-quote', highlight.key);
assert.deepEqual(harness.clipboardWrites, ['百年孤独 — memoria 📚']);
assert.deepEqual(harness.toasts.at(-1), { message: 'Quote copied', type: 'success' });

await harness.click('copy-quote-citation', highlight.key);
assert.equal(harness.clipboardWrites[1], formatQuoteCitation(highlight));
assert.deepEqual(harness.toasts.at(-1), { message: 'Quote citation copied', type: 'success' });

await harness.click('copy-quote', note.key);
assert.equal(harness.clipboardWrites[2], 'Kindle note only');

await harness.click('export-quote-markdown', highlight.key);
assert.deepEqual(harness.downloads[0], {
  filename: 'cien-anos-de-soledad-quote.md',
  text: formatQuoteMarkdown(highlight),
});
assert.deepEqual(harness.toasts.at(-1), { message: 'Quote exported as Markdown', type: 'success' });

const failure = createHarness({ failClipboard: true });
await failure.click('copy-quote', manual.key);
assert.deepEqual(failure.toasts, [{ message: 'Could not copy quote', type: 'error' }]);
assert.equal(failure.errors.length, 1);
assert.equal(failure.errors[0].action, 'copy-quote');

console.log('Quote action tests passed.');
