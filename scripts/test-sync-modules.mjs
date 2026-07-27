import assert from 'node:assert/strict';
import fs from 'node:fs';

let fetchCalls = 0;
let timerCalls = 0;
let listenerCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('Sync import must not fetch');
};
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (...args) => {
  timerCalls += 1;
  return originalSetTimeout(...args);
};

const { LibriqSyncBeta } = await import('../frontend/js/sync.js');
assert.equal(fetchCalls, 0);
assert.equal(timerCalls, 0);
assert.equal(globalThis.LibriqSyncBeta, undefined);
assert.equal(globalThis.LibriqSyncDebug, undefined);
assert.equal(globalThis.LibriqSyncPaths, undefined);

const listeners = new Map();
globalThis.window = globalThis;
globalThis.addEventListener = (type, listener) => {
  listenerCalls += 1;
  const entries = listeners.get(type) || [];
  entries.push(listener);
  listeners.set(type, entries);
};
globalThis.dispatchEvent = () => true;
globalThis.localStorage = {
  values: new Map(),
  getItem(key) { return this.values.get(key) ?? null; },
  setItem(key, value) { this.values.set(key, String(value)); },
  removeItem(key) { this.values.delete(key); },
};
globalThis.document = {
  body: { classList: { contains: () => false } },
  getElementById: () => null,
};
globalThis.Storage = {
  getDeviceId: () => 'module-test-device',
  getSyncMeta: () => ({}),
  getSyncTombstones: () => ({}),
};
const { Storage } = await import('../frontend/js/storage.js');
Object.assign(Storage, globalThis.Storage);
globalThis.Utils = { formatDate: value => String(value) };
const { Utils } = await import('../frontend/js/utils.js');
Object.assign(Utils, globalThis.Utils);
globalThis.LIBRIQ = { VERSION: 'test' };
globalThis.LibriqFirebase = {
  getState: () => ({ available: false, ready: false, user: null }),
  getCurrentUser: () => null,
  hasFirestore: () => false,
};

const { Navigation } = await import('../frontend/js/navigation.js');
Object.assign(Navigation, {
  getCurrentSessionMode: () => 'offline',
  getSessionPreference: () => 'offline',
});

LibriqSyncBeta.init();
const initializedListenerCount = listenerCalls;
LibriqSyncBeta.init();
assert.equal(listenerCalls, initializedListenerCount);
assert.equal(initializedListenerCount, 8);
assert.equal(typeof globalThis.LibriqSyncDebug.status, 'function');
assert.equal(typeof globalThis.LibriqSyncPaths.getSyncBooksCollectionPath, 'function');
assert.equal(globalThis.LibriqSyncBeta, undefined);

const publicMethods = [
  'init',
  'getState',
  'setEnabled',
  'pauseForOffline',
  'enableWithPrompt',
  'refresh',
  'maybeAutoEnable',
  'onLocalChange',
  'queueUpload',
  'pruneOldLocalTombstones',
  'detachForAccountSwitch',
];
assert.deepEqual(Object.keys(LibriqSyncBeta), publicMethods);

const source = fs.readFileSync('frontend/js/sync.js', 'utf8');
assert.ok(source.includes("import { Navigation } from './navigation.js';"));
assert.match(source, /export const LibriqSyncBeta/);
assert.doesNotMatch(source, /window\.(?:Navigation|LibriqNavigation)/);
assert.doesNotMatch(source, /globalThis\.(?:Navigation|LibriqNavigation)/);
assert.doesNotMatch(source, /window\.LibriqSyncBeta\s*=/);

const bootstrap = fs.readFileSync('frontend/js/appModules.js', 'utf8');
assert.equal((bootstrap.match(/window\.LibriqSyncBeta\s*=\s*LibriqSyncBeta/g) || []).length, 1);
assert.ok(bootstrap.indexOf('window.LibriqSyncBeta = LibriqSyncBeta') < bootstrap.indexOf('LibriqSyncBeta.init()'));
assert.ok(bootstrap.indexOf('LibriqSyncBeta.init()') < bootstrap.indexOf('bootApp()'));

const app = fs.readFileSync('frontend/js/app.js', 'utf8');
assert.ok(app.includes("import { LibriqSyncBeta } from './sync.js';"));
assert.doesNotMatch(app, /window\.LibriqSyncBeta|globalThis\.LibriqSyncBeta/);

const html = fs.readFileSync('frontend/index.html', 'utf8');
assert.doesNotMatch(html, /<script[^>]+src="js\/sync\.js"/);
assert.equal((html.match(/src="js\/appModules\.js"/g) || []).length, 1);

console.log('Sync module and bootstrap tests passed');
