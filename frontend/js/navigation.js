/* ============================================
   LIBRIQ NAVIGATION
   Client-side routing and page management
   ============================================ */

const Navigation = (() => {
  let _currentPage = 'dashboard';
  const SESSION_PREF_KEY = 'libriq_session_pref';
  const SESSION_MODE_KEY = 'libriq_session_mode';
  const PREFERRED_SESSION_MODE_KEY = 'libriq_preferred_session_mode';
  const DEBUG_SYNC = () => localStorage.getItem('libriq_debug_sync') === '1';
  let _lastAuthUid = null;

  function getMainContentRoot(context = 'navigation') {
    const main = document.getElementById('mainContent');
    if (!main) {
      console.error(`[LibriQ] Missing #mainContent while rendering ${context}.`);
      return null;
    }

    main.hidden = false;
    main.style.display = '';
    main.style.visibility = '';
    main.style.opacity = '';
    main.style.height = '';
    main.style.maxHeight = '';
    main.style.overflow = '';
    main.style.position = '';
    main.style.inset = '';
    return main;
  }

  function debugSync(message, details = null) {
    if (!DEBUG_SYNC()) return;
    const prefix = '[LibriQ][SyncDebug][Nav]';
    if (details !== null && details !== undefined) console.debug(prefix, message, details);
    else console.debug(prefix, message);
  }

  const pages = {
    boot:      () => renderBootPage(),
    session:   () => renderSessionChoicePage(),
    dashboard: () => Dashboard.render(),
    library:   () => renderLibraryPage(),
    reading:   () => renderStatusPage(LIBRIQ.STATUS.READING,  'Currently Reading', 'ph-book-open'),
    wishlist:  () => renderStatusPage(LIBRIQ.STATUS.WISHLIST, 'Want to Read',      'ph-bookmark'),
    finished:  () => renderStatusPage(LIBRIQ.STATUS.FINISHED, 'Finished Books',    'ph-check-circle'),
    favorites: () => renderFavoritesPage(),
    stats:     () => renderStatsPage(),
    activity:  () => renderActivityPage(),
    goals:     () => renderGoalsPage(),
    recommendations: () => renderRecommendationsPage(),
    help:      () => renderHelpPage(),
    profile:   () => renderProfilePage(),
    settings:  () => renderSettingsPage(),
  };

  function goTo(page) {
    if (!pages[page]) return;
    _currentPage = page;
    applyAuthShellStateForPage(page);

    Utils.$$('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
      el.setAttribute('aria-current', el.dataset.page === page ? 'page' : 'false');
    });

    closeMobileSidebar();

    const main = getMainContentRoot(`goTo(${page})`);
    if (main) main.innerHTML = '';
    try {
      pages[page]();
    } catch (err) {
      console.error(`[LibriQ] Failed to render ${page} page:`, err);
      if (main) {
        main.innerHTML = `
          <div class="page" id="${page}Page">
            <div class="page-header">
              <h1 class="page-title">${Utils.sanitize(page.charAt(0).toUpperCase() + page.slice(1))}</h1>
              <p class="page-subtitle">This page could not finish rendering.</p>
            </div>
          </div>`;
      }
    }
    if (page !== 'session') window.LibriqCloudBackup?.refresh?.();
    if (page === 'session') window.LibriqCloudBackup?.refresh?.();

    const mainRoot = getMainContentRoot(`goTo(${page})`);
    if (mainRoot) mainRoot.scrollTop = 0;
    window.dispatchEvent(new CustomEvent('libriq:page-changed', { detail: { page } }));
  }

  function renderCurrentPage() {
    applyAuthShellStateForPage(_currentPage);
    const main = getMainContentRoot(`renderCurrentPage(${_currentPage})`);
    if (main) main.innerHTML = '';
    try {
      if (pages[_currentPage]) pages[_currentPage]();
    } catch (err) {
      console.error(`[LibriQ] Failed to render current page ${_currentPage}:`, err);
      if (main) {
        main.innerHTML = `
          <div class="page" id="${_currentPage}Page">
            <div class="page-header">
              <h1 class="page-title">${Utils.sanitize(_currentPage.charAt(0).toUpperCase() + _currentPage.slice(1))}</h1>
              <p class="page-subtitle">This page could not finish rendering.</p>
            </div>
          </div>`;
      }
    }
  }

  function applyAuthShellStateForPage(page) {
    const body = document.body;
    body.classList.remove('auth-booting', 'auth-signed-in', 'auth-signed-out', 'auth-local-only');
    if (page === 'boot') {
      body.classList.add('auth-booting');
    } else if (page === 'session') {
      body.classList.add('auth-signed-out');
    } else if (getCurrentSessionMode() === 'offline' || getSessionPreference() === 'offline') {
      body.classList.add('auth-local-only');
    } else {
      body.classList.add('auth-signed-in');
    }
    body.classList.toggle('session-choice-active', page === 'session' || page === 'boot');
  }

  function getSessionPreference() {
    const raw = localStorage.getItem(SESSION_PREF_KEY) || 'prompt';
    return raw === 'google' ? 'account' : raw;
  }

  function setSessionPreference(value) {
    const next = value === 'google' ? 'account' : value;
    localStorage.setItem(SESSION_PREF_KEY, next);
    if (next === 'offline') {
      sessionStorage.setItem(SESSION_MODE_KEY, 'offline');
      localStorage.setItem(PREFERRED_SESSION_MODE_KEY, 'offline');
    } else if (next === 'account') {
      sessionStorage.setItem(SESSION_MODE_KEY, 'account');
      localStorage.setItem(PREFERRED_SESSION_MODE_KEY, 'account');
    } else {
      sessionStorage.removeItem(SESSION_MODE_KEY);
    }
  }

  function getCurrentSessionMode() {
    const raw = sessionStorage.getItem(SESSION_MODE_KEY) || localStorage.getItem(PREFERRED_SESSION_MODE_KEY) || getSessionPreference();
    return raw === 'google' ? 'account' : raw;
  }

  function clearAccountResume() {
    sessionStorage.removeItem(SESSION_MODE_KEY);
    localStorage.setItem(PREFERRED_SESSION_MODE_KEY, 'prompt');
  }

  function shouldResumeAccountMode() {
    const firebase = window.LibriqFirebase?.getState?.() || {};
    const stored = getCurrentSessionMode();
    const allow = Boolean(
      firebase.user &&
      firebase.ready &&
      stored !== 'offline' &&
      getSessionPreference() !== 'offline'
    );
    debugSync('resume check', {
      uid: firebase.user?.uid || null,
      ready: firebase.ready,
      currentSessionMode: stored,
      preferredSessionMode: localStorage.getItem(PREFERRED_SESSION_MODE_KEY) || null,
      sessionPref: getSessionPreference(),
      allowed: allow,
    });
    return allow;
  }

  function resumeAccountModeIfAllowed() {
    debugSync('resume attempt', {
      currentPage: _currentPage,
      sessionChoiceActive: document.body.classList.contains('session-choice-active'),
    });
    if (!shouldResumeAccountMode()) {
      debugSync('resume blocked');
      return false;
    }
    debugSync('resume allowed');
    if (_currentPage === 'session' || document.body.classList.contains('session-choice-active')) {
      goTo('dashboard');
      window.LibriqSyncBeta?.refresh?.();
      return true;
    }
    return false;
  }

  function openMobileSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function updateBadges() {
    const stats = Storage.getStats();
    const map = {
      'badge-library':  stats.total,
      'badge-reading':  stats.reading,
      'badge-wishlist': stats.wishlist,
      'badge-finished': stats.finished,
    };
    Object.entries(map).forEach(([id, count]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = count;
    });

    const streak = Storage.getStreak();
    const streakEl = document.getElementById('streakCount');
    if (streakEl) streakEl.textContent = streak.current;
  }

  function applyTheme() {
    const theme = _getActiveTheme();
    document.documentElement.setAttribute('data-theme', theme);
    _updateThemeToggleUI(theme);
  }

  function _getActiveTheme() {
    const attrTheme = document.documentElement.getAttribute('data-theme');
    if (attrTheme === 'dark' || attrTheme === 'light') return attrTheme;
    const profile = Storage.getProfile?.();
    return profile?.theme === 'light' ? 'light' : 'dark';
  }

  function _withThemeSwitchLock(fn) {
    const root = document.documentElement;
    root.classList.add('theme-switching');
    fn();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.classList.remove('theme-switching');
      });
    });
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    _withThemeSwitchLock(() => {
      document.documentElement.setAttribute('data-theme', next);
      _updateThemeToggleUI(next);
    });
    Storage.saveProfile({ theme: next });
    if (_currentPage === 'settings') renderSettingsPage();
  }

  function _updateThemeToggleUI(theme) {
    const icon  = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    const iconDesktop = document.getElementById('themeIconDesktop');
    if (icon)  icon.className   = theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
    if (iconDesktop) iconDesktop.className = theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
    if (label) label.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
  }

  function updateDesktopStatusPill() {
    const el = document.getElementById('desktopStatusPill');
    if (!el) return;
    const firebase = window.LibriqFirebase?.getState?.() || {};
    const syncState = window.LibriqSyncBeta?.getState?.() || {};
    const offline = getSessionPreference() === 'offline' || getCurrentSessionMode() === 'offline';
    const label = !firebase.user
      ? 'Signed out'
      : offline
        ? 'Offline mode'
        : syncState.enabled
          ? 'Sync on'
          : 'Ready';
    el.querySelector('span')?.replaceChildren(document.createTextNode(label));
    const icon = el.querySelector('i');
    if (icon) icon.className = !firebase.user ? 'ph ph-user-circle' : offline ? 'ph ph-wifi-slash' : syncState.enabled ? 'ph ph-swap' : 'ph ph-signal';
  }

  function init() {
    Utils.$$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page));
    });

    document.getElementById('mobileMenuBtn')?.addEventListener('click', openMobileSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', closeMobileSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('touchstart', closeMobileSidebar, { passive: true });

    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    document.getElementById('themeToggleDesktop')?.addEventListener('click', toggleTheme);

    applyTheme();
    updateBadges();
    updateDesktopStatusPill();
    const tryResume = () => {
      const firebase = window.LibriqFirebase?.getState?.() || {};
      debugSync('startup resume check', {
        uid: firebase.user?.uid || null,
        ready: firebase.ready,
        hasUser: Boolean(firebase.user),
        sessionPref: getSessionPreference(),
        currentSessionMode: getCurrentSessionMode(),
      });
      if (firebase.ready && firebase.user && shouldResumeAccountMode()) {
        resumeAccountModeIfAllowed();
      }
    };
    tryResume();
    window.setTimeout(tryResume, 500);
    window.addEventListener('libriq:auth-changed', () => {
      const firebase = window.LibriqFirebase?.getState?.() || {};
      const nextUid = firebase.user?.uid || null;
      const uidChanged = _lastAuthUid !== nextUid;
      _lastAuthUid = nextUid;
      debugSync('auth state resolved', {
        uid: firebase.user?.uid || null,
        ready: firebase.ready,
        hasUser: Boolean(firebase.user),
        restoringSession: Boolean(firebase.restoringSession),
        currentSessionMode: getCurrentSessionMode(),
        preferredSessionMode: localStorage.getItem(PREFERRED_SESSION_MODE_KEY) || null,
        sessionPref: getSessionPreference(),
      });
      if (uidChanged) {
        window.LibriqSyncBeta?.detachForAccountSwitch?.('navigation-auth-change');
        Navigation.updateBadges?.();
      }
      if (!firebase.user && !firebase.restoringSession) {
        clearAccountResume();
        if (getCurrentSessionMode() !== 'offline' && getSessionPreference() !== 'offline') {
          if (_currentPage !== 'session') goTo('session');
          else renderSessionChoicePage();
          return;
        }
      }
      if (firebase.user && shouldResumeAccountMode()) {
        resumeAccountModeIfAllowed();
      } else if (firebase.ready && _currentPage === 'boot') {
        routeAfterAuthReady();
      } else if (firebase.restoringSession && _currentPage === 'session') {
        renderSessionChoicePage();
      } else if (_currentPage === 'settings') renderSettingsPage();
      if (_currentPage === 'session') renderSessionChoicePage();
      window.LibriqCloudBackup?.refresh?.();
      window.LibriqSyncBeta?.refresh?.();
      updateDesktopStatusPill();
      maybeShowNewDeviceCloudPrompt();
    });
    window.addEventListener('libriq:activity:updated', () => {
      if (['dashboard', 'activity'].includes(_currentPage)) {
        Navigation.renderCurrentPage?.();
      }
    });
    if (DEBUG_SYNC()) {
      debugSync('init state', {
        currentPage: _currentPage,
        sessionPref: getSessionPreference(),
        currentSessionMode: getCurrentSessionMode(),
        preferredSessionMode: localStorage.getItem(PREFERRED_SESSION_MODE_KEY) || null,
      });
    }
  }

  return {
    init, goTo, renderCurrentPage, updateBadges, toggleTheme, applyTheme,
    getActiveTheme: _getActiveTheme,
    updateDesktopStatusPill,
    routeAfterAuthReady,
    setSessionPreference,
    getSessionPreference,
    getCurrentSessionMode,
    shouldResumeAccountMode,
    resumeAccountModeIfAllowed,
    clearAccountResume,
    clearLibrarySearch,
    clearLocalCache,
    confirmDeleteLibraryData,
    confirmDeleteAccount,
    get currentPage() { return _currentPage; },
  };
})();

window.LibriqNavigation = Navigation;

function renderBootPage() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  main.hidden = false;
  main.innerHTML = `
    <div class="session-page">
      <section class="session-hero">
        <div class="session-card-stack" style="max-width: 420px; margin: 0 auto;">
          <div class="session-loading-card" aria-live="polite">
            <div class="session-loading-spinner"></div>
            <div>
              <div class="session-card-title">Opening LibriQ</div>
              <div class="session-card-body">Checking your account before loading your library.</div>
            </div>
          </div>
        </div>
      </section>
    </div>`;
}

function routeAfterAuthReady() {
  const firebase = window.LibriqFirebase?.getState?.() || {};
  if (!firebase.ready) {
    Navigation.goTo('boot');
    return false;
  }
  if (firebase.user || firebase.restoringSession) {
    if (firebase.user) {
    window.LibriqStorage?.setActiveAccountUid?.(firebase.user.uid);
    Navigation.setSessionPreference?.('account');
    }
    Navigation.goTo('dashboard');
    window.LibriqSyncBeta?.maybeAutoEnable?.('auth-ready');
    return true;
  }
  window.LibriqStorage?.clearActiveAccountScope?.();
  if (Navigation.getCurrentSessionMode?.() === 'offline' || Navigation.getSessionPreference?.() === 'offline') {
    Navigation.goTo('dashboard');
    return true;
  }
  Navigation.goTo('session');
  return true;
}

function _cloudRestoreDismissKey(uid) {
  return uid ? `libriq_cloud_restore_dismissed_${uid}` : 'libriq_cloud_restore_dismissed';
}

async function maybeShowNewDeviceCloudPrompt() {
  const firebase = window.LibriqFirebase?.getState?.() || {};
  if (!firebase.user || !firebase.ready || !window.LibriqFirebase?.hasFirestore?.()) return;
  if (Storage.getBooks().length > 0) return;
  if (Navigation.currentPage === 'session' || document.body.classList.contains('session-choice-active')) return;
  if (Navigation.getSessionPreference?.() === 'offline') return;

  const dismissKey = _cloudRestoreDismissKey(firebase.user.uid);
  if (localStorage.getItem(dismissKey) === '1') return;

  try {
    const snap = await window.LibriqFirebase.readBackupDoc(['users', firebase.user.uid, 'backups', 'current']);
    if (!snap?.exists?.()) return;
    const docData = _normalizeCloudBackupDoc(snap.data());
    if (!docData) return;

    const main = document.getElementById('mainContent');
    if (!main || !document.body.classList.contains('session-choice-active')) return;

    const card = document.createElement('div');
    card.className = 'goal-widget';
    card.id = 'newDeviceCloudPrompt';
    card.style.marginTop = 'var(--space-6)';
    card.innerHTML = `
      <div class="goal-header"><div class="goal-title">Cloud backup found</div></div>
      <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">We found a cloud backup for your account.</div>
          <div class="activity-subtitle">Restore here or keep this device empty for now.</div>
        </div>
      </div>
      <div style="display:flex; gap: var(--space-2); flex-wrap: wrap;">
        <button class="btn btn-primary btn-sm" id="newDeviceCloudRestoreBtn" type="button">Restore here</button>
        <button class="btn btn-secondary btn-sm" id="newDeviceCloudDismissBtn" type="button">Keep this device empty for now</button>
      </div>
    `;
    main.prepend(card);
    document.getElementById('newDeviceCloudRestoreBtn')?.addEventListener('click', async () => {
      card.remove();
      await confirmAndRestoreCloud(docData, _summarizeLibrary(Storage.getBooks(), Storage.getActivityLog?.() || []));
    });
    document.getElementById('newDeviceCloudDismissBtn')?.addEventListener('click', () => {
      localStorage.setItem(dismissKey, '1');
      card.remove();
    });
  } catch (err) {
    console.warn('[Libriq] New-device cloud prompt failed:', err);
  }
}

