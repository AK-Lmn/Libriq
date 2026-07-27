import assert from 'node:assert/strict';
import { NormalizeBook } from '../frontend/js/api/normalizeBook.js';
import { OpenLibraryAPI } from '../frontend/js/api/openLibrary.js';

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const responses = new Map([
  ['https://openlibrary.org/works/OL123W.json', {
    key: '/works/OL123W', description: 'A richly detailed fantasy adventure through Middle-earth.',
    subjects: ['Fantasy', 'Adventure'], subject_places: ['Middle-earth'],
    subject_people: ['Bilbo Baggins'], subject_times: ['Third Age'], covers: [12345],
  }],
  ['https://openlibrary.org/works/OL123W/editions.json?limit=20', { entries: [{ key: '/books/OL1M', covers: [12345] }] }],
  ['https://openlibrary.org/authors/OL1A.json', { key: '/authors/OL1A', name: 'J. R. R. Tolkien' }],
]);
globalThis.fetch = async (url) => {
  const parsed = new URL(String(url));
  parsed.searchParams.delete('_ts');
  const value = responses.get(parsed.toString().replace(/\?$/, ''));
  return { ok: Boolean(value), status: value ? 200 : 404, async json() { return value || null; } };
};

const normalized = NormalizeBook.fromOpenLibrary({
  key: '/works/OL123W', title: 'Sample Book', author_name: ['J. R. R. Tolkien'],
  author_key: ['authors/OL1A'], cover_i: 12345, cover_edition_key: 'OL1M',
  first_publish_year: 1937, edition_count: 7, subject: ['Fantasy', 'Adventure'],
  subject_places: ['Middle-earth'], subject_people: ['Bilbo Baggins'],
  subject_times: ['Third Age'], isbn: ['9780000000000'],
});
assert.equal(normalized.openLibraryWorkKey, '/works/OL123W');
assert.deepEqual(normalized.subjectPlaces, ['Middle-earth']);

const enriched = await OpenLibraryAPI.enrichBook({ ...normalized, coverUrl: null, subjects: [] });
assert.ok(enriched.coverUrl.includes('covers.openlibrary.org'));
assert.ok(enriched.subjects.includes('Fantasy'));
assert.ok(enriched.subjectPlaces.includes('Middle-earth'));
assert.ok(NormalizeBook.isUsefulDescription(enriched.description));

const legacy = await OpenLibraryAPI.enrichBook({ title: 'Legacy Book' });
assert.equal(legacy.title, 'Legacy Book');
assert.doesNotThrow(() => OpenLibraryAPI.enrichBook(null));

console.log('open library enrichment test passed');
