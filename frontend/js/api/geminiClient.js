/* ============================================
   LIBRIQ — geminiClient.js
   Frontend helper for the Gemini recommendations route.
   No direct Gemini calls. No API keys.
   ============================================ */

const GeminiRecommendationsAPI = (() => {
  const ENDPOINT = '/api/gemini/recommendations';
  const MAX_CONTEXT_BOOKS = 15;
  const MAX_RENDERED_RECS = 8;

  function buildContextBooks(books = []) {
    const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
    const scored = [];
    const seen = new Set();

    const push = (book, score) => {
      const normalized = _normalizeBook(book);
      if (!normalized) return;
      const key = _dedupeKey(normalized);
      if (!key || seen.has(key)) return;
      seen.add(key);
      scored.push({ book: normalized, score });
    };

    safeBooks.forEach((book) => {
      let score = 0;
      if (book.isFavorite) score += 5;
      if (book.status === LIBRIQ.STATUS.FINISHED) score += 4;
      if (book.status === LIBRIQ.STATUS.READING) score += 3;
      if (typeof book.rating === 'number') score += book.rating;
      if (Array.isArray(book.genres) && book.genres.length) score += 1;
      if (Array.isArray(book.subjects) && book.subjects.length) score += 1;
      if (book.status === LIBRIQ.STATUS.WISHLIST) score += 0.5;
      push(book, score);
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_CONTEXT_BOOKS).map(entry => entry.book);
  }

  function buildRequestPayload(mode, books = []) {
    return {
      mode: String(mode || '').trim() || 'recommendations',
      books: buildContextBooks(books).slice(0, MAX_CONTEXT_BOOKS).map(book => ({
        title: book.title,
        author: book.author,
        genres: Array.isArray(book.genres) ? book.genres.slice(0, 8) : [],
        subjects: Array.isArray(book.subjects) ? book.subjects.slice(0, 8) : [],
        status: book.status || '',
        rating: typeof book.rating === 'number' ? book.rating : null,
        isFavorite: Boolean(book.isFavorite),
      })),
    };
  }

  async function generateRecommendations({ mode, books }) {
    if (!navigator.onLine) {
      const error = new Error('offline');
      error.code = 'offline';
      throw error;
    }
    const firebase = window.LibriqFirebase || {};
    const authState = firebase.getState?.() || {};
    if (!authState.ready) {
      const error = new Error('auth-loading');
      error.code = 'auth-loading';
      throw error;
    }
    const tokenHelper = firebase.getCurrentUserIdToken;
    if (typeof tokenHelper !== 'function') {
      const error = new Error('auth');
      error.code = 'auth';
      throw error;
    }
    const token = await tokenHelper(false).catch((err) => {
      console.warn('[Libriq/Gemini] Token retrieval failed:', _debugAuthError(err));
      return null;
    });
    if (!token) {
      const error = new Error('auth-expired');
      error.code = 'auth-expired';
      throw error;
    }

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(buildRequestPayload(mode, books)),
    });

    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }

    if (!response.ok) {
      const error = new Error(data?.error || 'request failed');
      error.status = response.status;
      error.payload = data;
      _logResponseFailure(response.status, data?.code || '', data);
      throw error;
    }

    return normalizeResponse(data);
  }

  function normalizeResponse(payload) {
    const recommendations = Array.isArray(payload?.recommendations)
      ? payload.recommendations
          .map(normalizeRecommendation)
          .filter(Boolean)
          .slice(0, MAX_RENDERED_RECS)
      : [];
    return {
      recommendations,
      meta: {
        fromCache: Boolean(payload?.meta?.fromCache),
      },
    };
  }

  function normalizeRecommendation(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const title = String(entry.title || '').trim();
    const author = String(entry.author || '').trim();
    const reason = String(entry.reason || '').trim();
    if (!title || !author || !reason) return null;
    const next = {
      title,
      author,
      reason,
    };
    const sourceHint = String(entry.sourceHint || '').trim();
    if (sourceHint) next.sourceHint = sourceHint;
    const confidence = Number(entry.confidence);
    if (Number.isFinite(confidence) && confidence >= 0 && confidence <= 1) next.confidence = confidence;
    return next;
  }

  function _normalizeBook(book) {
    if (!book || typeof book !== 'object') return null;
    if (!String(book.title || '').trim() || !String(book.author || '').trim()) return null;
    return {
      title: String(book.title || '').trim(),
      author: String(book.author || '').trim(),
      genres: Array.isArray(book.genres) ? book.genres.filter(Boolean).map(value => String(value).trim()).filter(Boolean) : [],
      subjects: Array.isArray(book.subjects) ? book.subjects.filter(Boolean).map(value => String(value).trim()).filter(Boolean) : [],
      status: String(book.status || '').trim(),
      rating: Number.isFinite(Number(book.rating)) ? Number(book.rating) : null,
      isFavorite: Boolean(book.isFavorite),
      source: String(book.source || '').trim(),
      openLibraryId: String(book.openLibraryId || '').trim(),
      googleBooksId: String(book.googleBooksId || '').trim(),
      internetArchiveId: String(book.internetArchiveId || '').trim(),
    };
  }

  function _dedupeKey(book) {
    const identity = window.BookIdentity || globalThis.BookIdentity || null;
    if (identity?.buildCompositeKey) return identity.buildCompositeKey(book);
    return [book.title.toLowerCase(), book.author.toLowerCase()].join('|');
  }

  function _debugAuthError(err) {
    return {
      code: String(err?.code || ''),
      message: String(err?.message || '').slice(0, 120),
    };
  }

  function _logResponseFailure(status, code, payload) {
    if (status === 401) {
      console.warn('[Libriq/Gemini] Backend rejected the Firebase session.', code ? { code } : undefined);
      return;
    }
    if (status === 429) {
      const safeCode = String(code || payload?.code || '');
      if (safeCode === 'GEMINI_PROVIDER_QUOTA_EXHAUSTED') {
        console.warn('[Libriq/Gemini] Gemini provider quota exhausted.', { code: safeCode });
      } else {
        console.warn('[Libriq/Gemini] Daily Gemini quota exhausted.', safeCode ? { code: safeCode } : undefined);
      }
      return;
    }
    if (status === 400) {
      const safeCode = String(code || payload?.code || '');
      console.warn('[Libriq/Gemini] Gemini bad request.', safeCode ? { code: safeCode } : undefined);
      return;
    }
    if (status >= 500) {
      console.warn('[Libriq/Gemini] Backend error:', status, code || 'UNKNOWN_SERVER_ERROR');
      return;
    }
    console.warn('[Libriq/Gemini] Request failed:', status, code || '');
  }

  return {
    buildContextBooks,
    buildRequestPayload,
    generateRecommendations,
    normalizeResponse,
    normalizeRecommendation,
    MAX_CONTEXT_BOOKS,
    MAX_RENDERED_RECS,
  };
})();

window.GeminiRecommendationsAPI = GeminiRecommendationsAPI;
