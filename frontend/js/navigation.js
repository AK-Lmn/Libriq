/* ============================================
   LIBRIQ NAVIGATION
   Client-side routing and page management
   ============================================ */

const Navigation = (() => {
  let _currentPage = 'dashboard';
  const SESSION_PREF_KEY = 'libriq_session_pref';

  const pages = {
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
    document.body.classList.toggle('session-choice-active', page === 'session');

    Utils.$$('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
      el.setAttribute('aria-current', el.dataset.page === page ? 'page' : 'false');
    });

    closeMobileSidebar();

    pages[page]();

    document.getElementById('mainContent').scrollTop = 0;
    window.dispatchEvent(new CustomEvent('libriq:page-changed', { detail: { page } }));
  }

  function renderCurrentPage() {
    document.body.classList.toggle('session-choice-active', _currentPage === 'session');
    if (pages[_currentPage]) pages[_currentPage]();
  }

  function setSessionPreference(value) {
    localStorage.setItem(SESSION_PREF_KEY, value);
  }

  function openMobileSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    const sidebar  = document.getElementById('sidebar');
    const overlay  = document.getElementById('sidebarOverlay');
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
    const profile  = Storage.getProfile();
    const theme    = (profile && profile.theme) ? profile.theme : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    _updateThemeToggleUI(theme);
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
  }

  function _updateThemeToggleUI(theme) {
    const icon  = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    if (icon)  icon.className   = theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
    if (label) label.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
  }

  function init() {
    Utils.$$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page));
    });

    document.getElementById('mobileMenuBtn')?.addEventListener('click', openMobileSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', closeMobileSidebar);

    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

    applyTheme();
    updateBadges();
    window.addEventListener('libriq:auth-changed', () => {
      if (_currentPage === 'settings') renderSettingsPage();
      if (_currentPage === 'session') renderSessionChoicePage();
    });
  }

  return {
    init, goTo, renderCurrentPage, updateBadges, toggleTheme, applyTheme,
    setSessionPreference,
    clearLibrarySearch,
    get currentPage() { return _currentPage; },
  };
})();

