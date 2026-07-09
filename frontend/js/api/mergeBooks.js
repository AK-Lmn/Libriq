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
  const Identity = window.BookIdentity || globalThis.BookIdentity || {
    isSameBook: (left, right) => {
      const clean = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      const leftIsbn = clean(left?.isbn);
      const rightIsbn = clean(right?.isbn);
      if (leftIsbn && rightIsbn && leftIsbn === rightIsbn) return true;
      return clean(left?.title) === clean(right?.title) && clean(left?.author) === clean(right?.author);
    },
    buildSourceBadgeData: () => ({ sourceIds: {}, sourceBadges: [], sources: [] }),
  };
  const Description = window.NormalizeBook || globalThis.NormalizeBook || {
    chooseBestDescription: (candidates) => {
      const list = (Array.isArray(candidates) ? candidates : [candidates])
        .map(item => String((item && typeof item === 'object' ? item.text : item) || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      return list.sort((a, b) => b.length - a.length)[0] || null;
    },
    normalizeDescriptionText: value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null,
  };

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
    return list.findIndex(book => Identity.isSameBook(book, candidate));
  }

  /**
   * Enrich an OL-anchored book with fields from a GB match.
   * OL values win for all structural fields; GB fills gaps.
   */
  function _enrich(olBook, gbBook) {
    const olBadges = Identity.buildSourceBadgeData(olBook);
    const gbBadges = Identity.buildSourceBadgeData(gbBook);
    const sourceBadgeSet = new Set([...(olBadges.sourceBadges || []), ...(gbBadges.sourceBadges || [])]);
    const sourceIdMap = {
      ...(olBook.sourceIds || {}),
      ...(gbBook.sourceIds || {}),
      ...olBadges.sourceIds,
      ...gbBadges.sourceIds,
    };
    const identifiers = [
      ...(Array.isArray(olBook.identifiers) ? olBook.identifiers : []),
      ...(Array.isArray(gbBook.identifiers) ? gbBook.identifiers : []),
    ].filter(Boolean);
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
      description:   _pickBestDescription(olBook, gbBook),
      shortDescription: _pickBestShortDescription(olBook, gbBook),
      publisher:     olBook.publisher    || gbBook.publisher,
      language:      olBook.language     || gbBook.language,
      rating:        olBook.rating       ?? gbBook.rating,
      ratingsCount:  olBook.ratingsCount ?? gbBook.ratingsCount,
      previewLink:   olBook.previewLink  || gbBook.previewLink,
      googleBooksId: gbBook.googleBooksId || olBook.googleBooksId,
      sourceIds: sourceIdMap,
      identifiers: identifiers,
      sourceBadges: Array.from(sourceBadgeSet),
      sources: Array.from(sourceBadgeSet),

      // Cover: prefer OL large if it exists, else GB (already https)
      coverUrl: olBook.coverUrl || gbBook.coverUrl,

      source: 'merged',
    };
  }

  function _pickBestDescription(olBook, gbBook) {
    return Description.chooseBestDescription([
      { text: gbBook.description, source: 'google-description', language: gbBook.language, full: true },
      { text: gbBook.shortDescription, source: 'google-snippet', language: gbBook.language, snippet: true },
      { text: olBook.description, source: 'openlibrary', language: olBook.language, full: true },
      { text: olBook.shortDescription, source: 'openlibrary-snippet', language: olBook.language, snippet: true },
    ]);
  }

  function _pickBestShortDescription(olBook, gbBook) {
    return Description.chooseBestDescription([
      { text: gbBook.shortDescription, source: 'google-snippet', language: gbBook.language, snippet: true },
      { text: gbBook.description, source: 'google-description', language: gbBook.language, full: true },
      { text: olBook.shortDescription, source: 'openlibrary-snippet', language: olBook.language, snippet: true },
      { text: olBook.description, source: 'openlibrary', language: olBook.language, full: true },
    ], { preferShort: true });
  }

  return { merge, mergeOne };

})();
