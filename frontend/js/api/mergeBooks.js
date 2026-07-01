/* ============================================
   LIBRIQ — mergeBooks.js
   Merges Open Library and Google Books results.

   Priority rules:
     Prefer OL: title, author, publishYear,
                genres (subjects), pageCount, isbn
     Fill from GB: description, publisher,
                   language, rating, ratingsCount,
                   previewLink, coverUrl (if OL has none)

   Deduplication: match by ISBN first, then by
   normalised title + author string.
   ============================================ */

const MergeBooks = (() => {

  /**
   * Merge two result arrays into one deduplicated list.
   * OL books anchor the list; GB books either enrich an
   * existing OL entry or are appended if truly new.
   *
   * @param {Object[]} olBooks   - Normalized OL results
   * @param {Object[]} gbBooks   - Normalized GB results
   * @returns {Object[]}         - Merged, deduplicated list
   */
  function merge(olBooks, gbBooks) {
    // Start with a mutable copy of all OL books
    const merged = olBooks.map(b => ({ ...b }));

    for (const gb of gbBooks) {
      const matchIdx = _findMatch(merged, gb);

      if (matchIdx !== -1) {
        // Enrich the existing OL entry with GB data
        merged[matchIdx] = _enrich(merged[matchIdx], gb);
      } else {
        // Genuinely new book not in OL results — append it
        merged.push({ ...gb });
      }
    }

    return merged;
  }

  /**
   * Merge a single OL book with a single GB book.
   * Used for ISBN lookups where we already know they match.
   *
   * @param {Object|null} olBook
   * @param {Object|null} gbBook
   * @returns {Object|null}
   */
  function mergeOne(olBook, gbBook) {
    if (olBook && gbBook) return _enrich(olBook, gbBook);
    return olBook || gbBook || null;
  }

  // ── Internal ──────────────────────────────

  /**
   * Find the index in `list` that matches `candidate`.
   * Match strategy: ISBN first, then title+author similarity.
   */
  function _findMatch(list, candidate) {
    // 1. ISBN match (most reliable)
    if (candidate.isbn) {
      const idx = list.findIndex(b => b.isbn && b.isbn === candidate.isbn);
      if (idx !== -1) return idx;
    }

    // 2. Normalised title + author match
    const candKey = _matchKey(candidate);
    return list.findIndex(b => _matchKey(b) === candKey);
  }

  /**
   * Produce a normalised string key for fuzzy deduplication.
   * Lowercased, punctuation removed, whitespace collapsed.
   */
  function _matchKey(book) {
    const clean = str => (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Use only the first author word to handle "Last, First" vs "First Last"
    const authorWord = clean(book.author).split(' ')[0];
    return `${clean(book.title)}|${authorWord}`;
  }

  /**
   * Enrich an OL-anchored book with fields from a GB match.
   * OL values win for all structural fields; GB fills gaps.
   */
  function _enrich(olBook, gbBook) {
    return {
      // ── OL wins unconditionally ────────────
      title:         olBook.title,
      author:        olBook.author,
      publishYear:   olBook.publishYear  || gbBook.publishYear,
      pageCount:     olBook.pageCount    || gbBook.pageCount,
      isbn:          olBook.isbn         || gbBook.isbn,
      openLibraryId: olBook.openLibraryId,

      // Keep OL genres if present; fall back to GB categories
      genres: (olBook.genres && olBook.genres.length > 0)
        ? olBook.genres
        : gbBook.genres,

      // ── GB fills missing fields ────────────
      description:   _pickBestDescription(olBook.description, gbBook.description),
      publisher:     olBook.publisher    || gbBook.publisher,
      language:      olBook.language     || gbBook.language,
      rating:        olBook.rating       ?? gbBook.rating,
      ratingsCount:  olBook.ratingsCount ?? gbBook.ratingsCount,
      previewLink:   olBook.previewLink  || gbBook.previewLink,
      googleBooksId: gbBook.googleBooksId || olBook.googleBooksId,

      // Cover: prefer OL large if it exists, else GB (already https)
      coverUrl: olBook.coverUrl || gbBook.coverUrl,

      source: 'merged',
    };
  }

  function _pickBestDescription(primary, secondary) {
    const a = _cleanDescription(primary);
    const b = _cleanDescription(secondary);

    if (a && b) return b.length > a.length ? b : a;
    return a || b || null;
  }

  function _cleanDescription(value) {
    if (!value || typeof value !== 'string') return null;
    const cleaned = value
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || null;
  }

  return { merge, mergeOne };

})();
