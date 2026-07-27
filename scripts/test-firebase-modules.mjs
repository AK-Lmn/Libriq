import assert from 'node:assert/strict';
import fs from 'node:fs';

let fetchCalls = 0;
let timerCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('Firebase import must not fetch');
};
const nativeSetTimeout = globalThis.setTimeout;
const nativeSetInterval = globalThis.setInterval;
globalThis.setTimeout = (...args) => {
  timerCalls += 1;
  return nativeSetTimeout(...args);
};
globalThis.setInterval = (...args) => {
  timerCalls += 1;
  return nativeSetInterval(...args);
};

const { LibriqFirebase } = await import('../frontend/js/firebase-client.js');
assert.equal(fetchCalls, 0);
assert.equal(timerCalls, 0);
assert.equal(globalThis.LibriqFirebase, undefined);
assert.equal(globalThis.LibriqE2E, undefined);
assert.deepEqual(LibriqFirebase.getState(), {
  available: false,
  initialized: false,
  ready: false,
  user: null,
  error: null,
  restoringSession: false,
  signedOutConfirmed: false,
});

const listeners = new Map();
let browserListenerCount = 0;
globalThis.window = globalThis;
globalThis.location = {
  hostname: 'localhost',
  origin: 'http://localhost',
  search: '?libriq_e2e_test_mode=1',
};
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'module-test', platform: 'test', onLine: true },
  configurable: true,
});
globalThis.addEventListener = (type, listener) => {
  browserListenerCount += 1;
  const entries = listeners.get(type) || [];
  entries.push(listener);
  listeners.set(type, entries);
};
globalThis.dispatchEvent = event => {
  for (const listener of listeners.get(event.type) || []) listener(event);
  return true;
};
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
globalThis.LibriqStorage = {
  setActiveAccountUid() {},
  clearActiveAccountScope() {},
};
globalThis.Storage = {
  getBooks: () => [],
  getActivityLog: () => [],
  getProfile: () => ({}),
  getGoals: () => ({}),
  getStreak: () => ({}),
};
const { Storage } = await import('../frontend/js/storage.js');
Object.assign(Storage, globalThis.Storage);

LibriqFirebase.init();
const initializedListenerCount = browserListenerCount;
LibriqFirebase.init();
assert.equal(browserListenerCount, initializedListenerCount);
assert.equal(fetchCalls, 0);
assert.equal(timerCalls, 0);
assert.equal(LibriqFirebase.getState().initialized, true);
assert.equal(LibriqFirebase.getState().ready, true);
assert.equal(LibriqFirebase.isTestMode(), true);
assert.equal(globalThis.LibriqFirebase, undefined);
assert.equal(typeof globalThis.LibriqE2E.seedAuth, 'function');

const observed = [];
const unsubscribe = LibriqFirebase.onChange(state => observed.push(state));
assert.equal(observed.length, 1);
await LibriqFirebase.signInWithGoogle();
assert.equal(observed.length, 2);
assert.equal(observed.at(-1).user.uid, 'test-uid');
assert.equal(await LibriqFirebase.sendVerificationEmailToCurrentUser(), true);
assert.equal(LibriqFirebase.getState().user.emailVerified, true);
assert.equal(await LibriqFirebase.sendPasswordResetToEmail('reader@example.com'), true);
assert.equal(await LibriqFirebase.requestEmailChange('updated@example.com'), true);
assert.equal(LibriqFirebase.getState().user.email, 'updated@example.com');
const observedBeforeUnsubscribe = observed.length;
unsubscribe();
await LibriqFirebase.signOut();
assert.equal(observed.length, observedBeforeUnsubscribe);
assert.equal(LibriqFirebase.getState().signedOutConfirmed, true);

const source = fs.readFileSync('frontend/js/firebase-client.js', 'utf8');
assert.match(source, /export const LibriqFirebase/);
assert.doesNotMatch(source, /window\.LibriqFirebase\s*=/);

const appSource = fs.readFileSync('frontend/js/app.js', 'utf8');
const syncSource = fs.readFileSync('frontend/js/sync.js', 'utf8');
assert.ok(appSource.includes("import { LibriqFirebase } from './firebase-client.js';"));
assert.ok(syncSource.includes("import { LibriqFirebase } from './firebase-client.js';"));
assert.doesNotMatch(appSource, /window\.LibriqFirebase|globalThis\.LibriqFirebase/);
assert.doesNotMatch(syncSource, /window\.LibriqFirebase|globalThis\.LibriqFirebase/);

const bootstrap = fs.readFileSync('frontend/js/appModules.js', 'utf8');
assert.equal((bootstrap.match(/window\.LibriqFirebase\s*=\s*LibriqFirebase/g) || []).length, 1);
assert.ok(bootstrap.indexOf('window.LibriqFirebase = LibriqFirebase') < bootstrap.indexOf('LibriqFirebase.init()'));
assert.ok(bootstrap.indexOf('LibriqFirebase.init()') < bootstrap.indexOf('LibriqSyncBeta.init()'));
assert.ok(bootstrap.indexOf('LibriqSyncBeta.init()') < bootstrap.indexOf('bootApp()'));

const html = fs.readFileSync('frontend/index.html', 'utf8');
assert.doesNotMatch(html, /<script[^>]+src="js\/firebase-client\.js"/);
assert.equal((html.match(/type="module"[^>]+src="js\/appModules\.js"/g) || []).length, 1);

console.log('Firebase module and bootstrap tests passed');