const CloudBackup = (() => {
  const STATUS = {
    IDLE: 'idle',
    SCHEDULED: 'scheduled',
    SAVING: 'saving',
    BACKED_UP: 'backed_up',
    FAILED: 'failed',
    PAUSED: 'paused',
  };
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
  let restoreInProgress = false;
  let suppressAutoBackupUntil = 0;
  const DEBUG_AUTO_BACKUP = Boolean(window.localStorage?.getItem('libriq_debug_auto_backup'));
  const CLOUD_PROMPT_DISMISS_KEY = 'libriq_cloud_restore_dismissed';

  function logDebug(message, details = null) {
    if (!DEBUG_AUTO_BACKUP) return;
    const prefix = '[LibriQ][AutoBackup]';
    if (details !== null && details !== undefined) console.debug(prefix, message, details);
    else console.debug(prefix, message);
  }

  function getFirebaseState() {
    return window.LibriqFirebase?.getState?.() || { available: false, initialized: false, ready: false, user: null };
  }

  function getDeviceId() {
    return Storage.getDeviceId?.() || localStorage.getItem('libriq_device_id') || null;
  }

  function getBackupPath(uid) {
    return ['users', uid, 'backups', 'current'];
  }

  function shouldSuppressAutoBackup() {
    return Date.now() < suppressAutoBackupUntil;
  }

  function suppressAutoBackupFor(ms = 1500) {
    suppressAutoBackupUntil = Date.now() + ms;
  }

  function isEligible() {
    const firebase = getFirebaseState();
    const sessionPref = Navigation.getSessionPreference?.();
    const result = Boolean(
      firebase.available &&
      firebase.ready &&
      firebase.user &&
      window.LibriqFirebase?.hasFirestore?.() &&
      sessionPref !== 'offline' &&
      Navigation.currentPage !== 'session' &&
      !document.body.classList.contains('session-choice-active') &&
      !paused &&
      !shouldSuppressAutoBackup()
    );
    logDebug('eligibility check', {
      result,
      firebase: {
        available: firebase.available,
        ready: firebase.ready,
        hasUser: Boolean(firebase.user),
      },
      firestore: Boolean(window.LibriqFirebase?.hasFirestore?.()),
      sessionPref,
      currentPage: Navigation.currentPage,
      paused,
    });
    return result;
  }

  function setStatus(status, message = '', error = null) {
    lastStatus = status;
    lastMessage = message;
    lastError = error;
    if (status === STATUS.BACKED_UP) lastSavedAt = new Date().toISOString();
    logDebug('status set', { status, message });
    updateSettingsBackupUI();
  }

  function updateSettingsBackupUI() {
    const card = document.getElementById('settingsCloudBackupCard');
    if (!card) return;

    const cloudState = getState();
    const firebase = getFirebaseState();
    const hasFirestore = Boolean(window.LibriqFirebase?.hasFirestore?.());
    const offlineMode = Navigation.getSessionPreference?.() === 'offline';
    const accountCopyEl = card.closest('.goal-widget')?.querySelector('#settingsAccountCloudCopy');
    const accountBackupCopyEl = card.closest('.goal-widget')?.querySelector('#settingsAccountCloudBackupCopy');
    const subtitles = card.querySelectorAll('.activity-subtitle');
    const statusEl = subtitles[0] || null;
    const secondaryEl = subtitles[1] || null;
    const lastSavedEl = subtitles[2] || null;
    const bookCountEl = subtitles[3] || null;

    const accountCopy = !firebase.user
      ? 'Sign in to enable cloud backup.'
      : offlineMode
        ? 'You\'re signed in, but using offline mode for this session. Cloud backup is paused.'
        : hasFirestore
          ? 'Cloud backup is active for this account.'
          : 'You\'re signed in, but cloud backup is unavailable right now.';

    if (statusEl) {
      statusEl.textContent = cloudState.message || (cloudState.status === STATUS.BACKED_UP ? 'Backed up just now' : 'Cloud backup active');
    }
    if (secondaryEl) {
      secondaryEl.textContent = cloudState.status === STATUS.PAUSED
        ? (offlineMode ? 'Offline mode pauses automatic backup for this session.' : 'Cloud backup is paused.')
        : 'Cloud backup saves this device\'s library to your account. Restore from cloud is manual.';
    }
    if (lastSavedEl) {
      lastSavedEl.textContent = cloudState.lastSavedAt
        ? formatLastSavedLabel(cloudState.lastSavedAt)
        : 'No cloud backup yet.';
    }
    if (bookCountEl) {
      const meta = Storage.getCloudBackupMeta?.() || {};
      bookCountEl.textContent = `Book count: ${typeof meta.bookCount === 'number' ? meta.bookCount : 'Unknown'}`;
    }
    if (accountCopyEl) accountCopyEl.textContent = accountCopy;
    if (accountBackupCopyEl) accountBackupCopyEl.textContent = cloudState.lastSavedAt
      ? formatLastSavedLabel(cloudState.lastSavedAt)
      : 'Your library is backed up to your account on this device.';

    if (DEBUG_AUTO_BACKUP) {
      logDebug('targeted cloud backup card update', {
        accountCopy,
        status: cloudState.status,
        lastSavedAt: cloudState.lastSavedAt,
      });
    }
  }

  function scheduleIfAllowed(reason) {
    if (suppressScheduling) {
      logDebug('auto backup skipped with reason', { reason: 'suppressed', requestedReason: reason });
      return;
    }
    const syncState = window.LibriqSyncBeta?.getState?.() || {};
    if (syncState.enabled && syncState.status !== 'off' && syncState.status !== 'error') {
      logDebug('auto backup skipped with reason', { reason: 'sync-active', syncState });
      return;
    }
    schedule(reason);
  }

  function getVisibleStatus() {
    if (lastStatus === STATUS.SAVING && manualSaving) return 'Saving...';
    if (lastStatus === STATUS.SAVING && autoBackupInProgress) return lastMessage || 'Cloud backup active';
    if (lastStatus === STATUS.BACKED_UP) return lastMessage || 'Backed up just now';
    if (lastStatus === STATUS.FAILED) return lastMessage || 'Backup failed. Your local data is still safe.';
    if (lastStatus === STATUS.PAUSED) return lastMessage || 'Cloud backup paused';
    if (lastStatus === STATUS.SCHEDULED) return 'Cloud backup active';
    return lastMessage || 'Cloud backup active';
  }

  function formatLastSavedLabel(value) {
    if (!value) return 'No cloud backup yet.';
    const savedAt = new Date(value);
    if (Number.isNaN(savedAt.getTime())) return 'No cloud backup yet.';
    const now = new Date();
    if (savedAt.toDateString() === now.toDateString()) {
      const time = savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      return `Last backed up: just now at ${time}`;
    }
    return `Last backed up: ${Utils.formatDate(savedAt.toISOString())}`;
  }

  async function performCloudBackup(reason = 'manual', automatic = false) {
    if (!isEligible()) {
      setStatus('paused', Navigation.getSessionPreference?.() === 'offline' ? 'Offline mode: cloud backup paused' : 'Sign in to enable cloud backup');
      logDebug('skipped', { reason: 'ineligible', requestedReason: reason, automatic });
      return false;
    }

    const firebase = getFirebaseState();
    const uid = firebase.user.uid;
    const payload = _buildManualBackupPayload();
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

    logDebug('backup started', { reason, automatic, uid, path: ['users', uid, 'backups', 'current'] });
    manualSaving = !automatic;
    autoBackupInProgress = automatic;
    if (automatic) {
      setStatus(lastStatus === STATUS.BACKED_UP ? STATUS.BACKED_UP : STATUS.IDLE, lastMessage || 'Cloud backup active');
    } else {
      setStatus(STATUS.SAVING, 'Saving...');
    }

    try {
      await window.LibriqFirebase.writeBackupDoc(getBackupPath(uid), docData);
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
          Utils.toast('Cloud backup saved', 'success');
        }
      } finally {
        suppressScheduling = false;
      }
      setStatus(STATUS.BACKED_UP, formatLastSavedLabel(savedAt));
      logDebug('backup write succeeded', { reason, automatic, savedAt });
      logDebug('status set to backed up', { savedAt, bookCount: docData.bookCount, activityCount: docData.activityCount });
      return true;
    } catch (err) {
      const code = String(err?.code || err?.message || '').toLowerCase();
      lastError = err;
      logDebug('auto backup write failed', { reason, automatic, code, message: err?.message || '' });
      if (!automatic) {
        if (code.includes('permission-denied')) {
          Utils.toast('You do not have permission to save this cloud backup.', 'error');
        } else if (code.includes('unauthenticated') || code.includes('authentication-required')) {
          Utils.toast('Please sign in again before saving your cloud backup.', 'error');
        } else if (code.includes('unavailable') || code.includes('network')) {
          Utils.toast('Network error while saving cloud backup.', 'error');
        } else {
          Utils.toast('Could not save cloud backup right now.', 'error');
        }
      }
      setStatus(STATUS.FAILED, 'Backup failed. Your local data is still safe.', err);
      return false;
    } finally {
      manualSaving = false;
      autoBackupInProgress = false;
    }
  }

  async function runBackup(reason = 'manual', automatic = false) {
    if (backupInFlight) {
      pendingReason = reason;
      logDebug('any follow-up backup queued', { reason, automatic });
      return backupInFlight;
    }

    backupInFlight = performCloudBackup(reason, automatic)
      .finally(() => {
      backupInFlight = null;
      const followUp = pendingReason;
      pendingReason = null;
      if (followUp) {
        if (isEligible()) schedule(followUp);
        else setStatus(STATUS.PAUSED, Navigation.getSessionPreference?.() === 'offline' ? 'Offline mode: cloud backup paused' : 'Cloud backup paused');
      }
      });
    return backupInFlight;
  }

  function schedule(reason = 'local-change') {
    const syncState = window.LibriqSyncBeta?.getState?.() || {};
    if (syncState.enabled && syncState.status !== 'off' && syncState.status !== 'error') {
      const pausedMessage = 'Cloud backup paused while sync is active.';
      setStatus(STATUS.PAUSED, pausedMessage);
      logDebug('auto backup skipped with reason', { reason, pausedMessage, syncState });
      return;
    }
    if (!isEligible()) {
      const pausedMessage = Navigation.getSessionPreference?.() === 'offline' ? 'Offline mode: cloud backup paused' : 'Cloud backup paused';
      setStatus(STATUS.PAUSED, pausedMessage);
      logDebug('auto backup skipped with reason', { reason, pausedMessage });
      return;
    }
    const debounceMs = 2200;
    logDebug('auto backup scheduled', { reason, debounceMs });
    if (debounceTimer) clearTimeout(debounceTimer);
    pendingReason = reason;
    setStatus(STATUS.SCHEDULED, 'Cloud backup active');
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null;
      logDebug('debounce fired', { reason });
      runBackup(reason, true);
    }, debounceMs);
  }

  function pause(reason = 'paused') {
    paused = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    const message = reason === 'session' ? 'Cloud backup paused' : 'Offline mode: cloud backup paused';
    setStatus(STATUS.PAUSED, message);
    logDebug('paused', { reason, message });
  }

  function refresh() {
    paused = false;
    if (isEligible()) {
      setStatus(STATUS.IDLE, 'Cloud backup active');
    } else {
      setStatus(STATUS.PAUSED, Navigation.getSessionPreference?.() === 'offline' ? 'Offline mode: cloud backup paused' : 'Sign in to enable cloud backup');
    }
  }

  function getState() {
    return {
      status: lastStatus,
      message: getVisibleStatus(),
      lastSavedAt,
      error: lastError,
      pending: Boolean(debounceTimer || backupInFlight),
      manualSaving,
      autoBackupInProgress,
    };
  }

  return { schedule, scheduleIfAllowed, pause, refresh, getState, runBackup, formatLastSavedLabel, suppressAutoBackupFor };
})();

window.LibriqCloudBackup = CloudBackup;

function renderSessionChoicePage() {
  const main = document.getElementById('mainContent');
  if (!main) {
    console.error('[LibriQ] Missing #mainContent while rendering session choice page.');
    return;
  }
  main.hidden = false;
  const firebase = window.LibriqFirebase?.getState?.() || { available: false, initialized: false, ready: false, user: null };
  const sessionContext = window.LibriqFirebase?.getSessionContext?.() || { isInAppBrowser: false, hints: [] };
  const hasUser = Boolean(firebase.user);
  const accountName = getDisplayNameForAccount(firebase.user);
  const loading = !firebase.initialized || (firebase.available && !firebase.ready);
  const inAppBrowser = Boolean(sessionContext.isInAppBrowser);
  const signInButtonLabel = hasUser ? `Continue as ${Utils.sanitize(accountName)}` : 'Continue with Google';
  const signInButtonHelp = inAppBrowser
    ? 'Google sign-in may not work inside this app browser.'
    : 'Use your account for cloud backup and Account Sync.';
  const browserHelp = inAppBrowser
    ? 'Open LibriQ in Chrome or Safari to sign in with Google.'
    : '';
  const openInBrowserHref = 'https://libriq.app';
  const authUnavailable = !firebase.available || (typeof navigator !== 'undefined' && navigator.onLine === false);
  const offlineCheckDelayMs = 900;
  const offlineStabilityMs = 1400;

  if (!window.LibriqSessionFallback) {
    window.LibriqSessionFallback = {
      timer: null,
      lastRequestedAt: 0,
      dismissAt: 0,
      modalVisible: false,
    };
  }
  const fallbackState = window.LibriqSessionFallback;

  main.innerHTML = `
    <div class="session-page">
      <section class="session-hero">
        <div class="session-hero-orb session-hero-orb-a"></div>
        <div class="session-hero-orb session-hero-orb-b"></div>

        <div class="session-copy">
          <span class="session-eyebrow">Welcome to LibriQ</span>
          <h1 class="session-title">Sign in to LibriQ</h1>
          <p class="session-subtitle">
            Continue with an account so your reading life can move with you. If the connection drops, an offline fallback may appear so you can keep using the app on this device.
          </p>

          <div class="session-points">
            <div class="session-point">
              <i class="ph ph-cloud-check"></i>
              <span>Account mode enables cloud backup and Account Sync for signed-in devices.</span>
            </div>
            ${inAppBrowser ? `
            <div class="session-point session-point-warning">
              <i class="ph ph-warning-circle"></i>
              <span>Google sign-in may not work inside this app browser.</span>
            </div>` : ''}
            <div class="session-point">
              <i class="ph ph-shield-check"></i>
              <span>Continue offline only appears when LibriQ cannot reach account services.</span>
            </div>
          </div>
        </div>

        <div class="session-card-stack">
          ${loading ? `
            <div class="session-loading-card" aria-live="polite">
              <div class="session-loading-spinner"></div>
              <div>
                <div class="session-card-title">Checking your sign-in status</div>
                <div class="session-card-body">Just a moment while LibriQ checks whether you are already signed in.</div>
              </div>
            </div>
          ` : ''}

          ${loading ? '' : hasUser ? `
            <button class="session-card session-card-primary" id="googleContinueBtn" type="button">
              <div class="session-card-icon"><i class="ph ph-user-circle"></i></div>
              <div class="session-card-content">
                <div class="session-card-title">Continue as ${Utils.sanitize(accountName)}</div>
                <div class="session-card-body">Enter LibriQ with your current Google account. Automatic cloud backup is enabled for this session.</div>
              </div>
              <div class="session-card-action"><i class="ph ph-arrow-right"></i></div>
            </button>
          ` : firebase.initialized ? `
            <button class="session-card session-card-primary ${inAppBrowser ? 'session-card-disabled' : ''}" id="googleSignInBtn" type="button" ${inAppBrowser ? 'aria-describedby="googleSignInHelp"' : ''}>
              <div class="session-card-icon"><i class="ph ph-google-logo"></i></div>
              <div class="session-card-content">
                <div class="session-card-title">${signInButtonLabel}</div>
                <div class="session-card-body" id="googleSignInHelp">${Utils.sanitize(signInButtonHelp)}</div>
              </div>
              <div class="session-card-action"><i class="ph ph-arrow-right"></i></div>
            </button>
          ` : `
            <div class="session-card session-card-unavailable">
              <div class="session-card-icon"><i class="ph ph-warning-circle"></i></div>
              <div class="session-card-content">
                <div class="session-card-title">Account sign-in unavailable</div>
                <div class="session-card-body">LibriQ cannot reach account services right now.</div>
              </div>
            </div>
          `}

          ${!loading && !hasUser && firebase.initialized && firebase.available ? `
            <div class="session-auth-tabs" role="tablist" aria-label="Email account options">
              <button class="session-auth-tab active" type="button" data-auth-mode="signin">Sign in with Email</button>
              <button class="session-auth-tab" type="button" data-auth-mode="signup">Create account</button>
            </div>
            <form class="session-email-form" id="emailAuthForm" novalidate>
              <input class="form-input" id="sessionEmailInput" type="email" placeholder="Email address" autocomplete="email" required />
              <input class="form-input" id="sessionPasswordInput" type="password" placeholder="Password" autocomplete="current-password" required />
              <p class="session-auth-error" id="sessionAuthError" role="alert" hidden></p>
              <button class="btn btn-primary" id="emailAuthSubmit" type="submit">
                <i class="ph ph-envelope-simple"></i>
                <span>Sign in with Email</span>
              </button>
            </form>
          ` : ''}

          ${browserHelp ? `
            <div class="session-help-callout">
              <div class="session-help-copy">${Utils.sanitize(browserHelp)}</div>
              <a class="session-help-link" href="${openInBrowserHref}" target="_blank" rel="noopener noreferrer">Open in browser</a>
            </div>
          ` : ''}

          ${hasUser ? `
            <button class="session-link-btn" id="switchAccountBtn" type="button">
              Use another account
            </button>
          ` : ''}

          <p class="session-fineprint">
            Account mode keeps existing backup and sync behavior. Offline mode remains available when the network is unavailable.
          </p>
        </div>
      </section>
      <div class="session-fallback-modal" id="sessionFallbackModal" role="dialog" aria-modal="true" aria-labelledby="sessionFallbackTitle" hidden>
        <div class="session-fallback-card">
          <div class="session-card-icon"><i class="ph ph-wifi-slash"></i></div>
          <div>
            <h2 class="session-fallback-title" id="sessionFallbackTitle">No internet connection</h2>
            <p class="session-fallback-copy">LibriQ needs internet to sign in and sync your library. You can continue offline on this device, and your changes will stay local.</p>
          </div>
          <div class="session-fallback-actions">
            <button class="btn btn-primary" id="authRetryBtn" type="button"><i class="ph ph-arrow-clockwise"></i> Retry</button>
            <button class="btn btn-secondary" id="fallbackOfflineBtn" type="button"><i class="ph ph-house-simple"></i> Continue offline</button>
          </div>
        </div>
      </div>
    </div>`;

  const continueOffline = () => {
    Navigation.setSessionPreference('offline');
    window.LibriqSyncBeta?.pauseForOffline?.();
    Navigation.goTo('dashboard');
  };
  const hideFallback = () => {
    const modal = document.getElementById('sessionFallbackModal');
    if (!modal) return;
    modal.hidden = true;
    fallbackState.modalVisible = false;
    fallbackState.dismissAt = Date.now();
  };
  const showFallback = () => {
    const modal = document.getElementById('sessionFallbackModal');
    if (!modal) return;
    modal.hidden = false;
    fallbackState.modalVisible = true;
    fallbackState.dismissAt = 0;
  };
  const clearFallbackTimer = () => {
    if (fallbackState.timer) {
      window.clearTimeout(fallbackState.timer);
      fallbackState.timer = null;
    }
  };
  const shouldShowBlockingOffline = () => {
    if (typeof navigator === 'undefined') return false;
    if (navigator.onLine !== false) return false;
    if (document.visibilityState && document.visibilityState !== 'visible') return false;
    if (Navigation.getSessionPreference?.() === 'offline') return false;
    if (Navigation.getCurrentSessionMode?.() === 'offline') return false;
    return true;
  };
  const scheduleFallback = (reason = 'network') => {
    fallbackState.lastRequestedAt = Date.now();
    clearFallbackTimer();
    if (!shouldShowBlockingOffline()) {
      hideFallback();
      return;
    }
    fallbackState.timer = window.setTimeout(() => {
      fallbackState.timer = null;
      if (!shouldShowBlockingOffline()) {
        hideFallback();
        return;
      }
      if (Date.now() - fallbackState.lastRequestedAt < offlineStabilityMs) return;
      showFallback();
    }, offlineCheckDelayMs);
  };
  const reconcileFallback = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
      clearFallbackTimer();
      hideFallback();
      renderSessionChoicePage();
      return;
    }
    scheduleFallback('recheck');
  };
  const setEmailMode = (mode) => {
    const nextMode = mode === 'signup' ? 'signup' : 'signin';
    const form = document.getElementById('emailAuthForm');
    const password = document.getElementById('sessionPasswordInput');
    const submit = document.getElementById('emailAuthSubmit');
    form?.setAttribute('data-auth-mode', nextMode);
    password?.setAttribute('autocomplete', nextMode === 'signup' ? 'new-password' : 'current-password');
    if (submit) submit.querySelector('span').textContent = nextMode === 'signup' ? 'Create account' : 'Sign in with Email';
    Utils.$$('.session-auth-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.authMode === nextMode);
    });
  };
  const showAuthError = (message) => {
    const errorEl = document.getElementById('sessionAuthError');
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.hidden = false;
  };
  const clearAuthError = () => {
    const errorEl = document.getElementById('sessionAuthError');
    if (!errorEl) return;
    errorEl.textContent = '';
    errorEl.hidden = true;
  };
  const retryAuth = () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      scheduleFallback('retry');
      return;
    }
    renderSessionChoicePage();
  };

  if (!firebase.initialized) {
    hideFallback();
  } else if (authUnavailable && !loading) {
    scheduleFallback('initial');
  } else {
    hideFallback();
  }

  document.getElementById('googleContinueBtn')?.addEventListener('click', () => {
    Navigation.setSessionPreference('google');
    window.LibriqSyncBeta?.maybeAutoEnable?.('account-continue');
    Navigation.goTo('dashboard');
  });

  document.getElementById('googleSignInBtn')?.addEventListener('click', async () => {
    if (inAppBrowser) {
      Utils.toast('Google sign-in may not work inside this app browser.', 'warning');
      return;
    }
    try {
      await window.LibriqFirebase?.signInWithGoogle?.();
      Navigation.setSessionPreference('google');
      window.LibriqSyncBeta?.maybeAutoEnable?.('google-sign-in');
      Utils.toast('Sync is on. Your books will update across signed-in devices.', 'success');
      Navigation.goTo('dashboard');
    } catch (err) {
      console.warn('[Libriq] Google sign-in failed:', {
        code: err?.code || '',
        message: err?.message || '',
        details: err?.details || null,
      });
      const message = getFriendlyAuthError(err, 'google');
      if (isAuthNetworkError(err)) {
        showFallback();
      } else {
        Utils.toast(message, getAuthToastType(err));
      }
    }
  });

  Utils.$$('.session-auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      clearAuthError();
      setEmailMode(btn.dataset.authMode);
    });
  });

  document.getElementById('emailAuthForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearAuthError();
    const form = event.currentTarget;
    const mode = form?.getAttribute('data-auth-mode') === 'signup' ? 'signup' : 'signin';
    const email = document.getElementById('sessionEmailInput')?.value || '';
    const password = document.getElementById('sessionPasswordInput')?.value || '';
    const submit = document.getElementById('emailAuthSubmit');
    submit?.setAttribute('disabled', '');
    try {
      if (mode === 'signup') {
        await window.LibriqFirebase?.createAccountWithEmail?.(email, password);
      } else {
        await window.LibriqFirebase?.signInWithEmail?.(email, password);
      }
      Navigation.setSessionPreference('account');
      window.LibriqSyncBeta?.maybeAutoEnable?.(mode === 'signup' ? 'email-sign-up' : 'email-sign-in');
      Utils.toast('Sync is on. Your books will update across signed-in devices.', 'success');
      Navigation.goTo('dashboard');
    } catch (err) {
      console.warn('[Libriq] Email auth failed:', { code: err?.code || '', message: err?.message || '' });
      const message = getFriendlyAuthError(err, mode);
      if (isAuthNetworkError(err)) showFallback();
      showAuthError(message);
    } finally {
      submit?.removeAttribute('disabled');
    }
  });

  document.getElementById('authRetryBtn')?.addEventListener('click', retryAuth);
  document.getElementById('fallbackOfflineBtn')?.addEventListener('click', continueOffline);

  document.getElementById('switchAccountBtn')?.addEventListener('click', async () => {
    try {
      await window.LibriqFirebase?.signOut?.();
      Navigation.setSessionPreference('prompt');
      Navigation.clearAccountResume?.();
    } catch (err) {
      const code = String(err?.code || err?.message || '');
      const cancelled = code.includes('popup-closed-by-user') || code.includes('popup-blocked');
      Utils.toast(cancelled ? 'Sign-out was cancelled.' : 'Could not switch accounts right now.', 'error');
    }
  });

  if (!window.LibriqSessionFallback.listenersAttached) {
    window.addEventListener('online', reconcileFallback);
    window.addEventListener('offline', () => scheduleFallback('offline-event'));
    document.addEventListener('visibilitychange', reconcileFallback);
    window.LibriqSessionFallback.listenersAttached = true;
  }
}

function isAuthNetworkError(err) {
  const code = String(err?.code || err?.message || '').toLowerCase();
  return code.includes('network-request-failed') || code.includes('unavailable') || code.includes('failed to fetch') || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

function getAuthToastType(err) {
  const code = String(err?.code || err?.message || '').toLowerCase();
  if (code.includes('popup-closed-by-user')) return 'info';
  if (code.includes('popup-blocked') || code.includes('disallowed')) return 'warning';
  return 'error';
}

function getFriendlyAuthError(err, mode = 'signin') {
  const code = String(err?.code || err?.message || '').toLowerCase();
  if (code.includes('invalid-email')) return 'Enter a valid email address.';
  if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('user-not-found')) return 'The email or password does not look right.';
  if (code.includes('weak-password')) return 'Choose a stronger password with at least 6 characters.';
  if (code.includes('email-already-in-use') || code.includes('account-exists-with-different-credential')) return 'An account already exists for that email. Try signing in instead.';
  if (code.includes('missing-password')) return 'Enter your password to continue.';
  if (code.includes('network-request-failed') || code.includes('unavailable') || code.includes('failed to fetch')) return 'LibriQ cannot reach account services right now.';
  if (code.includes('unauthorized-domain')) return 'This domain is not authorized for account sign-in yet.';
  if (code.includes('invalid-api-key')) return 'Account sign-in is not configured correctly for this build.';
  if (code.includes('configuration-not-found')) return 'Account setup is incomplete for this build.';
  if (code.includes('popup-blocked')) return 'Your browser blocked the sign-in popup.';
  if (code.includes('popup-closed-by-user')) return 'Sign-in was cancelled.';
  if (code.includes('disallowed-useragent')) return 'Google sign-in may not work inside this app browser. Open LibriQ in Chrome or Safari.';
  if (mode === 'signup') return 'Could not create the account right now.';
  return 'Could not sign in right now.';
}

Navigation.exportData = exportData;
Navigation.promptImportData = promptImportData;
Navigation.importDataFromFile = importDataFromFile;
Navigation.clearAllData = clearAllData;

