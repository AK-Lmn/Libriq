/* ============================================
   LIBRIQ NAVIGATION
   Client-side routing and page management
   ============================================ */

const Navigation = (() => {
  let _currentPage = 'dashboard';

  // ── Page registry ─────────────────────────
  // Each page must export a render() function
  const pages = {
    dashboard: () => Dashboard.render(),
    library:   () => renderLibraryPage(),
    reading:   () => renderStatusPage(LIBRIQ.STATUS.READING,  'Currently Reading', 'ph-book-open'),
    wishlist:  () => renderStatusPage(LIBRIQ.STATUS.WISHLIST, 'Want to Read',      'ph-bookmark'),
    finished:  () => renderStatusPage(LIBRIQ.STATUS.FINISHED, 'Finished Books',    'ph-check-circle'),
    favorites: () => renderFavoritesPage(),
    stats:     () => renderStatsPage(),
    goals:     () => renderGoalsPage(),
    profile:   () => renderProfilePage(),
    settings:  () => renderSettingsPage(),
  };

  // ── Go to page ────────────────────────────

  function goTo(page) {
    if (!pages[page]) return;
    _currentPage = page;

    // Update nav active state
    Utils.$$('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
      el.setAttribute('aria-current', el.dataset.page === page ? 'page' : 'false');
    });

    // Close mobile sidebar
    closeMobileSidebar();

    // Render the page
    pages[page]();

    // Scroll to top
    document.getElementById('mainContent').scrollTop = 0;
  }

  function renderCurrentPage() {
    if (pages[_currentPage]) pages[_currentPage]();
  }

  // ── Sidebar ───────────────────────────────

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

  // ── Badges ────────────────────────────────

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

    // Streak
    const streak = Storage.getStreak();
    const streakEl = document.getElementById('streakCount');
    if (streakEl) streakEl.textContent = streak.current;
  }

  // ── Theme ─────────────────────────────────

  // applyTheme() is the single function that reads
  // the saved theme and updates the DOM. Called on
  // init AND after a data reset so the toggle always
  // reflects the current profile state.
  function applyTheme() {
    const profile  = Storage.getProfile();
    const theme    = (profile && profile.theme) ? profile.theme : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    _updateThemeToggleUI(theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    Storage.saveProfile({ theme: next });
    _updateThemeToggleUI(next);
  }

  function _updateThemeToggleUI(theme) {
    const icon  = document.getElementById('themeIcon');
    const label = document.getElementById('themeLabel');
    if (icon)  icon.className   = theme === 'dark' ? 'ph ph-moon' : 'ph ph-sun';
    if (label) label.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
  }

  // ── Init ─────────────────────────────────

  function init() {
    // Nav item clicks
    Utils.$$('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => goTo(btn.dataset.page));
    });

    // Mobile sidebar
    document.getElementById('mobileMenuBtn')?.addEventListener('click', openMobileSidebar);
    document.getElementById('sidebarOverlay')?.addEventListener('click', closeMobileSidebar);

    // Theme toggle
    document.getElementById('themeToggle')?.addEventListener('click', toggleTheme);

    applyTheme();
    updateBadges();
  }

  return {
    init, goTo, renderCurrentPage, updateBadges, toggleTheme, applyTheme,
    clearLibrarySearch,
    get currentPage() { return _currentPage; },
  };
})();

Navigation.exportData = exportData;
Navigation.promptImportData = promptImportData;
Navigation.importDataFromFile = importDataFromFile;
Navigation.clearAllData = clearAllData;

/* ============================================
   PAGE RENDERERS
   Inline here for now — can be split into
   separate page files as the app grows
   ============================================ */

// ── Library Page (all books) ─────────────────

function renderLibraryPage() {
  const main  = document.getElementById('mainContent');
  const books = Storage.getBooks();
  const state = _getLibraryState();
  const counts = {
    all: books.length,
    reading: books.filter(b => b.status === LIBRIQ.STATUS.READING).length,
    wishlist: books.filter(b => b.status === LIBRIQ.STATUS.WISHLIST).length,
    finished: books.filter(b => b.status === LIBRIQ.STATUS.FINISHED).length,
    favorites: books.filter(b => b.isFavorite).length,
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
      </div>

      <!-- Filters -->
      <div class="chip-group library-filters" id="libraryFilters">
        <button class="chip active" data-filter="all">All <span>${counts.all}</span></button>
        <button class="chip" data-filter="reading">Reading <span>${counts.reading}</span></button>
        <button class="chip" data-filter="wishlist">Want to Read <span>${counts.wishlist}</span></button>
        <button class="chip" data-filter="finished">Finished <span>${counts.finished}</span></button>
        <button class="chip" data-filter="favorites">Favorites <span>${counts.favorites}</span></button>
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
  };
}

