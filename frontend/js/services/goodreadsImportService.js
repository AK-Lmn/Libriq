import { bookMergeKey, normalizeMergeText } from './importMerge.js';

export function createGoodreadsImportService({ createBook, createId, now, statuses = { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished', DNF: 'abandoned' } } = {}) {
  if (typeof createBook !== 'function' || typeof createId !== 'function' || typeof now !== 'function') {
    throw new TypeError('createGoodreadsImportService requires createBook, createId, and now.');
  }

  return {
    buildImportPlan: input => buildGoodreadsImportPlan(input, { createBook, createId, now, statuses }),
  };
}

export function buildGoodreadsImportPlan({ parsedBooks = [], existingBooks = [] } = {}, dependencies = {}) {
  const { createBook, createId, now, statuses = { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished', DNF: 'abandoned' } } = dependencies;
  if (typeof createBook !== 'function' || typeof createId !== 'function' || typeof now !== 'function') {
    throw new TypeError('buildGoodreadsImportPlan requires createBook, createId, and now dependencies.');
  }

  const existing = Array.isArray(existingBooks) ? existingBooks.filter(b => b && typeof b === 'object') : [];
  const indexes = buildExistingIndexes(existing);

  const matchedBooks = [];
  const booksToCreate = [];

  let finishedCount = 0;
  let readingCount = 0;
  let wishlistCount = 0;
  let ratedCount = 0;
  let reviewedCount = 0;

  for (const parsed of parsedBooks) {
    if (!parsed || !parsed.title) continue;

    const existingBook = findExistingBook(parsed, indexes);
    const mappedStatus = mapGoodreadsShelf(parsed.exclusiveShelf, statuses);

    if (mappedStatus === statuses.FINISHED) finishedCount++;
    else if (mappedStatus === statuses.READING) readingCount++;
    else wishlistCount++;

    if (parsed.rating) ratedCount++;
    if (parsed.review) reviewedCount++;

    if (existingBook) {
      matchedBooks.push({
        existingBook,
        parsedBook: parsed,
        mappedStatus,
      });
    } else {
      const timestamp = typeof now === 'function' ? now() : new Date().toISOString();
      const dateAddedIso = toIsoOrNull(parsed.dateAdded) || timestamp;
      const dateFinishedIso = toIsoOrNull(parsed.dateRead) || (mappedStatus === statuses.FINISHED ? dateAddedIso : null);
      const dateStartedIso = mappedStatus === statuses.READING ? dateAddedIso : null;

      const candidate = createBook({
        id: createId(),
        title: parsed.title,
        author: parsed.author || 'Unknown Author',
        isbn: parsed.isbn || parsed.isbn13 || parsed.isbn10 || null,
        pageCount: parsed.pageCount || 0,
        publishYear: parsed.publishYear || null,
        publisher: parsed.publisher || null,
        status: mappedStatus,
        rating: parsed.rating || null,
        review: parsed.review || null,
        notes: parsed.notes || '',
        dateAdded: dateAddedIso,
        dateStarted: dateStartedIso,
        dateFinished: dateFinishedIso,
        currentPage: mappedStatus === statuses.FINISHED ? (parsed.pageCount || 0) : 0,
        shelves: Array.isArray(parsed.shelves) ? parsed.shelves : [],
        tags: Array.isArray(parsed.shelves) ? parsed.shelves : [],
        isFavorite: Boolean(parsed.isFavorite),
        source: 'goodreads',
        sourceBadges: ['Goodreads'],
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      booksToCreate.push({
        candidate,
        parsedBook: parsed,
        mappedStatus,
      });
    }
  }

  return {
    matchedBooks,
    booksToCreate,
    totals: {
      total: parsedBooks.length,
      toCreate: booksToCreate.length,
      matched: matchedBooks.length,
      finished: finishedCount,
      reading: readingCount,
      wishlist: wishlistCount,
      rated: ratedCount,
      reviewed: reviewedCount,
    },
  };
}

export function mapGoodreadsShelf(shelf, statuses = { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished', DNF: 'abandoned' }) {
  const normalized = String(shelf || '').toLowerCase().trim();
  if (normalized === 'read') return statuses.FINISHED;
  if (normalized === 'currently-reading') return statuses.READING;
  if (normalized === 'did-not-finish' || normalized === 'dnf' || normalized === 'abandoned') return statuses.DNF || 'abandoned';
  return statuses.WISHLIST;
}

function buildExistingIndexes(books) {
  const isbnIndex = new Map();
  const titleAuthorIndex = new Map();

  for (const book of books) {
    if (!book) continue;
    const isbns = [book.isbn, ...(Array.isArray(book.isbns) ? book.isbns : [])].filter(Boolean);
    for (const raw of isbns) {
      const clean = String(raw).replace(/[^0-9X]/gi, '');
      if (clean) isbnIndex.set(clean, book);
    }
    const key = bookMergeKey(book);
    if (key) titleAuthorIndex.set(key, book);
  }

  return { isbnIndex, titleAuthorIndex };
}

function findExistingBook(parsed, { isbnIndex, titleAuthorIndex }) {
  if (parsed.isbn13) {
    const clean13 = String(parsed.isbn13).replace(/[^0-9X]/gi, '');
    if (clean13 && isbnIndex.has(clean13)) return isbnIndex.get(clean13);
  }
  if (parsed.isbn10 || parsed.isbn) {
    const clean10 = String(parsed.isbn10 || parsed.isbn).replace(/[^0-9X]/gi, '');
    if (clean10 && isbnIndex.has(clean10)) return isbnIndex.get(clean10);
  }

  const key = `${normalizeMergeText(parsed.title)}\u0000${normalizeMergeText(parsed.author || '')}`;
  if (titleAuthorIndex.has(key)) return titleAuthorIndex.get(key);

  return null;
}

function toIsoOrNull(dateString) {
  if (!dateString) return null;
  const d = new Date(dateString);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