function renderLibraryPage() {
  const main  = document.getElementById('mainContent');
  if (!main) {
    console.error('[LibriQ] Missing #mainContent while rendering library page.');
    return;
  }
  const books = Storage.getBooks();
  const state = _getLibraryState();
  const shelves = _getLibraryShelves(books);
  const counts = {
    all: books.length,
    reading: books.filter(b => b.status === LIBRIQ.STATUS.READING).length,
    wishlist: books.filter(b => b.status === LIBRIQ.STATUS.WISHLIST).length,
    finished: books.filter(b => b.status === LIBRIQ.STATUS.FINISHED).length,
    favorites: books.filter(b => b.isFavorite).length,
    needsMetadata: books.filter(b => _bookNeedsMetadata(b).length > 0).length,
  };

  main.innerHTML = `
    <div class="page" id="libraryPage">
      <div class="page-header library-header">
        <div class="library-heading">
          <span class="library-eyebrow">Personal collection</span>
          <h1 class="page-title">My Library</h1>
          <p class="page-subtitle">${books.length} book${books.length !== 1 ? 's' : ''} total</p>
        </div>
        <button class="btn btn-primary" onclick="Search.open()">
          <i class="ph ph-plus"></i> Add Book
        </button>
      </div>

      <div class="library-tools">
        <div class="library-search-wrap">
          <i class="ph ph-magnifying-glass library-search-icon"></i>
          <input
            type="search"
            id="librarySearchInput"
            class="library-search-input"
            placeholder="Search your library..."
            value="${Utils.sanitize(state.query)}"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="library-search-clear" id="clearLibrarySearch" aria-label="Clear search" ${state.query ? '' : 'hidden'}>
            <i class="ph ph-x"></i>
          </button>
        </div>

        <div class="library-sort-wrap">
          <label class="library-sort-label" for="librarySortSelect">Sort by</label>
          <select id="librarySortSelect" class="library-sort-select">
            <option value="recently-added" ${state.sort === 'recently-added' ? 'selected' : ''}>Recently added</option>
            <option value="title-az" ${state.sort === 'title-az' ? 'selected' : ''}>Title A–Z</option>
            <option value="author-az" ${state.sort === 'author-az' ? 'selected' : ''}>Author A–Z</option>
            <option value="highest-rated" ${state.sort === 'highest-rated' ? 'selected' : ''}>Highest rated</option>
            <option value="reading-progress" ${state.sort === 'reading-progress' ? 'selected' : ''}>Reading progress</option>
            <option value="recently-updated" ${state.sort === 'recently-updated' ? 'selected' : ''}>Recently updated</option>
          </select>
        </div>

        ${shelves.length ? `
        <div class="library-sort-wrap">
          <label class="library-sort-label" for="libraryShelfSelect">Shelf</label>
          <select id="libraryShelfSelect" class="library-sort-select">
            <option value="all" ${state.shelf === 'all' ? 'selected' : ''}>All shelves</option>
            ${shelves.map(shelf => `<option value="${Utils.sanitize(shelf)}" ${state.shelf === shelf ? 'selected' : ''}>${Utils.sanitize(shelf)}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>

      <div class="chip-group library-filters" id="libraryFilters">
        <button class="chip active" data-filter="all">All <span>${counts.all}</span></button>
        <button class="chip" data-filter="reading">Reading <span>${counts.reading}</span></button>
        <button class="chip" data-filter="wishlist">Want to Read <span>${counts.wishlist}</span></button>
        <button class="chip" data-filter="finished">Finished <span>${counts.finished}</span></button>
        <button class="chip" data-filter="favorites">Favorites <span>${counts.favorites}</span></button>
        <button class="chip" data-filter="needs-metadata">Needs Metadata <span>${counts.needsMetadata}</span></button>
      </div>

      <div class="books-grid" id="libraryGrid">
        ${books.length === 0
          ? buildLibraryEmpty()
          : ''
        }
      </div>
    </div>`;

  renderLibraryGrid(books);
  initLibraryFilters();
  initLibraryTools();
}

function _getLibraryState() {
  return {
    filter: sessionStorage.getItem('libriq_library_filter') || 'all',
    query: sessionStorage.getItem('libriq_library_query') || '',
    sort: sessionStorage.getItem('libriq_library_sort') || 'recently-added',
    shelf: sessionStorage.getItem('libriq_library_shelf') || 'all',
  };
}

function _setLibraryState(updates) {
  if ('filter' in updates) sessionStorage.setItem('libriq_library_filter', updates.filter);
  if ('query' in updates) sessionStorage.setItem('libriq_library_query', updates.query);
  if ('sort' in updates) sessionStorage.setItem('libriq_library_sort', updates.sort);
  if ('shelf' in updates) sessionStorage.setItem('libriq_library_shelf', updates.shelf);
}

function _getLibraryShelves(books) {
  return Array.from(new Set(
    (books || [])
      .flatMap(book => Array.isArray(book.tags) ? book.tags : [])
      .map(tag => String(tag || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b));
}

function renderLibraryGrid(books) {
  const grid = document.getElementById('libraryGrid');
  if (!grid) return;
  const state = _getLibraryState();

  const filtered = _filterAndSortLibraryBooks(books, state);

  if (filtered.length === 0) {
    grid.innerHTML = buildLibraryEmpty(state.filter, state.query);
    return;
  }

  grid.innerHTML = '';
  filtered.forEach(book => {
    grid.appendChild(Library.renderBookCard(book));
  });
}

function initLibraryFilters() {
  const filters = document.getElementById('libraryFilters');
  if (!filters) return;
  const books = Storage.getBooks();
  const state = _getLibraryState();

  filters.querySelectorAll('.chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === state.filter);
    btn.addEventListener('click', () => {
      filters.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      _setLibraryState({ filter: btn.dataset.filter });
      renderLibraryGrid(books);
    });
  });
}

function initLibraryTools() {
  const searchInput = document.getElementById('librarySearchInput');
  const sortSelect = document.getElementById('librarySortSelect');
  const shelfSelect = document.getElementById('libraryShelfSelect');
  const clearBtn = document.getElementById('clearLibrarySearch');
  const books = Storage.getBooks();
  const state = _getLibraryState();

  searchInput?.addEventListener('input', Utils.debounce((e) => {
    const query = e.target.value.trim();
    _setLibraryState({ query });
    if (clearBtn) clearBtn.hidden = !query;
    renderLibraryGrid(books);
  }, 150));

  sortSelect?.addEventListener('change', (e) => {
    _setLibraryState({ sort: e.target.value });
    renderLibraryGrid(books);
  });

  shelfSelect?.addEventListener('change', (e) => {
    _setLibraryState({ shelf: e.target.value });
    renderLibraryGrid(books);
  });

  clearBtn?.addEventListener('click', () => {
    _setLibraryState({ query: '' });
    if (searchInput) searchInput.value = '';
    clearBtn.hidden = true;
    renderLibraryGrid(books);
  });

  if (searchInput && state.query) searchInput.focus();
}

function clearLibrarySearch() {
  _setLibraryState({ query: '' });
  renderLibraryPage();
}

function _filterAndSortLibraryBooks(books, state) {
  const q = (state.query || '').toLowerCase();
  let filtered = books.slice();

  if (state.shelf && state.shelf !== 'all') {
    filtered = filtered.filter(book => Array.isArray(book.tags) && book.tags.includes(state.shelf));
  }

  if (state.filter === 'favorites') filtered = filtered.filter(b => b.isFavorite);
  else if (state.filter === 'needs-metadata') filtered = filtered.filter(b => _bookNeedsMetadata(b).length > 0);
  else if (state.filter !== 'all') filtered = filtered.filter(b => b.status === state.filter);

  if (q) {
    filtered = filtered.filter(book => {
      const haystack = [
        book.title,
        book.author,
        (book.genres || []).join(' '),
        book.description || '',
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  return _sortLibraryBooks(filtered, state.sort);
}

function _sortLibraryBooks(books, sort) {
  const list = books.slice();
  const byDate = (field) => (a, b) => new Date(b[field] || 0) - new Date(a[field] || 0);

  switch (sort) {
    case 'title-az':
      return list.sort((a, b) => a.title.localeCompare(b.title));
    case 'author-az':
      return list.sort((a, b) => a.author.localeCompare(b.author));
    case 'highest-rated':
      return list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
    case 'reading-progress':
      return list.sort((a, b) => Utils.readingProgress(b.currentPage, b.pageCount) - Utils.readingProgress(a.currentPage, a.pageCount));
    case 'recently-updated':
      return list.sort((a, b) => {
        const aTime = new Date(a.notesUpdatedAt || a.dateFinished || a.dateStarted || a.dateAdded || 0).getTime();
        const bTime = new Date(b.notesUpdatedAt || b.dateFinished || b.dateStarted || b.dateAdded || 0).getTime();
        return bTime - aTime;
      });
    case 'recently-added':
    default:
      return list.sort(byDate('dateAdded'));
  }
}

function buildLibraryEmpty(filter = 'all', query = '') {
  const messages = {
    all:       ['Your library is empty', 'Search for books to build your collection.'],
    reading:   ['Nothing in progress', 'Pick a book and start reading.'],
    wishlist:  ['Queue is clear', 'Add books you want to read next.'],
    finished:  ['No finished books yet', 'Keep reading — you\'re getting there.'],
    favorites: ['No favorites yet', 'Save the books you love most here.'],
    'needs-metadata': ['No metadata issues found', 'Your saved books already look complete.'],
  };
  const state = _getLibraryState();
  const selectedShelf = state.shelf && state.shelf !== 'all' ? state.shelf : '';
  const hasQuery = !!query;
  const [title, body] = hasQuery
    ? ['No books match your search.', 'Try a different keyword, add a book manually, or clear the search to see everything again.']
    : selectedShelf
      ? [`No books on "${selectedShelf}"`, 'Try another shelf or add this book to a shelf.']
      : (messages[filter] || messages.all);
  return `
    <div class="empty-state" style="grid-column: 1/-1;">
      <div class="empty-state-icon"><i class="ph ph-books"></i></div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-body">${body}</div>
      ${hasQuery ? `<button class="btn btn-secondary" onclick="Navigation.clearLibrarySearch()"><i class="ph ph-x"></i> Clear Search</button>` : `
        <button class="btn btn-primary" onclick="Search.open()">
          <i class="ph ph-magnifying-glass"></i> Search Books
        </button>
        <button class="btn btn-secondary" onclick="Search.openManualEntry()">
          <i class="ph ph-pencil"></i> Add Manually
        </button>
        <button class="btn btn-secondary" onclick="Navigation.promptImportData()">
          <i class="ph ph-upload-simple"></i> Import Backup
        </button>
      `}
    </div>`;
}

function renderStatusPage(status, title, iconClass) {
  const main  = document.getElementById('mainContent');
  if (!main) {
    console.error(`[LibriQ] Missing #mainContent while rendering ${title} page.`);
    return;
  }
  const books = Storage.getBooksByStatus(status);
  const summaries = {
    [LIBRIQ.STATUS.READING]: ['Reading queue', 'Books you are currently moving through.'],
    [LIBRIQ.STATUS.WISHLIST]: ['Wishlist', 'Books saved for later.'],
    [LIBRIQ.STATUS.FINISHED]: ['Finished shelf', 'Books you have completed.'],
  };
  const [eyebrow, subtitle] = summaries[status] || ['Reading list', 'Books on this shelf.'];
  const summaryLabel = `${books.length} book${books.length !== 1 ? 's' : ''}`;

  main.innerHTML = `
    <div class="page status-page" id="statusPage">
      <div class="page-header status-header">
        <div class="status-heading">
          <span class="library-eyebrow">${eyebrow}</span>
          <h1 class="page-title">${title}</h1>
          <p class="page-subtitle">${summaryLabel}${subtitle ? ` · ${subtitle}` : ''}</p>
        </div>
      </div>
      <div class="books-grid" id="statusGrid"></div>
    </div>`;

  const grid = document.getElementById('statusGrid');
  if (books.length === 0) {
    grid.innerHTML = buildLibraryEmpty(status);
  } else {
    books.forEach(b => grid.appendChild(Library.renderBookCard(b)));
  }
}

function renderFavoritesPage() {
  const main  = document.getElementById('mainContent');
  if (!main) {
    console.error('[LibriQ] Missing #mainContent while rendering favorites page.');
    return;
  }
  const books = Storage.getBooks().filter(b => b.isFavorite);

  main.innerHTML = `
    <div class="page status-page" id="statusPage">
      <div class="page-header status-header">
        <div class="status-heading">
          <span class="library-eyebrow">Favorite books</span>
          <h1 class="page-title">Favorites</h1>
          <p class="page-subtitle">${books.length} book${books.length !== 1 ? 's' : ''} saved with a heart</p>
        </div>
      </div>
      <div class="books-grid" id="favoritesGrid"></div>
    </div>`;

  const grid = document.getElementById('favoritesGrid');
  if (books.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon"><i class="ph ph-heart"></i></div>
        <div class="empty-state-title">No favorites yet</div>
        <div class="empty-state-body">Tap the heart on any book to save it here.</div>
      </div>`;
  } else {
    books.forEach(b => grid.appendChild(Library.renderBookCard(b)));
  }
}

  function renderStatsPage() {
    const main  = document.getElementById('mainContent');
    if (!main) {
      console.error('[LibriQ] Missing #mainContent while rendering statistics page.');
      return;
    }
    const stats = Storage.getStats();
    const goals = Storage.getGoals();
    const streak = Storage.getStreak();
    const recapYears = _getRecapYears();
    const selectedYear = _getRecapYear(recapYears);
    const recap = _buildYearlyRecap(selectedYear);
  const ratedBooks = Storage.getBooks()
    .filter(book => typeof book.rating === 'number' && book.rating > 0)
    .map((book, index) => ({ book, index }))
    .sort((a, b) => b.book.rating - a.book.rating || a.index - b.index)
    .map(entry => entry.book);

  main.innerHTML = `
    <div class="page stats-page" id="statsPage">
      <div class="page-header stats-header">
        <div class="stats-heading">
          <span class="library-eyebrow">Reading analytics</span>
          <h1 class="page-title">Statistics</h1>
          <p class="page-subtitle">Your reading at a glance</p>
        </div>
      </div>

      <div class="stats-row stagger" style="margin-bottom: var(--space-8);">
        <div class="stat-card">
          <div class="stat-card-icon amber"><i class="ph ph-books"></i></div>
          <div class="stat-card-value">${stats.total}</div>
          <div class="stat-card-label">Total books</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon green"><i class="ph ph-check-circle"></i></div>
          <div class="stat-card-value">${stats.finished}</div>
          <div class="stat-card-label">Books finished</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon blue"><i class="ph ph-file-text"></i></div>
          <div class="stat-card-value">${Utils.formatNumber(stats.totalPages)}</div>
          <div class="stat-card-label">Pages read</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon orange"><i class="ph ph-fire"></i></div>
          <div class="stat-card-value">${streak.longest}</div>
          <div class="stat-card-label">Longest streak</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon gold"><i class="ph ph-star"></i></div>
          <div class="stat-card-value">${stats.avgRating || '–'}</div>
          <div class="stat-card-label">Avg rating</div>
          <div class="stat-card-footnote">${stats.ratedCount ? `${stats.ratedCount} rated book${stats.ratedCount !== 1 ? 's' : ''}` : 'No rated books yet'}</div>
        </div>
      </div>

        <div class="goal-widget" style="margin-bottom: var(--space-8);">
        <div class="goal-header" style="gap: var(--space-3); align-items: center; justify-content: space-between; flex-wrap: wrap;">
          <div>
            <div class="goal-title">Yearly Recap</div>
            <div class="stats-section-meta">Private summary from your local library</div>
          </div>
          <label class="library-sort-label" for="recapYearSelect" style="margin: 0;">Year</label>
          <select id="recapYearSelect" class="library-sort-select" style="max-width: 140px;">
            ${recapYears.length ? recapYears.map(year => `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}</option>`).join('') : `<option value="${selectedYear}" selected>${selectedYear}</option>`}
          </select>
        </div>

        ${recap.missingFinishDates ? `
          <div class="empty-state stats-empty-state" style="margin-top: var(--space-4);">
            <div class="empty-state-icon"><i class="ph ph-hourglass-medium"></i></div>
            <div class="empty-state-title">${recap.missingFinishDates} finished book${recap.missingFinishDates !== 1 ? 's are' : ' is'} missing a finish date</div>
            <div class="empty-state-body">Statistics is using the best available local metadata so your finished books still appear here.</div>
          </div>
        ` : ''}

        ${recap.finishedCount === 0 ? `
          <div class="empty-state stats-empty-state" style="margin-top: var(--space-4);">
            <div class="empty-state-icon"><i class="ph ph-book-open"></i></div>
            <div class="empty-state-title">No finished books for this year yet.</div>
            <div class="empty-state-body">If your finished books are missing finish dates, Statistics will show a note above instead of counting them as empty.</div>
            <div style="display:flex; gap: var(--space-2); flex-wrap: wrap; justify-content: center;">
              <button class="btn btn-primary btn-sm" onclick="Search.open()">
                <i class="ph ph-magnifying-glass"></i> Search Books
              </button>
              <button class="btn btn-secondary btn-sm" onclick="Navigation.goTo('library')">
                <i class="ph ph-books"></i> Library
              </button>
            </div>
          </div>
        ` : `
          <div class="stats-row stagger" style="margin-top: var(--space-4);">
            <div class="stat-card">
              <div class="stat-card-icon amber"><i class="ph ph-check-circle"></i></div>
              <div class="stat-card-value">${recap.finishedCount}</div>
              <div class="stat-card-label">Books finished</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon blue"><i class="ph ph-file-text"></i></div>
              <div class="stat-card-value">${Utils.formatNumber(recap.pagesRead)}</div>
              <div class="stat-card-label">Pages read</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon gold"><i class="ph ph-star"></i></div>
              <div class="stat-card-value">${recap.avgRating || '–'}</div>
              <div class="stat-card-label">Average rating</div>
            </div>
            <div class="stat-card">
              <div class="stat-card-icon green"><i class="ph ph-calendar"></i></div>
              <div class="stat-card-value">${recap.activeMonthLabel}</div>
              <div class="stat-card-label">Most active month</div>
            </div>
          </div>

          <div class="stats-chart-grid" style="margin-top: var(--space-4);">
            <div class="goal-widget stats-chart-card">
              <div class="goal-header">
                <div class="goal-title">Most Read Genre / Shelf</div>
                <div class="stats-section-meta">Based on finished books this year</div>
              </div>
              ${recap.topBucket ? `
                <div class="activity-list" style="margin-top: var(--space-3);">
                  <div class="activity-item" style="cursor: default;">
                    <div class="activity-text">
                      <div class="activity-subtitle">${Utils.sanitize(recap.topBucket.type === 'shelf' ? 'Shelf' : 'Genre')}</div>
                      <div class="activity-title">${Utils.sanitize(recap.topBucket.name)}</div>
                    </div>
                    <div class="activity-time">${recap.topBucket.count} book${recap.topBucket.count !== 1 ? 's' : ''}</div>
                  </div>
                </div>
              ` : `
                <div class="empty-state stats-empty-state" style="margin-top: var(--space-3);">
                  <div class="empty-state-icon"><i class="ph ph-tag"></i></div>
                  <div class="empty-state-title">No genres or shelves yet</div>
                  <div class="empty-state-body">Add a few shelf labels or books with genres to see this summary.</div>
                </div>
              `}
            </div>

            <div class="goal-widget stats-chart-card">
              <div class="goal-header">
                <div class="goal-title">Longest Book Finished</div>
                <div class="stats-section-meta">By page count</div>
              </div>
              ${recap.longestBook ? `
                <div class="activity-list" style="margin-top: var(--space-3);">
                  <div class="activity-item" style="cursor: default;">
                    <div class="activity-text">
                      <div class="activity-title">${Utils.sanitize(recap.longestBook.title)}</div>
                      <div class="activity-subtitle">${Utils.sanitize(recap.longestBook.author)}</div>
                    </div>
                    <div class="activity-time">${Utils.formatNumber(recap.longestBook.pageCount || 0)} pages</div>
                  </div>
                </div>
              ` : `
                <div class="empty-state stats-empty-state" style="margin-top: var(--space-3);">
                  <div class="empty-state-icon"><i class="ph ph-book"></i></div>
                  <div class="empty-state-title">No page counts yet</div>
                  <div class="empty-state-body">Books without page counts are skipped here.</div>
                </div>
              `}
            </div>
          </div>

          <div class="goal-widget" style="margin-top: var(--space-4);">
            <div class="goal-header">
              <div class="goal-title">Highest Rated</div>
              <div class="stats-section-meta">${recap.highestRatedBooks.length ? `${recap.highestRatedBooks.length} book${recap.highestRatedBooks.length !== 1 ? 's' : ''}` : 'No rated books this year'}</div>
            </div>
            ${recap.highestRatedBooks.length ? `
              <div class="rated-book-list">
                ${recap.highestRatedBooks.map((book, index) => buildRatedBookRow(book, index + 1)).join('')}
              </div>
            ` : `
              <div class="empty-state stats-empty-state">
                <div class="empty-state-icon"><i class="ph ph-star"></i></div>
                <div class="empty-state-title">No ratings yet</div>
                <div class="empty-state-body">Rate books in Book Details to include them in the recap.</div>
              </div>
            `}
          </div>
        `}
      </div>

      <div class="dashboard-grid stats-layout">
        <div>
          <div class="stats-chart-grid">
            <div class="goal-widget stats-chart-card">
              <div class="goal-header">
                <div class="goal-title">Books per Month</div>
                <div class="stats-section-meta">Finished books by finish date</div>
              </div>
              ${buildMonthlyChart(stats.monthlyData)}
            </div>

            <div class="goal-widget stats-chart-card">
              <div class="goal-header">
                <div class="goal-title">Pages per Month</div>
                <div class="stats-section-meta">Finished-book pages only</div>
              </div>
              ${buildPagesChart(stats.pagesByMonth)}
            </div>
          </div>

          ${stats.topGenres.length ? `
            <div class="goal-widget">
              <div class="goal-header"><div class="goal-title">Genres</div></div>
              <div class="genre-list">
                ${stats.topGenres.map(([g, c]) => buildGenreRow(g, c, stats.total)).join('')}
              </div>
            </div>` : ''}
        </div>

        <div class="stats-side-stack">
          <div class="goal-widget" style="height: fit-content;">
            <div class="goal-header"><div class="goal-title">All-Time Summary</div></div>
            <div class="activity-list">
              ${[
                ['Total in library',   stats.total],
                ['Currently reading',  stats.reading],
                ['Finished',           stats.finished],
                ['Want to read',       stats.wishlist],
                ['Favorites',          stats.favorites],
                ['Average rating',     stats.avgRating ? `${stats.avgRating} ★` : '–'],
                ['Pages read',         stats.totalPages.toLocaleString()],
                ['Current streak',     `${streak.current} days`],
                ['Longest streak',     `${streak.longest} days`],
                ['This year\'s goal',  `${stats.finishedThisYear} / ${goals.yearly}`],
              ].map(([label, val]) => `
                <div class="activity-item" style="cursor:default;">
                  <div class="activity-text">
                    <div class="activity-subtitle">${label}</div>
                  </div>
                  <div class="activity-time" style="font-family: var(--font-mono); font-weight: 600; color: var(--text-primary);">
                    ${val}
                  </div>
                </div>`).join('')}
            </div>
          </div>

          <div class="goal-widget" style="height: fit-content;">
            <div class="goal-header">
              <div class="goal-title">Highest Rated</div>
              ${ratedBooks.length ? `<div class="stats-section-meta">${ratedBooks.length} rated book${ratedBooks.length !== 1 ? 's' : ''}</div>` : ''}
            </div>
            ${ratedBooks.length ? `
              <div class="rated-book-list">
                ${ratedBooks.map((book, index) => buildRatedBookRow(book, index + 1)).join('')}
              </div>` : `
              <div class="empty-state stats-empty-state">
                <div class="empty-state-icon"><i class="ph ph-star"></i></div>
                <div class="empty-state-title">No ratings yet</div>
                <div class="empty-state-body">Rate a few books in Book Details and they will appear here.</div>
              </div>`}
          </div>
        </div>
      </div>
    </div>`;
}

// ── Goals Page ────────────────────────────────

function renderGoalsPage() {
  const main  = document.getElementById('mainContent');
  if (!main) {
    console.error('[LibriQ] Missing #mainContent while rendering goals page.');
    return;
  }
  const goals = Storage.getGoals();
  const stats = Storage.getStats();

  main.innerHTML = `
    <div class="page goals-page" id="goalsPage" style="max-width: 600px;">
      <div class="page-header" style="margin-bottom: var(--space-6);">
        <h1 class="page-title">Reading Goals</h1>
        <p class="page-subtitle">Set your target for ${new Date().getFullYear()}</p>
      </div>

      <div class="goal-widget" style="margin-bottom: var(--space-6);">
        <form id="goalsForm" class="add-book-form">
          <div class="form-group">
            <label class="form-label" for="yearlyGoalInput">Books to read in ${new Date().getFullYear()}</label>
            <input type="number" id="yearlyGoalInput" name="yearly"
              class="form-input" value="${goals.yearly}" min="1" max="365" />
          </div>
          <div style="display:flex; gap: var(--space-3); margin-top: var(--space-2);">
            ${[6,12,24,52].map(n =>
              `<button type="button" class="btn btn-secondary btn-sm"
                onclick="document.getElementById('yearlyGoalInput').value=${n}">
                ${n} books
              </button>`
            ).join('')}
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top: var(--space-4);">
            <i class="ph ph-floppy-disk"></i> Save Goal
          </button>
        </form>
      </div>

      <div class="goal-widget">
        <div class="goal-header"><div class="goal-title">Progress</div></div>
        <div class="activity-list">
          ${[
            ['Goal',         goals.yearly + ' books'],
            ['Completed',    stats.finishedThisYear + ' books'],
            ['Remaining',    Math.max(0, goals.yearly - stats.finishedThisYear) + ' books'],
            ['On track',     stats.finishedThisYear >= Math.round(goals.yearly * (new Date().getMonth() + 1) / 12) ? '✅ Yes' : '⚠️ Behind'],
          ].map(([label, val]) => `
            <div class="activity-item" style="cursor:default;">
              <div class="activity-text"><div class="activity-subtitle">${label}</div></div>
              <div class="activity-time" style="color: var(--text-primary); font-weight: 600;">${val}</div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  document.getElementById('goalsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const yearly = parseInt(new FormData(e.target).get('yearly'), 10);
    if (!yearly || yearly < 1) return;
    Storage.saveGoals({ yearly, year: new Date().getFullYear() });
    Utils.toast(`Goal set: ${yearly} books in ${new Date().getFullYear()}`, 'success');
    renderGoalsPage();
  });

  document.getElementById('recapYearSelect')?.addEventListener('change', (e) => {
    _setRecapYear(e.target.value);
    renderStatsPage();
  });
}

function _getRecapYears() {
  const years = new Set();
  const currentYear = new Date().getFullYear();
  years.add(currentYear);

  Storage.getBooks().forEach(book => {
    const year = Number.parseInt(String(_getEffectiveFinishedDate(book) || '').slice(0, 4), 10);
    if (!Number.isNaN(year)) years.add(year);
  });

  return Array.from(years).sort((a, b) => b - a);
}

function _getRecapYear(years) {
  const storedYear = Number.parseInt(sessionStorage.getItem('libriq_stats_recap_year') || '', 10);
  if (Number.isInteger(storedYear) && Array.isArray(years) && years.includes(storedYear)) {
    return storedYear;
  }
  const currentYear = new Date().getFullYear();
  return (Array.isArray(years) && years.includes(currentYear)) ? currentYear : (years?.[0] || currentYear);
}

function _setRecapYear(year) {
  const selectedYear = Number.parseInt(String(year || ''), 10);
  if (Number.isInteger(selectedYear)) {
    sessionStorage.setItem('libriq_stats_recap_year', String(selectedYear));
  }
}

function _buildYearlyRecap(year) {
  const finishedEntries = Storage.getBooks()
    .map(book => ({ book, finishedDate: _getEffectiveFinishedDate(book) }))
    .filter(({ finishedDate }) => {
      const finishedYear = Number.parseInt(String(finishedDate || '').slice(0, 4), 10);
      return Number.isInteger(finishedYear) && finishedYear === year;
    });
  const books = finishedEntries.map(entry => entry.book);
  const finishedCount = books.length;
  const missingFinishDates = books.filter(book => !book.dateFinished && !book.completedAt && !book.finishedAt).length;
  const pagesRead = books.reduce((sum, book) => sum + (Number(book.pageCount) > 0 ? Number(book.pageCount) : 0), 0);
  const ratedBooks = books.filter(book => typeof book.rating === 'number' && book.rating > 0);
  const avgRating = ratedBooks.length
    ? (ratedBooks.reduce((sum, book) => sum + book.rating, 0) / ratedBooks.length).toFixed(1)
    : null;

  const monthCounts = Array(12).fill(0);
  const monthLabels = LIBRIQ.MONTHS;
  finishedEntries.forEach(({ finishedDate }) => {
    const month = new Date(finishedDate).getMonth();
    if (!Number.isNaN(month)) monthCounts[month]++;
  });
  const activeMonthIndex = monthCounts.indexOf(Math.max(...monthCounts));
  const activeMonthLabel = activeMonthIndex >= 0 ? monthLabels[activeMonthIndex] : '–';

  const longestBook = books
    .filter(book => Number(book.pageCount) > 0)
    .slice()
    .sort((a, b) => (Number(b.pageCount) || 0) - (Number(a.pageCount) || 0))[0] || null;

  const highestRatedBooks = ratedBooks
    .slice()
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || new Date(_getEffectiveFinishedDate(b) || 0) - new Date(_getEffectiveFinishedDate(a) || 0))
    .filter(book => book.rating === (ratedBooks[0]?.rating || null))
    .slice(0, 5);

  const genreCounts = new Map();
  const shelfCounts = new Map();
  books.forEach(book => {
    (Array.isArray(book.genres) ? book.genres : []).forEach(genre => {
      const clean = String(genre || '').trim();
      if (!clean) return;
      genreCounts.set(clean, (genreCounts.get(clean) || 0) + 1);
    });
    (Array.isArray(book.tags) ? book.tags : []).forEach(tag => {
      const clean = String(tag || '').trim();
      if (!clean) return;
      shelfCounts.set(clean, (shelfCounts.get(clean) || 0) + 1);
    });
  });

  const topGenre = _topCountEntry(genreCounts);
  const topShelf = _topCountEntry(shelfCounts);
  let topBucket = null;
  if (topGenre && topShelf) {
    topBucket = topShelf.count >= topGenre.count
      ? { ...topShelf, type: 'shelf' }
      : { ...topGenre, type: 'genre' };
  } else if (topShelf) {
    topBucket = { ...topShelf, type: 'shelf' };
  } else if (topGenre) {
    topBucket = { ...topGenre, type: 'genre' };
  }

  return {
    finishedCount,
    pagesRead,
    avgRating,
    activeMonthLabel,
    longestBook,
    highestRatedBooks,
    topBucket,
    missingFinishDates,
  };
}

function _getEffectiveFinishedDate(book) {
  if (!book || book.status !== LIBRIQ.STATUS.FINISHED) return null;
  const candidates = [
    book.dateFinished,
    book.completedAt,
    book.finishedAt,
    book.updatedAt,
    book.createdAt,
    book.dateAdded,
  ];
  for (const value of candidates) {
    const time = new Date(value || 0).getTime();
    if (Number.isFinite(time) && time > 0) return new Date(time).toISOString();
  }
  return null;
}

function _topCountEntry(map) {
  const entries = Array.from(map.entries());
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [name, count] = entries[0];
  return { name, count };
}

function getDisplayNameForAccount(user) {
  const profileName = String(Storage.getProfile()?.name || '').trim();
  if (profileName && profileName.toLowerCase() !== 'reader') return profileName;

  const displayName = Utils.formatDisplayName(user?.displayName);
  if (displayName) return displayName;

  return Utils.formatEmailPrefixName(user?.email) || 'Reader';
}

// ── Help Page ────────────────────────────────

function renderHelpPage() {
  const main = document.getElementById('mainContent');
  if (!main) {
    console.error('[LibriQ] Missing #mainContent while rendering help page.');
    return;
  }
  const syncReadiness = Storage.getSyncReadiness?.() || { syncReady: false };

  const guideSections = [
    {
      icon: 'ph-seal-check',
      title: 'Getting Started',
      body: 'Start by searching for a book, then add it to your library. From there you can mark reading status, track progress, rate it, and come back to it anytime.',
    },
    {
      icon: 'ph-magnifying-glass',
      title: 'Searching for Books',
      body: 'Use the search bar or press Cmd/Ctrl + K. LibriQ checks Open Library and Google Books, then merges the best match into one result list.',
    },
    {
      icon: 'ph-pencil-simple',
      title: 'Adding Books Manually',
      body: 'If a title is missing from the search results, choose Manual Entry and fill in the details yourself. Manual books work like any other saved book.',
    },
    {
      icon: 'ph-books',
      title: 'Managing the Library',
      body: 'Use My Library to filter by status or favorites, sort the shelf, open book details, and keep your collection organized as it grows.',
    },
    {
      icon: 'ph-chart-line-up',
      title: 'Tracking Reading Progress',
      body: 'Open Book Details to update your current page. LibriQ turns that into progress so you can see how far along you are in each book.',
    },
    {
      icon: 'ph-notebook',
      title: 'Using Private Notes',
      body: 'Private Notes are saved only in your browser. They are perfect for thoughts, quotes, reflections, and reading journal entries you want to keep to yourself.',
    },
    {
      icon: 'ph-arrow-down',
      title: 'Importing and Exporting Backups',
      body: 'Use Settings to export a JSON backup or import one later. This helps protect your local library if you switch browsers or want a safety copy.',
    },
    {
      icon: 'ph-hard-drives',
      title: 'Understanding storage and backups',
      body: 'LibriQ is designed around account-backed reading data. When account services are unavailable, an offline fallback may appear so you can keep using the app on this device.',
    },
    {
      icon: 'ph-arrows-clockwise',
      title: 'Sync Foundation',
      body: 'Account Sync keeps books updated across signed-in devices. Cloud backup, restore, merge, and JSON export/import remain separate safety tools.',
    },
    {
      icon: 'ph-arrows-left-right',
      title: 'Manual Cloud Merge',
      body: 'Merge is safer when you have books on both this device and your cloud backup. LibriQ adds cloud-only items and keeps this device\'s version when something looks different.',
    },
  ];

  const faqItems = [
    ['Why did my books disappear?', 'They may be stored in a different browser or device. Local-first storage stays with the browser profile that saved it.'],
    ['Can I use LibriQ offline?', 'If account services are unavailable, LibriQ may show an offline fallback so you can keep reading on this device.'],
    ['Will notes sync across devices?', 'Private notes stay on the saved library data path and should be treated as account-backed data when synced or backed up.'],
    ['What if search returns no results?', 'Try a different title spelling, search by author, or use Manual Entry to add the book by hand.'],
  ];

  main.innerHTML = `
    <div class="page" id="helpPage">
      <div class="page-header help-header">
        <div class="help-heading">
          <span class="library-eyebrow">Beginner guide</span>
          <h1 class="page-title">Help & Guide Center</h1>
          <p class="page-subtitle">A calm walkthrough for using LibriQ with confidence.</p>
        </div>
      </div>

      <div class="help-intro-card">
        <div class="help-intro-icon"><i class="ph ph-book-open-text"></i></div>
        <div class="help-intro-copy">
          <h2 class="help-intro-title">A calm place to learn the app</h2>
          <p class="text-secondary" style="line-height: var(--leading-loose); margin: 0;">
            LibriQ stays simple and local-first. This guide covers the core features, backups, and account behavior so you can build your reading space without needing a long tutorial.
          </p>
        </div>
      </div>

      <div class="help-grid stagger">
        ${guideSections.map(section => `
          <article class="help-card">
            <div class="help-card-icon"><i class="ph ${section.icon}"></i></div>
            <h3 class="help-card-title">${section.title}</h3>
            <p class="help-card-body">${section.body}</p>
          </article>
        `).join('')}
      </div>

      <div class="help-grid help-grid-wide">
        <section class="goal-widget help-faq-card">
          <div class="goal-header">
            <div class="goal-title">FAQ / Troubleshooting</div>
          </div>
          <div class="help-faq-list">
            ${faqItems.map(([question, answer]) => `
              <div class="help-faq-item">
                <div class="help-faq-question">${question}</div>
                <div class="help-faq-answer">${answer}</div>
              </div>
            `).join('')}
          </div>
        </section>

        <section class="goal-widget help-faq-card">
          <div class="goal-header">
            <div class="goal-title">Sync readiness</div>
          </div>
          <div class="help-faq-list">
            ${[
              ['Restore behavior', 'Restore replaces this device\'s library after confirmation.'],
              ['Merge behavior', 'Merge adds safe cloud-only items without replacing local conflicts.'],
              ['Account sync', 'Books sync automatically in signed-in account mode.'],
              ['Has device ID', syncReadiness.hasDeviceId ? 'Yes' : 'No'],
              ['UpdatedAt coverage', syncReadiness.hasUpdatedAtCoverage ? 'Good coverage' : 'Partial coverage'],
              ['DeletedAt support', syncReadiness.hasDeletedAtSupport ? 'Supported' : 'Not yet consistent'],
              ['Backup metadata', syncReadiness.hasBackupMetadata ? 'Present' : 'Missing'],
              ['Sync ready', syncReadiness.syncReady ? 'Yes' : 'No, foundation only'],
            ].map(([question, answer]) => `
              <div class="help-faq-item">
                <div class="help-faq-question">${question}</div>
                <div class="help-faq-answer">${answer}</div>
              </div>
            `).join('')}
          </div>
        </section>

        <section class="goal-widget help-next-step-card">
          <div class="goal-header">
            <div class="goal-title">A quick first step</div>
          </div>
          <div class="help-next-step">
            <p class="help-next-step-text">
              Search for your first book, add it to the library, and open the details panel to try progress tracking and private notes.
            </p>
            <div class="help-next-step-actions">
              <button class="btn btn-primary" onclick="Search.open()">
                <i class="ph ph-magnifying-glass"></i> Search Books
              </button>
              <button class="btn btn-secondary" onclick="Navigation.goTo('library')">
                <i class="ph ph-books"></i> Open Library
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>`;
}

// ── Recommendations Page ──────────────────────

function renderRecommendationsPage() {
  const main = document.getElementById('mainContent');
  if (!main) {
    console.error('[LibriQ] Missing #mainContent while rendering recommendations page.');
    return;
  }
  const books = Storage.getBooks();
  const recState = _buildRecommendationState(books);

  const aiState = _getGeminiRecommendationsUiState();
  const aiSection = aiState.visible ? `
      <section class="recommendations-ai-panel" id="geminiRecommendationsPanel">
        <div class="recommendations-ai-header">
          <div>
            <div class="recommendations-ai-kicker">AI recommendations</div>
            <div class="recommendations-ai-title">Generate a focused reading nudge from your saved library.</div>
            <div class="recommendations-ai-copy">Uses your reading history to suggest books. Notes, quotes, and reviews are not sent.</div>
          </div>
          ${aiState.comingSoon ? '' : `
            <button class="btn btn-primary" id="geminiRecommendationsBtn" type="button" ${aiState.disabled ? 'disabled' : ''}>
              <i class="ph ph-sparkle"></i>
              Generate AI Recommendations
            </button>
          `}
        </div>
        <div class="recommendations-ai-state" id="geminiRecommendationsState">${Utils.sanitize(aiState.message)}</div>
        <div class="recommendations-ai-results" id="geminiRecommendationsResults" hidden></div>
      </section>
    ` : '';

  main.innerHTML = `
    <div class="page recommendations-page" id="recommendationsPage">
      <div class="page-header recommendations-header">
        <div class="recommendations-heading recommendations-hero-heading">
          <span class="library-eyebrow">Library-based suggestions</span>
          <h1 class="page-title">Recommendations</h1>
          <p class="page-subtitle">Suggestions built from the books you’ve already saved in LibriQ.</p>
        </div>
      </div>

      <section class="recommendations-intro recommendations-hero">
        <div class="recommendations-intro-copy">
          <div class="recommendations-intro-kicker">From your library</div>
          <div class="recommendations-intro-title">Built from your saved books, favorite authors, and reading shelves.</div>
          <div class="recommendations-intro-body">Suggestions are grounded in your saved books, favorites, ratings, and reading shelves so they reflect what you already read, rate, and keep close.</div>
          <div class="recommendations-intro-meta">
            <span class="badge badge-accent">Library-based</span>
            <span class="recommendations-intro-meta-text">Built from favorites, ratings, authors, and Want to Read shelves</span>
          </div>
        </div>
      </section>

      ${recState.hasSignal ? `
        <div class="recommendations-groups recommendations-sections stagger">
          ${recState.groups.map(group => buildRecommendationGroup(group)).join('')}
        </div>
        <div class="recommendations-helper-note">Add more favorites, finished books, and Want to Read titles to improve your library-based suggestions.</div>
      ` : `
        <div class="empty-state recommendations-empty-state recommendations-empty">
          <div class="empty-state-icon"><i class="ph ph-sparkle"></i></div>
          <div class="empty-state-title">Save a few more books to improve your library-based suggestions.</div>
          <div class="empty-state-body">Recommendations are built from your saved books, favorites, ratings, and Want to Read titles.</div>
          <div class="recommendations-empty-actions">
            <button class="btn btn-primary" onclick="Search.open()">
              <i class="ph ph-magnifying-glass"></i> Search Books
            </button>
            <button class="btn btn-secondary" onclick="Navigation.goTo('library')">
              <i class="ph ph-books"></i> Open Library
            </button>
          </div>
          <div class="recommendations-empty-hint">Add books, favorite a few, finish a few, or move books to Want to Read.</div>
        </div>
      `}
      ${aiSection}
      <div id="subjectDiscoveryRoot" class="recommendations-subject-discovery"></div>
      <div id="gutenbergDiscoveryRoot" class="recommendations-subject-discovery"></div>
    </div>`;

  _wireGeminiRecommendations();
  _hydrateSubjectDiscovery(books);
  _hydrateGutendexDiscovery(books);
}

function _getGeminiRecommendationsUiState() {
  const firebase = window.LibriqFirebase?.getState?.() || { available: false, ready: false, user: null };
  const online = navigator.onLine !== false;
  const offlineMode = Navigation.getSessionPreference?.() === 'offline' || Navigation.getCurrentSessionMode?.() === 'offline';
  const aiEnabled = Boolean(window.LibriqConfig?.enableAiRecommendations);
  if (!aiEnabled) {
    return {
      visible: true,
      disabled: true,
      activeSession: false,
      message: 'AI recommendations are being tuned and will be available soon.',
      comingSoon: true,
    };
  }
  if (!firebase.ready) {
    return {
      visible: true,
      disabled: true,
      activeSession: false,
      message: 'Preparing AI recommendations...',
    };
  }
  const activeSession = Boolean(firebase.user && online && !offlineMode);
  if (!firebase.user) {
    return { visible: true, disabled: true, activeSession: false, message: 'AI recommendations are being tuned and will be available soon.', comingSoon: true };
  }
  if (!online || offlineMode) {
    return {
      visible: true,
      disabled: true,
      activeSession: false,
      message: "You're offline right now. Local recommendations are still available.",
    };
  }
  return {
    visible: true,
    disabled: !activeSession,
    activeSession,
    message: 'Uses your reading history to suggest books. Notes, quotes, and reviews are not sent.',
  };
}

function _wireGeminiRecommendations() {
  const btn = document.getElementById('geminiRecommendationsBtn');
  const results = document.getElementById('geminiRecommendationsResults');
  const stateNode = document.getElementById('geminiRecommendationsState');
  if (!btn || !results || !stateNode) return;

  const books = Storage.getBooks();
  const initialState = _getGeminiRecommendationsUiState();
  if (initialState.comingSoon) {
    stateNode.textContent = initialState.message;
    btn.disabled = true;
    results.hidden = true;
    results.innerHTML = '';
    return;
  }
  btn.onclick = async () => {
    const state = _getGeminiRecommendationsUiState();
    if (!state.activeSession) {
      if (!navigator.onLine || Navigation.getSessionPreference?.() === 'offline' || Navigation.getCurrentSessionMode?.() === 'offline') {
        stateNode.textContent = "You're offline right now. Local recommendations are still available.";
      } else {
        stateNode.textContent = 'Please sign in again to use AI recommendations.';
      }
      btn.disabled = true;
      return;
    }

    btn.disabled = true;
    results.hidden = false;
    results.innerHTML = `
      <div class="recommendations-ai-loading">
        <span class="spinner spinner--inline" aria-hidden="true"></span>
        <span>Generating AI recommendations...</span>
      </div>`;
    stateNode.textContent = 'Working from your recent reading signals...';

    try {
      const response = await GeminiRecommendationsAPI.generateRecommendations({
        mode: _getGeminiRecommendationsMode(),
        books,
      });
      _renderGeminiRecommendations(results, response);
      stateNode.textContent = response.meta.fromCache
        ? 'Showing saved AI recommendations from today.'
        : 'Generated just now.';
    } catch (err) {
      const code = String(err?.code || '').toLowerCase();
      const status = Number(err?.status || 0);
      if (code === 'offline') {
        console.debug('[Libriq/Gemini] Skipped while offline.');
        stateNode.textContent = 'Connect to the internet to generate AI recommendations.';
      } else if (code === 'auth-loading') {
        console.debug('[Libriq/Gemini] Waiting for Firebase auth readiness.');
        stateNode.textContent = 'Preparing AI recommendations...';
      } else if (code === 'auth' || code === 'auth-expired' || status === 401) {
        console.debug('[Libriq/Gemini] Missing or expired Firebase session.', { code, status });
        stateNode.textContent = 'Please sign in again to use AI recommendations.';
      } else if (code === 'gemini_bad_request' || (status === 400 && code !== 'gemini_provider_quota_exhausted')) {
        console.debug('[Libriq/Gemini] Gemini bad request.', { code, status });
        stateNode.textContent = 'AI recommendations need a quick setup fix. Your local recommendations are still available.';
      } else if (code === 'gemini_response_invalid' || (status === 502 && code !== 'gemini_provider_quota_exhausted')) {
        console.debug('[Libriq/Gemini] Gemini response invalid.', { code, status });
        stateNode.textContent = 'AI gave an unexpected response. Your local recommendations are still available.';
      } else if (status === 429) {
        if (code === 'gemini_provider_quota_exhausted') {
          console.debug('[Libriq/Gemini] Gemini provider quota exhausted.');
          stateNode.textContent = 'AI is temporarily busy or over its provider limit. Try again later. Your local recommendations are still available.';
        } else {
          console.debug('[Libriq/Gemini] Gemini quota exhausted.');
          stateNode.textContent = "You've used today's AI recommendations. Try again tomorrow.";
        }
      } else if (status === 503) {
        console.debug('[Libriq/Gemini] Gemini backend unavailable.');
        stateNode.textContent = 'AI recommendations could not load right now. Your local recommendations are still available.';
      } else {
        console.debug('[Libriq/Gemini] Gemini request failed.', { code, status });
        stateNode.textContent = 'AI recommendations could not load right now. Your local recommendations are still available.';
      }
      results.hidden = true;
      results.innerHTML = '';
    } finally {
      const nextState = _getGeminiRecommendationsUiState();
      btn.disabled = nextState.disabled;
    }
  };
}

function _getGeminiRecommendationsMode() {
  return 'recommendations';
}

function _renderGeminiRecommendations(container, response) {
  const recs = Array.isArray(response?.recommendations) ? response.recommendations.slice(0, 8) : [];
  if (!recs.length) {
    container.innerHTML = `
      <div class="recommendations-ai-empty">
        AI recommendations could not load right now. Your local recommendations are still available.
      </div>`;
    return;
  }
  container.innerHTML = `
    <div class="recommendations-ai-results-header">
      <div class="recommendations-ai-results-title">AI suggestions</div>
      <div class="recommendations-ai-results-meta">${response.meta.fromCache ? 'Showing saved AI recommendations from today.' : 'Generated just now.'}</div>
    </div>
    <div class="recommendation-card-grid recommendations-item-grid recommendations-ai-grid">
      ${recs.map((rec) => buildGeminiRecommendationCard(rec)).join('')}
    </div>`;
}

function buildGeminiRecommendationCard(rec) {
  return `
    <article class="recommendation-card recommendation-card--ai">
      <div class="recommendation-card-body">
        <div class="recommendation-card-meta">
          <span class="badge badge-accent">AI</span>
          ${rec.confidence !== undefined ? `<span class="badge badge-metadata">Confidence ${Math.round(rec.confidence * 100)}%</span>` : ''}
          ${rec.sourceHint ? `<span class="badge badge-metadata">${Utils.sanitize(rec.sourceHint)}</span>` : ''}
        </div>
        <h3 class="recommendation-card-title">${Utils.sanitize(rec.title)}</h3>
        <div class="recommendation-card-author">${Utils.sanitize(rec.author)}</div>
        <p class="recommendation-card-description">${Utils.sanitize(rec.reason)}</p>
      </div>
    </article>`;
}

async function _hydrateSubjectDiscovery(books) {
  const root = document.getElementById('subjectDiscoveryRoot');
  if (!root) return;
  if (!navigator.onLine || typeof OpenLibraryAPI === 'undefined' || !OpenLibraryAPI?.searchBySubject) {
    root.innerHTML = '';
    return;
  }

  const discoveryState = _buildSubjectDiscoveryState(books);
  if (!discoveryState.rails.length) {
    root.innerHTML = '';
    return;
  }

  root.innerHTML = `
    <div class="recommendations-groups recommendations-sections stagger">
      ${discoveryState.rails.map(rail => buildSubjectDiscoveryRail(rail)).join('')}
    </div>`;

  const railNodes = Array.from(root.querySelectorAll('[data-subject-key]'));
  await Promise.all(railNodes.map(async (node) => {
    const subjectKey = node.dataset.subjectKey;
    const limit = Number(node.dataset.limit || 6);
    const booksForRail = await OpenLibraryAPI.searchBySubject(subjectKey, { limit });
    const filtered = _filterSubjectDiscoveryBooks(booksForRail, books, limit);
    if (!filtered.length) {
      node.innerHTML = `<div class="recommendations-helper-note">This subject is unavailable right now.</div>`;
      return;
    }
    node.querySelector('.recommendation-card-grid').innerHTML = filtered.map(book => buildRecommendationCard(book, 'Open Library subject')).join('');
  }));
}

function _buildSubjectDiscoveryState(books) {
  const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
  const subjectCounts = new Map();
  const pickSubject = (value) => String(value || '').trim().toLowerCase();

  safeBooks.forEach((book) => {
    const weight = (book.isFavorite ? 4 : 1) + (typeof book.rating === 'number' ? book.rating : 0) + (book.status === LIBRIQ.STATUS.FINISHED ? 2 : 0);
    const subjects = _subjectCandidatesFromBook(book);
    subjects.forEach((subject) => {
      const key = pickSubject(subject);
      if (!key) return;
      subjectCounts.set(key, (subjectCounts.get(key) || 0) + weight);
    });
  });

  const fallback = ['fiction', 'fantasy', 'romance', 'mystery', 'science fiction', 'classics', 'history', 'self improvement'];
  const ranked = [...subjectCounts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
  const selected = ranked.length ? ranked.slice(0, 3) : fallback.slice(0, 3);

  const labelMap = {
    'science fiction': 'Science Fiction',
    'self improvement': 'Self Improvement',
  };

  return {
    rails: selected.map((subjectKey) => ({
      label: labelMap[subjectKey] || Utils.formatDisplayName(subjectKey),
      subjectKey,
      limit: 6,
    })),
  };
}

function _subjectCandidatesFromBook(book) {
  const values = [];
  if (Array.isArray(book?.subjects)) values.push(...book.subjects);
  if (Array.isArray(book?.genres)) values.push(...book.genres);
  if (book?.isFavorite || book?.status === LIBRIQ.STATUS.FINISHED || book?.status === LIBRIQ.STATUS.READING) {
    values.push(...(Array.isArray(book?.genres) ? book.genres : []));
  }
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
}

function _filterSubjectDiscoveryBooks(books, savedBooks, limit = 6) {
  const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
  const saved = Array.isArray(savedBooks) ? savedBooks.filter(Boolean) : [];
  const filtered = [];
  for (const book of safeBooks) {
    if (saved.some(savedBook => BookIdentity?.isSameBook ? BookIdentity.isSameBook(savedBook, book) : _normalizeText(savedBook.title) === _normalizeText(book.title))) continue;
    if (filtered.some(existing => BookIdentity?.isSameBook ? BookIdentity.isSameBook(existing, book) : _normalizeText(existing.title) === _normalizeText(book.title))) continue;
    filtered.push(book);
    if (filtered.length >= limit) break;
  }
  return filtered;
}

function buildSubjectDiscoveryRail(rail) {
  return `
    <section class="goal-widget recommendations-section" data-subject-key="${Utils.sanitize(rail.subjectKey)}" data-limit="${rail.limit}">
      <div class="goal-header recommendations-section-header">
        <div class="recommendation-group-heading">
          <div class="goal-title">Explore ${Utils.sanitize(rail.label)}</div>
          <div class="stats-section-meta">Powered by Open Library subjects</div>
        </div>
      </div>
      <div class="recommendation-card-grid recommendations-item-grid">
        <div class="recommendations-helper-note recommendations-subject-loading">
          <span class="spinner spinner--inline" aria-hidden="true"></span>
          <span>Loading subject picks from Open Library…</span>
        </div>
      </div>
    </section>`;
}

async function _hydrateGutendexDiscovery(books) {
  const root = document.getElementById('gutenbergDiscoveryRoot');
  if (!root) return;
  if (!navigator.onLine || typeof GutendexAPI === 'undefined' || !GutendexAPI?.searchCuratedClassics) {
    root.innerHTML = '';
    return;
  }

  const rail = _buildGutendexDiscoveryState(books);
  if (!rail) {
    root.innerHTML = '';
    return;
  }

  root.innerHTML = buildGutendexDiscoveryRail(rail);

  const cardsNode = root.querySelector('[data-gutendex-rail]');
  if (!cardsNode) return;

  const booksForRail = await GutendexAPI.searchCuratedClassics({ limit: rail.limit, topic: rail.topic });
  const filtered = _filterDiscoveryBooks(booksForRail, books, rail.limit);
  if (!filtered.length) {
    cardsNode.innerHTML = `<div class="recommendations-helper-note">Free classics are unavailable right now.</div>`;
    return;
  }
  cardsNode.querySelector('.recommendation-card-grid').innerHTML = filtered.map(book => buildRecommendationCard(book, 'Project Gutenberg')).join('');
}

function _buildGutendexDiscoveryState(books) {
  const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
  const hasSignal = safeBooks.length > 0;
  return {
    label: 'Free Classics',
    topic: 'classics',
    limit: 6,
    hasSignal,
  };
}

function _filterDiscoveryBooks(books, savedBooks, limit = 6) {
  const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
  const saved = Array.isArray(savedBooks) ? savedBooks.filter(Boolean) : [];
  const filtered = [];
  for (const book of safeBooks) {
    if (saved.some(savedBook => BookIdentity?.isSameBook ? BookIdentity.isSameBook(savedBook, book) : _normalizeText(savedBook.title) === _normalizeText(book.title))) continue;
    if (filtered.some(existing => BookIdentity?.isSameBook ? BookIdentity.isSameBook(existing, book) : _normalizeText(existing.title) === _normalizeText(book.title))) continue;
    filtered.push(book);
    if (filtered.length >= limit) break;
  }
  return filtered;
}

function buildGutendexDiscoveryRail(rail) {
  return `
    <section class="goal-widget recommendations-section" data-gutendex-rail="true" data-limit="${rail.limit}" data-topic="${Utils.sanitize(rail.topic)}">
      <div class="goal-header recommendations-section-header">
        <div class="recommendation-group-heading">
          <div class="goal-title">Free Classics</div>
          <div class="stats-section-meta">Public-domain picks through Project Gutenberg metadata</div>
        </div>
      </div>
      <div class="recommendation-card-grid recommendations-item-grid">
        <div class="recommendations-helper-note recommendations-subject-loading">
          <span class="spinner spinner--inline" aria-hidden="true"></span>
          <span>Loading free classics…</span>
        </div>
      </div>
    </section>`;
}

function _buildRecommendationState(books) {
  const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
  if (safeBooks.length === 0) return { hasSignal: false, groups: [] };

  const ratedBooks = safeBooks.filter(book => typeof book.rating === 'number' && book.rating > 0);
  const highRatedBooks = ratedBooks.filter(book => book.rating >= 4);
  const favoriteBooks = safeBooks.filter(book => book.isFavorite);
  const readingBooks = safeBooks.filter(book => book.status === LIBRIQ.STATUS.READING);
  const wishlistBooks = safeBooks.filter(book => book.status === LIBRIQ.STATUS.WISHLIST);
  const finishedBooks = safeBooks.filter(book => book.status === LIBRIQ.STATUS.FINISHED);

  const genreScores = new Map();
  const authorScores = new Map();

  safeBooks.forEach(book => {
    const genreWeight = _recommendationWeight(book);
    _bookGenres(book).forEach(genre => {
      genreScores.set(genre, (genreScores.get(genre) || 0) + genreWeight);
    });

    const author = _cleanBookAuthor(book.author);
    if (author && _isRecognizedAuthor(book)) {
      authorScores.set(author, (authorScores.get(author) || 0) + _recommendationWeight(book, 1));
    }
  });

  const topGenre = [...genreScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const topAuthor = [...authorScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const moodGenre = _mostCommonGenre(readingBooks);

  const groups = [];

  if (topGenre) {
    const booksForGenre = safeBooks
      .filter(book => _bookGenres(book).some(g => _normalizeText(g) === _normalizeText(topGenre)))
      .filter(book => book.status !== LIBRIQ.STATUS.FINISHED)
      .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
      .slice(0, 4);
    if (booksForGenre.length) {
      groups.push({ title: 'Because you like this genre', label: topGenre, books: booksForGenre });
    }
  }

  if (topAuthor) {
    const booksByAuthor = safeBooks
      .filter(book => _cleanBookAuthor(book.author) === topAuthor)
      .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
      .slice(0, 4);
    if (booksByAuthor.length) {
      groups.push({ title: 'Books from authors you’ve saved', label: 'Based on authors already in your library', books: booksByAuthor });
    }
  }

  if (highRatedBooks.length) {
    groups.push({
      title: 'Highly rated in your library',
      label: 'Saved books with strong ratings',
      books: [...highRatedBooks]
        .sort((a, b) => (b.rating || 0) - (a.rating || 0) || _dateValue(b.dateAdded) - _dateValue(a.dateAdded))
        .slice(0, 4),
    });
  }

  if (moodGenre) {
    const moodBooks = safeBooks
      .filter(book => book.status !== LIBRIQ.STATUS.FINISHED)
      .filter(book => _bookGenres(book).some(g => _normalizeText(g) === _normalizeText(moodGenre)))
      .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
      .slice(0, 4);
    if (moodBooks.length) {
      groups.push({ title: 'Continue your reading mood', label: moodGenre, books: moodBooks });
    }
  }

  if (wishlistBooks.length) {
    groups.push({
      title: 'From your Want to Read shelf',
      label: 'Saved for later',
      showCardReason: false,
      books: [...wishlistBooks]
        .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
        .slice(0, 4),
    });
  }

  if (!groups.length && safeBooks.length >= 3) {
    const fallback = [...safeBooks]
      .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
      .slice(0, 4);
    if (fallback.length) {
      groups.push({
        title: 'Suggested from your library',
        label: 'Recently added and lightly scored',
        books: fallback,
      });
    }
  }

  return {
    hasSignal: groups.length > 0,
    groups,
  };
}

function buildRecommendationGroup(group) {
  const cards = group.books.map(book => buildRecommendationCard(book, group.showCardReason === false ? '' : group.label)).join('');
  const groupClass = group.books.length === 1 ? 'recommendation-group recommendation-group-single' : 'recommendation-group';
  return `
    <section class="goal-widget ${groupClass} recommendations-section">
      <div class="goal-header recommendations-section-header">
        <div class="recommendation-group-heading">
          <div class="goal-title">${Utils.sanitize(group.title)}</div>
          <div class="stats-section-meta">${Utils.sanitize(group.label)}</div>
        </div>
      </div>
      <div class="recommendation-card-grid recommendations-item-grid">
        ${cards}
      </div>
    </section>`;
}

function buildRecommendationCard(book, reasonLabel) {
  const isSaved = !!Storage.getBookById(book.id);
  const statusLabel = isSaved ? Utils.statusLabel(book.status) : '';
  const statusClass = isSaved ? `badge ${Utils.statusBadgeClass(book.status)}` : '';
  const sourceBadges = Array.isArray(book.sourceBadges) && book.sourceBadges.length
    ? `<div class="recommendation-card-source-badges">${book.sourceBadges.map(label => `<span class="badge badge-accent">${Utils.sanitize(label)}</span>`).join('')}</div>`
    : '';
  return `
    <button type="button" class="recommendation-card recommendations-item" ${isSaved ? `onclick="Library.showDetailsModal('${book.id}')"` : 'aria-disabled="true"'}
      ${isSaved ? '' : 'disabled'}>
      <div class="recommendation-card-cover">
        ${Utils.buildCover(book, 'cover-sm')}
      </div>
      <div class="recommendation-card-body">
        <div class="recommendation-card-topline">
          ${reasonLabel ? `<div class="recommendation-card-reason recommendations-reason">${Utils.sanitize(reasonLabel)}</div>` : '<div class="recommendation-card-reason recommendations-reason">Library-based match</div>'}
          ${isSaved ? `<span class="${statusClass}">${statusLabel}</span>` : '<span class="badge badge-accent">Suggested</span>'}
        </div>
        <div class="recommendation-card-title">${Utils.sanitize(book.title)}</div>
        <div class="recommendation-card-author">${Utils.sanitize(book.author)}</div>
        ${sourceBadges}
      </div>
    </button>`;
}

function _recommendationScore(book) {
  let score = 0;
  if (book.isFavorite) score += 60;
  if (typeof book.rating === 'number') score += book.rating * 18;
  if (book.rating >= 4) score += 25;
  if (book.status === LIBRIQ.STATUS.READING) score += 14;
  if (book.status === LIBRIQ.STATUS.WISHLIST) score += 10;
  if (book.status !== LIBRIQ.STATUS.FINISHED) score += 8;
  score += _bookGenres(book).length * 5;
  score += _isRecognizedAuthor(book) ? 10 : 0;
  score += _dateValue(book.dateAdded) ? Math.max(0, 12 - Math.floor((Date.now() - _dateValue(book.dateAdded)) / 86400000)) : 0;
  return score;
}

function _recommendationWeight(book, multiplier = 1) {
  let weight = 1;
  if (book.isFavorite) weight += 4;
  if (typeof book.rating === 'number') weight += book.rating;
  if (book.rating >= 4) weight += 2;
  if (book.status === LIBRIQ.STATUS.READING) weight += 1.5;
  if (book.status === LIBRIQ.STATUS.FINISHED) weight += 1;
  return weight * multiplier;
}

function _bookGenres(book) {
  const genres = Array.isArray(book?.genres) ? book.genres : [];
  return genres.filter(Boolean).map(g => String(g).trim()).filter(Boolean);
}

function _cleanBookAuthor(author) {
  const value = String(author || '').trim();
  return value && value !== 'Unknown Author' ? value : '';
}

function _isRecognizedAuthor(book) {
  const author = _cleanBookAuthor(book.author);
  return Boolean(author) && (book.isFavorite || (typeof book.rating === 'number' && book.rating >= 4) || book.status === LIBRIQ.STATUS.FINISHED);
}

function _mostCommonGenre(books) {
  const counts = new Map();
  books.forEach(book => {
    _bookGenres(book).forEach(genre => {
      counts.set(genre, (counts.get(genre) || 0) + 1);
    });
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function _normalizeText(value) {
  return String(value || '').toLowerCase().trim();
}

function _dateValue(value) {
  const ts = value ? new Date(value).getTime() : 0;
  return Number.isFinite(ts) ? ts : 0;
}

// ── Profile Page ──────────────────────────────

function renderProfilePage() {
  const main    = document.getElementById('mainContent');
  if (!main) {
    console.error('[LibriQ] Missing #mainContent while rendering profile page.');
    return;
  }
  const profile = Storage.getProfile();
  const stats   = Storage.getStats();

  main.innerHTML = `
    <div class="page profile-page" id="profilePage" style="max-width: 600px;">
      <div class="page-header" style="margin-bottom: var(--space-6);">
        <h1 class="page-title">Profile</h1>
      </div>

      <div class="goal-widget" style="margin-bottom: var(--space-6);">
        <form id="profileForm" class="add-book-form">
          <div class="form-group">
            <label class="form-label" for="profileName">Display name</label>
            <input type="text" id="profileName" name="name"
              class="form-input" value="${Utils.sanitize(profile.name)}"
              placeholder="Your name" maxlength="40" />
            <div class="text-xs text-tertiary" style="margin-top: var(--space-2);">Use any name you want LibriQ to call you.</div>
          </div>
          <div class="form-group">
            <label class="form-label" for="profileBio">Bio <span class="text-tertiary">(optional)</span></label>
            <textarea id="profileBio" name="bio" class="form-input form-textarea"
              placeholder="A few words about your reading life…"
              maxlength="200">${Utils.sanitize(profile.bio || '')}</textarea>
          </div>
          <button type="submit" class="btn btn-primary">
            <i class="ph ph-floppy-disk"></i> Save Profile
          </button>
        </form>
      </div>

      <div class="goal-widget profile-stats-card">
        <div class="goal-header"><div class="goal-title">Reading Stats</div></div>
        <div class="stats-row profile-stats-row" style="grid-template-columns: repeat(2,1fr); margin: 0; gap: var(--space-3);">
          <div class="stat-card"><div class="stat-card-value">${stats.total}</div><div class="stat-card-label">Books tracked</div></div>
          <div class="stat-card"><div class="stat-card-value">${stats.finished}</div><div class="stat-card-label">Books finished</div></div>
          <div class="stat-card"><div class="stat-card-value">${Utils.formatNumber(stats.totalPages)}</div><div class="stat-card-label">Pages read</div></div>
          <div class="stat-card"><div class="stat-card-value">${stats.avgRating || '–'}</div><div class="stat-card-label">Avg rating</div></div>
        </div>
      </div>
    </div>`;

  document.getElementById('profileForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    Storage.saveProfile(data);
    Utils.toast('Profile saved', 'success');
    // Update greeting
    document.querySelector('.greeting-title span')?.textContent;
  });
}

// ── Settings Page ─────────────────────────────

function renderSettingsPage() {
  const main  = document.getElementById('mainContent');
  if (!main) {
    console.error('[LibriQ] Missing #mainContent while rendering settings page.');
    return;
  }
  if (window.localStorage?.getItem('libriq_debug_auto_backup')) {
    console.debug('[LibriQ][AutoBackup] full settings render');
  }
  const theme = Navigation.getActiveTheme?.() || document.documentElement.getAttribute('data-theme') || 'dark';
  const backupMeta = Storage.getBackupMeta?.() || { lastExportedAt: null };
  const hasBooks = Storage.getBooks().length > 0;
  const firebase = window.LibriqFirebase?.getState?.() || { available: false, initialized: false, user: null };
  const cloudBackupMeta = Storage.getCloudBackupMeta?.() || { lastCloudBackupAt: null, bookCount: null, activityCount: null };
  const lastExportedText = backupMeta.lastExportedAt
    ? Utils.formatDate(backupMeta.lastExportedAt)
    : 'No backup exported yet.';
  const lastCloudBackupText = cloudBackupMeta.lastCloudBackupAt
    ? Utils.formatDate(cloudBackupMeta.lastCloudBackupAt)
    : 'No cloud backup yet.';

  main.innerHTML = `
    <div class="page settings-page" id="settingsPage">
      <div class="settings-header">
        <div class="settings-heading">
          <span class="settings-eyebrow">App preferences</span>
          <h1 class="page-title">Settings</h1>
          <p class="page-subtitle">Tune the app, manage backups, and keep your library safe.</p>
        </div>
      </div>

      <div class="settings-grid">
        <section class="goal-widget settings-panel settings-panel-theme">
          <div class="goal-header">
            <div>
              <div class="goal-title">Appearance</div>
              <div class="settings-panel-subtitle">Choose the surface that feels best for your reading sessions.</div>
            </div>
          </div>
          <div class="settings-row settings-row-action">
            <div class="activity-text">
              <div class="activity-title">Theme</div>
              <div class="activity-subtitle">Switch between the Studio dark and light palettes.</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Navigation.toggleTheme()">
              <i class="ph ph-${theme === 'dark' ? 'sun' : 'moon'}"></i>
              Switch to ${theme === 'dark' ? 'light' : 'dark'}
            </button>
          </div>
        </section>

        <section class="goal-widget settings-panel">
          <div class="goal-header">
            <div>
              <div class="goal-title">Account</div>
              <div class="settings-panel-subtitle">Sign in only when you want backup, sync, or multi-device continuity.</div>
            </div>
          </div>
          ${_buildAccountSection(firebase)}
          <div class="settings-session-actions">
            <button class="btn btn-secondary btn-sm" type="button" onclick="Navigation.goTo('session')">
              <i class="ph ph-arrow-counter-clockwise"></i>
              Choose start mode
            </button>
          </div>
        </section>

        <section class="goal-widget settings-panel settings-panel-cloud">
          <div class="goal-header">
            <div>
              <div class="goal-title">Cloud Backup</div>
              <div class="settings-panel-subtitle">Keep a recovery copy tied to your signed-in account.</div>
            </div>
          </div>
          ${_buildCloudBackupSection(firebase, cloudBackupMeta)}
        </section>

        <section class="goal-widget settings-panel settings-panel-sync">
          <div class="goal-header">
            <div>
              <div class="goal-title">Account Sync</div>
              <div class="settings-panel-subtitle">Sync status and safety notes are separated from everyday backup controls.</div>
            </div>
          </div>
          ${_buildSyncSection(firebase)}
        </section>

        <section class="goal-widget settings-panel settings-panel-data">
          <div class="goal-header">
            <div>
              <div class="goal-title">Export / Import</div>
              <div class="settings-panel-subtitle">Move your library between devices with a JSON backup.</div>
            </div>
          </div>
          <div class="settings-row settings-row-action">
            <div class="activity-text">
              <div class="activity-title">Export library</div>
              <div class="activity-subtitle">Download your data as JSON. Private notes are included.</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Navigation.exportData()">
              <i class="ph ph-download-simple"></i> Export
            </button>
          </div>
          <div class="settings-row settings-row-action">
            <div class="activity-text">
              <div class="activity-title">Import library</div>
              <div class="activity-subtitle">Review a backup before replacing or merging your library.</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="Navigation.promptImportData()">
              <i class="ph ph-upload-simple"></i> Import
            </button>
          </div>
          <div class="settings-row settings-row-danger">
            <div class="activity-text">
              <div class="activity-title">Danger zone</div>
              <div class="activity-subtitle">Destructive account and cloud data actions live here.</div>
            </div>
            <div class="settings-danger-actions">
              <button class="btn btn-danger btn-sm" onclick="Navigation.confirmDeleteLibraryData()">
                <i class="ph ph-trash"></i> Delete library data
              </button>
              <button class="btn btn-danger btn-sm" onclick="Navigation.confirmDeleteAccount()">
                <i class="ph ph-user-minus"></i> Delete account
              </button>
            </div>
          </div>
          <div class="settings-row">
            <div class="activity-text">
              <div class="activity-title">Last exported</div>
              <div class="activity-subtitle">${lastExportedText}</div>
            </div>
          </div>
          <div class="settings-row">
            <div class="activity-text">
              <div class="activity-title">Last cloud backup</div>
              <div class="activity-subtitle">${lastCloudBackupText}</div>
            </div>
          </div>
          ${hasBooks && !backupMeta.lastExportedAt ? `
            <div class="settings-callout">
              Consider exporting a backup before making larger changes.
            </div>` : ''}
          <input id="importLibraryInput" type="file" accept="application/json,.json" hidden onchange="Navigation.importDataFromFile(this.files?.[0])" />
        </section>

        <section class="goal-widget settings-panel">
          <div class="goal-header">
            <div>
              <div class="goal-title">Privacy / Data</div>
              <div class="settings-panel-subtitle">A local-first app with optional account features.</div>
            </div>
          </div>
          <p class="text-sm text-secondary" style="line-height: var(--leading-loose); margin-top: 0;">
            LibriQ works without an account. Your library stays on this device unless you choose to back it up, sync it, or export it.
          </p>
          <div class="settings-list">
            ${[
              ['Local library storage', 'LibriQ stores your library locally on this device.'],
              ['Analytics', 'LibriQ uses anonymous page views to understand general traffic.'],
              ['Accounts are optional', 'You can keep using LibriQ without signing in.'],
              ['Backup and sync', 'Backup, restore, merge, and Account Sync stay separate.'],
              ['JSON export', 'Export a copy anytime for your own backup.'],
              ['Private notes and quotes', 'Private notes and quotes stay local unless you include them in a backup.'],
              ['Continue offline', 'Offline mode keeps your books on this device.'],
            ].map(([title, subtitle]) => `
              <div class="settings-row">
                <div class="activity-text">
                  <div class="activity-title">${title}</div>
                  <div class="activity-subtitle">${subtitle}</div>
                </div>
              </div>`).join('')}
          </div>
        </section>

        <section class="goal-widget settings-panel">
          <div class="goal-header">
            <div>
              <div class="goal-title">About</div>
              <div class="settings-panel-subtitle">Version and source notes for the current build.</div>
            </div>
          </div>
          <p class="text-sm text-secondary" style="line-height: var(--leading-loose); margin-top: 0;">
            <strong style="color: var(--text-primary);">LibriQ</strong> v${LIBRIQ.VERSION}<br>
            Your reading life, beautifully organized.<br>
            Book data from <a href="https://openlibrary.org" target="_blank" style="color: var(--text-accent);">Open Library</a> and <a href="https://books.google.com" target="_blank" style="color: var(--text-accent);">Google Books</a>.
            <br>Manual cloud backup is available for signed-in users.
          </p>
        </section>
      </div>
    </div>`;

  _wireAccountControls();
}

function _buildAccountSection(firebase) {
  if (!firebase.initialized) {
    return `
      <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">Account</div>
          <div class="activity-subtitle">Loading account status…</div>
        </div>
      </div>`;
  }

  if (!firebase.available) {
    return `
      <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">Account</div>
          <div class="activity-subtitle">Account features are unavailable in this build.</div>
        </div>
      </div>`;
  }

  if (!firebase.user) {
    return `
      <div class="activity-item" style="cursor:default; padding: var(--space-3) 0; align-items: center;">
        <div class="activity-text">
          <div class="activity-title">Account</div>
          <div class="activity-subtitle">Sign in to enable cloud backup.</div>
        </div>
        <button class="btn btn-secondary btn-sm" id="accountActionBtn" type="button" data-account-action="signin">
          Sign in
        </button>
      </div>`;
  }

  const user = firebase.user;
  const avatar = user.photoURL
    ? `<img src="${Utils.sanitize(user.photoURL)}" alt="" aria-hidden="true" style="width:40px;height:40px;border-radius:999px;object-fit:cover;" />`
    : `<div style="width:40px;height:40px;border-radius:999px;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-weight:700;">${Utils.sanitize((user.displayName || user.email || 'U').slice(0,1).toUpperCase())}</div>`;
  const cloudState = window.LibriqCloudBackup?.getState?.() || {};
  const hasFirestore = Boolean(window.LibriqFirebase?.hasFirestore?.());
  const offlineMode = Navigation.getSessionPreference?.() === 'offline';
  const cloudLabel = cloudState.status === 'paused' || offlineMode
    ? 'Cloud backup is paused while you’re using offline mode.'
    : hasFirestore
      ? 'Cloud backup is active for this account.'
      : 'You\'re signed in, but cloud backup is unavailable right now.';
  const backupLabel = cloudState.lastSavedAt
    ? cloudState.message || window.LibriqCloudBackup?.formatLastSavedLabel?.(cloudState.lastSavedAt) || 'Last backed up: just now'
    : 'Your library is backed up to your account on this device.';

  return `
    <div class="activity-item" style="cursor:default; padding: var(--space-3) 0; align-items: center;">
      <div class="activity-text" style="display:flex; flex-direction:row; align-items:center; gap: var(--space-3);">
        ${avatar}
        <div>
          <div class="activity-title">${Utils.sanitize(getDisplayNameForAccount(user) || 'Signed in')}</div>
          <div class="activity-subtitle">${Utils.sanitize(user.email || '')}</div>
          <div class="activity-subtitle" id="settingsAccountCloudCopy">${Utils.sanitize(cloudLabel)}</div>
          ${cloudState.lastSavedAt ? `<div class="activity-subtitle" id="settingsAccountCloudBackupCopy">${Utils.sanitize(backupLabel)}</div>` : ''}
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" id="accountActionBtn" type="button" data-account-action="signout">
        Sign out
      </button>
    </div>`;
}

function _buildCloudBackupSection(firebase, cloudBackupMeta) {
  if (!firebase.initialized) {
    return `
      <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">Cloud backup</div>
          <div class="activity-subtitle">Checking cloud backup status...</div>
        </div>
      </div>`;
  }

  if (!firebase.available || !window.LibriqFirebase?.hasFirestore?.()) {
    return `
      <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">Cloud backup</div>
          <div class="activity-subtitle">Cloud backup is unavailable right now.</div>
        </div>
      </div>`;
  }

  if (!firebase.user) {
    return `
      <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">Cloud backup</div>
          <div class="activity-subtitle">Sign in to enable cloud backup.</div>
        </div>
      </div>`;
  }

  const cloudState = window.LibriqCloudBackup?.getState?.() || {};
  if (window.localStorage?.getItem('libriq_debug_auto_backup')) {
    console.debug('[LibriQ][AutoBackup] renderCloudBackupSection reads status', cloudState);
  }
  const status = cloudState.message || (cloudBackupMeta.lastCloudBackupAt ? 'Cloud backup active' : 'Sign in to enable cloud backup');
  const lastSaved = cloudState.lastSavedAt || cloudBackupMeta.lastCloudBackupAt;
  const lastSavedText = lastSaved
    ? (window.LibriqCloudBackup?.formatLastSavedLabel?.(lastSaved) || `Last backed up: ${Utils.formatDate(lastSaved)}`)
    : 'No cloud backup yet.';
  const backupHelperText = cloudState.pending
    ? 'Saving...'
    : 'Cloud backup is a safety copy of your library. Account Sync updates books across devices, while backup and restore stay separate.';

  return `
    <div class="activity-list" id="settingsCloudBackupCard">
      <div class="activity-item settings-summary-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">Cloud backup</div>
          <div class="activity-subtitle" id="cloudBackupStatusText">${status}</div>
          <div class="activity-subtitle" id="cloudBackupSecondaryText">${backupHelperText}</div>
          <div class="activity-subtitle" id="cloudBackupLastSavedText">${lastSavedText}</div>
        </div>
      </div>
      <div class="settings-cloud-actions">
        <button class="btn btn-primary btn-sm" type="button" id="cloudBackupSaveBtn">
          <i class="ph ph-cloud-arrow-up"></i>
          Back up now
        </button>
        <button class="btn btn-secondary btn-sm" type="button" id="cloudBackupRestoreBtn">
          <i class="ph ph-cloud-arrow-down"></i>
          Restore from cloud
        </button>
        <button class="btn btn-secondary btn-sm" type="button" id="cloudBackupMergeBtn">
          <i class="ph ph-arrows-left-right"></i>
          Merge cloud with this device
        </button>
      </div>
    </div>`;
}

function _buildSyncSection(firebase) {
  const syncState = window.LibriqSyncBeta?.getState?.() || { enabled: false, status: 'off', message: 'Account sync off', conflictCount: 0 };
  const signedIn = Boolean(firebase.user || window.LibriqFirebase?.getCurrentUser?.());
  const offlineMode = Navigation.getSessionPreference?.() === 'offline';
  const diagnosticsRows = _buildSyncDiagnosticsRows(syncState);
  if (!firebase.initialized) {
    return `
      <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">Account Sync</div>
          <div class="activity-subtitle">Checking sync status...</div>
        </div>
      </div>`;
  }
  if (!firebase.available || !window.LibriqFirebase?.hasFirestore?.()) {
    return `
      <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">Account Sync</div>
          <div class="activity-subtitle">Sync unavailable.</div>
        </div>
      </div>`;
  }
  const description = offlineMode
    ? 'Offline mode: books stay on this device.'
    : signedIn && syncState.enabled
      ? (syncState.pending ? 'Saved locally. Will sync when online.' : 'Your books sync automatically across signed-in devices.')
      : signedIn
        ? 'Sync is off on this device.'
        : 'Sign in to sync your library.';
  const syncStatus = offlineMode ? 'Paused'
    : !signedIn ? 'Off'
    : syncState.pending ? 'Pending'
    : syncState.enabled ? 'On'
    : 'Off';
  const lastSynced = syncState.pending && syncState.pendingSince
    ? `Saved locally: ${Utils.formatDate(syncState.pendingSince)}`
    : syncState.lastSyncedAt ? `Last synced: ${Utils.formatDate(syncState.lastSyncedAt)}` : 'Last synced: Not yet';
  const errorText = syncState.status === 'error' && syncState.lastError ? `Sync needs attention: ${syncState.lastError}` : '';
  const actionLabel = syncState.enabled && !offlineMode ? 'Turn off sync' : 'Turn on sync';
  const actionDisabled = !signedIn || offlineMode;
  return `
    <div class="activity-list" id="settingsSyncCard">
      <div class="activity-item settings-summary-item" style="cursor:default; padding: var(--space-3) 0;">
        <div class="activity-text">
          <div class="activity-title">Account Sync</div>
          <div class="activity-subtitle" id="syncStatusText">Sync status: ${Utils.sanitize(syncStatus)}</div>
          <div class="activity-subtitle" id="syncSecondaryText">${Utils.sanitize(description)}</div>
          <div class="activity-subtitle" id="syncLastSyncedText">${Utils.sanitize(lastSynced)}</div>
          ${errorText ? `<div class="activity-subtitle" id="syncErrorText">${Utils.sanitize(errorText)}</div>` : ''}
        </div>
      </div>
      <div class="settings-cloud-actions">
        <button class="btn ${syncState.enabled && !offlineMode ? 'btn-secondary' : 'btn-primary'} btn-sm" type="button" id="syncToggleBtn" ${actionDisabled ? 'disabled' : ''} data-sync-enabled="${syncState.enabled && !offlineMode ? '1' : '0'}">
          ${actionLabel}
        </button>
        <button class="btn btn-secondary btn-sm" type="button" id="syncRefreshStatusBtn">
          Refresh
        </button>
      </div>
      <details class="settings-diagnostics">
        <summary class="activity-title">Advanced diagnostics</summary>
        <div class="activity-text">
          <div class="activity-subtitle">For troubleshooting only.</div>
          <div class="sync-health-list">${diagnosticsRows}</div>
          <div class="settings-diagnostics-actions">
            <button class="btn btn-secondary btn-sm" type="button" onclick="Navigation.clearLocalCache()">
              <i class="ph ph-trash"></i> Clear local cache
            </button>
          </div>
        </div>
      </details>
    </div>`;
}

function _buildSyncDiagnosticsRows(syncState) {
  const listenerStatus = syncState.listenerAttached ? 'Connected' : 'Not connected';
  const lastSnapshot = syncState.lastSnapshotAt ? Utils.formatDate(syncState.lastSnapshotAt) : 'Not yet';
  const lastWrite = syncState.lastWriteAt ? Utils.formatDate(syncState.lastWriteAt) : 'Not yet';
  const lastError = syncState.lastError || 'None';
  const pendingBooks = Array.isArray(syncState.pendingBookIds) ? syncState.pendingBookIds.length : 0;
  const pendingDeletes = Array.isArray(syncState.pendingDeleteIds) ? syncState.pendingDeleteIds.length : 0;
  const eligibility = syncState.eligibilityAllowed ? 'Allowed' : 'Not eligible right now';
  const syncPath = syncState.syncPath || syncState.listenerPath || 'Not available yet';
  const rows = [
    ['Device ID', syncState.deviceId || 'Not available yet'],
    ['Listener state', listenerStatus],
    ['Sync path', syncPath],
    ['Last snapshot', lastSnapshot],
    ['Last write', lastWrite],
    ['Last error', lastError],
    ['Pending books', String(pendingBooks)],
    ['Pending deletes', String(pendingDeletes)],
    ['Tombstone count', String(syncState.tombstoneCount ?? 0)],
    ['Oldest tombstone', syncState.oldestTombstoneAt ? Utils.formatDate(syncState.oldestTombstoneAt) : 'None'],
    ['Eligibility status', eligibility],
  ];
  return rows.map(([label, value]) => `
    <div class="activity-subtitle sync-health-row">
      <strong>${Utils.sanitize(label)}:</strong> ${Utils.sanitize(value)}
    </div>
  `).join('');
}

function _wireAccountControls() {
  const btn = document.getElementById('accountActionBtn');
  if (!btn) return;
  btn.onclick = async () => {
    const action = btn.dataset.accountAction;
    try {
      if (action === 'signin') {
        await window.LibriqFirebase?.signInWithGoogle?.();
      } else {
        await window.LibriqFirebase?.signOut?.();
      }
    } catch (err) {
      const code = String(err?.code || err?.message || '');
      const cancelled = code.includes('popup-closed-by-user') || code.includes('popup-blocked');
      Utils.toast(cancelled ? 'Sign-in was cancelled.' : 'Could not update account status right now.', 'error');
    }
  };

  const saveBtn = document.getElementById('cloudBackupSaveBtn');
  if (saveBtn) saveBtn.onclick = backupToCloud;

  const restoreBtn = document.getElementById('cloudBackupRestoreBtn');
  if (restoreBtn) restoreBtn.onclick = async () => {
    await openCloudRestorePreview();
  };

  const mergeBtn = document.getElementById('cloudBackupMergeBtn');
  if (mergeBtn) mergeBtn.onclick = async () => {
    await openCloudMergePreview();
  };

  const enableSyncBtn = document.getElementById('syncToggleBtn');
  if (enableSyncBtn) enableSyncBtn.onclick = () => {
    if (enableSyncBtn.dataset.syncEnabled === '1') {
      window.LibriqSyncBeta?.setEnabled?.(false);
      Utils.toast('Account sync turned off', 'info');
      Navigation.renderCurrentPage?.();
      return;
    }
    const firebase = window.LibriqFirebase?.getState?.() || { available: false, initialized: false, ready: false, user: null };
    if (Navigation.getSessionPreference?.() === 'offline') {
      Utils.toast('Switch to account mode before enabling sync.', 'warning');
      return;
    }
    if (!firebase.user && !window.LibriqFirebase?.getCurrentUser?.()) {
      Utils.toast('Sign in first to enable sync.', 'warning');
      return;
    }
    if (!firebase.user) {
      firebase.user = window.LibriqFirebase?.getCurrentUser?.() || null;
    }
    window.LibriqSyncBeta?.setEnabled?.(true);
    Utils.toast('Sync is on. Your books will update across signed-in devices.', 'success');
  };

  const refreshSyncBtn = document.getElementById('syncRefreshStatusBtn');
  if (refreshSyncBtn) refreshSyncBtn.onclick = () => {
    window.LibriqSyncBeta?.refresh?.();
    Utils.toast('Sync status refreshed', 'info');
    window.setTimeout(() => Navigation.renderCurrentPage?.(), 150);
  };

}

function _countRecords(list, filterFn) {
  return Array.isArray(list) ? list.filter(filterFn).length : 0;
}

function _summarizeLibrary(books, activity = []) {
  const safeBooks = Array.isArray(books) ? books : [];
  const safeActivity = Array.isArray(activity) ? activity : [];
  const notesCount = safeBooks.reduce((sum, book) => sum + (book?.notes ? 1 : 0), 0);
  const quotesCount = safeBooks.reduce((sum, book) => sum + (Array.isArray(book?.quotes) ? book.quotes.length : 0), 0);
  const lastUpdated = safeBooks.reduce((latest, book) => {
    const time = new Date(book?.updatedAt || book?.dateFinished || book?.dateStarted || book?.dateAdded || 0).getTime();
    return Number.isFinite(time) && time > latest ? time : latest;
  }, 0);
  return {
    bookCount: safeBooks.length,
    readingCount: _countRecords(safeBooks, book => book?.status === LIBRIQ.STATUS.READING),
    finishedCount: _countRecords(safeBooks, book => book?.status === LIBRIQ.STATUS.FINISHED),
    notesCount,
    quotesCount,
    activityCount: safeActivity.length,
    lastUpdatedAt: lastUpdated ? new Date(lastUpdated).toISOString() : null,
  };
}

function _buildRestoreSummaryMarkup(label, summary, extra = []) {
  return `
    <section class="whats-new-item">
      <div class="whats-new-item-title">${Utils.sanitize(label)}</div>
      <p>
        Books: ${summary.bookCount}<br>
        Reading: ${summary.readingCount}<br>
        Finished: ${summary.finishedCount}<br>
        Notes: ${summary.notesCount}<br>
        Quotes: ${summary.quotesCount}
        ${summary.activityCount !== null ? `<br>Activity: ${summary.activityCount}` : ''}
        ${summary.lastUpdatedAt ? `<br>Last updated: ${Utils.formatDate(summary.lastUpdatedAt)}` : ''}
        ${extra.map(line => `<br>${Utils.sanitize(line)}`).join('')}
      </p>
    </section>`;
}

async function openCloudRestorePreview() {
  const firebase = window.LibriqFirebase?.getState?.() || {};
  if (!firebase.user || !window.LibriqFirebase?.hasFirestore?.()) return restoreFromCloud();
  const currentBooks = Storage.getBooks();
  let docData = null;
  try {
    const snap = await window.LibriqFirebase.readBackupDoc(['users', firebase.user.uid, 'backups', 'current']);
    if (!snap?.exists?.()) {
      Utils.toast('No cloud backup found yet.', 'info');
      return;
    }
    docData = _normalizeCloudBackupDoc(snap.data());
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
  subtitle.textContent = 'Cloud restore replaces the library on this device. Export a JSON copy first if you want a safety copy.';
  body.innerHTML = `
    <div class="whats-new-list">
      ${_buildRestoreSummaryMarkup('Local library', currentSummary)}
      ${_buildRestoreSummaryMarkup('Cloud backup', cloudSummary, [
        `Backup version: ${Utils.sanitize(String(docData.backupVersion ?? 'Unknown'))}`,
        `App version: ${Utils.sanitize(String(docData.appVersion ?? docData.version ?? 'Unknown'))}`,
        `Schema: ${Utils.sanitize(String(docData.schemaVersion ?? 'Unknown'))}`,
        `Device ID: ${Utils.sanitize(String(docData.deviceId ?? 'Unknown'))}`,
      ])}
      ${cloudIsOlder ? `<section class="whats-new-item"><div class="whats-new-item-title">Warning</div><p>This cloud backup may be older than your current library.</p></section>` : ''}
    </div>
  `;
  merge.textContent = 'Export local JSON first';
  replace.textContent = 'Restore cloud backup';
  cancel.textContent = 'Cancel';
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  const cleanup = () => {
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    replace.onclick = null;
    merge.onclick = null;
    cancel.onclick = null;
    close.onclick = null;
    modal.onclick = null;
  };

  merge.onclick = async () => {
    await exportData();
  };
  replace.onclick = async () => {
    cleanup();
    await confirmAndRestoreCloud(docData, currentSummary);
  };
  cancel.onclick = cleanup;
  close.onclick = cleanup;
  modal.onclick = (e) => { if (e.target === modal) cleanup(); };
}

async function openCloudMergePreview() {
  const firebase = window.LibriqFirebase?.getState?.() || {};
  if (!firebase.user || !window.LibriqFirebase?.hasFirestore?.()) return;

  const currentBooks = Storage.getBooks();
  let docData = null;
  try {
    const snap = await window.LibriqFirebase.readBackupDoc(['users', firebase.user.uid, 'backups', 'current']);
    if (!snap?.exists?.()) {
      Utils.toast('No cloud backup found yet.', 'info');
      return;
    }
    docData = _normalizeCloudBackupDoc(snap.data());
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
  const plan = _planCloudMerge(currentBooks, docData.data);
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
  subtitle.textContent = 'Merge adds safe cloud-only items without replacing local conflicts. Export a JSON copy first if you want a safety copy.';
  body.innerHTML = `
    <div class="whats-new-list">
      ${_buildRestoreSummaryMarkup('Local library', currentSummary)}
      ${_buildRestoreSummaryMarkup('Cloud backup', cloudSummary, [
        `Backup version: ${Utils.sanitize(String(docData.backupVersion ?? 'Unknown'))}`,
        `App version: ${Utils.sanitize(String(docData.appVersion ?? docData.version ?? 'Unknown'))}`,
        `Schema: ${Utils.sanitize(String(docData.schemaVersion ?? 'Unknown'))}`,
        `Device ID: ${Utils.sanitize(String(docData.deviceId ?? 'Unknown'))}`,
      ])}
      <section class="whats-new-item">
        <div class="whats-new-item-title">Merge result preview</div>
        <p>
          New books to add from cloud: ${plan.newBooksToAdd.length}<br>
          Local books kept: ${plan.localBooksKept.length}<br>
          Duplicates skipped: ${plan.duplicatesSkipped.length}<br>
          Possible conflicts: ${plan.conflicts.length}<br>
          Notes to add safely: ${plan.notesToAdd}<br>
          Quotes to add safely: ${plan.quotesToAdd}<br>
          Items unchanged: ${plan.itemsUnchanged}
        </p>
      </section>
      ${plan.conflicts.length ? `<section class="whats-new-item"><div class="whats-new-item-title">Conflict notice</div><p>Some items looked different on this device and in your cloud backup. LibriQ kept this device's version for now.</p></section>` : ''}
    </div>
  `;
  merge.textContent = 'Merge cloud with this device';
  replace.textContent = 'Export local JSON first';
  cancel.textContent = 'Cancel';
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  const cleanup = () => {
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    replace.onclick = null;
    merge.onclick = null;
    cancel.onclick = null;
    close.onclick = null;
    modal.onclick = null;
  };

  replace.onclick = async () => {
    await exportData();
  };
  merge.onclick = async () => {
    cleanup();
    await confirmAndMergeCloud(docData, plan, currentSummary);
  };
  cancel.onclick = cleanup;
  close.onclick = cleanup;
  modal.onclick = (e) => { if (e.target === modal) cleanup(); };
}

async function confirmAndRestoreCloud(docData, currentSummary) {
  const proceed = confirm('Restoring will replace this device\'s current library with the cloud backup. Continue?');
  if (!proceed) return;
  if (currentSummary.bookCount > 0 && !confirm('This cloud restore will overwrite your local library. Export first if you want a safety copy. Restore now?')) {
    return;
  }
  await restoreFromCloud(docData);
}

async function confirmAndMergeCloud(docData, plan, currentSummary) {
  const proceed = confirm('Merge cloud with this device? LibriQ will add safe cloud-only items and keep this device\'s version for conflicts.');
  if (!proceed) return;
  if (currentSummary.bookCount > 0 && !confirm('Export first if you want a safety copy. Apply the merge now?')) {
    return;
  }
  await mergeCloudWithThisDevice(docData, plan);
}

function _bookNeedsMetadata(book) {
  if (!book) return [];
  const gaps = [];
  if (!book.coverUrl) gaps.push('cover');
  if (!book.description) gaps.push('description');
  if (!book.pageCount) gaps.push('pageCount');
  if (!Array.isArray(book.genres) || book.genres.length === 0) gaps.push('genres');
  if (!book.publishYear) gaps.push('publishYear');
  if (!book.publisher) gaps.push('publisher');
  if (!book.language) gaps.push('language');
  return gaps;
}

function _hasGoogleBooksKey() {
  const config = window.LibriqConfig || window.__LIBRIQ_CONFIG__ || {};
  const candidate = config.googleBooksApiKey || config.googleBooksKey || config.GOOGLE_BOOKS_API_KEY || '';
  return Boolean(String(candidate).trim());
}

async function exportData() {
  const activity = Storage.getActivityLog?.() || [];
  const exportedAt = new Date().toISOString();
  const data = {
    app: 'LibriQ',
    version: LIBRIQ.VERSION,
    exportedAt,
    data: {
      books: Storage.getBooks(),
      profile: Storage.getProfile(),
      goals: Storage.getGoals(),
      streak: Storage.getStreak(),
      activity,
    },
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `libriq-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  Storage.saveBackupMeta?.({ lastExportedAt: exportedAt });
  Storage.addActivityEvent?.(Storage.buildActivityEvent?.('backup_exported', null, { itemCount: data.data.books.length, activityCount: activity.length }, 'export'));
  Utils.toast('Library exported', 'success');
  if (document.getElementById('mainContent')?.querySelector('#importLibraryInput')) {
    try {
      Navigation.renderCurrentPage?.();
    } catch (uiErr) {
      console.warn('[Libriq] Export UI refresh failed:', uiErr);
    }
  }
}

function _buildManualBackupPayload() {
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

function _normalizeCloudBackupDoc(docData) {
  if (!docData || typeof docData !== 'object') return null;
  if (docData.app && docData.app !== 'LibriQ') return null;
  const data = docData.data;
  if (!data || typeof data !== 'object') return null;
  if (!Array.isArray(data.books)) return null;
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

function _planCloudMerge(localBooks, cloudData) {
  const local = Array.isArray(localBooks) ? localBooks.map(book => createBook(book)) : [];
  const cloudBooks = Array.isArray(cloudData?.books) ? cloudData.books.map(book => createBook(book)) : [];
  const localById = new Map(local.map(book => [book.id, book]));
  const localByIsbn = new Map();
  const localByKey = new Map();
  local.forEach(book => {
    if (book.isbn) localByIsbn.set(String(book.isbn).trim(), book);
    localByKey.set(_bookMergeKey(book), book);
  });

  const result = {
    newBooksToAdd: [],
    localBooksKept: local.slice(),
    duplicatesSkipped: [],
    conflicts: [],
    notesToAdd: 0,
    quotesToAdd: 0,
    itemsUnchanged: 0,
  };

  cloudBooks.forEach(cloudBook => {
    const match = _findBookMergeMatch(cloudBook, localById, localByIsbn, localByKey);
    if (!match) {
      result.newBooksToAdd.push(cloudBook);
      result.itemsUnchanged += 1;
      result.notesToAdd += cloudBook.notes ? 1 : 0;
      result.quotesToAdd += Array.isArray(cloudBook.quotes) ? cloudBook.quotes.length : 0;
      return;
    }

    const localBook = match;
    const localTime = new Date(localBook.updatedAt || localBook.createdAt || localBook.dateAdded || 0).getTime();
    const cloudTime = new Date(cloudBook.updatedAt || cloudBook.createdAt || cloudBook.dateAdded || 0).getTime();
    const deletedWins = Boolean(localBook.deletedAt || cloudBook.deletedAt);
    const conflict = deletedWins || (
      String(localBook.notes || '') !== String(cloudBook.notes || '') ||
      Number(localBook.currentPage || 0) !== Number(cloudBook.currentPage || 0) ||
      String(localBook.status || '') !== String(cloudBook.status || '') ||
      (Number.isFinite(localTime) && Number.isFinite(cloudTime) && localTime !== cloudTime)
    );

    if (deletedWins || conflict) {
      result.conflicts.push({ localBook, cloudBook, reason: deletedWins ? 'deleted' : 'changed' });
      return;
    }

    result.notesToAdd += !localBook.notes && cloudBook.notes ? 1 : 0;
    result.quotesToAdd += _countSafeQuoteAdds(localBook.quotes, cloudBook.quotes);
    result.duplicatesSkipped.push(cloudBook);
    result.itemsUnchanged += 1;
  });

  return result;
}

function _findBookMergeMatch(book, localById, localByIsbn, localByKey) {
  if (!book) return null;
  if (book.id && localById.has(book.id)) return localById.get(book.id);
  const isbnKey = book.isbn ? String(book.isbn).trim() : '';
  if (isbnKey && localByIsbn.has(isbnKey)) return localByIsbn.get(isbnKey);
  const titleKey = _bookMergeKey(book);
  if (titleKey && localByKey.has(titleKey)) return localByKey.get(titleKey);
  return null;
}

async function mergeCloudWithThisDevice(docData, plan) {
  const firebase = window.LibriqFirebase?.getState?.() || {};
  if (!firebase.user) {
    Utils.toast('Sign in first to merge from cloud.', 'warning');
    return;
  }
  if (!window.LibriqFirebase?.hasFirestore?.()) {
    Utils.toast('Cloud backup is unavailable right now.', 'error');
    return;
  }
  if (!docData?.data || !Array.isArray(docData.data.books)) {
    Utils.toast('Couldn\'t read this cloud backup. Your local data was not changed.', 'error');
    return;
  }

  const localBooks = Storage.getBooks();
  const mergedBooks = localBooks.map(book => createBook(book));
  const mergedIndexById = new Map(mergedBooks.map((book, index) => [book.id, index]));
  const mergedIndexByKey = new Map();
  mergedBooks.forEach((book, index) => {
    mergedIndexByKey.set(_bookMergeKey(book), index);
    if (book.isbn) mergedIndexByKey.set(`isbn:${String(book.isbn).trim()}`, index);
  });

  plan.newBooksToAdd.forEach(book => {
    mergedBooks.push(createBook(book));
  });

  const cloudBooks = Array.isArray(docData.data.books) ? docData.data.books.map(book => createBook(book)) : [];
  cloudBooks.forEach(cloudBook => {
    const matchIndex = _findCloudMergeIndex(cloudBook, mergedIndexById, mergedIndexByKey, mergedBooks);
    if (matchIndex === null) return;
    const localBook = mergedBooks[matchIndex];
    if (!localBook) return;
    if (localBook.deletedAt || cloudBook.deletedAt) return;
    mergedBooks[matchIndex] = _mergeCloudBookSafely(localBook, cloudBook);
    mergedIndexById.set(mergedBooks[matchIndex].id, matchIndex);
    mergedIndexByKey.set(_bookMergeKey(mergedBooks[matchIndex]), matchIndex);
    if (mergedBooks[matchIndex].isbn) mergedIndexByKey.set(`isbn:${String(mergedBooks[matchIndex].isbn).trim()}`, matchIndex);
  });

  const mergedActivity = _mergeActivityById(Storage.getActivityLog?.() || [], Array.isArray(docData.data.activity) ? docData.data.activity : []);

  Storage.saveBooks(mergedBooks);
  Storage.replaceActivityLog?.(mergedActivity);
  Storage.saveCloudBackupMeta?.({
    lastCloudBackupAt: docData.updatedAt || new Date().toISOString(),
    bookCount: docData.bookCount ?? docData.data.books.length,
    activityCount: docData.activityCount ?? mergedActivity.length,
    backupVersion: docData.backupVersion ?? 1,
    appVersion: docData.appVersion || docData.version || LIBRIQ.VERSION,
    schemaVersion: docData.schemaVersion ?? null,
    deviceId: docData.deviceId || Storage.getDeviceId?.(),
    notesCount: docData.notesCount ?? null,
    quotesCount: docData.quotesCount ?? null,
    lastLocalUpdatedAt: docData.lastLocalUpdatedAt ?? null,
    syncReady: false,
  });

  Utils.toast('Cloud merge completed', 'success');
  try {
    Navigation.updateBadges?.();
    Navigation.renderCurrentPage?.();
  } catch (uiErr) {
    console.warn('[Libriq] Cloud merge UI refresh failed:', uiErr);
  }
}

function _findCloudMergeIndex(book, mergedIndexById, mergedIndexByKey, mergedBooks) {
  if (!book) return null;
  if (book.id && mergedIndexById.has(book.id)) return mergedIndexById.get(book.id);
  const isbnKey = book.isbn ? `isbn:${String(book.isbn).trim()}` : '';
  if (isbnKey && mergedIndexByKey.has(isbnKey)) return mergedIndexByKey.get(isbnKey);
  const titleKey = _bookMergeKey(book);
  if (titleKey && mergedIndexByKey.has(titleKey)) return mergedIndexByKey.get(titleKey);
  return null;
}

function _mergeCloudBookSafely(localBook, cloudBook) {
  const merged = { ...localBook };
  merged.tags = Array.from(new Set([...(localBook.tags || []), ...(cloudBook.tags || [])].map(tag => String(tag || '').trim()).filter(Boolean)));
  if (!merged.notes && cloudBook.notes) {
    merged.notes = cloudBook.notes;
    merged.notesUpdatedAt = cloudBook.notesUpdatedAt || cloudBook.updatedAt || cloudBook.createdAt || merged.notesUpdatedAt || null;
  }
  merged.quotes = _mergeQuotesSafely(localBook.quotes, cloudBook.quotes);
  if (!merged.createdAt) merged.createdAt = localBook.createdAt || cloudBook.createdAt || localBook.dateAdded || cloudBook.dateAdded || new Date().toISOString();
  merged.updatedAt = localBook.updatedAt || cloudBook.updatedAt || merged.updatedAt || new Date().toISOString();
  merged.deletedAt = localBook.deletedAt ?? cloudBook.deletedAt ?? null;
  return merged;
}

function _mergeQuotesSafely(localQuotes, cloudQuotes) {
  const byId = new Map();
  const localList = Array.isArray(localQuotes) ? localQuotes : [];
  const cloudList = Array.isArray(cloudQuotes) ? cloudQuotes : [];
  localList.forEach(quote => {
    if (!quote?.id) return;
    byId.set(quote.id, { ...quote });
  });
  cloudList.forEach(quote => {
    const normalized = {
      id: quote.id || crypto.randomUUID(),
      text: String(quote.text || ''),
      page: quote.page ?? null,
      note: quote.note ?? '',
      createdAt: quote.createdAt || quote.updatedAt || new Date().toISOString(),
      updatedAt: quote.updatedAt || quote.createdAt || new Date().toISOString(),
    };
    if (normalized.id && byId.has(normalized.id)) return;
    const duplicate = Array.from(byId.values()).find(existing => String(existing.text || '').trim() === normalized.text.trim() && String(existing.page ?? '') === String(normalized.page ?? ''));
    if (duplicate) return;
    byId.set(normalized.id, normalized);
  });
  return Array.from(byId.values());
}

function _countSafeQuoteAdds(localQuotes, cloudQuotes) {
  const localList = Array.isArray(localQuotes) ? localQuotes : [];
  const cloudList = Array.isArray(cloudQuotes) ? cloudQuotes : [];
  let count = 0;
  cloudList.forEach(quote => {
    if (!quote) return;
    const normalized = String(quote.text || '').trim();
    const page = String(quote.page ?? '');
    const exists = localList.some(existing => {
      if (existing?.id && quote.id && existing.id === quote.id) return true;
      return String(existing?.text || '').trim() === normalized && String(existing?.page ?? '') === page;
    });
    if (!exists) count += 1;
  });
  return count;
}

async function backupToCloud() {
  const firebase = window.LibriqFirebase?.getState?.() || {};
  if (!firebase.user) {
    Utils.toast('Sign in first to use cloud backup.', 'warning');
    return;
  }
  if (!window.LibriqFirebase?.hasFirestore?.()) {
    Utils.toast('Cloud backup is unavailable right now.', 'error');
    return;
  }
  const ok = await window.LibriqCloudBackup?.runBackup?.('manual', false);
  if (ok) {
    try {
      Navigation.renderCurrentPage?.();
    } catch (uiErr) {
      console.warn('[LibriQ] Cloud backup UI refresh failed:', uiErr);
    }
  }
}

async function restoreFromCloud(preloadedDoc = null) {
  const firebase = window.LibriqFirebase?.getState?.() || {};
  if (!firebase.user) {
    Utils.toast('Sign in first to restore from cloud.', 'warning');
    return;
  }
  if (!window.LibriqFirebase?.hasFirestore?.()) {
    Utils.toast('Cloud backup is unavailable right now.', 'error');
    return;
  }

  const currentBooks = Storage.getBooks();
  let docData = preloadedDoc;
  try {
    if (!docData) {
      const snap = await window.LibriqFirebase.readBackupDoc(['users', firebase.user.uid, 'backups', 'current']);
      if (!snap?.exists?.()) {
        Utils.toast('No cloud backup found yet.', 'info');
        return;
      }
      docData = _normalizeCloudBackupDoc(snap.data());
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

  const data = docData.data;
  try {
    restoreInProgress = true;
    window.LibriqCloudBackup?.suppressAutoBackupFor?.(2500);
    Storage.saveBooks((data.books || []).map(book => createBook(book)));
    Storage.saveProfile(data.profile);
    Storage.saveGoals(data.goals);
    Storage.saveStreak?.(data.streak);
  } catch (err) {
    console.error('[Libriq] Cloud restore local replacement failed:', err);
    Utils.toast("Couldn't restore this backup. Your local data was not changed.", 'error');
    restoreInProgress = false;
    return;
  }

  try {
    Storage.replaceActivityLog?.(Array.isArray(data.activity) ? data.activity.slice(-500) : []);
    Storage.saveCloudBackupMeta?.({
      lastCloudBackupAt: docData.updatedAt || new Date().toISOString(),
      bookCount: docData.bookCount ?? data.books.length,
      activityCount: docData.activityCount ?? data.activity.length,
      backupVersion: docData.backupVersion ?? 1,
      appVersion: docData.appVersion || docData.version || LIBRIQ.VERSION,
      deviceId: docData.deviceId || Storage.getDeviceId?.(),
    });
    Storage.addActivityEvent?.(Storage.buildActivityEvent?.('backup_cloud_restored', null, { itemCount: data.books.length, activityCount: data.activity.length }, 'manual'));
  } catch (err) {
    console.warn('[Libriq] Cloud restore post-update failed:', err);
  }

  Utils.toast('Cloud backup restored', 'success');
  try {
    Navigation.updateBadges?.();
    Navigation.renderCurrentPage?.();
  } catch (uiErr) {
    console.warn('[Libriq] Cloud restore UI refresh failed:', uiErr);
  }
  restoreInProgress = false;
}

function promptImportData() {
  document.getElementById('importLibraryInput')?.click();
}

async function importDataFromFile(file) {
  if (!file) return;

  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (err) {
    Utils.toast('That file is not valid JSON.', 'error');
    return;
  }

  if (!parsed || parsed.app !== 'LibriQ' || !parsed.data || !Array.isArray(parsed.data.books)) {
    Utils.toast('That file is not a valid LibriQ backup.', 'error');
    return;
  }

  _openImportPreview(file, parsed);
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
  subtitle.textContent = 'Choose how to apply this backup to your local library.';
  body.innerHTML = `
    <div class="whats-new-list">
      <section class="whats-new-item">
        <div class="whats-new-item-title">Backup details</div>
        <p>Exported: ${exportedAt ? Utils.formatDate(exportedAt) : 'Unknown'}<br>Version: ${Utils.sanitize(backupVersion)}</p>
      </section>
      <section class="whats-new-item">
        <div class="whats-new-item-title">Contents</div>
        <p>${importedBooks.length} book${importedBooks.length === 1 ? '' : 's'} in backup<br>${localBooks.length} current local book${localBooks.length === 1 ? '' : 's'}<br>${importedActivity.length} backup activity event${importedActivity.length === 1 ? '' : 's'}</p>
      </section>
      <section class="whats-new-item">
        <div class="whats-new-item-title">What happens next</div>
        <p>Replace swaps your local library with the backup. Merge keeps your current data and combines obvious duplicates safely.</p>
      </section>
    </div>
  `;

  const cleanup = () => {
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
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
  };

  const runImport = (replaceMode) => {
    cleanup();
    _applyImportedBackup(parsed, replaceMode);
  };

  replace.textContent = 'Replace local library';
  merge.textContent = 'Merge with current library';
  cancel.textContent = 'Cancel';
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  replace.onclick = () => runImport(true);
  merge.onclick = () => runImport(false);
  cancel.onclick = cleanup;
  close.onclick = cleanup;
  modal.onclick = (e) => { if (e.target === modal) cleanup(); };
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

  Utils.toast(replaceMode ? 'Library replaced from backup' : 'Library merged from backup', 'success');
  try {
    Navigation.updateBadges?.();
    Navigation.renderCurrentPage?.();
  } catch (uiErr) {
    console.warn('[Libriq] Import UI refresh failed:', uiErr);
  }
}

function _mergeBooksForImport(currentBooks, importedBooks) {
  const current = Array.isArray(currentBooks) ? currentBooks : [];
  const imported = Array.isArray(importedBooks) ? importedBooks : [];
  const result = current.map(book => ({ ...book }));
  const indexById = new Map(result.map((book, index) => [book.id, index]));
  const isbnIndex = new Map();
  const titleIndex = new Map();

  result.forEach((book, index) => {
    if (book?.isbn) isbnIndex.set(String(book.isbn).trim(), index);
    titleIndex.set(_bookMergeKey(book), index);
  });

  imported.forEach(rawBook => {
    const book = createBook(rawBook);
    let matchIndex = null;
    const isbnKey = book.isbn ? String(book.isbn).trim() : '';
    if (book.id && indexById.has(book.id)) {
      matchIndex = indexById.get(book.id);
    } else if (isbnKey && isbnIndex.has(isbnKey)) {
      matchIndex = isbnIndex.get(isbnKey);
    } else if (titleIndex.has(_bookMergeKey(book))) {
      matchIndex = titleIndex.get(_bookMergeKey(book));
    }

    if (matchIndex === null || matchIndex === undefined) {
      const cloned = { ...book };
      result.push(cloned);
      indexById.set(cloned.id, result.length - 1);
      if (cloned.isbn) isbnIndex.set(String(cloned.isbn).trim(), result.length - 1);
      titleIndex.set(_bookMergeKey(cloned), result.length - 1);
      return;
    }

    const currentBook = result[matchIndex];
    result[matchIndex] = _mergeBookRecords(currentBook, book);
    indexById.set(result[matchIndex].id, matchIndex);
    if (result[matchIndex].isbn) isbnIndex.set(String(result[matchIndex].isbn).trim(), matchIndex);
    titleIndex.set(_bookMergeKey(result[matchIndex]), matchIndex);
  });

  return result;
}

function _bookMergeKey(book) {
  return `${_normalizeMergeText(book?.title)}|${_normalizeMergeText(book?.author)}`;
}

function _normalizeMergeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function _getReliableBookTime(book) {
  const candidates = [book?.notesUpdatedAt, book?.dateFinished, book?.dateStarted, book?.dateAdded];
  for (const value of candidates) {
    const time = new Date(value || 0).getTime();
    if (Number.isFinite(time) && time > 0) return time;
  }
  return 0;
}

function _mergeBookRecords(currentBook, importedBook) {
  const current = currentBook || {};
  const incoming = importedBook || {};
  const currentTime = _getReliableBookTime(current);
  const incomingTime = _getReliableBookTime(incoming);
  const preferIncoming = incomingTime > 0 && currentTime > 0 ? incomingTime > currentTime : false;
  const base = preferIncoming ? { ...current, ...incoming } : { ...incoming, ...current };

  const mergedTags = Array.from(new Set([...(current.tags || []), ...(incoming.tags || [])].map(tag => String(tag || '').trim()).filter(Boolean)));
  const mergedGenres = Array.from(new Set([...(current.genres || []), ...(incoming.genres || [])].map(genre => String(genre || '').trim()).filter(Boolean)));
  const mergedQuotes = _mergeQuotes(current.quotes, incoming.quotes);

  const notes = typeof current.notes === 'string' ? current.notes.trim() : '';
  const importedNotes = typeof incoming.notes === 'string' ? incoming.notes.trim() : '';
  const keepNotes = notes || importedNotes;

  const merged = {
    ...base,
    id: current.id || incoming.id || crypto.randomUUID(),
    tags: mergedTags,
    genres: mergedGenres,
    notes: notes || importedNotes || '',
    notesUpdatedAt: notes ? (current.notesUpdatedAt || incoming.notesUpdatedAt || null) : (incoming.notesUpdatedAt || current.notesUpdatedAt || null),
    status: _preferStatus(current.status, incoming.status),
    currentPage: _preferNumeric(current.currentPage, incoming.currentPage),
    rating: _preferRating(current.rating, incoming.rating),
    dateAdded: current.dateAdded || incoming.dateAdded || new Date().toISOString(),
    dateStarted: current.dateStarted || incoming.dateStarted || null,
    dateFinished: current.dateFinished || incoming.dateFinished || null,
    quotes: mergedQuotes,
  };

  if (!keepNotes) merged.notes = '';
  return merged;
}

function _mergeQuotes(currentQuotes, incomingQuotes) {
  const byId = new Map();
  (Array.isArray(currentQuotes) ? currentQuotes : []).forEach(quote => {
    if (!quote?.id) return;
    byId.set(quote.id, {
      id: quote.id,
      text: String(quote.text || ''),
      page: quote.page ?? null,
      note: quote.note ?? '',
      createdAt: quote.createdAt || new Date().toISOString(),
      updatedAt: quote.updatedAt || quote.createdAt || new Date().toISOString(),
    });
  });
  (Array.isArray(incomingQuotes) ? incomingQuotes : []).forEach(quote => {
    if (!quote?.id) return;
    const normalized = {
      id: quote.id,
      text: String(quote.text || ''),
      page: quote.page ?? null,
      note: quote.note ?? '',
      createdAt: quote.createdAt || new Date().toISOString(),
      updatedAt: quote.updatedAt || quote.createdAt || new Date().toISOString(),
    };
    const existing = byId.get(quote.id);
    if (!existing) {
      byId.set(quote.id, normalized);
      return;
    }
    const existingTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
    const incomingTime = new Date(normalized.updatedAt || normalized.createdAt || 0).getTime();
    byId.set(quote.id, incomingTime > existingTime ? normalized : existing);
  });
  return Array.from(byId.values());
}

function _preferNumeric(currentValue, incomingValue) {
  const currentNum = Number(currentValue);
  const incomingNum = Number(incomingValue);
  if (Number.isFinite(currentNum) && Number.isFinite(incomingNum)) {
    return Math.max(currentNum, incomingNum);
  }
  return Number.isFinite(currentNum) ? currentNum : (Number.isFinite(incomingNum) ? incomingNum : 0);
}

function _preferRating(currentValue, incomingValue) {
  const currentNum = Number(currentValue);
  const incomingNum = Number(incomingValue);
  if (Number.isFinite(currentNum) && Number.isFinite(incomingNum)) {
    return Math.max(currentNum, incomingNum);
  }
  if (Number.isFinite(currentNum)) return currentNum;
  if (Number.isFinite(incomingNum)) return incomingNum;
  return null;
}

function _preferStatus(currentStatus, incomingStatus) {
  const current = currentStatus || LIBRIQ.STATUS.WISHLIST;
  const incoming = incomingStatus || LIBRIQ.STATUS.WISHLIST;
  const rank = { finished: 3, reading: 2, wishlist: 1, dnf: 0 };
  return rank[current] >= rank[incoming] ? current : incoming;
}

function _mergeActivityById(currentEvents, importedEvents) {
  const byId = new Map();
  (currentEvents || []).forEach(event => {
    if (event?.id) byId.set(event.id, event);
  });
  (importedEvents || []).forEach(event => {
    if (event?.id) byId.set(event.id, event);
  });
  return Array.from(byId.values()).sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
}

function _dangerConfirmElements() {
  return {
    modal: document.getElementById('dangerConfirmModal'),
    title: document.getElementById('dangerConfirmTitle'),
    body: document.getElementById('dangerConfirmBody'),
    bodyCopy: document.getElementById('dangerConfirmBodyCopy'),
    prompt: document.getElementById('dangerConfirmPrompt'),
    input: document.getElementById('dangerConfirmInput'),
    action: document.getElementById('dangerConfirmAction'),
    cancel: document.getElementById('dangerConfirmCancel'),
    close: document.getElementById('closeDangerConfirm'),
    error: document.getElementById('dangerConfirmError'),
  };
}

function confirmDangerAction({ title, body, prompt, expected, actionLabel }) {
  return new Promise((resolve) => {
    const els = _dangerConfirmElements();
    if (!els.modal || !els.title || !els.body || !els.bodyCopy || !els.prompt || !els.input || !els.action || !els.cancel || !els.close || !els.error) {
      console.error('[Libriq] Danger modal unavailable for confirmation dialog:', title);
      resolve(false);
      return;
    }
    els.title.textContent = title;
    els.bodyCopy.textContent = body;
    els.prompt.textContent = prompt;
    els.error.hidden = true;
    els.error.textContent = '';
    els.input.value = '';
    els.input.placeholder = prompt;
    els.action.textContent = actionLabel;
    els.action.disabled = true;
    const cleanup = (result = false) => {
      els.modal.setAttribute('hidden', '');
      document.body.style.overflow = '';
      els.input.oninput = null;
      window.removeEventListener('keydown', onKeyDown);
      els.cancel.onclick = null;
      els.close.onclick = null;
      els.action.onclick = null;
      els.modal.onclick = null;
      resolve(result);
    };
    els.input.oninput = () => {
      els.error.hidden = true;
      els.action.disabled = els.input.value.trim() !== expected;
    };
    els.cancel.onclick = () => cleanup(false);
    els.close.onclick = () => cleanup(false);
    els.action.onclick = async () => {
      try {
        if (els.input.value.trim() !== expected) return;
        cleanup(true);
      } catch (err) {
        console.warn('[Libriq] Danger action failed:', err);
        els.error.textContent = 'Something went wrong. Please try again.';
        els.error.hidden = false;
        els.action.disabled = false;
      }
    };
    els.modal.onclick = (e) => {
      if (e.target === els.modal) cleanup(false);
    };
    function onKeyDown(e) {
      if (e.key === 'Escape' && !els.modal.hasAttribute('hidden')) cleanup(false);
    }
    window.addEventListener('keydown', onKeyDown);
    els.modal.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => els.input.focus(), 50);
  });
}

async function clearLocalCache() {
  const confirmed = await confirmDangerAction({
    title: 'Clear local cache?',
    body: 'This will remove this device\'s local cache only. It will not delete your cloud library or account.',
    prompt: 'Type CLEAR CACHE to continue',
    expected: 'CLEAR CACHE',
    actionLabel: 'Clear cache',
  });
  if (!confirmed) return;
  const firebase = window.LibriqFirebase?.getState?.() || {};
  if (firebase.user?.uid) {
    Storage.clearAccountScopedData?.(firebase.user.uid, { keys: ['BOOKS', 'ACTIVITY', 'STREAK', 'GOALS', 'BACKUP', 'CLOUD_BACKUP', 'SYNC_META', 'SYNC_TOMBSTONES'] });
  }
  Utils.toast('Local cache cleared.', 'info');
  Navigation.renderCurrentPage?.();
  Navigation.updateBadges?.();
}

async function confirmDeleteLibraryData() {
  const firebase = window.LibriqFirebase?.getState?.() || {};
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
    await window.LibriqFirebase.deleteCurrentUserLibraryData?.();
    Storage.clearAccountScopedData?.(firebase.user.uid, { keys: ['BOOKS', 'ACTIVITY', 'STREAK', 'GOALS', 'BACKUP', 'CLOUD_BACKUP', 'SYNC_META', 'SYNC_TOMBSTONES'] });
    Navigation.updateBadges?.();
    Navigation.renderCurrentPage?.();
    Utils.toast('Library data deleted.', 'success');
  } catch (err) {
    console.warn('[Libriq] Delete library data failed:', err);
    Utils.toast('Could not delete library data right now.', 'error');
  }
}

async function confirmDeleteAccount() {
  const firebase = window.LibriqFirebase?.getState?.() || {};
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
    await window.LibriqFirebase.deleteCurrentUserAccount?.();
    Storage.clearAccountScopedData?.(firebase.user.uid, { keys: ['BOOKS', 'ACTIVITY', 'PROFILE', 'STREAK', 'GOALS', 'BACKUP', 'CLOUD_BACKUP', 'SYNC_META', 'SYNC_TOMBSTONES'] });
    Storage.clearActiveAccountScope?.();
    Navigation.goTo('session');
    Utils.toast('Account deleted.', 'success');
  } catch (err) {
    const code = String(err?.code || '');
    if (code.includes('requires-recent-login')) {
      Utils.toast('For security, please sign in again before deleting your account.', 'warning');
    } else {
      console.warn('[Libriq] Delete account failed:', err);
      Utils.toast('Could not delete your account right now.', 'error');
    }
  }
}

function clearAllData() {
  return clearLocalCache();
}

function renderActivityPage() {
  const main = document.getElementById('mainContent');
  const events = Storage.getActivityLog?.() || [];
  const state = _getActivityState();
  const filtered = _filterActivityEvents(events, state.filter);
  const grouped = _groupActivityByDate(filtered);

  main.innerHTML = `
    <div class="page" id="activityPage">
      <div class="page-header library-header activity-header">
        <div class="library-heading">
          <span class="library-eyebrow">Reading history</span>
          <h1 class="page-title">Activity</h1>
          <p class="page-subtitle">${filtered.length} event${filtered.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div class="chip-group library-filters" id="activityFilters">
        ${_buildActivityFilterChip('all', 'All', events.length, state.filter)}
        ${_buildActivityFilterChip('books', 'Books', _countActivityEvents(events, ['book_added','manual_book_added','status_changed','progress_updated','book_finished','rating_updated','favorite_added','favorite_removed']), state.filter)}
        ${_buildActivityFilterChip('progress', 'Progress', _countActivityEvents(events, ['status_changed','progress_updated','book_finished']), state.filter)}
        ${_buildActivityFilterChip('notes', 'Notes', _countActivityEvents(events, ['note_saved','note_cleared']), state.filter)}
        ${_buildActivityFilterChip('backups', 'Backups', _countActivityEvents(events, ['backup_exported','backup_imported']), state.filter)}
        ${_buildActivityFilterChip('metadata', 'Metadata', _countActivityEvents(events, ['metadata_refreshed']), state.filter)}
      </div>

      <div class="activity-history">
        ${grouped.length ? grouped.map(group => `
          <section class="activity-day-group">
            <div class="activity-day-label">${Utils.sanitize(group.label)}</div>
            <div class="activity-list">
              ${group.items.map(buildActivityItem).join('')}
            </div>
          </section>
        `).join('') : buildActivityEmptyState(state.filter)}
      </div>
    </div>`;

  document.getElementById('activityFilters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    _setActivityState({ filter: btn.dataset.filter });
    renderActivityPage();
  });
}

function _getActivityState() {
  return {
    filter: sessionStorage.getItem('libriq_activity_filter') || 'all',
  };
}

function _setActivityState(updates) {
  if ('filter' in updates) sessionStorage.setItem('libriq_activity_filter', updates.filter);
}

function _buildActivityFilterChip(key, label, count, active) {
  return `<button class="chip activity-chip ${active === key ? 'active' : ''}" data-filter="${key}">${label} <span class="activity-chip-count">${count}</span></button>`;
}

function _filterActivityEvents(events, filter) {
  const map = {
    books: ['book_added','manual_book_added','status_changed','progress_updated','book_finished','rating_updated','favorite_added','favorite_removed'],
    progress: ['status_changed','progress_updated','book_finished'],
    notes: ['note_saved','note_cleared'],
    backups: ['backup_exported','backup_imported'],
    metadata: ['metadata_refreshed'],
  };
  const list = Array.isArray(events) ? events.slice() : [];
  if (!map[filter]) return list.sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));
  return list.filter(event => map[filter].includes(String(event.type || '')))
    .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0));
}

function _countActivityEvents(events, types) {
  return (events || []).filter(event => types.includes(event.type)).length;
}

function _groupActivityByDate(events) {
  const groups = new Map();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  (events || []).forEach(event => {
    const key = new Date(event.timestamp || event.createdAt || Date.now()).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });

  return Array.from(groups.entries()).map(([key, items]) => ({
    label: key === today ? 'Today' : key === yesterday ? 'Yesterday' : new Date(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    items: items.map(_normalizeActivityForView),
  }));
}

function _normalizeActivityForView(event) {
  const iconMap = {
    book_added: ['Added book', 'ph-bookmark', 'var(--accent-dim)', 'var(--accent)'],
    manual_book_added: ['Added manually', 'ph-pencil', 'var(--accent-dim)', 'var(--accent)'],
    status_changed: ['Status changed', 'ph-arrows-left-right', 'var(--color-info-dim)', 'var(--color-info)'],
    progress_updated: ['Progress updated', 'ph-book-open', 'var(--color-info-dim)', 'var(--color-info)'],
    book_finished: ['Finished book', 'ph-check-circle', 'var(--color-success-dim)', 'var(--color-success)'],
    rating_updated: ['Rating updated', 'ph-star', 'var(--color-warning-dim)', 'var(--color-warning)'],
    favorite_added: ['Added to favorites', 'ph-heart', 'var(--color-danger-dim)', 'var(--color-danger)'],
    favorite_removed: ['Removed from favorites', 'ph-heart', 'var(--color-danger-dim)', 'var(--color-danger)'],
    note_saved: ['Note saved', 'ph-notebook', 'var(--color-info-dim)', 'var(--color-info)'],
    note_cleared: ['Note cleared', 'ph-eraser', 'var(--color-neutral-dim)', 'var(--text-tertiary)'],
    quote_saved: ['Quote saved', 'ph-quote', 'var(--color-info-dim)', 'var(--color-info)'],
    quote_updated: ['Quote updated', 'ph-quote', 'var(--color-warning-dim)', 'var(--color-warning)'],
    quote_deleted: ['Quote deleted', 'ph-quote', 'var(--color-neutral-dim)', 'var(--text-tertiary)'],
    metadata_refreshed: ['Metadata refreshed', 'ph-arrow-clockwise', 'var(--color-info-dim)', 'var(--color-info)'],
    backup_exported: ['Backup exported', 'ph-download-simple', 'var(--accent-dim)', 'var(--accent)'],
    backup_imported: ['Backup imported', 'ph-upload-simple', 'var(--accent-dim)', 'var(--accent)'],
  };
  const entry = iconMap[event.type] || ['Activity', 'ph-bell', 'var(--color-neutral-dim)', 'var(--text-tertiary)'];
  const statusLabel = String(event.payload?.status || '').toLowerCase();

  return {
    ...event,
    title: event.bookTitle || 'Unknown title',
    subtitle: event.bookAuthor || '',
    label: entry[0],
    icon: entry[1],
    iconBg: entry[2],
    iconColor: entry[3],
    payloadText: _getActivityDetailText(event, statusLabel),
    date: event.timestamp || event.createdAt,
  };
}

function buildActivityEmptyState(filter) {
  const messages = {
    all: ['Nothing here yet', 'Reading updates, book changes, notes, and sync events will appear here as you use LibriQ.'],
    books: ['No book activity yet', 'Add or update a book to see it here.'],
    progress: ['No progress updates yet', 'Track a reading session or finish a book to populate this view.'],
    notes: ['No notes activity yet', 'Save or clear a note to see it here.'],
    backups: ['No backup activity yet', 'Export or import a backup to track it here.'],
    metadata: ['No metadata refreshes yet', 'Refresh a book’s metadata to record it here.'],
  };
  const [title, body] = messages[filter] || messages.all;
  return `
    <div class="empty-state activity-empty-state" style="grid-column: 1 / -1;">
      <div class="empty-state-icon"><i class="ph ph-clock-counter-clockwise"></i></div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-body">${body}</div>
      <div style="display:flex; gap: var(--space-2); flex-wrap: wrap; justify-content: center;">
        <button class="btn btn-secondary btn-sm" onclick="Navigation.goTo('library')">
          <i class="ph ph-books"></i> Library
        </button>
        <button class="btn btn-primary btn-sm" onclick="Search.open()">
          <i class="ph ph-magnifying-glass"></i> Search Books
        </button>
      </div>
    </div>`;
}

function _formatActivityMeta(event) {
  return event.payloadText || event.label || '';
}

function _formatActivityTime(date) {
  return Utils.timeAgo(date);
}

function buildActivityItem(activity) {
  return `
    <article class="activity-item activity-row">
      <div class="activity-timeline-dot"></div>
      <div class="activity-icon activity-icon--${activity.type}" style="background:${activity.iconBg}; color:${activity.iconColor}">
        <i class="ph ${activity.icon}"></i>
      </div>
      <div class="activity-content">
        <div class="activity-title-row">
          <div class="activity-title">${Utils.sanitize(activity.title)}</div>
          <div class="activity-time">${_formatActivityTime(activity.date)}</div>
        </div>
        <div class="activity-subtitle">${Utils.sanitize(_formatActivityMeta(activity) || activity.subtitle || '')}</div>
      </div>
    </article>`;
}

function _getActivityDetailText(event, statusLabel) {
  const rating = event?.payload?.rating;
  if (event.type === 'status_changed' && statusLabel === 'finished') return 'Status updated to Finished';
  if (event.type === 'book_finished') return 'Marked as finished';
  if (event.type === 'progress_updated') return 'Progress updated';
  if (event.type === 'metadata_refreshed') return 'Metadata refreshed';
  if (event.type === 'favorite_added') return 'Added to favorites';
  if (event.type === 'favorite_removed') return 'Removed from favorites';
  if (event.type === 'note_saved') return 'Note saved';
  if (event.type === 'note_cleared') return 'Note cleared';
  if (event.type === 'backup_exported') return 'Backup exported';
  if (event.type === 'backup_imported') return 'Backup imported';
  if (event.type === 'rating_updated' && rating !== undefined && rating !== null) return `Rating updated to ${rating}/5`;
  if (event.type === 'status_changed' && statusLabel) return `Status updated to ${Utils.capitalize(statusLabel)}`;
  return '';
}

function buildRatedBookRow(book, rank) {
  return `
    <div class="rated-book-row">
      <div class="rated-book-rank">${rank}</div>
      ${Utils.buildCover(book, 'cover-sm')}
      <div class="rated-book-info">
        <div class="rated-book-title">${Utils.sanitize(book.title)}</div>
        <div class="rated-book-author">${Utils.sanitize(book.author)}</div>
        <div class="rated-book-rating">
          ${Utils.buildStars(book.rating, false)}
          <span>${book.rating}/5</span>
        </div>
      </div>
    </div>`;
}

function buildPagesChart(monthlyPages) {
  const data = Array.isArray(monthlyPages) ? monthlyPages : [];
  const max = Math.max(...data, 1);
  const currentMonth = new Date().getMonth();
  const hasData = data.some(val => val > 0);

  if (!hasData) {
    return `
      <div class="stats-empty-state">
        <div class="empty-state-icon"><i class="ph ph-chart-line-up"></i></div>
        <div class="empty-state-title">Not enough data yet</div>
        <div class="empty-state-body">Pages per month will appear after a few finished books with page counts.</div>
      </div>`;
  }

  return `
    <div class="monthly-chart monthly-chart-pages">
      ${LIBRIQ.MONTHS.map((m, i) => {
        const val = data[i] || 0;
        const pct = Math.round((val / max) * 100);
        const isCurrent = i === currentMonth;
        return `
          <div class="chart-bar-wrap" data-tooltip="${Utils.formatNumber(val)} pages in ${m}">
            <div class="chart-bar ${isCurrent ? 'current' : ''} chart-bar-pages"
                 style="height: ${Math.max(pct, 0)}%"></div>
            <div class="chart-bar-label">${m}</div>
          </div>`;
      }).join('')}
    </div>`;
}

