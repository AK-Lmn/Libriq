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
      title: 'What’s New in LibriQ v3.0.2',
      subtitle: 'A quick look at the sign-in environment guard.',
      sections: [
        ['In-App Browser Guard', 'LibriQ now recognizes likely in-app browsers and warns that Google sign-in may not work there.'],
        ['Offline First', 'Continue offline is always available, and signing in still does not upload your library.'],
        ['Friendly Auth Errors', 'Popup, domain, and disallowed-useragent failures now show clearer guidance instead of a confusing block.'],
      ],
      note: 'This release keeps storage local, with no cloud sync, restore, or Firestore-backed library data.',
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
    window.addEventListener('libriq:page-changed', (event) => {
      if (event?.detail?.page === 'session') {
        cancelScheduledWhatsNew();
        closeWhatsNew();
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
