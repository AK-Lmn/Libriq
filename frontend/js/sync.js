/* ============================================
   LIBRIQ REALTIME SYNC BETA
   Books-only sync namespace separate from backup.
   ============================================ */

const LibriqSyncBeta = (() => {
  const STORAGE_KEY = 'libriq_sync_beta_enabled';
  const DEBUG_KEY = 'libriq_debug_sync';
  const STATUS = {
    OFF: 'off',
    SYNCING: 'syncing',
    SYNCED: 'synced',
    PAUSED: 'paused',
    UNAVAILABLE: 'unavailable',
    CONFLICT: 'conflict',
    ERROR: 'error',
  };

  let enabled = localStorage.getItem(STORAGE_KEY) === '1';
  let status = STATUS.OFF;
  let message = 'Sync Beta off';
  let conflictCount = 0;
  let lastSyncedAt = null;
  let listenerUnsub = null;
  let pendingWriteTimer = null;
  let pendingUiTimer = null;
  let applyingRemoteChanges = false;
  let suppressWriteUntil = 0;
  let lastRemoteFingerprint = '';
  let listenerAttached = false;
  let listenerPath = null;
  let currentUid = null;
  let lastSnapshotAt = null;
  let lastWriteAt = null;
  let lastError = null;

  function getFirebaseState() {
    return window.LibriqFirebase?.getState?.() || {};
  }

  function debugEnabled() {
    return localStorage.getItem(DEBUG_KEY) === '1';
  }

  function debugLog(message, details = null) {
    if (!debugEnabled()) return;
    const prefix = '[LibriQ][SyncDebug]';
    if (details !== null && details !== undefined) console.debug(prefix, message, details);
    else console.debug(prefix, message);
  }

  function getDeviceId() {
    return Storage.getDeviceId?.() || localStorage.getItem('libriq_device_id') || 'unknown-device';
  }

  function isAccountMode() {
    return Navigation.getSessionPreference?.() !== 'offline';
  }

  function isEligible() {
    const firebase = getFirebaseState();
    return Boolean(
      enabled &&
      firebase.available &&
      firebase.ready &&
      firebase.user &&
      window.LibriqFirebase?.hasFirestore?.() &&
      isAccountMode() &&
      Navigation.currentPage !== 'session' &&
      !document.body.classList.contains('session-choice-active')
    );
  }

  function emit() {
    window.dispatchEvent(new CustomEvent('libriq:sync-status-changed', { detail: getState() }));
    updateSettingsStatus();
  }

  function updateSettingsStatus() {
    if (Navigation.currentPage !== 'settings') return;
    const statusEl = document.getElementById('syncStatusText');
    const conflictEl = document.getElementById('syncConflictText');
    if (statusEl) statusEl.textContent = message;
    if (conflictEl) {
      conflictEl.textContent = conflictCount
        ? 'Some sync conflicts were kept on this device.'
        : 'No sync conflicts kept on this device yet.';
    }
  }

  function setState(nextStatus, nextMessage = message, extra = {}) {
    status = nextStatus;
    message = nextMessage;
    if (typeof extra.conflictCount === 'number') conflictCount = extra.conflictCount;
    if (extra.lastSyncedAt) lastSyncedAt = extra.lastSyncedAt;
    emit();
  }

  function getState() {
    return { enabled, status, message, conflictCount, lastSyncedAt };
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    debugLog('enabled toggled', { enabled });
    if (!enabled) {
      teardown();
      setState(STATUS.OFF, 'Sync Beta off');
      return false;
    }
    if (!isAccountMode()) {
      setState(STATUS.PAUSED, 'Sync paused in offline mode');
      return false;
    }
    refresh();
    return true;
  }

  function teardown() {
    if (listenerUnsub) {
      listenerUnsub();
      debugLog('sync listener detached', { reason: 'teardown', listenerPath });
    }
    listenerUnsub = null;
    listenerAttached = false;
    listenerPath = null;
    currentUid = null;
    if (pendingWriteTimer) clearTimeout(pendingWriteTimer);
    pendingWriteTimer = null;
    if (pendingUiTimer) clearTimeout(pendingUiTimer);
    pendingUiTimer = null;
  }

  function refresh() {
    teardown();
    const firebase = getFirebaseState();
    debugLog('refresh check', {
      enabled,
      uid: firebase.user?.uid || null,
      ready: firebase.ready,
      hasUser: Boolean(firebase.user),
      sessionMode: Navigation.getCurrentSessionMode?.() || Navigation.getSessionPreference?.(),
      sessionPref: Navigation.getSessionPreference?.(),
      currentPage: Navigation.currentPage,
      attached: listenerAttached,
    });
    if (!enabled) return setState(STATUS.OFF, 'Sync Beta off');
    if (!firebase.available || !firebase.ready || !firebase.user || !window.LibriqFirebase?.hasFirestore?.()) {
      return setState(STATUS.UNAVAILABLE, 'Sync unavailable');
    }
    if (!isAccountMode()) {
      return setState(STATUS.PAUSED, 'Sync paused in offline mode');
    }
    attachListener(firebase.user.uid);
    queueUpload('refresh');
  }

  function attachListener(uid) {
    if (listenerAttached && currentUid === uid && listenerUnsub) {
      debugLog('listener already attached', { uid, listenerPath });
      return;
    }
    if (listenerUnsub) {
      listenerUnsub();
      debugLog('sync listener detached', { reason: 'reattach', listenerPath });
    }
    const colRef = window.LibriqFirebase.collection(window.LibriqFirebase.getFirestoreClient(), 'users', uid, 'sync', 'books');
    const q = window.LibriqFirebase.query(colRef, window.LibriqFirebase.orderBy('updatedAt', 'asc'));
    listenerPath = `users/${uid}/sync/books`;
    currentUid = uid;
    listenerAttached = true;
    debugLog('sync listener attach attempt', { uid, listenerPath });
    listenerUnsub = window.LibriqFirebase.onSnapshot(q, (snapshot) => {
      if (applyingRemoteChanges) return;
      const remoteBooks = [];
      snapshot.forEach((docSnap) => remoteBooks.push(docSnap.data()));
      lastSnapshotAt = new Date().toISOString();
      debugLog('snapshot received', { listenerPath, changeCount: remoteBooks.length, snapshotAt: lastSnapshotAt });
      const fingerprint = JSON.stringify(remoteBooks.map(book => [book.id, book.updatedAt, book.deletedAt, book.deviceId]).sort());
      if (fingerprint === lastRemoteFingerprint) return;
      lastRemoteFingerprint = fingerprint;
      applyRemoteBooks(remoteBooks);
    }, (err) => {
      lastError = err?.message || String(err || 'unknown');
      console.warn('[LibriQ][Sync] listener error:', err);
      setState(STATUS.ERROR, 'Sync error. Your local data is safe.');
    });
    debugLog('sync listener attached', { uid, listenerPath });
  }

  function queueUpload(reason = 'local-change') {
    if (!enabled || applyingRemoteChanges || Date.now() < suppressWriteUntil) return;
    if (!isEligible()) {
      setState(Navigation.getSessionPreference?.() === 'offline' ? STATUS.PAUSED : STATUS.UNAVAILABLE,
        Navigation.getSessionPreference?.() === 'offline' ? 'Sync paused in offline mode' : 'Sync unavailable');
      return;
    }
    if (pendingWriteTimer) clearTimeout(pendingWriteTimer);
    pendingWriteTimer = setTimeout(() => {
      pendingWriteTimer = null;
      debugLog('sync write started', { reason, enabled, listenerPath });
      uploadLocalBooks(reason);
    }, 900);
    debugLog('sync write queued', { reason });
  }

  function scheduleUiRefresh() {
    if (pendingUiTimer) clearTimeout(pendingUiTimer);
    pendingUiTimer = setTimeout(() => {
      pendingUiTimer = null;
      updateSettingsStatus();
      const page = Navigation.currentPage;
      if (page && page !== 'session') {
        Navigation.updateBadges?.();
        if (['dashboard', 'library', 'reading', 'wishlist', 'finished', 'favorites'].includes(page)) {
          Navigation.renderCurrentPage?.();
        } else if (page === 'settings') {
          Navigation.renderCurrentPage?.();
        }
      }
    }, 300);
  }

  function normalizeBookForSync(book) {
    if (!book || typeof book !== 'object') return null;
    return {
      id: book.id,
      title: book.title || '',
      author: book.author || '',
      cover: book.cover || book.coverUrl || null,
      isbn: book.isbn || null,
      status: book.status || LIBRIQ.STATUS.WISHLIST,
      currentPage: book.currentPage ?? 0,
      pages: book.pageCount ?? book.pages ?? 0,
      rating: book.rating ?? null,
      tags: Array.isArray(book.tags) ? book.tags : [],
      notes: typeof book.notes === 'string' ? book.notes : '',
      quotes: Array.isArray(book.quotes) ? book.quotes : [],
      createdAt: book.createdAt || book.dateAdded || null,
      updatedAt: book.updatedAt || book.createdAt || book.dateAdded || null,
      deletedAt: book.deletedAt ?? null,
      deviceId: getDeviceId(),
      sourceDeviceId: getDeviceId(),
      appVersion: LIBRIQ.VERSION,
    };
  }

  async function uploadLocalBooks(reason = 'local-change') {
    const firebase = getFirebaseState();
    if (!enabled || !firebase.user || !window.LibriqFirebase?.hasFirestore?.()) return;
    const books = Storage.getBooks().map(normalizeBookForSync).filter(Boolean);
    setState(STATUS.SYNCING, 'Syncing…');
    try {
      applyingRemoteChanges = true;
      const db = window.LibriqFirebase.getFirestoreClient();
      const writes = books.map(book => window.LibriqFirebase.setDoc(
        window.LibriqFirebase.doc(db, 'users', firebase.user.uid, 'sync', 'books', book.id),
        book,
      ));
      await Promise.all(writes);
      lastWriteAt = new Date().toISOString();
      lastSyncedAt = new Date().toISOString();
      setState(STATUS.SYNCED, 'Waiting for changes', { lastSyncedAt });
      debugLog('sync write success', { reason, count: books.length, lastWriteAt });
      Storage.saveCloudBackupMeta?.({ syncReady: true });
    } catch (err) {
      lastError = err?.message || String(err || 'unknown');
      console.warn('[LibriQ][Sync] upload failed:', err);
      debugLog('sync write failure', { reason, error: lastError });
      setState(STATUS.ERROR, 'Sync error. Your local data is safe.');
    } finally {
      applyingRemoteChanges = false;
    }
  }

  function compareTimes(a, b) {
    const at = new Date(a || 0).getTime();
    const bt = new Date(b || 0).getTime();
    if (!Number.isFinite(at) || !Number.isFinite(bt)) return 0;
    return at === bt ? 0 : (at > bt ? 1 : -1);
  }

  function applyRemoteBooks(remoteBooks) {
    const localBooks = Storage.getBooks();
    const byId = new Map(localBooks.map(book => [book.id, book]));
    let changed = false;
    let conflicts = 0;
    const nextBooks = localBooks.map(book => ({ ...book }));

    remoteBooks.forEach(remote => {
      if (!remote?.id) return;
      const local = byId.get(remote.id);
      const remoteTime = remote.updatedAt || remote.createdAt || null;
      const localTime = local?.updatedAt || local?.createdAt || null;

      if (remote.deletedAt && compareTimes(remote.deletedAt, localTime) >= 0) {
        const idx = nextBooks.findIndex(book => book.id === remote.id);
        if (idx !== -1) {
          nextBooks.splice(idx, 1);
          changed = true;
          debugLog('remote book applied', { bookId: remote.id, reason: 'deletedAt tombstone' });
        }
        return;
      }

      if (!local) {
        nextBooks.push(_toLocalBook(remote));
        changed = true;
        debugLog('remote book applied', { bookId: remote.id, reason: 'new book from remote' });
        return;
      }

      const cmp = compareTimes(remoteTime, localTime);
      if (cmp > 0) {
        nextBooks[nextBooks.findIndex(book => book.id === remote.id)] = _mergeRemoteIntoLocal(local, remote);
        changed = true;
        debugLog('remote book applied', { bookId: remote.id, reason: 'remote newer' });
      } else if (cmp < 0) {
        debugLog('remote book skipped', { bookId: remote.id, reason: 'local newer, queued upload' });
        queueUpload('local-newer');
      } else {
        conflicts += 1;
        debugLog('remote book skipped', { bookId: remote.id, reason: 'timestamp tie or missing timestamp' });
      }
    });

    if (!changed) {
      if (conflicts > 0) setState(STATUS.CONFLICT, 'Some sync conflicts were kept on this device.', { conflictCount: conflicts });
      return;
    }

    applyingRemoteChanges = true;
    suppressWriteUntil = Date.now() + 1500;
    Storage.saveBooks(nextBooks);
    Storage.saveCloudBackupMeta?.({ syncReady: true });
    applyingRemoteChanges = false;
    setState(conflicts > 0 ? STATUS.CONFLICT : STATUS.SYNCED, conflicts > 0 ? 'Some sync conflicts were kept on this device.' : 'Waiting for changes', {
      conflictCount: conflicts,
      lastSyncedAt: new Date().toISOString(),
    });
    debugLog('ui refresh scheduled after remote change', { page: Navigation.currentPage });
    scheduleUiRefresh();
  }

  function _toLocalBook(remote) {
    return createBook({
      ...remote,
      coverUrl: remote.cover || remote.coverUrl || null,
      pageCount: remote.pages ?? remote.pageCount ?? 0,
      currentPage: remote.currentPage ?? 0,
      updatedAt: remote.updatedAt || remote.createdAt || new Date().toISOString(),
      createdAt: remote.createdAt || remote.updatedAt || new Date().toISOString(),
      deletedAt: remote.deletedAt ?? null,
    });
  }

  function _mergeRemoteIntoLocal(local, remote) {
    return createBook({
      ...local,
      ...remote,
      coverUrl: remote.cover || remote.coverUrl || local.coverUrl || null,
      pageCount: remote.pages ?? remote.pageCount ?? local.pageCount ?? 0,
      currentPage: remote.currentPage ?? local.currentPage ?? 0,
      notes: typeof remote.notes === 'string' ? remote.notes : local.notes,
      quotes: Array.isArray(remote.quotes) ? remote.quotes : local.quotes,
      updatedAt: remote.updatedAt || local.updatedAt || new Date().toISOString(),
      createdAt: remote.createdAt || local.createdAt || new Date().toISOString(),
      deletedAt: remote.deletedAt ?? local.deletedAt ?? null,
    });
  }

  function onLocalChange() {
    if (!enabled) return;
    debugLog('local book change detected', { page: Navigation.currentPage, sessionMode: Navigation.getCurrentSessionMode?.() || Navigation.getSessionPreference?.() });
    if (!isEligible()) {
      setState(Navigation.getSessionPreference?.() === 'offline' ? STATUS.PAUSED : STATUS.UNAVAILABLE,
        Navigation.getSessionPreference?.() === 'offline' ? 'Sync paused in offline mode' : 'Sync unavailable');
      return;
    }
    queueUpload('local-change');
  }

  function enableWithPrompt() {
    const proceed = confirm('Enable Realtime Sync Beta? Export JSON first if you want a manual safety copy. Sync will update books across signed-in devices, and cloud backup remains available.');
    if (!proceed) return false;
    return setEnabled(true);
  }

  window.addEventListener('libriq:auth-changed', () => { if (enabled) refresh(); });
  window.addEventListener('libriq:page-changed', (event) => {
    if (event?.detail?.page === 'session') return;
    scheduleUiRefresh();
  });
  window.addEventListener('libriq:sync-request-upload', onLocalChange);
  window.addEventListener('libriq:book:added', onLocalChange);
  window.addEventListener('libriq:book:updated', onLocalChange);
  window.addEventListener('libriq:book:removed', onLocalChange);
  window.addEventListener('online', refresh);
  window.addEventListener('offline', () => setState(STATUS.PAUSED, 'Sync paused in offline mode'));

  if (enabled) refresh();

  function debugStatus() {
    return {
      enabled,
      attached: listenerAttached,
      uid: currentUid,
      deviceId: getDeviceId(),
      sessionMode: Navigation.getCurrentSessionMode?.() || Navigation.getSessionPreference?.(),
      listenerPath,
      lastSnapshotAt,
      lastWriteAt,
      lastError,
    };
  }

  window.LibriqSyncDebug = { status: debugStatus };

  return { getState, setEnabled, enableWithPrompt, refresh, onLocalChange, queueUpload };
})();

window.LibriqSyncBeta = LibriqSyncBeta;
