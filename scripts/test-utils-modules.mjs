import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const guardedNames = ['document', 'localStorage', 'window', 'navigator', 'Storage', 'LibriqStorage'];
const originalDescriptors = new Map();
let browserAccesses = 0;
for (const name of guardedNames) {
  originalDescriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      browserAccesses += 1;
      throw new Error(`Utils import accessed ${name}`);
    },
  });
}
const originalSetTimeout = globalThis.setTimeout;
let importTimers = 0;
globalThis.setTimeout = (...args) => {
  importTimers += 1;
  return originalSetTimeout(...args);
};
const globalsBeforeImport = new Set(Reflect.ownKeys(globalThis));
const { Utils } = await import(`../frontend/js/utils.js?utils-test=${Date.now()}`);
const globalsAddedByImport = Reflect.ownKeys(globalThis).filter(key => !globalsBeforeImport.has(key));
globalThis.setTimeout = originalSetTimeout;
for (const [name, descriptor] of originalDescriptors) {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else delete globalThis[name];
}

assert.equal(browserAccesses, 0);
assert.equal(importTimers, 0);
assert.deepEqual(globalsAddedByImport, []);
assert.equal(globalThis.Utils, undefined);

const publicMethods = [
  '$', '$$', 'createElement', 'show', 'hide', 'toggle',
  'isApplePlatform', 'getSearchShortcutLabel',
  'formatPages', 'formatDate', 'timeAgo', 'readingProgress', 'truncate', 'capitalize', 'debounce', 'sanitize',
  'formatDisplayName', 'formatEmailPrefixName',
  'statusLabel', 'statusBadgeClass', 'statusIcon',
  'buildCover', 'buildCoverPlaceholder', 'buildStars',
  'toast', 'genreColor', 'formatNumber',
];
assert.deepEqual(Object.keys(Utils), publicMethods);

assert.equal(Utils.statusLabel('reading'), 'Reading');
assert.equal(Utils.statusLabel('finished'), 'Finished');
assert.equal(Utils.statusLabel('wishlist'), 'Want to Read');
assert.equal(Utils.statusLabel('dnf'), 'Did Not Finish');
assert.equal(Utils.statusLabel('other'), 'Unknown');
assert.equal(Utils.statusBadgeClass('reading'), 'badge-reading');
assert.equal(Utils.statusBadgeClass('finished'), 'badge-finished');
assert.equal(Utils.statusBadgeClass('wishlist'), 'badge-wishlist');
assert.equal(Utils.statusBadgeClass('dnf'), 'badge-dnf');
assert.equal(Utils.statusBadgeClass('other'), '');
assert.equal(Utils.statusIcon('reading'), 'ph-book-open');

assert.equal(Utils.readingProgress(0, 0), 0);
assert.equal(Utils.readingProgress(50, 200), 25);
assert.equal(Utils.readingProgress(300, 200), 100);
assert.equal(Utils.formatPages(1234), '1,234 pages');
assert.equal(Utils.formatPages(0), '–');
assert.equal(Utils.formatDate('2026-01-02T12:00:00.000Z'), 'Jan 2, 2026');
const nativeDateNow = Date.now;
Date.now = () => new Date('2026-01-02T12:00:30.000Z').getTime();
assert.equal(Utils.timeAgo('2026-01-02T12:00:00.000Z'), 'just now');
assert.equal(Utils.timeAgo('2026-01-02T11:50:00.000Z'), '10m ago');
Date.now = nativeDateNow;
assert.equal(Utils.formatNumber(999), '999');
assert.equal(Utils.formatNumber(1500), '1.5k');
assert.equal(Utils.genreColor('Fantasy'), '#7C6CD4');
assert.equal(Utils.genreColor('Unknown'), '#9896A4');
assert.equal(Utils.formatDisplayName('ada_lovelace'), 'Ada Lovelace');
assert.equal(Utils.formatEmailPrefixName('reader.name@example.com'), 'Reader');

assert.equal(
  Utils.sanitize('<img src=x onerror=alert(1)><script>alert(2)</script>'),
  '&lt;img src=x onerror=alert(1)&gt;&lt;script&gt;alert(2)&lt;/script&gt;',
);
assert.equal(Utils.sanitize(`"quoted" 'text' & more`), '&quot;quoted&quot; &#39;text&#39; &amp; more');

