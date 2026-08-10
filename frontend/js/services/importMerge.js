export function createImportMerge({ createBook, statuses, now, createId }) {
  if (typeof createBook !== 'function' || !statuses || typeof now !== 'function' || typeof createId !== 'function') {
    throw new TypeError('createImportMerge requires createBook, statuses, now, and createId.');
  }

  const mergeQuotesConfigured = (current, incoming) => mergeQuotes(current, incoming, { now });
  const mergeBookRecordsConfigured = (current, incoming) => mergeBookRecords(current, incoming, {
    statuses, now, createId, mergeQuotes: mergeQuotesConfigured,
  });

  return {
    summarizeLibrary: (books, activity = []) => summarizeLibrary(books, activity, statuses),
    mergeBooksForImport: (current, imported) => mergeBooksForImport(current, imported, {
      createBook, mergeBookRecords: mergeBookRecordsConfigured,
    }),
    mergeBookRecords: mergeBookRecordsConfigured,
    mergeQuotes: mergeQuotesConfigured,
    mergeActivityById,
  };
}

function countRecords(list, filterFn) {
  return Array.isArray(list) ? list.filter(filterFn).length : 0;
}

export function summarizeLibrary(books, activity = [], statuses) {
  const safeBooks = Array.isArray(books) ? books : [];
  const safeActivity = Array.isArray(activity) ? activity : [];
  const notesCount = safeBooks.reduce((sum, book) => sum + (book?.notes ? 1 : 0), 0);
  const quotesCount = safeBooks.reduce((sum, book) => sum + (Array.isArray(book?.quotes) ? book.quotes.length : 0), 0);
  const lastUpdated = safeBooks.reduce((latest, book) => {
    const time = new Date(book?.updatedAt || book?.dateFinished || book?.dateStarted || book?.dateAdded || 0).getTime();
    return Number.isFinite(time) && time > latest ? time : latest;
  }, 0);
  return {
    bookCount: safeBooks.length,
    readingCount: countRecords(safeBooks, book => book?.status === statuses.READING),
    finishedCount: countRecords(safeBooks, book => book?.status === statuses.FINISHED),
    notesCount,
    quotesCount,
    activityCount: safeActivity.length,
    lastUpdatedAt: lastUpdated ? new Date(lastUpdated).toISOString() : null,
  };
}

export function mergeBooksForImport(currentBooks, importedBooks, { createBook, mergeBookRecords }) {
  const current = Array.isArray(currentBooks) ? currentBooks : [];
  const imported = Array.isArray(importedBooks) ? importedBooks : [];
  const result = current.map(book => ({ ...book }));
  const indexById = new Map(result.map((book, index) => [book.id, index]));
  const isbnIndex = new Map();
  const titleIndex = new Map();

  result.forEach((book, index) => {
    if (book?.isbn) isbnIndex.set(String(book.isbn).trim(), index);
    titleIndex.set(bookMergeKey(book), index);
  });

  imported.forEach(rawBook => {
    const book = createBook(rawBook);
    let matchIndex = null;
    const isbnKey = book.isbn ? String(book.isbn).trim() : '';
    if (book.id && indexById.has(book.id)) matchIndex = indexById.get(book.id);
    else if (isbnKey && isbnIndex.has(isbnKey)) matchIndex = isbnIndex.get(isbnKey);
    else if (titleIndex.has(bookMergeKey(book))) matchIndex = titleIndex.get(bookMergeKey(book));

    if (matchIndex === null || matchIndex === undefined) {
      const cloned = { ...book };
      result.push(cloned);
      indexById.set(cloned.id, result.length - 1);
      if (cloned.isbn) isbnIndex.set(String(cloned.isbn).trim(), result.length - 1);
      titleIndex.set(bookMergeKey(cloned), result.length - 1);
      return;
    }

    result[matchIndex] = mergeBookRecords(result[matchIndex], book);
    indexById.set(result[matchIndex].id, matchIndex);
    if (result[matchIndex].isbn) isbnIndex.set(String(result[matchIndex].isbn).trim(), matchIndex);
    titleIndex.set(bookMergeKey(result[matchIndex]), matchIndex);
  });
  return result;
}

export function bookMergeKey(book) {
  return `${normalizeMergeText(book?.title)}|${normalizeMergeText(book?.author)}`;
}

export function normalizeMergeText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

