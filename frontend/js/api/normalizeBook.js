/* ============================================
   LIBRIQ — normalizeBook.js
   Maps raw API responses from any provider
   to the internal book shape used by createBook()
   and the rest of the application.

   Internal shape (must match createBook() in data.js):
     title, author, coverUrl, isbn, pageCount,
     publishYear, publisher, description, genres,
     language, googleBooksId, openLibraryId,
     internetArchiveId, archiveUrl, readableSourceLinks,
     rating, ratingsCount, previewLink
   ============================================ */

const NormalizeBook = (() => {
  const Identity = window.BookIdentity || globalThis.BookIdentity || {
    normalizeIsbn: value => String(value || '').toUpperCase().replace(/[^0-9X]/g, ''),
    buildSourceBadgeData: (book = {}) => ({
      sourceIds: {
        ...(book.openLibraryId ? { openlibrary: book.openLibraryId } : {}),
        ...(book.googleBooksId ? { google: book.googleBooksId } : {}),
      },
      sourceBadges: [],
      sources: [],
    }),
    normalizeSourceId: value => String(value || '').trim().toLowerCase(),
  };

  const OL_COVER = 'https://covers.openlibrary.org/b/id';

  // ── Open Library ──────────────────────────
  // Input: one doc from /search.json response

  function fromOpenLibrary(doc) {
    if (!doc || !doc.title) return null;

    const coverId = doc.cover_i || (doc.cover_edition_key ? null : null);
    const sourceData = Identity.buildSourceBadgeData({
      source: 'openlibrary',
      openLibraryId: doc.key || null,
      sourceIds: { openlibrary: doc.key || null },
      identifiers: Array.isArray(doc.isbn) ? doc.isbn.map(identifier => ({ type: 'isbn', identifier })) : [],
    });

    return {
      title:         doc.title,
      author:        _firstOf(doc.author_name) || 'Unknown Author',
      coverUrl:      coverId ? `${OL_COVER}/${coverId}-L.jpg` : null,
      isbn:          _firstOf(doc.isbn) || null,
      isbns:         Array.isArray(doc.isbn) ? doc.isbn.map(isbn => Identity.normalizeIsbn(isbn)).filter(Boolean) : [],
      pageCount:     doc.number_of_pages_median || 0,
      publishYear:   doc.first_publish_year || null,
      firstPublishYear: doc.first_publish_year || null,
      publisher:     _firstOf(doc.publisher) || null,
      description:   null,           // OL search doesn't return descriptions
      genres:        _cleanSubjects(doc.subject),
      language:      _olLanguage(doc.language),
      openLibraryId: doc.key || null,
      internetArchiveId: null,
      internetArchiveIds: [],
      archiveUrl: null,
      readableSourceLinks: [],
      openLibraryWorkKey: _normalizeOpenLibraryWorkKey(doc.work_key || doc.key),
      openLibraryEditionKey: doc.cover_edition_key || null,
      openLibraryAuthorKeys: Array.isArray(doc.author_key) ? doc.author_key.map(value => _normalizeOpenLibraryAuthorKey(value)).filter(Boolean) : [],
      coverId:      coverId || null,
      gutendexId:   null,
      gutenbergId:  null,
      editionCount:  doc.edition_count || null,
      subjects:     _cleanSubjects(doc.subject),
      subjectPlaces:_cleanSubjects(doc.subject_places || doc.subject_place),
      subjectPeople: _cleanSubjects(doc.subject_people || doc.subject_person),
      subjectTimes:  _cleanSubjects(doc.subject_times || doc.subject_time),
      googleBooksId: null,
      sourceIds:     sourceData.sourceIds,
      identifiers:   Array.isArray(doc.isbn)
        ? doc.isbn.map(isbn => ({ type: 'ISBN', identifier: Identity.normalizeIsbn(isbn) })).filter(item => item.identifier)
        : [],
      sourceBadges:  sourceData.sourceBadges,
      sources:       sourceData.sources,
      rating:        null,
      ratingsCount:  null,
      previewLink:   null,
      source:        'openlibrary',
    };
  }

  // ── Google Books ──────────────────────────
  // Input: one item from volumes?q= response

  function fromGoogleBooks(item) {
    if (!item || !item.volumeInfo) return null;
    const v = item.volumeInfo;
    if (!v.title) return null;

    // GB sometimes gives multiple ISBNs — prefer ISBN-13
    const isbn = _gbISBN(v.industryIdentifiers);
    const sourceData = Identity.buildSourceBadgeData({
      source: 'google',
      googleBooksId: item.id || null,
      sourceIds: { google: item.id || null },
      identifiers: Array.isArray(v.industryIdentifiers) ? v.industryIdentifiers : [],
    });

    // Prefer the largest available thumbnail
    const coverUrl = v.imageLinks
      ? (v.imageLinks.large
          || v.imageLinks.medium
          || v.imageLinks.thumbnail
          || v.imageLinks.smallThumbnail
          || null)
      : null;

    return {
      title:         v.title,
      author:        _firstOf(v.authors) || 'Unknown Author',
      coverUrl:      coverUrl ? coverUrl.replace('http://', 'https://') : null,
      isbn,
      isbns:         Array.isArray(v.industryIdentifiers)
        ? v.industryIdentifiers.map(identifier => Identity.normalizeIsbn(identifier?.identifier)).filter(Boolean)
        : [],
      pageCount:     v.pageCount || 0,
      publishYear:   _gbYear(v.publishedDate),
      publisher:     v.publisher || null,
      description:   v.description || null,
      genres:        Array.isArray(v.categories) ? v.categories.slice(0, 5) : [],
      language:      v.language || null,
      openLibraryId: null,
      internetArchiveId: null,
      internetArchiveIds: [],
      archiveUrl: null,
      readableSourceLinks: [],
      gutendexId: null,
      gutenbergId: null,
      googleBooksId: item.id || null,
      sourceIds:     sourceData.sourceIds,
      identifiers:   Array.isArray(v.industryIdentifiers)
        ? v.industryIdentifiers.map(identifier => ({
            type: identifier?.type || 'UNKNOWN',
            identifier: Identity.normalizeIsbn(identifier?.identifier) || String(identifier?.identifier || '').trim(),
          })).filter(identifier => identifier.identifier)
        : [],
      sourceBadges:  sourceData.sourceBadges,
      sources:       sourceData.sources,
      rating:        v.averageRating || null,
      ratingsCount:  v.ratingsCount  || null,
      previewLink:   v.previewLink   || null,
      source:        'google',
    };
  }

  // ── Helpers ───────────────────────────────

  function _firstOf(arr) {
    return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
  }

  // OL subjects can be very verbose — keep the first 5 clean ones
  function _cleanSubjects(subjects) {
    if (!Array.isArray(subjects)) return [];
    return subjects
      .filter(s => typeof s === 'string' && s.length < 40) // drop "Accessible book"-style noise
      .slice(0, 5);
  }

  // OL language field is an array of codes like ["eng", "fre"]
  function _olLanguage(lang) {
    const first = _firstOf(lang);
    if (!first) return null;
    const map = { eng: 'English', fre: 'French', spa: 'Spanish',
                  deu: 'German', ita: 'Italian', por: 'Portuguese',
                  jpn: 'Japanese', zho: 'Chinese', kor: 'Korean' };
    return map[first] || first;
  }

  // GB publishedDate can be "2011", "2011-06", or "2011-06-14"
  function _gbYear(dateStr) {
    if (!dateStr) return null;
    const year = parseInt(dateStr.slice(0, 4), 10);
    return isNaN(year) ? null : year;
  }

  // Prefer ISBN-13, fall back to ISBN-10
  function _gbISBN(identifiers) {
    if (!Array.isArray(identifiers)) return null;
    const isbn13 = identifiers.find(i => i.type === 'ISBN_13');
    const isbn10 = identifiers.find(i => i.type === 'ISBN_10');
    return (isbn13 || isbn10)?.identifier || null;
  }

  function _normalizeOpenLibraryWorkKey(value) {
    const clean = String(value || '').trim();
    if (!clean) return null;
    if (clean.startsWith('/works/') || clean.startsWith('works/')) {
      return clean.startsWith('/works/') ? clean : `/${clean}`;
    }
    return null;
  }

  function _normalizeOpenLibraryAuthorKey(value) {
    const clean = String(value || '').trim();
    if (!clean) return null;
    if (clean.startsWith('/authors/')) return clean;
    if (clean.startsWith('authors/')) return `/${clean}`;
    return null;
  }

  return { fromOpenLibrary, fromGoogleBooks };

})();
