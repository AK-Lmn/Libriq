/* ============================================
   LIBRIQ APP.JS
   Entry point — bootstraps the application
   ============================================ */

(() => {
  let _booted = false;
  const RELEASE_KEY = 'libriq_seen_version';
  const WHATS_NEW_VERSION = LIBRIQ.VERSION;

  const RELEASE_NOTES = {
    [WHATS_NEW_VERSION]: {
      title: 'What’s New in LibriQ v2.18.0',
      subtitle: 'A quick look at the latest local-first improvements.',
      sections: [
        ['Backup Confidence', 'Backups now track the last export time and show a safer import preview before replace or merge.'],
        ['Merge Safety', 'Duplicate detection now prefers matching id, ISBN, or normalized title and author before merging.'],
        ['Privacy Unchanged', 'Backups stay manual, private notes are included in exports, and no cloud sync or accounts were added.'],
      ],
      note: 'Your library stays local on your device, and the privacy model remains unchanged.',
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

  function dismissWhatsNew() {
    localStorage.setItem(RELEASE_KEY, WHATS_NEW_VERSION);
    closeWhatsNew();
    document.body.style.overflow = '';
  }

  function wireGlobalEvents() {
    window.addEventListener('libriq:book:added',   () => Navigation.updateBadges());
    window.addEventListener('libriq:book:updated', () => Navigation.updateBadges());
    window.addEventListener('libriq:book:removed', () => Navigation.updateBadges());

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

    Navigation.goTo('dashboard');

    Search.init();

    wireGlobalEvents();

    if (shouldShowWhatsNew()) {
      requestAnimationFrame(openWhatsNew);
    }

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
