const createdNodes = new Map();

function makeClassList(initial = []) {
  const set = new Set(initial);
  return {
    add: (...names) => names.forEach(name => set.add(name)),
    remove: (...names) => names.forEach(name => set.delete(name)),
    toggle: (name, force) => {
      const next = force === undefined ? !set.has(name) : Boolean(force);
      if (next) set.add(name);
      else set.delete(name);
      return next;
    },
    contains: name => set.has(name),
  };
}

function createNode(id) {
  const node = {
    id,
    hidden: false,
    innerHTML: '',
    scrollTop: 0,
    style: {},
    classList: makeClassList(),
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    addEventListener: () => {},
    appendChild: child => child,
    prepend: () => {},
    setAttribute: () => {},
    removeAttribute: () => {},
    replaceChildren: () => {},
  };
  createdNodes.set(id, node);
  return node;
}

const body = {
  classList: makeClassList(['auth-booting']),
  style: {},
};

const documentStub = {
  body,
  documentElement: { classList: makeClassList(), setAttribute: () => {}, getAttribute: () => null },
  createElement(tag) {
    const actionsNode = {
      appendChild: child => child,
    };
    return {
      tagName: String(tag || '').toUpperCase(),
      dataset: {},
      className: '',
      innerHTML: '',
      textContent: '',
      classList: makeClassList(),
      querySelector: selector => (selector === '.book-card-actions' ? actionsNode : null),
      querySelectorAll: () => [],
      closest: () => null,
      addEventListener: () => {},
      appendChild: child => child,
      prepend: () => {},
      setAttribute: () => {},
      removeAttribute: () => {},
      replaceChildren: () => {},
      style: {},
    };
  },
  getElementById(id) {
    if (!createdNodes.has(id)) {
      return createNode(id);
    }
    return createdNodes.get(id);
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
};

globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.document = documentStub;
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
globalThis.requestAnimationFrame = cb => cb?.();
globalThis.scrollTo = () => {};
globalThis.history = { scrollRestoration: 'auto' };
globalThis.localStorage = {
  store: new Map(),
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
  setItem(key, value) { this.store.set(key, String(value)); },
  removeItem(key) { this.store.delete(key); },
};
globalThis.sessionStorage = {
  store: new Map(),
  getItem(key) { return this.store.has(key) ? this.store.get(key) : null; },
  setItem(key, value) { this.store.set(key, String(value)); },
  removeItem(key) { this.store.delete(key); },
};
globalThis.Utils = {
  $$: () => [],
  sanitize: value => String(value ?? ''),
  debounce: fn => fn,
  toast: () => {},
  formatDate: value => String(value ?? ''),
  formatNumber: value => String(value ?? 0),
  readingProgress: () => 0,
  formatDisplayName: value => String(value ?? ''),
  formatEmailPrefixName: value => String(value ?? ''),
  buildCover: () => ({ outerHTML: '<div class="book-cover"></div>' }),
  buildStars: rating => `<span class="star-rating">${rating}</span>`,
  statusLabel: status => ({
    reading: 'Reading',
    wishlist: 'Want to Read',
    finished: 'Finished',
  }[status] || 'Unknown'),
  statusBadgeClass: status => ({
    reading: 'badge-reading',
    wishlist: 'badge-wishlist',
    finished: 'badge-finished',
  }[status] || ''),
};
globalThis.LIBRIQ = {
  VERSION: 'test',
  STATUS: {
    READING: 'reading',
    WISHLIST: 'wishlist',
    FINISHED: 'finished',
  },
  MONTHS: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
globalThis.Storage = {
  getStats: () => ({ total: 0, reading: 0, finishedThisYear: 0, finished: 0, totalPages: 0, avgRating: null, monthlyData: [], pagesByMonth: [], topGenres: [], favorites: 0, wishlist: 0, ratedCount: 0 }),
  getStreak: () => ({ current: 0, longest: 0 }),
  getGoals: () => ({ yearly: 12 }),
  getProfile: () => ({ name: 'Reader', theme: 'dark' }),
  getBooks: () => [],
  getBooksByStatus: () => [],
  getActivityLog: () => [],
  getCloudBackupMeta: () => ({}),
  getSyncReadiness: () => ({ syncReady: false, hasDeviceId: true, hasUpdatedAtCoverage: true, hasDeletedAtSupport: true, hasBackupMetadata: true }),
  saveProfile: () => {},
  saveGoals: () => {},
};
globalThis.Library = { renderBookCard: () => document.createElement ? document.createElement('div') : ({}) };
globalThis.Search = { open: () => {}, close: () => {}, init: () => {} };
globalThis.LibriqFirebase = { getState: () => ({ available: false, ready: true, user: null }), onChange: () => () => {} };
globalThis.LibriqSyncBeta = { refresh: () => {}, pauseForOffline: () => {}, maybeAutoEnable: () => {}, getState: () => ({ enabled: false, status: 'off' }) };
globalThis.LibriqCloudBackup = { refresh: () => {}, scheduleIfAllowed: () => {}, pause: () => {} };

await import('../frontend/js/dashboard.js');
await import('../frontend/js/library.js');
await import('../frontend/js/navigation.js');

const nav = globalThis.LibriqNavigation;
const main = document.getElementById('mainContent');

const checks = [
  ['dashboard', 'dashboardPage', 'dashboard-page', ['welcome back', 'books in library', 'currently reading'], () => nav.goTo('dashboard')],
  ['library', 'libraryPage', null, ['my library', 'personal collection'], () => nav.goTo('library')],
  ['reading', 'statusPage', null, ['currently reading', 'reading queue'], () => nav.goTo('reading')],
  ['settings', 'settingsPage', null, ['settings', 'app preferences'], () => nav.goTo('settings')],
  ['boot', 'session-page', null, ['opening libriq'], () => nav.goTo('boot')],
];

for (const [name, expectedToken, expectedClass, visibleTokens, run] of checks) {
  main.innerHTML = '';
  run();
  if (!String(main.innerHTML || '').trim()) {
    throw new Error(`${name} render produced empty content`);
  }
  if (!main.innerHTML.includes(expectedToken)) {
    throw new Error(`${name} render did not include expected marker: ${expectedToken}`);
  }
  if (expectedClass && !main.innerHTML.includes(expectedClass)) {
    throw new Error(`${name} render is missing required class: ${expectedClass}`);
  }
  const normalized = main.innerHTML.toLowerCase();
  if (!visibleTokens.some(token => normalized.includes(token))) {
    throw new Error(`${name} render did not include expected visible text`);
  }
  if (main.innerHTML.includes('settingsPage') && name === 'dashboard') {
    throw new Error('dashboard render left stale settingsPage content');
  }
  if (main.innerHTML.includes('dashboardPage') && name === 'settings') {
    throw new Error('settings render left stale dashboardPage content');
  }
}

const mainStyle = String(document.getElementById('mainContent')?.style?.cssText || '');
if (mainStyle.includes('padding-top: 72px')) {
  throw new Error('mainContent still has an oversized top padding');
}

const indexSource = await (await import('node:fs/promises')).readFile(new URL('../frontend/index.html', import.meta.url), 'utf8');
if (indexSource.includes('desktop-topbar')) {
  throw new Error('desktop-topbar shell markup is still present');
}

const sidebarSource = await (await import('node:fs/promises')).readFile(new URL('../frontend/css/sidebar.css', import.meta.url), 'utf8');
if (!sidebarSource.includes('position: fixed;')) {
  throw new Error('desktop sidebar is not fixed');
}

nav.goTo('dashboard');
if (nav.currentPage !== 'dashboard') {
  throw new Error('Navigation.goTo did not update currentPage');
}

if (main.hidden) {
  throw new Error('mainContent ended hidden');
}

const sampleBooks = [
  {
    id: 'reading-1',
    title: 'Alpha Sample',
    author: 'Author One',
    status: LIBRIQ.STATUS.READING,
    currentPage: 42,
    pageCount: 300,
    rating: null,
    genres: ['Fiction'],
    isFavorite: false,
  },
  {
    id: 'wishlist-1',
    title: 'Beta Sample',
    author: 'Author Two',
    status: LIBRIQ.STATUS.WISHLIST,
    currentPage: 0,
    pageCount: 240,
    rating: null,
    genres: ['Memoir'],
    isFavorite: false,
  },
  {
    id: 'finished-1',
    title: 'Delta Sample',
    author: 'Author Three',
    status: LIBRIQ.STATUS.FINISHED,
    currentPage: 240,
    pageCount: 240,
    rating: 5,
    genres: ['Design'],
    isFavorite: true,
  },
];

for (const book of sampleBooks) {
  const card = Library.renderBookCard(book);
  const html = String(card?.innerHTML || '');
  const label = {
    reading: 'Reading',
    wishlist: 'Want to Read',
    finished: 'Finished',
  }[book.status];
  const className = {
    reading: 'badge-reading',
    wishlist: 'badge-wishlist',
    finished: 'badge-finished',
  }[book.status];
  const badgeMatch = html.match(new RegExp(`<span class="badge ${className}">\\s*([^<]+)\\s*</span>`));
  if (!badgeMatch) {
    throw new Error(`status badge not found for ${book.id}`);
  }
  const badgeText = badgeMatch[1].replace(/\s+/g, ' ').trim();
  if (badgeText !== label) {
    throw new Error(`status badge text "${badgeText}" did not match "${label}" for ${book.id}`);
  }
}

console.log('navigation render smoke test passed');
