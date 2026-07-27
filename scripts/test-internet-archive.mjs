import assert from 'node:assert/strict';
import { InternetArchiveAPI } from '../frontend/js/api/internetArchive.js';

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.fetch = async () => ({
  ok: true,
  async json() {
    return {
      metadata: { identifier: 'ia-test-book' },
      files: [{ name: 'book.pdf', format: 'PDF', url: 'https://archive.org/download/ia-test-book/book.pdf' }],
    };
  },
});

const identifiers = InternetArchiveAPI._collectArchiveIdentifiers({
  internetArchiveId: '  ia-test-book  ',
  internetArchiveIds: ['ia-test-book', 'archive-test'],
  sourceIds: { archive: 'ia-test-book' },
});
assert.deepEqual(identifiers, ['ia-test-book', 'archive-test']);
assert.equal(InternetArchiveAPI._deriveArchiveUrl('ia-test-book'), 'https://archive.org/details/ia-test-book');

const enriched = await InternetArchiveAPI.enrichBookLinks({
  title: 'Legacy Book', internetArchiveId: 'ia-test-book', readableSourceLinks: [],
});
assert.ok(enriched.archiveUrl.includes('archive.org'));
assert.ok(enriched.sourceBadges.includes('Internet Archive'));

globalThis.navigator.onLine = false;
const offline = await InternetArchiveAPI.enrichBookLinks({ title: 'Offline Book', internetArchiveId: 'ia-test-book' });
assert.equal(offline.title, 'Offline Book');
assert.equal(offline.archiveUrl, undefined);

console.log('internet archive test passed');
