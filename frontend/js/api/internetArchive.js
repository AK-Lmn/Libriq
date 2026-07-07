/* ============================================
   LIBRIQ — internetArchive.js
   Internet Archive link enrichment only.
   No discovery. No main search integration.
   ============================================ */

const InternetArchiveAPI = (() => {
  const BASE = 'https://archive.org';
  const TIMEOUT_MS = 6000;
  let _lastFetchFailed = false;

  async function enrichBookLinks(book) {
    const base = book && typeof book === 'object' ? { ...book } : null;
    if (!base || !navigator.onLine) return base;

    const identifiers = _collectArchiveIdentifiers(base);
    if (!identifiers.length) return base;

    try {
      const metadata = await _fetchArchiveMetadata(identifiers);
      return _applyArchiveLinks(base, metadata);
    } catch (err) {
      console.warn('[Libriq/IA] Link enrichment failed:', err.message);
      _lastFetchFailed = _isNetworkFailure(err);
      return base;
    }
  }

  function _collectArchiveIdentifiers(book) {
    const ids = [];
    const push = (value) => {
      const normalized = _normalizeIdentifier(value);
      if (normalized && !ids.includes(normalized)) ids.push(normalized);
    };

    push(book.internetArchiveId);
    if (Array.isArray(book.internetArchiveIds)) book.internetArchiveIds.forEach(push);
    if (book.ocaid) push(book.ocaid);
    if (book.identifier) push(book.identifier);
    if (Array.isArray(book.identifiers)) {
      book.identifiers.forEach((identifier) => {
        if (!identifier || typeof identifier !== 'object') return;
        const type = String(identifier.type || '').toLowerCase();
        if (type.includes('archive') || type === 'ocaid' || type === 'ia') push(identifier.identifier || identifier.value || identifier.id);
      });
    }
    if (Array.isArray(book.sourceIds)) {
      book.sourceIds.forEach((entry) => {
        if (!entry || typeof entry !== 'object') return;
        const source = String(entry.source || '').toLowerCase();
        if (source.includes('archive') || source === 'ia') push(entry.id);
      });
    } else if (book.sourceIds && typeof book.sourceIds === 'object') {
      Object.entries(book.sourceIds).forEach(([source, id]) => {
        if (String(source || '').toLowerCase().includes('archive')) push(id);
      });
    }
    return ids;
  }

  async function _fetchArchiveMetadata(identifiers) {
    const next = {
      archiveUrl: null,
      internetArchiveId: null,
      internetArchiveIds: [],
      readableSourceLinks: [],
      sourceBadges: [],
      sources: [],
    };

    for (const id of identifiers.slice(0, 3)) {
      const meta = await _fetchMetadataByIdentifier(id);
      if (meta) {
        next.internetArchiveId = next.internetArchiveId || meta.internetArchiveId || id;
        next.internetArchiveIds = Array.from(new Set([...(next.internetArchiveIds || []), ...(meta.internetArchiveIds || []), id].filter(Boolean)));
        if (meta.archiveUrl) next.archiveUrl = next.archiveUrl || meta.archiveUrl;
        if (meta.readableSourceLinks?.length) next.readableSourceLinks = Array.from(new Set([...(next.readableSourceLinks || []), ...meta.readableSourceLinks].filter(Boolean)));
      }
    }

    return next;
  }

  async function _fetchMetadataByIdentifier(identifier) {
    const clean = _normalizeIdentifier(identifier);
    if (!clean) return null;
    const data = await _fetch(`${BASE}/metadata/${encodeURIComponent(clean)}`);
    const archiveUrl = _extractArchiveUrl(data, clean);
    const readableSourceLinks = _extractReadableLinks(data, clean);
    return {
      internetArchiveId: clean,
      internetArchiveIds: [clean],
      archiveUrl,
      readableSourceLinks,
    };
  }

  function _applyArchiveLinks(base, metadata) {
    const archiveUrl = metadata.archiveUrl || _deriveArchiveUrl(base.internetArchiveId || base.ocaid || _firstArchiveId(base.internetArchiveIds));
    const readableLinks = Array.from(new Set([
      ...(Array.isArray(base.readableSourceLinks) ? base.readableSourceLinks : []),
      ...(Array.isArray(metadata.readableSourceLinks) ? metadata.readableSourceLinks : []),
      ...(archiveUrl ? [archiveUrl] : []),
    ].filter(Boolean)));

    const sourceBadges = new Set([...(Array.isArray(base.sourceBadges) ? base.sourceBadges : [])]);
    const sources = new Set([...(Array.isArray(base.sources) ? base.sources : [])]);
    if (archiveUrl) {
      sourceBadges.add('Internet Archive');
      sources.add('Internet Archive');
    }

    return {
      ...base,
      internetArchiveId: base.internetArchiveId || metadata.internetArchiveId || null,
      internetArchiveIds: Array.from(new Set([...(Array.isArray(base.internetArchiveIds) ? base.internetArchiveIds : []), ...(metadata.internetArchiveIds || [])].filter(Boolean))),
      archiveUrl: archiveUrl || base.archiveUrl || null,
      readableSourceLinks: readableLinks,
      sourceBadges: Array.from(sourceBadges),
      sources: Array.from(sources),
    };
  }

  function _extractArchiveUrl(data, fallbackId) {
    const urls = [
      data?.url,
      data?.metadata?.url,
      data?.files?.find(file => /pdf|epub|txt|djvu|mobi/i.test(file?.format || file?.name || ''))?.url,
    ].filter(Boolean);
    return urls[0] || _deriveArchiveUrl(fallbackId);
  }

  function _extractReadableLinks(data, fallbackId) {
    const links = [];
    const add = (value) => {
      const url = String(value || '').trim();
      if (url && !links.includes(url)) links.push(url);
    };
    if (Array.isArray(data?.files)) {
      data.files.forEach((file) => {
        if (!file || typeof file !== 'object') return;
        if (file.url) add(file.url);
      });
    }
    const derived = _deriveArchiveUrl(fallbackId);
    if (derived) add(derived);
    return links;
  }

  function _deriveArchiveUrl(id) {
    const clean = _normalizeIdentifier(id);
    if (!clean) return null;
    return `${BASE}/details/${clean}`;
  }

  function _firstArchiveId(ids) {
    return Array.isArray(ids) && ids.length ? ids[0] : null;
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

  function _normalizeIdentifier(value) {
    const clean = String(value || '').trim();
    if (!clean) return '';
    return clean.replace(/^https?:\/\/archive\.org\/details\//i, '').replace(/^\/+/, '').replace(/\s+/g, '');
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
    enrichBookLinks,
    hadNetworkFailure: () => _lastFetchFailed,
    _collectArchiveIdentifiers,
    _deriveArchiveUrl,
  };
})();
