/* ============================================
   LIBRIQ — openLibrary.js
   Open Library API communication only.
   No UI logic. No state. Pure data fetching.
   ============================================ */

const OpenLibraryAPI = (() => {

  const BASE_SEARCH = 'https://openlibrary.org/search.json';
  const BASE_ISBN   = 'https://openlibrary.org/isbn';
  const TIMEOUT_MS  = 8000;

  // Fields requested from the search endpoint.
  // Kept explicit to avoid OL's 2025 default-field restrictions.
  const SEARCH_FIELDS = [
    'key', 'title', 'author_name',
    'cover_i', 'cover_edition_key',
    'first_publish_year', 'number_of_pages_median',
    'subject', 'isbn', 'publisher', 'language',
  ].join(',');

  // ── Search ────────────────────────────────

  /**
   * Search Open Library by any query string.
   * Returns an array of normalized book objects,
   * or an empty array on failure.
   * @param {string} query
   * @returns {Promise<Object[]>}
   */
  async function search(query) {
    if (!query || query.trim().length < 3) return [];

    const params = new URLSearchParams({
      q:      query.trim(),
      fields: SEARCH_FIELDS,
      limit:  '12',
    });

    try {
      const data = await _fetch(`${BASE_SEARCH}?${params}`);
      if (!data || !Array.isArray(data.docs)) return [];

      return data.docs
        .map(doc => NormalizeBook.fromOpenLibrary(doc))
        .filter(Boolean); // remove nulls (docs with no title)
    } catch (err) {
      console.warn('[Libriq/OL] Search failed:', err.message);
      return [];
    }
  }

  /**
   * Look up a single book by ISBN.
   * Returns a normalized book object or null.
   * @param {string} isbn
   * @returns {Promise<Object|null>}
   */
  async function lookupISBN(isbn) {
    if (!isbn) return null;
    const clean = isbn.replace(/[^0-9X]/gi, '');
    if (clean.length !== 10 && clean.length !== 13) return null;

    try {
      // OL's ISBN endpoint returns the edition record directly
      const data = await _fetch(`${BASE_ISBN}/${clean}.json`);
      if (!data) return null;

      // ISBN endpoint returns edition data, not a search doc.
      // Build a minimal compatible shape for normalizeBook.
      const doc = {
        key:                    data.key,
        title:                  data.title,
        author_name:            data.authors?.map(a => a.key) || [],
        cover_i:                data.covers?.[0] || null,
        first_publish_year:     data.publish_date ? parseInt(data.publish_date) : null,
        number_of_pages_median: data.number_of_pages || 0,
        subject:                data.subjects || [],
        isbn:                   [clean],
        publisher:              data.publishers || [],
        language:               data.languages?.map(l => l.key?.split('/').pop()) || [],
      };

      return NormalizeBook.fromOpenLibrary(doc);
    } catch (err) {
      console.warn('[Libriq/OL] ISBN lookup failed:', err.message);
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

  return { search, lookupISBN };

})();
