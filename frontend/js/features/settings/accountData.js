import { LIBRIQ, createBook } from '../../data.js';
import { Storage } from '../../storage.js';
import { Utils } from '../../utils.js';
import { confirmAction, confirmTypedAction, requestPassword } from '../../components/ui/confirmation.js';
import { deleteAccountWithReauth, reauthMethodFor } from '../../services/accountDeletion.js';
import { LibriqFirebase } from '../../firebase-client.js';
import { LibriqCloudBackup } from '../../cloudBackup.js';
import { createImportMerge } from '../../services/importMerge.js';
import { createExportPayload, parseBackupText, serializeBackup, validateBackup } from '../../services/backupSerialization.js';
import { createBrowserDownloadFile, createImportExportService, MAX_IMPORT_FILE_BYTES, readBrowserFileText } from '../../services/importExportService.js';
import { Navigation } from '../../navigation.js';

const importMerge = createImportMerge({
  createBook,
  statuses: LIBRIQ.STATUS,
  now: () => new Date().toISOString(),
  createId: () => crypto.randomUUID(),
});
export const summarizeLibrary = importMerge.summarizeLibrary;
const _summarizeLibrary = summarizeLibrary;
const _mergeBooksForImport = importMerge.mergeBooksForImport;
const _mergeActivityById = importMerge.mergeActivityById;
const importExportService = createImportExportService({
  storage: Storage,
  constants: LIBRIQ,
  createBook,
  createExportPayload,
  serializeBackup,
  parseBackupText,
  validateBackup,
  downloadFile: createBrowserDownloadFile({ BlobCtor: globalThis.Blob, urlApi: globalThis.URL, documentRoot: globalThis.document }),
  readFileText: readBrowserFileText,
  clock: () => new Date(),
  createId: () => crypto.randomUUID(),
});

function _buildBackupStatsMarkup(entries) {
  return `<dl class="backup-review-summary">${entries.map(([label, value]) => `<div><dt>${Utils.sanitize(label)}</dt><dd>${Utils.sanitize(String(value))}</dd></div>`).join('')}</dl>`;
}

function _buildBackupMetadataMarkup(entries) {
  return `<dl class="backup-review-metadata">${entries.map(([label, value]) => `<div><dt>${Utils.sanitize(label)}</dt><dd>${Utils.sanitize(String(value))}</dd></div>`).join('')}</dl>`;
}

function _openBackupReview(modal, { cancel, close, merge, replace }, onClose = () => {}) {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    modal.removeEventListener('dialog:close', cleanup);
    Utils.hide(modal);
    replace.onclick = null;
    merge.onclick = null;
    cancel.onclick = null;
    close.onclick = null;
    onClose();
  };
  modal.addEventListener('dialog:close', cleanup);
  cancel.onclick = cleanup;
  close.onclick = cleanup;
  Utils.show(modal);
  queueMicrotask(() => cancel.focus());
  return cleanup;
}

function _buildRestoreSummaryMarkup(label, summary, extra = []) {
  return `
    <section class="whats-new-item">
      <div class="whats-new-item-title">${Utils.sanitize(label)}</div>
      ${_buildBackupStatsMarkup([
        ['Books', summary.bookCount], ['Reading', summary.readingCount], ['Finished', summary.finishedCount],
        ['Notes', summary.notesCount], ['Quotes', summary.quotesCount],
        ...(summary.activityCount !== null ? [['Activity', summary.activityCount]] : []),
      ])}
      ${_buildBackupMetadataMarkup([
        ...(summary.lastUpdatedAt ? [['Last updated', Utils.formatDate(summary.lastUpdatedAt)]] : []),
        ...extra,
      ])}
    </section>`;
}

