import { customShelves, libraryIcon, libraryTools, sortLibraryBooks, renderBookshelfView } from './libraryDesign.js';

const escapeText = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const shelfCopy = {
  reading: ['Reading Now', 'The books keeping you company.', 'Nothing in progress', 'Pick a book and start reading.'],
  wishlist: ['Want to Read', 'Your next chapter starts here.', 'Queue is clear', 'Add books you want to read next.'],
  finished: ['Finished', 'Every last page, remembered.', 'No finished books yet', 'Keep reading.'],
  favorites: ['Favorites', 'The books you come back to.', 'No favorites yet', 'Save the books you love most here.'],
  dnf: ['Abandoned', 'Not every book is your next chapter. Keep the ones you set aside here.', 'No books set aside', 'Books marked Did Not Finish will appear here. There’s no pressure to finish every story.'],
};

export function buildLibraryShelfEmpty(filter = 'all', query = '', state = {}) {
  const sanitize = state.sanitize || escapeText;
  const selectedShelf = state.shelf && state.shelf !== 'all' ? state.shelf : '';
  const isShelfPage = state.isShelfPage;
  const copy = shelfCopy[filter];
  const [title, body] = query
    ? filter === 'dnf'
      ? ['No matches on this shelf', `No set-aside books match “${query}”. Try another title or author, or clear your search.`]
      : ['No books found.', `Nothing in your library matches “${query}”. Try a title or author, or add the book you’re looking for.`]
    : selectedShelf
      ? filter === 'dnf'
        ? ['No set-aside books in this shelf', `There are no Did Not Finish books in ${selectedShelf}. View all shelves to see the books you’ve set aside.`]
        : ['A little space to fill.', `${selectedShelf} is empty. Find a book to add to this shelf, add one manually, or import a collection.`]
      : copy
        ? copy.slice(2)
        : filter === 'needs-metadata'
          ? ['No metadata issues found', 'Your saved books already look complete.']
          : ['Your story starts here.', 'Make room for your next good read. Search for a book, add one manually, or import your collection.'];
  const context = query ? 'No search matches' : selectedShelf ? `Empty shelf · ${selectedShelf}` : isShelfPage ? '00 books' : 'Empty library · 0 books total';
  const icon = query ? 'search' : filter === 'dnf' ? 'status-dnf' : isShelfPage && copy ? `shelf-empty-${filter}` : selectedShelf ? 'grid' : 'books';
  const recovery = query
    ? `<button class="btn btn-ghost" type="button" data-action="clear-${isShelfPage ? 'shelf' : 'library'}-search">Clear search</button>`
    : selectedShelf
      ? `<button class="btn btn-ghost" type="button" data-action="${isShelfPage ? 'reset-shelf-filters' : 'reset-library-filters'}">View all shelves</button>`
      : isShelfPage
        ? '<button class="btn btn-ghost" type="button" data-action="browse-library">Browse your library →</button>'
        : '';
  return `<div class="empty-state grid-full-width">
    <span class="library-empty-context">${sanitize(context)}</span>
    <div class="empty-state-icon">${libraryIcon(icon)}</div>
    <h2 class="empty-state-title">${sanitize(title)}</h2>
    <p class="empty-state-body">${sanitize(body)}</p>
    <div class="library-empty-actions">
      <button class="btn btn-primary" type="button" data-action="open-search">Search Books</button>
      <button class="btn btn-secondary" type="button" data-action="open-manual-entry">Add Manually</button>
      <button class="btn btn-secondary" type="button" data-action="import-backup">Import Backup</button>
    </div>${recovery}
  </div>`;
}

