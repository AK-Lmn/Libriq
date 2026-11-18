import { Navigation } from './navigation.js';
import { Library } from './library.js';
import { Search } from './search.js';
// Kept: test-data-modules.mjs pins app.js -> data.js in the module graph.
// eslint-disable-next-line no-unused-vars
import { LIBRIQ } from './data.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { LibriqSyncBeta } from './sync.js';
import { LibriqFirebase } from './firebase-client.js';
import { LibriqCloudBackup } from './cloudBackup.js';
import { initInstallPrompt } from './installPrompt.js';
import { submitPollVote } from './services/mobileAppPoll.js';
import { BookAPI } from './api/index.js';
import { PENDING_KEYS, claimPendingBook, flushPendingPollVote, queuePollVote } from './services/pendingIntents.js';
import { RELEASE_NOTES_VERSION, getReleaseNotes, hasSeenRelease } from './services/releaseNotes.js';
import { watchOtherTabs } from './shared/crossTab.js';

let _booted = false;
let _whatsNewTimer = null;
const RELEASE_KEY = 'libriq_seen_version';


  function resetShellUI() {
    if (typeof Search !== 'undefined' && Search.close) Search.close();
    if (typeof Library !== 'undefined' && Library.closeAddModal) Library.closeAddModal();
    closeWhatsNew();

    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('visible');
    document.body.style.overflow = '';
  }

  function closeWhatsNew() {
    const modal = document.getElementById('whatsNewModal');
    if (modal && !modal.hasAttribute('hidden')) {
      Utils.hide(modal);
    }
  }

  function shouldShowWhatsNew() {
    const seen = localStorage.getItem(RELEASE_KEY) || '';
    if (hasSeenRelease(seen)) return false;

    // Suppress for fresh accounts (no prior version seen and empty library)
    // to prevent Day-1 changelog cognitive overload
    if (!seen) {
      const books = Storage.getBooks?.() || [];
      if (books.length === 0) {
        localStorage.setItem(RELEASE_KEY, RELEASE_NOTES_VERSION);
        return false;
      }
    }
    return true;
  }

  function renderWhatsNew() {
    const modal = document.getElementById('whatsNewModal');
    const body = document.getElementById('whatsNewBody');
    if (!modal || !body) return;

    const notes = getReleaseNotes();

    modal.querySelector('.modal-title')?.replaceChildren(document.createTextNode(notes.title));
    modal.querySelector('.whats-new-subtitle')?.replaceChildren(document.createTextNode(notes.subtitle));

    body.innerHTML = `
      <div class="whats-new-list">
        ${notes.sections.map(([title, text]) => `
          <section class="whats-new-item">
            <div class="whats-new-item-title">${Utils.sanitize(title)}</div>
            <p>${Utils.sanitize(text)}</p>
          </section>
        `).join('')}
      </div>
      <div class="whats-new-note">${Utils.sanitize(notes.note)}</div>
    `;
  }

  function openWhatsNew() {
    const modal = document.getElementById('whatsNewModal');
    if (!modal) return;
    renderWhatsNew();
    Utils.show(modal);
  }

  function scheduleWhatsNew() {
    cancelScheduledWhatsNew();

    if (!shouldShowWhatsNew()) return;
    if (document.body.classList.contains('session-choice-active')) return;

    _whatsNewTimer = window.setTimeout(() => {
      _whatsNewTimer = null;
      if (document.body.classList.contains('session-choice-active')) return;
      openWhatsNew();
    }, 750);
  }

  function cancelScheduledWhatsNew() {
    if (_whatsNewTimer) {
      window.clearTimeout(_whatsNewTimer);
      _whatsNewTimer = null;
    }
  }

  function dismissWhatsNew() {
    localStorage.setItem(RELEASE_KEY, RELEASE_NOTES_VERSION);
    closeWhatsNew();
    Navigation.routeAfterAuthReady?.();
    if (Navigation.currentPage === 'session') {
      Navigation.renderCurrentPage?.();
    }
  }

  let storageFailureToast = null;
  function showStorageWriteFailure(detail = {}) {
    // One sticky alert at a time; a full disk fires on every save attempt.
    if (storageFailureToast?.isConnected) return;
    const message = detail.quota
      ? "This device is out of storage, so your last change wasn't saved. Export a backup from Settings, then free up browser storage."
      : "Your last change couldn't be saved on this device. Export a backup from Settings and reload LibriQ.";
    storageFailureToast = Utils.toast(message, 'error', { persistent: true }) || null;
  }

  function wireGlobalEvents() {
    window.addEventListener('libriq:book:added',   () => Navigation.updateBadges());
    window.addEventListener('libriq:book:updated', () => Navigation.updateBadges());
    window.addEventListener('libriq:book:removed', () => Navigation.updateBadges());
    window.addEventListener('libriq:book:added',   () => LibriqCloudBackup.scheduleIfAllowed('book-added'));
    window.addEventListener('libriq:book:updated', () => LibriqCloudBackup.scheduleIfAllowed('book-updated'));
    window.addEventListener('libriq:book:removed', () => LibriqCloudBackup.scheduleIfAllowed('book-removed'));
    window.addEventListener('libriq:book:added',   () => LibriqSyncBeta.onLocalChange());
    window.addEventListener('libriq:book:updated', () => LibriqSyncBeta.onLocalChange());
    window.addEventListener('libriq:book:removed', () => LibriqSyncBeta.onLocalChange());
    window.addEventListener('libriq:profile:updated', () => LibriqCloudBackup.scheduleIfAllowed('profile-updated'));
    window.addEventListener('libriq:goals:updated', () => LibriqCloudBackup.scheduleIfAllowed('goals-updated'));
    window.addEventListener('libriq:streak:updated', () => LibriqCloudBackup.scheduleIfAllowed('streak-updated'));
    window.addEventListener('libriq:activity:updated', () => LibriqCloudBackup.scheduleIfAllowed('activity-updated'));
    window.addEventListener('libriq:storage:write-failed', (event) => showStorageWriteFailure(event?.detail));
    window.addEventListener('libriq:page-changed', (event) => {
      if (event?.detail?.page === 'session') {
        cancelScheduledWhatsNew();
        closeWhatsNew();
        LibriqCloudBackup.pause('session');
        LibriqSyncBeta.refresh();
        return;
      }
      if (event?.detail?.page) {
        scheduleWhatsNew();
      }
    });

    window.addEventListener('libriq:reset', () => {
      resetShellUI();
      Navigation.applyTheme();
      Navigation.updateBadges();
      Navigation.goTo('dashboard');
      LibriqCloudBackup.scheduleIfAllowed('reset');
    });
  }

  export function bootApp() {
    if (_booted) return;
    _booted = true;

    Storage.bootstrap();

    resetShellUI();

    Navigation.init();
    Navigation.goTo('boot');
    waitForAuthThenRoute();

    Library.init();
    Search.init();

    wireGlobalEvents();
    initInstallPrompt();
    scheduleWhatsNew();

    document.getElementById('whatsNewContinue')?.addEventListener('click', dismissWhatsNew);
    document.getElementById('closeWhatsNew')?.addEventListener('click', dismissWhatsNew);
    document.getElementById('whatsNewModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) dismissWhatsNew();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !document.getElementById('whatsNewModal')?.hasAttribute('hidden')) {
        dismissWhatsNew();
      }
    });

    checkIncomingPollVote();
    LibriqFirebase.subscribe?.(state => claimPendingIntents(state));
    // A book added or edited in another LibriQ tab shows up here too.
    watchOtherTabs({
      getUid: () => Storage.getActiveAccountUid?.() || null,
      onChange: () => {
        Navigation.updateBadges?.();
        Navigation.renderCurrentPage?.();
      },
    });
    registerServiceWorker();
  }

  // A vote from the poll email or a book picked in the sign-in demo search may
  // arrive before the account is ready. Claim them once a user is signed in;
  // Storage is already scoped to that account by then.
  let _flushingVote = false;
  function claimPendingIntents(state) {
    const signedIn = Boolean(state?.user?.uid);
    if (!signedIn) return;

    if (!_flushingVote) {
      _flushingVote = true;
      flushPendingPollVote({ isSignedIn: true, submit: submitPollVote })
        .catch(error => console.warn('[Libriq] Queued poll vote failed:', error))
        .finally(() => { _flushingVote = false; });
    }

    const claimed = claimPendingBook({
      getBooks: () => Storage.getBooks(),
      isSameBook: (a, b) => BookAPI.isSameBook(a, b),
      addBook: book => Storage.addBook(book),
    });
    if (claimed.status === 'added') {
      Utils.toast?.(`"${claimed.book.title}" is waiting in Want to Read.`, 'success');
      Navigation.updateBadges?.();
      Navigation.renderCurrentPage?.();
    }
  }

  function checkIncomingPollVote() {
    if (typeof window === 'undefined' || !window.location) return;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const voteParam = urlParams.get('vote')?.toLowerCase();
      if (voteParam && ['ios', 'android', 'web_ok', 'web'].includes(voteParam)) {
        const choice = voteParam === 'web' ? 'web_ok' : voteParam;
        // Hide the card now; the account write waits for sign-in.
        queuePollVote(choice);
        submitPollVote(choice).then(result => {
          if (result?.success && !result.localOnly) localStorage.removeItem(PENDING_KEYS.POLL_VOTE);
        }).catch(() => {});
        const label = choice === 'ios' ? 'iOS' : choice === 'android' ? 'Android' : 'Web';
        setTimeout(() => {
          Utils.toast?.(`Thank you! Your vote for ${label} has been recorded.`, 'success');
        }, 700);

        urlParams.delete('vote');
        const newSearch = urlParams.toString();
        const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      }
    } catch {}
  }

  // A new deploy installs in the background and waits. The page keeps
  // running the files it started with until the reader chooses to reload.
  function watchForServiceWorkerUpdate(registration) {
    if (!registration || !navigator.serviceWorker?.controller) return;
    let prompted = false;
    const promptFor = (worker) => {
      if (prompted || !worker) return;
      prompted = true;
      Utils.toast('A new version of LibriQ is ready.', 'info', {
        persistent: true,
        action: {
          label: 'Reload',
          onClick: () => {
            let reloaded = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
              if (reloaded) return;
              reloaded = true;
              location.reload();
            });
            worker.postMessage({ type: 'SKIP_WAITING' });
          },
        },
      });
    };
    if (registration.waiting) promptFor(registration.waiting);
    registration.addEventListener?.('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed' && navigator.serviceWorker.controller) promptFor(installing);
      });
    });
  }

  function registerServiceWorker() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (typeof location === 'undefined' || location.protocol === 'file:') return;

    const isLocalDevHost = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (isLocalDevHost) {
      navigator.serviceWorker.getRegistration?.('./service-worker.js')?.then((registration) => {
        registration?.unregister?.();
      }).catch((err) => {
        console.warn('[LibriQ] Service worker cleanup failed:', err);
      });
      navigator.serviceWorker.getRegistrations?.().then((registrations) => {
        registrations.forEach((registration) => registration.unregister());
      }).catch((err) => {
        console.warn('[LibriQ] Service worker cleanup failed:', err);
      });
      globalThis.caches?.keys?.().then((keys) => {
        return Promise.all(keys.filter((key) => key.startsWith('libriq-')).map((key) => caches.delete(key)));
      }).catch((err) => {
        console.warn('[LibriQ] Cache cleanup failed:', err);
      });
      return;
    }

    // Precaching downloads the whole shell; start it after the first load so
    // it doesn't compete with the files the page needs right now.
    const register = () => navigator.serviceWorker.register('./service-worker.js')
      .then((registration) => watchForServiceWorkerUpdate(registration))
      .catch((err) => {
        console.warn('[LibriQ] Service worker registration failed:', err);
      });
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }

  function waitForAuthThenRoute() {
    const firebase = LibriqFirebase.getState();
    if (firebase.ready) {
      Navigation.routeAfterAuthReady?.();
      return;
    }
    let routed = false;
    const unsubscribe = LibriqFirebase.onChange((nextState) => {
      if (routed || !nextState?.ready) return;
      routed = true;
      unsubscribe?.();
      Navigation.routeAfterAuthReady?.();
    });
    window.setTimeout(() => {
      if (routed) return;
      const latest = LibriqFirebase.getState();
      if (!latest.ready) return;
      routed = true;
      unsubscribe?.();
      Navigation.routeAfterAuthReady?.();
    }, 2500);
  }

export function isAppBooted() {
  return _booted;
}
