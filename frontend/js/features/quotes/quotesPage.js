export function aggregateLibraryQuotes(books) {
  const aggregated = [];
  for (const book of Array.isArray(books) ? books : []) {
    if (!book || typeof book !== 'object') continue;
    const bookQuotes = Array.isArray(book.quotes) ? book.quotes : [];
    for (let quoteIndex = 0; quoteIndex < bookQuotes.length; quoteIndex += 1) {
      const quote = bookQuotes[quoteIndex];
      if (!quote || typeof quote !== 'object') continue;
      const text = String(quote.text || '').trim();
      const note = String(quote.note || '').trim();
      if (!text && !note) continue;
      aggregated.push({
        ...quote,
        id: String(quote.id || ''),
        text,
        note,
        page: quote.page ?? null,
        bookId: String(book.id || ''),
        bookTitle: String(book.title || 'Unknown title'),
        bookAuthor: String(book.author || 'Unknown author'),
        source: quote.source === 'kindle' ? 'kindle' : 'manual',
        kind: quote.source === 'kindle' && !text && note ? 'note' : 'highlight',
        key: `${String(book.id || '')}:${String(quote.id || quoteIndex)}`,
      });
    }
  }
  return aggregated;
}

export function filterLibraryQuotes(quotes, { query = '', filter = 'all' } = {}) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  return (Array.isArray(quotes) ? quotes : []).filter(quote => {
    if (filter === 'manual' && quote.source !== 'manual') return false;
    if (filter === 'kindle-highlights' && !(quote.source === 'kindle' && quote.kind === 'highlight')) return false;
    if (filter === 'kindle-notes' && !(quote.source === 'kindle' && quote.kind === 'note')) return false;
    if (!needle) return true;
    return [quote.text, quote.note, quote.bookTitle, quote.bookAuthor]
      .some(value => String(value || '').toLocaleLowerCase().includes(needle));
  });
}

export function createQuotesPage({ storage, utils, actions = {}, clipboard, downloadMarkdown, documentRoot } = {}) {
  if (!storage || !utils) throw new TypeError('createQuotesPage requires storage and utils.');
  let boundMain = null;
  let query = '';
  let filter = 'all';
  const getDocument = () => documentRoot || globalThis.document;

  function getQuotes() {
    return aggregateLibraryQuotes(storage.getBooks?.() || []);
  }

  function render({ root } = {}) {
    const pageDocument = getDocument();
    const main = root || pageDocument?.getElementById?.('mainContent');
    if (!main) return;
    const quotes = getQuotes();
    main.innerHTML = `
      <div class="page" id="quotesPage">
        <div class="page-header library-header">
          <div class="library-heading">
            <span class="library-eyebrow">Saved passages</span>
            <h1 class="page-title">Quotes</h1>
            <p class="page-subtitle">${quotes.length} saved quote${quotes.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div class="library-tools">
          <div class="library-search-wrap">
            <i class="ph ph-magnifying-glass library-search-icon"></i>
            <input type="search" id="quotesSearchInput" class="library-search-input" placeholder="Search quotes, notes, titles, or authors..." value="${utils.sanitize(query)}" autocomplete="off" spellcheck="false" />
            <button type="button" class="library-search-clear" data-action="clear-quotes-search" aria-label="Clear quote search" ${query ? '' : 'hidden'}><i class="ph ph-x"></i></button>
          </div>
        </div>
        <div class="chip-group library-filters" id="quotesFilters">
          ${buildFilter('all', 'All', filter)}
          ${buildFilter('manual', 'Manual', filter)}
          ${buildFilter('kindle-highlights', 'Kindle Highlights', filter)}
          ${buildFilter('kindle-notes', 'Kindle Notes', filter)}
        </div>
        <div class="activity-list book-quotes-list" id="quotesLibraryList"></div>
      </div>`;
    bindEvents(main);
    renderResults(quotes);
  }

  function renderResults(quotes = getQuotes()) {
    const list = getDocument()?.getElementById?.('quotesLibraryList');
    if (!list) return;
    const filtered = filterLibraryQuotes(quotes, { query, filter });
    if (!quotes.length) {
      list.innerHTML = buildEmpty('No saved quotes yet', 'Quotes and Kindle clippings saved to books will appear here.');
      return;
    }
    if (!filtered.length) {
      list.innerHTML = buildEmpty('No matching quotes', 'Try another search or filter.');
      return;
    }
    list.innerHTML = filtered.map(quote => buildQuoteCard(quote, utils)).join('');
  }

  function bindEvents(main) {
    if (boundMain === main) return;
    boundMain = main;
    main.addEventListener('input', event => {
      if (event.target.id !== 'quotesSearchInput') return;
      query = String(event.target.value || '').trim();
      const clear = main.querySelector?.('[data-action="clear-quotes-search"]');
      if (clear) clear.hidden = !query;
      renderResults();
    });
    main.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action]');
      if (!trigger) return;
      if (trigger.dataset.action === 'filter-quotes') {
        filter = trigger.dataset.filter || 'all';
        main.querySelectorAll?.('#quotesFilters .chip').forEach(chip => chip.classList.toggle('active', chip === trigger));
        renderResults();
      } else if (trigger.dataset.action === 'clear-quotes-search') {
        query = '';
        const input = getDocument()?.getElementById?.('quotesSearchInput');
        if (input) input.value = '';
        trigger.hidden = true;
        renderResults();
      } else if (trigger.dataset.action === 'open-quote-book') {
        actions.showBookDetails?.(trigger.dataset.bookId);
      } else if (['copy-quote', 'copy-quote-citation', 'export-quote-markdown'].includes(trigger.dataset.action)) {
        const quote = getQuotes().find(item => item.key === trigger.dataset.quoteKey);
        if (!quote) return;
        handleQuoteAction(trigger.dataset.action, quote);
      } else {
        return;
      }
      event.preventDefault?.();
    });
  }

  async function handleQuoteAction(action, quote) {
    try {
      if (action === 'copy-quote') {
        await getClipboardAdapter(clipboard).writeText(getQuoteContent(quote));
        utils.toast?.('Quote copied', 'success');
      } else if (action === 'copy-quote-citation') {
        await getClipboardAdapter(clipboard).writeText(formatQuoteCitation(quote));
        utils.toast?.('Quote citation copied', 'success');
      } else {
        const markdown = formatQuoteMarkdown(quote);
        await (downloadMarkdown || downloadMarkdownFile)({ filename: buildQuoteFilename(quote), text: markdown });
        utils.toast?.('Quote exported as Markdown', 'success');
      }
    } catch (error) {
      utils.toast?.(action === 'export-quote-markdown' ? 'Could not export quote' : 'Could not copy quote', 'error');
      actions.quoteActionError?.(error, action, quote);
    }
  }

  return render;
}