function renderSessionChoicePage() {
  const main = document.getElementById('mainContent');
  const firebase = window.LibriqFirebase?.getState?.() || { available: false, initialized: false, ready: false, user: null };
  const sessionContext = window.LibriqFirebase?.getSessionContext?.() || { isInAppBrowser: false, hints: [] };
  const hasUser = Boolean(firebase.user);
  const accountName = firebase.user?.displayName || firebase.user?.email || 'Reader';
  const loading = firebase.available && !firebase.ready;
  const inAppBrowser = Boolean(sessionContext.isInAppBrowser);
  const signInButtonLabel = hasUser ? `Continue as ${Utils.sanitize(accountName)}` : 'Sign in with Google';
  const signInButtonHelp = inAppBrowser
    ? 'Google sign-in may not work inside this app browser.'
    : 'Optional account sign-in. This does not upload your library data.';
  const browserHelp = inAppBrowser
    ? 'Open LibriQ in Chrome or Safari to sign in with Google.'
    : '';
  const openInBrowserHref = 'https://libriq.app';

  main.innerHTML = `
    <div class="session-page">
      <section class="session-hero">
        <div class="session-hero-orb session-hero-orb-a"></div>
        <div class="session-hero-orb session-hero-orb-b"></div>

        <div class="session-copy">
          <span class="session-eyebrow">Welcome to LibriQ</span>
          <h1 class="session-title">Choose your session</h1>
          <p class="session-subtitle">
            Start locally, or continue with your Google account if you are already signed in.
            Signing in does not upload your library data.
          </p>

          <div class="session-points">
            <div class="session-point">
              <i class="ph ph-shield-check"></i>
              <span>Your library stays on this device unless you export it.</span>
            </div>
            <div class="session-point">
              <i class="ph ph-wifi-slash"></i>
              <span>Continue offline is always available.</span>
            </div>
            ${inAppBrowser ? `
            <div class="session-point session-point-warning">
              <i class="ph ph-warning-circle"></i>
              <span>Google sign-in may not work inside this app browser.</span>
            </div>` : ''}
            <div class="session-point">
              <i class="ph ph-cloud-arrow-up"></i>
              <span>No cloud backup, sync, or analytics events are added here.</span>
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

          <button class="session-card session-card-primary" id="continueOfflineBtn" type="button">
            <div class="session-card-icon"><i class="ph ph-house-simple"></i></div>
            <div class="session-card-content">
              <div class="session-card-title">Continue offline</div>
              <div class="session-card-body">Use LibriQ locally with your saved library, search tools, and settings.</div>
            </div>
            <div class="session-card-action"><i class="ph ph-arrow-right"></i></div>
          </button>

          ${loading ? '' : hasUser ? `
            <button class="session-card session-card-secondary" id="googleContinueBtn" type="button">
              <div class="session-card-icon"><i class="ph ph-user-circle"></i></div>
              <div class="session-card-content">
                <div class="session-card-title">Continue as ${Utils.sanitize(accountName)}</div>
                <div class="session-card-body">Enter LibriQ with your current Google account. Your library stays local.</div>
              </div>
              <div class="session-card-action"><i class="ph ph-arrow-right"></i></div>
            </button>
          ` : firebase.available ? `
            <button class="session-card session-card-secondary ${inAppBrowser ? 'session-card-disabled' : ''}" id="googleSignInBtn" type="button" ${inAppBrowser ? 'aria-describedby="googleSignInHelp"' : ''}>
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
                <div class="session-card-title">Google sign-in unavailable</div>
                <div class="session-card-body">Continue offline is available right now.</div>
              </div>
            </div>
          `}

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
            Choosing a session only changes how you enter LibriQ. It does not upload private library data.
          </p>
        </div>
      </section>
    </div>`;

  document.getElementById('continueOfflineBtn')?.addEventListener('click', () => {
    Navigation.setSessionPreference('offline');
    Navigation.goTo('dashboard');
  });

  document.getElementById('googleContinueBtn')?.addEventListener('click', () => {
    Navigation.setSessionPreference('google');
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
      Navigation.goTo('dashboard');
    } catch (err) {
      const code = String(err?.code || err?.message || '').toLowerCase();
      console.warn('[Libriq] Google sign-in failed:', {
        code: err?.code || '',
        message: err?.message || '',
        details: err?.details || null,
      });
      const isUnauthorizedDomain = code.includes('auth/unauthorized-domain') || code.includes('unauthorized-domain');
      const isPopupBlocked = code.includes('auth/popup-blocked') || code.includes('popup-blocked');
      const isPopupClosed = code.includes('auth/popup-closed-by-user') || code.includes('popup-closed-by-user');
      const isInvalidApiKey = code.includes('auth/invalid-api-key') || code.includes('invalid-api-key');
      const isConfigNotFound = code.includes('auth/configuration-not-found') || code.includes('configuration-not-found');
      const isDisallowedUserAgent = code.includes('auth/disallowed-useragent') || code.includes('disallowed_useragent') || code.includes('disallowed-useragent');
      if (isDisallowedUserAgent) {
        Utils.toast('Google sign-in may not work inside this app browser. Open LibriQ in Chrome or Safari.', 'warning');
      } else if (isUnauthorizedDomain) {
        Utils.toast('This domain is not authorized for Google sign-in yet.', 'error');
      } else if (isInvalidApiKey) {
        Utils.toast('Google sign-in is not configured correctly for this build.', 'error');
      } else if (isConfigNotFound) {
        Utils.toast('Account setup is incomplete for this build.', 'error');
      } else if (isPopupBlocked) {
        Utils.toast('Your browser blocked the sign-in popup.', 'warning');
      } else if (isPopupClosed) {
        Utils.toast('Sign-in was cancelled.', 'info');
      } else {
        Utils.toast('Could not sign in right now.', 'error');
      }
    }
  });

  document.getElementById('switchAccountBtn')?.addEventListener('click', async () => {
    try {
      await window.LibriqFirebase?.signOut?.();
      Navigation.setSessionPreference('prompt');
    } catch (err) {
      const code = String(err?.code || err?.message || '');
      const cancelled = code.includes('popup-closed-by-user') || code.includes('popup-blocked');
      Utils.toast(cancelled ? 'Sign-out was cancelled.' : 'Could not switch accounts right now.', 'error');
    }
  });
}

Navigation.exportData = exportData;
Navigation.promptImportData = promptImportData;
Navigation.importDataFromFile = importDataFromFile;
Navigation.clearAllData = clearAllData;