export async function openCloudRestorePreview() {
  const firebase = LibriqFirebase.getState();
  if (!firebase.user || !LibriqFirebase.hasFirestore()) return restoreFromCloud();
  const currentBooks = Storage.getBooks();
  let docData = null;
  try {
    const snap = await LibriqFirebase.readBackupDoc(['users', firebase.user.uid, 'backups', 'current']);
    if (!snap?.exists?.()) {
      Utils.toast('No cloud backup found yet.', 'info');
      return;
    }
    docData = LibriqCloudBackup.normalizeBackup(snap.data());
  } catch (err) {
    console.error('[Libriq] Cloud restore preview failed:', err);
    Utils.toast('Could not load the cloud backup preview.', 'error');
    return;
  }
  if (!docData) {
    Utils.toast('The cloud backup data is invalid.', 'error');
    return;
  }
  const currentSummary = _summarizeLibrary(currentBooks, Storage.getActivityLog?.() || []);
  const cloudSummary = _summarizeLibrary(docData.data.books, docData.data.activity);
  const cloudIsOlder = Boolean(currentSummary.lastUpdatedAt && docData.updatedAt && new Date(docData.updatedAt).getTime() < new Date(currentSummary.lastUpdatedAt).getTime());
  const modal = document.getElementById('backupImportModal');
  const body = document.getElementById('backupImportBody');
  const title = document.getElementById('backupImportTitle');
  const subtitle = document.getElementById('backupImportSubtitle');
  const cancel = document.getElementById('backupImportCancel');
  const merge = document.getElementById('backupImportMerge');
  const replace = document.getElementById('backupImportReplace');
  const close = document.getElementById('closeBackupImport');
  if (!modal || !body || !title || !subtitle || !cancel || !merge || !replace || !close) return;
  title.textContent = 'Review before restoring';
  modal.dataset.backupMode = 'cloud-restore';
  subtitle.textContent = 'Cloud restore replaces the library on this device. Export a JSON copy first if you want a safety copy.';
  body.innerHTML = `
    <div class="backup-review-context"><span>Cloud backup</span><span>Review before applying</span></div>
    <div class="whats-new-list">
      ${_buildRestoreSummaryMarkup('Local library', currentSummary)}
      ${_buildRestoreSummaryMarkup('Cloud backup', cloudSummary, [
        ['Backup version', docData.backupVersion ?? 'Unknown'],
        ['App version', docData.appVersion ?? docData.version ?? 'Unknown'],
        ['Schema', docData.schemaVersion ?? 'Unknown'],
        ['Device ID', docData.deviceId ?? 'Unknown'],
      ])}
      ${cloudIsOlder ? `<section class="whats-new-item"><div class="whats-new-item-title">Warning</div><p>This cloud backup may be older than your current library.</p></section>` : ''}
    </div>
  `;
  merge.textContent = 'Export local JSON first';
  replace.textContent = 'Restore cloud backup';
  cancel.textContent = 'Cancel';
  const cleanup = _openBackupReview(modal, { cancel, close, merge, replace });

  merge.onclick = async () => {
    await exportData();
  };
  replace.onclick = async () => {
    cleanup();
    await new Promise(resolve => requestAnimationFrame(resolve));
    await confirmAndRestoreCloud(docData, currentSummary);
  };
}

