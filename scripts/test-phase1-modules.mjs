import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Router } from '../frontend/js/app/router.js';
import { initDashboardEvents } from '../frontend/js/features/dashboard/dashboardPage.js';
import { initLibraryEvents } from '../frontend/js/features/library/libraryPage.js';

function createContainer() {
  const listeners = new Map();
  return {
    dataset: {},
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type) { listeners.delete(type); },
    contains: () => true,
    replaceChildren() { this.cleared = true; },
    dispatch(action, dataset = {}) {
      const trigger = { dataset: { action, ...dataset } };
      listeners.get('click')?.({
        target: { closest: () => trigger },
        preventDefault() {},
        stopPropagation() {},
      });
    },
  };
}

const root = createContainer();
const rendered = [];
const lifecycle = [];
const router = new Router({
  root,
  beforeNavigate: ({ name }) => lifecycle.push(`before:${name}`),
  afterNavigate: ({ name }) => lifecycle.push(`after:${name}`),
});
router.register('dashboard', () => rendered.push('dashboard'));
router.register('library', () => rendered.push('library'));
assert.equal(router.navigate('library'), true);
assert.equal(router.currentRoute, 'library');
assert.deepEqual(rendered, ['library']);
assert.deepEqual(lifecycle, ['before:library', 'after:library']);
assert.equal(router.navigate('missing'), false);

const dashboardCalls = [];
const dashboard = createContainer();
const removeDashboardEvents = initDashboardEvents(dashboard, {
  navigate: route => dashboardCalls.push(['navigate', route]),
  updateProgress: id => dashboardCalls.push(['update', id]),
});
dashboard.dispatch('navigate', { route: 'stats' });
dashboard.dispatch('update-progress', { bookId: 'book-1' });
assert.deepEqual(dashboardCalls, [['navigate', 'stats'], ['update', 'book-1']]);
removeDashboardEvents();

const libraryCalls = [];
const library = createContainer();
initLibraryEvents(library, {
  openSearch: () => libraryCalls.push(['search']),
  showBookDetails: id => libraryCalls.push(['details', id]),
});
library.dispatch('open-search');
library.dispatch('show-book-details', { bookId: 'book-2' });
assert.deepEqual(libraryCalls, [['search'], ['details', 'book-2']]);

const dashboardSource = fs.readFileSync('frontend/js/dashboard.js', 'utf8');
const librarySource = fs.readFileSync('frontend/js/library.js', 'utf8');
assert.doesNotMatch(dashboardSource, /onclick=/);
assert.doesNotMatch(librarySource, /onclick=/);
assert.match(fs.readFileSync('frontend/js/utils.js', 'utf8'), /AccessibleDialog/);

console.log('Phase 1 router, feature boundary, and delegation tests passed.');