function renderLibraryPage() {
  const main  = document.getElementById('mainContent');
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
    favorites: ['No favorites yet', 'Heart a book to save it here.'],
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
  const books = Storage.getBooksByStatus(status);

  main.innerHTML = `
    <div class="page">
      <div class="page-header flex justify-between items-center" style="margin-bottom: var(--space-6);">
        <div>
          <h1 class="page-title">${title}</h1>
          <p class="page-subtitle">${books.length} book${books.length !== 1 ? 's' : ''}</p>
        </div>
        <button class="btn btn-primary" onclick="Search.open()">
          <i class="ph ph-plus"></i> Add Book
        </button>
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
  const books = Storage.getBooks().filter(b => b.isFavorite);

  main.innerHTML = `
    <div class="page">
      <div class="page-header" style="margin-bottom: var(--space-6);">
        <h1 class="page-title">Favorites</h1>
        <p class="page-subtitle">${books.length} book${books.length !== 1 ? 's' : ''} you loved</p>
      </div>
      <div class="books-grid" id="favoritesGrid"></div>
    </div>`;

  const grid = document.getElementById('favoritesGrid');
  if (books.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-state-icon"><i class="ph ph-heart"></i></div>
        <div class="empty-state-title">No favorites yet</div>
        <div class="empty-state-body">Tap the heart on any book to add it here.</div>
      </div>`;
  } else {
    books.forEach(b => grid.appendChild(Library.renderBookCard(b)));
  }
}

  function renderStatsPage() {
    const main  = document.getElementById('mainContent');
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

        ${recap.finishedCount === 0 ? `
          <div class="empty-state stats-empty-state" style="margin-top: var(--space-4);">
            <div class="empty-state-icon"><i class="ph ph-book-open"></i></div>
            <div class="empty-state-title">No finished books for this year yet.</div>
            <div class="empty-state-body">Search or open your library to keep reading.</div>
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
  const goals = Storage.getGoals();
  const stats = Storage.getStats();

  main.innerHTML = `
    <div class="page" style="max-width: 600px;">
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
    const year = Number.parseInt(String(book?.dateFinished || '').slice(0, 4), 10);
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
  const books = Storage.getBooks().filter(book => {
    const finishedYear = Number.parseInt(String(book?.dateFinished || '').slice(0, 4), 10);
    return Number.isInteger(finishedYear) && finishedYear === year;
  });

  const finishedBooks = books.filter(book => book.dateFinished);
  const finishedCount = finishedBooks.length;
  const pagesRead = finishedBooks.reduce((sum, book) => sum + (Number(book.pageCount) > 0 ? Number(book.pageCount) : 0), 0);
  const ratedBooks = finishedBooks.filter(book => typeof book.rating === 'number' && book.rating > 0);
  const avgRating = ratedBooks.length
    ? (ratedBooks.reduce((sum, book) => sum + book.rating, 0) / ratedBooks.length).toFixed(1)
    : null;

  const monthCounts = Array(12).fill(0);
  const monthLabels = LIBRIQ.MONTHS;
  finishedBooks.forEach(book => {
    const month = new Date(book.dateFinished).getMonth();
    if (!Number.isNaN(month)) monthCounts[month]++;
  });
  const activeMonthIndex = monthCounts.indexOf(Math.max(...monthCounts));
  const activeMonthLabel = activeMonthIndex >= 0 ? monthLabels[activeMonthIndex] : '–';

  const longestBook = finishedBooks
    .filter(book => Number(book.pageCount) > 0)
    .slice()
    .sort((a, b) => (Number(b.pageCount) || 0) - (Number(a.pageCount) || 0))[0] || null;

  const highestRatedBooks = ratedBooks
    .slice()
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || new Date(b.dateFinished || 0) - new Date(a.dateFinished || 0))
    .filter(book => book.rating === (ratedBooks[0]?.rating || null))
    .slice(0, 5);

  const genreCounts = new Map();
  const shelfCounts = new Map();
  finishedBooks.forEach(book => {
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
  };
}

function _topCountEntry(map) {
  const entries = Array.from(map.entries());
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [name, count] = entries[0];
  return { name, count };
}

// ── Help Page ────────────────────────────────

function renderHelpPage() {
  const main = document.getElementById('mainContent');

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
      title: 'Understanding Local-First Storage',
      body: 'LibriQ stores your data in localStorage on this device only. Nothing is tied to an account, and nothing is uploaded to a cloud service.',
    },
  ];

  const faqItems = [
    ['Why did my books disappear?', 'They may be stored in a different browser or device. Local-first storage stays with the browser profile that saved it.'],
    ['Can I use LibriQ offline?', 'Yes, after the app loads. Search needs the book APIs online, but your saved library remains available locally.'],
    ['Will notes sync across devices?', 'No. Notes are private and local-only for now. Exporting a backup is the best way to move them.'],
    ['What if search returns no results?', 'Try a different title spelling, search by author, or use Manual Entry to add the book by hand.'],
  ];

  main.innerHTML = `
    <div class="page" id="helpPage">
      <div class="page-header help-header">
        <div class="help-heading">
          <span class="library-eyebrow">Beginner guide</span>
          <h1 class="page-title">Help & Guide Center</h1>
          <p class="page-subtitle">A friendly walkthrough for using LibriQ with confidence</p>
        </div>
      </div>

      <div class="help-intro-card">
        <div class="help-intro-icon"><i class="ph ph-book-open-text"></i></div>
        <div class="help-intro-copy">
          <h2 class="help-intro-title">A calm place to learn the app</h2>
          <p class="text-secondary" style="line-height: var(--leading-loose); margin: 0;">
            LibriQ is designed to stay simple and local-first. This guide covers the core features so you can start building your reading space without needing a tutorial or account.
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
  const books = Storage.getBooks();
  const recState = _buildRecommendationState(books);

  main.innerHTML = `
    <div class="page" id="recommendationsPage">
      <div class="page-header recommendations-header">
        <div class="recommendations-heading">
          <span class="library-eyebrow">Local suggestions</span>
          <h1 class="page-title">Recommendations</h1>
          <p class="page-subtitle">Suggestions built only from your saved library</p>
        </div>
      </div>

      ${recState.hasSignal ? `
        <div class="recommendations-groups stagger">
          ${recState.groups.map(group => buildRecommendationGroup(group)).join('')}
        </div>
      ` : `
        <div class="empty-state recommendations-empty-state">
          <div class="empty-state-icon"><i class="ph ph-sparkle"></i></div>
          <div class="empty-state-title">Add and rate more books to get better recommendations.</div>
          <div class="empty-state-body">Once you save a few books, LibriQ will surface nearby reads using your own library signals.</div>
          <button class="btn btn-primary" onclick="Search.open()">
            <i class="ph ph-magnifying-glass"></i> Search Books
          </button>
        </div>
      `}
    </div>`;
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
      groups.push({ title: 'More from authors you enjoy', label: topAuthor, books: booksByAuthor });
    }
  }

  if (highRatedBooks.length) {
    groups.push({
      title: 'Highly rated in your library',
      label: `${highRatedBooks.length} rated book${highRatedBooks.length !== 1 ? 's' : ''}`,
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
      label: `${wishlistBooks.length} book${wishlistBooks.length !== 1 ? 's' : ''}`,
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
  const cards = group.books.map(book => buildRecommendationCard(book, group.label)).join('');
  return `
    <section class="goal-widget recommendation-group">
      <div class="goal-header">
        <div>
          <div class="goal-title">${Utils.sanitize(group.title)}</div>
          <div class="stats-section-meta">${Utils.sanitize(group.label)}</div>
        </div>
      </div>
      <div class="recommendation-card-grid">
        ${cards}
      </div>
    </section>`;
}

function buildRecommendationCard(book, reasonLabel) {
  const isSaved = !!Storage.getBookById(book.id);
  const statusLabel = isSaved ? Utils.statusLabel(book.status) : '';
  const statusClass = isSaved ? `badge ${Utils.statusBadgeClass(book.status)}` : '';
  return `
    <button type="button" class="recommendation-card" ${isSaved ? `onclick="Library.showDetailsModal('${book.id}')"` : 'aria-disabled="true"'}
      ${isSaved ? '' : 'disabled'}>
      ${Utils.buildCover(book, 'cover-sm')}
      <div class="recommendation-card-body">
        <div class="recommendation-card-reason">${Utils.sanitize(reasonLabel)}</div>
        <div class="recommendation-card-title">${Utils.sanitize(book.title)}</div>
        <div class="recommendation-card-author">${Utils.sanitize(book.author)}</div>
        <div class="recommendation-card-meta">
          ${isSaved ? `<span class="${statusClass}">${statusLabel}</span>` : ''}
        </div>
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
  const profile = Storage.getProfile();
  const stats   = Storage.getStats();

  main.innerHTML = `
    <div class="page" style="max-width: 600px;">
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

      <div class="goal-widget">
        <div class="goal-header"><div class="goal-title">Reading Stats</div></div>
        <div class="stats-row" style="grid-template-columns: repeat(2,1fr); margin: 0; gap: var(--space-3);">
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
  const theme = document.documentElement.getAttribute('data-theme');
  const backupMeta = Storage.getBackupMeta?.() || { lastExportedAt: null };
  const hasBooks = Storage.getBooks().length > 0;
  const firebase = window.LibriqFirebase?.getState?.() || { available: false, initialized: false, user: null };
  const lastExportedText = backupMeta.lastExportedAt
    ? Utils.formatDate(backupMeta.lastExportedAt)
    : 'No backup exported yet.';

  main.innerHTML = `
    <div class="page" style="max-width: 560px;">
      <div class="page-header" style="margin-bottom: var(--space-6);">
        <h1 class="page-title">Settings</h1>
      </div>

      <div class="goal-widget" style="margin-bottom: var(--space-4);">
        <div class="goal-header">
          <div>
            <div class="goal-title">Appearance</div>
          </div>
        </div>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Theme</div>
            <div class="activity-subtitle">Choose your preferred color scheme</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Navigation.toggleTheme()">
            <i class="ph ph-${theme === 'dark' ? 'sun' : 'moon'}"></i>
            Switch to ${theme === 'dark' ? 'light' : 'dark'}
          </button>
        </div>
      </div>

      <div class="goal-widget" style="margin-bottom: var(--space-4);">
        <div class="goal-header">
          <div class="goal-title">Account</div>
        </div>
        ${_buildAccountSection(firebase)}
        <div class="settings-session-actions">
          <button class="btn btn-secondary btn-sm" type="button" onclick="Navigation.goTo('session')">
            <i class="ph ph-arrow-counter-clockwise"></i>
            Choose start mode
          </button>
        </div>
      </div>

      <div class="goal-widget" style="margin-bottom: var(--space-4);">
        <div class="goal-header"><div class="goal-title">Data</div></div>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Export library</div>
            <div class="activity-subtitle">Download your data as JSON. Private notes are included.</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Navigation.exportData()">
            <i class="ph ph-download-simple"></i> Export
          </button>
        </div>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Import library</div>
            <div class="activity-subtitle">Review a backup before replacing or merging your library.</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Navigation.promptImportData()">
            <i class="ph ph-upload-simple"></i> Import
          </button>
        </div>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Clear all data</div>
            <div class="activity-subtitle">Remove all books and settings</div>
          </div>
          <button class="btn btn-danger btn-sm" onclick="Navigation.clearAllData()">
            <i class="ph ph-trash"></i> Clear
          </button>
        </div>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Last exported</div>
            <div class="activity-subtitle">${lastExportedText}</div>
          </div>
        </div>
        ${hasBooks && !backupMeta.lastExportedAt ? `
          <div class="empty-state" style="margin: 0; padding: var(--space-3); text-align: left;">
            <div class="empty-state-body" style="margin: 0;">
              Consider exporting a backup before making larger changes.
            </div>
          </div>` : ''}
        <input id="importLibraryInput" type="file" accept="application/json,.json" hidden onchange="Navigation.importDataFromFile(this.files?.[0])" />
      </div>

      <div class="goal-widget" style="margin-bottom: var(--space-4);">
        <div class="goal-header">
          <div class="goal-title">Search &amp; Privacy</div>
        </div>
        <p class="text-sm text-secondary" style="line-height: var(--leading-loose); margin-top: 0;">
          LibriQ works without an account. It searches public book sources like Open Library and Google Books, and your library stays local on this device unless you export it manually. Some providers may rate-limit requests during heavy usage, but Open Library fallback remains available.
        </p>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Open Library</div>
            <div class="activity-subtitle">Available</div>
          </div>
        </div>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Google Books</div>
            <div class="activity-subtitle">Available</div>
          </div>
        </div>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Google Books key</div>
            <div class="activity-subtitle">${_hasGoogleBooksKey() ? 'Configured' : 'Not configured'}</div>
          </div>
        </div>
      </div>

      <div class="goal-widget" style="margin-bottom: var(--space-4);">
        <div class="goal-header">
          <div class="goal-title">Privacy &amp; Local Data</div>
        </div>
        <div class="activity-list">
          ${[
            ['Local library storage', 'LibriQ stores your library locally on this device.'],
            ['Basic traffic analytics', 'LibriQ uses anonymous Google Analytics page views to understand general traffic.'],
            ['Accounts are optional', 'Sign in only if you want future backup and sync features.'],
            ['No cloud backup', 'Cloud backup and sync are not enabled in v3.0.2.'],
            ['Manual backups', 'Backups are downloaded manually as JSON files.'],
            ['Private notes and quotes', 'Private notes and quotes stay local unless included in an exported backup.'],
          ].map(([title, subtitle]) => `
            <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
              <div class="activity-text">
                <div class="activity-title">${title}</div>
                <div class="activity-subtitle">${subtitle}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <div class="goal-widget">
        <div class="goal-header"><div class="goal-title">About</div></div>
        <p class="text-sm text-secondary" style="line-height: var(--leading-loose);">
          <strong style="color: var(--text-primary);">LibriQ</strong> v${LIBRIQ.VERSION}<br>
          Your reading life, beautifully organized.<br>
          Book data from <a href="https://openlibrary.org" target="_blank" style="color: var(--text-accent);">Open Library</a> and <a href="https://books.google.com" target="_blank" style="color: var(--text-accent);">Google Books</a>.
          <br>Optional account backup may arrive in a future version.
        </p>
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
          <div class="activity-subtitle">LibriQ works without an account. Sign in only if you want future backup and sync features.</div>
        </div>
        <button class="btn btn-secondary btn-sm" id="accountActionBtn" type="button" data-account-action="signin">
          Sign in with Google
        </button>
      </div>`;
  }

  const user = firebase.user;
  const avatar = user.photoURL
    ? `<img src="${Utils.sanitize(user.photoURL)}" alt="" aria-hidden="true" style="width:40px;height:40px;border-radius:999px;object-fit:cover;" />`
    : `<div style="width:40px;height:40px;border-radius:999px;background:var(--bg-elevated);display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-weight:700;">${Utils.sanitize((user.displayName || user.email || 'U').slice(0,1).toUpperCase())}</div>`;

  return `
    <div class="activity-item" style="cursor:default; padding: var(--space-3) 0; align-items: center;">
      <div class="activity-text" style="display:flex; flex-direction:row; align-items:center; gap: var(--space-3);">
        ${avatar}
        <div>
          <div class="activity-title">${Utils.sanitize(user.displayName || 'Signed in')}</div>
          <div class="activity-subtitle">${Utils.sanitize(user.email || '')}</div>
          <div class="activity-subtitle">Cloud backup is not enabled yet. Your library is still stored locally on this device.</div>
        </div>
      </div>
      <button class="btn btn-secondary btn-sm" id="accountActionBtn" type="button" data-account-action="signout">
        Sign out
      </button>
    </div>`;
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
  if (document.getElementById('mainContent')?.querySelector('#importLibraryInput')) renderCurrentPage();
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
    localStorage.setItem('libriq_streak', JSON.stringify(parsed.data.streak));
  }
  Storage.replaceActivityLog?.(mergedActivity);
  Storage.addActivityEvent?.(Storage.buildActivityEvent?.('backup_imported', null, { itemCount: mergedBooks.length, activityCount: mergedActivity.length, mode: replaceMode ? 'replace' : 'merge' }, 'import'));

  Utils.toast(replaceMode ? 'Library replaced from backup' : 'Library merged from backup', 'success');
  updateBadges();
  renderCurrentPage();
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

