import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRecommendationsPage } from '../frontend/js/features/recommendations/recommendationsPage.js';

const repoRoot = process.cwd();
const source = fs.readFileSync(path.join(repoRoot, 'frontend/js/features/recommendations/recommendationsPage.js'), 'utf8');

function extract(startToken, endToken) {
  const start = source.indexOf(startToken);
  if (start === -1) throw new Error(`Missing ${startToken}`);
  const end = source.indexOf(endToken, start);
  if (end === -1) throw new Error(`Missing ${endToken}`);
  return source.slice(start, end);
}

const context = {
  console,
  window: null,
  document: { getElementById: () => null },
  navigator: { onLine: true },
  utils: {
    formatDisplayName: (value) => String(value || '').replace(/\b\w/g, c => c.toUpperCase()),
    sanitize: (value) => String(value ?? ''),
  },
  bookApi: {
    isSameBook: (left, right) => String(left?.title || '').toLowerCase() === String(right?.title || '').toLowerCase(),
  },
  constants: {
    STATUS: { READING: 'reading', FINISHED: 'finished', WISHLIST: 'wishlist' },
  },
};
context.window = context;

vm.runInNewContext(
  [
    extract('function _buildSubjectDiscoveryState(books) {', 'function _subjectCandidatesFromBook(book) {'),
    extract('function _subjectCandidatesFromBook(book) {', 'function _buildRecommendationState(books) {'),
  ].join('\n'),
  context,
  { filename: 'navigation-subject-snippet.js' }
);

const fallbackRails = context._buildSubjectDiscoveryState([]).rails.map(rail => rail.subjectKey);
assert.equal(JSON.stringify(fallbackRails), JSON.stringify(['fiction', 'fantasy', 'romance']));

const selectedRails = context._buildSubjectDiscoveryState([
  { genres: ['Mystery', 'Classics'], isFavorite: true, rating: 5 },
  { subjects: ['Science Fiction'], status: 'finished' },
]).rails.map(rail => rail.subjectKey);
assert.ok(selectedRails.includes('mystery'));
assert.ok(selectedRails.includes('science fiction'));

const main = { innerHTML: '', addEventListener() {} };
const nodes = new Map(['subjectDiscoveryRoot', 'gutenbergDiscoveryRoot', 'discoverFilters', 'discoverPickCount'].map(id => [id, { innerHTML: '', setAttribute() {} }]));
const saved = { id: 'beta', title: 'Beta', author: 'Author', genres: ['Fiction'], isFavorite: true };
const render = createRecommendationsPage({
  storage: { getBooks: () => [saved], getBookById: () => null },
  library: {}, constants: context.constants,
  utils: { ...context.utils, buildCover: () => '' },
  bookApi: {
    ...context.bookApi, buildSourceBadgeData: () => ({}),
    searchBySubject: async (subject, options) => {
      assert.equal(options.limit, 6);
      return [{ id: 'alpha', title: 'Alpha', author: 'Author' }, { id: 'alpha-copy', title: 'Alpha', author: 'Author' }, saved];
    },
    searchCuratedClassics: async () => [],
  },
  actions: { isOnline: () => true },
  documentRoot: { getElementById: id => id === 'mainContent' ? main : nodes.get(id) || null },
});
await render();
const filtered = nodes.get('subjectDiscoveryRoot').innerHTML;
assert.equal((filtered.match(/data-action="open-recommendation"/g) || []).length, 1);
assert.match(filtered, /Alpha/);
assert.doesNotMatch(filtered, /Beta/);

const subjectList = context._subjectCandidatesFromBook({
  subjects: ['Fantasy', 'Fantasy'],
  genres: ['Adventure'],
  isFavorite: true,
});
assert.equal(JSON.stringify(subjectList), JSON.stringify(['Fantasy', 'Adventure']));

console.log('subject discovery test passed');
