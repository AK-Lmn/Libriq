/* ============================================
   LIBRIQ — bookIdentity.js
   Shared metadata identity and normalization helpers.
   Pure functions. No network. No UI.
   ============================================ */

const BookIdentity = (() => {
  const SOURCE_LABELS = {
    openlibrary: 'Open Library',
    google: 'Google Books',
    gutenberg: 'Project Gutenberg',
    archive: 'Internet Archive',
  };

  function normalizeIsbn(value) {
    const clean = String(value || '').toUpperCase().replace(/[^0-9X]/g, '');
    if (clean.length === 10 || clean.length === 13) return clean;
    return '';
  }

  function normalizeTitle(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeAuthor(value) {
    const raw = String(value || '').toLowerCase().trim();
    if (!raw || raw === 'unknown author') return '';
    return raw
      .replace(/^(by|author:)\s+/i, '')
      .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeSourceId(value) {
    const clean = String(value || '').trim();
    if (!clean) return '';
    return clean.toLowerCase().replace(/\s+/g, '');
  }

  function normalizeSource(source) {
    const value = String(source || '').toLowerCase().trim();
    if (!value) return '';
    if (value.includes('openlibrary') || value === 'ol') return 'openlibrary';
    if (value.includes('google')) return 'google';
    if (value.includes('guten')) return 'gutenberg';
    if (value.includes('archive') || value.includes('internet archive')) return 'archive';
    return value;
  }

  function firstNonEmpty(values) {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
    return '';
  }

  function collectSourceIds(book = {}) {
    const sourceIds = {};
    const sourceIdList = [];

    const push = (source, id) => {
      const normalizedSource = normalizeSource(source);
      const normalizedId = normalizeSourceId(id);
      if (!normalizedSource || !normalizedId) return;
      sourceIds[normalizedSource] = normalizedId;
      sourceIdList.push({ source: normalizedSource, id: normalizedId });
    };

    push('openlibrary', book.openLibraryId);
    push('google', book.googleBooksId);

    const identifiers = Array.isArray(book.identifiers) ? book.identifiers : [];
    identifiers.forEach((identifier) => {
      if (!identifier || typeof identifier !== 'object') return;
      const source = identifier.type || identifier.source || identifier.name || '';
      const id = identifier.identifier || identifier.value || identifier.id || '';
      if (source && id) push(source, id);
    });

    if (Array.isArray(book.sourceIds)) {
      book.sourceIds.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        push(entry.source, entry.id);
      });
    } else if (book.sourceIds && typeof book.sourceIds === 'object') {
      Object.entries(book.sourceIds).forEach(([source, id]) => push(source, id));
    }

    return { sourceIds, sourceIdList };
  }

  function getSourceLabels(book = {}) {
    const labels = [];
    const seen = new Set();
    const sourceValues = [
      ...(Array.isArray(book.sources) ? book.sources : []),
      ...(Array.isArray(book.sourceBadges) ? book.sourceBadges : []),
      book.source,
      book.primarySource,
      ...Object.keys(collectSourceIds(book).sourceIds),
    ];

    sourceValues.forEach((source) => {
      const normalized = normalizeSource(source);
      const label = SOURCE_LABELS[normalized] || '';
      if (!label || seen.has(label)) return;
      seen.add(label);
      labels.push(label);
    });

    return labels;
  }

  function buildSourceBadgeData(book = {}) {
    const { sourceIds, sourceIdList } = collectSourceIds(book);
    const labels = getSourceLabels(book);
    return {
      sourceIds,
      sourceIdList,
      sourceBadges: labels,
      sources: labels,
    };
  }

  function buildMatchCandidates(book = {}) {
    const isbnCandidates = [
      book.isbn,
      book.isbn13,
      book.isbn_13,
      book.isbn10,
      book.isbn_10,
      ...(Array.isArray(book.isbns) ? book.isbns : []),
      ...(Array.isArray(book.identifiers) ? book.identifiers.map(item => item?.identifier) : []),
    ].map(normalizeIsbn).filter(Boolean);

    const title = normalizeTitle(book.title);
    const author = normalizeAuthor(book.author);
    const { sourceIds, sourceIdList } = collectSourceIds(book);

    return {
      isbns: Array.from(new Set(isbnCandidates)),
      title,
      author,
      sourceIds,
      sourceIdList,
      primarySource: normalizeSource(book.source || book.primarySource || ''),
    };
  }

  function buildCompositeKey(book = {}) {
    const candidate = buildMatchCandidates(book);
    return [
      candidate.isbns[0] || '',
      candidate.sourceIdList.map(entry => `${entry.source}:${entry.id}`).join('|'),
      candidate.title,
      candidate.author,
    ].join('::');
  }

  function isSameBook(left, right) {
    const a = buildMatchCandidates(left || {});
    const b = buildMatchCandidates(right || {});

    const isbnMatch = a.isbns.find(isbn => b.isbns.includes(isbn));
    if (isbnMatch) return true;

    const sourcePairs = a.sourceIdList.filter(entry => b.sourceIds[entry.source] && b.sourceIds[entry.source] === entry.id);
    if (sourcePairs.length > 0) return true;

    if (a.title && b.title && a.title === b.title) {
      if (a.author && b.author) return a.author === b.author;
      return Boolean(a.author || b.author);
    }

    return false;
  }

  return {
    normalizeIsbn,
    normalizeTitle,
    normalizeAuthor,
    normalizeSourceId,
    normalizeSource,
    buildSourceBadgeData,
    buildMatchCandidates,
    buildCompositeKey,
    isSameBook,
    getSourceLabels,
    firstNonEmpty,
  };
})();

window.BookIdentity = BookIdentity;
globalThis.BookIdentity = BookIdentity;
