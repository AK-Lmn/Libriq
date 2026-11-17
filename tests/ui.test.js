import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RELEASE_NOTES_VERSION, getReleaseNotes, hasSeenRelease } from '../frontend/js/services/releaseNotes.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('Discover eyebrow shows no design-system jargon', async () => {
  const source = await read('frontend/js/features/recommendations/recommendationsPage.js');
  assert.doesNotMatch(source, /GLASS|REDUCED TRANSPARENCY|EMPTY LIBRARY SIGNAL/);
});

test('favourite button renders one heart', async () => {
  const source = await read('frontend/js/library.js');
  assert.doesNotMatch(source, /ph-fill ph-heart|ph ph-heart/, 'Phosphor heart duplicates the sprite heart');
});

test('dashboard recent books use readable status labels', async () => {
  const source = await read('frontend/js/dashboard.js');
  assert.match(source, /dashboard-recent-status[^>]*>\$\{Utils\.statusLabel\(book\.status\)\}/);
});

test('release notes are keyed to their own version, not the app version', () => {
  const notes = getReleaseNotes();
  assert.ok(notes.title.includes(`v${RELEASE_NOTES_VERSION}`));
  assert.equal(hasSeenRelease('4.8.0', '4.8.0'), true);
  assert.equal(hasSeenRelease('4.8.4', '4.8.0'), true, 'a later patch counts as seen');
  assert.equal(hasSeenRelease('4.10.0', '4.9.0'), true, 'numeric, not string, comparison');
  assert.equal(hasSeenRelease('4.7.9', '4.8.0'), false);
  assert.equal(hasSeenRelease('', '4.8.0'), false);
  assert.equal(hasSeenRelease('test', '4.8.0'), false);
});

function fakeStorage(entries = {}) {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: i => [...map.keys()][i] ?? null,
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
}

test('first-time visitors open on sign-up; anyone who signed in here before opens on sign-in', async () => {
  const { initialAuthMode, isReturningReader, markReturningReader, RETURNING_READER_KEY } = await import('../frontend/js/shared/authMode.js');
  const fresh = fakeStorage({ 'libriq:local:profile': '{}', 'libriq:local:books': '[]', libriq_session_pref: 'prompt' });
  assert.equal(isReturningReader(fresh), false, 'local defaults written at boot do not count');
  assert.equal(initialAuthMode({ inAppBrowser: false, storage: fresh }), 'signup');

  assert.equal(initialAuthMode({ inAppBrowser: false, storage: fakeStorage({ 'libriq:users:abc:books': '[]' }) }), 'signin', 'signed in before this change');
  assert.equal(initialAuthMode({ inAppBrowser: false, storage: fakeStorage({ libriq_active_account_uid: 'abc' }) }), 'signin');

  const marked = fakeStorage();
  markReturningReader(marked);
  assert.equal(marked.getItem(RETURNING_READER_KEY), '1');
  assert.equal(initialAuthMode({ inAppBrowser: false, storage: marked }), 'signin');

  assert.equal(initialAuthMode({ inAppBrowser: true, storage: marked }), 'signup', 'in-app browsers keep email sign-up');
  const broken = { get length() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); } };
  assert.equal(initialAuthMode({ inAppBrowser: false, storage: broken }), 'signup', 'blocked storage falls back to sign-up');
});

test('sign-in marks the device and the session screen uses initialAuthMode', async () => {
  const storage = await read('frontend/js/storage.js');
  const setter = storage.slice(storage.indexOf('function setActiveAccountUid'), storage.indexOf('function clearActiveAccountScope'));
  assert.ok(setter.includes('markReturningReader(localStorage)'));
  const nav = await read('frontend/js/navigation.js');
  assert.ok(nav.includes("Navigation.setEmailAuthMode?.(initialAuthMode({ inAppBrowser, storage: localStorage }))"));
});

test('the mobile-app poll sits below Reading Now', async () => {
  const dashboard = await read('frontend/js/dashboard.js');
  const readingNow = dashboard.indexOf('<h2 class="section-title">Reading Now</h2>');
  const poll = dashboard.indexOf('${buildMobileAppPollCard()}');
  assert.ok(readingNow > -1 && poll > -1);
  assert.ok(poll > readingNow, 'poll renders after the Reading Now panel');
});