function clearAllData() {
  const hasBooks = Storage.getBooks().length > 0;
  if (!hasBooks) {
    Storage.resetAll();
    Utils.toast('Library cleared. Starting fresh.', 'info');
    return;
  }

  const modal = document.getElementById('backupImportModal');
  const body = document.getElementById('backupImportBody');
  const title = document.getElementById('backupImportTitle');
  const subtitle = document.getElementById('backupImportSubtitle');
  const cancel = document.getElementById('backupImportCancel');
  const merge = document.getElementById('backupImportMerge');
  const replace = document.getElementById('backupImportReplace');
  const close = document.getElementById('closeBackupImport');
  if (!modal || !body) {
    if (confirm('This will delete all your books and settings. Export a backup first if you want one. Continue?')) {
      Storage.resetAll();
      Utils.toast('Library cleared. Starting fresh.', 'info');
    }
    return;
  }

  title.textContent = 'Clear All Data';
  subtitle.textContent = 'Exporting a backup first is strongly recommended.';
  body.innerHTML = `
    <div class="whats-new-list">
      <section class="whats-new-item">
        <div class="whats-new-item-title">Before you clear</div>
        <p>This removes all books, settings, goals, streak data, and local backup metadata from this device.</p>
      </section>
      <section class="whats-new-item">
        <div class="whats-new-item-title">Recommended first step</div>
        <p>Export a backup first so you can restore your library later if needed.</p>
      </section>
    </div>
  `;

  const cleanup = () => {
    modal.setAttribute('hidden', '');
    document.body.style.overflow = '';
    replace.textContent = 'Replace local library';
    merge.textContent = 'Merge with current library';
    title.textContent = 'Import Backup';
    subtitle.textContent = 'Review the backup before choosing how to apply it.';
    replace.onclick = null;
    merge.onclick = null;
    cancel.onclick = null;
    close.onclick = null;
  };

  replace.textContent = 'Clear anyway';
  merge.textContent = 'Export backup first';
  cancel.textContent = 'Cancel';
  modal.removeAttribute('hidden');
  document.body.style.overflow = 'hidden';

  const exportFirst = async () => {
    cleanup();
    await exportData();
    if (confirm('The backup was exported. Clear all local data now?')) {
      Storage.resetAll();
      Utils.toast('Library cleared. Starting fresh.', 'info');
    }
  };
  const clearAnyway = () => {
    cleanup();
    Storage.resetAll();
    Utils.toast('Library cleared. Starting fresh.', 'info');
  };
  const cancelClear = () => cleanup();

  replace.onclick = clearAnyway;
  merge.onclick = exportFirst;
  cancel.onclick = cancelClear;
  close.onclick = cancelClear;
  modal.onclick = (e) => {
    if (e.target === modal) cancelClear();
  };
}