function buildFilter(value, label, active) {
  return `<button type="button" class="chip${value === active ? ' active' : ''}" data-action="filter-quotes" data-filter="${value}">${label}</button>`;
}

function buildQuoteCard(quote, utils) {
  const primary = quote.text || quote.note;
  const details = [
    quote.source === 'kindle' ? (quote.kind === 'note' ? 'Kindle note' : 'Kindle highlight') : '',
    quote.page !== null && quote.page !== '' ? `p. ${utils.sanitize(String(quote.page))}` : '',
  ].filter(Boolean).join(' · ');
  return `<article class="activity-item quote-list-item">
    <div class="activity-text quote-list-copy">
      <div class="activity-title quote-list-text">${utils.sanitize(primary)}</div>
      ${quote.text && quote.note ? `<div class="activity-subtitle">${utils.sanitize(quote.note)}</div>` : ''}
      <div class="activity-subtitle">${utils.sanitize(quote.bookTitle)} · ${utils.sanitize(quote.bookAuthor)}${details ? ` · ${details}` : ''}</div>
    </div>
    <div class="activity-time quote-list-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-action="copy-quote" data-quote-key="${utils.sanitize(quote.key)}">Copy Quote</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="copy-quote-citation" data-quote-key="${utils.sanitize(quote.key)}">Copy + Citation</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="export-quote-markdown" data-quote-key="${utils.sanitize(quote.key)}">Export Markdown</button>
      <button type="button" class="btn btn-ghost btn-sm" data-action="open-quote-book" data-book-id="${utils.sanitize(quote.bookId)}">View Book</button>
    </div>
  </article>`;
}

export function getQuoteContent(quote) {
  return String(quote?.text || quote?.note || '').trim();
}

export function formatQuoteCitation(quote) {
  const content = getQuoteContent(quote);
  const author = String(quote?.bookAuthor || 'Unknown author').trim();
  const title = String(quote?.bookTitle || 'Unknown title').trim();
  const page = quote?.page !== null && quote?.page !== undefined && quote?.page !== '' ? `, p. ${quote.page}` : '';
  return `"${content}"\n\n— ${author}, ${title}${page}`;
}

export function formatQuoteMarkdown(quote) {
  const lines = [
    `> ${getQuoteContent(quote).replace(/\r?\n/g, '\n> ')}`,
    '',
    `Author: ${String(quote?.bookAuthor || 'Unknown author')}`,
    `Book: ${String(quote?.bookTitle || 'Unknown title')}`,
  ];
  if (quote?.page !== null && quote?.page !== undefined && quote?.page !== '') lines.push(`Page: ${quote.page}`);
  if (quote?.note) lines.push(`Note: ${quote.note}`);
  return lines.join('\n');
}

export function buildQuoteFilename(quote) {
  const title = String(quote?.bookTitle || 'quote').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `${title || 'quote'}-quote.md`;
}

function getClipboardAdapter(adapter) {
  if (adapter && typeof adapter.writeText === 'function') return adapter;
  if (globalThis.navigator?.clipboard?.writeText) return { writeText: text => globalThis.navigator.clipboard.writeText(text) };
  throw new Error('Clipboard is unavailable.');
}

export async function downloadMarkdownFile({ filename, text }) {
  const pageDocument = globalThis.document;
  const BlobCtor = globalThis.Blob;
  const urlApi = globalThis.URL;
  if (!pageDocument?.createElement || !BlobCtor || !urlApi?.createObjectURL) throw new Error('File download is unavailable.');
  const url = urlApi.createObjectURL(new BlobCtor([text], { type: 'text/markdown;charset=utf-8' }));
  try {
    const anchor = pageDocument.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
  } finally {
    urlApi.revokeObjectURL(url);
  }
}

function buildEmpty(title, body) {
  return `<div class="empty-state quote-empty-state grid-full-width">
    <div class="empty-state-icon"><i class="ph ph-quotes"></i></div>
    <div class="empty-state-title">${title}</div>
    <div class="empty-state-body">${body}</div>
  </div>`;
}
