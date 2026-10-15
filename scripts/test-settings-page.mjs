import assert from 'node:assert/strict';
import { createSettingsPage } from '../frontend/js/features/settings/settingsPage.js';

const listeners = new Map();
const main = {
  innerHTML: '',
  addEventListener(type, handler) { listeners.set(type, handler); },
};
const calls = [];
const user = { uid: 'user-1', displayName: 'Test Reader', email: 'reader@example.com', photoURL: '' };
let firebaseState = { initialized: true, available: true, user };
let sessionPreference = 'account';
let firestore = true;
const render = createSettingsPage({
  storage: {
    getBackupMeta: () => ({ lastExportedAt: '2026-01-01T00:00:00Z' }),
    getCloudBackupMeta: () => ({ lastCloudBackupAt: '2026-01-02T00:00:00Z', bookCount: 9 }),
    getBooks: () => [{ id: 'book-1' }],
  },
  utils: {
    sanitize: value => String(value ?? ''),
    formatDate: value => `date:${value}`,
  },
  constants: { VERSION: '4.7.0' },
  actions: {
    getActiveTheme: () => 'dark',
    getFirebaseState: () => firebaseState,
    getUserEmailAuthInfo: () => ({
      email: user.email, emailVerified: true, hasPasswordProvider: false,
      hasEmail: true, providerData: [{ providerId: 'google.com' }],
    }),
    getCloudBackupState: () => ({ status: 'ready', message: 'Cloud backup active', lastSavedAt: '2026-01-02T00:00:00Z' }),
    formatLastSavedLabel: () => 'Last backed up: recently',
    hasFirestore: () => firestore,
    getCurrentUser: () => user,
    getSessionPreference: () => sessionPreference,
    getDisplayName: () => 'Test Reader',
    getSyncState: () => ({
      enabled: true, status: 'ready', listenerAttached: true,
      deviceId: 'device-1', syncPath: 'users/user-1/books',
      lastSnapshotAt: '2026-01-03T00:00:00Z', lastWriteAt: '2026-01-03T00:00:00Z',
      pendingBookIds: [], pendingDeleteIds: [], tombstoneCount: 0, eligibilityAllowed: true,
    }),
    toggleTheme: () => calls.push('theme'),
    refreshSync: () => calls.push('refresh-sync'),
    openGoodreadsImport: () => calls.push('goodreads-import'),
    openKindleImport: () => calls.push('kindle-import'),
    exportData: () => calls.push('export'),
    promptImportData: () => calls.push('import'),
    confirmDeleteLibraryData: () => calls.push('confirm-library'),
    confirmDeleteAccount: () => calls.push('confirm-account'),
    backupToCloud: () => calls.push('backup'),
    openCloudRestorePreview: () => calls.push('restore-preview'),
    openCloudMergePreview: () => calls.push('merge-preview'),
    toggleSync: enabled => calls.push(`sync:${enabled}`),
    accountAction: mode => calls.push(`account:${mode}`),
    importDataFromFile: file => calls.push(file),
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
assert.match(main.innerHTML, /Import Goodreads CSV/);
assert.match(main.innerHTML, /Import Kindle Clippings/);
assert.match(main.innerHTML, /Library snapshot[\s\S]*9 books/);
assert.match(main.innerHTML, /Account required/);
assert.match(main.innerHTML, /LibriQ requires an account/);
assert.match(main.innerHTML, /data-theme-choice="dark" aria-pressed="true"/);
assert.match(main.innerHTML, /data-theme-choice="light" aria-pressed="false"/);
assert.doesNotMatch(main.innerHTML, /optional account|accounts are optional|works without an account|Alex Morgan|2\.4 MB|200 OK/i);
assert.doesNotMatch(main.innerHTML, /onclick=|onchange=/);

const click = listeners.get('click');
click({ target: { closest: () => ({ dataset: { action: 'toggle-theme' } }) } });
click({ target: { closest: () => ({ dataset: { action: 'refresh-sync' } }) } });
click({ target: { closest: () => ({ dataset: { action: 'open-goodreads-import' } }) } });
click({ target: { closest: () => ({ dataset: { action: 'open-kindle-import' } }) } });
assert.deepEqual(calls, ['theme', 'refresh-sync', 'goodreads-import', 'kindle-import']);
calls.length = 0;
const action = (action, data = {}, disabled = false) => click({ target: { closest: () => ({ dataset: { action, ...data }, disabled }) } });
action('choose-theme', { themeChoice: 'dark' });
assert.deepEqual(calls, [], 'Choosing the active theme must not toggle it');
action('choose-theme', { themeChoice: 'light' });
for (const name of ['export-data', 'prompt-import', 'delete-library', 'delete-account', 'backup-cloud', 'restore-cloud', 'merge-cloud']) action(name);
action('toggle-sync', { syncEnabled: '1' });
action('account-action', { accountAction: 'signout' });
assert.deepEqual(calls, ['theme', 'export', 'import', 'confirm-library', 'confirm-account', 'backup', 'restore-preview', 'merge-preview', 'sync:true', 'account:signout']);
action('backup-cloud', {}, true);
assert.equal(calls.length, 10, 'Disabled controls must not execute');
const file = { name: 'backup.json' };
listeners.get('change')({ target: { matches: () => true, files: [file] } });
assert.equal(calls.at(-1), file);
render();
assert.equal(listeners.get('click'), click, 'Only one delegated listener after rerender');
sessionPreference = 'offline';
render();
assert.match(main.innerHTML, /data-action="toggle-sync" disabled/);
assert.match(main.innerHTML, /Offline mode: books stay on this device/);
firestore = false;
render();
assert.match(main.innerHTML, /Cloud backup is unavailable right now/);
assert.doesNotMatch(main.innerHTML, /id="cloudBackupSaveBtn"/);
firebaseState = { initialized: false, available: false, user: null };
render();
assert.match(main.innerHTML, /Loading account status/);
firebaseState = { initialized: true, available: true, user: null };
render();
assert.match(main.innerHTML, /Sign in to your required LibriQ account/);

console.log('Settings page tests passed');