const placeholder = Utils.buildCover({ title: '<script>alert(1)</script>', coverUrl: 'javascript:alert(1)' });
assert.doesNotMatch(placeholder, /<img\b/);
assert.match(placeholder, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
const cover = Utils.buildCover({
  title: `');window.__utilsXss=1;//`,
  coverUrl: 'https://example.com/cover.jpg?x="quoted"',
});
assert.match(cover, /src="https:\/\/example\.com\/cover\.jpg\?x=&quot;quoted&quot;"/);
assert.doesNotMatch(cover, /buildCoverPlaceholder\('/);
assert.match(cover, /buildCoverPlaceholder\(&quot;/);
const stars = Utils.buildStars(3, true, `book');window.__utilsXss=1;//`);
assert.equal((stars.match(/class="star filled"/g) || []).length, 3);
assert.doesNotMatch(stars, /setRating\('/);

class FakeNode {}
globalThis.Node = FakeNode;
function makeElement(tag = 'div') {
  const listeners = new Map();
  const attributes = new Map();
  const element = new FakeNode();
  Object.assign(element, {
    tagName: tag.toUpperCase(),
    className: '',
    dataset: {},
    style: {},
    children: [],
    innerHTML: '',
    removed: false,
    classList: {
      values: new Set(),
      add(value) { this.values.add(value); },
      contains(value) { return this.values.has(value); },
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    removeAttribute(name) { attributes.delete(name); },
    hasAttribute(name) { return attributes.has(name); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    appendChild(child) { this.children.push(child); },
    insertAdjacentHTML(_position, html) { this.innerHTML += html; },
    remove() { this.removed = true; },
    _attributes: attributes,
    _listeners: listeners,
  });
  return element;
}
const toastContainer = makeElement('div');
const queryParent = {
  querySelector: selector => `one:${selector}`,
  querySelectorAll: selector => [`all:${selector}`],
};
globalThis.document = {
  createElement: makeElement,
  getElementById: id => id === 'toastContainer' ? toastContainer : null,
  querySelector: queryParent.querySelector,
  querySelectorAll: queryParent.querySelectorAll,
};
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: { platform: 'Win32', userAgent: 'test' },
});

assert.equal(Utils.$('.one', queryParent), 'one:.one');
assert.deepEqual(Utils.$$('.all', queryParent), ['all:.all']);
const clicked = [];
const created = Utils.createElement('button', {
  className: 'button',
  dataset: { id: 'one' },
  style: { color: 'red' },
  title: 'Title',
  onClick: () => clicked.push(true),
}, ['Trusted <strong>markup</strong>']);
assert.equal(created.className, 'button');
assert.equal(created.dataset.id, 'one');
assert.equal(created.style.color, 'red');
assert.equal(created._attributes.get('title'), 'Title');
created._listeners.get('click')();
assert.deepEqual(clicked, [true]);
assert.equal(created.innerHTML, 'Trusted <strong>markup</strong>');

const modal = makeElement();
modal.setAttribute('hidden', '');
Utils.show(modal);
assert.equal(modal.hasAttribute('hidden'), false);
Utils.hide(modal);
assert.equal(modal.hasAttribute('hidden'), true);
Utils.toggle(modal);
assert.equal(modal.hasAttribute('hidden'), false);
assert.equal(Utils.isApplePlatform(), false);
assert.equal(Utils.getSearchShortcutLabel(), 'Ctrl K');

let scheduledDelay = null;
let scheduledCallback = null;
globalThis.setTimeout = (callback, delay) => {
  scheduledCallback = callback;
  scheduledDelay = delay;
  return 1;
};
Utils.toast('<img src=x onerror=alert(1)>', 'warning');
assert.equal(toastContainer.children.length, 1);
assert.match(toastContainer.children[0].innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.equal(scheduledDelay, 3500);
scheduledCallback();
assert.equal(toastContainer.children[0].classList.contains('removing'), true);
toastContainer.children[0]._listeners.get('animationend')();
assert.equal(toastContainer.children[0].removed, true);
globalThis.setTimeout = originalSetTimeout;

let debounceCalls = 0;
let debounceCallback;
globalThis.clearTimeout = () => {};
globalThis.setTimeout = callback => {
  debounceCallback = callback;
  return 1;
};
const debounced = Utils.debounce(() => { debounceCalls += 1; }, 10);
debounced();
debounced();
assert.equal(debounceCalls, 0);
debounceCallback();
assert.equal(debounceCalls, 1);
globalThis.setTimeout = originalSetTimeout;

const source = await readFile(new URL('../frontend/js/utils.js', import.meta.url), 'utf8');
const appModulesSource = await readFile(new URL('../frontend/js/appModules.js', import.meta.url), 'utf8');
const indexSource = await readFile(new URL('../frontend/index.html', import.meta.url), 'utf8');
assert.match(source, /import\s*\{\s*LIBRIQ\s*\}\s*from\s*['"]\.\/data\.js['"]/);
assert.match(source, /export const Utils\s*=/);
assert.doesNotMatch(source, /window\.Utils\s*=/);
assert.doesNotMatch(appModulesSource, /loadClassicScript|window\.LIBRIQ/);
assert.match(appModulesSource, /window\.Utils\s*=\s*Utils/);
assert.doesNotMatch(indexSource, /<script[^>]+src=["']js\/utils\.js["']/);

for (const file of ['app.js', 'library.js', 'search.js', 'dashboard.js', 'navigation.js', 'sync.js', 'cloudBackup.js']) {
  const consumerSource = await readFile(new URL(`../frontend/js/${file}`, import.meta.url), 'utf8');
  assert.match(consumerSource, /import\s*\{\s*Utils\s*\}\s*from\s*['"]\.\/utils\.js['"]/);
  assert.doesNotMatch(consumerSource, /(?:window|globalThis)\.Utils/);
}

console.log('Utils module tests passed.');
