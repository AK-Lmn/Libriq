/**
 * Robust RFC 4180 compliant CSV parser and Goodreads export parser.
 */

export function parseCsvRows(text) {
  if (typeof text !== 'string' || !text.trim()) return [];

  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuotes = false;
  const input = text.replace(/^\uFEFF/, ''); // strip BOM if present

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    const nextChar = input[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i++;
        } else {
          // End of quoted field
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push the final field and row if any
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

export function parseGoodreadsCsv(input) {
  const rows = parseCsvRows(input);
  if (!rows || rows.length < 2) {
    return { ok: false, reason: 'empty-file', error: 'File contains no data rows.' };
  }

  const rawHeaders = rows[0].map(h => String(h || '').trim());
  const headerMap = new Map();
  rawHeaders.forEach((header, index) => {
    headerMap.set(header.toLowerCase().replace(/[^a-z0-9]/g, ''), index);
  });

  // Verify essential Goodreads headers
  const titleIndex = headerMap.get('title');
  const authorIndex = headerMap.get('author');

  if (titleIndex === undefined || authorIndex === undefined) {
    return {
      ok: false,
      reason: 'invalid-goodreads-header',
      error: 'CSV does not match Goodreads export format (missing Title or Author column).',
    };
  }

  const getField = (row, key) => {
    const idx = headerMap.get(key);
    if (idx === undefined || idx >= row.length) return '';
    return String(row[idx] || '').trim();
  };

  const cleanIsbn = (val) => {
    if (!val) return null;
    // Goodreads exports ISBNs like ="0141439513"
    const cleaned = val.replace(/^="?|"?$/g, '').trim().replace(/[^0-9X]/gi, '');
    return cleaned || null;
  };

  const parseGoodreadsDate = (val) => {
    if (!val) return null;
    const trimmed = String(val).trim();
    // Match YYYY/MM/DD or YYYY-MM-DD
    const match = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (match) {
      const [, y, m, d] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
    return null;
  };

  const parseRating = (val) => {
    const num = parseInt(val, 10);
    if (Number.isFinite(num) && num >= 1 && num <= 5) return num;
    return null;
  };

  const parsePageCount = (val) => {
    const num = parseInt(val, 10);
    return Number.isFinite(num) && num > 0 ? num : 0;
  };

  const parseYear = (val) => {
    const num = parseInt(val, 10);
    return Number.isFinite(num) && num > 0 && num < 3000 ? num : null;
  };

  const books = [];
  let readCount = 0;
  let currentlyReadingCount = 0;
  let toReadCount = 0;
  let ratedCount = 0;
  let reviewCount = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0 || (row.length === 1 && !row[0].trim())) continue;

    const title = getField(row, 'title');
    const author = getField(row, 'author');
    if (!title) continue;

    const bookId = getField(row, 'bookid');
    const isbn = cleanIsbn(getField(row, 'isbn'));
    const isbn13 = cleanIsbn(getField(row, 'isbn13'));
    const rating = parseRating(getField(row, 'myrating'));
    const avgRating = parseFloat(getField(row, 'averagerating')) || null;
    const publisher = getField(row, 'publisher') || null;
    const pageCount = parsePageCount(getField(row, 'numberofpages'));
    const publishYear = parseYear(getField(row, 'yearpublished')) || parseYear(getField(row, 'originalpublicationyear'));
    const dateRead = parseGoodreadsDate(getField(row, 'dateread'));
    const dateAdded = parseGoodreadsDate(getField(row, 'dateadded'));
    const exclusiveShelf = getField(row, 'exclusiveshelf').toLowerCase();
    const rawBookshelves = getField(row, 'bookshelves');
    const myReview = getField(row, 'myreview');
    const privateNotes = getField(row, 'privatenotes');

    const bookshelves = rawBookshelves
      ? rawBookshelves.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const isFavorite = bookshelves.some(s => s.toLowerCase() === 'favorites' || s.toLowerCase() === 'favorite');

    // Combine review and private notes into notes if present
    const notesParts = [];
    if (myReview) notesParts.push(`Review: ${myReview}`);
    if (privateNotes) notesParts.push(`Private Notes: ${privateNotes}`);
    const notes = notesParts.join('\n\n');

    if (exclusiveShelf === 'read') readCount++;
    else if (exclusiveShelf === 'currently-reading') currentlyReadingCount++;
    else toReadCount++;

    if (rating) ratedCount++;
    if (myReview) reviewCount++;

    books.push({
      goodreadsBookId: bookId || null,
      title,
      author: author || 'Unknown Author',
      isbn: isbn13 || isbn || null,
      isbn10: isbn,
      isbn13,
      rating,
      averageRating: avgRating,
      publisher,
      pageCount,
      publishYear,
      dateRead,
      dateAdded,
      exclusiveShelf: exclusiveShelf || 'to-read',
      shelves: bookshelves,
      review: myReview || null,
      notes,
      isFavorite,
    });
  }

  return {
    ok: true,
    books,
    totals: {
      total: books.length,
      read: readCount,
      currentlyReading: currentlyReadingCount,
      toRead: toReadCount,
      rated: ratedCount,
      reviewed: reviewCount,
    },
  };
}
