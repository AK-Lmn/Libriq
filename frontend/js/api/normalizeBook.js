/* ============================================
   LIBRIQ — normalizeBook.js
   Maps raw API responses from any provider
   to the internal book shape used by createBook()
   and the rest of the application.

   Internal shape (must match createBook() in data.js):
     title, author, coverUrl, isbn, pageCount,
     publishYear, publisher, description, genres,
     language, googleBooksId, openLibraryId,
     rating, ratingsCount, previewLink
   ============================================ */

const NormalizeBook = (() => {

  const OL_COVER = 'https://covers.openlibrary.org/b/id';

  // ── Open Library ──────────────────────────
  // Input: one doc from /search.json response

  function fromOpenLibrary(doc) {
    if (!doc || !doc.title) return null;

    const coverId = doc.cover_i || (doc.cover_edition_key ? null : null);

    return {
      title:         doc.title,
      author:        _firstOf(doc.author_name) || 'Unknown Author',
      coverUrl:      coverId ? `${OL_COVER}/${coverId}-L.jpg` : null,
      isbn:          _firstOf(doc.isbn) || null,
      pageCount:     doc.number_of_pages_median || 0,
      publishYear:   doc.first_publish_year || null,
      publisher:     _firstOf(doc.publisher) || null,
      description:   null,           // OL search doesn't return descriptions
      genres:        _cleanSubjects(doc.subject),
      language:      _olLanguage(doc.language),
      openLibraryId: doc.key || null,
      googleBooksId: null,
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
      pageCount:     v.pageCount || 0,
      publishYear:   _gbYear(v.publishedDate),
      publisher:     v.publisher || null,
      description:   v.description || null,
      genres:        Array.isArray(v.categories) ? v.categories.slice(0, 5) : [],
      language:      v.language || null,
      openLibraryId: null,
      googleBooksId: item.id || null,
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

  return { fromOpenLibrary, fromGoogleBooks };

})();
