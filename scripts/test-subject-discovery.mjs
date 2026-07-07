import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = process.cwd();
const source = fs.readFileSync(path.join(repoRoot, 'frontend/js/navigation.js'), 'utf8');

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
  Utils: {
    formatDisplayName: (value) => String(value || '').replace(/\b\w/g, c => c.toUpperCase()),
    sanitize: (value) => String(value ?? ''),
  },
  BookIdentity: {
    isSameBook: (left, right) => String(left?.title || '').toLowerCase() === String(right?.title || '').toLowerCase(),
  },
  LIBRIQ: {
    STATUS: { READING: 'reading', FINISHED: 'finished', WISHLIST: 'wishlist' },
  },
};
context.window = context;

vm.runInNewContext(
  [
    extract('function _buildSubjectDiscoveryState(books) {', 'function _subjectCandidatesFromBook(book) {'),
    extract('function _subjectCandidatesFromBook(book) {', 'function _filterSubjectDiscoveryBooks(books, savedBooks, limit = 6) {'),
    extract('function _filterSubjectDiscoveryBooks(books, savedBooks, limit = 6) {', 'function buildSubjectDiscoveryRail(rail) {'),
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

const filtered = context._filterSubjectDiscoveryBooks(
  [
    { title: 'Alpha' },
    { title: 'Alpha' },
    { title: 'Beta' },
  ],
  [{ title: 'Beta' }],
  6
);
assert.equal(filtered.length, 1);
assert.equal(filtered[0].title, 'Alpha');

const subjectList = context._subjectCandidatesFromBook({
  subjects: ['Fantasy', 'Fantasy'],
  genres: ['Adventure'],
  isFavorite: true,
});
assert.equal(JSON.stringify(subjectList), JSON.stringify(['Fantasy', 'Adventure']));

console.log('subject discovery test passed');

