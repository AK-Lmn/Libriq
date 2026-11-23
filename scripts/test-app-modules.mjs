import assert from 'node:assert/strict';
import fs from 'node:fs';

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('App import must not fetch');
};

const listeners = new Map();
const addListener = (type, listener) => {
  const list = listeners.get(type) || [];
  list.push(listener);
  listeners.set(type, list);
};
globalThis.window = globalThis;
globalThis.addEventListener = addListener;
globalThis.dispatchEvent = event => {
  for (const listener of listeners.get(event.type) || []) listener(event);
  return true;
};
globalThis.setTimeout = () => 1;
globalThis.clearTimeout = () => {};
globalThis.localStorage = {
  values: new Map([['libriq_seen_version', 'test']]),
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
const documentListeners = [];
const classList = { add() {}, remove() {}, toggle() {}, contains: () => false };
globalThis.document = {
  body: { style: {}, classList },
  documentElement: { classList, getAttribute: () => 'dark', setAttribute() {} },
  getElementById: () => null,
  addEventListener: type => documentListeners.push(type),
  createTextNode: value => ({ textContent: String(value) }),
};
globalThis.LIBRIQ = {
  VERSION: 'test',
  STATUS: { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished' },
  STORAGE_KEYS: {},
  MONTHS: [],
};
globalThis.Utils = { $$: () => [], hide() {}, show() {}, sanitize: value => String(value ?? '') };
const { Utils } = await import('../frontend/js/utils.js');
Object.assign(Utils, globalThis.Utils);

let storageBoots = 0;
globalThis.Storage = new Proxy({ bootstrap: () => { storageBoots += 1; } }, {
  get(target, key) {
    if (key in target) return target[key];
    if (key === 'getProfile') return () => ({});
    if (key === 'getBooks' || key === 'getBooksByStatus') return () => [];
    if (key === 'getGoals') return () => ({ yearly: 12 });
    if (key === 'getStreak') return () => ({ current: 0, longest: 0 });
    if (key === 'getStats') return () => ({ total: 0, reading: 0, wishlist: 0, finished: 0, favorites: 0 });
    return () => null;
  },
});
const { Storage } = await import('../frontend/js/storage.js');
Object.assign(Storage, globalThis.Storage);

let authRoutes = 0;
let navInits = 0;
let libraryInits = 0;
let searchInits = 0;
const { Navigation } = await import('../frontend/js/navigation.js');
const { Library } = await import('../frontend/js/library.js');
const { Search } = await import('../frontend/js/search.js');
Object.assign(Navigation, {
  init: () => { navInits += 1; },
  goTo: () => {},
  routeAfterAuthReady: () => { authRoutes += 1; },
  applyTheme: () => {},
  updateBadges: () => {},
});
Object.assign(Library, { init: () => { libraryInits += 1; }, closeAddModal: () => {} });
Object.assign(Search, { init: () => { searchInits += 1; }, close: () => {} });

let unregisterCalls = 0;
let registerCalls = 0;
Object.defineProperty(globalThis, 'navigator', {
  value: {
    onLine: true,
    serviceWorker: {
      getRegistration: async () => ({ unregister: () => { unregisterCalls += 1; } }),
      getRegistrations: async () => [],
      register: async () => { registerCalls += 1; },
    },
  },
  configurable: true,
});
globalThis.location = { protocol: 'http:', hostname: 'localhost' };
globalThis.caches = { keys: async () => ['libriq-test'], delete: async () => true };
const { LibriqFirebase } = await import('../frontend/js/firebase-client.js');
Object.assign(LibriqFirebase, {
  getState: () => ({ ready: true, user: null }),
  onChange: () => () => {},
});
const backupReasons = [];
const syncReasons = [];
const { LibriqCloudBackup } = await import('../frontend/js/cloudBackup.js');
Object.assign(LibriqCloudBackup, {
  scheduleIfAllowed: reason => backupReasons.push(reason),
  pause() {},
});
const { LibriqSyncBeta } = await import('../frontend/js/sync.js');
Object.assign(LibriqSyncBeta, {
  onLocalChange: () => syncReasons.push('local'),
  refresh() {},
});

const { bootApp, isAppBooted } = await import('../frontend/js/app.js');
assert.equal(fetchCalls, 0);
assert.equal(isAppBooted(), false);
assert.equal(storageBoots, 0);

bootApp();
const windowListenerCount = [...listeners.values()].reduce((sum, list) => sum + list.length, 0);
bootApp();
assert.equal(isAppBooted(), true);
assert.equal(storageBoots, 1);
assert.equal(navInits, 1);
assert.equal(libraryInits, 1);
assert.equal(searchInits, 1);
assert.equal(authRoutes, 1);
assert.equal([...listeners.values()].reduce((sum, list) => sum + list.length, 0), windowListenerCount);
assert.equal(documentListeners.filter(type => type === 'keydown').length, 1);

globalThis.dispatchEvent(new CustomEvent('libriq:book:added'));
assert.ok(backupReasons.includes('book-added'));
assert.equal(syncReasons.length, 1);
globalThis.dispatchEvent(new CustomEvent('libriq:reset'));
assert.ok(backupReasons.includes('reset'));
await Promise.resolve();
assert.equal(unregisterCalls, 1);
assert.equal(registerCalls, 0);

globalThis.location = { protocol: 'https:', hostname: 'libriq.example' };
const productionApp = await import('../frontend/js/app.js?production-service-worker');
globalThis.document.readyState = 'interactive';
productionApp.bootApp();
await Promise.resolve();
assert.equal(registerCalls, 0, 'precaching waits for the page to finish loading');
globalThis.dispatchEvent(new Event('load'));
await Promise.resolve();
assert.equal(registerCalls, 1);

// A deploy that is already waiting must be offered, not forced: the page asks
// before the new worker takes over, then reloads once it has.
const updateToasts = [];
const originalToast = Utils.toast;
Utils.toast = (message, type, options) => { updateToasts.push({ message, type, options }); };
const swMessages = [];
const swListeners = {};
let reloads = 0;
globalThis.location = { protocol: 'https:', hostname: 'libriq.example', reload: () => { reloads += 1; } };
Object.defineProperty(globalThis, 'navigator', {
  value: {
    onLine: true,
    serviceWorker: {
      controller: {},
      addEventListener: (type, listener) => { swListeners[type] = listener; },
      register: async () => ({
        waiting: { postMessage: message => swMessages.push(message) },
        addEventListener() {},
      }),
    },
  },
  configurable: true,
});
const updateApp = await import('../frontend/js/app.js?service-worker-update');
globalThis.document.readyState = 'complete';
updateApp.bootApp();
await new Promise(resolve => setImmediate(resolve));
const updatePrompt = updateToasts.find(toast => toast.options?.action);
assert.ok(updatePrompt, 'waiting deploy shows an update prompt');
assert.equal(updatePrompt.options.persistent, true);
assert.equal(updatePrompt.options.action.label, 'Reload');
assert.deepEqual(swMessages, [], 'new worker does not take over before the reader chooses');
updatePrompt.options.action.onClick();
assert.deepEqual(swMessages, [{ type: 'SKIP_WAITING' }]);
assert.equal(reloads, 0);
swListeners.controllerchange();
swListeners.controllerchange();
assert.equal(reloads, 1, 'reloads once after the new worker takes over');
Utils.toast = originalToast;

let authCallback;
let unsubscribeCalls = 0;
globalThis.location = { protocol: 'file:', hostname: '' };
Object.assign(LibriqFirebase, {
  getState: () => ({ ready: false, user: null }),
  onChange: callback => {
    // The first listener is the boot-time auth router; later ones (pending intents) are not under test here.
    authCallback ||= callback;
    return () => { unsubscribeCalls += 1; };
  },
});
const authRoutesBefore = authRoutes;
const waitingApp = await import('../frontend/js/app.js?auth-listener');
waitingApp.bootApp();
assert.equal(typeof authCallback, 'function');
authCallback({ ready: true, user: null });
authCallback({ ready: true, user: null });
assert.equal(authRoutes, authRoutesBefore + 1);
assert.equal(unsubscribeCalls, 1);

const source = fs.readFileSync('frontend/js/app.js', 'utf8');
for (const [name, path] of [['Navigation', './navigation.js'], ['Library', './library.js'], ['Search', './search.js'], ['LibriqSyncBeta', './sync.js']]) {
  assert.ok(source.includes(`import { ${name} } from '${path}';`));
}
assert.doesNotMatch(source, /window\.(?:Navigation|LibriqNavigation|Library|Search)|globalThis\.(?:Navigation|Library|Search)/);
assert.doesNotMatch(source, /window\.LibriqSyncBeta|globalThis\.LibriqSyncBeta/);
assert.equal(source.includes(['libriq', 'app-modules-ready'].join(':')), false);
assert.match(source, /navigator\.serviceWorker\.register/);

const html = fs.readFileSync('frontend/index.html', 'utf8');
assert.doesNotMatch(html, /<script[^>]+src="js\/app\.js"/);
assert.equal((html.match(/src="js\/boot\.js"/g) || []).length, 1);

// boot.js loads the built bundle on deployed hosts and the sources locally.
const boot = fs.readFileSync('frontend/js/boot.js', 'utf8');
assert.ok(boot.includes("'./app.bundle.js'"));
assert.ok(boot.includes("'./appModules.js'"));
assert.ok(boot.includes("'localhost', '127.0.0.1'"));

console.log('App module tests passed');
