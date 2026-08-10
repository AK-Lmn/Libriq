import { buildLibraryShelfEmpty } from './libraryShelvesPage.js';

export function createLibraryPage({ storage, library, utils, constants, actions = {}, documentRoot } = {}) {
  let boundMain = null;
  const memoryState = new Map();
  const stateKeys = {
    filter: 'libriq_library_filter',
    query: 'libriq_library_query',
    sort: 'libriq_library_sort',
    shelf: 'libriq_library_shelf',
  };

  const getDocument = () => documentRoot || globalThis.document;
  const getStateStore = () => actions.stateStorage || globalThis.sessionStorage || {
    getItem: key => memoryState.get(key) || null,
    setItem: (key, value) => memoryState.set(key, String(value)),
  };

  function getState() {
    const stateStore = getStateStore();
    return {
      filter: stateStore.getItem(stateKeys.filter) || 'all',
      query: stateStore.getItem(stateKeys.query) || '',
      sort: stateStore.getItem(stateKeys.sort) || 'recently-added',
      shelf: stateStore.getItem(stateKeys.shelf) || 'all',
    };
  }

  function setState(updates) {
    const stateStore = getStateStore();
    Object.entries(updates).forEach(([key, value]) => {
      if (stateKeys[key]) stateStore.setItem(stateKeys[key], value);
    });
  }

  function getShelves(books) {
    return Array.from(new Set(
      (books || []).flatMap(book => Array.isArray(book.tags) ? book.tags : [])
        .map(tag => String(tag || '').trim()).filter(Boolean)
    )).sort((a, b) => a.localeCompare(b));
  }

  function bookNeedsMetadata(book) {
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

  function filterAndSortBooks(books, state) {
    const query = (state.query || '').toLowerCase();
    let filtered = books.slice();
    if (state.shelf && state.shelf !== 'all') filtered = filtered.filter(book => Array.isArray(book.tags) && book.tags.includes(state.shelf));
    if (state.filter === 'favorites') filtered = filtered.filter(book => book.isFavorite);
    else if (state.filter === 'needs-metadata') filtered = filtered.filter(book => bookNeedsMetadata(book).length > 0);
    else if (state.filter !== 'all') filtered = filtered.filter(book => book.status === state.filter);
    if (query) {
      filtered = filtered.filter(book => [book.title, book.author, (book.genres || []).join(' '), book.description || '']
        .join(' ').toLowerCase().includes(query));
    }
    return sortBooks(filtered, state.sort);
  }

  function sortBooks(books, sort) {
    const list = books.slice();
    const byDate = field => (a, b) => new Date(b[field] || 0) - new Date(a[field] || 0);
    switch (sort) {
      case 'title-az': return list.sort((a, b) => a.title.localeCompare(b.title));
      case 'author-az': return list.sort((a, b) => a.author.localeCompare(b.author));
      case 'highest-rated': return list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0));
      case 'reading-progress': return list.sort((a, b) => utils.readingProgress(b.currentPage, b.pageCount) - utils.readingProgress(a.currentPage, a.pageCount));
      case 'recently-updated': return list.sort((a, b) => {
        const aTime = new Date(a.notesUpdatedAt || a.dateFinished || a.dateStarted || a.dateAdded || 0).getTime();
        const bTime = new Date(b.notesUpdatedAt || b.dateFinished || b.dateStarted || b.dateAdded || 0).getTime();
        return bTime - aTime;
      });
      case 'recently-added':
      default: return list.sort(byDate('dateAdded'));
    }
  }

  function buildEmpty(filter = 'all', query = '') {
    return buildLibraryShelfEmpty(filter, query, getState());
  }

  function renderGrid(books = storage.getBooks()) {
    const grid = getDocument()?.getElementById?.('libraryGrid');
    if (!grid) return;
    const state = getState();
    const filtered = filterAndSortBooks(books, state);
    if (filtered.length === 0) {
      grid.innerHTML = buildEmpty(state.filter, state.query);
      return;
    }
    grid.innerHTML = '';
    filtered.forEach(book => grid.appendChild(library.renderBookCard(book)));
  }

  function renderLibraryPage({ root } = {}) {
    const pageDocument = getDocument();
    const main = root || pageDocument?.getElementById?.('mainContent');
    if (!main) {
      console.error('[LibriQ] Missing #mainContent while rendering library page.');
      return;
    }
    const books = storage.getBooks();
    const state = getState();
    const shelves = getShelves(books);
    const counts = {
      all: books.length,
      reading: books.filter(book => book.status === constants.STATUS.READING).length,
      wishlist: books.filter(book => book.status === constants.STATUS.WISHLIST).length,
      finished: books.filter(book => book.status === constants.STATUS.FINISHED).length,
      favorites: books.filter(book => book.isFavorite).length,
      needsMetadata: books.filter(book => bookNeedsMetadata(book).length > 0).length,
    };

    main.innerHTML = `
      <div class="page" id="libraryPage">
        <div class="page-header library-header">
          <div class="library-heading">
            <span class="library-eyebrow">Personal collection</span>
            <h1 class="page-title">My Library</h1>
            <p class="page-subtitle">${books.length} book${books.length !== 1 ? 's' : ''} total</p>
          </div>
          <button class="btn btn-primary" type="button" data-action="open-search"><i class="ph ph-plus"></i> Add Book</button>
        </div>
        <div class="library-tools">
          <div class="library-search-wrap">
            <i class="ph ph-magnifying-glass library-search-icon"></i>
            <input type="search" id="librarySearchInput" class="library-search-input" placeholder="Search your library..." value="${utils.sanitize(state.query)}" autocomplete="off" spellcheck="false" />
            <button type="button" class="library-search-clear" id="clearLibrarySearch" data-action="clear-library-search" aria-label="Clear search" ${state.query ? '' : 'hidden'}><i class="ph ph-x"></i></button>
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
          ${shelves.length ? `<div class="library-sort-wrap">
            <label class="library-sort-label" for="libraryShelfSelect">Shelf</label>
            <select id="libraryShelfSelect" class="library-sort-select">
              <option value="all" ${state.shelf === 'all' ? 'selected' : ''}>All shelves</option>
              ${shelves.map(shelf => `<option value="${utils.sanitize(shelf)}" ${state.shelf === shelf ? 'selected' : ''}>${utils.sanitize(shelf)}</option>`).join('')}
            </select>
          </div>` : ''}
        </div>
        <div class="chip-group library-filters" id="libraryFilters">
          <button class="chip${state.filter === 'all' ? ' active' : ''}" data-action="filter-library" data-filter="all">All <span>${counts.all}</span></button>
          <button class="chip${state.filter === 'reading' ? ' active' : ''}" data-action="filter-library" data-filter="reading">Reading <span>${counts.reading}</span></button>
          <button class="chip${state.filter === 'wishlist' ? ' active' : ''}" data-action="filter-library" data-filter="wishlist">Want to Read <span>${counts.wishlist}</span></button>
          <button class="chip${state.filter === 'finished' ? ' active' : ''}" data-action="filter-library" data-filter="finished">Finished <span>${counts.finished}</span></button>
          <button class="chip${state.filter === 'favorites' ? ' active' : ''}" data-action="filter-library" data-filter="favorites">Favorites <span>${counts.favorites}</span></button>
          <button class="chip${state.filter === 'needs-metadata' ? ' active' : ''}" data-action="filter-library" data-filter="needs-metadata">Needs Metadata <span>${counts.needsMetadata}</span></button>
        </div>
        <div class="books-grid" id="libraryGrid">${books.length === 0 ? buildEmpty() : ''}</div>
      </div>`;

    bindEvents(main, pageDocument);
    renderGrid(books);
    if (pageDocument.getElementById('librarySearchInput') && state.query) pageDocument.getElementById('librarySearchInput').focus();
  }

  function bindEvents(main, pageDocument) {
    if (boundMain === main) return;
    boundMain = main;
    main.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action]');
      if (!trigger) return;
      const bookId = trigger.dataset.bookId;
      const handlers = {
        'open-search': () => actions.openSearch?.(),
        'open-manual-entry': () => actions.openManualEntry?.(),
        'import-backup': () => actions.importBackup?.(),
        'clear-library-search': () => clearSearch(),
        'show-book-details': () => actions.showBookDetails?.(bookId),
        'update-progress': () => actions.updateProgress?.(bookId),
        'toggle-favorite': () => actions.toggleFavorite?.(bookId),
        'remove-book': () => actions.removeBook?.(bookId),
        'filter-library': () => {
          setState({ filter: trigger.dataset.filter });
          main.querySelectorAll?.('.chip').forEach(chip => chip.classList.toggle('active', chip === trigger));
          renderGrid();
        },
      };
      if (!handlers[trigger.dataset.action]) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      handlers[trigger.dataset.action]();
    });
    main.addEventListener('input', utils.debounce(event => {
      if (event.target.id !== 'librarySearchInput') return;
      const query = event.target.value.trim();
      setState({ query });
      const clearButton = pageDocument.getElementById('clearLibrarySearch');
      if (clearButton) clearButton.hidden = !query;
      renderGrid();
    }, 150));
    main.addEventListener('change', event => {
      if (event.target.id === 'librarySortSelect') setState({ sort: event.target.value });
      else if (event.target.id === 'libraryShelfSelect') setState({ shelf: event.target.value });
      else return;
      renderGrid();
    });
  }

  function clearSearch() {
    setState({ query: '' });
    const searchInput = getDocument()?.getElementById?.('librarySearchInput');
    const clearButton = getDocument()?.getElementById?.('clearLibrarySearch');
    if (searchInput) searchInput.value = '';
    if (clearButton) clearButton.hidden = true;
    renderGrid();
  }

  renderLibraryPage.getState = getState;
  renderLibraryPage.clearSearch = clearSearch;
  renderLibraryPage.filterAndSortBooks = filterAndSortBooks;
  return renderLibraryPage;
}

export function initLibraryEvents(container, actions = {}) {
  if (!container || container.dataset.libraryEventsBound === 'true') return () => {};
  const onClick = event => {
    const trigger = event.target.closest?.('[data-action]');
    if (!trigger || !container.contains?.(trigger)) return;
    const bookId = trigger.dataset.bookId;
    const handlers = {
      'open-search': () => actions.openSearch?.(),
      'open-manual-entry': () => actions.openManualEntry?.(),
      'import-backup': () => actions.importBackup?.(),
      'clear-library-search': () => actions.clearSearch?.(),
      'show-book-details': () => actions.showBookDetails?.(bookId),
      'update-progress': () => actions.updateProgress?.(bookId),
      'toggle-favorite': () => actions.toggleFavorite?.(bookId),
      'remove-book': () => actions.removeBook?.(bookId),
    };
    if (!handlers[trigger.dataset.action]) return;
    event.preventDefault();
    event.stopPropagation();
    handlers[trigger.dataset.action]();
  };
  container.dataset.libraryEventsBound = 'true';
  container.addEventListener('click', onClick);
  return () => {
    container.removeEventListener?.('click', onClick);
    delete container.dataset.libraryEventsBound;
  };
}