export function getReliableBookTime(book) {
  const candidates = [book?.notesUpdatedAt, book?.dateFinished, book?.dateStarted, book?.dateAdded];
  for (const value of candidates) {
    const time = new Date(value || 0).getTime();
    if (Number.isFinite(time) && time > 0) return time;
  }
  return 0;
}

export function mergeBookRecords(currentBook, importedBook, { statuses, now, createId, mergeQuotes: mergeQuotesFn }) {
  const current = currentBook || {};
  const incoming = importedBook || {};
  const currentTime = getReliableBookTime(current);
  const incomingTime = getReliableBookTime(incoming);
  const preferIncoming = incomingTime > 0 && currentTime > 0 ? incomingTime > currentTime : false;
  const base = preferIncoming ? { ...current, ...incoming } : { ...incoming, ...current };
  const tags = Array.from(new Set([...(current.tags || []), ...(incoming.tags || [])].map(value => String(value || '').trim()).filter(Boolean)));
  const genres = Array.from(new Set([...(current.genres || []), ...(incoming.genres || [])].map(value => String(value || '').trim()).filter(Boolean)));
  const notes = typeof current.notes === 'string' ? current.notes.trim() : '';
  const importedNotes = typeof incoming.notes === 'string' ? incoming.notes.trim() : '';
  const merged = {
    ...base,
    id: current.id || incoming.id || createId(),
    tags,
    genres,
    notes: notes || importedNotes || '',
    notesUpdatedAt: notes ? (current.notesUpdatedAt || incoming.notesUpdatedAt || null) : (incoming.notesUpdatedAt || current.notesUpdatedAt || null),
    status: preferStatus(current.status, incoming.status, statuses),
    currentPage: preferNumeric(current.currentPage, incoming.currentPage),
    rating: preferRating(current.rating, incoming.rating),
    dateAdded: current.dateAdded || incoming.dateAdded || now(),
    dateStarted: current.dateStarted || incoming.dateStarted || null,
    dateFinished: current.dateFinished || incoming.dateFinished || null,
    quotes: mergeQuotesFn(current.quotes, incoming.quotes),
  };
  if (!(notes || importedNotes)) merged.notes = '';
  return merged;
}

export function mergeQuotes(currentQuotes, incomingQuotes, { now }) {
  const byId = new Map();
  const normalize = quote => ({
    id: quote.id, text: String(quote.text || ''), page: quote.page ?? null, note: quote.note ?? '',
    createdAt: quote.createdAt || now(), updatedAt: quote.updatedAt || quote.createdAt || now(),
  });
  (Array.isArray(currentQuotes) ? currentQuotes : []).forEach(quote => { if (quote?.id) byId.set(quote.id, normalize(quote)); });
  (Array.isArray(incomingQuotes) ? incomingQuotes : []).forEach(quote => {
    if (!quote?.id) return;
    const normalized = normalize(quote);
    const existing = byId.get(quote.id);
    if (!existing) return void byId.set(quote.id, normalized);
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const incomingTime = new Date(normalized.updatedAt || normalized.createdAt || 0).getTime();
    byId.set(quote.id, incomingTime > existingTime ? normalized : existing);
  });
  return Array.from(byId.values());
}

export function preferNumeric(currentValue, incomingValue) {
  const current = Number(currentValue), incoming = Number(incomingValue);
  if (Number.isFinite(current) && Number.isFinite(incoming)) return Math.max(current, incoming);
  return Number.isFinite(current) ? current : (Number.isFinite(incoming) ? incoming : 0);
}

export function preferRating(currentValue, incomingValue) {
  const current = Number(currentValue), incoming = Number(incomingValue);
  if (Number.isFinite(current) && Number.isFinite(incoming)) return Math.max(current, incoming);
  if (Number.isFinite(current)) return current;
  if (Number.isFinite(incoming)) return incoming;
  return null;
}

export function preferStatus(currentStatus, incomingStatus, statuses) {
  const current = currentStatus || statuses.WISHLIST;
  const incoming = incomingStatus || statuses.WISHLIST;
  const rank = { finished: 3, reading: 2, wishlist: 1, dnf: 0 };
  return rank[current] >= rank[incoming] ? current : incoming;
}

export function mergeActivityById(currentEvents, importedEvents) {
  const byId = new Map();
  (currentEvents || []).forEach(event => { if (event?.id) byId.set(event.id, event); });
  (importedEvents || []).forEach(event => { if (event?.id) byId.set(event.id, event); });
  return Array.from(byId.values()).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
}
