import assert from 'node:assert/strict';

const kv = new Map();
const collectionDocs = new Map();

function ensureArray(path) {
  if (!collectionDocs.has(path)) collectionDocs.set(path, []);
  return collectionDocs.get(path);
}

function response(value, ok = true) {
  return {
    ok,
    async json() { return value; },
    async text() { return JSON.stringify(value); },
  };
}

globalThis.window = globalThis;
globalThis.document = {
  body: { classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} } },
  addEventListener() {},
  dispatchEvent() { return true; },
};
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
globalThis.window.dispatchEvent = () => true;
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true, userAgent: 'Mozilla/5.0', platform: 'Win32' },
  configurable: true,
});
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
};
globalThis.location = {
  hostname: 'localhost',
  search: '?libriq_e2e_test_mode=1',
  origin: 'http://127.0.0.1:4173',
};
globalThis.localStorage = {
  getItem(key) { return kv.has(key) ? kv.get(key) : null; },
  setItem(key, value) { kv.set(key, String(value)); },
  removeItem(key) { kv.delete(key); },
  clear() { kv.clear(); },
};
globalThis.fetch = async (url, init = {}) => {
  const parsed = new URL(url);
  if (!parsed.pathname.startsWith('/__libriq_test_api')) throw new Error(`Unexpected URL ${url}`);
  const path = decodeURIComponent(parsed.searchParams.get('path') || '');
  if (parsed.pathname.endsWith('/doc')) {
    if ((init.method || 'GET') === 'PUT') {
      const body = JSON.parse(init.body || '{}');
      kv.set(path, body.data);
      const parts = path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts.at(-1);
      const docs = ensureArray(collectionPath);
      const idx = docs.findIndex(item => item.id === docId);
      const next = { id: docId, ...(body.data || {}) };
      if (idx >= 0) docs[idx] = next;
      else docs.push(next);
      return response({ ok: true });
    }
    if ((init.method || 'GET') === 'DELETE') {
      kv.delete(path);
      const parts = path.split('/');
      const collectionPath = parts.slice(0, -1).join('/');
      const docId = parts.at(-1);
      const docs = ensureArray(collectionPath).filter(item => item.id !== docId);
      collectionDocs.set(collectionPath, docs);
      return response({ ok: true });
    }
    return response(kv.has(path) ? kv.get(path) : null);
  }
  if (parsed.pathname.endsWith('/collection')) {
    return response(ensureArray(path).slice());
  }
  if (parsed.pathname.endsWith('/subscribe')) {
    return {
      ok: true,
      body: {
        getReader() { return { read: async () => ({ done: true, value: null }) }; },
      },
    };
  }
  throw new Error(`Unhandled fetch path ${parsed.pathname}`);
};