function _setLibraryState(updates) {
  if ('filter' in updates) sessionStorage.setItem('libriq_library_filter', updates.filter);
  if ('query' in updates) sessionStorage.setItem('libriq_library_query', updates.query);
  if ('sort' in updates) sessionStorage.setItem('libriq_library_sort', updates.sort);
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

  if (state.filter === 'favorites') filtered = filtered.filter(b => b.isFavorite);
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
  };
  const hasQuery = !!query;
  const [title, body] = hasQuery
    ? ['No books match your search.', 'Try a different keyword or clear the search to see everything again.']
    : (messages[filter] || messages.all);
  return `
    <div class="empty-state" style="grid-column: 1/-1;">
      <div class="empty-state-icon"><i class="ph ph-books"></i></div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-body">${body}</div>
      ${hasQuery ? `<button class="btn btn-secondary" onclick="Navigation.clearLibrarySearch()"><i class="ph ph-x"></i> Clear Search</button>` : `
        <button class="btn btn-primary" onclick="Search.open()">
          <i class="ph ph-magnifying-glass"></i> Search Books
        </button>`}
    </div>`;
}

// ── Status Pages ─────────────────────────────

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

// ── Favorites ─────────────────────────────────

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

// ── Stats Page ────────────────────────────────

function renderStatsPage() {
  const main  = document.getElementById('mainContent');
  const stats = Storage.getStats();
  const goals = Storage.getGoals();
  const streak = Storage.getStreak();
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
        <div class="goal-header"><div class="goal-title">Data</div></div>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Export library</div>
            <div class="activity-subtitle">Download your data as JSON</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="Navigation.exportData()">
            <i class="ph ph-download-simple"></i> Export
          </button>
        </div>
        <div class="activity-item" style="cursor:default; padding: var(--space-3) 0;">
          <div class="activity-text">
            <div class="activity-title">Import library</div>
            <div class="activity-subtitle">Restore a LibriQ backup from JSON</div>
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
        <input id="importLibraryInput" type="file" accept="application/json,.json" hidden onchange="Navigation.importDataFromFile(this.files?.[0])" />
      </div>

      <div class="goal-widget">
        <div class="goal-header"><div class="goal-title">About</div></div>
        <p class="text-sm text-secondary" style="line-height: var(--leading-loose);">
          <strong style="color: var(--text-primary);">LibriQ</strong> v2.4.0<br>
          Your reading life, beautifully organized.<br>
          Book data from <a href="https://openlibrary.org" target="_blank" style="color: var(--text-accent);">Open Library</a> and <a href="https://books.google.com" target="_blank" style="color: var(--text-accent);">Google Books</a>.
        </p>
      </div>
    </div>`;
}

async function exportData() {
  const data = {
    app: 'LibriQ',
    version: LIBRIQ.VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      books: Storage.getBooks(),
      profile: Storage.getProfile(),
      goals: Storage.getGoals(),
      streak: Storage.getStreak(),
    },
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `libriq-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  Utils.toast('Library exported', 'success');
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

  const replaceMode = confirm('OK replaces your current local library. Cancel merges the backup into your current library.');
  const importedBooks = parsed.data.books.map(book => createBook(book));
  const mergedBooks = replaceMode
    ? importedBooks
    : _mergeBooksById(Storage.getBooks(), importedBooks);

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

  Utils.toast(replaceMode ? 'Library replaced from backup' : 'Library merged from backup', 'success');
  updateBadges();
  renderCurrentPage();
}

function _mergeBooksById(currentBooks, importedBooks) {
  const byId = new Map();
  currentBooks.forEach(book => byId.set(book.id, book));
  importedBooks.forEach(book => byId.set(book.id, book));
  return Array.from(byId.values());
}

function clearAllData() {
  if (!confirm('This will delete all your books and settings. Are you sure?')) return;

  // Storage.resetAll() removes all Libriq keys then immediately
  // re-runs bootstrap() so every key exists with valid defaults.
  // The libriq:reset event (dispatched inside resetAll) is caught
  // in app.js, which re-applies the theme and navigates to dashboard.
  // No page reload needed — the app returns to a fully valid state.
  Storage.resetAll();
  Utils.toast('Library cleared. Starting fresh.', 'info');
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

