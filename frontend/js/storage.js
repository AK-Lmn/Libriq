/* ============================================
   LIBRIQ STORAGE
   All read/write to localStorage goes here.
   Replace this module later for cloud sync.
   ============================================ */

const Storage = (() => {
  // ── Key registry ─────────────────────────
  //
  // Two distinct tiers:
  //
  // INSTALL_KEY  — written once on first launch, never cleared.
  //                Survives resetAll(). Proves the app has been
  //                installed before, so we know not to re-seed.
  //
  // DATA_KEYS    — everything the user can clear. resetAll()
  //                removes only these keys, then re-runs
  //                _writeDefaults() to restore valid empty state.
  //
  const INSTALL_KEY = 'libriq_installed';

  const DATA_KEYS = {
    BOOKS:   'libriq_books',
    PROFILE: 'libriq_profile',
    STREAK:  'libriq_streak',
    GOALS:   'libriq_goals',
  };

  // ── Default values ───────────────────────
  // Single source of truth. Used by bootstrap()
  // and every individual getter as a fallback.

  const DEFAULTS = {
    profile: () => createProfile({ name: 'Reader', theme: 'dark' }),
    goals:   () => ({ yearly: 12, year: new Date().getFullYear() }),
    streak:  () => ({ current: 0, longest: 0, lastRead: null }),
    books:   () => [],
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

  // ── Write defaults ────────────────────────
  // Ensures every data key holds a valid value.
  // Called by both bootstrap() and resetAll().
  // Never touches INSTALL_KEY.

  function _writeDefaults() {
    // Profile — merge so existing fields survive a partial corruption
    const rawProfile = _read(DATA_KEYS.PROFILE);
    if (!rawProfile || typeof rawProfile !== 'object' || !rawProfile.name) {
      _write(DATA_KEYS.PROFILE, DEFAULTS.profile());
    } else {
      // Forward-compat: fill in any new fields added in future versions
      _write(DATA_KEYS.PROFILE, { ...DEFAULTS.profile(), ...rawProfile });
    }

    // Goals
    const rawGoals = _read(DATA_KEYS.GOALS);
    if (!rawGoals || typeof rawGoals.yearly !== 'number') {
      _write(DATA_KEYS.GOALS, DEFAULTS.goals());
    }

    // Streak
    const rawStreak = _read(DATA_KEYS.STREAK);
    if (!rawStreak || typeof rawStreak.current !== 'number') {
      _write(DATA_KEYS.STREAK, DEFAULTS.streak());
    }

    // Books — must always be a valid array
    const rawBooks = _read(DATA_KEYS.BOOKS);
    if (!Array.isArray(rawBooks)) {
      _write(DATA_KEYS.BOOKS, DEFAULTS.books());
    }
  }

  // ── Bootstrap ────────────────────────────
  // Runs on every app start (called from app.js
  // before any renderer touches storage).
  //
  // Decision tree:
  //   INSTALL_KEY absent  → first launch ever → seed sample data, mark installed
  //   INSTALL_KEY present → returning user or post-reset → restore defaults only,
  //                         leave books array as-is (empty after reset, intact otherwise)

  function bootstrap() {
    const isFirstLaunch = !localStorage.getItem(INSTALL_KEY);

    if (isFirstLaunch) {
      // Mark installed first — if anything below throws, we won't
      // re-seed on the next load and show a broken half-seeded state.
      localStorage.setItem(INSTALL_KEY, new Date().toISOString());
      _writeDefaults();
      _seedSampleData();
    } else {
      // Returning user or post-reset: only heal missing/corrupted keys.
      // Books are intentionally left untouched (empty after Clear Data).
      _writeDefaults();
    }
  }

  function _seedSampleData() {
    const books = SEED_BOOKS.map(b => createBook(b));
    _write(DATA_KEYS.BOOKS, books);
    // Warm streak so the widget isn't zero on the very first load
    _write(DATA_KEYS.STREAK, { current: 5, longest: 14, lastRead: new Date().toISOString() });
  }

  // ── Books ────────────────────────────────

  function getBooks() {
    const data = _read(DATA_KEYS.BOOKS);
    // Defensive: if somehow corrupted, heal it
    if (!Array.isArray(data)) {
      _write(DATA_KEYS.BOOKS, []);
      return [];
    }
    return data;
  }

  function saveBooks(books) {
    return _write(DATA_KEYS.BOOKS, books);
  }

  function addBook(bookData) {
    const books = getBooks();
    const book  = createBook(bookData);
    books.unshift(book);
    saveBooks(books);
    _dispatchChange('book:added', book);
    return book;
  }

  function updateBook(id, updates) {
    const books = getBooks();
    const idx   = books.findIndex(b => b.id === id);
    if (idx === -1) return null;
    books[idx] = { ...books[idx], ...updates };
    saveBooks(books);
    _dispatchChange('book:updated', books[idx]);
    return books[idx];
  }

  function removeBook(id) {
    const books    = getBooks();
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
  // Always reads from storage (guaranteed
  // valid after bootstrap) — never falls back
  // to an in-memory object that won't persist.

  function getProfile() {
    const data = _read(DATA_KEYS.PROFILE);
    if (!data || typeof data !== 'object' || !data.name) {
      // Heal on the fly if somehow missing
      const fresh = DEFAULTS.profile();
      _write(DATA_KEYS.PROFILE, fresh);
      return fresh;
    }
    return data;
  }

  function saveProfile(updates) {
    const current = getProfile();
    const updated = { ...current, ...updates };
    _write(DATA_KEYS.PROFILE, updated);
    return updated;
  }

  // ── Goals ────────────────────────────────

  function getGoals() {
    const data = _read(DATA_KEYS.GOALS);
    if (!data || typeof data.yearly !== 'number') {
      const fresh = DEFAULTS.goals();
      _write(DATA_KEYS.GOALS, fresh);
      return fresh;
    }
    return data;
  }

  function saveGoals(goals) {
    if (!goals || typeof goals.yearly !== 'number' || goals.yearly < 1) return false;
    return _write(DATA_KEYS.GOALS, goals);
  }

  // ── Streak ───────────────────────────────

  function getStreak() {
    const data = _read(DATA_KEYS.STREAK);
    if (!data || typeof data.current !== 'number') {
      const fresh = DEFAULTS.streak();
      _write(DATA_KEYS.STREAK, fresh);
      return fresh;
    }
    return data;
  }

  function updateStreak() {
    const streak    = getStreak();
    const today     = new Date().toDateString();
    const lastRead  = streak.lastRead ? new Date(streak.lastRead).toDateString() : null;
    const yesterday = new Date(Date.now() - 86400000).toDateString();

    if (lastRead === today) return streak; // already logged today

    streak.current  = lastRead === yesterday ? streak.current + 1 : 1;
    streak.longest  = Math.max(streak.longest, streak.current);
    streak.lastRead = new Date().toISOString();
    _write(DATA_KEYS.STREAK, streak);
    return streak;
  }

  // ── Reset (used by Settings > Clear Data) ─
  // Wipes all Libriq keys cleanly, re-runs
  // bootstrap so the app is immediately valid,
  // then navigates back to dashboard — no reload
  // needed, no broken state possible.

  function resetAll() {
    Object.values(DATA_KEYS).forEach(k => localStorage.removeItem(k));
    bootstrap(); // re-establish all defaults immediately
    _dispatchChange('reset', {});
  }

  // ── Stats ────────────────────────────────

  function getStats() {
    const books    = getBooks();
    const thisYear = new Date().getFullYear();

    const total     = books.length;
    const reading   = books.filter(b => b.status === LIBRIQ.STATUS.READING).length;
    const finished  = books.filter(b => b.status === LIBRIQ.STATUS.FINISHED).length;
    const wishlist  = books.filter(b => b.status === LIBRIQ.STATUS.WISHLIST).length;
    const favorites = books.filter(b => b.isFavorite).length;

    const finishedThisYear = books.filter(b =>
      b.status === LIBRIQ.STATUS.FINISHED &&
      b.dateFinished &&
      new Date(b.dateFinished).getFullYear() === thisYear
    ).length;

    const totalPages = books
      .filter(b => b.status === LIBRIQ.STATUS.FINISHED)
      .reduce((sum, b) => sum + (b.pageCount || 0), 0);

    const rated     = books.filter(b => typeof b.rating === 'number' && b.rating > 0);
    const avgRating = rated.length
      ? (rated.reduce((sum, b) => sum + b.rating, 0) / rated.length).toFixed(1)
      : null;

    // Genre breakdown
    const genreMap = {};
    books.forEach(b => {
      (b.genres || []).forEach(g => { genreMap[g] = (genreMap[g] || 0) + 1; });
    });
    const topGenres = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    // Monthly finished count for current year
    const monthlyData = Array(12).fill(0);
    books
      .filter(b => b.status === LIBRIQ.STATUS.FINISHED && b.dateFinished)
      .forEach(b => {
        const d = new Date(b.dateFinished);
        if (d.getFullYear() === thisYear) monthlyData[d.getMonth()]++;
      });

    return {
      total, reading, finished, wishlist, favorites,
      finishedThisYear, totalPages, avgRating, ratedCount: rated.length,
      topGenres, monthlyData,
    };
  }

  // ── Event bus ────────────────────────────

  function _dispatchChange(event, detail) {
    window.dispatchEvent(new CustomEvent(`libriq:${event}`, { detail }));
  }

  // ── Public API ───────────────────────────
  return {
    bootstrap,
    resetAll,
    getBooks, saveBooks, addBook, updateBook, removeBook,
    getBookById, getBooksByStatus, toggleFavorite,
    getProfile, saveProfile,
    getGoals, saveGoals,
    getStreak, updateStreak,
    getStats,
  };
})();
