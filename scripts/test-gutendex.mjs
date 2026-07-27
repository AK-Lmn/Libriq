import assert from 'node:assert/strict';
import { GutendexAPI } from '../frontend/js/api/gutendex.js';

Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.fetch = async () => ({
  ok: true,
  async json() {
    return { results: [{
      id: 123, title: 'Pride and Prejudice', authors: [{ name: 'Jane Austen' }],
      formats: { 'text/html': 'https://www.gutenberg.org/ebooks/123.html.images' },
      bookshelves: ['Classic Fiction'], languages: ['en'],
      summaries: ['A classic novel about manners and marriage.'],
    }] };
  },
});

const results = await GutendexAPI.searchCuratedClassics({ limit: 3, topic: 'classics' });
assert.equal(results.length, 1);
assert.equal(results[0].source, 'gutenberg');
assert.equal(results[0].gutendexId, '123');
assert.ok(results[0].sourceBadges.includes('Project Gutenberg'));
assert.ok(results[0].readableSourceLinks[0].includes('gutenberg.org'));

globalThis.navigator.onLine = false;
assert.deepEqual(await GutendexAPI.searchCuratedClassics({ limit: 3 }), []);

console.log('gutendex test passed');
