import assert from 'node:assert/strict';
import { createHelpPage } from '../frontend/js/features/help/helpPage.js';

const handlers = new Map();
const calls = [];
const main = {
  innerHTML: '',
  addEventListener(type, handler) { handlers.set(type, handler); },
};
const section = { open: false };

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
  documentRoot: { getElementById: id => id === 'mainContent' ? main : id === 'help-section-2' ? section : null },
});

render();
assert.match(main.innerHTML, /Help &amp; Guide Center/);
assert.match(main.innerHTML, /Sync readiness/);
assert.match(main.innerHTML, /Sync ready[\s\S]*Yes/);
assert.doesNotMatch(main.innerHTML, /onclick=/);

const click = (action, extra = {}) => handlers.get('click')({ target: { closest: () => ({ dataset: { action, ...extra } }) } });
click('open-search');
click('open-library');
assert.deepEqual(calls, ['search', 'library']);
click('open-guide-section', { sectionId: 'help-section-2' });
assert.equal(section.open, true);
assert.equal((main.innerHTML.match(/class="help-section"/g) || []).length, 7);
assert.match(main.innerHTML, /LibriQ requires an account/);
assert.match(main.innerHTML, /Restore replaces this device’s library after confirmation/);
assert.match(main.innerHTML, /keeps this device’s version of conflicts/);
assert.match(main.innerHTML, /does not let you select each conflicting value/);
assert.doesNotMatch(main.innerHTML, /guest mode|works without an account|accounts are optional/i);
const originalHandler = handlers.get('click');
render();
assert.equal(handlers.get('click'), originalHandler, 'Renders do not duplicate delegated listeners');
handlers.get('click')({ target: { closest: () => null } });

console.log('Help page tests passed');
