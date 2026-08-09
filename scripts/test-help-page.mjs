import assert from 'node:assert/strict';
import { createHelpPage } from '../frontend/js/features/help/helpPage.js';

const handlers = new Map();
const calls = [];
const main = {
  innerHTML: '',
  querySelector(selector) {
    return {
      addEventListener(type, handler) {
        handlers.set(`${selector}:${type}`, handler);
      },
    };
  },
};

const render = createHelpPage({
  storage: {
    getSyncReadiness: () => ({
      hasDeviceId: true,
      hasUpdatedAtCoverage: true,
      hasDeletedAtSupport: true,
      hasBackupMetadata: true,
      syncReady: true,
    }),
  },
  actions: {
    openSearch: () => calls.push('search'),
    navigate: page => calls.push(page),
  },
  documentRoot: { getElementById: id => id === 'mainContent' ? main : null },
});

render();
assert.match(main.innerHTML, /Help & Guide Center/);
assert.match(main.innerHTML, /Sync readiness/);
assert.match(main.innerHTML, /Sync ready[\s\S]*Yes/);
assert.doesNotMatch(main.innerHTML, /onclick=/);

handlers.get('[data-action="open-search"]:click')();
handlers.get('[data-action="open-library"]:click')();
assert.deepEqual(calls, ['search', 'library']);

console.log('Help page tests passed');
