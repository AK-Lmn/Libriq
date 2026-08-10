import { NormalizeBook } from './normalizeBook.js';
import { fetchJson } from '../shared/fetchClient.js';

export const GoogleBooksAPI = (() => {

  const BASE = 'https://www.googleapis.com/books/v1/volumes';
  const TIMEOUT_MS = 8000;
  let _lastFetchFailed = false;

  async function search(query) {
    if (!query || query.trim().length < 3) return [];
    _lastFetchFailed = false;

    const params = new URLSearchParams({
      q:          query.trim(),
      maxResults: '12',
      printType:  'books',
      fields:     'items(id,searchInfo(textSnippet),volumeInfo(title,authors,description,publisher,publishedDate,pageCount,categories,language,imageLinks,averageRating,ratingsCount,previewLink,industryIdentifiers))',
    });
    const apiKey = _getApiKey();
    if (apiKey) {
      params.set('key', apiKey);
    }

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

  async function lookupISBN(isbn) {
    if (!isbn) return null;
    const clean = isbn.replace(/[^0-9X]/gi, '');

    try {
      const params = new URLSearchParams({
        q:          `isbn:${clean}`,
        maxResults: '1',
        printType:  'books',
      });
      const apiKey = _getApiKey();
      if (apiKey) {
        params.set('key', apiKey);
      }
      const data = await _fetch(`${BASE}?${params}`);
      const item = data?.items?.[0];
      return item ? NormalizeBook.fromGoogleBooks(item) : null;
    } catch (err) {
      console.warn('[Libriq/GB] ISBN lookup failed:', err.message);
      _lastFetchFailed = _isNetworkFailure(err);
      return null;
    }
  }

  async function _fetch(url) {
    const requestUrl = _cacheBust(url);
    return fetchJson(requestUrl, { timeoutMs: TIMEOUT_MS, retries: 1 });
  }

  function _cacheBust(url) {
    const requestUrl = new URL(url);
    requestUrl.searchParams.set('_ts', Date.now().toString());
    return requestUrl.toString();
  }

  function _getApiKey() {
    const config = window.LibriqConfig || window.__LIBRIQ_CONFIG__ || {};
    const candidate = config.googleBooksApiKey || config.googleBooksKey || config.GOOGLE_BOOKS_API_KEY || '';
    return String(candidate).trim();
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