globalThis.LIBRIQ = {
  VERSION: 'test',
  STATUS: { READING: 'reading', FINISHED: 'finished', WISHLIST: 'wishlist', DNF: 'dnf' },
};
globalThis.createProfile = (data = {}) => ({ name: data.name || 'Reader', theme: data.theme || 'dark', joinDate: data.joinDate || new Date().toISOString(), yearlyGoal: 12, preferredGenres: [] });
globalThis.createBook = (data = {}) => ({
  id: data.id || `book_${Math.random().toString(36).slice(2, 8)}`,
  title: data.title || 'Unknown Title',
  author: data.author || 'Unknown Author',
  coverUrl: data.coverUrl || null,
  pageCount: data.pageCount || 0,
  publishYear: data.publishYear || null,
  publisher: data.publisher || null,
  description: data.description || null,
  genres: Array.isArray(data.genres) ? data.genres : [],
  language: data.language || 'English',
  status: data.status || LIBRIQ.STATUS.WISHLIST,
  dateAdded: data.dateAdded || new Date().toISOString(),
  dateStarted: data.dateStarted || null,
  dateFinished: data.dateFinished || null,
  createdAt: data.createdAt || data.dateAdded || new Date().toISOString(),
  updatedAt: data.updatedAt || data.createdAt || data.dateAdded || new Date().toISOString(),
  currentPage: data.currentPage || 0,
  rating: data.rating ?? null,
  review: data.review || null,
  isFavorite: Boolean(data.isFavorite),
  tags: Array.isArray(data.tags) ? data.tags : [],
  notes: data.notes ?? '',
  quotes: Array.isArray(data.quotes) ? data.quotes : [],
  source: data.source || 'api',
  googleBooksId: data.googleBooksId || null,
  openLibraryId: data.openLibraryId || null,
  gutendexId: data.gutendexId || null,
  gutenbergId: data.gutenbergId || null,
  internetArchiveId: data.internetArchiveId || null,
  internetArchiveIds: Array.isArray(data.internetArchiveIds) ? data.internetArchiveIds : [],
  archiveUrl: data.archiveUrl || null,
  readableSourceLinks: Array.isArray(data.readableSourceLinks) ? data.readableSourceLinks : [],
});
globalThis.Utils = {
  toast() {},
  sanitize: value => String(value ?? ''),
  readingProgress: () => 0,
  formatDate: value => String(value ?? ''),
  formatNumber: value => String(value ?? ''),
  buildCover: () => ({ outerHTML: '<div></div>' }),
  buildStars: () => '',
  statusBadgeClass: () => '',
  statusLabel: () => '',
  show() {},
  hide() {},
  capitalize: value => String(value ?? ''),
  debounce: fn => fn,
  $$: () => [],
};
globalThis.Navigation = {
  updateBadges() {},
  renderCurrentPage() {},
};
globalThis.Storage = globalThis.Storage || {};

localStorage.setItem('libriq_e2e_test_uid', 'sync-user');
localStorage.setItem('libriq_e2e_test_email', 'sync@example.com');
localStorage.setItem('libriq_e2e_test_display_name', 'Sync User');

await import('../frontend/js/storage.js');
await import('../frontend/js/firebase-client.js');
globalThis.Storage = globalThis.LibriqStorage;
await import('../frontend/js/library.js');

const Storage = globalThis.LibriqStorage;
const Firebase = globalThis.LibriqFirebase;
const Library = globalThis.Library;

Storage.bootstrap();
assert.equal(Storage.getActivityLog().length, 0);

const queued = [];
Firebase.queueActivitySync = (event) => {
  queued.push(event);
  return true;
};

const book = Storage.addBook({
  id: 'book-100',
  title: 'Cloud Book',
  author: 'Cloud Author',
  status: 'wishlist',
  currentPage: 0,
  pageCount: 100,
});

Library.setStatus(book.id, 'reading');
assert.equal(queued.length >= 1, true, 'library actions should queue cloud activity sync');

const activityEntry = Storage.buildActivityEvent('book_added', { id: 'book-100', title: 'Cloud Book', author: 'Cloud Author' }, {}, 'api');
assert.ok(activityEntry.id);
await Firebase.writeActivityEvent('sync-user', activityEntry);
const remoteDoc = kv.get('users/sync-user/activity/' + activityEntry.id);
assert.equal(remoteDoc.bookTitle, 'Cloud Book');

kv.set('users/sync-user/activity/old-1', { id: 'old-1', type: 'progress_updated', timestamp: '2026-07-07T00:00:00Z', bookTitle: 'Old Cloud Book' });
collectionDocs.set('users/sync-user/activity', [
  { id: 'old-1', type: 'progress_updated', timestamp: '2026-07-07T00:00:00Z', bookTitle: 'Old Cloud Book' },
  { id: 'new-1', type: 'book_finished', timestamp: '2026-07-08T00:00:00Z', bookTitle: 'New Cloud Book' },
]);

Storage.replaceActivityLog([]);
const merged = await Firebase.syncActivityFromCloud('sync-user');
assert.equal(merged.length >= 2, true);
assert.equal(Storage.getActivityLog().some(event => event.id === 'new-1'), true);

console.log('activity sync cloud test passed');
