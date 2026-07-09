/* ============================================
   LIBRIQ SEARCH
   Open Library API integration + local search
   ============================================ */

const Search = (() => {
  const Identity = window.BookIdentity || globalThis.BookIdentity || {
    isSameBook: (left, right) => {
      const clean = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      return clean(left?.title) === clean(right?.title) && clean(left?.author) === clean(right?.author);
    },
    getSourceLabels: () => [],
  };
  let currentQuery = '';
  let focusedIndex = -1;
  let results = [];
  let searchDebounced;
  let filtersOpen = false;
  let activeFilters = _defaultFilters();

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

  function open() {
    const { modal, input } = getEls();
    Utils.show(modal);
    _syncFiltersUI();
    requestAnimationFrame(() => input.focus());
    document.body.style.overflow = 'hidden';
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
    results = [];
    focusedIndex = -1;
    activeFilters = _defaultFilters();
    filtersOpen = false;
    _syncFiltersUI();
    _clearResults();
    document.body.style.overflow = '';
  }

  function _setDefaultEmptyState(message = 'Search for any book to add it to your library') {
    const { emptyState } = getEls();
    emptyState.innerHTML = `
      <i class="ph ph-books"></i>
      <p>${Utils.sanitize(message)}</p>`;
  }

  function openManualEntry() {
    close();
    Library.showAddModal({}, { manual: true });
  }

  function _clearResults() {
    const { resultsArea, emptyState } = getEls();
    Array.from(resultsArea.childNodes).forEach(node => {
      if (node !== emptyState) resultsArea.removeChild(node);
    });
    Utils.show(emptyState);
  }

  async function executeSearch(query) {
    const { resultsArea, emptyState } = getEls();

    if (!query || query.length < 3) {
      _setDefaultEmptyState();
      _clearResults();
      return;
    }

    Utils.hide(emptyState);
    emptyState.innerHTML = `
      <i class="ph ph-books"></i>
      <p>Search for any book to add it to your library</p>`;
    Array.from(resultsArea.childNodes).forEach(node => {
      if (node !== emptyState) resultsArea.removeChild(node);
    });
    resultsArea.insertAdjacentHTML('afterbegin', `
      <div class="search-loading" id="searchSpinner">
        <div class="spinner"></div>
        <span>Searching…</span>
      </div>`);

    try {
      const [localResults, apiResults] = await Promise.all([
        searchLocal(query),
        BookAPI.searchBooks(query),
      ]);

      results = [...localResults.map(r => ({ ...r, _source: 'local' })),
                 ...apiResults.map(r => ({ ...r, _source: 'api' }))];

      renderResults(localResults, apiResults);
    } catch (err) {
      console.error('[Libriq] Search error:', err);
      _clearResults();
      const { emptyState } = getEls();
      Utils.hide(emptyState);
      const errEl = document.createElement('div');
      errEl.className = 'search-empty-state';
      errEl.innerHTML = `<i class="ph ph-wifi-slash"></i><p>Couldn't connect. Check your internet and try again.</p>`;
      getEls().resultsArea.appendChild(errEl);
    }
  }

  /** Search the user's local library */
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
      emptyState.innerHTML = searchMeta.blockedOffline || searchMeta.offline
        ? `
        <i class="ph ph-wifi-slash"></i>
        <p>${offlineMessage}</p>`
        : `
        <i class="ph ph-magnifying-glass"></i>
        <p>No results found for "<strong>${Utils.sanitize(currentQuery)}</strong>"</p>`;
      emptyState.insertAdjacentHTML('beforeend', `
        <button class="btn btn-primary btn-sm search-manual-btn" type="button" data-manual-entry>
          <i class="ph ph-pencil"></i>
          Add Manually
        </button>`);
      emptyState.querySelector('[data-manual-entry]')?.addEventListener('click', openManualEntry);
      Utils.show(emptyState);
      return;
    }

    Utils.hide(emptyState);
    _setDefaultEmptyState();

    if (localResults.length > 0) {
      resultsArea.insertAdjacentHTML('beforeend',
        `<div class="search-section-label">In Your Library</div>`);
      localResults.forEach(book => {
        resultsArea.appendChild(buildLocalResultItem(book));
      });
    }

    const filteredApiResults = _applyAdvancedFilters(apiResults);

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
        <button class="btn btn-ghost btn-sm" onclick="Navigation.goTo('library')">
          <i class="ph ph-arrow-right"></i>
        </button>
      </div>`;
    el.addEventListener('click', (e) => {
      if (!e.target.closest('.btn')) close();
    });
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

    if (e.key === 'Enter' && focusedIndex >= 0) {
      items[focusedIndex]?.click();
    }
  }

  function updateFocus(items) {
    items.forEach((el, i) => el.classList.toggle('focused', i === focusedIndex));
    items[focusedIndex]?.scrollIntoView({ block: 'nearest' });
  }

  function openAddModal(bookData) {
    close();
    Library.showAddModal(bookData);
  }

  function _previewDescription(book) {
    const helper = typeof NormalizeBook !== 'undefined' ? NormalizeBook : null;
    return helper?.chooseBestDescription?.([
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
    const { input } = getEls();

    searchDebounced = Utils.debounce((q) => {
      currentQuery = q;
      executeSearch(q);
    }, 350);

    input.addEventListener('input', (e) => {
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

