export const librarySortOptions = [
  ['recently-added', 'Recently added'], ['title-az', 'Title A–Z'],
  ['author-az', 'Author A–Z'], ['highest-rated', 'Highest rated'],
  ['reading-progress', 'Reading progress'], ['recently-updated', 'Recently updated'],
];

export function libraryIcon(name) {
  return `<span class="library-icon library-icon--${name}" aria-hidden="true"></span>`;
}

export function libraryTools(utils, state, shelves, prefix = 'library') {
  const shelf = prefix === 'shelf';
  const isShelfView = state.viewMode === 'shelf';
  return `<div class="library-tools">
    <div class="library-search-wrap">
      ${libraryIcon(shelf ? 'shelf-search' : 'search')}
      <input type="search" id="${prefix}SearchInput" class="library-search-input" aria-label="${shelf ? 'Search this shelf' : 'Search your library'}" placeholder="${shelf ? 'Search this shelf...' : 'Search your library...'}" value="${utils.sanitize(state.query)}" autocomplete="off" spellcheck="false" />
      <button type="button" class="library-search-clear" id="${prefix}SearchClear" data-action="clear-${prefix}-search" aria-label="Clear search" ${state.query ? '' : 'hidden'}>${libraryIcon('x')}</button>
    </div>
    <div class="library-sort-wrap">
      <label class="library-sort-label" for="${prefix}SortSelect">Sort by</label>
      <select id="${prefix}SortSelect" class="library-sort-select">
        ${librarySortOptions.map(([value, label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>${libraryIcon('chevron')}
    </div>
    <div class="library-sort-wrap">
      <label class="library-sort-label" for="${prefix}ShelfSelect">Shelf</label>
      <select id="${prefix}ShelfSelect" class="library-sort-select">
        <option value="all" ${state.shelf === 'all' ? 'selected' : ''}>All shelves</option>
        ${shelves.map(name => `<option value="${utils.sanitize(name)}" ${state.shelf === name ? 'selected' : ''}>${utils.sanitize(name)}</option>`).join('')}
      </select>${libraryIcon('chevron')}
    </div>
    <div class="library-view-switcher" role="group" aria-label="View layout">
      <button type="button" class="view-switch-btn ${!isShelfView ? 'active' : ''}" data-action="set-${prefix}-view" data-view="grid" aria-label="Grid layout" title="Grid layout">
        <i class="ph ph-squares-four" aria-hidden="true"></i>
        <span>Grid</span>
      </button>
      <button type="button" class="view-switch-btn ${isShelfView ? 'active' : ''}" data-action="set-${prefix}-view" data-view="shelf" aria-label="Bookshelf spine layout" title="Bookshelf spine layout">
        <i class="ph ph-books" aria-hidden="true"></i>
        <span>Bookshelf</span>
      </button>
    </div>
  </div>`;
}

