import { BookAPI } from './api/index.js';
import { LIBRIQ, createBook } from './data.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { Library } from './library.js';
import { Search } from './search.js';
import { Dashboard } from './dashboard.js';
import { buildMonthlyChart, buildGenreRow } from './dashboard.js';
import { LibriqFirebase } from './firebase-client.js';
import { LibriqCloudBackup } from './cloudBackup.js';
import { Router } from './app/router.js';
import { createDashboardPage } from './features/dashboard/dashboardPage.js';
import { createLibraryPage } from './features/library/libraryPage.js';
import { createActivityPage } from './features/activity/activityPage.js';
import { createHelpPage } from './features/help/helpPage.js';
import { createGoalsPage } from './features/goals/goalsPage.js';
import { createLibraryShelvesPage } from './features/library/libraryShelvesPage.js';
import { createStatisticsPage } from './features/statistics/statisticsPage.js';
import { createSettingsPage } from './features/settings/settingsPage.js';
import { createRecommendationsPage } from './features/recommendations/recommendationsPage.js';
import { createProfilePage } from './features/profile/profilePage.js';
import { createKindleImportPage } from './features/kindleImport/kindleImportPage.js';
import { createGoodreadsImportPage } from './features/goodreadsImport/goodreadsImportPage.js';
import { createQuotesPage } from './features/quotes/quotesPage.js';
import { parseKindleClippings } from './services/kindleClippingsParser.js';
import { createKindleImportService } from './services/kindleImportService.js';
import { createKindleQuoteImport } from './services/kindleQuoteImport.js';
import { parseGoodreadsCsv } from './services/goodreadsCsvParser.js';
import { createGoodreadsImportService } from './services/goodreadsImportService.js';
import { executeGoodreadsImport } from './services/goodreadsImportExecution.js';
import { applyNavigationChrome, initializeNavigationChrome } from './navigationChrome.js';
import { MIN_PASSWORD_LENGTH } from './shared/passwordPolicy.js';
import { STORAGE_KEYS } from './shared/storageKeys.js';
import { ProductEvents } from './shared/productEvents.js';
import { openCloudRestorePreview, openCloudMergePreview, confirmAndRestoreCloud, exportData, backupToCloud, promptImportData, importDataFromFile, clearLocalCache, signOutAndRemoveDeviceData, confirmDeleteLibraryData, confirmDeleteAccount, clearAllData, summarizeLibrary } from './features/settings/accountData.js';
import { renderSessionChoicePage, getDisplayNameForAccount, _friendlyAuthMessage } from './features/session/sessionPage.js';

export function completeGoodreadsImport({ previewResult, storage, toast, rerender } = {}) {
  const result = executeGoodreadsImport({
    importPlan: previewResult?.importPlan,
    storage,
    mergeMatched: true,
  });
  toast?.(`Goodreads import complete: ${result.booksCreated} books added, ${result.booksMatched} books updated.`, 'success');
  ProductEvents.track('import_goodreads');
  storage?.updateOnboarding?.({ imported: true });
  rerender?.();
  return result;
}

function executeKindleImport({ previewResult, storage } = {}) {
  if (!storage || typeof storage.updateBook !== 'function' || typeof storage.addBook !== 'function') {
    throw new TypeError('executeKindleImport requires Storage book APIs.');
  }
  const importPlan = previewResult?.importPlan || {};
  const quoteImportPlan = previewResult?.quoteImportPlan || {};
  const matchedBooks = Array.isArray(quoteImportPlan.matchedBooks) ? quoteImportPlan.matchedBooks : [];
  const booksToCreate = Array.isArray(quoteImportPlan.booksToCreate) ? quoteImportPlan.booksToCreate : [];
  let booksMatched = 0;
  let booksCreated = 0;

  for (const item of matchedBooks) {
    const bookId = String(item?.bookId || '').trim();
    if (!bookId) continue;
    const current = storage.getBookById?.(bookId);
    if (!current) continue;
    const quotes = mergeQuoteRecords(current.quotes, item.quotes);
    if (storage.updateBook(bookId, { quotes })) booksMatched += 1;
  }

  for (const item of booksToCreate) {
    if (!item?.candidateBook) continue;
    const candidateBook = { ...item.candidateBook, quotes: cloneQuotes(item.quotes) };
    if (storage.addBook(candidateBook)) booksCreated += 1;
  }

  const result = {
    booksCreated,
    booksMatched,
    quotesImported: Number(quoteImportPlan.importedQuotes) || 0,
    duplicatesSkipped: Number(quoteImportPlan.skippedQuotes) || 0,
    highlightsImported: Number(importPlan.totalHighlights) || 0,
    notesImported: Number(importPlan.totalNotes) || 0,
  };
  if ((booksCreated || booksMatched || result.quotesImported) && typeof storage.buildActivityEvent === 'function' && typeof storage.addActivityEvent === 'function') {
    const event = storage.buildActivityEvent('kindle_imported', null, result, 'import');
    if (event) storage.addActivityEvent(event);
  }
  return result;
}