export function createLibraryShelvesPage({ storage, library, utils, actions = {}, documentRoot }) {
  if (!storage || !library || !utils) throw new TypeError('createLibraryShelvesPage requires storage, library, and utils.');
  const pageDocument = documentRoot || globalThis.document;
  const pageUtils = { ...utils, sanitize: utils.sanitize || escapeText, readingProgress: utils.readingProgress || ((current, total) => total ? current / total : 0) };
  const state = { status: 'reading', query: '', sort: 'recently-updated', shelf: 'all', viewMode: 'grid' };
  let boundMain = null;

  function shelfBooks() {
    return state.status === 'favorites' ? storage.getBooks().filter(book => book.isFavorite) : storage.getBooksByStatus(state.status);
  }

  function renderGrid() {
    const grid = pageDocument.getElementById(state.status === 'favorites' ? 'favoritesGrid' : 'statusGrid');
    if (!grid) return;
    const books = shelfBooks();
    const query = state.query.toLowerCase();
    const filtered = sortLibraryBooks(books.filter(book =>
      (state.shelf === 'all' || (book.tags || []).includes(state.shelf)) &&
      (!query || [book.title, book.author, (book.genres || []).join(' '), book.description].join(' ').toLowerCase().includes(query))
    ), state.sort, pageUtils);
    if (state.viewMode === 'shelf' && filtered.length) {
      grid.classList?.add?.('books-shelf-mode');
      renderBookshelfView(filtered, grid, pageUtils, {
        showBookDetails: id => actions.showBookDetails?.(id),
      });
    } else {
      grid.classList?.remove?.('books-shelf-mode');
      grid.innerHTML = '';
      if (filtered.length) filtered.forEach(book => grid.appendChild(library.renderBookCard(book)));
      else grid.innerHTML = buildLibraryShelfEmpty(state.status, state.query, { ...state, sanitize: pageUtils.sanitize, isShelfPage: true });
    }
    const count = pageDocument.getElementById('shelfResultCount');
    if (count) count.textContent = `${String(filtered.length).padStart(2, '0')} books${state.status === 'reading' ? ' in progress' : ' on this shelf'}`;
    const total = pageDocument.getElementById('shelfPageTotal');
    if (total) total.textContent = `${books.reduce((sum, book) => sum + Math.max(0, Number(book.currentPage) || 0), 0)} / ${books.reduce((sum, book) => sum + Math.max(0, Number(book.pageCount) || 0), 0)} pages · No rush`;
  }

  function renderShelf() {
    const main = pageDocument?.getElementById('mainContent');
    if (!main) return;
    const books = shelfBooks();
    const [title, subtitle] = shelfCopy[state.status] || ['Bookshelf', 'Your books, all in one place.'];
    const pages = books.reduce((sum, book) => sum + Math.max(0, Number(book.currentPage) || 0), 0);

    const existing = main.querySelector ? main.querySelector('#statusPage') : pageDocument.getElementById('statusPage');
    if (existing && (typeof main.contains === 'function' ? main.contains(existing) : main.querySelector?.('#statusPage') === existing)) {
      existing.dataset.shelf = pageUtils.sanitize(state.status);
      const breadcrumbTitle = existing.querySelector('.library-breadcrumb span:last-of-type');
      if (breadcrumbTitle) breadcrumbTitle.textContent = title;
      const h1 = existing.querySelector('.status-heading .page-title');
      if (h1) h1.textContent = title;
      const sub = existing.querySelector('.status-heading .page-subtitle');
      if (sub) sub.textContent = subtitle;
      const pagesEl = existing.querySelector('.shelf-summary span');
      if (pagesEl) pagesEl.textContent = String(pages);
      const dnfNote = existing.querySelector('.shelf-status-note');
      if (state.status === 'dnf') {
        if (!dnfNote && h1) {
          const note = pageDocument.createElement('span');
          note.className = 'shelf-status-note';
          note.innerHTML = `${libraryIcon('status-dnf')} Did Not Finish`;
          h1.insertAdjacentElement('afterend', note);
        }
      } else if (dnfNote) {
        dnfNote.remove();
      }
      existing.querySelectorAll('[data-action="switch-shelf"]').forEach(chip => {
        const active = chip.dataset.status === state.status;
        chip.classList.toggle('active', active);
        chip.setAttribute('aria-pressed', String(active));
      });
      const grid = existing.querySelector('#favoritesGrid, #statusGrid');
      if (grid) grid.id = state.status === 'favorites' ? 'favoritesGrid' : 'statusGrid';
      renderGrid();
      return;
    }

    main.innerHTML = `<div class="page status-page" id="statusPage" data-shelf="${pageUtils.sanitize(state.status)}">
      <div class="library-breadcrumb"><button type="button" class="btn btn-ghost" data-action="browse-library">My Library</button><span aria-hidden="true">›</span><span>${title}</span><button type="button" class="btn btn-primary library-add-book" data-action="open-search">${libraryIcon('plus')} Add book</button></div>
      <div class="page-header status-header">
        <div class="status-heading"><span class="library-eyebrow">Your private library</span><h1 class="page-title">${title}</h1>${state.status === 'dnf' ? `<span class="shelf-status-note">${libraryIcon('status-dnf')} Did Not Finish</span>` : ''}<p class="page-subtitle">${subtitle}</p></div>
        <div class="shelf-summary"><span>${pages}</span><small>pages read across this shelf</small></div>
      </div>
      ${libraryTools(pageUtils, state, customShelves(storage.getBooks()), 'shelf')}
      <div class="library-filters shelf-filters" aria-label="Bookshelves">
        ${Object.entries(shelfCopy).map(([status, [label]]) => {
          const count = status === 'favorites' ? storage.getBooks().filter(book => book.isFavorite).length : storage.getBooksByStatus(status).length;
          return `<button type="button" class="chip${state.status === status ? ' active' : ''}" data-action="switch-shelf" data-status="${status}" aria-pressed="${state.status === status}">${status === 'dnf' ? 'Did Not Finish' : label}<span>${String(count).padStart(2, '0')}</span></button>`;
        }).join('')}
      </div>
      <div class="library-grid-summary"><span id="shelfResultCount" role="status"></span>${libraryIcon('grid')}</div>
      <div class="books-grid" id="${state.status === 'favorites' ? 'favoritesGrid' : 'statusGrid'}"></div>
      <footer class="library-footer"><span>${libraryIcon('lock')} Your pace. Your library.</span><span id="shelfPageTotal"></span></footer>
    </div>`;
    renderGrid();
    bindShelfActions(main);
  }

  function renderStatusPage(status) {
    if (status === 'abandoned') status = 'dnf';
    if (state.status !== status) Object.assign(state, { query: '', shelf: 'all' });
    state.status = status;
    renderShelf();
  }

  function renderFavoritesPage() { renderStatusPage('favorites'); }

  function clearSearch() {
    state.query = '';
    const input = pageDocument.getElementById('shelfSearchInput');
    if (input) input.value = '';
    const button = pageDocument.getElementById('shelfSearchClear');
    if (button) button.hidden = true;
    renderGrid();
  }

  function bindShelfActions(main) {
    if (boundMain === main) return;
    boundMain = main;
    main.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action]');
      if (!trigger) return;
      const handlers = {
        'open-search': () => actions.openSearch?.(),
        'open-manual-entry': () => actions.openManualEntry?.(),
        'import-backup': () => actions.importBackup?.(),
        'clear-shelf-search': clearSearch,
        'browse-library': () => actions.navigate?.('library'),
        'reset-shelf-filters': () => { Object.assign(state, { query: '', shelf: 'all' }); renderShelf(); },
        'switch-shelf': () => {
          renderStatusPage(trigger.dataset.status);
          actions.navigate?.(trigger.dataset.status === 'dnf' ? 'abandoned' : trigger.dataset.status);
        },
        'set-shelf-view': () => {
          const nextView = trigger.dataset.view === 'shelf' ? 'shelf' : 'grid';
          state.viewMode = nextView;
          main.querySelectorAll?.('[data-action="set-shelf-view"]').forEach(btn => {
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
    main.addEventListener('input', event => {
      if (event.target.id !== 'shelfSearchInput') return;
      state.query = event.target.value.trim();
      const button = pageDocument.getElementById('shelfSearchClear');
      if (button) button.hidden = !state.query;
      renderGrid();
    });
    main.addEventListener('change', event => {
      if (event.target.id === 'shelfSortSelect') state.sort = event.target.value;
      else if (event.target.id === 'shelfShelfSelect') state.shelf = event.target.value;
      else return;
      renderGrid();
    });
  }

  return { renderStatusPage, renderFavoritesPage };
}
