/* ============================================
   LIBRIQ APP.JS
   Entry point — bootstraps the application
   ============================================ */

(() => {
  let _booted = false;
  let _whatsNewTimer = null;
  const RELEASE_KEY = 'libriq_seen_version';
  const WHATS_NEW_VERSION = LIBRIQ.VERSION;
  const SESSION_PREF_KEY = 'libriq_session_pref';

  const RELEASE_NOTES = {
    [WHATS_NEW_VERSION]: {
      title: "What's New in LibriQ v4.5.2",
      subtitle: 'A full Studio polish pass for the cloud-first LibriQ experience.',
      sections: [
        ['Studio polish across the app', 'Desktop and mobile views now feel more consistent across Dashboard, Library, Book Details, Status pages, Statistics, Activity, Recommendations, Settings, and guides.'],
        ['Cloud-first account flow', 'Sign in with Google or email. Offline access appears only when account services are unavailable.'],
        ['Safer account and data controls', 'Delete library data, delete account, backups, sync controls, and diagnostics remain clearly separated with strict confirmations.'],
        ['Better mobile experience', 'Mobile navigation, cards, modals, settings, and reading pages were tuned for phone-sized screens.'],
      ],
      note: 'No AI recommendations or expanded metadata sources yet. Those are planned for later roadmap versions.',
    },
  };

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
    return seen !== WHATS_NEW_VERSION;
  }

  function renderWhatsNew() {
    const modal = document.getElementById('whatsNewModal');
    const body = document.getElementById('whatsNewBody');
    if (!modal || !body) return;

    const notes = RELEASE_NOTES[WHATS_NEW_VERSION];
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
    document.body.style.overflow = 'hidden';
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
    localStorage.setItem(RELEASE_KEY, WHATS_NEW_VERSION);
    closeWhatsNew();
    document.body.style.overflow = '';
  }

  function wireGlobalEvents() {
    window.addEventListener('libriq:book:added',   () => Navigation.updateBadges());
    window.addEventListener('libriq:book:updated', () => Navigation.updateBadges());
    window.addEventListener('libriq:book:removed', () => Navigation.updateBadges());
    window.addEventListener('libriq:book:added',   () => window.LibriqCloudBackup?.scheduleIfAllowed?.('book-added'));
    window.addEventListener('libriq:book:updated', () => window.LibriqCloudBackup?.scheduleIfAllowed?.('book-updated'));
    window.addEventListener('libriq:book:removed', () => window.LibriqCloudBackup?.scheduleIfAllowed?.('book-removed'));
    window.addEventListener('libriq:book:added',   () => window.LibriqSyncBeta?.onLocalChange?.());
    window.addEventListener('libriq:book:updated', () => window.LibriqSyncBeta?.onLocalChange?.());
    window.addEventListener('libriq:book:removed', () => window.LibriqSyncBeta?.onLocalChange?.());
    window.addEventListener('libriq:profile:updated', () => window.LibriqCloudBackup?.scheduleIfAllowed?.('profile-updated'));
    window.addEventListener('libriq:goals:updated', () => window.LibriqCloudBackup?.scheduleIfAllowed?.('goals-updated'));
    window.addEventListener('libriq:streak:updated', () => window.LibriqCloudBackup?.scheduleIfAllowed?.('streak-updated'));
    window.addEventListener('libriq:activity:updated', () => window.LibriqCloudBackup?.scheduleIfAllowed?.('activity-updated'));
    window.addEventListener('libriq:page-changed', (event) => {
      if (event?.detail?.page === 'session') {
        cancelScheduledWhatsNew();
        closeWhatsNew();
        window.LibriqCloudBackup?.pause?.('session');
        window.LibriqSyncBeta?.refresh?.();
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
      window.LibriqCloudBackup?.scheduleIfAllowed?.('reset');
    });
  }

  function boot() {
    if (_booted) return;
    _booted = true;

    // Privacy guard: never send book titles, authors, ISBNs, notes, search terms,
    // reading progress, or private library data to analytics.
    Storage.bootstrap();

    resetShellUI();

    Navigation.init();
    Navigation.goTo('boot');
    waitForAuthThenRoute();

    Search.init();

    wireGlobalEvents();
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
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;

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
      caches?.keys?.().then((keys) => {
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
    const firebase = window.LibriqFirebase?.getState?.() || {};
    if (firebase.ready) {
      Navigation.routeAfterAuthReady?.();
      return;
    }
    let routed = false;
    const unsubscribe = window.LibriqFirebase?.onChange?.((nextState) => {
      if (routed || !nextState?.ready) return;
      routed = true;
      unsubscribe?.();
      Navigation.routeAfterAuthReady?.();
    });
    window.setTimeout(() => {
      if (routed) return;
      const latest = window.LibriqFirebase?.getState?.() || {};
      if (!latest.ready) return;
      routed = true;
      unsubscribe?.();
      Navigation.routeAfterAuthReady?.();
    }, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();