function renderActivityPage() {
  const main = document.getElementById('mainContent');
  const events = Storage.getActivityLog?.() || [];
  const state = _getActivityState();
  const filtered = _filterActivityEvents(events, state.filter);
  const grouped = _groupActivityByDate(filtered);

  main.innerHTML = `
    <div class="page" id="activityPage">
      <div class="page-header library-header" style="margin-bottom: var(--space-6);">
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
  return `<button class="chip ${active === key ? 'active' : ''}" data-filter="${key}">${label} <span>${count}</span></button>`;
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
  if (!map[filter]) return list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return list.filter(event => map[filter].includes(event.type)).sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
}

function _countActivityEvents(events, types) {
  return (events || []).filter(event => types.includes(event.type)).length;
}

function _groupActivityByDate(events) {
  const groups = new Map();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();

  (events || []).forEach(event => {
    const key = new Date(event.timestamp || Date.now()).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  });

  return Array.from(groups.entries()).map(([key, items]) => ({
    label: key === today ? 'Today' : key === yesterday ? 'Yesterday' : key,
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
  const payloadBits = [];
  if (event.payload?.status) payloadBits.push(String(event.payload.status));
  if (event.payload?.rating !== undefined && event.payload?.rating !== null) payloadBits.push(`${event.payload.rating}/5`);
  if (event.payload?.currentPage !== undefined) payloadBits.push(`p.${event.payload.currentPage}`);
  if (event.source) payloadBits.push(event.source);

  return {
    ...event,
    title: event.bookTitle || 'Unknown title',
    subtitle: event.bookAuthor || '',
    label: entry[0],
    icon: entry[1],
    iconBg: entry[2],
    iconColor: entry[3],
    payloadText: payloadBits.join(' • '),
    date: event.timestamp,
  };
}

function buildActivityEmptyState(filter) {
  const messages = {
    all: ['No activity yet', 'Book changes, notes, progress updates, and backups will appear here once you start using the library.'],
    books: ['No book activity yet', 'Add or update a book to see it here.'],
    progress: ['No progress updates yet', 'Track a reading session or finish a book to populate this view.'],
    notes: ['No notes activity yet', 'Save or clear a note to see it here.'],
    backups: ['No backup activity yet', 'Export or import a backup to track it here.'],
    metadata: ['No metadata refreshes yet', 'Refresh a book’s metadata to record it here.'],
  };
  const [title, body] = messages[filter] || messages.all;
  return `
    <div class="empty-state" style="grid-column: 1 / -1;">
      <div class="empty-state-icon"><i class="ph ph-clock-counter-clockwise"></i></div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-body">${body}</div>
    </div>`;
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