export async function openCloudMergePreview() {
  const firebase = LibriqFirebase.getState();
  if (!firebase.user || !LibriqFirebase.hasFirestore()) return;

  const currentBooks = Storage.getBooks();
  let docData = null;
  try {
    const snap = await LibriqFirebase.readBackupDoc(['users', firebase.user.uid, 'backups', 'current']);
    if (!snap?.exists?.()) {
      Utils.toast('No cloud backup found yet.', 'info');
      return;
    }
    docData = LibriqCloudBackup.normalizeBackup(snap.data());
  } catch (err) {
    console.error('[Libriq] Cloud merge preview failed:', err);
    Utils.toast('Could not load the cloud backup preview.', 'error');
    return;
  }
  if (!docData) {
    Utils.toast('Couldn\'t read this cloud backup. Your local data was not changed.', 'error');
    return;
  }

  const currentSummary = _summarizeLibrary(currentBooks, Storage.getActivityLog?.() || []);
  const cloudSummary = _summarizeLibrary(docData.data.books, docData.data.activity);
  const plan = LibriqCloudBackup.previewMerge(docData, currentBooks);
  const modal = document.getElementById('backupImportModal');
  const body = document.getElementById('backupImportBody');
  const title = document.getElementById('backupImportTitle');
  const subtitle = document.getElementById('backupImportSubtitle');
  const cancel = document.getElementById('backupImportCancel');
  const merge = document.getElementById('backupImportMerge');
  const replace = document.getElementById('backupImportReplace');
  const close = document.getElementById('closeBackupImport');
  if (!modal || !body || !title || !subtitle || !cancel || !merge || !replace || !close) return;

  title.textContent = 'Review before merging';
  modal.dataset.backupMode = 'cloud-merge';
  subtitle.textContent = 'Merge adds safe cloud-only items without replacing local conflicts. Export a JSON copy first if you want a safety copy.';
  body.innerHTML = `
    <div class="backup-review-context"><span>Cloud backup</span><span>Review before applying</span></div>
    <div class="whats-new-list">
      ${_buildRestoreSummaryMarkup('Local library', currentSummary)}
      ${_buildRestoreSummaryMarkup('Cloud backup', cloudSummary, [
        ['Backup version', docData.backupVersion ?? 'Unknown'],
        ['App version', docData.appVersion ?? docData.version ?? 'Unknown'],
        ['Schema', docData.schemaVersion ?? 'Unknown'],
        ['Device ID', docData.deviceId ?? 'Unknown'],
      ])}
      <section class="whats-new-item">
        <div class="whats-new-item-title">Merge result preview</div>
        ${_buildBackupStatsMarkup([
          ['New books to add from cloud', plan.newBooksToAdd.length], ['Local books kept', plan.localBooksKept.length],
          ['Duplicates skipped', plan.duplicatesSkipped.length], ['Possible conflicts', plan.conflicts.length],
          ['Notes to add safely', plan.notesToAdd], ['Quotes to add safely', plan.quotesToAdd], ['Items unchanged', plan.itemsUnchanged],
        ])}
      </section>
      ${plan.conflicts.length ? `<section class="whats-new-item"><div class="whats-new-item-title">Conflict notice</div><p>Some items looked different on this device and in your cloud backup. LibriQ kept this device's version for now.</p></section>` : ''}
    </div>
  `;
  merge.textContent = 'Merge cloud with this device';
  replace.textContent = 'Export local JSON first';
  cancel.textContent = 'Cancel';
  const cleanup = _openBackupReview(modal, { cancel, close, merge, replace });

  replace.onclick = async () => {
    await exportData();
  };
  merge.onclick = async () => {
    cleanup();
    await new Promise(resolve => requestAnimationFrame(resolve));
    await confirmAndMergeCloud(docData, plan, currentSummary);
  };
}

export async function confirmAndRestoreCloud(docData, currentSummary) {
  const proceed = await confirmAction('Restoring will replace this device\'s current library with the cloud backup. Continue?', { title: 'Restore cloud backup?', confirmLabel: 'Continue to restore' });
  if (!proceed) return;
  if (currentSummary.bookCount > 0 && !await confirmAction('This cloud restore will overwrite your local library. Export first if you want a safety copy. Restore now?', { title: 'Export a safety copy first', confirmLabel: 'Restore now' })) {
    return;
  }
  await restoreFromCloud(docData);
}

async function confirmAndMergeCloud(docData, plan, currentSummary) {
  const proceed = await confirmAction('Merge cloud with this device? LibriQ will add safe cloud-only items and keep this device\'s version for conflicts.', { title: 'Merge cloud with this device?', confirmLabel: 'Continue to merge', tone: 'default' });
  if (!proceed) return;
  if (currentSummary.bookCount > 0 && !await confirmAction('Export first if you want a safety copy. Apply the merge now?', { title: 'Export a safety copy first', confirmLabel: 'Apply merge', tone: 'default' })) {
    return;
  }
  await mergeCloudWithThisDevice(docData, plan);
}

export async function exportData() {
  const result = importExportService.exportCurrentLibrary();
  const { payload: data, exportedAt, activityCount } = result;
  Storage.saveBackupMeta?.({ lastExportedAt: exportedAt });
  Storage.addActivityEvent?.(Storage.buildActivityEvent?.('backup_exported', null, { itemCount: data.data.books.length, activityCount }, 'export'));
  Utils.toast('Library exported', 'success');
  if (document.getElementById('mainContent')?.querySelector('#importLibraryInput')) {
    try {
      Navigation.renderCurrentPage?.();
    } catch (uiErr) {
      console.warn('[Libriq] Export UI refresh failed:', uiErr);
    }
  }
}

async function mergeCloudWithThisDevice(docData, plan) {
  const firebase = LibriqFirebase.getState();
  if (!firebase.user) {
    Utils.toast('Sign in first to merge from cloud.', 'warning');
    return;
  }
  if (!LibriqFirebase.hasFirestore()) {
    Utils.toast('Cloud backup is unavailable right now.', 'error');
    return;
  }
  if (!docData?.data || !Array.isArray(docData.data.books)) {
    Utils.toast('Couldn\'t read this cloud backup. Your local data was not changed.', 'error');
    return;
  }

  const result = LibriqCloudBackup.applyMerge(docData, plan);
  if (!result.ok) {
    Utils.toast('Couldn\'t read this cloud backup. Your local data was not changed.', 'error');
    return;
  }
  Utils.toast('Cloud merge completed', 'success');
  try {
    Navigation.updateBadges?.();
    Navigation.renderCurrentPage?.();
  } catch (uiErr) {
    console.warn('[Libriq] Cloud merge UI refresh failed:', uiErr);
  }
}

export async function backupToCloud() {
  const firebase = LibriqFirebase.getState();
  if (!firebase.user) {
    Utils.toast('Sign in first to use cloud backup.', 'warning');
    return;
  }
  if (!LibriqFirebase.hasFirestore()) {
    Utils.toast('Cloud backup is unavailable right now.', 'error');
    return;
  }
  const ok = await LibriqCloudBackup.runBackup('manual', false);
  if (ok) {
    Utils.toast('Cloud backup saved', 'success');
    try {
      Navigation.renderCurrentPage?.();
    } catch (uiErr) {
      console.warn('[LibriQ] Cloud backup UI refresh failed:', uiErr);
    }
  }
}

async function restoreFromCloud(preloadedDoc = null) {
  const firebase = LibriqFirebase.getState();
  if (!firebase.user) {
    Utils.toast('Sign in first to restore from cloud.', 'warning');
    return;
  }
  if (!LibriqFirebase.hasFirestore()) {
    Utils.toast('Cloud backup is unavailable right now.', 'error');
    return;
  }

  let docData = preloadedDoc;
  try {
    if (!docData) {
      const snap = await LibriqFirebase.readBackupDoc(['users', firebase.user.uid, 'backups', 'current']);
      if (!snap?.exists?.()) {
        Utils.toast('No cloud backup found yet.', 'info');
        return;
      }
      docData = LibriqCloudBackup.normalizeBackup(snap.data());
    }
    if (!docData) {
      Utils.toast("Couldn't restore this backup. Your local data was not changed.", 'error');
      return;
    }
  } catch (err) {
    console.error('[Libriq] Cloud restore failed:', err);
    const code = String(err?.code || err?.message || '').toLowerCase();
    if (code.includes('permission-denied')) {
      Utils.toast('You do not have permission to read this cloud backup.', 'error');
    } else if (code.includes('unauthenticated') || code.includes('authentication-required')) {
      Utils.toast('Please sign in again before restoring your cloud backup.', 'error');
    } else if (code.includes('unavailable') || code.includes('network')) {
      Utils.toast('Network error while loading cloud backup.', 'error');
    } else {
      Utils.toast("Couldn't restore this backup. Your local data was not changed.", 'error');
    }
    return;
  }

  let result;
  try {
    result = LibriqCloudBackup.applyRestore(docData);
  } catch (err) {
    console.error('[Libriq] Cloud restore local replacement failed:', err);
    Utils.toast("Couldn't restore this backup. Your local data was not changed.", 'error');
    return;
  }
  if (!result?.ok) {
    Utils.toast("Couldn't restore this backup. Your local data was not changed.", 'error');
    return;
  }

  Utils.toast('Cloud backup restored', 'success');
  try {
    Navigation.updateBadges?.();
    Navigation.renderCurrentPage?.();
  } catch (uiErr) {
    console.warn('[Libriq] Cloud restore UI refresh failed:', uiErr);
  }
}

export function promptImportData() {
  document.getElementById('importLibraryInput')?.click();
}

export async function importDataFromFile(file) {
  if (!file) return;
  if (typeof file.size === 'number' && file.size > MAX_IMPORT_FILE_BYTES) {
    Utils.toast(`Import file is too large (max ${Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)} MB).`, 'error');
    return;
  }
  const result = await importExportService.parseImportFile(file);
  if (!result.ok && result.reason === 'file-too-large') {
    Utils.toast(`Import file is too large (max ${Math.round(MAX_IMPORT_FILE_BYTES / 1024 / 1024)} MB).`, 'error');
    return;
  }
  if (!result.ok && result.reason === 'invalid-json') {
    Utils.toast('That file is not valid JSON.', 'error');
    return;
  }
  if (!result.ok) {
    Utils.toast('That file is not a valid LibriQ backup.', 'error');
    return;
  }
  _openImportPreview(file, result.payload);
}

function _openImportPreview(file, parsed) {
  const modal = document.getElementById('backupImportModal');
  const body = document.getElementById('backupImportBody');
  const title = document.getElementById('backupImportTitle');
  const subtitle = document.getElementById('backupImportSubtitle');
  const cancel = document.getElementById('backupImportCancel');
  const merge = document.getElementById('backupImportMerge');
  const replace = document.getElementById('backupImportReplace');
  const close = document.getElementById('closeBackupImport');
  if (!modal || !body || !title || !subtitle || !cancel || !merge || !replace || !close) return;

  const importedBooks = Array.isArray(parsed?.data?.books) ? parsed.data.books : [];
  const importedActivity = Array.isArray(parsed?.data?.activity) ? parsed.data.activity.filter(Boolean) : [];
  const localBooks = Storage.getBooks();
  const backupVersion = parsed?.version || 'Unknown';
  const exportedAt = parsed?.exportedAt || null;

  title.textContent = 'Import Backup Preview';
  modal.dataset.backupMode = 'local';
  subtitle.textContent = 'Choose how to apply this backup to your local library.';
  body.innerHTML = `
    <div class="backup-review-context"><span>Local JSON backup</span><span>${Utils.sanitize(file.name)}</span></div>
    <div class="whats-new-list">
      <section class="whats-new-item">
        <div class="whats-new-item-title">Backup details</div>
        ${_buildBackupMetadataMarkup([['Exported', exportedAt ? Utils.formatDate(exportedAt) : 'Unknown'], ['Version', backupVersion]])}
      </section>
      <section class="whats-new-item">
        <div class="whats-new-item-title">Contents</div>
        ${_buildBackupStatsMarkup([['Books in backup', importedBooks.length], ['Current local books', localBooks.length], ['Backup activity events', importedActivity.length]])}
      </section>
      <section class="whats-new-item">
        <div class="whats-new-item-title">What happens next</div>
        <p>Replace swaps your local library with the backup. Merge keeps your current data and combines obvious duplicates safely.</p>
      </section>
    </div>
  `;

  const cleanup = _openBackupReview(modal, { cancel, close, merge, replace }, () => {
    title.textContent = 'Import Backup';
    subtitle.textContent = 'Review the backup before choosing how to apply it.';
    replace.textContent = 'Replace local library';
    merge.textContent = 'Merge with current library';
    cancel.textContent = 'Cancel';
    replace.onclick = null;
    merge.onclick = null;
    cancel.onclick = null;
    close.onclick = null;
    modal.onclick = null;
    const input = document.getElementById('importLibraryInput');
    if (input) input.value = '';
  });

  const runImport = (replaceMode) => {
    cleanup();
    _applyImportedBackup(parsed, replaceMode);
  };

  replace.textContent = 'Replace local library';
  merge.textContent = 'Merge with current library';
  cancel.textContent = 'Cancel';
  replace.onclick = () => runImport(true);
  merge.onclick = () => runImport(false);
}

function _applyImportedBackup(parsed, replaceMode) {
  const importedBooks = Array.isArray(parsed?.data?.books) ? parsed.data.books.map(book => createBook(book)) : [];
  const importedActivity = Array.isArray(parsed?.data?.activity) ? parsed.data.activity.filter(Boolean) : [];
  const currentBooks = Storage.getBooks();
  const mergedBooks = replaceMode ? importedBooks : _mergeBooksForImport(currentBooks, importedBooks);
  const mergedActivity = replaceMode ? importedActivity : _mergeActivityById(Storage.getActivityLog?.() || [], importedActivity);

  Storage.saveBooks(mergedBooks);

  if (parsed.data.profile && typeof parsed.data.profile === 'object') {
    Storage.saveProfile(parsed.data.profile);
  }
  if (parsed.data.goals && typeof parsed.data.goals === 'object') {
    Storage.saveGoals(parsed.data.goals);
  }
  if (parsed.data.streak && typeof parsed.data.streak === 'object') {
    Storage.saveStreak?.(parsed.data.streak);
  }
  Storage.replaceActivityLog?.(mergedActivity);
  Storage.addActivityEvent?.(Storage.buildActivityEvent?.('backup_imported', null, { itemCount: mergedBooks.length, activityCount: mergedActivity.length, mode: replaceMode ? 'replace' : 'merge' }, 'import'));

  Storage.updateOnboarding({ imported: true });
  Utils.toast(replaceMode ? 'Library replaced from backup' : 'Library merged from backup', 'success');
  try {
    Navigation.updateBadges?.();
    Navigation.renderCurrentPage?.();
  } catch (uiErr) {
    console.warn('[Libriq] Import UI refresh failed:', uiErr);
  }
}

function confirmDangerAction(options) {
  return confirmTypedAction(options);
}

export async function clearLocalCache() {
  const confirmed = await confirmDangerAction({
    title: 'Clear local cache?',
    body: 'This will remove this device\'s local cache only. It will not delete your cloud library or account.',
    prompt: 'Type CLEAR CACHE to continue',
    expected: 'CLEAR CACHE',
    actionLabel: 'Clear cache',
  });
  if (!confirmed) return;
  const firebase = LibriqFirebase.getState();
  if (firebase.user?.uid) {
    Storage.clearAccountScopedData?.(firebase.user.uid, { keys: ['BOOKS', 'ACTIVITY', 'STREAK', 'GOALS', 'BACKUP', 'CLOUD_BACKUP', 'SYNC_META', 'SYNC_TOMBSTONES'] });
  }
  Utils.toast('Local cache cleared.', 'info');
  Navigation.renderCurrentPage?.();
  Navigation.updateBadges?.();
}

// Saved book covers are shared by every account on the device, so they go too.
const COVER_CACHE = 'libriq-covers-v1';

export async function signOutAndRemoveDeviceData() {
  const uid = LibriqFirebase.getState().user?.uid;
  if (!uid) return;
  const sync = window.LibriqSyncBeta?.getState?.() || {};
  const unsynced = (sync.pendingBookIds?.length || 0) + (sync.pendingDeleteIds?.length || 0);
  const confirmed = await confirmAction(
    'This signs you out and deletes this account’s books, notes, goals and saved covers from this device. Your library in the cloud and your account stay as they are.',
    {
      title: 'Sign out and remove from this device?',
      confirmLabel: 'Sign out and remove',
      detail: unsynced
        ? `${unsynced} ${unsynced === 1 ? 'change hasn’t' : 'changes haven’t'} synced yet and will be lost.`
        : '',
    },
  );
  if (!confirmed) return;
  try {
    window.LibriqSyncBeta?.detachForAccountSwitch?.('remove-device-data');
    await LibriqFirebase.signOut();
  } catch (err) {
    console.warn('[Libriq] Sign out before removing device data failed:', err);
    window.LibriqSyncBeta?.refresh?.();
    Utils.toast('Could not sign out right now, so nothing was removed.', 'error');
    return;
  }
  // Leave the account's scope first, so nothing that runs while the auth
  // listener catches up writes defaults back under the removed account.
  Storage.clearActiveAccountScope?.();
  Storage.clearAccountScopedData?.(uid);
  try {
    await globalThis.caches?.delete(COVER_CACHE);
  } catch (err) {
    console.warn('[Libriq] Cover cache cleanup failed:', err);
  }
  Navigation.setSessionPreference?.('prompt');
  Navigation.clearAccountResume?.();
  Utils.toast('Signed out. Your data was removed from this device.', 'success');
}

export async function confirmDeleteLibraryData() {
  const firebase = LibriqFirebase.getState();
  if (!firebase.user?.uid) {
    Utils.toast('Sign in first to delete library data.', 'warning');
    return;
  }
  const confirmed = await confirmDangerAction({
    title: 'Delete library data?',
    body: 'This permanently removes your books, notes, progress, activity, streak, and cloud backup for this account. This cannot be undone.',
    prompt: 'Type DELETE to continue',
    expected: 'DELETE',
    actionLabel: 'Delete library data',
  });
  if (!confirmed) return;
  try {
    window.LibriqSyncBeta?.detachForAccountSwitch?.('delete-library-data');
    await LibriqFirebase.deleteCurrentUserLibraryData();
    Storage.clearAccountScopedData?.(firebase.user.uid, { keys: ['BOOKS', 'ACTIVITY', 'STREAK', 'GOALS', 'BACKUP', 'CLOUD_BACKUP', 'SYNC_META', 'SYNC_TOMBSTONES'] });
    Navigation.updateBadges?.();
    Navigation.renderCurrentPage?.();
    Utils.toast('Library data deleted.', 'success');
  } catch (err) {
    console.warn('[Libriq] Delete library data failed:', err);
    Utils.toast('Could not delete library data right now.', 'error');
  }
}

export async function confirmDeleteAccount() {
  const firebase = LibriqFirebase.getState();
  if (!firebase.user?.uid) {
    Utils.toast('Sign in first to delete your account.', 'warning');
    return;
  }
  const confirmed = await confirmDangerAction({
    title: 'Delete account?',
    body: 'This permanently deletes your LibriQ account and all reading data connected to it. This cannot be undone.',
    prompt: 'Type DELETE ACCOUNT to continue',
    expected: 'DELETE ACCOUNT',
    actionLabel: 'Delete account',
  });
  if (!confirmed) return;
  try {
    window.LibriqSyncBeta?.detachForAccountSwitch?.('delete-account');
    const result = await deleteAccountWithReauth({
      deleteAccount: () => LibriqFirebase.deleteCurrentUserAccount(),
      confirmIdentity: () => confirmIdentityForDelete(),
    });
    if (result === 'cancelled') {
      window.LibriqSyncBeta?.refresh?.();
      return;
    }
    Storage.clearAccountScopedData?.(firebase.user.uid, { keys: ['BOOKS', 'ACTIVITY', 'PROFILE', 'STREAK', 'GOALS', 'BACKUP', 'CLOUD_BACKUP', 'SYNC_META', 'SYNC_TOMBSTONES'] });
    Storage.clearActiveAccountScope?.();
    Navigation.goTo('session');
    Utils.toast('Account deleted.', 'success');
  } catch (err) {
    // Deletion stopped; reconnect sync so this device keeps syncing.
    window.LibriqSyncBeta?.refresh?.();
    const code = String(err?.code || '');
    if (code.includes('wrong-password') || code.includes('invalid-credential')) {
      Utils.toast('That password didn’t match. Your account was not deleted.', 'error');
    } else if (code.includes('popup-closed-by-user') || code.includes('cancelled-popup-request')) {
      Utils.toast('Google sign-in was closed. Your account was not deleted.', 'info');
    } else if (code.includes('popup-blocked')) {
      Utils.toast('Your browser blocked the Google sign-in popup. Allow popups for LibriQ and try again.', 'warning');
    } else if (code.includes('too-many-requests')) {
      Utils.toast('Too many attempts. Wait a few minutes and try again.', 'warning');
    } else {
      console.warn('[Libriq] Delete account failed:', err);
      Utils.toast('Could not delete your account right now.', 'error');
    }
  }
}

// Deleting an account needs a recent sign-in. Ask for it in place: the
// password for email accounts, the Google popup for Google accounts.
async function confirmIdentityForDelete() {
  const user = LibriqFirebase.getCurrentAuthUser ? await LibriqFirebase.getCurrentAuthUser() : null;
  const info = LibriqFirebase.getUserEmailAuthInfo(user) || {};
  const method = reauthMethodFor(info);
  if (method === 'password') {
    const password = await requestPassword({
      message: 'For your security, enter your password to delete your account.',
      email: info.email,
      actionLabel: 'Delete account',
    });
    if (password == null) return false;
    return LibriqFirebase.reauthenticateCurrentUser({ password });
  }
  if (method === 'google') {
    const ok = await confirmAction('For your security, confirm with Google to delete your account.', {
      title: 'Confirm it’s you',
      confirmLabel: 'Continue with Google',
      tone: 'default',
    });
    if (!ok) return false;
    return LibriqFirebase.reauthenticateCurrentUser();
  }
  return false;
}

export function clearAllData() {
  return clearLocalCache();
}
