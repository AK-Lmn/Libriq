import assert from 'node:assert/strict';
import fs from 'node:fs';

let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls += 1;
  throw new Error('Module import must not fetch');
};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });

const listeners = [];
const elements = new Map();
function element(id) {
  if (!elements.has(id)) {
    elements.set(id, {
      id,
      type: '',
      tagName: 'DIV',
      value: '',
      textContent: '',
      checked: false,
      addEventListener: (type) => listeners.push(`${id}:${type}`),
      hasAttribute: () => true,
      querySelector: () => null,
      querySelectorAll: () => [],
      classList: { toggle() {}, add() {}, remove() {} },
    });
  }
  return elements.get(id);
}
globalThis.document = {
  body: { style: {} },
  getElementById: element,
  addEventListener: (type) => listeners.push(`document:${type}`),
  querySelectorAll: () => [],
};
globalThis.window = globalThis;
globalThis.dispatchEvent = () => true;
globalThis.addEventListener = () => {};
globalThis.Utils = {
  debounce: fn => fn,
  isApplePlatform: () => false,
  getSearchShortcutLabel: () => 'Ctrl K',
};

const { Library } = await import('../frontend/js/library.js');
const { Search } = await import('../frontend/js/search.js');

assert.equal(fetchCalls, 0);
assert.equal(globalThis.Library, Library);
assert.equal(globalThis.Search, Search);

Library.init();
Search.init();
const initializedListenerCount = listeners.length;
Library.init();
Search.init();
assert.equal(listeners.length, initializedListenerCount);

const searchSource = fs.readFileSync('frontend/js/search.js', 'utf8');
const librarySource = fs.readFileSync('frontend/js/library.js', 'utf8');
assert.match(searchSource, /import\s+\{\s*BookAPI\s*\}\s+from\s+'\.\/api\/index\.js'/);
assert.match(librarySource, /import\s+\{\s*BookAPI\s*\}\s+from\s+'\.\/api\/index\.js'/);
assert.doesNotMatch(searchSource, /window\.BookAPI|globalThis\.BookAPI/);
assert.doesNotMatch(librarySource, /window\.BookAPI|globalThis\.BookAPI/);
assert.match(librarySource, /BookAPI\.enrichBook/);
assert.match(librarySource, /BookAPI\.enrichBookLinks/);

console.log('Search and Library module tests passed');
