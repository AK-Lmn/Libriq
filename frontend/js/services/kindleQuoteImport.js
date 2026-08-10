import { normalizeMergeText } from './importMerge.js';

export function createKindleQuoteImport({ createId, now } = {}) {
  if (typeof createId !== 'function' || typeof now !== 'function') {
    throw new TypeError('createKindleQuoteImport requires createId and now.');
  }

  return {
    applyKindleImportPlan: input => applyKindleImportPlan(input, { createId, now }),
  };
}

export function applyKindleImportPlan({ importPlan, existingQuotesByBookId = {} } = {}, dependencies = {}) {
  const { createId, now } = dependencies;
  if (typeof createId !== 'function' || typeof now !== 'function') {
    throw new TypeError('applyKindleImportPlan requires createId and now dependencies.');
  }

  const plan = importPlan && typeof importPlan === 'object' ? importPlan : {};
  const matchedInput = Array.isArray(plan.matchedBooks) ? plan.matchedBooks : [];
  const createdInput = Array.isArray(plan.booksToCreate) ? plan.booksToCreate : [];
  const matchedBooks = [];
  const booksToCreate = [];
  let importedQuotes = 0;
  let skippedQuotes = 0;

  for (const item of matchedInput) {
    if (!item || typeof item !== 'object') continue;
    const bookId = String(item.bookId || item.existingBook?.id || '').trim();
    if (!bookId) continue;
    const existingQuotes = getExistingQuotes(existingQuotesByBookId, bookId);
    const result = importEntries(item.entries, existingQuotes, { createId, now });
    importedQuotes += result.importedQuotes;
    skippedQuotes += result.skippedQuotes;
    matchedBooks.push({ bookId, quotes: result.quotes });
  }

  for (const item of createdInput) {
    if (!item || typeof item !== 'object') continue;
    const candidateBook = item.candidateBook || item.candidate;
    if (!candidateBook || typeof candidateBook !== 'object') continue;
    const initialQuotes = Array.isArray(candidateBook.quotes) ? candidateBook.quotes : [];
    const result = importEntries(item.entries, initialQuotes, { createId, now });
    importedQuotes += result.importedQuotes;
    skippedQuotes += result.skippedQuotes;
    booksToCreate.push({ candidateBook, quotes: result.quotes });
  }

  return {
    matchedBooks,
    booksToCreate,
    importedQuotes,
    skippedQuotes,
    booksCreated: booksToCreate.length,
  };
}

function importEntries(entries, existingQuotes, { createId, now } = {}) {
  if (typeof createId !== 'function' || typeof now !== 'function') {
    throw new TypeError('importEntries requires createId and now dependencies.');
  }
  const quotes = Array.isArray(existingQuotes) ? existingQuotes.map(quote => ({ ...quote })) : [];
  const identities = new Set(quotes.map(quoteIdentityKey));
  let importedQuotes = 0;
  let skippedQuotes = 0;

  for (const entry of Array.isArray(entries) ? entries : []) {
    const quoteData = kindleEntryToQuoteData(entry);
    if (!quoteData) {
      skippedQuotes += 1;
      continue;
    }
    const identity = quoteIdentityKey(quoteData);
    if (identities.has(identity)) {
      skippedQuotes += 1;
      continue;
    }
    const timestamp = now();
    const quote = {
      id: createId(),
      ...quoteData,
      source: 'kindle',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    quotes.push(quote);
    identities.add(identity);
    importedQuotes += 1;
  }

  return { quotes, importedQuotes, skippedQuotes };
}

function kindleEntryToQuoteData(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const type = String(entry.type || '').toLowerCase();
  const value = String(entry.text || '').trim();
  if (!value || !['highlight', 'note'].includes(type)) return null;
  return {
    text: type === 'highlight' ? value : '',
    page: extractKindlePage(entry.location),
    note: type === 'note' ? value : '',
  };
}

export function extractKindlePage(location) {
  if (location == null) return null;
  const match = String(location).match(/\d+/);
  if (!match) return null;
  const page = Number(match[0]);
  return Number.isSafeInteger(page) ? page : null;
}

function quoteIdentityKey(quote) {
  const page = extractStoredPage(quote?.page);
  return [normalizeQuoteValue(quote?.text), normalizeQuoteValue(quote?.note), page == null ? '' : String(page)].join('\u0000');
}

function normalizeQuoteValue(value) {
  const input = String(value || '').trim();
  const normalized = normalizeMergeText(input);
  if (normalized || !input) return normalized;
  return input.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

function extractStoredPage(page) {
  if (page == null || page === '') return null;
  const numeric = Number(page);
  return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : extractKindlePage(page);
}

function getExistingQuotes(existingQuotesByBookId, bookId) {
  if (existingQuotesByBookId instanceof Map) {
    const quotes = existingQuotesByBookId.get(bookId);
    return Array.isArray(quotes) ? quotes : [];
  }
  const quotes = existingQuotesByBookId && typeof existingQuotesByBookId === 'object'
    ? existingQuotesByBookId[bookId]
    : null;
  return Array.isArray(quotes) ? quotes : [];
}
