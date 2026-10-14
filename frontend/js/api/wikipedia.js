import { NormalizeBook } from './normalizeBook.js';
import { fetchJson } from '../shared/fetchClient.js';

export const WikipediaAPI = (() => {
  const SUMMARY_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary';
  const SEARCH_BASE = 'https://en.wikipedia.org/w/api.php';
  const TIMEOUT_MS = 6000;

  function _cleanTitle(title) {
    return String(title || '')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\s*\[[^\]]*\]/g, '')
      .replace(/:\s*.*$/, '')
      .replace(/-\s*.*$/, '')
      .trim();
  }

  async function fetchSummaryByTitle(pageTitle) {
    if (!pageTitle) return null;
    const clean = String(pageTitle).trim().replace(/\s+/g, '_');
    if (!clean) return null;

    try {
      const data = await fetchJson(`${SUMMARY_BASE}/${encodeURIComponent(clean)}`, {
        timeoutMs: TIMEOUT_MS,
        retries: 1,
      });

      if (!data || data.type === 'disambiguation') return null;

      const extract = NormalizeBook.normalizeDescriptionText(data.extract);
      if (!NormalizeBook.isUsefulDescription(extract)) return null;

      return {
        title: data.title || pageTitle,
        description: extract,
        descriptionSource: 'wikipedia',
        wikipediaUrl: data.content_urls?.desktop?.page || null,
      };
    } catch {
      return null;
    }
  }

  async function findBookDescription(book) {
    if (!book || !book.title) return null;
    const title = _cleanTitle(book.title);
    if (!title) return null;

    const author = String(book.author || '').trim();

    // 1. Try direct page titles first
    const directCandidates = [
      `${title} (novel)`,
      `${title} (book)`,
      title,
    ];
    if (author && author !== 'Unknown Author') {
      const lastName = author.split(/\s+/).pop();
      directCandidates.unshift(`${title} (${lastName} novel)`);
      directCandidates.unshift(`${title} (${lastName} book)`);
    }

    for (const candidate of directCandidates) {
      const summary = await fetchSummaryByTitle(candidate);
      if (summary?.description) {
        return summary;
      }
    }

    // 2. Fall back to Wikipedia Search
    try {
      const searchQuery = `${title} ${author !== 'Unknown Author' ? author : ''} book`.trim();
      const params = new URLSearchParams({
        action: 'query',
        list: 'search',
        srsearch: searchQuery,
        srlimit: '3',
        format: 'json',
        origin: '*',
      });

      const searchData = await fetchJson(`${SEARCH_BASE}?${params}`, {
        timeoutMs: TIMEOUT_MS,
        retries: 0,
      });

      const results = searchData?.query?.search;
      if (!Array.isArray(results) || results.length === 0) return null;

      for (const result of results) {
        if (!result.title) continue;
        const summary = await fetchSummaryByTitle(result.title);
        if (summary?.description) {
          return summary;
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  return {
    fetchSummaryByTitle,
    findBookDescription,
  };
})();
