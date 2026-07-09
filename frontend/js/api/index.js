/* ============================================
   LIBRIQ - api/index.js
   Public BookAPI facade.

   The ONLY file that search.js (or any UI code)
   should ever call. All provider details are
   encapsulated in the modules below.

   Public API:
     BookAPI.searchBooks(query)  -> Object[]
     BookAPI.lookupISBN(isbn)    -> Object|null

   Adding a future provider (e.g. ISBNdb):
     1. Create js/api/isbndb.js
     2. Call it inside _fetchExternal() below
     3. Pass results to MergeBooks.merge()
     search.js never needs to change.
   ============================================ */

const BookAPI = (() => {
  window.LibriqApiMeta = window.LibriqApiMeta || Object.freeze({
    appName: 'LibriQ',
    appVersion: '4.6',
    contactEmail: 'klamano23@gmail.com',
  });

  let _lastSearchMeta = {
    query: '',
    fromCache: false,
    offline: false,
    blockedOffline: false,
    networkFailure: false,
  };

  async function searchBooks(query) {
    const q = (query || '').trim();
    if (q.length < 3) return [];

    _lastSearchMeta = {
      query: q,
      fromCache: false,
      offline: !navigator.onLine,
      blockedOffline: false,
      networkFailure: false,
    };

    if (BookCache.has(q)) {
      _lastSearchMeta.fromCache = true;
      return BookCache.get(q);
    }

    if (!navigator.onLine) {
      _lastSearchMeta.blockedOffline = true;
      return [];
    }

    const [olBooks, gbBooks] = await Promise.all([
      OpenLibraryAPI.search(q),
      GoogleBooksAPI.search(q),
    ]);

    const hadNetworkFailure = Boolean(
      OpenLibraryAPI.hadNetworkFailure?.() || GoogleBooksAPI.hadNetworkFailure?.()
    );

    let results;

    if (olBooks.length > 0) {
      results = MergeBooks.merge(olBooks, gbBooks);
    } else if (gbBooks.length > 0) {
      results = gbBooks;
    } else {
      results = [];
    }

    results = await _enrichSearchDescriptions(results);

    if (results.length === 0 && hadNetworkFailure) {
      _lastSearchMeta.offline = true;
      _lastSearchMeta.networkFailure = true;
    }

    if (results.length > 0) {
      BookCache.set(q, results);
    }

    return results;
  }

  async function lookupISBN(isbn) {
    if (!isbn) return null;

    const cacheKey = `isbn:${isbn}`;
    if (BookCache.has(cacheKey)) {
      return BookCache.get(cacheKey)?.[0] || null;
    }

    const [olBook, gbBook] = await Promise.all([
      OpenLibraryAPI.lookupISBN(isbn),
      GoogleBooksAPI.lookupISBN(isbn),
    ]);

    let result = MergeBooks.mergeOne(olBook, gbBook);
    const descriptionHelper = typeof NormalizeBook !== 'undefined' ? NormalizeBook : null;
    if (
      result &&
      !descriptionHelper?.isUsefulDescription?.(result.description) &&
      typeof OpenLibraryAPI.enrichBook === 'function' &&
      (result.openLibraryWorkKey || String(result.openLibraryId || '').includes('/works/'))
    ) {
      result = await OpenLibraryAPI.enrichBook(result);
    }

    if (result) {
      BookCache.set(cacheKey, [result]);
    }

    return result;
  }

  async function searchOpenLibrary(query) {
    return OpenLibraryAPI.search(query);
  }

  async function searchGoogleBooks(query) {
    return GoogleBooksAPI.search(query);
  }

  async function _enrichSearchDescriptions(results) {
    if (!Array.isArray(results) || results.length === 0) return [];
    if (typeof OpenLibraryAPI.enrichBook !== 'function') return results;
    const descriptionHelper = typeof NormalizeBook !== 'undefined' ? NormalizeBook : null;
    const needsDescription = results
      .map((book, index) => ({ book, index }))
      .filter(({ book }) => (
        !descriptionHelper?.isUsefulDescription?.(book.description) &&
        (book.openLibraryWorkKey || String(book.openLibraryId || '').includes('/works/'))
      ))
      .slice(0, 6);
    if (needsDescription.length === 0) return results;

    const enriched = await Promise.all(needsDescription.map(({ book }) => OpenLibraryAPI.enrichBook(book)));
    const next = results.slice();
    enriched.forEach((book, idx) => {
      if (book) next[needsDescription[idx].index] = book;
    });
    return next;
  }

  return {
    searchBooks,
    lookupISBN,
    searchOpenLibrary,
    searchGoogleBooks,
    getLastSearchMeta: () => ({ ..._lastSearchMeta }),
  };

})();
