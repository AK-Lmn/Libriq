import assert from 'node:assert/strict';
import { createActivityPage, filterActivityEvents, groupActivityByDate } from '../frontend/js/features/activity/activityPage.js';

const events = [
  { type: 'note_saved', bookTitle: '<Unsafe>', timestamp: '2026-08-10T08:00:00Z' },
  { type: 'book_added', bookTitle: 'First', timestamp: '2026-08-09T08:00:00Z' },
  { type: 'progress_updated', bookTitle: 'Second', timestamp: '2026-08-10T09:00:00Z' },
];
assert.deepEqual(filterActivityEvents(events, 'progress').map(event => event.bookTitle), ['Second']);
assert.deepEqual(filterActivityEvents(events, 'all').map(event => event.bookTitle), ['Second', '<Unsafe>', 'First']);
assert.equal(groupActivityByDate(events, new Date('2026-08-10T12:00:00Z'))[0].label, 'Today');

const listeners = new Map();
const elements = new Map();
const main = {
  _html: '',
  set innerHTML(value) {
    this._html = value;
    elements.set('activityFilters', { addEventListener(type, handler) { listeners.set(type, handler); } });
  },
  get innerHTML() { return this._html; },
  querySelector(selector) {
    if (selector === '#activityFilters') return elements.get('activityFilters');
    return null;
  },
};
const session = { value: 'all', getItem() { return this.value; }, setItem(_, value) { this.value = value; } };
const render = createActivityPage({
  storage: { getActivityLog: () => events },
  utils: { sanitize: value => String(value).replaceAll('<', '&lt;'), timeAgo: () => 'now' },
  actions: {}, session,
  documentRoot: { getElementById: id => id === 'mainContent' ? main : null },
});
render();
assert.match(main.innerHTML, /3 events/);
assert.match(main.innerHTML, /&lt;Unsafe>/);
listeners.get('click')({ target: { closest: () => ({ dataset: { filter: 'notes' } }) } });
assert.equal(session.value, 'notes');
assert.match(main.innerHTML, /1 event/);
assert.doesNotMatch(main.innerHTML, /onclick=/);

console.log('Activity page tests passed');
