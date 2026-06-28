/* ============================================
   LIBRIQ APP.JS
   Entry point — bootstraps the application
   ============================================ */

(() => {
  let _booted = false;

  // Close any modal/overlay that would sit above the shell and swallow clicks.
  function resetShellUI() {
    if (typeof Search !== 'undefined' && Search.close) Search.close();
    if (typeof Library !== 'undefined' && Library.closeAddModal) Library.closeAddModal();

    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('visible');
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
