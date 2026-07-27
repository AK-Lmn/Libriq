import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const navigationPath = path.join(root, 'frontend/js/navigation.js');
const htmlPath = path.join(root, 'frontend/index.html');
const source = fs.readFileSync(navigationPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function extract(startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start);
  if (start === -1 || end === -1) throw new Error(`Could not extract ${startToken}`);
  return source.slice(start, end);
}

assert.equal(/gemini/i.test(source), false);
assert.equal(/geminiClient\.js/i.test(html), false);
assert.equal(/\/api\/gemini/i.test(source + html), false);
assert.equal(packageJson.dependencies?.['firebase-admin'], undefined);
assert.equal(fs.existsSync(path.join(root, 'frontend/js/api/geminiClient.js')), false);
assert.equal(fs.existsSync(path.join(root, 'api/gemini/recommendations.js')), false);
assert.match(source, /BookAPI\.searchBySubject/);
assert.match(source, /BookAPI\.searchCuratedClassics/);

const context = {
  LIBRIQ: { STATUS: { READING: 'reading', FINISHED: 'finished', WISHLIST: 'wishlist' } },
  Date,
  Map,
};
vm.runInNewContext(
  extract('function _buildRecommendationState(books) {', 'function renderProfilePage() {'),
  context,
  { filename: 'navigation-recommendations-snippet.js' },
);

assert.deepEqual(
  JSON.parse(JSON.stringify(context._buildRecommendationState([]))),
  { hasSignal: false, groups: [] },
);

const localState = context._buildRecommendationState([
  { id: '1', title: 'Dune', author: 'Frank Herbert', genres: ['Science Fiction'], rating: 5, isFavorite: true, status: 'finished' },
  { id: '2', title: 'Dune Messiah', author: 'Frank Herbert', genres: ['Science Fiction'], status: 'wishlist' },
  { id: '3', title: 'Neuromancer', author: 'William Gibson', genres: ['Science Fiction'], rating: 4, status: 'reading' },
]);
assert.equal(localState.hasSignal, true);
assert.ok(localState.groups.some(group => group.books.length > 0));

context.BookAPI = { buildSourceBadgeData: () => ({}) };
context.window = context;
context.globalThis = context.window;
context.Storage = { getBookById: id => id === 'saved' ? { id } : null };
context.Library = {};
context.Utils = {
  sanitize: value => String(value ?? ''),
  statusLabel: status => status,
  statusBadgeClass: () => 'badge-status',
  buildCover: () => '<span>cover</span>',
};
const savedCard = context.buildRecommendationCard({ id: 'saved', title: 'Saved', author: 'Author', status: 'reading' }, '');
const addableCard = context.buildRecommendationCard({ id: 'new', title: 'New', author: 'Author' }, '');
assert.match(savedCard, /Library\.showDetailsModal/);
assert.match(addableCard, /Library\.showAddModal/);
assert.match(addableCard, /Add to Library/);

console.log('recommendations regression test passed');
