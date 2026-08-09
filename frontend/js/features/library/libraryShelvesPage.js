export function buildLibraryShelfEmpty(filter = 'all', query = '', state = {}) {
  const messages = {
    all: ['Your library is empty', 'Search for books to build your collection.'],
    reading: ['Nothing in progress', 'Pick a book and start reading.'],
    wishlist: ['Queue is clear', 'Add books you want to read next.'],
    finished: ['No finished books yet', 'Keep reading — you\'re getting there.'],
    favorites: ['No favorites yet', 'Save the books you love most here.'],
    'needs-metadata': ['No metadata issues found', 'Your saved books already look complete.'],
  };
  const selectedShelf = state.shelf && state.shelf !== 'all' ? state.shelf : '';
  const hasQuery = Boolean(query);
  const [title, body] = hasQuery
    ? ['No books match your search.', 'Try a different keyword, add a book manually, or clear the search to see everything again.']
    : selectedShelf
      ? [`No books on "${selectedShelf}"`, 'Try another shelf or add this book to a shelf.']
      : (messages[filter] || messages.all);

  return `
    <div class="empty-state grid-full-width">
      <div class="empty-state-icon"><i class="ph ph-books"></i></div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-body">${body}</div>
      ${hasQuery ? `<button class="btn btn-secondary" type="button" data-action="clear-library-search"><i class="ph ph-x"></i> Clear Search</button>` : `
        <button class="btn btn-primary" type="button" data-action="open-search">
          <i class="ph ph-magnifying-glass"></i> Search Books
        </button>
        <button class="btn btn-secondary" type="button" data-action="open-manual-entry">
          <i class="ph ph-pencil"></i> Add Manually
        </button>
        <button class="btn btn-secondary" type="button" data-action="import-backup">
          <i class="ph ph-upload-simple"></i> Import Backup
        </button>
      `}
    </div>`;
}

export function createLibraryShelvesPage({ storage, library, utils, actions, documentRoot }) {
  if (!storage || !library || !utils) {
    throw new TypeError('createLibraryShelvesPage requires storage, library, and utils.');
  }
  const pageDocument = documentRoot || globalThis.document;
  let boundMain = null;

  function renderStatusPage(status, title, iconClass) {
    const main = pageDocument?.getElementById('mainContent');
    if (!main) return;
    const books = storage.getBooksByStatus(status);
    const summaries = {
      reading: ['Reading queue', 'Books you are currently moving through.'],
      wishlist: ['Wishlist', 'Books saved for later.'],
      finished: ['Finished shelf', 'Books you have completed.'],
    };
    const [eyebrow, subtitle] = summaries[status] || ['Reading list', 'Books on this shelf.'];
    const summaryLabel = `${books.length} book${books.length !== 1 ? 's' : ''}`;

    main.innerHTML = `
      <div class="page status-page" id="statusPage">
        <div class="page-header status-header">
          <div class="status-heading">
            <span class="library-eyebrow">${eyebrow}</span>
            <h1 class="page-title">${title}</h1>
            <p class="page-subtitle">${summaryLabel}${subtitle ? ` · ${subtitle}` : ''}</p>
          </div>
        </div>
        <div class="books-grid" id="statusGrid"></div>
      </div>`;

    const grid = pageDocument.getElementById('statusGrid');
    if (books.length === 0) {
      grid.innerHTML = buildLibraryShelfEmpty(status, '', actions?.getLibraryState?.());
    } else {
      books.forEach(book => grid.appendChild(library.renderBookCard(book)));
    }
    bindShelfActions(main);
  }

  function renderFavoritesPage() {
    const main = pageDocument?.getElementById('mainContent');
    if (!main) return;
    const books = storage.getBooks().filter(book => book.isFavorite);

    main.innerHTML = `
      <div class="page status-page" id="statusPage">
        <div class="page-header status-header">
          <div class="status-heading">
            <span class="library-eyebrow">Favorite books</span>
            <h1 class="page-title">Favorites</h1>
            <p class="page-subtitle">${books.length} book${books.length !== 1 ? 's' : ''} saved with a heart</p>
          </div>
        </div>
        <div class="books-grid" id="favoritesGrid"></div>
      </div>`;

    const grid = pageDocument.getElementById('favoritesGrid');
    if (books.length === 0) {
      grid.innerHTML = `
        <div class="empty-state grid-full-width">
          <div class="empty-state-icon"><i class="ph ph-heart"></i></div>
          <div class="empty-state-title">No favorites yet</div>
          <div class="empty-state-body">Tap the heart on any book to save it here.</div>
        </div>`;
    } else {
      books.forEach(book => grid.appendChild(library.renderBookCard(book)));
    }
    bindShelfActions(main);
  }

  function bindShelfActions(main) {
    if (boundMain === main) return;
    boundMain = main;
    main.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action]');
      if (!trigger) return;
      const handlers = {
        'open-search': () => actions?.openSearch?.(),
        'open-manual-entry': () => actions?.openManualEntry?.(),
        'import-backup': () => actions?.importBackup?.(),
        'clear-library-search': () => actions?.clearSearch?.(),
      };
      handlers[trigger.dataset.action]?.();
    });
  }

  return { renderStatusPage, renderFavoritesPage };
}
