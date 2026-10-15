import assert from 'node:assert/strict';

// 1. Setup mock environment before importing navigation
const listeners = [];
const historyCalls = [];

const mockLocation = {
  pathname: '/',
  search: '',
  hash: '',
};

const mockHistory = {
  replaceState(state, title, url) {
    historyCalls.push({ state, title, url });
    // Update mockLocation hash if url contains one
    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1) {
      mockLocation.hash = url.slice(hashIndex);
    } else {
      mockLocation.hash = '';
    }
  },
};

globalThis.window = globalThis;
globalThis.location = mockLocation;
globalThis.history = mockHistory;
globalThis.addEventListener = (type, handler) => listeners.push({ type, handler });
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
  addEventListener: (type, handler) => listeners.push({ type: `document:${type}`, handler }),
  body: { classList, style: {} },
  documentElement: { classList, getAttribute: () => 'dark', setAttribute() {} },
  getElementById: () => null,
  querySelectorAll: () => [],
  createTextNode: value => ({ textContent: String(value) }),
};

globalThis.Utils = {
  $$: () => [],
  toast: () => {},
  sanitize: str => str,
};

globalThis.Storage = new Proxy({}, {
  get: () => () => null,
});

globalThis.LIBRIQ = {
  STATUS: { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished' },
  STORAGE_KEYS: {},
  MONTHS: [],
};

globalThis.LibriqFirebase = {
  getState: () => ({ ready: true, user: null, signedOutConfirmed: true }),
  getCurrentUser: () => null,
  hasFirestore: () => false,
  getUserEmailAuthInfo: () => ({}),
};
globalThis.LibriqSyncBeta = { getState: () => ({ enabled: false }), refresh() {} };
globalThis.LibriqCloudBackup = { getState: () => ({}), refresh() {}, formatLastSavedLabel: () => '' };

// Import Navigation module
const { Navigation } = await import('../frontend/js/navigation.js');

console.log('Testing Navigation.getRouteFromHash...');

// Test 1: getRouteFromHash handles dashboard and empty states
assert.equal(Navigation.getRouteFromHash(''), 'dashboard');
assert.equal(Navigation.getRouteFromHash('#'), 'dashboard');
assert.equal(Navigation.getRouteFromHash('#/'), 'dashboard');
assert.equal(Navigation.getRouteFromHash('#dashboard'), 'dashboard');
assert.equal(Navigation.getRouteFromHash(null), 'dashboard');
assert.equal(Navigation.getRouteFromHash(undefined), 'dashboard');

// Test 2: getRouteFromHash handles primary app hubs
assert.equal(Navigation.getRouteFromHash('#library'), 'library');
assert.equal(Navigation.getRouteFromHash('#profile'), 'profile');
assert.equal(Navigation.getRouteFromHash('#settings'), 'settings');
assert.equal(Navigation.getRouteFromHash('#quotes'), 'quotes');
assert.equal(Navigation.getRouteFromHash('#goals'), 'goals');
assert.equal(Navigation.getRouteFromHash('#activity'), 'activity');
assert.equal(Navigation.getRouteFromHash('#stats'), 'stats');
assert.equal(Navigation.getRouteFromHash('#statistics'), 'stats');
assert.equal(Navigation.getRouteFromHash('#recommendations'), 'recommendations');

// Test 3: getRouteFromHash handles help and help section deep-links
assert.equal(Navigation.getRouteFromHash('#help'), 'help');
assert.equal(Navigation.getRouteFromHash('#help-section-1'), 'help');
assert.equal(Navigation.getRouteFromHash('#help-section-2'), 'help');
assert.equal(Navigation.getRouteFromHash('#help-section-7'), 'help');

// Test 4: getRouteFromHash safely falls back to dashboard on rogue / unknown anchors
assert.equal(Navigation.getRouteFromHash('#unknown-random-section'), 'dashboard');
assert.equal(Navigation.getRouteFromHash('#404-not-found'), 'dashboard');
assert.equal(Navigation.getRouteFromHash('#malformed?query=1'), 'dashboard');

console.log('Testing Navigation.syncUrlForRoute...');

// Test 5: syncUrlForRoute cleans up lingering hash when on dashboard
historyCalls.length = 0;
mockLocation.hash = '#help-section-2';
Navigation.syncUrlForRoute('dashboard');
assert.equal(historyCalls.length, 1);
assert.equal(historyCalls[0].url, '/');
assert.equal(mockLocation.hash, '');

// Test 6: syncUrlForRoute does nothing if dashboard already has no hash
historyCalls.length = 0;
mockLocation.hash = '';
Navigation.syncUrlForRoute('dashboard');
assert.equal(historyCalls.length, 0, 'No unnecessary replaceState call when hash is already clean');

// Test 7: syncUrlForRoute sets correct hash on named hubs
historyCalls.length = 0;
mockLocation.hash = '';
Navigation.syncUrlForRoute('library');
assert.equal(historyCalls.length, 1);
assert.equal(historyCalls[0].url, '/#library');
assert.equal(mockLocation.hash, '#library');

// Test 8: syncUrlForRoute preserves help-section-X deep anchors when on help page
historyCalls.length = 0;
mockLocation.hash = '#help-section-2';
Navigation.syncUrlForRoute('help');
assert.equal(historyCalls.length, 0, 'Preserves specific guide section anchor without overwriting');

// Test 9: syncUrlForRoute normalizes generic help page hash if empty or different
historyCalls.length = 0;
mockLocation.hash = '';
Navigation.syncUrlForRoute('help');
assert.equal(historyCalls.length, 1);
assert.equal(historyCalls[0].url, '/#help');
assert.equal(mockLocation.hash, '#help');

// Test 10: syncUrlForRoute ignores boot and session routes
historyCalls.length = 0;
mockLocation.hash = '#session';
Navigation.syncUrlForRoute('session');
Navigation.syncUrlForRoute('boot');
assert.equal(historyCalls.length, 0, 'boot and session should not alter URL hash');

console.log('Testing Help guide section event handling preventDefault...');

// Test 11: verify Help page open-guide-section prevents default anchor jump
import { createHelpPage } from '../frontend/js/features/help/helpPage.js';
const helpHandlers = new Map();
const helpMain = {
  innerHTML: '',
  addEventListener(type, handler) { helpHandlers.set(type, handler); },
  querySelector: () => null,
};
const mockSection = { open: false, scrollIntoViewCalled: false, scrollIntoView() { this.scrollIntoViewCalled = true; } };

const renderHelp = createHelpPage({
  storage: { getSyncReadiness: () => ({}) },
  actions: {},
  documentRoot: {
    getElementById: id => (id === 'mainContent' ? helpMain : id === 'help-section-2' ? mockSection : null),
  },
});
renderHelp();

let preventDefaultCalled = false;
const mockEvent = {
  target: {
    closest: () => ({
      dataset: { action: 'open-guide-section', sectionId: 'help-section-2' },
    }),
  },
  preventDefault() {
    preventDefaultCalled = true;
  },
};

helpHandlers.get('click')(mockEvent);
assert.equal(preventDefaultCalled, true, 'preventDefault must be called to stop hash jump to #help-section-X');
assert.equal(mockSection.open, true, 'Target section should be opened');
assert.equal(mockSection.scrollIntoViewCalled, true, 'Target section should be scrolled into view');

console.log('All navigation hash sync regression tests passed successfully!');
