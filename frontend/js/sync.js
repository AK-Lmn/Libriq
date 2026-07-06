/* ============================================
   LIBRIQ REALTIME SYNC BETA
   Books-only sync namespace separate from backup.
   ============================================ */

const LibriqSyncBeta = (() => {
  const STORAGE_KEY = 'libriq_sync_beta_enabled';
  const USER_DISABLED_KEY = 'libriq_account_sync_user_disabled';
  const DEBUG_KEY = 'libriq_debug_sync';
  const TOMBSTONE_KEY = 'libriq_sync_delete_tombstones';
  const TOMBSTONE_MIN_AGE_MS = 30 * 24 * 60 * 60 * 1000;
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
  let message = 'Account sync off';
  let conflictCount = 0;
  let lastSyncedAt = null;
  let listenerUnsub = null;
  let pendingWriteTimer = null;
  let pendingUiTimer = null;
  let pendingSettledBackupTimer = null;
  let applyingRemoteChanges = false;
  let suppressWriteUntil = 0;
  let lastRemoteFingerprint = '';
  let listenerAttached = false;
  let listenerPath = null;
  let currentUid = null;
  let lastSnapshotAt = null;
  let lastWriteAt = null;
  let lastError = null;
  let attachInFlight = false;
  let awaitingInitialSnapshot = false;
  let queuedUploadBeforeInitialSnapshot = false;
  let uploadInFlight = false;
  let lastAuthUid = getResolvedUser()?.uid || null;

  function isUserDisabled() {
    return localStorage.getItem(USER_DISABLED_KEY) === '1';
  }

  function setUserDisabled(nextDisabled) {
    if (nextDisabled) localStorage.setItem(USER_DISABLED_KEY, '1');
    else localStorage.removeItem(USER_DISABLED_KEY);
  }

  function getFirebaseState() {
    return window.LibriqFirebase?.getState?.() || {};
  }

  function getResolvedUser() {
    return window.LibriqFirebase?.getCurrentUser?.() || getFirebaseState().user || null;
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

  function readTombstones() {
    try {
      const parsed = JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      debugLog('delete tombstone read failed', { error: err?.message || String(err) });
      return {};
    }
  }

  function writeTombstones(tombstones) {
    localStorage.setItem(TOMBSTONE_KEY, JSON.stringify(tombstones || {}));
  }

  function getTombstoneTimestamp(tombstone) {
    const raw = tombstone?.deletedAt || tombstone?.updatedAt || tombstone?.createdAt || null;
    const time = raw ? new Date(raw).getTime() : NaN;
    return Number.isFinite(time) ? time : null;
  }

  function getTombstoneStats() {
    const tombstones = Object.values(readTombstones()).filter(Boolean);
    let oldest = null;
    tombstones.forEach((tombstone) => {
      const time = getTombstoneTimestamp(tombstone);
      if (time === null) return;
      if (oldest === null || time < oldest) oldest = time;
    });
    return {
      tombstoneCount: tombstones.length,
      oldestTombstoneAt: oldest === null ? null : new Date(oldest).toISOString(),
    };
  }

  function pruneOldLocalTombstones(now = Date.now()) {
    if (applyingRemoteChanges || uploadInFlight || awaitingInitialSnapshot) {
      debugLog('local tombstone cleanup skipped during active sync');
      return { pruned: 0, skipped: true, ...getTombstoneStats() };
    }
    const tombstones = readTombstones();
    let pruned = 0;
    Object.entries(tombstones).forEach(([id, tombstone]) => {
      const time = getTombstoneTimestamp(tombstone);
      if (time === null) return;
      if (now - time < TOMBSTONE_MIN_AGE_MS) return;
      delete tombstones[id];
      pruned += 1;
    });
    if (pruned > 0) {
      writeTombstones(tombstones);
      debugLog('old local tombstones pruned', { pruned });
    }
    return { pruned, skipped: false, ...getTombstoneStats() };
  }

  function recordLocalDelete(id) {
    if (!id) return null;
    const timestamp = new Date().toISOString();
    const tombstones = readTombstones();
    tombstones[id] = {
      id,
      deletedAt: timestamp,
      updatedAt: timestamp,
      deviceId: getDeviceId(),
      sourceDeviceId: getDeviceId(),
      appVersion: LIBRIQ.VERSION,
    };
    writeTombstones(tombstones);
    debugLog('local delete tombstone recorded', { bookId: id, deletedAt: timestamp });
    return tombstones[id];
  }

  function getSyncBooksCollectionSegments(uid) {
    if (!uid) return null;
    return ['users', uid, 'sync', 'v1', 'books'];
  }

  function getSyncBooksCollectionPath(uid) {
    return uid ? `users/${uid}/sync/v1/books` : null;
  }

  function isAccountMode() {
    return Navigation.getCurrentSessionMode?.() !== 'offline' && Navigation.getSessionPreference?.() !== 'offline';
  }

  function isEligible() {
    const firebase = getFirebaseState();
    const user = getResolvedUser();
    const sessionMode = Navigation.getCurrentSessionMode?.() || Navigation.getSessionPreference?.();
    const reasons = [];
    if (!enabled) reasons.push('account sync disabled');
    if (!firebase.available) reasons.push('firebase unavailable');
    if (!firebase.ready) reasons.push('firebase not ready');
    if (!user) reasons.push('no firebase user');
    if (!window.LibriqFirebase?.hasFirestore?.()) reasons.push('firestore unavailable');
    if (!isAccountMode()) reasons.push(`session mode ${sessionMode}`);
    if (Navigation.currentPage === 'session') reasons.push('session screen');
    if (document.body.classList.contains('session-choice-active')) reasons.push('session choice active');
    const allowed = reasons.length === 0;
    debugLog('eligibility result', {
      allowed,
      reasons,
      rawSessionPref: Navigation.getSessionPreference?.() || null,
      normalizedSessionMode: sessionMode || null,
      uid: user?.uid || null,
      enabled,
    });
    return Boolean(
      enabled &&
      firebase.available &&
      firebase.ready &&
      user &&
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
    const secondaryEl = document.getElementById('syncSecondaryText');
    const lastSyncedEl = document.getElementById('syncLastSyncedText');
    const listenerEl = document.getElementById('syncListenerText');
    if (statusEl) statusEl.textContent = enabled ? 'Your books sync automatically across signed-in devices.' : (isAccountMode() ? 'Account sync is turned off on this device.' : 'Offline mode: books stay on this device.');
    if (secondaryEl) secondaryEl.textContent = message;
    if (lastSyncedEl) lastSyncedEl.textContent = lastSyncedAt ? `Last synced: ${Utils.formatDate(lastSyncedAt)}` : 'Last synced: Not yet';
    if (listenerEl) listenerEl.textContent = listenerAttached ? `Listener: connected (${listenerPath || 'books'})` : 'Listener: not connected';
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
    const user = getResolvedUser();
    const syncPath = getSyncBooksCollectionPath(currentUid || user?.uid || null);
    return {
      enabled,
      userDisabled: isUserDisabled(),
      status,
      message,
      conflictCount,
      lastSyncedAt,
      listenerAttached,
      listenerPath,
      syncPath,
      deviceId: getDeviceId(),
      lastSnapshotAt,
      lastWriteAt,
      lastError,
      ...getTombstoneStats(),
    };
  }

  function setEnabled(nextEnabled, options = {}) {
    enabled = Boolean(nextEnabled);
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    const userInitiated = options.userInitiated !== false;
    if (enabled) setUserDisabled(false);
    else if (userInitiated) setUserDisabled(true);
    debugLog('enabled toggled', { enabled, userDisabled: isUserDisabled(), userInitiated });
    if (!enabled) {
      teardown();
      setState(STATUS.OFF, 'Account sync off');
      return false;
    }
    if (!isAccountMode()) {
      setState(STATUS.PAUSED, 'Sync paused in offline mode');
      return false;
    }
    refresh();
    return true;
  }

  function pauseForOffline() {
    enabled = false;
    localStorage.setItem(STORAGE_KEY, '0');
    teardown();
    setState(STATUS.PAUSED, 'Sync paused in offline mode');
    debugLog('sync paused for offline mode', { userDisabled: isUserDisabled() });
    return false;
  }

  function teardown() {
    attachInFlight = false;
    if (listenerUnsub) {
      listenerUnsub();
      debugLog('sync listener detached', { reason: 'teardown', listenerPath });
    }
    listenerUnsub = null;
    listenerAttached = false;
    listenerPath = null;
    awaitingInitialSnapshot = false;
    currentUid = null;
    if (pendingWriteTimer) clearTimeout(pendingWriteTimer);
    pendingWriteTimer = null;
    if (pendingUiTimer) clearTimeout(pendingUiTimer);
    pendingUiTimer = null;
    if (pendingSettledBackupTimer) clearTimeout(pendingSettledBackupTimer);
    pendingSettledBackupTimer = null;
  }

  function detachForAccountSwitch(reason = 'account-switch') {
    debugLog('sync detach requested', { reason, currentUid, listenerPath });
    teardown();
    setState(enabled ? STATUS.UNAVAILABLE : STATUS.OFF, enabled ? 'Sync waiting for account data' : 'Account sync off');
  }

  function refresh() {
    if (attachInFlight) {
      debugLog('refresh skipped while attach in flight', { listenerPath, currentUid });
      return;
    }
    teardown();
    queuedUploadBeforeInitialSnapshot = false;
    const firebase = getFirebaseState();
    const user = getResolvedUser();
    debugLog('refresh check', {
      enabled,
      uid: user?.uid || null,
      ready: firebase.ready,
      hasUser: Boolean(user),
      sessionMode: Navigation.getCurrentSessionMode?.() || Navigation.getSessionPreference?.(),
      sessionPref: Navigation.getSessionPreference?.(),
      currentPage: Navigation.currentPage,
      attached: listenerAttached,
      rawEnabled: localStorage.getItem(STORAGE_KEY),
    });
    if (!enabled) return setState(STATUS.OFF, 'Account sync off');
    if (!firebase.available || !firebase.ready || !user || !window.LibriqFirebase?.hasFirestore?.()) {
      lastError = null;
      return setState(STATUS.UNAVAILABLE, 'Sync unavailable');
    }
    if (!isAccountMode()) {
      return setState(STATUS.PAUSED, 'Sync paused in offline mode');
    }
    attachListener(user.uid);
  }

  function attachListener(uid) {
    const segments = getSyncBooksCollectionSegments(uid);
    const path = getSyncBooksCollectionPath(uid);
    if (!segments || !path) {
      lastError = 'missing uid for sync listener';
      debugLog('listener attach failed', { uid: uid || null, error: lastError });
      setState(STATUS.UNAVAILABLE, 'Sync unavailable');
      return;
    }
    if (listenerAttached && currentUid === uid && listenerUnsub) {
      debugLog('listener already attached', { uid, listenerPath });
      return;
    }
    if (listenerUnsub) {
      listenerUnsub();
      debugLog('sync listener detached', { reason: 'reattach', listenerPath });
    }
    const colRef = window.LibriqFirebase.collection(window.LibriqFirebase.getFirestoreClient(), ...segments);
    const q = window.LibriqFirebase.query(colRef, window.LibriqFirebase.orderBy('updatedAt', 'asc'));
    listenerPath = path;
    currentUid = uid;
    listenerAttached = true;
    attachInFlight = true;
    awaitingInitialSnapshot = true;
    debugLog('sync listener attach attempt', { uid, listenerPath });
    try {
      listenerUnsub = window.LibriqFirebase.onSnapshot(q, (snapshot) => {
        if (applyingRemoteChanges) return;
        const remoteBooks = [];
        snapshot.forEach((docSnap) => remoteBooks.push(docSnap.data()));
        lastSnapshotAt = new Date().toISOString();
        const wasAwaitingInitialSnapshot = awaitingInitialSnapshot;
        const hadQueuedLocalChange = queuedUploadBeforeInitialSnapshot;
        awaitingInitialSnapshot = false;
        debugLog('snapshot received', { listenerPath, changeCount: remoteBooks.length, snapshotAt: lastSnapshotAt });
        const fingerprint = JSON.stringify(remoteBooks.map(book => [book.id, book.updatedAt, book.deletedAt, book.deviceId]).sort());
        if (wasAwaitingInitialSnapshot && hadQueuedLocalChange) {
          lastRemoteFingerprint = fingerprint;
          applyRemoteBooks(remoteBooks);
          window.setTimeout(() => queueUpload('initial-snapshot-local-change'), 0);
        } else if (wasAwaitingInitialSnapshot) {
          applyInitialRemoteBooks(uid, remoteBooks);
        } else if (fingerprint !== lastRemoteFingerprint) {
          lastRemoteFingerprint = fingerprint;
          applyRemoteBooks(remoteBooks);
        }
        queuedUploadBeforeInitialSnapshot = false;
      }, (err) => {
        lastError = err?.message || String(err || 'unknown');
        console.warn('[LibriQ][Sync] listener error:', err);
        setState(STATUS.ERROR, 'Sync error. Your local data is safe.');
        debugLog('listener error', { uid, listenerPath, error: lastError });
      });
    } catch (err) {
      lastError = err?.message || String(err || 'unknown');
      listenerAttached = false;
      listenerUnsub = null;
      attachInFlight = false;
      debugLog('listener attach failed', { uid, listenerPath, error: lastError });
      setState(STATUS.ERROR, 'Sync unavailable. Your local data is safe.');
      return;
    }
    attachInFlight = false;
    debugLog('sync listener attached', { uid, listenerPath });
  }

  function queueUpload(reason = 'local-change') {
    if (!enabled || applyingRemoteChanges) return;
    const suppressedFor = suppressWriteUntil - Date.now();
    if (suppressedFor > 0) {
      if (pendingWriteTimer) clearTimeout(pendingWriteTimer);
      pendingWriteTimer = setTimeout(() => {
        pendingWriteTimer = null;
        queueUpload(reason);
      }, suppressedFor + 50);
      debugLog('sync write deferred during suppression window', { reason, suppressedFor });
      return;
    }
    if (awaitingInitialSnapshot) {
      queuedUploadBeforeInitialSnapshot = true;
      debugLog('sync write deferred until initial snapshot', { reason });
      return;
    }
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

  function scheduleSettledBackup() {
    if (!window.LibriqCloudBackup?.runBackup) return;
    if (!enabled || !listenerAttached) return;
    if (applyingRemoteChanges) return;
    if (pendingSettledBackupTimer) clearTimeout(pendingSettledBackupTimer);
    window.LibriqCloudBackup?.suppressAutoBackupFor?.(5000);
    pendingSettledBackupTimer = window.setTimeout(() => {
      pendingSettledBackupTimer = null;
      if (!enabled || !listenerAttached || applyingRemoteChanges) return;
      if (![STATUS.SYNCED, STATUS.CONFLICT].includes(status)) return;
      window.LibriqCloudBackup?.runBackup?.('sync-settled', true);
      debugLog('settled backup started');
    }, 4500);
  }

  function normalizeBookForSync(book) {
    if (!book || typeof book !== 'object') return null;
    const cover = book.cover ?? book.coverUrl ?? book.imageLinks ?? null;
    const currentPage = book.currentPage ?? 0;
    const pageCount = book.pageCount ?? book.pages ?? 0;
    return {
      id: book.id,
      title: book.title || '',
      author: book.author || '',
      cover,
      coverUrl: cover,
      imageLinks: book.imageLinks ?? null,
      isbn: book.isbn || null,
      identifiers: Array.isArray(book.identifiers) ? book.identifiers : (Array.isArray(book.industryIdentifiers) ? book.industryIdentifiers : []),
      status: book.status || LIBRIQ.STATUS.WISHLIST,
      currentPage,
      pages: pageCount,
      pageCount,
      rating: book.rating ?? null,
      isFavorite: Boolean(book.isFavorite),
      shelves: Array.isArray(book.shelves) ? book.shelves : [],
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
    const user = getResolvedUser();
    if (!enabled || !user || !window.LibriqFirebase?.hasFirestore?.()) return;
    if (currentUid && currentUid !== user.uid) {
      debugLog('sync write blocked for stale uid', { currentUid, authUid: user.uid, reason });
      return;
    }
    if (Storage.getActiveAccountUid?.() !== user.uid) {
      debugLog('sync write blocked for cache owner mismatch', { cacheUid: Storage.getActiveAccountUid?.() || null, authUid: user.uid, reason });
      return;
    }
    const localBooks = Storage.getBooks();
    const books = localBooks.map(normalizeBookForSync).filter(Boolean);
    const tombstones = Object.values(readTombstones()).filter(Boolean);
    setState(STATUS.SYNCING, 'Syncing…');
    try {
      uploadInFlight = true;
      applyingRemoteChanges = true;
      const db = window.LibriqFirebase.getFirestoreClient();
      const writes = books.map(book => window.LibriqFirebase.setDoc(
        window.LibriqFirebase.doc(db, ...getSyncBooksCollectionSegments(user.uid), book.id),
        book,
      ));
      const deleteWrites = tombstones.map(tombstone => window.LibriqFirebase.setDoc(
        window.LibriqFirebase.doc(db, ...getSyncBooksCollectionSegments(user.uid), tombstone.id),
        tombstone,
      ));
      const favoriteWrites = books.filter(book => typeof book.isFavorite === 'boolean').map(book => ({ bookId: book.id, isFavorite: book.isFavorite }));
      debugLog('sync write queued', { reason, favoriteWrites, tombstoneCount: tombstones.length });
      await Promise.all([...writes, ...deleteWrites]);
      lastWriteAt = new Date().toISOString();
      lastSyncedAt = new Date().toISOString();
      setState(STATUS.SYNCED, 'Waiting for changes', { lastSyncedAt });
      debugLog('sync write success', { reason, count: books.length, lastWriteAt, favoriteWrites });
      Storage.saveCloudBackupMeta?.({ syncReady: true });
      scheduleSettledBackup();
      applyingRemoteChanges = false;
      uploadInFlight = false;
      pruneOldLocalTombstones();
    } catch (err) {
      lastError = err?.message || String(err || 'unknown');
      console.warn('[LibriQ][Sync] upload failed:', err);
      debugLog('sync write failure', { reason, error: lastError });
      setState(STATUS.ERROR, 'Sync error. Your local data is safe.');
    } finally {
      applyingRemoteChanges = false;
      uploadInFlight = false;
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
      const favoriteState = typeof remote.isFavorite === 'boolean' ? remote.isFavorite : null;

      if (remote.deletedAt && compareTimes(remote.deletedAt, localTime) >= 0) {
        const idx = nextBooks.findIndex(book => book.id === remote.id);
        if (idx !== -1) {
          nextBooks.splice(idx, 1);
          changed = true;
          debugLog('remote book applied', { bookId: remote.id, reason: 'deletedAt tombstone', remoteFavorite: favoriteState });
        }
        return;
      }

      if (!local) {
        nextBooks.push(_toLocalBook(remote));
        changed = true;
        debugLog('remote book applied', { bookId: remote.id, reason: 'new book from remote', remoteFavorite: favoriteState });
        return;
      }

      const cmp = compareTimes(remoteTime, localTime);
      if (cmp > 0) {
        nextBooks[nextBooks.findIndex(book => book.id === remote.id)] = _mergeRemoteIntoLocal(local, remote);
        changed = true;
        debugLog('remote book applied', { bookId: remote.id, reason: 'remote newer', remoteFavorite: favoriteState, localFavorite: Boolean(local.isFavorite) });
      } else if (cmp < 0) {
        debugLog('remote book skipped', { bookId: remote.id, reason: 'local newer, queued upload', remoteFavorite: favoriteState, localFavorite: Boolean(local.isFavorite) });
        queueUpload('local-newer');
      } else {
        const merged = _mergeRemoteIntoLocal(local, remote);
        const favoriteChanged = typeof remote.isFavorite === 'boolean' && local.isFavorite !== remote.isFavorite;
        const hasRemoteUpdatedAt = Boolean(remote.updatedAt || remote.createdAt);
        if (favoriteChanged && (!hasRemoteUpdatedAt || remote.updatedAt === local.updatedAt)) {
          nextBooks[nextBooks.findIndex(book => book.id === remote.id)] = merged;
          changed = true;
          debugLog('remote book applied', { bookId: remote.id, reason: 'favorite changed on timestamp tie', remoteFavorite: favoriteState, localFavorite: Boolean(local.isFavorite) });
        } else if (remote.deletedAt && compareTimes(remote.deletedAt, local?.updatedAt || local?.createdAt || null) >= 0) {
          const idx = nextBooks.findIndex(book => book.id === remote.id);
          if (idx !== -1) {
            nextBooks.splice(idx, 1);
            changed = true;
          }
        } else {
          conflicts += 1;
          debugLog('remote book skipped', { bookId: remote.id, reason: 'timestamp tie or missing timestamp', remoteFavorite: favoriteState, localFavorite: Boolean(local.isFavorite), remoteUpdatedAt: remote.updatedAt || null, localUpdatedAt: local.updatedAt || null });
        }
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

  function applyInitialRemoteBooks(uid, remoteBooks) {
    if (!uid || Storage.getActiveAccountUid?.() !== uid) {
      debugLog('initial snapshot ignored for stale uid', { snapshotUid: uid, cacheUid: Storage.getActiveAccountUid?.() || null });
      return;
    }
    lastRemoteFingerprint = JSON.stringify(remoteBooks.map(book => [book.id, book.updatedAt, book.deletedAt, book.deviceId]).sort());
    const activeRemoteBooks = (Array.isArray(remoteBooks) ? remoteBooks : [])
      .filter(book => book?.id && !book.deletedAt)
      .map(_toLocalBook);
    applyingRemoteChanges = true;
    suppressWriteUntil = Date.now() + 2000;
    Storage.saveBooks(activeRemoteBooks);
    Storage.saveCloudBackupMeta?.({ syncReady: true });
    applyingRemoteChanges = false;
    setState(STATUS.SYNCED, activeRemoteBooks.length ? 'Waiting for changes' : 'No synced books yet', {
      conflictCount: 0,
      lastSyncedAt: new Date().toISOString(),
    });
    debugLog('initial remote snapshot applied', { uid, count: activeRemoteBooks.length });
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
      isFavorite: typeof remote.isFavorite === 'boolean' ? remote.isFavorite : Boolean(local.isFavorite),
      notes: typeof remote.notes === 'string' ? remote.notes : local.notes,
      quotes: Array.isArray(remote.quotes) ? remote.quotes : local.quotes,
      updatedAt: remote.updatedAt || local.updatedAt || new Date().toISOString(),
      createdAt: remote.createdAt || local.createdAt || new Date().toISOString(),
      deletedAt: remote.deletedAt ?? local.deletedAt ?? null,
    });
  }

  function onLocalChange() {
    if (!enabled) return;
    const detail = arguments?.[0]?.detail || null;
    const book = detail && typeof detail === 'object' ? detail : null;
    if (detail?.id && !book?.title && arguments?.[0]?.type === 'libriq:book:removed') {
      recordLocalDelete(detail.id);
    }
    if (book?.id && typeof book.isFavorite === 'boolean') {
      debugLog('favorite local change detected', { bookId: book.id, isFavorite: book.isFavorite, updatedAt: book.updatedAt || null });
    } else {
      debugLog('local book change detected', { page: Navigation.currentPage, sessionMode: Navigation.getCurrentSessionMode?.() || Navigation.getSessionPreference?.() });
    }
    if (!isEligible()) {
      setState(Navigation.getSessionPreference?.() === 'offline' ? STATUS.PAUSED : STATUS.UNAVAILABLE,
        Navigation.getSessionPreference?.() === 'offline' ? 'Sync paused in offline mode' : 'Sync unavailable');
      return;
    }
    queueUpload('local-change');
  }

  function enableWithPrompt() {
    return setEnabled(true);
  }

  function maybeAutoEnable(reason = 'account-mode') {
    if (!isAccountMode()) {
      if (enabled) refresh();
      return false;
    }
    const firebase = getFirebaseState();
    const user = getResolvedUser();
    if (isUserDisabled()) {
      if (enabled) setEnabled(false, { userInitiated: false });
      debugLog('account sync auto-enable skipped by user preference', { reason, uid: user?.uid || null });
      return false;
    }
    if (!firebase.available || !firebase.ready || !user || !window.LibriqFirebase?.hasFirestore?.()) {
      if (enabled) refresh();
      return false;
    }
    if (!enabled) {
      debugLog('account sync auto-enabled', { reason, uid: user.uid });
      return setEnabled(true);
    }
    refresh();
    return true;
  }

  window.addEventListener('libriq:auth-changed', () => {
    const nextUid = getResolvedUser()?.uid || null;
    if (lastAuthUid !== nextUid) {
      detachForAccountSwitch('auth-uid-changed');
      lastAuthUid = nextUid;
    }
    maybeAutoEnable('auth-changed');
  });
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

  maybeAutoEnable('startup');

  function debugStatus() {
    const firebase = getFirebaseState();
    const user = getResolvedUser();
    const sessionMode = Navigation.getCurrentSessionMode?.() || Navigation.getSessionPreference?.();
    const reasons = [];
    if (!enabled) reasons.push('not enabled in storage');
    if (!user) reasons.push('no uid');
    if (!firebase.available || !window.LibriqFirebase?.hasFirestore?.()) reasons.push('Firestore unavailable');
    if (!isAccountMode()) reasons.push('not account mode');
    if (Navigation.currentPage === 'session' || document.body.classList.contains('session-choice-active')) reasons.push('session choice active');
    if (lastError) reasons.push('listener error');
    const uid = currentUid || user?.uid || null;
    const syncPath = getSyncBooksCollectionPath(uid);
    return {
      enabled,
      userDisabled: isUserDisabled(),
      status,
      attached: listenerAttached,
      uid,
      deviceId: getDeviceId(),
      sessionMode,
      listenerPath,
      syncPath,
      lastSnapshotAt,
      lastWriteAt,
      lastError,
      ...getTombstoneStats(),
      disabledReasons: reasons,
      firebaseCurrentUserUid: firebase.user?.uid || window.LibriqFirebase?.getCurrentUser?.()?.uid || null,
      firestoreAvailable: Boolean(window.LibriqFirebase?.hasFirestore?.()),
      eligibilityAllowed: isEligible(),
      eligibilityBlockedReason: reasons[0] || null,
    };
  }

  window.LibriqSyncDebug = { status: debugStatus, pruneOldLocalTombstones };
  window.LibriqSyncPaths = {
    getSyncBooksCollectionSegments,
    getSyncBooksCollectionPath,
  };

  return { getState, setEnabled, pauseForOffline, enableWithPrompt, refresh, maybeAutoEnable, onLocalChange, queueUpload, pruneOldLocalTombstones, detachForAccountSwitch };
})();

window.LibriqSyncBeta = LibriqSyncBeta;
