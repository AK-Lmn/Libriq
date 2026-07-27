import assert from 'node:assert/strict';
import fs from 'node:fs';

let fetchCalls = 0;
let timerCalls = 0;
let storageReads = 0;
globalThis.fetch = async () => { fetchCalls += 1; throw new Error('Cloud Backup import must not fetch'); };
const nativeSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => { timerCalls += 1; return nativeSetTimeout(...args); };

const { LibriqCloudBackup } = await import('../frontend/js/cloudBackup.js');
assert.equal(fetchCalls, 0);
assert.equal(timerCalls, 0);
assert.equal(globalThis.LibriqCloudBackup, undefined);

globalThis.window = globalThis;
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};
globalThis.document = { body: { classList: { contains: () => false } } };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.localStorage = { getItem: () => null };
globalThis.LIBRIQ = { VERSION: 'test' };
globalThis.Utils = { formatDate: value => String(value), toast() {} };
globalThis.createProfile = () => ({ name: '' });
globalThis.createBook = book => ({ ...book });
const saved = {
  books: [{ id: 'local', title: 'Local', author: 'Reader', notes: '', quotes: [] }],
  profile: { name: 'Reader' },
  goals: { yearly: 12 },
  streak: { current: 2 },
  activity: [{ id: 'a1', type: 'book_added', timestamp: '2026-01-01T00:00:00Z' }],
};
globalThis.Storage = {
  getBooks: () => { storageReads += 1; return saved.books; },
  getProfile: () => saved.profile,
  getGoals: () => saved.goals,
  getStreak: () => saved.streak,
  getActivityLog: () => saved.activity,
  getDeviceId: () => 'device-test',
  saveBooks: books => { saved.books = books; },
  saveProfile: profile => { saved.profile = profile; },
  saveGoals: goals => { saved.goals = goals; },
  saveStreak: streak => { saved.streak = streak; },
  replaceActivityLog: activity => { saved.activity = activity; },
  saveCloudBackupMeta: meta => { saved.meta = meta; },
  buildActivityEvent: () => null,
  addActivityEvent() {},
};

const { LibriqFirebase } = await import('../frontend/js/firebase-client.js');
let writes = [];
Object.assign(LibriqFirebase, {
  getState: () => ({ available: true, ready: true, user: { uid: 'user-a' } }),
  getCurrentUser: () => ({ uid: 'user-a' }),
  hasFirestore: () => true,
  writeBackupDoc: async (path, data) => { writes.push({ path, data }); },
});

LibriqCloudBackup.init({
  getSessionPreference: () => 'account',
  getCurrentPage: () => 'dashboard',
  getSyncState: () => ({ enabled: false, status: 'off' }),
});
LibriqCloudBackup.init();
assert.equal(storageReads, 0);

assert.equal(await LibriqCloudBackup.runBackup('manual', false), true);
assert.deepEqual(writes[0].path, ['users', 'user-a', 'backups', 'current']);
assert.equal(writes[0].data.backupVersion, 4);
assert.deepEqual(writes[0].data.data.profile, { name: 'Reader' });
assert.deepEqual(writes[0].data.data.goals, { yearly: 12 });
assert.deepEqual(writes[0].data.data.streak, { current: 2 });
assert.equal(writes[0].data.data.activity.length, 1);

const malformed = LibriqCloudBackup.normalizeBackup({ app: 'Other', data: { books: [] } });
assert.equal(malformed, null);
const backup = LibriqCloudBackup.normalizeBackup({
  app: 'LibriQ',
  updatedAt: '2026-02-01T00:00:00Z',
  data: {
    books: [{ id: 'cloud', title: 'Cloud', author: 'Reader', notes: 'note', quotes: [] }],
    profile: { name: 'Cloud Reader' },
    goals: { yearly: 20 },
    streak: { current: 5 },
    activity: [{ id: 'a2', timestamp: '2026-02-01T00:00:00Z' }],
  },
});
const beforePreview = JSON.stringify(saved);
const plan = LibriqCloudBackup.previewMerge(backup);
assert.equal(plan.newBooksToAdd.length, 1);
assert.equal(JSON.stringify(saved), beforePreview);
assert.equal(LibriqCloudBackup.applyMerge(backup, plan).ok, true);
assert.equal(saved.books.some(book => book.id === 'cloud'), true);
assert.equal(LibriqCloudBackup.applyRestore(backup).ok, true);
assert.deepEqual(saved.books.map(book => book.id), ['cloud']);
assert.equal(saved.profile.name, 'Cloud Reader');

const source = fs.readFileSync('frontend/js/cloudBackup.js', 'utf8');
assert.match(source, /export const LibriqCloudBackup/);
assert.doesNotMatch(source, /window\.LibriqCloudBackup\s*=/);
assert.doesNotMatch(source, /import \{ Navigation \}/);
const app = fs.readFileSync('frontend/js/app.js', 'utf8');
const navigation = fs.readFileSync('frontend/js/navigation.js', 'utf8');
assert.ok(app.includes("import { LibriqCloudBackup } from './cloudBackup.js';"));
assert.ok(navigation.includes("import { LibriqCloudBackup } from './cloudBackup.js';"));
assert.doesNotMatch(app, /window\.LibriqCloudBackup/);
assert.doesNotMatch(navigation, /window\.LibriqCloudBackup/);
assert.doesNotMatch(navigation, /backupInFlight|debounceTimer|performCloudBackup|_planCloudMerge|_mergeCloudBookSafely/);

const bootstrap = fs.readFileSync('frontend/js/appModules.js', 'utf8');
assert.equal((bootstrap.match(/window\.LibriqCloudBackup\s*=\s*LibriqCloudBackup/g) || []).length, 1);
assert.ok(bootstrap.indexOf('LibriqCloudBackup.init(') < bootstrap.indexOf('bootApp()'));

console.log('Cloud Backup module tests passed');
