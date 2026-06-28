/* ============================================
   LIBRIQ STORAGE
   All read/write to localStorage goes here.
   Replace this module later for cloud sync.
   ============================================ */

const Storage = (() => {
  const KEYS = {
    BOOKS:   'libriq_books',
    PROFILE: 'libriq_profile',
    STREAK:  'libriq_streak',
    GOALS:   'libriq_goals',
    SEEDED:  'libriq_seeded',
  };

  // ── Internal helpers ─────────────────────

  function _read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn(`[Libriq] Storage read error (${key}):`, e);
      return null;
    }
  }

  function _write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn(`[Libriq] Storage write error (${key}):`, e);
      return false;
    }
  }

  // ── Books ────────────────────────────────

  function getBooks() {
    return _read(KEYS.BOOKS) || [];
  }

  function saveBooks(books) {
    return _write(KEYS.BOOKS, books);
  }

  function addBook(bookData) {
    const books = getBooks();
    const book = createBook(bookData);
    books.unshift(book); // newest first
    saveBooks(books);
    _dispatchChange('book:added', book);
    return book;
  }

  function updateBook(id, updates) {
    const books = getBooks();
    const idx = books.findIndex(b => b.id === id);
    if (idx === -1) return null;
    books[idx] = { ...books[idx], ...updates };
    saveBooks(books);
    _dispatchChange('book:updated', books[idx]);
    return books[idx];
  }

  function removeBook(id) {
    const books = getBooks();
    const filtered = books.filter(b => b.id !== id);
    saveBooks(filtered);
    _dispatchChange('book:removed', { id });
    return true;
  }

  function getBookById(id) {
    return getBooks().find(b => b.id === id) || null;
  }

  function getBooksByStatus(status) {
    return getBooks().filter(b => b.status === status);
  }

  function toggleFavorite(id) {
    const book = getBookById(id);
    if (!book) return null;
    return updateBook(id, { isFavorite: !book.isFavorite });
  }

  // ── Profile ──────────────────────────────

  function getProfile() {
    return _read(KEYS.PROFILE) || createProfile();
  }

  function saveProfile(updates) {
    const current = getProfile();
    const updated = { ...current, ...updates };
    _write(KEYS.PROFILE, updated);
    return updated;
  }

  // ── Goals ────────────────────────────────

  function getGoals() {
    return _read(KEYS.GOALS) || { yearly: 12, year: new Date().getFullYear() };
  }

  function saveGoals(goals) {
    return _write(KEYS.GOALS, goals);
  }

  // ── Streak ───────────────────────────────

  function getStreak() {
    return _read(KEYS.STREAK) || { current: 0, longest: 0, lastRead: null };
  }

  function updateStreak() {
    const streak = getStreak();
    const today = new Date().toDateString();
    const lastRead = streak.lastRead ? new Date(streak.lastRead).toDateString() : null;
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    if (lastRead === today) return streak; // already updated today

    if (lastRead === yesterday) {
      streak.current += 1;
    } else if (lastRead !== today) {
      streak.current = 1; // reset streak
    }

    streak.longest = Math.max(streak.longest, streak.current);
    streak.lastRead = new Date().toISOString();
    _write(KEYS.STREAK, streak);
    return streak;
  }

  // ── Seed ─────────────────────────────────

  function isSeeded() {
    return !!_read(KEYS.SEEDED);
  }

  function markSeeded() {
    _write(KEYS.SEEDED, true);
  }

  function seed() {
    if (isSeeded()) return;
    const books = SEED_BOOKS.map(b => createBook(b));
    saveBooks(books);
    markSeeded();
    // Set a sensible default streak
    _write(KEYS.STREAK, { current: 5, longest: 14, lastRead: new Date().toISOString() });
  }

  // ── Stats ────────────────────────────────

  function getStats() {
    const books = getBooks();
    const now = new Date();
    const thisYear = now.getFullYear();

    const total    = books.length;
    const reading  = books.filter(b => b.status === LIBRIQ.STATUS.READING).length;
    const finished = books.filter(b => b.status === LIBRIQ.STATUS.FINISHED).length;
    const wishlist = books.filter(b => b.status === LIBRIQ.STATUS.WISHLIST).length;
    const favorites = books.filter(b => b.isFavorite).length;

    const finishedThisYear = books.filter(b =>
      b.status === LIBRIQ.STATUS.FINISHED &&
      b.dateFinished &&
      new Date(b.dateFinished).getFullYear() === thisYear
    ).length;

    const totalPages = books
      .filter(b => b.status === LIBRIQ.STATUS.FINISHED)
      .reduce((sum, b) => sum + (b.pageCount || 0), 0);

    const rated = books.filter(b => b.rating !== null);
    const avgRating = rated.length
      ? (rated.reduce((sum, b) => sum + b.rating, 0) / rated.length).toFixed(1)
      : null;

    // Genre breakdown
    const genreMap = {};
    books.forEach(b => {
      (b.genres || []).forEach(g => {
        genreMap[g] = (genreMap[g] || 0) + 1;
      });
    });
    const topGenres = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Monthly finished (current year)
    const monthlyData = Array(12).fill(0);
    books
      .filter(b => b.status === LIBRIQ.STATUS.FINISHED && b.dateFinished)
      .forEach(b => {
        const d = new Date(b.dateFinished);
        if (d.getFullYear() === thisYear) {
          monthlyData[d.getMonth()]++;
        }
      });

    return {
      total, reading, finished, wishlist, favorites,
      finishedThisYear, totalPages, avgRating,
      topGenres, monthlyData,
    };
  }

  // ── Event bus ────────────────────────────

  function _dispatchChange(event, detail) {
    window.dispatchEvent(new CustomEvent(`libriq:${event}`, { detail }));
  }

  // ── Public API ────────────────────────────
  return {
    getBooks, saveBooks, addBook, updateBook, removeBook,
    getBookById, getBooksByStatus, toggleFavorite,
    getProfile, saveProfile,
    getGoals, saveGoals,
    getStreak, updateStreak,
    seed, isSeeded,
    getStats,
  };
})();