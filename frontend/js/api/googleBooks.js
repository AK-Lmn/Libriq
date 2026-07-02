/* ============================================
   LIBRIQ — googleBooks.js
   Google Books API communication only.
   No UI logic. No state. Pure data fetching.

   Uses the public volumes endpoint — no API key
   required for basic search (1000 req/day per IP).
   ============================================ */

const GoogleBooksAPI = (() => {

  const BASE = 'https://www.googleapis.com/books/v1/volumes';
  const API_KEY = 'AIzaSyBo6ZJ5Uz9JHJI4SWwH4FcYVENwGxBq5WE'; // optional, not required for basic search
  const TIMEOUT_MS = 8000;
  let _lastFetchFailed = false;

  // ── Search ────────────────────────────────

  /**
   * Search Google Books by any query string.
   * Returns an array of normalized book objects,
   * or an empty array on failure.
   * @param {string} query
   * @returns {Promise<Object[]>}
   */
  async function search(query) {
    if (!query || query.trim().length < 3) return [];
    _lastFetchFailed = false;

    const params = new URLSearchParams({
      q:          query.trim(),
      maxResults: '12',
      printType:  'books',
      key:        'AIzaSyBo6ZJ5Uz9JHJI4SWwH4FcYVENwGxBq5WE',
      fields:     'items(id,volumeInfo(title,authors,description,publisher,publishedDate,pageCount,categories,language,imageLinks,averageRating,ratingsCount,previewLink,industryIdentifiers))',
    });

    try {
      const data = await _fetch(`${BASE}?${params}`);
      if (!data || !Array.isArray(data.items)) return [];

      return data.items
        .map(item => NormalizeBook.fromGoogleBooks(item))
        .filter(Boolean);
    } catch (err) {
      console.warn('[Libriq/GB] Search failed:', err.message);
      _lastFetchFailed = _isNetworkFailure(err);
      return [];
    }
  }

  /**
   * Look up a single book by ISBN via Google Books.
   * Returns a normalized book object or null.
   * @param {string} isbn
   * @returns {Promise<Object|null>}
   */
  async function lookupISBN(isbn) {
    if (!isbn) return null;
    const clean = isbn.replace(/[^0-9X]/gi, '');

    try {
      const params = new URLSearchParams({
        q:          `isbn:${clean}`,
        maxResults: '1',
        printType:  'books',
        key:        'AIzaSyBo6ZJ5Uz9JHJI4SWwH4FcYVENwGxBq5WE',
      });
      const data = await _fetch(`${BASE}?${params}`);
      const item = data?.items?.[0];
      return item ? NormalizeBook.fromGoogleBooks(item) : null;
    } catch (err) {
      console.warn('[Libriq/GB] ISBN lookup failed:', err.message);
      _lastFetchFailed = _isNetworkFailure(err);
      return null;
    }
  }

  // ── Internal ──────────────────────────────

  async function _fetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const requestUrl = _cacheBust(url);

    try {
      const res = await fetch(requestUrl, {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'omit',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  function _cacheBust(url) {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set('_ts', Date.now().toString());
    return requestUrl.toString();
  }

  function _isNetworkFailure(err) {
    const message = String(err?.message || '').toLowerCase();
    return err?.name === 'AbortError'
      || err?.name === 'TypeError'
      || message.includes('failed to fetch')
      || message.includes('networkerror')
      || message.includes('network error');
  }

  return {
    search,
    lookupISBN,
    hadNetworkFailure: () => _lastFetchFailed,
  };

})();
