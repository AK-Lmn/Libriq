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
  const DESCRIPTION_FALLBACK = 'No description available yet.';

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
      shortDescription: null,
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

    const description = chooseBestDescription([
      { text: v.description, source: 'google-description', language: v.language, full: true },
      { text: item.searchInfo?.textSnippet, source: 'google-snippet', language: v.language, snippet: true },
    ]);
    const shortDescription = chooseBestDescription([
      { text: item.searchInfo?.textSnippet, source: 'google-snippet', language: v.language, snippet: true },
      { text: description, source: 'google-description', language: v.language, full: true },
    ], { preferShort: true });

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
      description,
      shortDescription,
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

  function normalizeDescriptionText(value) {
    if (value && typeof value === 'object') {
      value = value.value || value.text || '';
    }
    const raw = String(value || '').trim();
    if (!raw) return null;
    const cleaned = raw
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/g, "'")
      .replace(/&rsquo;/gi, "'")
      .replace(/&ldquo;|&rdquo;/gi, '"')
      .replace(/&mdash;|&ndash;/gi, '-')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || null;
  }

  function isUsefulDescription(value) {
    const text = normalizeDescriptionText(value);
    if (!text) return false;
    if (text.length < 30) return false;
    const lower = text.toLowerCase();
    if (lower === DESCRIPTION_FALLBACK.toLowerCase()) return false;
    if (/^(no description|description unavailable|unknown|n\/a)\b/.test(lower)) return false;
    if (/^(fiction|classic|self-help|business|psychology|non-fiction)\.?$/i.test(text)) return false;
    if (_englishLikelihood(text) < 0.18) return false;
    return true;
  }

  function chooseBestDescription(candidates, options = {}) {
    const list = (Array.isArray(candidates) ? candidates : [candidates])
      .map(candidate => {
        const item = typeof candidate === 'object' && candidate !== null ? candidate : { text: candidate };
        const text = normalizeDescriptionText(item.text ?? item.description ?? item.value);
        if (!isUsefulDescription(text)) return null;
        return {
          ...item,
          text,
          score: _scoreDescription(text, item, options),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || b.text.length - a.text.length);
    return list[0]?.text || null;
  }

  function _scoreDescription(text, item = {}, options = {}) {
    const source = String(item.source || '').toLowerCase();
    const language = String(item.language || '').toLowerCase();
    let score = 0;
    if (source.includes('google-description')) score += 80;
    else if (source.includes('google-snippet')) score += 60;
    else if (source.includes('gutendex') || source.includes('gutenberg')) score += 54;
    else if (source.includes('openlibrary')) score += 50;
    else score += 35;

    if (language === 'en' || language === 'eng' || language === 'english') score += 24;
    else if (language && !['und', 'unknown'].includes(language)) score -= 18;

    const langScore = _englishLikelihood(text);
    score += langScore * 28;
    if (langScore < 0.24) score -= 35;

    const length = text.length;
    if (length >= 120) score += 14;
    else if (length >= 70) score += 8;
    else score -= 6;
    if (length > 1800) score -= 8;
    if (options.preferShort && length <= 360) score += 12;
    if (item.snippet) score -= options.preferShort ? 0 : 10;
    if (item.full) score += options.preferShort ? 0 : 8;
    return score;
  }

  function _englishLikelihood(text) {
    const lower = ` ${String(text || '').toLowerCase()} `;
    const letters = lower.replace(/[^a-z\u00c0-\u024f\u0400-\u04ff\u4e00-\u9fff]/gi, '');
    const asciiLetters = lower.replace(/[^a-z]/gi, '');
    const asciiRatio = letters.length ? asciiLetters.length / letters.length : 1;
    const common = [' the ', ' and ', ' of ', ' to ', ' in ', ' is ', ' for ', ' with ', ' that ', ' this ', ' a ', ' an ', ' as ', ' by ', ' from ', ' on ', ' are ', ' into ', ' your ', ' their '];
    const hits = common.reduce((count, token) => count + (lower.includes(token) ? 1 : 0), 0);
    const foreign = [' der ', ' die ', ' und ', ' des ', ' pour ', ' avec ', ' une ', ' les ', ' que ', ' para ', ' uma ', ' los ', ' las ', ' não ', ' sobre ', ' della ', ' una ', ' gli '];
    const foreignHits = foreign.reduce((count, token) => count + (lower.includes(token) ? 1 : 0), 0);
    return Math.max(0, Math.min(1, (asciiRatio * 0.45) + (Math.min(hits, 8) / 8 * 0.55) - (Math.min(foreignHits, 5) / 5 * 0.45)));
  }

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

  return {
    fromOpenLibrary,
    fromGoogleBooks,
    normalizeDescriptionText,
    isUsefulDescription,
    chooseBestDescription,
  };

})();
