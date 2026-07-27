import { LibriqFirebase } from './firebase-client.js';

const STATUS = {
  IDLE: 'idle',
  SCHEDULED: 'scheduled',
  SAVING: 'saving',
  BACKED_UP: 'backed_up',
  FAILED: 'failed',
  PAUSED: 'paused',
};

let initialized = false;
let debounceTimer = null;
let backupInFlight = null;
let pendingReason = null;
let lastStatus = STATUS.IDLE;
let lastMessage = '';
let lastSavedAt = null;
let lastError = null;
let paused = false;
let suppressScheduling = false;
let manualSaving = false;
let autoBackupInProgress = false;
let suppressAutoBackupUntil = 0;
let activeUid = null;
let getSessionPreference = () => null;
let getCurrentPage = () => null;
let getSyncState = () => ({});

function debugEnabled() {
  return Boolean(globalThis.localStorage?.getItem('libriq_debug_auto_backup'));
}

function logDebug(message, details = null) {
  if (!debugEnabled()) return;
  if (details == null) console.debug('[LibriQ][AutoBackup]', message);
  else console.debug('[LibriQ][AutoBackup]', message, details);
}

function emitState() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('libriq:cloud-backup-status-changed', { detail: getState() }));
  }
}

function setStatus(status, message = '', error = null) {
  lastStatus = status;
  lastMessage = message;
  lastError = error;
  if (status === STATUS.BACKED_UP) lastSavedAt = new Date().toISOString();
  emitState();
}

function getBackupPath(uid) {
  return ['users', uid, 'backups', 'current'];
}

function shouldSuppressAutoBackup() {
  return Date.now() < suppressAutoBackupUntil;
}

function isEligible() {
  const firebase = LibriqFirebase.getState();
  return Boolean(
    firebase.available &&
    firebase.ready &&
    firebase.user?.uid &&
    LibriqFirebase.hasFirestore() &&
    getSessionPreference() !== 'offline' &&
    getCurrentPage() !== 'session' &&
    !globalThis.document?.body?.classList?.contains('session-choice-active') &&
    globalThis.navigator?.onLine !== false &&
    !paused &&
    !shouldSuppressAutoBackup()
  );
}

function buildPayload() {
  const activity = Storage.getActivityLog?.() || [];
  const books = Storage.getBooks();
  const createdAt = new Date().toISOString();
  const lastLocalUpdatedAt = books.reduce((latest, book) => {
    const time = new Date(book?.updatedAt || book?.createdAt || book?.dateFinished || book?.dateStarted || book?.dateAdded || 0).getTime();
    return Number.isFinite(time) && time > latest ? time : latest;
  }, 0);
  return {
    app: 'LibriQ',
    version: LIBRIQ.VERSION,
    backupVersion: 4,
    appVersion: LIBRIQ.VERSION,
    schemaVersion: 2,
    deviceId: Storage.getDeviceId?.(),
    createdAt,
    updatedAt: createdAt,
    bookCount: books.length,
    notesCount: books.reduce((sum, book) => sum + (book?.notes ? 1 : 0), 0),
    quotesCount: books.reduce((sum, book) => sum + (Array.isArray(book?.quotes) ? book.quotes.length : 0), 0),
    activityCount: activity.length,
    lastLocalUpdatedAt: lastLocalUpdatedAt ? new Date(lastLocalUpdatedAt).toISOString() : null,
    syncReady: false,
    data: {
      books,
      profile: Storage.getProfile(),
      goals: Storage.getGoals(),
      streak: Storage.getStreak(),
      activity,
    },
  };
}

