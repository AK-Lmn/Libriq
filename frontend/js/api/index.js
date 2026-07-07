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

    const result = MergeBooks.mergeOne(olBook, gbBook);

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

  return {
    searchBooks,
    lookupISBN,
    searchOpenLibrary,
    searchGoogleBooks,
    getLastSearchMeta: () => ({ ..._lastSearchMeta }),
  };

})();