export function customShelves(books) {
  return [...new Set(books.flatMap(book => Array.isArray(book.tags) ? book.tags : [])
    .map(tag => String(tag || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function sortLibraryBooks(books, sort, utils) {
  const list = books.slice();
  const date = book => new Date(book.dateAdded || 0).getTime();
  switch (sort) {
    case 'title-az': return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    case 'author-az': return list.sort((a, b) => (a.author || '').localeCompare(b.author || ''));
    case 'highest-rated': return list.sort((a, b) => (b.rating || 0) - (a.rating || 0) || date(b) - date(a));
    case 'reading-progress': return list.sort((a, b) => utils.readingProgress(b.currentPage, b.pageCount) - utils.readingProgress(a.currentPage, a.pageCount));
    case 'recently-updated': {
      const updated = book => new Date(book.notesUpdatedAt || book.dateFinished || book.dateStarted || book.dateAdded || 0).getTime();
      return list.sort((a, b) => updated(b) - updated(a));
    }
    default: return list.sort((a, b) => date(b) - date(a));
  }
}

export const SPINE_PALETTES = [
  { bg: 'linear-gradient(135deg, #1E1B4B 0%, #17153B 100%)', text: '#F8FAFC', accent: '#E2C275', border: '#312E81' },
  { bg: 'linear-gradient(135deg, #881337 0%, #700F2B 100%)', text: '#FFF1F2', accent: '#FDE68A', border: '#9F1239' },
  { bg: 'linear-gradient(135deg, #064E3B 0%, #04382A 100%)', text: '#ECFDF5', accent: '#A7F3D0', border: '#065F46' },
  { bg: 'linear-gradient(135deg, #78350F 0%, #5E2A0C 100%)', text: '#FEF3C7', accent: '#FDE68A', border: '#92400E' },
  { bg: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)', text: '#F9FAFB', accent: '#E5E7EB', border: '#374151' },
  { bg: 'linear-gradient(135deg, #1E3A8A 0%, #172554 100%)', text: '#EFF6FF', accent: '#BFDBFE', border: '#1D4ED8' },
  { bg: 'linear-gradient(135deg, #581C87 0%, #3B0764 100%)', text: '#FAF5FF', accent: '#F3E8FF', border: '#6B21A8' },
  { bg: 'linear-gradient(135deg, #134E4A 0%, #042F2E 100%)', text: '#F0FDFA', accent: '#99F6E4', border: '#0F766E' },
];

export function getSpinePalette(book) {
  const str = String(book?.id || book?.title || 'book');
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return {
    palette: SPINE_PALETTES[Math.abs(hash) % SPINE_PALETTES.length],
    height: 195 + (Math.abs(hash) % 35),
    hash,
  };
}

export function buildBookSpine(book, utils, actions = {}) {
  const sanitize = utils?.sanitize || (s => String(s ?? ''));
  const { palette, height } = getSpinePalette(book);
  const pages = Math.max(80, Math.min(1000, Number(book.pageCount) || 280));
  const width = Math.max(30, Math.min(52, 28 + Math.round((pages - 80) / 920 * 24)));
  const currentPage = Math.max(0, Number(book.currentPage) || 0);
  const totalPages = Math.max(0, Number(book.pageCount) || 0);
  const pct = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const isReading = book.status === 'reading';
  const isFinished = book.status === 'finished';

  const spine = document.createElement('div');
  spine.className = 'book-spine';
  spine.bookId = book.id;
  spine.dataset.bookId = book.id;
  spine.dataset.action = 'show-book-details';
  spine.setAttribute('role', 'button');
  spine.setAttribute('tabindex', '0');
  spine.setAttribute('aria-label', `${book.title} by ${book.author || 'Unknown'}`);
  spine.style.setProperty('--spine-bg', palette.bg);
  spine.style.setProperty('--spine-text', palette.text);
  spine.style.setProperty('--spine-accent', palette.accent);
  spine.style.setProperty('--spine-border', palette.border);
  spine.style.setProperty('--spine-height', `${height}px`);
  spine.style.setProperty('--spine-width', `${width}px`);

  spine.innerHTML = `
    <div class="spine-top-accent"></div>
    <div class="spine-ribbon"></div>
    <div class="spine-content">
      <div class="spine-title">${sanitize(book.title)}</div>
      <div class="spine-author">${sanitize(book.author || '')}</div>
    </div>
    <div class="spine-bottom-accent"></div>
    ${book.isFavorite ? '<span class="spine-favorite-star" title="Favorite">★</span>' : ''}
    <div class="spine-popover">
      <div class="spine-popover-cover">
        ${book.coverUrl ? `<img src="${sanitize(book.coverUrl)}" alt="" loading="lazy" />` : '<div class="spine-popover-no-cover"><i class="ph ph-book"></i></div>'}
      </div>
      <div class="spine-popover-info">
        <strong class="spine-popover-title">${sanitize(book.title)}</strong>
        <span class="spine-popover-author">${sanitize(book.author || 'Unknown')}</span>
        <div class="spine-popover-meta">
          ${isReading ? `<span class="spine-status-badge reading">Reading · ${currentPage}/${totalPages} (${pct}%)</span>` : ''}
          ${isFinished ? `<span class="spine-status-badge finished">Finished ★ ${book.rating ? `${book.rating}/5` : ''}</span>` : ''}
          ${book.status === 'wishlist' ? '<span class="spine-status-badge wishlist">Want to Read</span>' : ''}
        </div>
        <span class="spine-popover-hint">Click to inspect</span>
      </div>
    </div>
  `;

  spine.addEventListener('click', (e) => {
    e.stopPropagation();
    actions.showBookDetails?.(book.id);
  });
  spine.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      actions.showBookDetails?.(book.id);
    }
  });

  return spine;
}

export function renderBookshelfView(books, container, utils, actions = {}) {
  container.innerHTML = '';
  if (!books || !books.length) return;

  const showcase = document.createElement('div');
  showcase.className = 'bookshelf-showcase';

  const BOOKS_PER_SHELF = 10;
  for (let i = 0; i < books.length; i += BOOKS_PER_SHELF) {
    const chunk = books.slice(i, i + BOOKS_PER_SHELF);
    const tier = document.createElement('div');
    tier.className = 'bookshelf-tier';

    const spinesRow = document.createElement('div');
    spinesRow.className = 'bookshelf-spines';
    chunk.forEach(book => {
      const spine = buildBookSpine(book, utils, actions);
      spinesRow.appendChild(spine);
    });

    const plank = document.createElement('div');
    plank.className = 'bookshelf-plank';
    plank.innerHTML = '<div class="bookshelf-plank-top"></div><div class="bookshelf-plank-face"></div>';

    tier.appendChild(spinesRow);
    tier.appendChild(plank);
    showcase.appendChild(tier);
  }

  container.appendChild(showcase);
}