export function completeKindleImport({ previewResult, storage, toast, rerender } = {}) {
  const result = executeKindleImport({ previewResult, storage });
  toast?.(`Kindle import complete: ${result.booksCreated} books created, ${result.booksMatched} books matched, ${result.quotesImported} quotes imported, ${result.duplicatesSkipped} duplicates skipped.`, 'success');
  ProductEvents.track('import_kindle');
  storage?.updateOnboarding?.({ imported: true });
  rerender?.();
  return result;
}

function cloneQuotes(quotes) {
  return (Array.isArray(quotes) ? quotes : []).map(quote => ({ ...quote }));
}

function mergeQuoteRecords(currentQuotes, plannedQuotes) {
  const merged = cloneQuotes(currentQuotes);
  const identities = new Set(merged.map(quoteRecordIdentity));
  for (const quote of cloneQuotes(plannedQuotes)) {
    const identity = quoteRecordIdentity(quote);
    if (identities.has(identity)) continue;
    merged.push(quote);
    identities.add(identity);
  }
  return merged;
}

function quoteRecordIdentity(quote) {
  const id = String(quote?.id || '').trim();
  if (id) return `id:${id}`;
  return `quote:${String(quote?.text || '')}\u0000${String(quote?.note || '')}\u0000${String(quote?.page ?? '')}`;
}

