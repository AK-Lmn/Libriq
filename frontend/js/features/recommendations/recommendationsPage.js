export function createRecommendationsPage({ storage, library, bookApi, utils, constants, actions, documentRoot }) {
  if (!storage || !library || !bookApi || !utils || !constants || !actions) {
    throw new TypeError('createRecommendationsPage requires storage, library, bookApi, utils, constants, and actions.');
  }
  const pageDocument = documentRoot || globalThis.document;
  const recommendationBooks = new Map();
  let boundMain = null;
  let renderVersion = 0;
  let selectedFilter = 'all';
  let discoveries = [];
  let discoveryLoading = false;
  let filters = [];

  function renderRecommendationsPage() {
    const main = pageDocument.getElementById('mainContent');
    if (!main) {
      console.error('[LibriQ] Missing #mainContent while rendering recommendations page.');
      return Promise.resolve();
    }
    const version = ++renderVersion;
    const books = (storage.getBooks() || []).filter(Boolean);
    const state = _buildRecommendationState(books);
    const rated = books.filter(book => typeof book.rating === 'number' && book.rating > 0);
    const average = rated.length ? (rated.reduce((sum, book) => sum + book.rating, 0) / rated.length).toFixed(1) : '—';
    const saved = _savedPicks(books, state);
    const rails = _buildSubjectDiscoveryState(books).rails;
    filters = [{ key: 'all', label: 'For you' }, ...rails.slice(0, 2).map(rail => ({ key: rail.subjectKey, label: rail.label })), { key: 'gutenberg-classics', label: 'Free classics' }];
    if (!filters.some(filter => filter.key === selectedFilter)) selectedFilter = 'all';
    recommendationBooks.clear();
    discoveries = [];
    discoveryLoading = state.hasSignal && actions.isOnline();
    main.innerHTML = `
      <div class="page recommendations-page discover-page" id="recommendationsPage">
        <header class="discover-introduction">
          <div class="discover-state-row">
            <span class="discover-eyebrow">${state.hasSignal ? '<span class="discover-state-dark">DARK · GLASS</span><span class="discover-state-light">LIGHT · GLASS</span><span class="discover-state-solid">REDUCED TRANSPARENCY · SOLID</span>' : 'EMPTY LIBRARY SIGNAL'}</span>
            <span class="discover-privacy">${buildDiscoverIcon('lock-keyhole', 12)} Just for you</span>
          </div>
          <h1 class="discover-title">Your next chapter.</h1>
          <div class="discover-signals discover-glass">
            <div class="discover-summary">
              <p>${state.hasSignal ? 'A few books that feel like you.' : 'A space for discoveries that feel like you.'}</p>
              <p>${state.hasSignal ? 'Drawn from your favorites, ratings, authors and want-to-read shelf.' : 'Recommendations grow from the books you save.'}</p>
            </div>
            ${state.hasSignal ? `<dl class="discover-metrics">
              <div><dt>saved</dt><dd>${books.length}</dd></div>
              <div><dt>favorites</dt><dd>${books.filter(book => book.isFavorite).length.toString().padStart(2, '0')}</dd></div>
              <div><dt>avg. rating</dt><dd>${average}</dd></div>
            </dl>` : ''}
          </div>
        </header>
        ${state.hasSignal ? `<section class="discover-picks" aria-labelledby="discoverPickedTitle">
          <div class="discover-section-header"><h2 id="discoverPickedTitle">Picked for you</h2><div class="discover-refresh-group"><span id="discoverPickCount" class="discover-eyebrow">PICKING BOOKS</span><button type="button" class="discover-refresh" data-action="refresh-recommendations">Refresh</button></div></div>
          <div id="discoverFilters" class="discover-filters" aria-label="Reading interests">${buildDiscoverFilters()}</div>
          <div id="subjectDiscoveryRoot" class="recommendation-card-grid discover-grid" aria-live="polite" aria-busy="true"></div>
          <div id="gutenbergDiscoveryRoot" class="discover-sr-only" role="status"></div>
        </section>
        ${saved.length ? `<section class="discover-saved" aria-labelledby="discoverSavedTitle"><div class="discover-section-header"><h2 id="discoverSavedTitle">Waiting on your shelf</h2><p>${saved.every(pick => pick.book.status === constants.STATUS.WISHLIST) ? 'From your want-to-read list' : 'From your saved books'}</p></div><div class="discover-saved-grid">${saved.map(({ book, reason }) => buildRecommendationCard(book, reason)).join('')}</div></section>` : ''}` : buildDiscoverEmpty(books.length)}
        <p class="discover-private-note">${buildDiscoverIcon('lock-keyhole', 12)}<span>Your library is the signal. No public profiles. No popularity rankings.</span></p>
      </div>`;
    bindRecommendationActions(main);
    if (!state.hasSignal) return Promise.resolve();
    return hydrateDiscoveries(books, rails, version, main);
  }

  async function hydrateDiscoveries(books, rails, version, main) {
    const root = pageDocument.getElementById('subjectDiscoveryRoot');
    const classicsRoot = pageDocument.getElementById('gutenbergDiscoveryRoot');
    if (!root) return;
    root.setAttribute?.('aria-busy', 'true');
    if (!actions.isOnline()) {
      root.innerHTML = '<p class="discover-message">Connect to the internet to discover new books. Your saved books are still available below.</p>';
      root.setAttribute?.('aria-busy', 'false');
      if (classicsRoot) classicsRoot.innerHTML = '';
      return;
    }
    root.innerHTML = '<p class="discover-message">Loading subject picks from Open Library…</p>';
    if (classicsRoot) classicsRoot.innerHTML = 'Loading free classics…';
    const requests = [...rails.map(rail => ({ ...rail, load: () => bookApi.searchBySubject(rail.subjectKey, { limit: rail.limit }) })), { subjectKey: 'gutenberg-classics', label: 'Free classics', load: () => bookApi.searchCuratedClassics({ limit: 6, topic: 'classics' }) }];
    const results = await Promise.allSettled(requests.map(request => Promise.resolve().then(request.load)));
    if (version !== renderVersion || (typeof main.querySelector === 'function' && !main.querySelector('#recommendationsPage'))) return;
    const seen = [];
    // Interleave providers so one subject cannot crowd out the other reading signals.
    for (let index = 0; index < 6; index++) {
      results.forEach((result, railIndex) => {
        const book = result.status === 'fulfilled' && Array.isArray(result.value) ? result.value[index] : null;
        if (!book || books.some(saved => bookApi.isSameBook(saved, book))) return;
        const request = requests[railIndex];
        const existing = seen.find(pick => bookApi.isSameBook(pick.book, book));
        if (existing) {
          if (!existing.filters.includes(request.subjectKey)) existing.filters.push(request.subjectKey);
          return;
        }
        seen.push({ book, filters: [request.subjectKey], reason: request.subjectKey === 'gutenberg-classics' ? 'A free classic from Project Gutenberg.' : `More to explore from your ${request.label.toLowerCase()} reading interests.` });
      });
    }
    discoveries = seen;
    discoveryLoading = false;
    if (classicsRoot) classicsRoot.innerHTML = results.at(-1).status === 'rejected' ? 'Free classics are unavailable right now.' : 'Free classics loaded.';
    renderDiscoveryCards();
  }

  function renderDiscoveryCards() {
    const root = pageDocument.getElementById('subjectDiscoveryRoot');
    if (!root) return;
    const filtersRoot = pageDocument.getElementById('discoverFilters');
    if (filtersRoot) filtersRoot.innerHTML = buildDiscoverFilters();
    if (discoveryLoading) return;
    const picks = discoveries.filter(pick => selectedFilter === 'all' || pick.filters.includes(selectedFilter)).slice(0, 4);
    root.innerHTML = picks.length ? picks.map(pick => buildRecommendationCard(pick.book, pick.reason)).join('') : '<div class="discover-message"><p>No new picks are available for this interest right now.</p><p>Try another interest, refresh, or search for your next book.</p><button type="button" class="discover-add" data-action="open-search">Search books</button></div>';
    root.setAttribute?.('aria-busy', 'false');
    const count = pageDocument.getElementById('discoverPickCount');
    if (count) count.textContent = `${picks.length.toString().padStart(2, '0')} BOOKS`;
  }

  function buildDiscoverFilters() {
    return filters.map(filter => `<button type="button" class="discover-filter" data-action="filter-recommendations" data-filter="${utils.sanitize(filter.key)}" aria-pressed="${selectedFilter === filter.key}">${utils.sanitize(filter.label)}</button>`).join('');
  }

  function buildDiscoverEmpty(count) {
    return `<section class="discover-empty discover-glass" aria-labelledby="discoverEmptyTitle">
      <div class="discover-empty-message">
        <div class="discover-book-silhouettes" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="discover-invitation"><span class="discover-eyebrow">A LITTLE MORE TO GO ON</span><h2 id="discoverEmptyTitle">Let your shelf lead the way.</h2><p>Save a few books you love, then add a rating or a favorite. Discover will find its direction from your reading, not from everyone else’s.</p><div class="discover-threshold"><span>${Math.min(count, 3).toString().padStart(2, '0')} / 03</span><progress max="3" value="${Math.min(count, 3)}" aria-label="Books saved toward your first three"></progress><span>books saved</span></div><button type="button" class="discover-add" data-action="open-search">${buildDiscoverIcon('plus', 16)} Add a book</button></div>
      </div>
      <div class="discover-suggestions">${[['bookmark', 'Save three books', 'Read, reading or want to read.'], ['heart', 'Mark a favorite', 'A book you would happily read again.'], ['star', 'Add a rating', 'A small signal of what stays with you.']].map(([icon, title, body]) => `<div>${buildDiscoverIcon(icon, 20)}<h3>${title}</h3><p>${body}</p></div>`).join('')}</div>
      <button class="discover-library-link" type="button" data-action="open-library">Open Library</button>
    </section>`;
  }

  function _buildSubjectDiscoveryState(books) {
    const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
    const subjectCounts = new Map();
    const pickSubject = (value) => String(value || '').trim().toLowerCase();

    safeBooks.forEach((book) => {
      const weight = (book.isFavorite ? 4 : 1) + (typeof book.rating === 'number' ? book.rating : 0) + (book.status === constants.STATUS.FINISHED ? 2 : 0);
      const subjects = _subjectCandidatesFromBook(book);
      subjects.forEach((subject) => {
        const key = pickSubject(subject);
        if (!key) return;
        subjectCounts.set(key, (subjectCounts.get(key) || 0) + weight);
      });
    });

    const fallback = ['fiction', 'fantasy', 'romance', 'mystery', 'science fiction', 'classics', 'history', 'self improvement'];
    const ranked = [...subjectCounts.entries()].sort((a, b) => b[1] - a[1]).map(([key]) => key);
    const selected = ranked.length ? ranked.slice(0, 3) : fallback.slice(0, 3);

    const labelMap = {
      'science fiction': 'Science Fiction',
      'self improvement': 'Self Improvement',
    };

    return {
      rails: selected.map((subjectKey) => ({
        label: labelMap[subjectKey] || utils.formatDisplayName(subjectKey),
        subjectKey,
        limit: 6,
      })),
    };
  }

  function _subjectCandidatesFromBook(book) {
    const values = [];
    if (Array.isArray(book?.subjects)) values.push(...book.subjects);
    if (Array.isArray(book?.genres)) values.push(...book.genres);
    if (book?.isFavorite || book?.status === constants.STATUS.FINISHED || book?.status === constants.STATUS.READING) {
      values.push(...(Array.isArray(book?.genres) ? book.genres : []));
    }
    return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
  }


  function _buildRecommendationState(books) {
    const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
    if (safeBooks.length === 0) return { hasSignal: false, groups: [] };

    const ratedBooks = safeBooks.filter(book => typeof book.rating === 'number' && book.rating > 0);
    const highRatedBooks = ratedBooks.filter(book => book.rating >= 4);
    const readingBooks = safeBooks.filter(book => book.status === constants.STATUS.READING);
    const wishlistBooks = safeBooks.filter(book => book.status === constants.STATUS.WISHLIST);
    const finishedBooks = safeBooks.filter(book => book.status === constants.STATUS.FINISHED);

    const genreScores = new Map();
    const authorScores = new Map();

    safeBooks.forEach(book => {
      const genreWeight = _recommendationWeight(book);
      _bookGenres(book).forEach(genre => {
        genreScores.set(genre, (genreScores.get(genre) || 0) + genreWeight);
      });

      const author = _cleanBookAuthor(book.author);
      if (author && _isRecognizedAuthor(book)) {
        authorScores.set(author, (authorScores.get(author) || 0) + _recommendationWeight(book, 1));
      }
    });

    const topGenre = [...genreScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const topAuthor = [...authorScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const moodGenre = _mostCommonGenre(readingBooks);

    const groups = [];

    if (topGenre) {
      const booksForGenre = safeBooks
        .filter(book => _bookGenres(book).some(g => _normalizeText(g) === _normalizeText(topGenre)))
        .filter(book => book.status !== constants.STATUS.FINISHED)
        .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
        .slice(0, 4);
      if (booksForGenre.length) {
        groups.push({ title: 'Because you like this genre', label: topGenre, books: booksForGenre });
      }
    }

    if (topAuthor) {
      const booksByAuthor = safeBooks
        .filter(book => _cleanBookAuthor(book.author) === topAuthor)
        .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
        .slice(0, 4);
      if (booksByAuthor.length) {
        groups.push({ title: 'Books from authors you’ve saved', label: 'Based on authors already in your library', books: booksByAuthor });
      }
    }

    if (highRatedBooks.length) {
      groups.push({
        title: 'Highly rated in your library',
        label: 'Saved books with strong ratings',
        books: [...highRatedBooks]
          .sort((a, b) => (b.rating || 0) - (a.rating || 0) || _dateValue(b.dateAdded) - _dateValue(a.dateAdded))
          .slice(0, 4),
      });
    }

    if (moodGenre) {
      const moodBooks = safeBooks
        .filter(book => book.status !== constants.STATUS.FINISHED)
        .filter(book => _bookGenres(book).some(g => _normalizeText(g) === _normalizeText(moodGenre)))
        .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
        .slice(0, 4);
      if (moodBooks.length) {
        groups.push({ title: 'Continue your reading mood', label: moodGenre, books: moodBooks });
      }
    }

    if (wishlistBooks.length) {
      groups.push({
        title: 'From your Want to Read shelf',
        label: 'Saved for later',
        showCardReason: false,
        books: [...wishlistBooks]
          .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
          .slice(0, 4),
      });
    }

    if (!groups.length && safeBooks.length >= 3) {
      const fallback = [...safeBooks]
        .sort((a, b) => _recommendationScore(b) - _recommendationScore(a))
        .slice(0, 4);
      if (fallback.length) {
        groups.push({
          title: 'Suggested from your library',
          label: 'Recently added and lightly scored',
          books: fallback,
        });
      }
    }

    return {
      hasSignal: groups.length > 0,
      groups,
    };
  }


  function _savedPicks(books, state) {
    const ordered = [...books.filter(book => book.status === constants.STATUS.WISHLIST), ...state.groups.flatMap(group => group.books)];
    const seen = new Set();
    return ordered.filter(book => {
      if (seen.has(book.id)) return false;
      seen.add(book.id);
      return true;
    }).slice(0, 2).map(book => ({ book, reason: book.status === constants.STATUS.WISHLIST ? 'Already on your list. A next read from your want-to-read shelf.' : 'Already in your library. Revisit a book you have saved.' }));
  }

  function buildDiscoverIcon(name, size) {
    const hasLight = ['plus', 'lock-keyhole', 'bookmark-check', 'arrow-up-right'].includes(name);
    return `<span class="discover-icon ${hasLight ? 'discover-icon-switch' : ''}" aria-hidden="true" data-icon="${name}"><img class="discover-icon-dark" src="assets/revamp/discover/dark-${name}.svg" width="${size}" height="${size}" alt="">${hasLight ? `<img class="discover-icon-light" src="assets/revamp/discover/light-${name}.svg" width="${size}" height="${size}" alt="">` : ''}</span>`;
  }

  function _resolveSavedBook(book) {
    return storage.getBookById(book.id) || (storage.getBooks?.() || []).find(saved => bookApi.isSameBook(saved, book));
  }

  function buildRecommendationCard(book, reasonLabel) {
    const key = String(book.id || `discovery-${recommendationBooks.size}`);
    recommendationBooks.set(key, book);
    const isSaved = !!_resolveSavedBook(book);
    const actionLabel = isSaved ? `Open details for ${book.title}` : `Add to Library: ${book.title}`;
    const sourceBadges = Array.isArray(book.sourceBadges) && book.sourceBadges.length ? `<span class="discover-sources">${book.sourceBadges.map(label => `<span>${utils.sanitize(label)}</span>`).join('')}</span>` : '';
    return `<button type="button" class="recommendation-card discover-card discover-glass ${isSaved ? 'discover-saved-card' : ''}" data-action="open-recommendation" data-book-id="${utils.sanitize(key)}" data-book-saved="${isSaved ? '1' : '0'}" aria-label="${utils.sanitize(actionLabel)}">
      <span class="discover-cover">${utils.buildCover(book, 'cover-sm')}</span>
      <span class="discover-book-info">${isSaved ? `<span class="discover-saved-label">${buildDiscoverIcon('bookmark-check', 14)} In your library</span>` : ''}<span class="discover-book-title">${utils.sanitize(book.title)}</span><span class="discover-book-author">${utils.sanitize(book.author)}</span><span class="discover-reason">${utils.sanitize(reasonLabel || 'Library-based match')}</span>${sourceBadges}${isSaved ? `<span class="discover-details">Book details ${buildDiscoverIcon('arrow-up-right', 14)}</span>` : ''}</span>
      ${isSaved ? '' : `<span class="discover-add">${buildDiscoverIcon('plus', 16)}<span class="discover-add-desktop">Add to library</span><span class="discover-add-mobile">Add book</span></span>`}
    </button>`;
  }

  function _prepareRecommendationBook(book) {
    const sourceData = bookApi.buildSourceBadgeData(book);
    return {
      ...book,
      ...sourceData,
      description: book.description || 'No description available yet.',
      genres: Array.isArray(book.genres) ? book.genres : [],
      subjects: Array.isArray(book.subjects) ? book.subjects : [],
      sourceBadges: Array.isArray(book.sourceBadges) ? book.sourceBadges : Array.isArray(sourceData.sourceBadges) ? sourceData.sourceBadges : [],
      sources: Array.isArray(book.sources) ? book.sources : Array.isArray(sourceData.sources) ? sourceData.sources : [],
    };
  }

  function _recommendationScore(book) {
    let score = 0;
    if (book.isFavorite) score += 60;
    if (typeof book.rating === 'number') score += book.rating * 18;
    if (book.rating >= 4) score += 25;
    if (book.status === constants.STATUS.READING) score += 14;
    if (book.status === constants.STATUS.WISHLIST) score += 10;
    if (book.status !== constants.STATUS.FINISHED) score += 8;
    score += _bookGenres(book).length * 5;
    score += _isRecognizedAuthor(book) ? 10 : 0;
    score += _dateValue(book.dateAdded) ? Math.max(0, 12 - Math.floor((Date.now() - _dateValue(book.dateAdded)) / 86400000)) : 0;
    return score;
  }

  function _recommendationWeight(book, multiplier = 1) {
    let weight = 1;
    if (book.isFavorite) weight += 4;
    if (typeof book.rating === 'number') weight += book.rating;
    if (book.rating >= 4) weight += 2;
    if (book.status === constants.STATUS.READING) weight += 1.5;
    if (book.status === constants.STATUS.FINISHED) weight += 1;
    return weight * multiplier;
  }

  function _bookGenres(book) {
    const genres = Array.isArray(book?.genres) ? book.genres : [];
    return genres.filter(Boolean).map(g => String(g).trim()).filter(Boolean);
  }

  function _cleanBookAuthor(author) {
    const value = String(author || '').trim();
    return value && value !== 'Unknown Author' ? value : '';
  }

  function _isRecognizedAuthor(book) {
    const author = _cleanBookAuthor(book.author);
    return Boolean(author) && (book.isFavorite || (typeof book.rating === 'number' && book.rating >= 4) || book.status === constants.STATUS.FINISHED);
  }

  function _mostCommonGenre(books) {
    const counts = new Map();
    books.forEach(book => {
      _bookGenres(book).forEach(genre => {
        counts.set(genre, (counts.get(genre) || 0) + 1);
      });
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  }

  function _normalizeText(value) {
    return String(value || '').toLowerCase().trim();
  }

  function _dateValue(value) {
    const ts = value ? new Date(value).getTime() : 0;
    return Number.isFinite(ts) ? ts : 0;
  }


  function bindRecommendationActions(main) {
    if (boundMain === main) return;
    boundMain = main;
    main.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action]');
      if (!trigger || (typeof main.contains === 'function' && !main.contains(trigger))) return;
      if (trigger.dataset.action === 'open-search') actions.openSearch?.();
      if (trigger.dataset.action === 'open-library') actions.navigate?.('library');
      if (trigger.dataset.action === 'refresh-recommendations') renderRecommendationsPage().then(() => main.querySelector?.('[data-action="refresh-recommendations"]')?.focus());
      if (trigger.dataset.action === 'filter-recommendations') {
        if (!filters.some(filter => filter.key === trigger.dataset.filter)) return;
        selectedFilter = trigger.dataset.filter;
        renderDiscoveryCards();
        const buttons = pageDocument.getElementById('discoverFilters')?.querySelectorAll?.('[data-filter]') || [];
        Array.from(buttons).find(button => button.dataset.filter === selectedFilter)?.focus();
      }
      if (trigger.dataset.action === 'open-recommendation') {
        const book = recommendationBooks.get(String(trigger.dataset.bookId || ''));
        if (!book) return;
        const saved = _resolveSavedBook(book);
        if (saved) library.showDetailsModal(saved.id);
        else library.showAddModal(_prepareRecommendationBook(book));
      }
    });
  }

  return renderRecommendationsPage;
}
