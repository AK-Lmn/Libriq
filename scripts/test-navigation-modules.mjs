import assert from 'node:assert/strict';
import fs from 'node:fs';

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('Navigation import must not fetch');
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const listeners = [];
globalThis.window = globalThis;
globalThis.addEventListener = (type) => listeners.push(type);
globalThis.dispatchEvent = () => true;
globalThis.setTimeout = () => 0;
globalThis.localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
};
globalThis.sessionStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
};
const classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
globalThis.document = {
  body: { classList, style: {} },
  documentElement: { classList, getAttribute: () => 'dark', setAttribute() {} },
  getElementById: () => null,
  querySelectorAll: () => [],
  createTextNode: value => ({ textContent: String(value) }),
};
globalThis.Utils = {
  $$: () => [],
};
globalThis.Storage = new Proxy({}, {
  get: (_, key) => {
    if (key === 'getProfile') return () => ({});
    if (key === 'getBooks') return () => [];
    if (key === 'getBooksByStatus') return () => [];
    if (key === 'getGoals') return () => ({ yearly: 12 });
    if (key === 'getStreak') return () => ({ current: 0, longest: 0 });
    if (key === 'getStats') return () => ({ total: 0, reading: 0, wishlist: 0, finished: 0, favorites: 0 });
    return () => null;
  },
});
globalThis.LIBRIQ = {
  STATUS: { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished' },
  STORAGE_KEYS: {},
  MONTHS: [],
};
globalThis.LibriqFirebase = { getState: () => ({ ready: true, user: null, signedOutConfirmed: true }) };
globalThis.LibriqSyncBeta = { getState: () => ({ enabled: false }), refresh() {} };
globalThis.LibriqCloudBackup = { refresh() {} };

const { Navigation } = await import('../frontend/js/navigation.js');
assert.equal(fetchCalls, 0);
assert.equal(globalThis.Navigation, undefined);
assert.equal(globalThis.LibriqNavigation, undefined);
assert.equal(Navigation.currentPage, 'dashboard');

Navigation.init();
const listenerCount = listeners.length;
Navigation.init();
assert.equal(listeners.length, listenerCount);

const source = fs.readFileSync('frontend/js/navigation.js', 'utf8');
for (const [name, path] of [
  ['BookAPI', './api/index.js'],
  ['Library', './library.js'],
  ['Search', './search.js'],
  ['Dashboard', './dashboard.js'],
]) {
  assert.ok(source.includes(`import { ${name} } from '${path}';`));
}
assert.doesNotMatch(source, /window\.(?:BookAPI|Library|Search|Dashboard)|globalThis\.(?:BookAPI|Library|Search|Dashboard)/);
assert.match(source, /BookAPI\.searchBySubject/);
assert.match(source, /BookAPI\.searchCuratedClassics/);
assert.ok(source.includes("import { buildMonthlyChart, buildGenreRow } from './dashboard.js';"));

assert.equal(globalThis.BookAPI, undefined);
assert.equal(globalThis.Dashboard, undefined);

const bootstrapSource = fs.readFileSync('frontend/js/appModules.js', 'utf8');
assert.match(bootstrapSource, /window\.Navigation = Navigation/);
assert.match(bootstrapSource, /window\.LibriqNavigation = Navigation/);
assert.match(bootstrapSource, /bootApp\(\)/);
assert.equal(bootstrapSource.includes(['libriq', 'app-modules-ready'].join(':')), false);

const html = fs.readFileSync('frontend/index.html', 'utf8');
assert.doesNotMatch(html, /<script[^>]+src="js\/navigation\.js"/);
assert.equal((html.match(/src="js\/appModules\.js"/g) || []).length, 1);

console.log('Navigation module tests passed');
