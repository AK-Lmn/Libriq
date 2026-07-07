/* ============================================
   LIBRIQ — openLibrary.js
   Open Library API communication only.
   No UI logic. No state. Pure data fetching.
   ============================================ */

const OpenLibraryAPI = (() => {

  // Responsible API identity note:
  // Open Library recommends identifying clients, but browser JavaScript
  // cannot reliably set a custom User-Agent header and adding custom
  // headers here risks CORS/preflight failures.
  // If LibriQ adds a backend or serverless proxy later, that layer should
  // set User-Agent to LibriQ/4.6 (klamano23@gmail.com).

  const BASE_SEARCH = 'https://openlibrary.org/search.json';
  const BASE_ISBN   = 'https://openlibrary.org/isbn';
  const BASE_WORK   = 'https://openlibrary.org/works';
  const BASE_AUTHOR = 'https://openlibrary.org/authors';
  const BASE_SUBJECT = 'https://openlibrary.org/subjects';
  const TIMEOUT_MS  = 8000;
  let _lastFetchFailed = false;

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
    _lastFetchFailed = false;

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
      _lastFetchFailed = _isNetworkFailure(err);
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
        author_key:             data.authors?.map(a => a.key) || [],
        cover_i:                data.covers?.[0] || null,
        cover_edition_key:      data.ocaid || data.key || null,
        first_publish_year:     data.publish_date ? parseInt(data.publish_date) : null,
        number_of_pages_median: data.number_of_pages || 0,
        subject:                data.subjects || [],
        subject_places:         data.subject_places || [],
        subject_people:         data.subject_people || [],
        subject_times:          data.subject_times || [],
        edition_count:          data.edition_count || null,
        isbn:                   [clean],
        publisher:              data.publishers || [],
        language:               data.languages?.map(l => l.key?.split('/').pop()) || [],
      };

      return NormalizeBook.fromOpenLibrary(doc);
    } catch (err) {
      console.warn('[Libriq/OL] ISBN lookup failed:', err.message);
      _lastFetchFailed = _isNetworkFailure(err);
      return null;
    }
  }

  async function enrichBook(book) {
    const base = book && typeof book === 'object' ? { ...book } : null;
    if (!base) return null;

    const workKey = _extractWorkKey(base);
    const authorKeys = _extractAuthorKeys(base);
    const needsSubjects = !Array.isArray(base.subjects) || base.subjects.length === 0;
    const needsCover = !base.coverId && !base.coverUrl;
    const needsEditionCount = !base.editionCount;

    if (!workKey && !authorKeys.length && !needsSubjects && !needsCover && !needsEditionCount) {
      return base;
    }

    try {
      const tasks = [];
      if (workKey) tasks.push(_fetchWorkRecord(workKey));
      if (workKey) tasks.push(_fetchWorkEditions(workKey));
      if (authorKeys.length) tasks.push(Promise.all(authorKeys.slice(0, 3).map(_fetchAuthorRecord)));
      const [workRecord, editionsRecord, authorRecords] = await Promise.all(tasks.length ? tasks : [Promise.resolve(null)]);

      return _applyEnrichment(base, {
        workKey,
        workRecord,
        editionsRecord,
        authorRecords: Array.isArray(authorRecords) ? authorRecords.filter(Boolean) : [],
      });
    } catch (err) {
      console.warn('[Libriq/OL] Enrichment failed:', err.message);
      _lastFetchFailed = _isNetworkFailure(err);
      return base;
    }
  }

  async function searchBySubject(subjectKey, options = {}) {
    const key = _normalizeSubjectKey(subjectKey);
    if (!key || !navigator.onLine) return [];
    const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 12);
    try {
      const data = await _fetch(`${BASE_SUBJECT}/${key}.json?limit=${limit}`);
      const works = Array.isArray(data?.works) ? data.works : [];
      return works.slice(0, limit).map(work => _normalizeSubjectResult(work, key)).filter(Boolean);
    } catch (err) {
      if (_isExpectedAbort(err)) {
        return [];
      }
      console.warn('[Libriq/OL] Subject search failed:', err.message);
      _lastFetchFailed = _isNetworkFailure(err);
      return [];
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

  async function _fetchWorkRecord(workKey) {
    const key = _normalizeOLKey(workKey);
    if (!key) return null;
    return _fetch(`${BASE_WORK}/${key}.json`);
  }

  async function _fetchWorkEditions(workKey) {
    const key = _normalizeOLKey(workKey);
    if (!key) return null;
    return _fetch(`${BASE_WORK}/${key}/editions.json?limit=20`);
  }

  async function _fetchAuthorRecord(authorKey) {
    const key = _normalizeOLKey(authorKey);
    if (!key) return null;
    return _fetch(`${BASE_AUTHOR}/${key}.json`);
  }

  function _normalizeSubjectKey(value) {
    return String(value || '')
      .toLowerCase()
      .trim()
      .replace(/^\/+/, '')
      .replace(/^subjects\//, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function _normalizeSubjectResult(work, subjectKey) {
    if (!work || !work.title) return null;
    const coverId = Array.isArray(work.cover_id) ? work.cover_id[0] : work.cover_id || (Array.isArray(work.covers) ? work.covers[0] : null);
    const source = typeof NormalizeBook !== 'undefined' && NormalizeBook?.fromOpenLibrary
      ? NormalizeBook.fromOpenLibrary({
          key: work.key || null,
          title: work.title,
          author_name: Array.isArray(work.authors) ? work.authors.map(author => author?.name || '').filter(Boolean) : ['Unknown Author'],
          author_key: Array.isArray(work.authors) ? work.authors.map(author => author?.key).filter(Boolean) : [],
          cover_i: coverId || null,
          cover_edition_key: work.cover_edition_key || null,
          first_publish_year: work.first_publish_year || null,
          edition_count: work.edition_count || null,
          subject: Array.isArray(work.subject) ? work.subject : [],
          subject_places: Array.isArray(work.subject_places) ? work.subject_places : [],
          subject_people: Array.isArray(work.subject_people) ? work.subject_people : [],
          subject_times: Array.isArray(work.subject_times) ? work.subject_times : [],
          isbn: Array.isArray(work.isbn) ? work.isbn : [],
        })
      : null;
    if (source) {
      return {
        ...source,
        source: 'openlibrary',
        sourceBadges: ['Open Library'],
        sources: ['Open Library'],
        subjectKey,
      };
    }
    return {
      title: work.title,
      author: Array.isArray(work.authors) && work.authors[0]?.name ? work.authors[0].name : 'Unknown Author',
      coverUrl: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : null,
      coverId,
      publishYear: work.first_publish_year || null,
      firstPublishYear: work.first_publish_year || null,
      subjects: Array.isArray(work.subject) ? work.subject : [],
      source: 'openlibrary',
      sourceBadges: ['Open Library'],
      sources: ['Open Library'],
      subjectKey,
    };
  }

  function _normalizeOLKey(value) {
    const clean = String(value || '').trim();
    if (!clean) return '';
    return clean
      .replace(/^\/+/, '')
      .replace(/^(works|authors|books)\//, '');
  }

  function _extractWorkKey(book) {
    const candidates = [
      book.openLibraryWorkKey,
      book.workKey,
      book.work?.key,
      book.key,
      book.openLibraryId,
      book.openLibraryEditionKey,
      book.coverEditionKey,
    ];
    for (const candidate of candidates) {
      const normalized = _normalizeOLWorkKey(candidate);
      if (normalized) return normalized;
    }
    return '';
  }

  function _normalizeOLWorkKey(value) {
    const clean = _normalizeOLKey(value);
    if (!clean) return '';
    return clean.startsWith('books/') ? '' : clean;
  }

  function _extractAuthorKeys(book) {
    const keys = [];
    const push = (value) => {
      const normalized = _normalizeOLAuthorKey(value);
      if (normalized && !keys.includes(normalized)) keys.push(normalized);
    };

    if (Array.isArray(book.openLibraryAuthorKeys)) book.openLibraryAuthorKeys.forEach(push);
    if (Array.isArray(book.authorKeys)) book.authorKeys.forEach(push);
    if (Array.isArray(book.author_key)) book.author_key.forEach(push);
    if (Array.isArray(book.identifiers)) {
      book.identifiers.forEach(item => {
        if (!item || typeof item !== 'object') return;
        if (String(item.type || '').toLowerCase().includes('author')) push(item.identifier || item.value || item.id);
      });
    }
    return keys;
  }

  function _normalizeOLAuthorKey(value) {
    const clean = _normalizeOLKey(value);
    if (!clean) return '';
    return clean;
  }

  function _applyEnrichment(base, payload) {
    const next = { ...base };
    const workRecord = payload.workRecord || {};
    const editionDocs = Array.isArray(payload.editionsRecord?.entries)
      ? payload.editionsRecord.entries
      : Array.isArray(payload.editionsRecord?.docs)
        ? payload.editionsRecord.docs
        : [];
    const authorRecords = Array.isArray(payload.authorRecords) ? payload.authorRecords : [];

    const subjects = _uniqueStrings([
      ...(Array.isArray(next.subjects) ? next.subjects : []),
      ...(Array.isArray(workRecord.subjects) ? workRecord.subjects : []),
      ...(Array.isArray(workRecord.subject_places) ? workRecord.subject_places : []),
      ...(Array.isArray(workRecord.subject_people) ? workRecord.subject_people : []),
      ...(Array.isArray(workRecord.subject_times) ? workRecord.subject_times : []),
    ]);

    const sourceLinks = _uniqueStrings([
      ...(Array.isArray(next.readableSourceLinks) ? next.readableSourceLinks : []),
      ...(Array.isArray(workRecord.links) ? workRecord.links.map(link => link?.url).filter(Boolean) : []),
      ...(Array.isArray(editionDocs) ? editionDocs.map(edition => edition?.url || edition?.key).filter(Boolean) : []),
      ...(Array.isArray(authorRecords) ? authorRecords.map(author => author?.url || author?.key).filter(Boolean) : []),
    ]);

    if (!next.openLibraryWorkKey && payload.workKey) next.openLibraryWorkKey = payload.workKey;
    if (!next.openLibraryEditionKey) {
      next.openLibraryEditionKey = _firstNonEmpty([
        next.openLibraryEditionKey,
        editionDocs.find(edition => edition?.key)?.key,
        next.cover_edition_key,
      ]);
    }
    if (!Array.isArray(next.openLibraryAuthorKeys) || next.openLibraryAuthorKeys.length === 0) {
      next.openLibraryAuthorKeys = authorRecords.length
        ? authorRecords.map(author => _normalizeOLAuthorKey(author?.key)).filter(Boolean)
        : _extractAuthorKeys(next);
    }
    if (!next.subjects || next.subjects.length === 0) next.subjects = subjects;
    if (!next.subjectPlaces || next.subjectPlaces.length === 0) next.subjectPlaces = _uniqueStrings([
      ...(Array.isArray(workRecord.subject_places) ? workRecord.subject_places : []),
    ]);
    if (!next.subjectPeople || next.subjectPeople.length === 0) next.subjectPeople = _uniqueStrings([
      ...(Array.isArray(workRecord.subject_people) ? workRecord.subject_people : []),
    ]);
    if (!next.subjectTimes || next.subjectTimes.length === 0) next.subjectTimes = _uniqueStrings([
      ...(Array.isArray(workRecord.subject_times) ? workRecord.subject_times : []),
    ]);
    if (!next.coverId) next.coverId = _firstNonEmpty([
      workRecord.covers?.[0],
      editionDocs.find(edition => Array.isArray(edition.covers) && edition.covers.length > 0)?.covers?.[0],
      next.coverId,
    ]) || null;
    if (!next.coverUrl && next.coverId) next.coverUrl = `https://covers.openlibrary.org/b/id/${next.coverId}-L.jpg`;
    if (!next.editionCount) next.editionCount = workRecord.edition_count || editionDocs.length || null;
    if (!next.firstPublishYear) next.firstPublishYear = workRecord.first_publish_year || next.publishYear || null;
    if (!next.openLibraryId && workRecord.key) next.openLibraryId = workRecord.key;
    if (!next.readableSourceLinks || next.readableSourceLinks.length === 0) next.readableSourceLinks = sourceLinks;

    return next;
  }

  function _uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
      .map(value => String(value || '').trim())
      .filter(Boolean)));
  }

  function _firstNonEmpty(values) {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      const clean = String(value).trim();
      if (clean) return clean;
    }
    return '';
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
    search,
    lookupISBN,
    enrichBook,
    searchBySubject,
    hadNetworkFailure: () => _lastFetchFailed,
  };

})();
