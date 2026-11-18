import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SDK_LOAD_TIMEOUT_MS, withSdkTimeout } from '../frontend/js/firebase-client.js';
import { isLibraryChange, watchOtherTabs } from '../frontend/js/shared/crossTab.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('a hung Firebase SDK load fails after a timeout instead of waiting forever', async () => {
  assert.ok(SDK_LOAD_TIMEOUT_MS >= 10_000 && SDK_LOAD_TIMEOUT_MS <= 30_000);
  await assert.rejects(withSdkTimeout(new Promise(() => {}), 20), /Firebase SDK did not load within 20ms/);
  assert.equal(await withSdkTimeout(Promise.resolve('sdk'), 20), 'sdk');
  const client = await read('frontend/js/firebase-client.js');
  assert.ok(client.includes('firebaseSdkPromise = withSdkTimeout(Promise.all(['), 'the SDK import goes through the timeout');
});

test('only library data for the signed-in account counts as a cross-tab change', () => {
  assert.equal(isLibraryChange('libriq:users:u1:books', 'u1'), true);
  assert.equal(isLibraryChange('libriq:users:u1:goals', 'u1'), true);
  assert.equal(isLibraryChange('libriq:users:u2:books', 'u1'), false, 'another account');
  assert.equal(isLibraryChange('libriq:users:u1:sync_meta', 'u1'), false, 'sync bookkeeping would cause re-render storms');
  assert.equal(isLibraryChange('libriq:local:books', null), true, 'signed-out local library');
  assert.equal(isLibraryChange('libriq:local:books', 'u1'), false);
  assert.equal(isLibraryChange('libriq_sync_fingerprints', 'u1'), false);
  assert.equal(isLibraryChange(null, 'u1'), false, 'localStorage.clear() in another tab');
});

function fakeWindow() {
  const listeners = {};
  return {
    listeners,
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    removeEventListener: (type, fn) => { listeners[type] = (listeners[type] || []).filter(f => f !== fn); },
    fire: (type, event) => (listeners[type] || []).forEach(fn => fn(event)),
  };
}

test('a burst of writes from another tab triggers one refresh', async () => {
  const win = fakeWindow();
  const doc = { activeElement: null, addEventListener: () => {}, removeEventListener: () => {} };
  let refreshes = 0;
  const stop = watchOtherTabs({ win, doc, getUid: () => 'u1', onChange: () => { refreshes += 1; }, debounceMs: 10 });
  win.fire('storage', { key: 'libriq:users:u1:books' });
  win.fire('storage', { key: 'libriq:users:u1:activity' });
  win.fire('storage', { key: 'libriq:users:u1:sync_meta' });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(refreshes, 1);
  stop();
  win.fire('storage', { key: 'libriq:users:u1:books' });
  await new Promise(r => setTimeout(r, 30));
  assert.equal(refreshes, 1, 'stop() removes the listener');
});

test('a refresh waits while the reader is typing in this tab', async () => {
  const win = fakeWindow();
  const docListeners = {};
  const field = { matches: () => true };
  const doc = {
    activeElement: field,
    addEventListener: (type, fn) => { docListeners[type] = fn; },
    removeEventListener: (type) => { delete docListeners[type]; },
  };
  let refreshes = 0;
  watchOtherTabs({ win, doc, getUid: () => 'u1', onChange: () => { refreshes += 1; }, debounceMs: 5 });
  win.fire('storage', { key: 'libriq:users:u1:books' });
  await new Promise(r => setTimeout(r, 20));
  assert.equal(refreshes, 0, 'no re-render under the cursor');
  doc.activeElement = null;
  docListeners.focusout?.();
  assert.equal(refreshes, 1, 'runs once focus leaves the field');
});

test('the app refreshes badges and the current page on cross-tab changes', async () => {
  const app = await read('frontend/js/app.js');
  assert.ok(app.includes('watchOtherTabs({'));
  assert.ok(app.includes('Navigation.renderCurrentPage'));
});