async function performBackup(reason = 'manual', automatic = false) {
  if (!isEligible()) {
    setStatus(STATUS.PAUSED, getSessionPreference() === 'offline' ? 'Offline mode: cloud backup paused' : 'Sign in to enable cloud backup');
    return false;
  }
  const firebase = LibriqFirebase.getState();
  const uid = firebase.user.uid;
  activeUid = uid;
  const payload = buildPayload();
  const docData = {
    app: payload.app,
    version: payload.version,
    backupVersion: payload.backupVersion,
    bookCount: payload.data.books.length,
    activityCount: payload.data.activity.length,
    data: payload.data,
    updatedAt: new Date().toISOString(),
    backupMode: automatic ? 'automatic' : 'manual',
  };
  manualSaving = !automatic;
  autoBackupInProgress = automatic;
  setStatus(automatic ? STATUS.IDLE : STATUS.SAVING, automatic ? 'Cloud backup active' : 'Saving...');
  try {
    await LibriqFirebase.writeBackupDoc(getBackupPath(uid), docData);
    if (LibriqFirebase.getCurrentUser()?.uid !== uid) return false;
    const savedAt = new Date().toISOString();
    suppressScheduling = true;
    try {
      Storage.saveCloudBackupMeta?.({
        lastCloudBackupAt: savedAt,
        bookCount: docData.bookCount,
        activityCount: docData.activityCount,
        deviceId: docData.deviceId,
        backupVersion: docData.backupVersion,
        appVersion: docData.appVersion,
        schemaVersion: docData.schemaVersion,
        createdAt: docData.createdAt,
        updatedAt: docData.updatedAt,
        notesCount: docData.notesCount,
        quotesCount: docData.quotesCount,
        lastLocalUpdatedAt: docData.lastLocalUpdatedAt,
        syncReady: false,
      });
      if (!automatic) {
        Storage.addActivityEvent?.(Storage.buildActivityEvent?.('backup_cloud_saved', null, { itemCount: docData.bookCount, activityCount: docData.activityCount }, 'manual'));
      }
    } finally {
      suppressScheduling = false;
    }
    setStatus(STATUS.BACKED_UP, formatLastSavedLabel(savedAt));
    return true;
  } catch (error) {
    setStatus(STATUS.FAILED, 'Backup failed. Your local data is still safe.', error);
    return false;
  } finally {
    manualSaving = false;
    autoBackupInProgress = false;
  }
}

async function runBackup(reason = 'manual', automatic = false) {
  if (backupInFlight) {
    pendingReason = reason;
    return backupInFlight;
  }
  backupInFlight = performBackup(reason, automatic).finally(() => {
    backupInFlight = null;
    const followUp = pendingReason;
    pendingReason = null;
    if (followUp && isEligible()) schedule(followUp);
  });
  return backupInFlight;
}

function schedule(reason = 'local-change') {
  const syncState = getSyncState();
  if (syncState.enabled && syncState.status !== 'off' && syncState.status !== 'error') {
    setStatus(STATUS.PAUSED, 'Cloud backup paused while sync is active.');
    return;
  }
  if (!isEligible()) {
    setStatus(STATUS.PAUSED, getSessionPreference() === 'offline' ? 'Offline mode: cloud backup paused' : 'Cloud backup paused');
    return;
  }
  if (debounceTimer) clearTimeout(debounceTimer);
  pendingReason = reason;
  setStatus(STATUS.SCHEDULED, 'Cloud backup active');
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBackup(reason, true);
  }, 2200);
}

function scheduleIfAllowed(reason) {
  if (!suppressScheduling) schedule(reason);
}

function pause(reason = 'paused') {
  paused = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  setStatus(STATUS.PAUSED, reason === 'session' ? 'Cloud backup paused' : 'Offline mode: cloud backup paused');
}

function refresh() {
  const uid = LibriqFirebase.getCurrentUser()?.uid || null;
  if (activeUid && uid !== activeUid) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = null;
    pendingReason = null;
    activeUid = uid;
  }
  paused = false;
  setStatus(isEligible() ? STATUS.IDLE : STATUS.PAUSED, isEligible() ? 'Cloud backup active' : (getSessionPreference() === 'offline' ? 'Offline mode: cloud backup paused' : 'Sign in to enable cloud backup'));
}

