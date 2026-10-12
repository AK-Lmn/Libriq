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
