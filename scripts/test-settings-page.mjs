import assert from 'node:assert/strict';
import { createSettingsPage } from '../frontend/js/features/settings/settingsPage.js';

const listeners = new Map();
const main = {
  innerHTML: '',
  addEventListener(type, handler) { listeners.set(type, handler); },
};
const calls = [];
const user = { uid: 'user-1', displayName: 'Test Reader', email: 'reader@example.com', photoURL: '' };
const render = createSettingsPage({
  storage: {
    getBackupMeta: () => ({ lastExportedAt: '2026-01-01T00:00:00Z' }),
    getCloudBackupMeta: () => ({ lastCloudBackupAt: '2026-01-02T00:00:00Z' }),
    getBooks: () => [{ id: 'book-1' }],
  },
  utils: {
    sanitize: value => String(value ?? ''),
    formatDate: value => `date:${value}`,
  },
  constants: { VERSION: '4.7.0' },
  actions: {
    getActiveTheme: () => 'dark',
    getFirebaseState: () => ({ initialized: true, available: true, user }),
    getUserEmailAuthInfo: () => ({
      email: user.email, emailVerified: true, hasPasswordProvider: false,
      hasEmail: true, providerData: [{ providerId: 'google.com' }],
    }),
    getCloudBackupState: () => ({ status: 'ready', message: 'Cloud backup active', lastSavedAt: '2026-01-02T00:00:00Z' }),
    formatLastSavedLabel: () => 'Last backed up: recently',
    hasFirestore: () => true,
    getCurrentUser: () => user,
    getSessionPreference: () => 'account',
    getDisplayName: () => 'Test Reader',
    getSyncState: () => ({
      enabled: true, status: 'ready', listenerAttached: true,
      deviceId: 'device-1', syncPath: 'users/user-1/books',
      lastSnapshotAt: '2026-01-03T00:00:00Z', lastWriteAt: '2026-01-03T00:00:00Z',
      pendingBookIds: [], pendingDeleteIds: [], tombstoneCount: 0, eligibilityAllowed: true,
    }),
    toggleTheme: () => calls.push('theme'),
    refreshSync: () => calls.push('refresh-sync'),
  },
  documentRoot: {
    documentElement: { getAttribute: () => 'dark' },
    getElementById: id => id === 'mainContent' ? main : null,
  },
});

render();
assert.match(main.innerHTML, /id="settingsPage"/);
assert.match(main.innerHTML, /Test Reader/);
assert.match(main.innerHTML, /reader@example\.com/);
assert.match(main.innerHTML, /Sync status: On/);
assert.match(main.innerHTML, /Device ID/);
assert.match(main.innerHTML, /device-1/);
assert.doesNotMatch(main.innerHTML, /onclick=|onchange=/);

const click = listeners.get('click');
click({ target: { closest: () => ({ dataset: { action: 'toggle-theme' } }) } });
click({ target: { closest: () => ({ dataset: { action: 'refresh-sync' } }) } });
assert.deepEqual(calls, ['theme', 'refresh-sync']);

console.log('Settings page tests passed');
