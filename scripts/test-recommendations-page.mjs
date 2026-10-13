import assert from 'node:assert/strict';
import { createRecommendationsPage } from '../frontend/js/features/recommendations/recommendationsPage.js';

const listeners = new Map();
let bindings = 0;
const main = { innerHTML: '', addEventListener(type, handler) { bindings++; listeners.set(type, handler); } };
const nodes = new Map(['subjectDiscoveryRoot', 'gutenbergDiscoveryRoot', 'discoverPickCount', 'discoverFilters'].map(id => [id, { innerHTML: '', textContent: '', attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }]));
const saved = { id: 'saved', title: 'Saved <Book>', author: 'Known Author', status: 'wishlist', rating: 5, isFavorite: true, genres: ['Fantasy'], dateAdded: '2026-01-01T00:00:00Z' };
const pick = { id: 'new', title: 'New <Book>', author: 'New Author', coverUrl: 'https://covers.example/new.png', sources: ['openlibrary'], sourceBadges: ['Open Library'], firstPublishYear: 2020, olid: 'OL1W', isbn: '9780000000001' };
let books = [saved];
let online = true;
let failSubjects = false;
let failClassics = false;
let subjectLoader = async () => failSubjects ? Promise.reject(new Error('unavailable')) : [pick, saved, { ...pick }];
let subjectCalls = 0;
let classicCalls = 0;
const calls = [];
const sanitize = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const render = createRecommendationsPage({
  storage: { getBooks: () => books, getBookById: id => books.find(book => book.id === id) || null },
  library: { showDetailsModal: id => calls.push(['details', id]), showAddModal: book => calls.push(['add', book]) },
  bookApi: {
    isSameBook: (left, right) => left.id === right.id || left.olid && left.olid === right.olid,
    buildSourceBadgeData: book => ({ sourceBadges: book.sourceBadges || [], sources: book.sources || [] }),
    searchBySubject: (...args) => { subjectCalls++; assert.deepEqual(args[1], { limit: 6 }); return subjectLoader(); },
    searchCuratedClassics: async options => { classicCalls++; assert.deepEqual(options, { limit: 6, topic: 'classics' }); if (failClassics) throw new Error('unavailable'); return [{ id: 'classic', title: 'A Free Classic', author: 'Classic Author', gutenbergId: 1, sources: ['gutendex'], sourceBadges: ['Project Gutenberg'] }]; },
  },
  utils: { sanitize, formatDisplayName: value => String(value), buildCover: book => '<div class="book-cover">' + sanitize(book.title) + '</div>' },
  constants: { STATUS: { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished' } },
  actions: { isOnline: () => online, openSearch: () => calls.push(['search']), navigate: page => calls.push(['navigate', page]) },
  documentRoot: { getElementById: id => id === 'mainContent' ? main : nodes.get(id) || null },
});
const click = (action, extra = {}) => listeners.get('click')({ target: { closest: () => ({ dataset: { action, ...extra } }) } });
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const pending = render();
assert.match(main.innerHTML, /id="recommendationsPage"/);
assert.match(main.innerHTML, /Your next chapter/);
assert.match(main.innerHTML, /Saved &lt;Book&gt;/);
assert.match(nodes.get('subjectDiscoveryRoot').innerHTML, /Loading subject picks from Open Library/);
assert.match(nodes.get('gutenbergDiscoveryRoot').innerHTML, /Loading free classics/);
await pending;
assert.equal(subjectCalls, 1);
assert.equal(classicCalls, 1);
assert.equal(nodes.get('discoverPickCount').textContent, '02 BOOKS');
assert.equal(nodes.get('subjectDiscoveryRoot').attributes['aria-busy'], 'false');
assert.match(nodes.get('subjectDiscoveryRoot').innerHTML, /New &lt;Book&gt;/);
assert.match(nodes.get('subjectDiscoveryRoot').innerHTML, /Project Gutenberg/);
assert.equal((nodes.get('subjectDiscoveryRoot').innerHTML.match(/data-book-id="new"/g) || []).length, 1);
assert.doesNotMatch(main.innerHTML + nodes.get('subjectDiscoveryRoot').innerHTML, /onclick=|www.figma.com/);
click('open-search');
click('open-library');
click('open-recommendation', { bookId: 'saved', bookSaved: '1' });
click('open-recommendation', { bookId: 'new', bookSaved: '0' });
assert.deepEqual(calls.slice(0, 3), [['search'], ['navigate', 'library'], ['details', 'saved']]);
assert.deepEqual(calls[3], ['add', { ...pick, description: 'No description available yet.', genres: [], subjects: [] }]);
// The live saved record wins over an outdated DOM flag or a different provider ID.
books.push({ ...pick, id: 'saved-alias' });
click('open-recommendation', { bookId: 'new', bookSaved: '0' });
assert.deepEqual(calls.at(-1), ['details', 'saved-alias']);
books = [saved];
click('filter-recommendations', { filter: 'gutenberg-classics' });
assert.match(nodes.get('subjectDiscoveryRoot').innerHTML, /A Free Classic/);
assert.doesNotMatch(nodes.get('subjectDiscoveryRoot').innerHTML, /New &lt;Book&gt;/);
click('filter-recommendations', { filter: 'all' });
click('refresh-recommendations');
await flush();
assert.equal(subjectCalls, 2);
assert.equal(classicCalls, 2);
assert.equal(bindings, 1);
online = false;
await render();
assert.match(nodes.get('subjectDiscoveryRoot').innerHTML, /Connect to the internet/);
assert.match(main.innerHTML, /Saved &lt;Book&gt;/);
assert.equal(subjectCalls, 2);
online = true;
failSubjects = true;
await render();
assert.match(nodes.get('subjectDiscoveryRoot').innerHTML, /A Free Classic/);
failClassics = true;
await render();
assert.match(nodes.get('subjectDiscoveryRoot').innerHTML, /No new picks/);
assert.match(nodes.get('gutenbergDiscoveryRoot').innerHTML, /unavailable/);
// A late provider reply cannot replace a refreshed page or an empty library.
failSubjects = failClassics = false;
let release;
subjectLoader = () => new Promise(resolve => { release = resolve; });
const stale = render();
await flush();
click('filter-recommendations', { filter: 'fantasy' });
assert.match(nodes.get('subjectDiscoveryRoot').innerHTML, /Loading subject picks/);
assert.equal(nodes.get('subjectDiscoveryRoot').attributes['aria-busy'], 'true');
books = [];
await render();
release([pick]);
await stale;
assert.match(main.innerHTML, /Let your shelf lead the way/);
assert.match(main.innerHTML, /00 \/ 03/);
assert.match(main.innerHTML, /data-action="open-search"/);
assert.match(main.innerHTML, /data-action="open-library"/);
assert.doesNotMatch(main.innerHTML, /data-book-id="new"/);
assert.equal(bindings, 1);
console.log('Discover recommendations page tests passed (actions, providers, filtering, refresh, errors, offline, stale responses, empty).');
