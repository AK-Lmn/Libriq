/* ============================================
   LIBRIQ SEARCH
   Open Library API integration + local search
   ============================================ */

const Search = (() => {
  // API communication is fully handled by BookAPI (js/api/index.js).
  // This module is responsible only for UI, rendering, and user interaction.

  let currentQuery = '';
  let focusedIndex = -1;
  let results = [];
  let searchDebounced;

  // ── Elements ─────────────────────────────

  function getEls() {
    return {
      modal:       document.getElementById('searchModal'),
      input:       document.getElementById('searchInput'),
      resultsArea: document.getElementById('searchResults'),
      emptyState:  document.getElementById('searchEmptyState'),
    };
  }

  // ── Open / Close ─────────────────────────

  function open() {
    const { modal, input } = getEls();
    Utils.show(modal);
    requestAnimationFrame(() => input.focus());
    document.body.style.overflow = 'hidden';
  }

  function close() {
    const { modal, input, resultsArea } = getEls();
    Utils.hide(modal);
    input.value = '';
    currentQuery = '';
    results = [];
    focusedIndex = -1;
    _clearResults();  // safe clear that never destroys #searchEmptyState
    document.body.style.overflow = '';
  }

  function openManualEntry() {
    close();
    Library.showAddModal({}, { manual: true });
  }

  // Remove all dynamic result nodes while keeping #searchEmptyState intact.
  // Never use resultsArea.innerHTML = '' — that destroys the static empty-state
  // element and causes appendChild(null) on the next close() call.
  function _clearResults() {
    const { resultsArea, emptyState } = getEls();
    // Remove every child except the empty-state element
    Array.from(resultsArea.childNodes).forEach(node => {
      if (node !== emptyState) resultsArea.removeChild(node);
    });
    Utils.show(emptyState);
  }

  // ── Search execution ─────────────────────

  async function executeSearch(query) {
    const { resultsArea, emptyState } = getEls();

    // OL's FastAPI layer returns HTTP 422 for queries shorter than 3 characters.
    if (!query || query.length < 3) {
      _clearResults();
      return;
    }

    // Hide empty state, show loading spinner
    Utils.hide(emptyState);
    // Remove any previous result nodes (keep emptyState hidden in place)
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
        BookAPI.searchBooks(query),   // delegates to OL + GB merge via api/index.js
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

  // ── Render results ────────────────────────

  function renderResults(localResults, apiResults) {
    const { resultsArea, emptyState } = getEls();

    // Remove the spinner and any previous result rows, keeping emptyState in place
    Array.from(resultsArea.childNodes).forEach(node => {
      if (node !== emptyState) resultsArea.removeChild(node);
    });
    focusedIndex = -1;

    if (localResults.length === 0 && apiResults.length === 0) {
      // Show the persistent empty-state node with a custom message
      emptyState.innerHTML = `
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

    // Keep emptyState hidden while results are showing
    Utils.hide(emptyState);

    // In-library results
    if (localResults.length > 0) {
      resultsArea.insertAdjacentHTML('beforeend',
        `<div class="search-section-label">In Your Library</div>`);
      localResults.forEach(book => {
        resultsArea.appendChild(buildLocalResultItem(book));
      });
    }

    // API results
    if (apiResults.length > 0) {
      resultsArea.insertAdjacentHTML('beforeend',
        `<div class="search-section-label">From the web</div>`);
      apiResults.forEach(book => {
        resultsArea.appendChild(buildApiResultItem(book));
      });
    }
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
        <div class="search-result-description">${Utils.sanitize(book.description || 'No description available.')}</div>
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
      b.title.toLowerCase() === book.title.toLowerCase() &&
      b.author.toLowerCase() === book.author.toLowerCase()
    );

    const el = document.createElement('div');
    el.className = 'search-result-item';
    el.innerHTML = `
      ${Utils.buildCover(book, 'cover-xs')}
      <div class="search-result-info">
        <div class="search-result-title">${Utils.sanitize(book.title)}</div>
        <div class="search-result-author">${Utils.sanitize(book.author)}</div>
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
    desc.textContent = book.description || 'No description available.';
    el.querySelector('.search-result-info')?.appendChild(desc);

    // Add to library button
    const addBtn = el.querySelector('[data-add-book]');
    if (addBtn) {
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAddModal(book);
      });
    }

    return el;
  }

  // ── Keyboard nav ─────────────────────────

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

  // ── Add modal trigger ─────────────────────

  function openAddModal(bookData) {
    close();
    Library.showAddModal(bookData);
  }

  // ── Init ─────────────────────────────────

  function init() {
    const { input } = getEls();

    searchDebounced = Utils.debounce((q) => {
      currentQuery = q;
      executeSearch(q);
    }, 350);

    // Input handler
    input.addEventListener('input', (e) => {
      searchDebounced(e.target.value.trim());
    });

    // Open triggers
    document.getElementById('openSearch')?.addEventListener('click', open);
    document.getElementById('mobileSearchBtn')?.addEventListener('click', open);
    document.getElementById('closeSearch')?.addEventListener('click', close);

    // Keyboard shortcut ⌘K / Ctrl+K
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const { modal } = getEls();
        modal.hasAttribute('hidden') ? open() : close();
      }
      handleKeydown(e);
    });

    // Click overlay to close
    document.getElementById('searchModal')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) close();
    });

    document.getElementById('searchManualEntry')?.addEventListener('click', openManualEntry);
  }

  return { init, open, close, openManualEntry };
})();