function formatLastSavedLabel(value) {
  if (!value) return 'No cloud backup yet.';
  const savedAt = new Date(value);
  if (Number.isNaN(savedAt.getTime())) return 'No cloud backup yet.';
  if (savedAt.toDateString() === new Date().toDateString()) {
    return `Last backed up: just now at ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return `Last backed up: ${Utils.formatDate(savedAt.toISOString())}`;
}

function normalizeBackup(docData) {
  if (!docData || typeof docData !== 'object' || (docData.app && docData.app !== 'LibriQ')) return null;
  const data = docData.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.books)) return null;
  return {
    ...docData,
    app: docData.app || 'LibriQ',
    backupVersion: docData.backupVersion ?? 1,
    appVersion: docData.appVersion || docData.version || LIBRIQ.VERSION,
    schemaVersion: docData.schemaVersion ?? null,
    createdAt: docData.createdAt || docData.updatedAt || null,
    updatedAt: docData.updatedAt || docData.createdAt || null,
    deviceId: docData.deviceId || null,
    bookCount: typeof docData.bookCount === 'number' ? docData.bookCount : data.books.length,
    notesCount: typeof docData.notesCount === 'number' ? docData.notesCount : null,
    quotesCount: typeof docData.quotesCount === 'number' ? docData.quotesCount : null,
    activityCount: typeof docData.activityCount === 'number' ? docData.activityCount : Array.isArray(data.activity) ? data.activity.length : 0,
    lastLocalUpdatedAt: docData.lastLocalUpdatedAt || null,
    syncReady: Boolean(docData.syncReady),
    data: {
      books: data.books,
      profile: data.profile && typeof data.profile === 'object' ? data.profile : createProfile(),
      goals: data.goals && typeof data.goals === 'object' ? data.goals : Storage.getGoals(),
      streak: data.streak && typeof data.streak === 'object' ? data.streak : Storage.getStreak(),
      activity: Array.isArray(data.activity) ? data.activity : [],
    },
  };
}

function bookKey(book) {
  const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return `${normalize(book?.title)}|${normalize(book?.author)}`;
}

function findMatch(book, byId, byIsbn, byKey) {
  if (book?.id && byId.has(book.id)) return byId.get(book.id);
  const isbn = book?.isbn ? String(book.isbn).trim() : '';
  if (isbn && byIsbn.has(isbn)) return byIsbn.get(isbn);
  return byKey.get(bookKey(book)) || null;
}

function countQuoteAdds(localQuotes, cloudQuotes) {
  const local = Array.isArray(localQuotes) ? localQuotes : [];
  return (Array.isArray(cloudQuotes) ? cloudQuotes : []).filter(quote => !local.some(existing =>
    (existing?.id && quote?.id && existing.id === quote.id) ||
    (String(existing?.text || '').trim() === String(quote?.text || '').trim() && String(existing?.page ?? '') === String(quote?.page ?? ''))
  )).length;
}

function previewMerge(docData, localBooks = Storage.getBooks()) {
  const backup = normalizeBackup(docData);
  if (!backup) return null;
  const local = (Array.isArray(localBooks) ? localBooks : []).map(book => createBook(book));
  const byId = new Map(local.map(book => [book.id, book]));
  const byIsbn = new Map();
  const byKey = new Map();
  local.forEach(book => {
    if (book.isbn) byIsbn.set(String(book.isbn).trim(), book);
    byKey.set(bookKey(book), book);
  });
  const result = { newBooksToAdd: [], localBooksKept: local.slice(), duplicatesSkipped: [], conflicts: [], notesToAdd: 0, quotesToAdd: 0, itemsUnchanged: 0 };
  backup.data.books.map(book => createBook(book)).forEach(cloudBook => {
    const localBook = findMatch(cloudBook, byId, byIsbn, byKey);
    if (!localBook) {
      result.newBooksToAdd.push(cloudBook);
      result.itemsUnchanged += 1;
      result.notesToAdd += cloudBook.notes ? 1 : 0;
      result.quotesToAdd += Array.isArray(cloudBook.quotes) ? cloudBook.quotes.length : 0;
      return;
    }
    const localTime = new Date(localBook.updatedAt || localBook.createdAt || localBook.dateAdded || 0).getTime();
    const cloudTime = new Date(cloudBook.updatedAt || cloudBook.createdAt || cloudBook.dateAdded || 0).getTime();
    const deleted = Boolean(localBook.deletedAt || cloudBook.deletedAt);
    const conflict = deleted || String(localBook.notes || '') !== String(cloudBook.notes || '') ||
      Number(localBook.currentPage || 0) !== Number(cloudBook.currentPage || 0) ||
      String(localBook.status || '') !== String(cloudBook.status || '') ||
      (Number.isFinite(localTime) && Number.isFinite(cloudTime) && localTime !== cloudTime);
    if (conflict) {
      result.conflicts.push({ localBook, cloudBook, reason: deleted ? 'deleted' : 'changed' });
      return;
    }
    result.notesToAdd += !localBook.notes && cloudBook.notes ? 1 : 0;
    result.quotesToAdd += countQuoteAdds(localBook.quotes, cloudBook.quotes);
    result.duplicatesSkipped.push(cloudBook);
    result.itemsUnchanged += 1;
  });
  return result;
}

function mergeQuotes(localQuotes, cloudQuotes) {
  const result = (Array.isArray(localQuotes) ? localQuotes : []).map(quote => ({ ...quote }));
  (Array.isArray(cloudQuotes) ? cloudQuotes : []).forEach(quote => {
    const duplicate = result.some(existing =>
      (existing?.id && quote?.id && existing.id === quote.id) ||
      (String(existing?.text || '').trim() === String(quote?.text || '').trim() && String(existing?.page ?? '') === String(quote?.page ?? ''))
    );
    if (!duplicate) result.push({ ...quote });
  });
  return result;
}

function mergeActivity(local, cloud) {
  const byId = new Map();
  [...(Array.isArray(local) ? local : []), ...(Array.isArray(cloud) ? cloud : [])].forEach(event => {
    if (!event) return;
    byId.set(event.id || `${event.type}:${event.timestamp}:${event.bookId || ''}`, event);
  });
  return Array.from(byId.values()).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)).slice(-500);
}

function saveMeta(backup, activityCount) {
  Storage.saveCloudBackupMeta?.({
    lastCloudBackupAt: backup.updatedAt || new Date().toISOString(),
    bookCount: backup.bookCount ?? backup.data.books.length,
    activityCount: backup.activityCount ?? activityCount,
    backupVersion: backup.backupVersion ?? 1,
    appVersion: backup.appVersion || backup.version || LIBRIQ.VERSION,
    schemaVersion: backup.schemaVersion ?? null,
    deviceId: backup.deviceId || Storage.getDeviceId?.(),
    notesCount: backup.notesCount ?? null,
    quotesCount: backup.quotesCount ?? null,
    lastLocalUpdatedAt: backup.lastLocalUpdatedAt ?? null,
    syncReady: false,
  });
}

function applyRestore(docData) {
  const backup = normalizeBackup(docData);
  if (!backup) return { ok: false, code: 'invalid-backup' };
  suppressAutoBackupUntil = Date.now() + 2500;
  const data = backup.data;
  Storage.saveBooks(data.books.map(book => createBook(book)));
  Storage.saveProfile(data.profile);
  Storage.saveGoals(data.goals);
  Storage.saveStreak?.(data.streak);
  Storage.replaceActivityLog?.(data.activity.slice(-500));
  saveMeta(backup, data.activity.length);
  Storage.addActivityEvent?.(Storage.buildActivityEvent?.('backup_cloud_restored', null, { itemCount: data.books.length, activityCount: data.activity.length }, 'manual'));
  return { ok: true, backup, bookCount: data.books.length, activityCount: data.activity.length };
}

function applyMerge(docData, plan = null) {
  const backup = normalizeBackup(docData);
  if (!backup) return { ok: false, code: 'invalid-backup' };
  const mergePlan = plan || previewMerge(backup);
  const books = Storage.getBooks().map(book => createBook(book));
  const byId = new Map(books.map((book, index) => [book.id, index]));
  const byIsbn = new Map();
  const byKey = new Map();
  books.forEach((book, index) => {
    if (book.isbn) byIsbn.set(String(book.isbn).trim(), index);
    byKey.set(bookKey(book), index);
  });
  mergePlan.newBooksToAdd.forEach(book => books.push(createBook(book)));
  backup.data.books.map(book => createBook(book)).forEach(cloudBook => {
    let index = cloudBook.id && byId.has(cloudBook.id) ? byId.get(cloudBook.id) : null;
    if (index == null && cloudBook.isbn && byIsbn.has(String(cloudBook.isbn).trim())) index = byIsbn.get(String(cloudBook.isbn).trim());
    if (index == null && byKey.has(bookKey(cloudBook))) index = byKey.get(bookKey(cloudBook));
    if (index == null || !books[index] || books[index].deletedAt || cloudBook.deletedAt) return;
    const local = books[index];
    books[index] = {
      ...local,
      tags: Array.from(new Set([...(local.tags || []), ...(cloudBook.tags || [])].map(value => String(value || '').trim()).filter(Boolean))),
      notes: local.notes || cloudBook.notes || '',
      notesUpdatedAt: local.notes ? local.notesUpdatedAt : (cloudBook.notesUpdatedAt || cloudBook.updatedAt || cloudBook.createdAt || local.notesUpdatedAt || null),
      quotes: mergeQuotes(local.quotes, cloudBook.quotes),
      createdAt: local.createdAt || cloudBook.createdAt || local.dateAdded || cloudBook.dateAdded || new Date().toISOString(),
      updatedAt: local.updatedAt || cloudBook.updatedAt || new Date().toISOString(),
      deletedAt: local.deletedAt ?? cloudBook.deletedAt ?? null,
    };
  });
  const activity = mergeActivity(Storage.getActivityLog?.() || [], backup.data.activity);
  Storage.saveBooks(books);
  Storage.replaceActivityLog?.(activity);
  saveMeta(backup, activity.length);
  return { ok: true, backup, plan: mergePlan, bookCount: books.length, activityCount: activity.length };
}

async function readBackup() {
  const user = LibriqFirebase.getCurrentUser();
  if (!user?.uid || !LibriqFirebase.hasFirestore()) return null;
  const snap = await LibriqFirebase.readBackupDoc(getBackupPath(user.uid));
  return snap?.exists?.() ? normalizeBackup(snap.data()) : null;
}

function getState() {
  return {
    status: lastStatus,
    message: lastStatus === STATUS.SAVING ? 'Saving...' : lastMessage || 'Cloud backup active',
    lastSavedAt,
    error: lastError,
    pending: Boolean(debounceTimer || backupInFlight),
    manualSaving,
    autoBackupInProgress,
    activeUid,
  };
}

function init(options = {}) {
  if (initialized) return;
  initialized = true;
  getSessionPreference = options.getSessionPreference || getSessionPreference;
  getCurrentPage = options.getCurrentPage || getCurrentPage;
  getSyncState = options.getSyncState || getSyncState;
  window.addEventListener('offline', () => pause('offline'));
  window.addEventListener('online', () => {
    refresh();
    if (isEligible()) schedule('reconnect');
  });
  window.addEventListener('libriq:auth-changed', refresh);
}

export const LibriqCloudBackup = {
  init,
  getState,
  schedule,
  scheduleIfAllowed,
  pause,
  refresh,
  runBackup,
  readBackup,
  normalizeBackup,
  previewMerge,
  applyRestore,
  applyMerge,
  buildPayload,
  formatLastSavedLabel,
  suppressAutoBackupFor(ms = 1500) {
    suppressAutoBackupUntil = Date.now() + ms;
  },
};
