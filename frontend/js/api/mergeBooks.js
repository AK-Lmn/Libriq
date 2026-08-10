import * as Identity from './bookIdentity.js';
import { NormalizeBook as Description } from './normalizeBook.js';

export const MergeBooks = (() => {

  function merge(olBooks, gbBooks) {

    const merged = olBooks.map(b => ({ ...b }));

    for (const gb of gbBooks) {
      const matchIdx = _findMatch(merged, gb);

      if (matchIdx !== -1) {

        merged[matchIdx] = _enrich(merged[matchIdx], gb);
      } else {

        merged.push({ ...gb });
      }
    }

    return merged;
  }

  function mergeOne(olBook, gbBook) {
    if (olBook && gbBook) return _enrich(olBook, gbBook);
    return olBook || gbBook || null;
  }

  function _findMatch(list, candidate) {
    return list.findIndex(book => Identity.isSameBook(book, candidate));
  }

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

      title:         olBook.title,
      author:        olBook.author,
      publishYear:   olBook.publishYear  || gbBook.publishYear,
      pageCount:     olBook.pageCount    || gbBook.pageCount,
      isbn:          olBook.isbn         || gbBook.isbn,
      openLibraryId: olBook.openLibraryId,

      genres: (olBook.genres && olBook.genres.length > 0)
        ? olBook.genres
        : gbBook.genres,

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
