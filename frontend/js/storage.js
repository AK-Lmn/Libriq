/* ============================================
   LIBRIQ STORAGE
   All read/write to localStorage goes here.
   Replace this module later for cloud sync.
   ============================================ */

const Storage = (() => {
  // INSTALL_KEY  — written once on first launch, never cleared.
  // DATA_KEYS    — everything the user can clear. resetAll()
  //                removes only these keys, then re-runs
  //                _writeDefaults() to restore valid empty state.
  const INSTALL_KEY = 'libriq_installed';

  const DATA_KEYS = {
    BOOKS:   'libriq_books',
    PROFILE: 'libriq_profile',
    STREAK:  'libriq_streak',
    GOALS:   'libriq_goals',
    ACTIVITY:'libriq_activity',
    DEVICE_ID: 'libriq_device_id',
    // Local backup metadata used only for Settings/Data copy and import preview.
    BACKUP:  'libriq_backup_meta',
    CLOUD_BACKUP: 'libriq_cloud_backup_meta',
  };
  const ACTIVE_UID_KEY = 'libriq_active_account_uid';
  const SCOPED_DATA_KEYS = new Set(['BOOKS', 'ACTIVITY', 'GOALS', 'CLOUD_BACKUP']);
  let activeUid = localStorage.getItem(ACTIVE_UID_KEY) || null;

  const DEFAULTS = {
    profile: () => createProfile({ name: 'Reader', theme: 'dark' }),
    goals:   () => ({ yearly: 12, year: new Date().getFullYear() }),
    streak:  () => ({ current: 0, longest: 0, lastRead: null }),
    books:   () => [],
    activity: () => [],
    backup: () => ({ lastExportedAt: null }),
    cloudBackup: () => ({ lastCloudBackupAt: null, bookCount: null, activityCount: null, deviceId: null, backupVersion: null, appVersion: null, schemaVersion: null, createdAt: null, updatedAt: null, notesCount: null, quotesCount: null, lastLocalUpdatedAt: null, syncReady: false }),
  };

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

  function _writeDefaults() {
    const rawProfile = _read(DATA_KEYS.PROFILE);
    if (!rawProfile || typeof rawProfile !== 'object' || !rawProfile.name) {
      _write(DATA_KEYS.PROFILE, DEFAULTS.profile());
    } else {
      _write(DATA_KEYS.PROFILE, { ...DEFAULTS.profile(), ...rawProfile });
    }

    const rawGoals = _read(_key('GOALS'));
    if (!rawGoals || typeof rawGoals.yearly !== 'number') {
      _write(_key('GOALS'), DEFAULTS.goals());
    }

    const rawStreak = _read(DATA_KEYS.STREAK);
    if (!rawStreak || typeof rawStreak.current !== 'number') {
      _write(DATA_KEYS.STREAK, DEFAULTS.streak());
    }

    const rawBooks = _read(_key('BOOKS'));
    if (!Array.isArray(rawBooks)) {
      _write(_key('BOOKS'), DEFAULTS.books());
    }

    const rawActivity = _read(_key('ACTIVITY'));
    if (!Array.isArray(rawActivity)) {
      _write(_key('ACTIVITY'), DEFAULTS.activity());
    }

    const rawBackup = _read(DATA_KEYS.BACKUP);
    if (!rawBackup || typeof rawBackup !== 'object') {
      _write(DATA_KEYS.BACKUP, DEFAULTS.backup());
    }

    const rawCloudBackup = _read(_key('CLOUD_BACKUP'));
    if (!rawCloudBackup || typeof rawCloudBackup !== 'object') {
      _write(_key('CLOUD_BACKUP'), DEFAULTS.cloudBackup());
    }
  }

  // Decision tree:
  //   INSTALL_KEY absent  → first launch ever → mark installed, create empty defaults
  //   INSTALL_KEY present → returning user or post-reset → restore defaults only,
  //                         leave books array as-is (empty after reset, intact otherwise)

  function bootstrap() {
    const isFirstLaunch = !localStorage.getItem(INSTALL_KEY);

    if (isFirstLaunch) {
      localStorage.setItem(INSTALL_KEY, new Date().toISOString());
      _writeDefaults();
    } else {
      _writeDefaults();
    }
    getDeviceId();
  }

  function getActiveAccountUid() {
    return activeUid;
  }

  function setActiveAccountUid(uid) {
    const nextUid = uid ? String(uid) : null;
    const changed = activeUid !== nextUid;
    activeUid = nextUid;
    if (activeUid) localStorage.setItem(ACTIVE_UID_KEY, activeUid);
    else localStorage.removeItem(ACTIVE_UID_KEY);
    _writeDefaults();
    if (changed) _dispatchChange('storage:scope-changed', { uid: activeUid });
    return changed;
  }

  function clearActiveAccountScope() {
    return setActiveAccountUid(null);
  }

  function getDeviceId() {
    let deviceId = localStorage.getItem(DATA_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DATA_KEYS.DEVICE_ID, deviceId);
    }
    return deviceId;
  }

  function _userKey(uid, key) {
    const suffix = key.replace(/^libriq_/, '');
    return `libriq:users:${uid}:${suffix}`;
  }

  function _key(name) {
    const base = DATA_KEYS[name];
    return activeUid && SCOPED_DATA_KEYS.has(name) ? _userKey(activeUid, base) : base;
  }

  function getSyncReadiness() {
    const books = getBooks();
    const activity = getActivityLog();
    const hasDeviceId = Boolean(getDeviceId());
    const hasUpdatedAtCoverage = books.length === 0 || books.every(book => Boolean(book && (book.updatedAt || book.createdAt)));
    const hasDeletedAtSupport = books.every(book => book.deletedAt === undefined || book.deletedAt === null || typeof book.deletedAt === 'string');
    const cloudMeta = getCloudBackupMeta();
    const hasBackupMetadata = Boolean(cloudMeta && (cloudMeta.backupVersion !== null || cloudMeta.appVersion !== null || cloudMeta.createdAt !== null || cloudMeta.updatedAt !== null));
    return {
      hasDeviceId,
      hasUpdatedAtCoverage,
      hasDeletedAtSupport,
      hasBackupMetadata,
      syncReady: false,
      notesCount: books.reduce((sum, book) => sum + (book?.notes ? 1 : 0), 0),
      quotesCount: books.reduce((sum, book) => sum + (Array.isArray(book?.quotes) ? book.quotes.length : 0), 0),
      activityCount: activity.length,
    };
  }

  // Kept for future opt-in demos / screenshots without affecting real first runs.
  function _seedSampleData() {
    const books = SEED_BOOKS.map(b => createBook(b));
    _write(_key('BOOKS'), books);
    _write(DATA_KEYS.STREAK, { current: 5, longest: 14, lastRead: new Date().toISOString() });
  }

  // ── Books ────────────────────────────────

  function getBooks() {
    const data = _read(_key('BOOKS'));
    if (!Array.isArray(data)) {
      _write(_key('BOOKS'), []);
      return [];
    }
    return data;
  }

  function saveBooks(books) {
    return _write(_key('BOOKS'), books);
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
    books[idx] = { ...books[idx], ...updates, updatedAt: new Date().toISOString() };
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

  function getActivityLog() {
    const data = _read(_key('ACTIVITY'));
    if (!Array.isArray(data)) {
      _write(_key('ACTIVITY'), DEFAULTS.activity());
      return [];
    }
    return data.filter(Boolean).slice(-500);
  }

  function saveActivityLog(events) {
    if (!Array.isArray(events)) return false;
    const result = _write(_key('ACTIVITY'), events.slice(-500));
    if (result) _dispatchChange('activity:updated', { count: Math.min(events.length, 500) });
    return result;
  }

  function clearActivityLog() {
    return saveActivityLog([]);
  }

  function buildActivityEvent(type, book, payload = {}, source = null) {
    if (!type) return null;
    const timestamp = new Date().toISOString();
    return {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      timestamp,
      bookId: book?.id || null,
      bookTitle: book?.title || null,
      bookAuthor: book?.author || null,
      payload: payload && typeof payload === 'object' ? payload : {},
      source: source || book?.source || 'system',
    };
  }

  function addActivityEvent(event) {
    if (!event || typeof event !== 'object') return null;
    const current = getActivityLog();
    const normalized = {
      id: event.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: String(event.type || 'unknown'),
      timestamp: event.timestamp || new Date().toISOString(),
      bookId: event.bookId || null,
      bookTitle: event.bookTitle || null,
      bookAuthor: event.bookAuthor || null,
      payload: event.payload && typeof event.payload === 'object' ? event.payload : {},
      source: ['api', 'manual', 'import', 'system'].includes(event.source) ? event.source : 'system',
    };
    current.push(normalized);
    saveActivityLog(current);
    return normalized;
  }

  function setActivityLog(events) {
    if (!Array.isArray(events)) return false;
    return saveActivityLog(events.slice(-500));
  }

  function replaceActivityLog(events) {
    if (!Array.isArray(events)) return false;
    return saveActivityLog(events.slice(-500));
  }

  function getProfile() {
    const data = _read(DATA_KEYS.PROFILE);
    if (!data || typeof data !== 'object') {
      const fresh = DEFAULTS.profile();
      _write(DATA_KEYS.PROFILE, fresh);
      return fresh;
    }
    return { ...DEFAULTS.profile(), ...data };
  }

  function getBackupMeta() {
    const data = _read(DATA_KEYS.BACKUP);
    if (!data || typeof data !== 'object') {
      const fresh = DEFAULTS.backup();
      _write(DATA_KEYS.BACKUP, fresh);
      return fresh;
    }
    return { ...DEFAULTS.backup(), ...data };
  }

  function getCloudBackupMeta() {
    const data = _read(_key('CLOUD_BACKUP'));
    if (!data || typeof data !== 'object') {
      const fresh = DEFAULTS.cloudBackup();
      _write(_key('CLOUD_BACKUP'), fresh);
      return fresh;
    }
    return { ...DEFAULTS.cloudBackup(), ...data };
  }

  function saveCloudBackupMeta(updates) {
    const current = getCloudBackupMeta();
    const updated = { ...current, ...(updates && typeof updates === 'object' ? updates : {}) };
    _write(_key('CLOUD_BACKUP'), updated);
    return updated;
  }

  function saveBackupMeta(updates) {
    const current = getBackupMeta();
    const updated = { ...current, ...(updates && typeof updates === 'object' ? updates : {}) };
    _write(DATA_KEYS.BACKUP, updated);
    return updated;
  }

  function saveProfile(updates) {
    const current = getProfile();
    const updated = { ...current, ...updates };
    _write(DATA_KEYS.PROFILE, updated);
    _dispatchChange('profile:updated', updated);
    return updated;
  }

  function getGoals() {
    const data = _read(_key('GOALS'));
    if (!data || typeof data.yearly !== 'number') {
      const fresh = DEFAULTS.goals();
      _write(_key('GOALS'), fresh);
      return fresh;
    }
    return data;
  }

  function saveGoals(goals) {
    if (!goals || typeof goals.yearly !== 'number' || goals.yearly < 1) return false;
    const result = _write(_key('GOALS'), goals);
    if (result) _dispatchChange('goals:updated', goals);
    return result;
  }

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

    if (lastRead === today) return streak;

    streak.current  = lastRead === yesterday ? streak.current + 1 : 1;
    streak.longest  = Math.max(streak.longest, streak.current);
    streak.lastRead = new Date().toISOString();
    _write(DATA_KEYS.STREAK, streak);
    _dispatchChange('streak:updated', streak);
    return streak;
  }

  function resetAll() {
    Object.entries(DATA_KEYS).forEach(([name, key]) => {
      localStorage.removeItem(activeUid && SCOPED_DATA_KEYS.has(name) ? _userKey(activeUid, key) : key);
    });
    bootstrap();
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

    const pagesByMonth = Array(12).fill(0);
    books
      .filter(b => b.status === LIBRIQ.STATUS.FINISHED && b.dateFinished)
      .forEach(b => {
        const d = new Date(b.dateFinished);
        if (d.getFullYear() === thisYear) pagesByMonth[d.getMonth()] += (b.pageCount || 0);
      });

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
      topGenres, monthlyData, pagesByMonth,
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
    getActiveAccountUid, setActiveAccountUid, clearActiveAccountScope,
    getBooks, saveBooks, addBook, updateBook, removeBook,
    getBookById, getBooksByStatus, toggleFavorite,
    getProfile, saveProfile,
    getBackupMeta, saveBackupMeta,
    getCloudBackupMeta, saveCloudBackupMeta,
    getDeviceId,
    getSyncReadiness,
    getGoals, saveGoals,
    getStreak, updateStreak,
    getActivityLog, addActivityEvent, clearActivityLog, buildActivityEvent, setActivityLog, replaceActivityLog,
    getStats,
  };
})();

window.LibriqStorage = Storage;
