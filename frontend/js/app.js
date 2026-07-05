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
      title: "What's New in LibriQ v4.0.1",
      subtitle: 'LibriQ v4.0.1 turns on Account Sync automatically for signed-in account mode while keeping backup and restore separate.',
      sections: [
        ['Account Sync', 'Signed-in account mode can now keep book changes updated across devices using a separate sync namespace.'],
        ['Backup Still Stays', 'Automatic cloud backup, manual restore, and merge remain available as separate safety tools.'],
        ['Conservative Safety', 'Account Sync turns on automatically in signed-in account mode unless you turn it off, and keeps local data protected when conflicts are unclear.'],
      ],
      note: 'Account Sync is optional and does not replace cloud backup or manual restore.',
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
    Navigation.goTo('session');

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

    navigator.serviceWorker.register('./service-worker.js')
      .catch((err) => {
        console.warn('[LibriQ] Service worker registration failed:', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();




