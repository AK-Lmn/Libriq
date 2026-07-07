/* ============================================
   LIBRIQ — gutendex.js
   Gutendex / Project Gutenberg discovery helpers.
   Discovery only. No main search integration.
   ============================================ */

const GutendexAPI = (() => {
  const BASE = 'https://gutendex.com/books';
  const TIMEOUT_MS = 8000;
  let _lastFetchFailed = false;

  async function searchCuratedClassics(options = {}) {
    if (!navigator.onLine) return [];
    _lastFetchFailed = false;

    const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 12);
    const params = new URLSearchParams({
      page: '1',
      copyright: 'false',
      languages: 'en',
      sort: 'popular',
    });

    const topic = _normalizeTopic(options.topic || 'classics');
    if (topic) params.set('topic', topic);
    const query = String(options.query || '').trim();
    if (query) params.set('search', query);

    try {
      const data = await _fetch(`${BASE}?${params}`);
      const results = Array.isArray(data?.results) ? data.results : [];
      return results
        .slice(0, limit)
        .map(result => _normalizeGutendexBook(result, topic))
        .filter(Boolean);
    } catch (err) {
      if (_isExpectedAbort(err)) {
        return [];
      }
      console.warn('[Libriq/Gutendex] Discovery failed:', err.message);
      _lastFetchFailed = _isNetworkFailure(err);
      return [];
    }
  }

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

  function _normalizeGutendexBook(item, subjectKey = '') {
    if (!item || !item.title) return null;

    const authorNames = Array.isArray(item.authors)
      ? item.authors.map(author => author?.name || '').filter(Boolean)
      : [];
    const authorKeys = Array.isArray(item.authors)
      ? item.authors.map(author => author?.key).filter(Boolean)
      : [];
    const coverUrl = item.formats?.['image/jpeg'] || item.formats?.['image/png'] || null;
    const htmlLink = item.formats?.['text/html'] || item.formats?.['text/html; charset=utf-8'] || null;
    const epubLink = item.formats?.['application/epub+zip'] || null;
    const txtLink = item.formats?.['text/plain; charset=utf-8'] || item.formats?.['text/plain'] || null;
    const mobiLink = item.formats?.['application/x-mobipocket-ebook'] || null;
    const gutenbergId = _extractGutenbergId(item.id, item.bookshelves, item.formats);
    const gutendexId = String(item.id || '').trim() || null;
    const subjects = Array.isArray(item.bookshelves)
      ? item.bookshelves.map(value => String(value || '').trim()).filter(Boolean)
      : [];
    const sourceData = typeof BookIdentity !== 'undefined' && BookIdentity?.buildSourceBadgeData
      ? BookIdentity.buildSourceBadgeData({
          source: 'gutenberg',
          gutendexId,
          gutenbergId,
          identifiers: [{ type: 'gutendex', identifier: gutendexId }, ...(gutenbergId ? [{ type: 'gutenberg', identifier: gutenbergId }] : [])],
          sourceIds: {
            gutendex: gutendexId,
            ...(gutenbergId ? { gutenberg: gutenbergId } : {}),
          },
        })
      : { sourceIds: {}, sourceBadges: ['Project Gutenberg'], sources: ['Project Gutenberg'] };

    return {
      title: item.title,
      author: authorNames[0] || 'Unknown Author',
      coverUrl,
      coverId: null,
      isbn: null,
      isbns: [],
      pageCount: 0,
      publishYear: _extractYear(item.authors),
      firstPublishYear: _extractYear(item.authors),
      publisher: 'Project Gutenberg',
      description: item.summaries?.[0] || item.subjects?.[0] || null,
      genres: subjects.slice(0, 5),
      subjects: subjects,
      subjectPlaces: [],
      subjectPeople: [],
      subjectTimes: [],
      language: Array.isArray(item.languages) ? item.languages[0] || 'English' : 'English',
      openLibraryId: null,
      openLibraryWorkKey: null,
      openLibraryEditionKey: null,
      openLibraryAuthorKeys: [],
      gutendexId,
      gutenbergId,
      sourceIds: {
        gutendex: gutendexId,
        ...(gutenbergId ? { gutenberg: gutenbergId } : {}),
      },
      sourceBadges: sourceData.sourceBadges || ['Project Gutenberg'],
      sources: sourceData.sources || ['Project Gutenberg'],
      identifiers: [
        { type: 'GUTENDEX', identifier: gutendexId },
        ...(gutenbergId ? [{ type: 'GUTENBERG', identifier: String(gutenbergId) }] : []),
      ],
      rating: null,
      ratingsCount: null,
      previewLink: htmlLink || null,
      readableSourceLinks: [htmlLink, epubLink, txtLink, mobiLink].filter(Boolean),
      downloadLinks: {
        html: htmlLink || null,
        epub: epubLink || null,
        text: txtLink || null,
        kindle: mobiLink || null,
      },
      source: 'gutenberg',
      subjectKey: subjectKey || null,
    };
  }

  function _extractGutenbergId(id, bookshelves, formats) {
    const direct = String(id || '').trim();
    if (direct && /^\d+$/.test(direct)) return direct;
    const htmlLink = formats?.['text/html'] || formats?.['text/html; charset=utf-8'] || '';
    const match = String(htmlLink || '').match(/\/(\d+)(?:[/?#]|$)/);
    if (match) return match[1];
    if (Array.isArray(bookshelves)) {
      const shelfMatch = bookshelves.map(s => String(s || '')).join(' ').match(/gutenberg[:\s-]*(\d+)/i);
      if (shelfMatch) return shelfMatch[1];
    }
    return null;
  }

  function _extractYear(authors) {
    const yearValue = Array.isArray(authors) ? authors.find(author => Number.isFinite(Number(author?.birth_year)))?.birth_year : null;
    return Number.isFinite(Number(yearValue)) ? Number(yearValue) : null;
  }

  function _normalizeTopic(value) {
    return String(value || '').toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
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

  function _isExpectedAbort(err) {
    const message = String(err?.message || '').toLowerCase();
    return err?.name === 'AbortError'
      || message.includes('aborted')
      || message.includes('signal is aborted without reason');
  }

  return {
    searchCuratedClassics,
    hadNetworkFailure: () => _lastFetchFailed,
  };
})();
