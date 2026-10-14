import { Storage } from './storage.js';
import { Utils } from './utils.js';

import { BookAPI } from './api/index.js';
import { Library } from './library.js';

export const Search = (() => {
  const Identity = {
    isSameBook: (...args) => BookAPI.isSameBook(...args),
    getSourceLabels: (...args) => BookAPI.getSourceLabels(...args),
  };
  let currentQuery = '';
  let focusedIndex = -1;
  let results = [];
  let searchDebounced;
  let filtersOpen = false;
  let activeFilters = _defaultFilters();
  let initialized = false;
  let searchRevision = 0;

  function getEls() {
    return {
      modal:       document.getElementById('searchModal'),
      input:       document.getElementById('searchInput'),
      resultsArea: document.getElementById('searchResults'),
      emptyState:  document.getElementById('searchEmptyState'),
      advancedToggle: document.getElementById('searchAdvancedToggle'),
      advancedReset:  document.getElementById('searchAdvancedReset'),
      advancedPanel:  document.getElementById('searchAdvancedFilters'),
      filterCount:    document.getElementById('searchFilterCount'),
      filterAuthor:   document.getElementById('searchFilterAuthor'),
      filterYear:     document.getElementById('searchFilterYear'),
      filterGenre:    document.getElementById('searchFilterGenre'),
      filterSource:   document.getElementById('searchFilterSource'),
      filterDesc:     document.getElementById('searchFilterDescription'),
      filterCover:    document.getElementById('searchFilterCover'),
    };
  }

  function _defaultFilters() {
    return {
      author: '',
      year: '',
      genre: '',
      source: 'all',
      hasDescription: false,
      hasCover: false,
    };
  }

  let _lastSearchTrigger = null;

  function open(trigger = document.activeElement) {
    _lastSearchTrigger = trigger instanceof HTMLElement ? trigger : null;
    const { modal, input } = getEls();
    Utils.show(modal, { trigger: _lastSearchTrigger, initialFocus: input });
    _syncFiltersUI();
    requestAnimationFrame(() => input.focus());
  }

  function updateShortcutLabel() {
    const badge = document.getElementById('searchShortcutBadge');
    if (badge) badge.textContent = Utils.getSearchShortcutLabel();
    const desktopBadge = document.getElementById('searchShortcutBadgeDesktop');
    if (desktopBadge) desktopBadge.textContent = Utils.getSearchShortcutLabel();
  }

  function close() {
    const { modal, input, resultsArea } = getEls();
    Utils.hide(modal);
    input.value = '';
    currentQuery = '';
    searchRevision += 1;
    results = [];
    focusedIndex = -1;
    activeFilters = _defaultFilters();
    filtersOpen = false;
    _syncFiltersUI();
    _setDefaultEmptyState();
    _clearResults();
    if (_lastSearchTrigger?.isConnected) {
      _lastSearchTrigger.focus?.({ preventScroll: true });
    }
    _lastSearchTrigger = null;
  }

  function _setStatus(message, busy = false) {
    const status = document.getElementById('searchStatus');
    if (status) status.textContent = message;
    getEls().resultsArea?.setAttribute('aria-busy', String(busy));
  }

  function _setDefaultEmptyState() {
    const { emptyState } = getEls();
    emptyState.innerHTML = `
      <i class="ph ph-books" aria-hidden="true"></i>
      <h3>A whole world of stories</h3>
      <p>Search by title, author, or ISBN to find your next read.</p>`;
    _setStatus('Enter at least 3 characters to search.');
  }

  function _showRecovery(icon, title, message, reset = false) {
    const { emptyState } = getEls();
    emptyState.innerHTML = `
      <i class="ph ph-${icon}" aria-hidden="true"></i>
      <h3>${Utils.sanitize(title)}</h3>
      <p>${Utils.sanitize(message)}</p>
      <div class="search-recovery-actions">
        ${reset ? '<button class="btn btn-ghost" type="button" data-reset-filters>Reset filters</button>' : ''}
        <button class="btn btn-primary search-manual-btn" type="button" data-manual-entry>
          <i class="ph ph-pencil" aria-hidden="true"></i> Add Manually
        </button>
      </div>`;
    emptyState.querySelector('[data-manual-entry]')?.addEventListener('click', openManualEntry);
    emptyState.querySelector('[data-reset-filters]')?.addEventListener('click', resetFilters);
    Utils.show(emptyState);
    _setStatus(title);
  }

  function openManualEntry() {
    close();
    requestAnimationFrame(() => Library.showAddModal({}, { manual: true }));
  }

  function _clearResults() {
    const { resultsArea, emptyState } = getEls();
    Array.from(resultsArea.childNodes).forEach(node => {
      if (node !== emptyState) resultsArea.removeChild(node);
    });
    Utils.show(emptyState);
  }

  async function executeSearch(query) {
    const revision = ++searchRevision;
    const { resultsArea, emptyState } = getEls();

    if (!query || query.length < 3) {
      _setDefaultEmptyState();
      _clearResults();
      return;
    }

    Utils.hide(emptyState);
    _setStatus('Searching your library and book providers…', true);
    Array.from(resultsArea.childNodes).forEach(node => {
      if (node !== emptyState) resultsArea.removeChild(node);
    });
    resultsArea.insertAdjacentHTML('afterbegin', `
      <div class="search-loading" id="searchSpinner">
        <div class="spinner"></div>
        <h3>Finding your next read</h3>
        <span>Searching your library and book providers…</span>
      </div>`);

    try {
      const [localResults, apiResults] = await Promise.all([
        searchLocal(query),
        BookAPI.searchBooks(query),
      ]);
      if (revision !== searchRevision) return;

      results = [...localResults.map(r => ({ ...r, _source: 'local' })),
                 ...apiResults.map(r => ({ ...r, _source: 'api' }))];

      renderResults(localResults, apiResults);
    } catch (err) {
      if (revision !== searchRevision) return;
      console.error('[Libriq] Search error:', err);
      _clearResults();
      _showRecovery('wifi-slash', 'Couldn’t connect', 'Check your internet and try again, or add the book manually.');
    }
  }

  function searchLocal(query) {
    const q = query.toLowerCase();
    return Promise.resolve(
      Storage.getBooks().filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.isbn || '').includes(q)
      ).slice(0, 3)
    );
  }

  function renderResults(localResults, apiResults) {
    const { resultsArea, emptyState } = getEls();
    const searchMeta = typeof BookAPI.getLastSearchMeta === 'function'
      ? BookAPI.getLastSearchMeta()
      : { offline: false, fromCache: false, blockedOffline: false };

    Array.from(resultsArea.childNodes).forEach(node => {
      if (node !== emptyState) resultsArea.removeChild(node);
    });
    focusedIndex = -1;

    if (localResults.length === 0 && apiResults.length === 0) {
      const offlineMessage = 'You’re offline. Saved library features still work, but online book search needs internet.';
      _showRecovery(searchMeta.blockedOffline || searchMeta.offline ? 'wifi-slash' : 'magnifying-glass',
        searchMeta.blockedOffline || searchMeta.offline ? 'Online search is unavailable' : 'No books found',
        searchMeta.blockedOffline || searchMeta.offline ? offlineMessage : `No results found for “${currentQuery}”. Try another title or add it manually.`);
      return;
    }

    Utils.hide(emptyState);
    _setDefaultEmptyState();

    if (localResults.length > 0) {
      resultsArea.insertAdjacentHTML('beforeend',
        `<div class="search-section-label">In Your Library <span>${localResults.length}</span></div>`);
      localResults.forEach(book => {
        resultsArea.appendChild(buildLocalResultItem(book));
      });
    }

    const filteredApiResults = _applyAdvancedFilters(apiResults);

    if (localResults.length === 0 && filteredApiResults.length === 0) {
      _showRecovery('funnel', 'No matching books', 'Try fewer filters to see more results, or add the book manually.', true);
    } else {
      _setStatus(`${localResults.length + filteredApiResults.length} books found${_filtersActive() ? ' with your filters' : ''}.`);
    }

    if (filteredApiResults.length > 0) {
      resultsArea.insertAdjacentHTML('beforeend',
        `<div class="search-section-label">From the web${searchMeta.fromCache && searchMeta.offline ? ' <span class="search-section-filtered">cached, offline</span>' : _filtersActive() ? ' <span class="search-section-filtered">filtered</span>' : ''}</div>`);
      filteredApiResults.forEach(book => {
        resultsArea.appendChild(buildApiResultItem(book));
      });
    }

    _updateFilterCount();
  }

  function buildLocalResultItem(book) {
    const el = document.createElement('div');
    el.className = 'search-result-item';
    el.dataset.id = book.id;
    el.innerHTML = `
      ${Utils.buildCover(book, 'cover-xs')}
      <div class="search-result-info">
        <div class="search-result-title">${Utils.sanitize(book.title)}</div>
        <div class="search-result-author">${Utils.sanitize(book.author)}</div>
        <div class="search-result-meta">
          <span class="badge ${Utils.statusBadgeClass(book.status)}">
            ${Utils.statusLabel(book.status)}
          </span>
        </div>
        <div class="search-result-description">${Utils.sanitize(_previewDescription(book))}</div>
      </div>
      <div class="search-result-add">
        <button class="btn btn-ghost btn-sm" aria-label="View in your library" data-nav="library">
          <i class="ph ph-arrow-right"></i>
        </button>
      </div>`;
    const navBtn = el.querySelector('[data-nav="library"]');
    if (navBtn) {
      navBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        close();
        if (window.Navigation?.goTo) {
          window.Navigation.goTo('library');
        } else if (window.LibriqNavigation?.goTo) {
          window.LibriqNavigation.goTo('library');
        }
      });
    }
    el.addEventListener('click', close);
    return el;
  }

  function buildApiResultItem(book) {
    const existingBook = Storage.getBooks().find(b =>
      Identity.isSameBook(b, book)
    );
    const sourceBadges = Array.isArray(book.sourceBadges) ? book.sourceBadges : Identity.getSourceLabels(book);
    const sourceBadgeHtml = sourceBadges.length
      ? `<div class="search-result-source-badges">${sourceBadges.map(label => `<span class="badge badge-accent">${Utils.sanitize(label)}</span>`).join('')}</div>`
      : '';

    const el = document.createElement('div');
    el.className = 'search-result-item';
    el.innerHTML = `
      ${Utils.buildCover(book, 'cover-xs')}
      <div class="search-result-info">
        <div class="search-result-title">${Utils.sanitize(book.title)}</div>
        <div class="search-result-author">${Utils.sanitize(book.author)}</div>
        ${sourceBadgeHtml}
        <div class="search-result-meta">
          ${book.publishYear ? `${book.publishYear} · ` : ''}
          ${book.pageCount ? Utils.formatPages(book.pageCount) : ''}
        </div>
      </div>
      <div class="search-result-add">
        ${existingBook
          ? `<span class="badge badge-accent">Added</span>`
          : `<button class="btn btn-primary btn-sm" data-add-book>
               <i class="ph ph-plus"></i> Add
             </button>`
        }
      </div>`;

    const desc = document.createElement('div');
    desc.className = 'search-result-description';
    desc.textContent = _previewDescription(book);
    el.querySelector('.search-result-info')?.appendChild(desc);

    const addBtn = el.querySelector('[data-add-book]');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddModal(book);
      });
    }

    return el;
  }

  function handleKeydown(e) {
    const { modal } = getEls();
    if (modal.hasAttribute('hidden')) return;

    const items = Utils.$$('.search-result-item');

    if (e.key === 'Escape') {
      close();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
      updateFocus(items);
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = Math.max(focusedIndex - 1, 0);
      updateFocus(items);
    }

    if (e.key === 'Enter' && focusedIndex >= 0 && e.target === getEls().input) {
      e.preventDefault();
      const item = items[focusedIndex];
      (item?.querySelector('button') || item)?.click();
    }
  }

  function updateFocus(items) {
    items.forEach((el, i) => el.classList.toggle('focused', i === focusedIndex));
    items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function openAddModal(bookData) {
    close();
    requestAnimationFrame(() => Library.showAddModal(bookData));
  }

  function _previewDescription(book) {
    return BookAPI.chooseBestDescription([
      { text: book?.shortDescription, source: book?.source || 'search-snippet', language: book?.language, snippet: true },
      { text: book?.description, source: book?.source || 'search-description', language: book?.language, full: true },
    ], { preferShort: true }) || 'No description available yet.';
  }

  function readFiltersFromUI() {
    const els = getEls();
    return {
      author: (els.filterAuthor?.value || '').trim(),
      year: (els.filterYear?.value || '').trim(),
      genre: (els.filterGenre?.value || '').trim(),
      source: els.filterSource?.value || 'all',
      hasDescription: !!els.filterDesc?.checked,
      hasCover: !!els.filterCover?.checked,
    };
  }

  function _filtersActive() {
    return Boolean(
      activeFilters.author ||
      activeFilters.year ||
      activeFilters.genre ||
      activeFilters.source !== 'all' ||
      activeFilters.hasDescription ||
      activeFilters.hasCover
    );
  }

  function _updateFilterCount() {
    const { filterCount } = getEls();
    if (!filterCount) return;
    const count = [
      activeFilters.author,
      activeFilters.year,
      activeFilters.genre,
      activeFilters.source !== 'all',
      activeFilters.hasDescription,
      activeFilters.hasCover,
    ].filter(Boolean).length;
    filterCount.textContent = String(count);
    filterCount.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  function toggleAdvancedFilters(force) {
    const { advancedPanel, advancedToggle } = getEls();
    filtersOpen = typeof force === 'boolean' ? force : !filtersOpen;
    if (advancedPanel) Utils.toggle(advancedPanel, filtersOpen);
    advancedToggle?.setAttribute('aria-expanded', filtersOpen ? 'true' : 'false');
  }

  function _syncFiltersUI() {
    const els = getEls();
    if (els.filterAuthor) els.filterAuthor.value = activeFilters.author;
    if (els.filterYear) els.filterYear.value = activeFilters.year;
    if (els.filterGenre) els.filterGenre.value = activeFilters.genre;
    if (els.filterSource) els.filterSource.value = activeFilters.source;
    if (els.filterDesc) els.filterDesc.checked = activeFilters.hasDescription;
    if (els.filterCover) els.filterCover.checked = activeFilters.hasCover;
    toggleAdvancedFilters(filtersOpen);
    _updateFilterCount();
  }

  function _applyAdvancedFilters(apiResults) {
    return apiResults.filter(book => {
      if (activeFilters.source !== 'all') {
        const source = String(book.source || '').toLowerCase();
        if (source !== activeFilters.source) return false;
      }

      if (activeFilters.author) {
        const author = String(book.author || '').toLowerCase();
        if (!author.includes(activeFilters.author.toLowerCase())) return false;
      }

      if (activeFilters.year) {
        const year = Number.parseInt(activeFilters.year, 10);
        if (!Number.isNaN(year) && Number(book.publishYear || 0) !== year) return false;
      }

      if (activeFilters.genre) {
        const genres = Array.isArray(book.genres) ? book.genres : [];
        const haystack = genres.join(' ').toLowerCase();
        if (!haystack.includes(activeFilters.genre.toLowerCase())) return false;
      }

      if (activeFilters.hasDescription && !String(book.description || '').trim()) return false;
      if (activeFilters.hasCover && !book.coverUrl) return false;

      return true;
    });
  }

  function applyFiltersFromUI() {
    activeFilters = readFiltersFromUI();
    if (currentQuery) {
      renderResults(
        results.filter(r => r._source === 'local'),
        results.filter(r => r._source === 'api')
      );
    }
  }

  function resetFilters() {
    activeFilters = _defaultFilters();
    filtersOpen = false;
    _syncFiltersUI();
    if (currentQuery) executeSearch(currentQuery);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    const { input } = getEls();

    searchDebounced = Utils.debounce((q) => {
      if (getEls().modal.hidden || q !== getEls().input.value.trim()) return;
      currentQuery = q;
      executeSearch(q);
    }, 350);

    input.addEventListener('input', (e) => {
      searchRevision += 1;
      searchDebounced(e.target.value.trim());
    });

    updateShortcutLabel();

    document.getElementById('openSearch')?.addEventListener('click', open);
    document.getElementById('openSearchDesktop')?.addEventListener('click', open);
    document.getElementById('mobileSearchBtn')?.addEventListener('click', open);
    document.getElementById('closeSearch')?.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      const isApple = Utils.isApplePlatform();
      const matchesShortcut = isApple ? e.metaKey : e.ctrlKey;
      if (matchesShortcut && e.key === 'k') {
        e.preventDefault();
        const { modal } = getEls();
        modal.hasAttribute('hidden') ? open() : close();
      }
      handleKeydown(e);
    });

    document.getElementById('searchModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close();
    });
    document.getElementById('searchModal')?.addEventListener('dialog:close', close);

    document.getElementById('searchManualEntry')?.addEventListener('click', openManualEntry);
    document.getElementById('searchAdvancedToggle')?.addEventListener('click', () => toggleAdvancedFilters());
    document.getElementById('searchAdvancedReset')?.addEventListener('click', resetFilters);

    ['searchFilterAuthor', 'searchFilterYear', 'searchFilterGenre', 'searchFilterSource', 'searchFilterDescription', 'searchFilterCover'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const eventName = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(eventName, applyFiltersFromUI);
    });
  }

  return { init, open, close, openManualEntry, updateShortcutLabel };
})();

if (typeof window !== 'undefined') window.Search = Search;