let profileFeature;
export const Navigation = (() => {
  let _currentPage = 'dashboard';
  const SESSION_PREF_KEY = STORAGE_KEYS.SESSION_PREF;
  const SESSION_MODE_KEY = STORAGE_KEYS.SESSION_MODE;
  const PREFERRED_SESSION_MODE_KEY = STORAGE_KEYS.PREFERRED_SESSION_MODE;
  const DEBUG_SYNC = () => localStorage.getItem(STORAGE_KEYS.DEBUG_SYNC) === '1';
  let _lastAuthUid = null;
  let initialized = false;

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

  function isConfirmedSignedOut(firebase = LibriqFirebase.getState()) {
    return Boolean(firebase.ready && !firebase.user && firebase.signedOutConfirmed && !firebase.restoringSession);
  }

  function shouldRenderSessionScreen(firebase = LibriqFirebase.getState()) {
    if (!firebase.ready) return false;
    if (firebase.user || firebase.restoringSession) return false;
    return Boolean(firebase.signedOutConfirmed);
  }

  function getSessionScreenSuppressionReason(firebase = LibriqFirebase.getState()) {
    if (!firebase.ready) return 'auth not ready';
    if (firebase.user) return 'signed-in user exists';
    if (firebase.restoringSession) return 'restoring session';
    if (!firebase.signedOutConfirmed) return 'signed out not confirmed';
    return 'confirmed signed out';
  }

  function setEmailAuthMode(mode) {
    const nextMode = mode === 'signup' ? 'signup' : mode === 'reset' ? 'reset' : 'signin';
    const form = document.getElementById('emailAuthForm');
    const password = document.getElementById('sessionPasswordInput');
    const submit = document.getElementById('emailAuthSubmit');
    const forgot = document.getElementById('forgotPasswordLink');
    const resetMode = document.getElementById('sessionResetMode');
    const signinMode = document.getElementById('sessionSigninMode');
    const title = document.getElementById('sessionAuthTitle');
    const copy = document.getElementById('sessionAuthCopy');
    const passwordHelp = document.getElementById('sessionPasswordHelp');
    form?.setAttribute('data-auth-mode', nextMode);
    form?.setAttribute('aria-labelledby', nextMode === 'signup' ? 'sessionSignupTab' : 'sessionSigninTab');
    password?.setAttribute('autocomplete', nextMode === 'signup' ? 'new-password' : 'current-password');
    if (nextMode === 'signup') {
      password?.setAttribute('minlength', String(MIN_PASSWORD_LENGTH));
      password?.setAttribute('aria-describedby', 'sessionPasswordHelp');
    } else {
      password?.removeAttribute('minlength');
      password?.removeAttribute('aria-describedby');
    }
    if (title) title.textContent = nextMode === 'signup' ? 'Make room for your next chapter.' : nextMode === 'reset' ? 'Find your way back.' : 'Welcome back, reader.';
    if (copy) copy.textContent = nextMode === 'signup' ? 'Create a private space for your books, notes, and reading progress.' : nextMode === 'reset' ? 'We’ll send a reset link to your account email.' : 'Sign in to pick up where you left off.';
    if (passwordHelp) passwordHelp.hidden = nextMode !== 'signup';
    if (submit) {
      const label = submit.querySelector('span');
      if (label) label.textContent = nextMode === 'signup' ? 'Create account' : 'Sign in with Email';
    }
    if (signinMode) signinMode.hidden = nextMode === 'reset';
    if (resetMode) resetMode.hidden = nextMode !== 'reset';
    if (forgot) forgot.hidden = nextMode !== 'signin';
    Utils.$$('.session-auth-tab').forEach(btn => {
      const active = btn.dataset.authMode === nextMode || (nextMode === 'reset' && btn.dataset.authMode === 'signin');
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.tabIndex = active ? 0 : -1;
    });
    return nextMode;
  }

  const featureActions = {
    navigate: (page) => goTo(page),
    openSearch: () => Search.open(),
    openManualEntry: () => Search.openManualEntry(),
    importBackup: () => promptImportData(),
    dismissOnboarding: () => Storage.updateOnboarding({ dismissed: true }),
    clearSearch: () => libraryFeature.clearSearch(),
    showBookDetails: (bookId) => Library.showDetailsModal(bookId),
    updateProgress: (bookId) => Library.showProgressModal(bookId),
    toggleFavorite: (bookId) => {
      Library.toggleFavorite(bookId);
      updateBadges();
      renderCurrentPage();
    },
    removeBook: (bookId) => {
      const book = Storage.getBookById(bookId);
      Library.removeBook(bookId, book?.title || 'this book');
    },
    setGoalPreset: (input, yearly) => {
      if (input) input.value = yearly;
    },
    refreshGoals: () => goalsFeature(),
    getLibraryState: () => libraryFeature.getState(),
    buildMonthlyChart,
    buildGenreRow,
    isOnline: () => globalThis.navigator?.onLine !== false,
    getFirebaseState: () => LibriqFirebase.getState(),
    getCurrentUser: () => LibriqFirebase.getCurrentUser(),
    openGoodreadsImport: () => goodreadsImportFeature.open(),
  };
  const settingsActions = {
    ...featureActions,
    getActiveTheme: () => Navigation.getActiveTheme?.(),
    getSessionPreference: () => Navigation.getSessionPreference?.(),
    getFirebaseState: () => LibriqFirebase.getState(),
    getUserEmailAuthInfo: user => LibriqFirebase.getUserEmailAuthInfo(user),
    getCurrentUser: () => LibriqFirebase.getCurrentUser(),
    hasFirestore: () => LibriqFirebase.hasFirestore(),
    getCloudBackupState: () => LibriqCloudBackup.getState(),
    formatLastSavedLabel: value => LibriqCloudBackup.formatLastSavedLabel(value),
    getSyncState: () => window.LibriqSyncBeta?.getState?.(),
    getDisplayName: user => getDisplayNameForAccount(user),
    toggleTheme: () => Navigation.toggleTheme(),
    exportData: () => exportData(),
    promptImportData: () => promptImportData(),
    openGoodreadsImport: () => goodreadsImportFeature.open(),
    openKindleImport: () => kindleImportFeature.open(),
    importDataFromFile: file => importDataFromFile(file),
    confirmDeleteLibraryData: () => confirmDeleteLibraryData(),
    confirmDeleteAccount: () => confirmDeleteAccount(),
    clearLocalCache: () => clearLocalCache(),
    signOutAndRemoveDeviceData: () => signOutAndRemoveDeviceData(),
    backupToCloud: () => backupToCloud(),
    openCloudRestorePreview: () => openCloudRestorePreview(),
    openCloudMergePreview: () => openCloudMergePreview(),
    accountAction: async action => {
      try {
        if (action === 'signin') await LibriqFirebase.signInWithGoogle();
        else await LibriqFirebase.signOut();
      } catch (err) {
        const code = String(err?.code || err?.message || '');
        const cancelled = code.includes('popup-closed-by-user') || code.includes('popup-blocked');
        Utils.toast(cancelled ? 'Sign-in was cancelled.' : 'Could not update account status right now.', 'error');
      }
    },
    sendVerification: async () => {
      try {
        await LibriqFirebase.sendVerificationEmailToCurrentUser?.();
        Utils.toast('Verification email sent. Check your inbox.', 'success');
        await LibriqFirebase.refreshCurrentUser?.();
        Navigation.renderCurrentPage?.();
      } catch (err) { Utils.toast(_friendlyAuthMessage(err), 'error'); }
    },
    refreshEmailStatus: async () => {
      try {
        await LibriqFirebase.refreshCurrentUser?.();
        Utils.toast('Account status refreshed.', 'info');
        Navigation.renderCurrentPage?.();
      } catch (err) { Utils.toast(_friendlyAuthMessage(err), 'error'); }
    },
    resetPassword: async () => {
      try {
        await LibriqFirebase.sendPasswordResetToEmail?.(LibriqFirebase.getState?.()?.user?.email || '');
        Utils.toast('Password reset email sent if an account exists for that address.', 'success');
      } catch (err) { Utils.toast(_friendlyAuthMessage(err), 'error'); }
    },
    changeEmail: async value => {
      try {
        await LibriqFirebase.requestEmailChange?.(String(value || '').trim());
        Utils.toast('We sent a confirmation link to your new email. Your email will update after you confirm it.', 'success');
      } catch (err) { Utils.toast(_friendlyAuthMessage(err), 'error'); }
    },
    toggleSync: enabled => {
      if (enabled) {
        window.LibriqSyncBeta?.setEnabled?.(false);
        Utils.toast('Account sync turned off', 'info');
        Navigation.renderCurrentPage?.();
        return;
      }
      const firebase = LibriqFirebase.getState();
      if (Navigation.getSessionPreference?.() === 'offline') {
        Utils.toast('Switch to account mode before enabling sync.', 'warning');
        return;
      }
      if (!firebase.user && !LibriqFirebase.getCurrentUser()) {
        Utils.toast('Sign in first to enable sync.', 'warning');
        return;
      }
      if (!firebase.user) firebase.user = LibriqFirebase.getCurrentUser() || null;
      window.LibriqSyncBeta?.setEnabled?.(true);
      Utils.toast('Sync is on. Your books will update across signed-in devices.', 'success');
    },
    refreshSync: () => {
      window.LibriqSyncBeta?.refresh?.();
      Utils.toast('Sync status refreshed', 'info');
      window.setTimeout(() => Navigation.renderCurrentPage?.(), 150);
    },
  };
  const goalsFeature = createGoalsPage({ storage: Storage, utils: Utils, actions: featureActions });
  const libraryFeature = createLibraryPage({ storage: Storage, library: Library, utils: Utils, constants: LIBRIQ, actions: featureActions });
  const libraryShelvesFeature = createLibraryShelvesPage({ storage: Storage, library: Library, utils: Utils, actions: featureActions });
  const statisticsFeature = createStatisticsPage({ storage: Storage, utils: Utils, constants: LIBRIQ, actions: featureActions });
  const quotesFeature = createQuotesPage({ storage: Storage, utils: Utils, actions: featureActions });
  const kindleImportService = createKindleImportService({
    createBook,
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });
  const kindleQuoteImport = createKindleQuoteImport({
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });
  const kindleImportFeature = createKindleImportPage({
    parseClippings: parseKindleClippings,
    buildImportPlan: kindleImportService.buildImportPlan,
    applyKindleImportPlan: kindleQuoteImport.applyKindleImportPlan,
    actions: {
      getExistingBooks: () => Storage.getBooks(),
      continueImport: detail => {
        try {
          return completeKindleImport({
            previewResult: detail,
            storage: Storage,
            toast: (message, type) => Utils.toast(message, type),
            rerender: () => Navigation.renderCurrentPage?.(),
          });
        } catch (error) {
          Utils.toast('Could not import Kindle clippings.', 'error');
          return false;
        }
      },
    },
  });
  const goodreadsImportService = createGoodreadsImportService({
    createBook,
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
    statuses: LIBRIQ.STATUS,
  });
  const goodreadsImportFeature = createGoodreadsImportPage({
    parseCsv: parseGoodreadsCsv,
    buildImportPlan: goodreadsImportService.buildImportPlan,
    executeImport: executeGoodreadsImport,
    actions: {
      getExistingBooks: () => Storage.getBooks(),
      getStorage: () => Storage,
      continueImport: detail => {
        try {
          return completeGoodreadsImport({
            previewResult: detail,
            storage: Storage,
            toast: (message, type) => Utils.toast(message, type),
            rerender: () => {
              Navigation.updateBadges?.();
              Navigation.renderCurrentPage?.();
            },
          });
        } catch (error) {
          Utils.toast('Could not import Goodreads CSV.', 'error');
          return false;
        }
      },
    },
  });
  const settingsFeature = createSettingsPage({ storage: Storage, utils: Utils, constants: LIBRIQ, actions: settingsActions });
  const recommendationsFeature = createRecommendationsPage({ storage: Storage, library: Library, bookApi: BookAPI, utils: Utils, constants: LIBRIQ, actions: featureActions });
  profileFeature = createProfilePage({ storage: Storage, utils: Utils, constants: LIBRIQ, actions: featureActions });

  const pages = {
    abandoned: () => libraryShelvesFeature.renderStatusPage(LIBRIQ.STATUS.DNF),
    boot:      () => renderBootPage(),
    session:   () => renderSessionChoicePage(),
    dashboard: createDashboardPage({ dashboard: Dashboard, actions: featureActions }),
    library:   libraryFeature,
    reading:   () => libraryShelvesFeature.renderStatusPage(LIBRIQ.STATUS.READING,  'Currently Reading', 'ph-book-open'),
    wishlist:  () => libraryShelvesFeature.renderStatusPage(LIBRIQ.STATUS.WISHLIST, 'Want to Read',      'ph-bookmark'),
    finished:  () => libraryShelvesFeature.renderStatusPage(LIBRIQ.STATUS.FINISHED, 'Finished Books',    'ph-check-circle'),
    favorites: () => libraryShelvesFeature.renderFavoritesPage(),
    stats:     statisticsFeature,
    activity:  createActivityPage({ storage: Storage, utils: Utils, actions: featureActions }),
    quotes:    quotesFeature,
    goals:     goalsFeature,
    recommendations: recommendationsFeature,
    help:      createHelpPage({ storage: Storage, actions: featureActions }),
    profile:   profileFeature,
    settings:  settingsFeature,
  };

  const router = new Router({
    root: () => getMainContentRoot('router'),
    initialRoute: _currentPage,
    beforeNavigate: ({ name }) => {
      _currentPage = name;
      applyAuthShellStateForPage(name);
      applyNavigationChrome(name);

      Utils.$$('.nav-item').forEach(el => {
        const active = el.dataset.page === name;
        el.classList.toggle('active', active);
        if (active) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      });
      Utils.$$('.mobile-bottom-item').forEach(el => {
        const tab = el.dataset.tab || el.dataset.page;
        let active = false;
        if (tab === 'dashboard' && name === 'dashboard') active = true;
        else if (tab === 'library' && ['library', 'reading', 'wishlist', 'finished', 'favorites', 'abandoned', 'quotes', 'kindle'].includes(name)) active = true;
        else if (tab === 'stats' && ['stats', 'goals', 'activity'].includes(name)) active = true;
        else if (tab === 'settings' && ['settings', 'profile', 'help'].includes(name)) active = true;
        el.classList.toggle('active', active);
        if (active) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      });
      closeMobileSidebar();
    },
    afterNavigate: ({ name, previousRoute, root }) => {
      LibriqCloudBackup.refresh();
      if (root) root.scrollTop = 0;
      window.dispatchEvent(new CustomEvent('libriq:page-changed', { detail: { page: name } }));
      syncUrlForRoute(name);
      announceRoute(root, name, _hasNavigated && previousRoute !== name);
      _hasNavigated = true;
    },
    renderError: ({ error, name, root }) => {
      console.error(`[LibriQ] Failed to render ${name} page:`, error);
      if (root) {
        root.innerHTML = `
          <div class="page" id="${name}Page">
            <div class="page-header">
              <h1 class="page-title">${Utils.sanitize(name.charAt(0).toUpperCase() + name.slice(1))}</h1>
              <p class="page-subtitle">This page could not finish rendering.</p>
            </div>
          </div>`;
      }
    },
  }).registerAll(pages);

  let _hasNavigated = false;
  // The descriptive title from index.html; sign-in and boot screens keep it for crawlers.
  const DEFAULT_TITLE = (typeof document !== 'undefined' && document.title) || 'LibriQ';

  // Screen readers get no page-load cue in a single-page app: name the tab after
  // the page and, after the first render, move focus to its heading.
  function announceRoute(root, name, moveFocus) {
    const heading = root?.querySelector?.('h1');
    const text = ['boot', 'session'].includes(name) ? '' : heading?.textContent?.trim();
    document.title = text ? `${text} · LibriQ` : DEFAULT_TITLE;
    if (!moveFocus || !heading) return;
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }

  function syncUrlForRoute(name) {
    if (typeof window === 'undefined' || !window.location || typeof history === 'undefined' || typeof history.replaceState !== 'function') return;
    if (name === 'boot' || name === 'session') return;

    const currentHash = window.location.hash || '';
    if (name === 'dashboard') {
      if (currentHash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return;
    }

    if (name === 'help') {
      if (!currentHash || (!currentHash.startsWith('#help') && !currentHash.startsWith('#help-section-'))) {
        history.replaceState(null, '', window.location.pathname + window.location.search + '#help');
      }
      return;
    }

    const expectedHash = `#${name}`;
    if (currentHash !== expectedHash) {
      history.replaceState(null, '', window.location.pathname + window.location.search + expectedHash);
    }
  }

  function getRouteFromHash(rawHash = (typeof window !== 'undefined' ? window.location?.hash : '')) {
    const hash = String(rawHash || '').replace(/^#\/?/, '').trim();
    if (!hash) return 'dashboard';
    if (hash.startsWith('help-section-') || hash === 'help') return 'help';
    if (hash === 'stats' || hash === 'statistics') return 'stats';
    if (pages[hash]) return hash;
    return 'dashboard';
  }

  function goTo(page) {
    router.navigate(page);
  }

  function renderCurrentPage() {
    applyAuthShellStateForPage(_currentPage);
    router.refresh();
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
    // js/shell-hint.js may have booted inside the app chrome; boot is over.
    if (page !== 'boot') body.classList.remove('app-booting');
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
    const firebase = LibriqFirebase.getState();
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
    sidebar.inert = false;
    sidebar.setAttribute('aria-hidden', 'false');
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    sidebar.querySelector('.nav-item.active')?.focus();
  }

  function closeMobileSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    if (!sidebar || !overlay) return;
    const mobile = globalThis.matchMedia?.('(max-width: 768px)').matches ?? false;
    if (mobile && sidebar.contains(document.activeElement)) document.getElementById('mobileMenuBtn')?.focus();
    sidebar.inert = mobile;
    sidebar.setAttribute('aria-hidden', String(mobile));
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    document.getElementById('mobileMenuBtn')?.setAttribute('aria-expanded', 'false');
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
    if (_currentPage === 'settings') settingsFeature();
  }

  function _updateThemeToggleUI(theme) {
    document.querySelector?.('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#EEF1F6' : '#0B0E14');
    const icon  = document.getElementById('themeIcon');
    const iconDesktop = document.getElementById('themeIconDesktop');
    if (icon)  icon.className   = theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
    if (iconDesktop) iconDesktop.className = theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
    document.getElementById('themeToggle')?.setAttribute('aria-pressed', String(theme === 'dark'));
  }

  function updateDesktopStatusPill() {
    const el = document.getElementById('desktopStatusPill');
    if (!el) return;
    const firebase = LibriqFirebase.getState();
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
    if (initialized) return;
    initialized = true;
    initializeNavigationChrome(() => _currentPage);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && document.getElementById('sidebar')?.classList.contains('open')) closeMobileSidebar();
    });
    Utils.$$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page));
    });

    Utils.$$('.mobile-bottom-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const destination = btn.dataset.tab || btn.dataset.page;
        if (destination) goTo(destination);
      });
    });
    document.getElementById('mobileBottomSearchBtn')?.addEventListener('click', () => {
      Search.open();
    });

    document.getElementById('mobileMenuBtn')?.addEventListener('click', openMobileSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', closeMobileSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('touchstart', closeMobileSidebar, { passive: true });

    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);
    document.getElementById('themeToggleDesktop')?.addEventListener('click', toggleTheme);

    applyTheme();
    updateBadges();
    updateDesktopStatusPill();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('hashchange', () => {
        const target = getRouteFromHash();
        if (target && target !== _currentPage && pages[target]) {
          goTo(target);
        }
      });
    }
    const tryResume = () => {
    const firebase = LibriqFirebase.getState();
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
      const firebase = LibriqFirebase.getState();
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
      if (!firebase.user && firebase.signedOutConfirmed) {
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
      } else if (firebase.restoringSession && firebase.user && _currentPage !== 'session') {
        renderCurrentPage?.();
      } else if (_currentPage === 'settings') {
        settingsFeature();
      } else if (_currentPage === 'profile') {
        profileFeature();
      }
      if (_currentPage === 'session') renderSessionChoicePage();
      LibriqCloudBackup.refresh();
      window.LibriqSyncBeta?.refresh?.();
      updateDesktopStatusPill();
      maybeShowNewDeviceCloudPrompt();
    });
    window.addEventListener('libriq:profile:updated', () => {
      if (_currentPage === 'profile') {
        profileFeature();
      }
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
    clearLibrarySearch: () => libraryFeature.clearSearch(),
    clearLocalCache,
    confirmDeleteLibraryData,
    confirmDeleteAccount,
    setEmailAuthMode,
    shouldRenderSessionScreen,
    getSessionScreenSuppressionReason,
    debugSync,
    isConfirmedSignedOut,
    getRouteFromHash,
    syncUrlForRoute,
    openGoodreadsImport: () => goodreadsImportFeature.open(),
    openKindleImport: () => kindleImportFeature.open(),
    get currentPage() { return _currentPage; },
  };
})();

