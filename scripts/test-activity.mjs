import assert from 'node:assert/strict';

const store = new Map();
globalThis.window = globalThis;
globalThis.document = { addEventListener() {}, dispatchEvent() {}, body: { classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} } } };
globalThis.window.dispatchEvent = () => true;
globalThis.window.addEventListener = () => {};
globalThis.window.removeEventListener = () => {};
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  configurable: true,
});
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
  }
};
globalThis.localStorage = {
  getItem(key) { return store.has(key) ? store.get(key) : null; },
  setItem(key, value) { store.set(key, String(value)); },
  removeItem(key) { store.delete(key); },
  clear() { store.clear(); },
};

globalThis.LIBRIQ = {
  VERSION: 'test',
  STATUS: { READING: 'reading', FINISHED: 'finished', WISHLIST: 'wishlist', DNF: 'dnf' },
};
globalThis.createProfile = (data = {}) => ({
  name: data.name || 'Reader',
  avatar: data.avatar || null,
  bio: data.bio || null,
  joinDate: data.joinDate || new Date().toISOString(),
  yearlyGoal: data.yearlyGoal || 12,
  preferredGenres: data.preferredGenres || [],
  theme: data.theme || 'dark',
  streakData: data.streakData || { current: 0, longest: 0, lastRead: null },
});

await import('../frontend/js/storage.js');

const Storage = globalThis.LibriqStorage;
assert.equal(typeof Storage.setActiveAccountUid, 'function');
assert.equal(typeof Storage.addActivityEvent, 'function');

localStorage.clear();
Storage.bootstrap();

localStorage.setItem('libriq:local:activity', JSON.stringify([
  { id: 'act-1', type: 'book_added', timestamp: '2026-07-07T10:00:00Z', bookTitle: 'Old Book' },
  { id: 'act-2', type: 'progress_updated', timestamp: '2026-07-07T11:00:00Z', bookTitle: 'Old Book' },
]));

Storage.setActiveAccountUid('user-1');
const migrated = JSON.parse(localStorage.getItem('libriq:users:user-1:activity'));
assert.equal(Array.isArray(migrated), true);
assert.equal(migrated.length, 2);
assert.equal(migrated[0].id, 'act-1');
assert.equal(migrated[1].id, 'act-2');

Storage.addActivityEvent({
  id: 'act-2',
  type: 'progress_updated',
  timestamp: '2026-07-07T11:00:00Z',
  createdAt: '2026-07-07T11:00:00Z',
  updatedAt: '2026-07-07T11:00:00Z',
  bookTitle: 'Old Book',
});
const afterDuplicate = Storage.getActivityLog();
assert.equal(afterDuplicate.filter(event => event.id === 'act-2').length, 1);

Storage.addActivityEvent({
  id: 'act-3',
  type: 'book_finished',
  timestamp: '2026-07-08T12:00:00Z',
  createdAt: '2026-07-08T12:00:00Z',
  updatedAt: '2026-07-08T12:00:00Z',
  bookTitle: 'New Book',
});
assert.equal(Storage.getActivityLog().some(event => event.id === 'act-3'), true);

console.log('activity persistence test passed');
