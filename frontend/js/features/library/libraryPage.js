import { buildLibraryShelfEmpty } from './libraryShelvesPage.js';
import { customShelves, libraryIcon, libraryTools, sortLibraryBooks, renderBookshelfView } from './libraryDesign.js';

export function createLibraryPage({ storage, library, utils, constants, actions = {}, documentRoot } = {}) {
  let boundMain = null;
  const memoryState = new Map();
  const stateKeys = {
    filter: 'libriq_library_filter',
    query: 'libriq_library_query',
    sort: 'libriq_library_sort',
    shelf: 'libriq_library_shelf',
    view: 'libriq_library_view',
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
      viewMode: stateStore.getItem(stateKeys.view) || 'grid',
    };
  }

  function setState(updates) {
    const stateStore = getStateStore();
    Object.entries(updates).forEach(([key, value]) => {
      if (stateKeys[key]) stateStore.setItem(stateKeys[key], value);
    });
  }

  function getShelves(books) {
    return customShelves(books || []);
  }

  function filterAndSortBooks(books, state) {
    const query = (state.query || '').toLowerCase();
    let filtered = books.slice();
    if (state.shelf && state.shelf !== 'all') filtered = filtered.filter(book => Array.isArray(book.tags) && book.tags.includes(state.shelf));
    if (state.filter === 'favorites') filtered = filtered.filter(book => book.isFavorite);
    else if (state.filter !== 'all') filtered = filtered.filter(book => book.status === state.filter);
    if (query) {
      filtered = filtered.filter(book => [book.title, book.author, (book.genres || []).join(' '), book.description || '']
        .join(' ').toLowerCase().includes(query));
    }
    return sortBooks(filtered, state.sort);
  }

  function sortBooks(books, sort) {
    return sortLibraryBooks(books, sort, utils);
  }

  function buildEmpty(filter = 'all', query = '') {
    return buildLibraryShelfEmpty(filter, query, { ...getState(), sanitize: utils.sanitize });
  }

  function renderGrid(books = storage.getBooks()) {
    const grid = getDocument()?.getElementById?.('libraryGrid');
    if (!grid) return;
    const state = getState();
    const filtered = filterAndSortBooks(books, state);
    const summary = getDocument()?.getElementById?.('libraryResultCount');
    if (summary) summary.textContent = `Showing ${state.filter === 'all' && !state.query && state.shelf === 'all' ? 'all ' : ''}${filtered.length} book${filtered.length === 1 ? '' : 's'}`;
    const total = getDocument()?.getElementById?.('libraryVisibleTotal');
    if (total) total.textContent = `${filtered.length} / ${books.length}`;
    const order = getDocument()?.getElementById?.('librarySortSummary');
    if (order) order.textContent = state.sort === 'recently-added' ? 'Your latest additions first' : 'Your collection, your order';
    if (filtered.length === 0) {
      grid.classList?.remove?.('books-shelf-mode');
      grid.innerHTML = buildEmpty(state.filter, state.query);
      return;
    }
    if (state.viewMode === 'shelf') {
      grid.classList?.add?.('books-shelf-mode');
      renderBookshelfView(filtered, grid, utils, {
        showBookDetails: id => actions.showBookDetails?.(id),
      });
    } else {
      grid.classList?.remove?.('books-shelf-mode');
      grid.innerHTML = '';
      filtered.forEach(book => grid.appendChild(library.renderBookCard(book)));
    }
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
    };

    main.innerHTML = `
      <div class="page" id="libraryPage">
        <div class="page-header library-header">
          <div class="library-heading">
            <span class="library-eyebrow">Personal collection</span>
            <h1 class="page-title">My Library</h1>
            <p class="page-subtitle">${books.length} book${books.length !== 1 ? 's' : ''} total</p>
          </div>
          <button class="btn btn-primary library-add-book" type="button" data-action="open-search">${libraryIcon('plus')} Add Book</button>
        </div>
        ${libraryTools(utils, state, shelves).replace('id="librarySearchClear"', 'id="clearLibrarySearch"')}
        <div class="chip-group library-filters" id="libraryFilters">
          <button class="chip${state.filter === 'all' ? ' active' : ''}" data-action="filter-library" data-filter="all">All <span>${counts.all}</span></button>
          <button class="chip${state.filter === 'reading' ? ' active' : ''}" data-action="filter-library" data-filter="reading">Reading <span>${counts.reading}</span></button>
          <button class="chip${state.filter === 'wishlist' ? ' active' : ''}" data-action="filter-library" data-filter="wishlist">Want to Read <span>${counts.wishlist}</span></button>
          <button class="chip${state.filter === 'finished' ? ' active' : ''}" data-action="filter-library" data-filter="finished">Finished <span>${counts.finished}</span></button>
          <button class="chip${state.filter === 'favorites' ? ' active' : ''}" data-action="filter-library" data-filter="favorites">Favorites <span>${counts.favorites}</span></button>
        </div>
        <div class="library-grid-summary"><span id="libraryResultCount" role="status"></span><span id="librarySortSummary"></span></div>
        <div class="books-grid" id="libraryGrid">${books.length === 0 ? buildEmpty() : ''}</div>
        <footer class="library-footer"><span>${libraryIcon('shield')} Your books. Your space.</span><span id="libraryVisibleTotal"></span></footer>
      </div>`;

    bindEvents(main, pageDocument);
    main.querySelectorAll?.('[data-action="filter-library"]').forEach(chip => chip.setAttribute('aria-pressed', String(chip.dataset.filter === state.filter)));
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
        'reset-library-filters': () => {
          setState({ filter: 'all', shelf: 'all', query: '' });
          renderLibraryPage();
        },
        'show-book-details': () => actions.showBookDetails?.(bookId),
        'update-progress': () => actions.updateProgress?.(bookId),
        'toggle-favorite': () => actions.toggleFavorite?.(bookId),
        'remove-book': () => actions.removeBook?.(bookId),
        'filter-library': () => {
          setState({ filter: trigger.dataset.filter });
          main.querySelectorAll?.('.chip').forEach(chip => {
            chip.classList.toggle('active', chip === trigger);
            chip.setAttribute('aria-pressed', String(chip === trigger));
          });
          renderGrid();
        },
        'set-library-view': () => {
          const nextView = trigger.dataset.view === 'shelf' ? 'shelf' : 'grid';
          setState({ view: nextView });
          main.querySelectorAll?.('[data-action="set-library-view"]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === nextView);
          });
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
