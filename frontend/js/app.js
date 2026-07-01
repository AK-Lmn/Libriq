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
      title: 'What’s New in LibriQ v2.9.0',
      subtitle: 'A quick look at the latest local-first improvements.',
      sections: [
        ['Local Recommendations', 'Discover suggested reads based on your saved library, ratings, favorites, genres, and reading status.'],
        ['Advanced Search Filters', 'Refine online book search results by author, year, source, cover availability, and description availability.'],
        ['Help & Guide Center', 'Learn how to search, add books manually, use private notes, back up your library, and understand local-first storage.'],
        ['Library Search & Sorting', 'Quickly find and organize saved books by title, author, genre, rating, progress, and recently added.'],
      ],
      note: 'Your library stays local on your device. No accounts or cloud sync have been added.',
    },
  };

  // Close any modal/overlay that would sit above the shell and swallow clicks.
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

    // 1. Heal localStorage before any renderer reads it
    Storage.bootstrap();

    // 2. Ensure no leftover overlay blocks the shell
    resetShellUI();

    // 3. Wire sidebar navigation, theme, badges
    Navigation.init();

    // 4. Render the default page BEFORE optional subsystems.
    //    Search.init() must not gate first paint — if it throws, the
    //    dashboard must already be on screen and nav listeners live.
    Navigation.goTo('dashboard');

    // 5. Search modal (⌘K, Open Library API) — non-blocking
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
  }

  // app.js is the last synchronous <script> in index.html; the shell and
  // modals are already parsed above this tag. Boot now instead of waiting
  // on DOMContentLoaded — that event may already have fired on reload when
  // scripts are re-injected (live reload / cached late execution).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
