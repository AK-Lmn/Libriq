import { bookMergeKey, normalizeMergeText } from './importMerge.js';

export function createKindleImportService({ createBook, createId, now } = {}) {
  if (typeof createBook !== 'function' || typeof createId !== 'function' || typeof now !== 'function') {
    throw new TypeError('createKindleImportService requires createBook, createId, and now.');
  }

  return {
    buildImportPlan: input => buildImportPlan(input, { createBook, createId, now }),
  };
}

export function buildImportPlan({ parsedBooks, existingBooks } = {}, dependencies = {}) {
  const { createBook, createId, now } = dependencies;
  if (typeof createBook !== 'function' || typeof createId !== 'function' || typeof now !== 'function') {
    throw new TypeError('buildImportPlan requires createBook, createId, and now dependencies.');
  }

  const parsed = deduplicateParsedBooks(parsedBooks);
  const existing = Array.isArray(existingBooks) ? existingBooks.filter(book => book && typeof book === 'object') : [];
  const indexes = buildExistingIndexes(existing);
  const matchedBooks = [];
  const booksToCreate = [];
  const highlightsToImport = [];
  const notesToImport = [];

  for (const parsedBook of parsed) {
    const existingBook = findExistingBook(parsedBook, indexes);
    let targetBook;
    let targetKind;

    if (existingBook) {
      targetBook = existingBook;
      targetKind = 'existing';
      matchedBooks.push({ existingBook, parsedBook, entries: parsedBook.entries });
    } else {
      const timestamp = now();
      const candidate = createBook({
        id: parsedBook.id || createId(),
        title: parsedBook.title,
        author: parsedBook.author || 'Unknown Author',
        isbn: parsedBook.isbn || null,
        source: 'kindle',
        dateAdded: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      targetBook = candidate;
      targetKind = 'candidate';
      booksToCreate.push({ candidate, parsedBook, entries: parsedBook.entries });
    }

    for (const entry of parsedBook.entries) {
      const plannedEntry = {
        bookId: targetBook.id,
        targetKind,
        title: parsedBook.title,
        author: parsedBook.author,
        entry,
      };
      if (entry.type === 'highlight') highlightsToImport.push(plannedEntry);
      else notesToImport.push(plannedEntry);
    }
  }

  return {
    matchedBooks,
    booksToCreate,
    highlightsToImport,
    notesToImport,
    booksMatched: matchedBooks.length,
    booksCreated: booksToCreate.length,
    totalHighlights: highlightsToImport.length,
    totalNotes: notesToImport.length,
  };
}

export function deduplicateParsedBooks(parsedBooks) {
  const byIdentity = new Map();
  const safeBooks = Array.isArray(parsedBooks) ? parsedBooks : [];

  for (const rawBook of safeBooks) {
    const book = normalizeParsedBook(rawBook);
    if (!book) continue;
    const key = parsedBookIdentityKey(book);
    let current = byIdentity.get(key);
    if (!current) {
      current = { ...book, entries: [] };
      byIdentity.set(key, current);
    }
    const entryKeys = new Set(current.entries.map(entryIdentityKey));
    for (const entry of book.entries) {
      const entryKey = entryIdentityKey(entry);
      if (entryKeys.has(entryKey)) continue;
      current.entries.push(entry);
      entryKeys.add(entryKey);
    }
  }

  return Array.from(byIdentity.values()).filter(book => book.entries.length > 0);
}

export function normalizeParsedBook(rawBook) {
  if (!rawBook || typeof rawBook !== 'object') return null;
  const title = String(rawBook.title || '').trim();
  if (!title) return null;
  const authorValue = String(rawBook.author || '').trim();
  const isbnValue = String(rawBook.isbn || '').trim();
  const idValue = String(rawBook.id || '').trim();
  const entries = (Array.isArray(rawBook.entries) ? rawBook.entries : []).map(normalizeParsedEntry).filter(Boolean);
  return {
    id: idValue || null,
    isbn: isbnValue || null,
    title,
    author: authorValue || null,
    entries,
  };
}

export function normalizeParsedEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== 'object') return null;
  const type = String(rawEntry.type || '').toLowerCase();
  const text = String(rawEntry.text || '').trim();
  if (!['highlight', 'note'].includes(type) || !text) return null;
  const locationValue = rawEntry.location == null ? null : String(rawEntry.location).trim();
  const addedAtValue = rawEntry.addedAt == null ? null : String(rawEntry.addedAt).trim();
  return {
    type,
    location: locationValue || null,
    addedAt: addedAtValue || null,
    text,
  };
}

export function buildExistingIndexes(existingBooks) {
  const byId = new Map();
  const byIsbn = new Map();
  const byTitleAuthor = new Map();
  for (const book of existingBooks) {
    const id = String(book?.id || '').trim();
    const isbn = String(book?.isbn || '').trim();
    if (id && !byId.has(id)) byId.set(id, book);
    if (isbn && !byIsbn.has(isbn)) byIsbn.set(isbn, book);
    const key = bookMergeKey(book);
    if (key !== '|' && !byTitleAuthor.has(key)) byTitleAuthor.set(key, book);
  }
  return { byId, byIsbn, byTitleAuthor };
}

export function findExistingBook(parsedBook, indexes) {
  const id = String(parsedBook?.id || '').trim();
  const isbn = String(parsedBook?.isbn || '').trim();
  if (id && indexes.byId.has(id)) return indexes.byId.get(id);
  if (isbn && indexes.byIsbn.has(isbn)) return indexes.byIsbn.get(isbn);
  return indexes.byTitleAuthor.get(bookMergeKey(parsedBook)) || null;
}

export function parsedBookIdentityKey(book) {
  const id = String(book?.id || '').trim();
  const isbn = String(book?.isbn || '').trim();
  if (id) return `id:${id}`;
  if (isbn) return `isbn:${isbn}`;
  return `book:${bookMergeKey(book)}`;
}

export function entryIdentityKey(entry) {
  return [entry?.type, entry?.location, entry?.addedAt, entry?.text].map(value => String(value || '')).join('\u0000');
}

export { normalizeMergeText as normalizeKindleImportText };
