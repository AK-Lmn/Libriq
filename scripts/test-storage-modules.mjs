import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries.map(([key, value]) => [key, String(value)]));
    this.reads = 0;
    this.writes = 0;
    this.removes = 0;
  }

  getItem(key) {
    this.reads += 1;
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.writes += 1;
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.removes += 1;
    this.values.delete(key);
  }
}

let importSequence = 0;
async function importFresh() {
  importSequence += 1;
  return import(`../frontend/js/storage.js?storage-test=${importSequence}`);
}

function installBrowserFixture(storage) {
  const events = [];
  globalThis.localStorage = storage;
  globalThis.window = {
    dispatchEvent(event) {
      events.push(event);
      return true;
    },
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  return events;
}

const source = await readFile(new URL('../frontend/js/storage.js', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../frontend/js/app.js', import.meta.url), 'utf8');
const appModulesSource = await readFile(new URL('../frontend/js/appModules.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../frontend/index.html', import.meta.url), 'utf8');

let storageAccesses = 0;
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  get() {
    storageAccesses += 1;
    throw new Error('Storage import accessed localStorage');
  },
});
const globalsBeforeImport = new Set(Reflect.ownKeys(globalThis));
const { Storage: importSafeStorage } = await importFresh();
const globalsAddedByImport = Reflect.ownKeys(globalThis).filter(key => !globalsBeforeImport.has(key));
delete globalThis.localStorage;
assert.equal(storageAccesses, 0);
assert.deepEqual(globalsAddedByImport, []);
assert.equal(globalThis.Storage, undefined);
assert.equal(globalThis.LibriqStorage, undefined);
assert.equal(typeof importSafeStorage.bootstrap, 'function');

const publicMethods = [
  'bootstrap', 'resetAll',
  'getActiveAccountUid', 'setActiveAccountUid', 'clearActiveAccountScope', 'clearAccountScopedData',
  'getBooks', 'saveBooks', 'addBook', 'updateBook', 'removeBook',
  'getBookById', 'getBooksByStatus', 'toggleFavorite',
  'getProfile', 'saveProfile',
  'getBackupMeta', 'saveBackupMeta',
  'getCloudBackupMeta', 'saveCloudBackupMeta',
  'getSyncMeta', 'saveSyncMeta', 'clearSyncMeta',
  'getSyncTombstones', 'saveSyncTombstones',
  'getDeviceId', 'getSyncReadiness',
  'getGoals', 'saveGoals',
  'getStreak', 'updateStreak', 'saveStreak',
  'getActivityLog', 'addActivityEvent', 'clearActivityLog', 'buildActivityEvent', 'setActivityLog', 'replaceActivityLog',
  'getStats',
];
assert.deepEqual(Object.keys(importSafeStorage), publicMethods);

const freshStore = new MemoryStorage();
const freshEvents = installBrowserFixture(freshStore);
const { Storage: freshStorage } = await importFresh();
freshStorage.bootstrap();
const writesAfterFirstBoot = freshStore.writes;
freshStorage.bootstrap();
assert.equal(freshStore.writes, writesAfterFirstBoot);
assert.equal(freshEvents.length, 0);
assert.ok(freshStore.getItem('libriq_installed'));
assert.ok(freshStore.getItem('libriq_device_id'));
for (const key of ['books', 'profile', 'streak', 'goals', 'activity', 'backup_meta', 'cloud_backup_meta']) {
  assert.notEqual(freshStore.getItem(`libriq:local:${key}`), null);
}

const returningBook = { id: 'existing', title: 'Existing', author: 'Reader', status: 'reading' };
const returningStore = new MemoryStorage([
  ['libriq_installed', '2025-01-01T00:00:00.000Z'],
  ['libriq_device_id', 'stable-device'],
  ['libriq:local:books', JSON.stringify([returningBook])],
]);
installBrowserFixture(returningStore);
const { Storage: returningStorage } = await importFresh();
returningStorage.bootstrap();
assert.deepEqual(returningStorage.getBooks(), [returningBook]);
assert.equal(returningStorage.getDeviceId(), 'stable-device');

const accountBook = { id: 'account-book', title: 'Account', author: 'Reader', status: 'finished' };
const accountStore = new MemoryStorage([
  ['libriq_installed', '2025-01-01T00:00:00.000Z'],
  ['libriq_active_account_uid', 'account-a'],
  ['libriq:users:account-a:books', JSON.stringify([accountBook])],
]);
installBrowserFixture(accountStore);
const { Storage: accountStorage } = await importFresh();
accountStorage.bootstrap();
assert.equal(accountStorage.getActiveAccountUid(), 'account-a');
assert.deepEqual(accountStorage.getBooks(), [accountBook]);
assert.equal(accountStore.getItem('libriq:local:profile'), null);
assert.notEqual(accountStore.getItem('libriq:users:account-a:profile'), null);

accountStorage.setActiveAccountUid('account-b');
assert.deepEqual(accountStorage.getBooks(), []);
accountStorage.addBook({ id: 'account-b-book', title: 'B', author: 'Reader' });
accountStorage.setActiveAccountUid('account-a');
assert.deepEqual(accountStorage.getBooks().map(book => book.id), ['account-book']);
accountStorage.clearActiveAccountScope();
assert.equal(accountStorage.getActiveAccountUid(), null);
assert.deepEqual(accountStorage.getBooks(), []);

const legacyBooks = [{ id: 'legacy', title: 'Legacy', author: 'Reader', status: 'wishlist' }];
const legacyStore = new MemoryStorage([
  ['libriq_installed', '2025-01-01T00:00:00.000Z'],
  ['libriq_books', JSON.stringify(legacyBooks)],
  ['libriq_profile', JSON.stringify({ name: 'Legacy Reader', theme: 'light' })],
]);
installBrowserFixture(legacyStore);
const { Storage: legacyStorage } = await importFresh();
legacyStorage.bootstrap();
assert.deepEqual(legacyStorage.getBooks(), legacyBooks);
assert.equal(legacyStorage.getProfile().name, 'Reader');
assert.equal(JSON.parse(legacyStore.getItem('libriq:local:profile')).name, 'Legacy Reader');
assert.equal(legacyStore.getItem('libriq:local:books'), JSON.stringify(legacyBooks));

const malformedStore = new MemoryStorage([
  ['libriq_installed', '2025-01-01T00:00:00.000Z'],
  ['libriq:local:books', '{bad-json'],
  ['libriq:local:profile', 'null'],
  ['libriq:local:goals', JSON.stringify({ yearly: 'bad' })],
]);
installBrowserFixture(malformedStore);
const originalWarn = console.warn;
console.warn = () => {};
const { Storage: malformedStorage } = await importFresh();
malformedStorage.bootstrap();
console.warn = originalWarn;
assert.deepEqual(malformedStorage.getBooks(), []);
assert.equal(malformedStorage.getProfile().name, 'Reader');
assert.equal(malformedStorage.getGoals().yearly, 12);

const behaviorStore = new MemoryStorage();
const behaviorEvents = installBrowserFixture(behaviorStore);
const { Storage: behaviorStorage } = await importFresh();
behaviorStorage.bootstrap();
behaviorEvents.length = 0;
const added = behaviorStorage.addBook({
  id: 'book-1',
  title: 'Module Book',
  author: 'Reader',
  status: 'reading',
  currentPage: 10,
  rating: 3,
  notes: 'note',
  quotes: [{ id: 'quote-1', text: 'quote', page: 4 }],
  tags: ['tag'],
  shelves: ['shelf'],
});
assert.equal(added.id, 'book-1');
assert.deepEqual(behaviorEvents.map(event => event.type), ['libriq:book:added']);
const updated = behaviorStorage.updateBook('book-1', {
  currentPage: 50,
  status: 'finished',
  rating: 5,
  isFavorite: true,
  notes: 'updated',
  quotes: [{ id: 'quote-1', text: 'quote', page: 5 }],
  tags: ['updated-tag'],
  shelves: ['updated-shelf'],
});
assert.equal(updated.currentPage, 50);
assert.equal(behaviorStorage.toggleFavorite('book-1').isFavorite, false);
assert.equal(behaviorStorage.getBooksByStatus('finished').length, 1);
behaviorStorage.removeBook('book-1');
assert.deepEqual(behaviorEvents.map(event => event.type), [
  'libriq:book:added',
  'libriq:book:updated',
  'libriq:book:updated',
  'libriq:book:removed',
]);

behaviorEvents.length = 0;
const savedProfile = behaviorStorage.saveProfile({ name: 'Profile Reader', bio: 'Bio' });
assert.equal(savedProfile.displayName, 'Profile Reader');
assert.equal(behaviorStorage.saveGoals({ yearly: 24, year: 2026 }), true);
assert.equal(behaviorStorage.saveStreak({ current: 4, longest: 8, lastRead: '2026-01-01T00:00:00.000Z' }), true);
assert.deepEqual(behaviorEvents.map(event => event.type), [
  'libriq:profile:updated',
  'libriq:goals:updated',
  'libriq:streak:updated',
]);

const activity = Array.from({ length: 505 }, (_, index) => ({
  id: `activity-${index}`,
  type: 'progress_updated',
  timestamp: new Date(2026, 0, 1, 0, index).toISOString(),
}));
behaviorStorage.replaceActivityLog(activity);
assert.equal(behaviorStorage.getActivityLog().length, 500);
const duplicate = behaviorStorage.addActivityEvent(behaviorStorage.getActivityLog()[0]);
assert.equal(behaviorStorage.getActivityLog().length, 500);
assert.equal(duplicate.id, behaviorStorage.getActivityLog()[0].id);
behaviorStorage.clearActivityLog();
assert.deepEqual(behaviorStorage.getActivityLog(), []);

const syncMeta = behaviorStorage.saveSyncMeta({
  pending: true,
  pendingBookIds: 'invalid',
  pendingDeleteIds: ['deleted-book'],
  lastError: 'offline',
});
assert.deepEqual(syncMeta.pendingBookIds, []);
assert.deepEqual(syncMeta.pendingDeleteIds, ['deleted-book']);
assert.equal(behaviorStorage.getSyncMeta().lastError, 'offline');
assert.deepEqual(behaviorStorage.saveSyncTombstones({
  'deleted-book': { deletedAt: '2026-01-01T00:00:00.000Z' },
}), {
  'deleted-book': { deletedAt: '2026-01-01T00:00:00.000Z' },
});
assert.equal(behaviorStorage.saveBackupMeta({ lastExportedAt: 'exported' }).lastExportedAt, 'exported');
assert.equal(behaviorStorage.saveCloudBackupMeta({ lastCloudBackupAt: 'backed-up' }).lastCloudBackupAt, 'backed-up');

behaviorStorage.setActiveAccountUid('reset-user');
behaviorStorage.addBook({ id: 'reset-book', title: 'Reset', author: 'Reader' });
behaviorEvents.length = 0;
behaviorStorage.resetAll();
assert.deepEqual(behaviorStorage.getBooks(), []);
assert.deepEqual(behaviorEvents.map(event => event.type), ['libriq:reset']);

assert.match(source, /import\s*\{[\s\S]*LIBRIQ[\s\S]*createBook[\s\S]*createProfile[\s\S]*SEED_BOOKS[\s\S]*\}\s*from\s*['"]\.\/data\.js['"]/);
assert.match(source, /export const Storage\s*=/);
assert.doesNotMatch(source, /window\.(?:Storage|LibriqStorage)\s*=/);
assert.doesNotMatch(source, /let activeUid\s*=\s*localStorage/);
assert.match(appSource, /import\s*\{\s*Storage\s*\}\s*from\s*['"]\.\/storage\.js['"]/);
assert.match(appSource, /Storage\.bootstrap\(\)/);
assert.doesNotMatch(appModulesSource, /loadClassicScript\(['"]\.\/storage\.js['"]\)/);
assert.doesNotMatch(appModulesSource, /loadClassicScript\(['"]\.\/utils\.js['"]\)/);
assert.match(appModulesSource, /window\.LibriqStorage\s*=\s*Storage/);
assert.doesNotMatch(indexSource, /<script[^>]+src=["']js\/storage\.js["']/);

for (const file of [
  'app.js', 'library.js', 'dashboard.js', 'navigation.js', 'search.js',
  'sync.js', 'firebase-client.js', 'cloudBackup.js',
]) {
  const consumerSource = await readFile(new URL(`../frontend/js/${file}`, import.meta.url), 'utf8');
  assert.match(consumerSource, /import\s*\{\s*Storage\s*\}\s*from\s*['"]\.\/storage\.js['"]/);
  assert.doesNotMatch(consumerSource, /(?:window|globalThis)\.(?:Storage|LibriqStorage)/);
}

console.log('Storage module tests passed.');