function renderBootPage() {
  const main = document.getElementById('mainContent');
  if (!main) return;
  main.hidden = false;
  const restoring = LibriqFirebase.getState().restoringSession;
  // index.html already paints this boot screen. Keep that node instead of
  // rebuilding it: a fresh copy counts as a new paint (a late LCP) and
  // shifts the layout while the page looks unchanged.
  const staticBoot = main.querySelector(':scope > .session-page--boot');
  if (staticBoot) {
    [...main.children].forEach(child => { if (child !== staticBoot) child.remove(); });
    const status = staticBoot.querySelector('.session-card-title');
    if (status && restoring) status.textContent = 'Restoring your session';
    return;
  }
  main.innerHTML = `
    <div class="session-page session-page--boot">
      <section class="session-boot-card" aria-labelledby="sessionBootTitle" aria-busy="true">
        <a class="session-brand" href="./" aria-label="LibriQ home">
          <span class="session-brand-mark">Q</span><strong>LibriQ</strong>
        </a>
        <div class="session-boot-art" aria-hidden="true"><i class="ph ph-book-open-text" aria-hidden="true"></i></div>
        <span class="session-eyebrow">Your reading space</span>
        <h1 id="sessionBootTitle">A moment between chapters.</h1>
        <p>Checking your account before loading your private library.</p>
        <div class="session-loading-card" role="status" aria-live="polite">
          <div class="session-loading-spinner" aria-hidden="true"></div>
          <div>
            <div class="session-card-title">${LibriqFirebase.getState().restoringSession ? 'Restoring your session' : 'Opening LibriQ'}</div>
            <div class="session-card-body">Your saved reading space will be here shortly.</div>
          </div>
        </div>
        <p class="session-fineprint"><i class="ph ph-lock-key" aria-hidden="true"></i> Your books. Your space.</p>
      </section>
    </div>`;
}

