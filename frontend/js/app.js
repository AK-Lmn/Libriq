import { Navigation } from './navigation.js';
import { Library } from './library.js';
import { Search } from './search.js';
import { LIBRIQ } from './data.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { LibriqSyncBeta } from './sync.js';
import { LibriqFirebase } from './firebase-client.js';
import { LibriqCloudBackup } from './cloudBackup.js';
import { initInstallPrompt } from './installPrompt.js';

let _booted = false;
let _whatsNewTimer = null;
const RELEASE_KEY = 'libriq_seen_version';
const SESSION_PREF_KEY = 'libriq_session_pref';

function getWhatsNewVersion() {
  return LIBRIQ.VERSION;
}

function getReleaseNotes() {
  return {
    [getWhatsNewVersion()]: {
      title: "What's New in LibriQ v4.8.0",
      subtitle: '3D Digital Bookshelf view, refreshed Ribbon Q identity, and UI polish.',
      sections: [
        ['3D Digital Bookshelf View', 'Experience your collection like a physical bookcase. Switch seamlessly between the classic cover grid and 3D spine shelves with realistic depth and paper thickness.'],
        ['Refreshed Brand Identity', 'The signature Ribbon Q logo mark has been precision-upgraded in Deep Indigo & Slate across all navigation headers, favicons, and PWA app icons.'],
        ['Spine Hover Previews', 'Hovering or focusing on any spine brings it forward with an instant floating card showing book cover, author, and reading progress.'],
        ['Dark & Light Theme Harmony', 'Refined glass tokens and shelf planks adapt naturally between deep OLED dark mode and clean editorial paper light mode.'],
      ],
      note: 'All shelf filters, sorting options, and book details work seamlessly with the new Bookshelf view.',
    },
  };
}

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
    if (seen === getWhatsNewVersion()) return false;

    // Suppress for fresh accounts (no prior version seen and empty library)
    // to prevent Day-1 changelog cognitive overload
    if (!seen) {
      const books = Storage.getBooks?.() || [];
      if (books.length === 0) {
        localStorage.setItem(RELEASE_KEY, getWhatsNewVersion());
        return false;
      }
    }
    return true;
  }

  function renderWhatsNew() {
    const modal = document.getElementById('whatsNewModal');
    const body = document.getElementById('whatsNewBody');
    if (!modal || !body) return;

    const notes = getReleaseNotes()[getWhatsNewVersion()];
    if (!notes) return;

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
    localStorage.setItem(RELEASE_KEY, getWhatsNewVersion());
    closeWhatsNew();
    Navigation.routeAfterAuthReady?.();
    if (Navigation.currentPage === 'session') {
      Navigation.renderCurrentPage?.();
    }
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

    registerServiceWorker();
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

    navigator.serviceWorker.register('./service-worker.js')
      .catch((err) => {
        console.warn('[LibriQ] Service worker registration failed:', err);
      });
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
