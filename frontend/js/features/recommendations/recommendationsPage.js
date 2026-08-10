export function createRecommendationsPage({ storage, library, bookApi, utils, constants, actions, documentRoot }) {
  if (!storage || !library || !bookApi || !utils || !constants || !actions) {
    throw new TypeError('createRecommendationsPage requires storage, library, bookApi, utils, constants, and actions.');
  }
  const pageDocument = documentRoot || globalThis.document;
  const recommendationBooks = new Map();
  let boundMain = null;

  function renderRecommendationsPage() {
    const main = pageDocument.getElementById('mainContent');
    if (!main) {
      console.error('[LibriQ] Missing #mainContent while rendering recommendations page.');
      return;
    }
    const books = storage.getBooks();
    const recState = _buildRecommendationState(books);

    main.innerHTML = `
      <div class="page recommendations-page" id="recommendationsPage">
        <div class="page-header recommendations-header">
          <div class="recommendations-heading recommendations-hero-heading">
            <span class="library-eyebrow">Library-based suggestions</span>
            <h1 class="page-title">Recommendations</h1>
            <p class="page-subtitle">Suggestions built from the books you’ve already saved in LibriQ.</p>
          </div>
        </div>

        <section class="recommendations-intro recommendations-hero">
          <div class="recommendations-intro-copy">
            <div class="recommendations-intro-kicker">From your library</div>
            <div class="recommendations-intro-title">Built from your saved books, favorite authors, and reading shelves.</div>
            <div class="recommendations-intro-body">Suggestions are grounded in your saved books, favorites, ratings, and reading shelves so they reflect what you already read, rate, and keep close.</div>
            <div class="recommendations-intro-meta">
              <span class="badge badge-accent">Library-based</span>
              <span class="recommendations-intro-meta-text">Built from favorites, ratings, authors, and Want to Read shelves</span>
            </div>
          </div>
        </section>

        ${recState.hasSignal ? `
          <div class="recommendations-groups recommendations-sections stagger">
            ${recState.groups.map(group => buildRecommendationGroup(group)).join('')}
          </div>
          <div class="recommendations-helper-note">Add more favorites, finished books, and Want to Read titles to improve your library-based suggestions.</div>
        ` : `
          <div class="empty-state recommendations-empty-state recommendations-empty">
            <div class="empty-state-icon"><i class="ph ph-sparkle"></i></div>
            <div class="empty-state-title">Save a few more books to improve your library-based suggestions.</div>
            <div class="empty-state-body">Recommendations are built from your saved books, favorites, ratings, and Want to Read titles.</div>
            <div class="recommendations-empty-actions">
              <button class="btn btn-primary" type="button" data-action="open-search">
                <i class="ph ph-magnifying-glass"></i> Search Books
              </button>
              <button class="btn btn-secondary" type="button" data-action="open-library">
                <i class="ph ph-books"></i> Open Library
              </button>
            </div>
            <div class="recommendations-empty-hint">Add books, favorite a few, finish a few, or move books to Want to Read.</div>
          </div>
        `}
        <div id="subjectDiscoveryRoot" class="recommendations-subject-discovery"></div>
        <div id="gutenbergDiscoveryRoot" class="recommendations-subject-discovery"></div>
      </div>`;

    bindRecommendationActions(main);
    _hydrateSubjectDiscovery(books);
    _hydrateGutendexDiscovery(books);
  }

  async function _hydrateSubjectDiscovery(books) {
    const root = pageDocument.getElementById('subjectDiscoveryRoot');
    if (!root) return;
    if (!actions.isOnline()) {
      root.innerHTML = '';
      return;
    }

    const discoveryState = _buildSubjectDiscoveryState(books);
    if (!discoveryState.rails.length) {
      root.innerHTML = '';
      return;
    }

    root.innerHTML = `
      <div class="recommendations-groups recommendations-sections stagger">
        ${discoveryState.rails.map(rail => buildSubjectDiscoveryRail(rail)).join('')}
      </div>`;

    const railNodes = Array.from(root.querySelectorAll('[data-subject-key]'));
    await Promise.all(railNodes.map(async (node) => {
      const subjectKey = node.dataset.subjectKey;
      const limit = Number(node.dataset.limit || 6);
      const booksForRail = await bookApi.searchBySubject(subjectKey, { limit });
      const filtered = _filterSubjectDiscoveryBooks(booksForRail, books, limit);
      if (!filtered.length) {
        node.innerHTML = `<div class="recommendations-helper-note">This subject is unavailable right now.</div>`;
        return;
      }
      node.querySelector('.recommendation-card-grid').innerHTML = filtered.map(book => buildRecommendationCard(book, 'Open Library subject')).join('');
    }));
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

  function _filterSubjectDiscoveryBooks(books, savedBooks, limit = 6) {
    const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
    const saved = Array.isArray(savedBooks) ? savedBooks.filter(Boolean) : [];
    const filtered = [];
    for (const book of safeBooks) {
      if (saved.some(savedBook => bookApi.isSameBook(savedBook, book))) continue;
      if (filtered.some(existing => bookApi.isSameBook(existing, book))) continue;
      filtered.push(book);
      if (filtered.length >= limit) break;
    }
    return filtered;
  }

  function buildSubjectDiscoveryRail(rail) {
    return `
      <section class="goal-widget recommendations-section" data-subject-key="${utils.sanitize(rail.subjectKey)}" data-limit="${rail.limit}">
        <div class="goal-header recommendations-section-header">
          <div class="recommendation-group-heading">
            <div class="goal-title">Explore ${utils.sanitize(rail.label)}</div>
            <div class="stats-section-meta">Powered by Open Library subjects</div>
          </div>
        </div>
        <div class="recommendation-card-grid recommendations-item-grid">
          <div class="recommendations-helper-note recommendations-subject-loading">
            <span class="spinner spinner--inline" aria-hidden="true"></span>
            <span>Loading subject picks from Open Library…</span>
          </div>
        </div>
      </section>`;
  }

  async function _hydrateGutendexDiscovery(books) {
    const root = pageDocument.getElementById('gutenbergDiscoveryRoot');
    if (!root) return;
    if (!actions.isOnline()) {
      root.innerHTML = '';
      return;
    }

    const rail = _buildGutendexDiscoveryState(books);
    if (!rail) {
      root.innerHTML = '';
      return;
    }

    root.innerHTML = buildGutendexDiscoveryRail(rail);

    const cardsNode = root.querySelector('[data-gutendex-rail]');
    if (!cardsNode) return;

    const booksForRail = await bookApi.searchCuratedClassics({ limit: rail.limit, topic: rail.topic });
    const filtered = _filterDiscoveryBooks(booksForRail, books, rail.limit);
    if (!filtered.length) {
      cardsNode.innerHTML = `<div class="recommendations-helper-note">Free classics are unavailable right now.</div>`;
      return;
    }
    cardsNode.querySelector('.recommendation-card-grid').innerHTML = filtered.map(book => buildRecommendationCard(book, 'Project Gutenberg')).join('');
  }

  function _buildGutendexDiscoveryState(books) {
    const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
    const hasSignal = safeBooks.length > 0;
    return {
      label: 'Free Classics',
      topic: 'classics',
      limit: 6,
      hasSignal,
    };
  }

  function _filterDiscoveryBooks(books, savedBooks, limit = 6) {
    const safeBooks = Array.isArray(books) ? books.filter(Boolean) : [];
    const saved = Array.isArray(savedBooks) ? savedBooks.filter(Boolean) : [];
    const filtered = [];
    for (const book of safeBooks) {
      if (saved.some(savedBook => bookApi.isSameBook(savedBook, book))) continue;
      if (filtered.some(existing => bookApi.isSameBook(existing, book))) continue;
      filtered.push(book);
      if (filtered.length >= limit) break;
    }
    return filtered;
  }

  function buildGutendexDiscoveryRail(rail) {
    return `
      <section class="goal-widget recommendations-section" data-gutendex-rail="true" data-limit="${rail.limit}" data-topic="${utils.sanitize(rail.topic)}">
        <div class="goal-header recommendations-section-header">
          <div class="recommendation-group-heading">
            <div class="goal-title">Free Classics</div>
            <div class="stats-section-meta">Public-domain picks through Project Gutenberg metadata</div>
          </div>
        </div>
        <div class="recommendation-card-grid recommendations-item-grid">
          <div class="recommendations-helper-note recommendations-subject-loading">
            <span class="spinner spinner--inline" aria-hidden="true"></span>
            <span>Loading free classics…</span>
          </div>
        </div>
      </section>`;
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

  function buildRecommendationGroup(group) {
    const cards = group.books.map(book => buildRecommendationCard(book, group.showCardReason === false ? '' : group.label)).join('');
    const groupClass = group.books.length === 1 ? 'recommendation-group recommendation-group-single' : 'recommendation-group';
    return `
      <section class="goal-widget ${groupClass} recommendations-section">
        <div class="goal-header recommendations-section-header">
          <div class="recommendation-group-heading">
            <div class="goal-title">${utils.sanitize(group.title)}</div>
            <div class="stats-section-meta">${utils.sanitize(group.label)}</div>
          </div>
        </div>
        <div class="recommendation-card-grid recommendations-item-grid">
          ${cards}
        </div>
      </section>`;
  }

  function buildRecommendationCard(book, reasonLabel) {
    recommendationBooks.set(String(book.id || ''), book);
    const isSaved = !!storage.getBookById(book.id);
    const statusLabel = isSaved ? utils.statusLabel(book.status) : '';
    const statusClass = isSaved ? `badge ${utils.statusBadgeClass(book.status)}` : '';
    const sourceBadges = Array.isArray(book.sourceBadges) && book.sourceBadges.length
      ? `<div class="recommendation-card-source-badges">${book.sourceBadges.map(label => `<span class="badge badge-accent">${utils.sanitize(label)}</span>`).join('')}</div>`
      : '';
    const actionLabel = isSaved ? `Open details for ${book.title}` : `Open details and add ${book.title} to your library`;
    return `
      <button type="button" class="recommendation-card recommendations-item" data-action="open-recommendation" data-book-id="${utils.sanitize(String(book.id || ''))}" data-book-saved="${isSaved ? '1' : '0'}" aria-label="${utils.sanitize(actionLabel)}">
        <div class="recommendation-card-cover">
          ${utils.buildCover(book, 'cover-sm')}
        </div>
        <div class="recommendation-card-body">
          <div class="recommendation-card-topline">
            ${reasonLabel ? `<div class="recommendation-card-reason recommendations-reason">${utils.sanitize(reasonLabel)}</div>` : '<div class="recommendation-card-reason recommendations-reason">Library-based match</div>'}
            ${isSaved ? `<span class="${statusClass}">${statusLabel}</span><span class="badge badge-accent">Already in Library</span>` : '<span class="badge badge-accent">Add to Library</span>'}
          </div>
          <div class="recommendation-card-title">${utils.sanitize(book.title)}</div>
          <div class="recommendation-card-author">${utils.sanitize(book.author)}</div>
          ${sourceBadges}
        </div>
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
      if (!trigger) return;
      if (trigger.dataset.action === 'open-search') actions.openSearch?.();
      if (trigger.dataset.action === 'open-library') actions.navigate?.('library');
      if (trigger.dataset.action === 'open-recommendation') {
        const book = recommendationBooks.get(String(trigger.dataset.bookId || ''));
        if (!book) return;
        if (trigger.dataset.bookSaved === '1') library.showDetailsModal(book.id);
        else library.showAddModal(_prepareRecommendationBook(book));
      }
    });
  }

  return renderRecommendationsPage;
}