function routeAfterAuthReady() {
  const firebase = LibriqFirebase.getState();
  if (!firebase.ready) {
    Navigation.goTo('boot');
    return false;
  }
  const targetRoute = Navigation.getRouteFromHash?.() || 'dashboard';
  if (firebase.user || firebase.restoringSession) {
    if (firebase.user) {
      Storage.setActiveAccountUid?.(firebase.user.uid);
      Navigation.setSessionPreference?.('account');
    }
    if (Navigation.currentPage === 'session' || Navigation.currentPage === 'boot') {
      Navigation.goTo(targetRoute);
      if (targetRoute === 'help' && typeof window !== 'undefined' && window.location?.hash?.startsWith('#help-section-')) {
        const secId = window.location.hash.slice(1);
        window.setTimeout(() => {
          const sec = document.getElementById(secId);
          if (sec) {
            sec.open = true;
            sec.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      }
    }
    window.LibriqSyncBeta?.maybeAutoEnable?.('auth-ready');
    return true;
  }
  if (!firebase.signedOutConfirmed && firebase.available) {
    Navigation.debugSync?.('auth ready preserved while session restores', {
      restoringSession: Boolean(firebase.restoringSession),
      signedOutConfirmed: Boolean(firebase.signedOutConfirmed),
      hasUser: Boolean(firebase.user),
    });
    if (Navigation.currentPage !== 'boot') return true;
  }
  Storage.clearActiveAccountScope?.();
  if (Navigation.getCurrentSessionMode?.() === 'offline' || Navigation.getSessionPreference?.() === 'offline') {
    Navigation.goTo(targetRoute);
    return true;
  }
  if (Navigation.currentPage !== 'session') Navigation.goTo('session');
  else renderSessionChoicePage();
  return true;
}

function _cloudRestoreDismissKey(uid) {
  return uid ? `libriq_cloud_restore_dismissed_${uid}` : 'libriq_cloud_restore_dismissed';
}

async function maybeShowNewDeviceCloudPrompt() {
  const firebase = LibriqFirebase.getState();
  if (!firebase.user || !firebase.ready || !LibriqFirebase.hasFirestore()) return;
  if (Storage.getBooks().length > 0) return;
  if (Navigation.currentPage === 'session' || document.body.classList.contains('session-choice-active')) return;
  if (Navigation.getSessionPreference?.() === 'offline') return;

  const dismissKey = _cloudRestoreDismissKey(firebase.user.uid);
  if (localStorage.getItem(dismissKey) === '1') return;

  try {
    const snap = await LibriqFirebase.readBackupDoc(['users', firebase.user.uid, 'backups', 'current']);
    if (!snap?.exists?.()) return;
    const docData = LibriqCloudBackup.normalizeBackup(snap.data());
    if (!docData) return;

    const main = document.getElementById('mainContent');
    if (!main || !document.body.classList.contains('session-choice-active')) return;

    const card = document.createElement('div');
    card.className = 'session-backup-callout';
    card.id = 'newDeviceCloudPrompt';
    card.innerHTML = `
      <div class="session-backup-heading">
        <span class="session-card-icon" aria-hidden="true"><i class="ph ph-cloud-check" aria-hidden="true"></i></span>
        <div>
          <span class="session-eyebrow">A familiar reading space</span>
          <h2>Cloud backup found</h2>
          <p>We found a cloud backup for your account. Restore here or keep this device empty for now.</p>
        </div>
      </div>
      <div class="session-backup-actions">
        <button class="btn btn-primary btn-sm" id="newDeviceCloudRestoreBtn" type="button">Restore here</button>
        <button class="btn btn-secondary btn-sm" id="newDeviceCloudDismissBtn" type="button">Keep this device empty for now</button>
      </div>
    `;
    main.prepend(card);
    document.getElementById('newDeviceCloudRestoreBtn')?.addEventListener('click', async () => {
      card.remove();
      await confirmAndRestoreCloud(docData, summarizeLibrary(Storage.getBooks(), Storage.getActivityLog?.() || []));
    });
    document.getElementById('newDeviceCloudDismissBtn')?.addEventListener('click', () => {
      localStorage.setItem(dismissKey, '1');
      card.remove();
    });
  } catch (err) {
    console.warn('[Libriq] New-device cloud prompt failed:', err);
  }
}

Navigation.exportData = exportData;
Navigation.promptImportData = promptImportData;
Navigation.importDataFromFile = importDataFromFile;
Navigation.clearAllData = clearAllData;
