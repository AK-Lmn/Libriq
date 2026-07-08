import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const port = Number(process.env.LIBRIQ_E2E_PORT || 4173);
const baseUrl = `http://127.0.0.1:${port}/?libriq_e2e_test_mode=1`;

function startServer() {
  const child = spawn(process.execPath, ['scripts/e2e-server.mjs'], { stdio: 'inherit', env: { ...process.env, LIBRIQ_E2E_PORT: String(port) } });
  return child;
}

async function setupPage(context, uid, email) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('libriq_e2e_test_mode', '1');
    localStorage.setItem('libriq_debug_sync', '1');
    localStorage.removeItem('libriq_account_sync_user_disabled');
    window.__libriqBootTrace = [];
    const recordBootTrace = () => {
      const main = document.getElementById('mainContent');
      const sidebar = document.getElementById('sidebar');
      const sidebarStyle = sidebar ? getComputedStyle(sidebar) : null;
      window.__libriqBootTrace.push({
        page: window.LibriqNavigation?.currentPage || null,
        text: main?.innerText || '',
        sessionActive: document.body.classList.contains('session-choice-active'),
        bodyClass: document.body.className,
        sidebarVisible: Boolean(sidebar && sidebarStyle && sidebarStyle.display !== 'none' && sidebar.getClientRects().length > 0),
      });
    };
    new MutationObserver(recordBootTrace).observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    window.addEventListener('libriq:page-changed', recordBootTrace);
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await delay(3000);
  await page.evaluate(({ uid, email }) => {
    window.LibriqE2E.seedAuth(uid, email, uid);
    window.LibriqE2E.enableAccountMode();
    window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
    window.LibriqNavigation.goTo('dashboard');
    window.LibriqSyncBeta.maybeAutoEnable('e2e-setup');
  }, { uid, email });
  await waitForSyncAttached(page);
  return page;
}

async function resumePage(page, uid, email) {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await delay(3000);
  await page.evaluate(({ uid, email }) => {
    window.LibriqE2E.seedAuth(uid, email, uid);
    window.LibriqE2E.enableAccountMode();
    window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
    window.LibriqNavigation.goTo('dashboard');
    window.LibriqSyncBeta.maybeAutoEnable('e2e-setup');
  }, { uid, email });
  await waitForSyncAttached(page);
}

async function waitForSyncAttached(page) {
  await page.waitForFunction(() => Boolean(window.LibriqE2E && window.LibriqSyncDebug?.status?.().attached), null, { timeout: 10000 });
}

async function signInExistingPage(page, uid, email) {
  await page.evaluate(({ uid, email }) => {
    window.LibriqE2E.seedAuth(uid, email, uid);
    window.LibriqE2E.enableAccountMode();
    window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
    window.LibriqNavigation.goTo('dashboard');
    window.LibriqSyncBeta.maybeAutoEnable('e2e-account-switch');
  }, { uid, email });
  await waitForSyncAttached(page);
}

function assertHasFields(object, fields) {
  fields.forEach((field) => assert.equal(Object.prototype.hasOwnProperty.call(object, field), true, `missing sync status field: ${field}`));
}

async function main() {
    const server = startServer();
  try {
    await delay(1500);
    await fetch(`http://127.0.0.1:${port}/__libriq_test_api/reset`, { method: 'POST' });
    const browser = await chromium.launch({ headless: true });
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const sharedUid = 'test-user';
    const pageA = await setupPage(contextA, sharedUid, 'a@example.com');
    const pageB = await setupPage(contextB, sharedUid, 'a@example.com');

    const statusA = await pageA.evaluate(() => window.LibriqSyncDebug.status());
    const statusB = await pageB.evaluate(() => window.LibriqSyncDebug.status());
    assert.equal(statusA.enabled, true);
    assert.equal(statusA.attached, true);
    assert.equal(statusA.userDisabled, false);
    assert.equal(statusA.status === 'syncing' || statusA.status === 'synced' || statusA.status === 'off', true);
    assert.equal(statusA.sessionMode, 'account');
    assert.match(statusA.listenerPath, /users\/test-user\/sync\/v1\/books/);
    assert.match(statusA.syncPath, /users\/test-user\/sync\/v1\/books/);
    assert.ok(statusA.deviceId);
    assert.notEqual(statusA.deviceId, statusB.deviceId);
    assertHasFields(statusA, [
      'enabled',
      'userDisabled',
      'attached',
      'status',
      'uid',
      'sessionMode',
      'listenerPath',
      'lastSnapshotAt',
      'lastWriteAt',
      'lastError',
      'tombstoneCount',
      'oldestTombstoneAt',
      'eligibilityAllowed',
      'disabledReasons',
    ]);
    assert.equal(statusA.eligibilityAllowed, true);
    assert.equal(Array.isArray(statusA.disabledReasons), true);
    assert.equal(typeof statusA.tombstoneCount, 'number');

    const bookId = await pageA.evaluate(() => {
      const book = window.LibriqE2E.addBook({
        title: 'SYNC E2E TEST',
        author: 'LibriQ',
        status: 'reading',
        currentPage: 0,
        pageCount: 300,
        isFavorite: false,
      });
      return book.id;
    });

    await delay(6000);
    assert.equal(await pageB.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id), bookId), true);

    const richBookId = await pageA.evaluate(() => {
      const book = window.LibriqE2E.addBook({
        title: 'RICH SYNC TEST',
        author: 'LibriQ',
        status: 'finished',
        currentPage: 320,
        pageCount: 320,
        rating: 5,
        review: 'Excellent round-trip coverage.',
        genres: ['Fantasy', 'Adventure'],
        subjects: ['Adventure', 'Magic'],
        subjectPeople: ['Wizard'],
        subjectPlaces: ['Library'],
        subjectTimes: ['2020s'],
        publisher: 'LibriQ Press',
        language: 'English',
        description: 'A rich book used to verify sync coverage.',
        dateAdded: '2024-01-01T00:00:00.000Z',
        dateStarted: '2024-01-02T00:00:00.000Z',
        dateFinished: '2024-01-03T00:00:00.000Z',
        notesUpdatedAt: '2024-01-04T00:00:00.000Z',
        isFavorite: true,
        tags: ['Classics', 'Favorites'],
        shelves: ['Classics Shelf'],
        notes: 'Private notes that should sync.',
        quotes: [{ id: 'q1', text: 'A memorable line.', page: 12, note: 'quoted', createdAt: '2024-01-05T00:00:00.000Z', updatedAt: '2024-01-05T00:00:00.000Z' }],
        source: 'openlibrary',
        sources: ['Open Library', 'Google Books'],
        sourceBadges: ['Open Library', 'Google Books'],
        sourceIds: { openlibrary: '/books/OL1M', google: 'gb-1' },
        identifiers: [{ type: 'ISBN_13', identifier: '9780000000000' }],
        isbns: ['9780000000000'],
        googleBooksId: 'gb-1',
        openLibraryId: '/books/OL1M',
        openLibraryWorkKey: '/works/OL1W',
        openLibraryEditionKey: '/books/OL1M',
        openLibraryAuthorKeys: ['/authors/OL1A'],
        gutendexId: '42',
        gutenbergId: '4242',
        internetArchiveId: 'ia-1',
        internetArchiveIds: ['ia-1'],
        archiveUrl: 'https://archive.org/details/rich-sync-test',
        readableSourceLinks: ['https://archive.org/details/rich-sync-test'],
        downloadLinks: { html: 'https://example.com/book.html' },
        coverId: '12345',
        firstPublishYear: 1984,
        editionCount: 3,
      });
      return book.id;
    });

    await delay(6000);
    const remoteRichDocs = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/collection?path=${encodeURIComponent('users/test-user/sync/v1/books')}`).then(res => res.json());
    const remoteRich = remoteRichDocs.find((book) => book.id === richBookId);
    assert.ok(remoteRich);
    assert.equal(remoteRich.review, 'Excellent round-trip coverage.');
    assert.deepEqual(remoteRich.genres, ['Fantasy', 'Adventure']);
    assert.deepEqual(remoteRich.subjects, ['Adventure', 'Magic']);
    assert.deepEqual(remoteRich.subjectPeople, ['Wizard']);
    assert.deepEqual(remoteRich.subjectPlaces, ['Library']);
    assert.deepEqual(remoteRich.subjectTimes, ['2020s']);
    assert.equal(remoteRich.publisher, 'LibriQ Press');
    assert.equal(remoteRich.language, 'English');
    assert.equal(remoteRich.description, 'A rich book used to verify sync coverage.');
    assert.equal(remoteRich.dateAdded, '2024-01-01T00:00:00.000Z');
    assert.equal(remoteRich.dateStarted, '2024-01-02T00:00:00.000Z');
    assert.equal(remoteRich.dateFinished, '2024-01-03T00:00:00.000Z');
    assert.equal(remoteRich.notesUpdatedAt, '2024-01-04T00:00:00.000Z');
    assert.equal(remoteRich.source, 'openlibrary');
    assert.deepEqual(remoteRich.sources, ['Open Library', 'Google Books']);
    assert.deepEqual(remoteRich.sourceBadges, ['Open Library', 'Google Books']);
    assert.deepEqual(remoteRich.sourceIds, { openlibrary: '/books/OL1M', google: 'gb-1' });
    assert.deepEqual(remoteRich.identifiers, [{ type: 'ISBN_13', identifier: '9780000000000' }]);
    assert.deepEqual(remoteRich.isbns, ['9780000000000']);
    assert.equal(remoteRich.googleBooksId, 'gb-1');
    assert.equal(remoteRich.openLibraryId, '/books/OL1M');
    assert.equal(remoteRich.openLibraryWorkKey, '/works/OL1W');
    assert.equal(remoteRich.openLibraryEditionKey, '/books/OL1M');
    assert.deepEqual(remoteRich.openLibraryAuthorKeys, ['/authors/OL1A']);
    assert.equal(remoteRich.gutendexId, '42');
    assert.equal(remoteRich.gutenbergId, '4242');
    assert.equal(remoteRich.internetArchiveId, 'ia-1');
    assert.deepEqual(remoteRich.internetArchiveIds, ['ia-1']);
    assert.equal(remoteRich.archiveUrl, 'https://archive.org/details/rich-sync-test');
    assert.deepEqual(remoteRich.readableSourceLinks, ['https://archive.org/details/rich-sync-test']);
    assert.deepEqual(remoteRich.downloadLinks, { html: 'https://example.com/book.html' });
    assert.equal(remoteRich.coverId, '12345');
    assert.equal(remoteRich.firstPublishYear, 1984);
    assert.equal(remoteRich.editionCount, 3);

    const richContext = await browser.newContext();
    const richPage = await setupPage(richContext, sharedUid, 'a@example.com');
    await delay(6000);
    const loadedRich = await richPage.evaluate((id) => window.LibriqE2E.getBooks().find((book) => book.id === id), richBookId);
    assert.ok(loadedRich);
    assert.equal(loadedRich.review, 'Excellent round-trip coverage.');
    assert.deepEqual(loadedRich.genres, ['Fantasy', 'Adventure']);
    assert.deepEqual(loadedRich.subjects, ['Adventure', 'Magic']);
    assert.equal(loadedRich.publisher, 'LibriQ Press');
    assert.equal(loadedRich.archiveUrl, 'https://archive.org/details/rich-sync-test');
    await richPage.close();
    await richContext.close();

    const contextFresh = await browser.newContext();
    const pageFresh = await setupPage(contextFresh, sharedUid, 'a@example.com');
    await delay(6000);
    assert.equal(await pageFresh.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id), bookId), true);
    await pageFresh.close();
    await contextFresh.close();

    await pageB.evaluate((id) => window.LibriqE2E.updateBook(id, { currentPage: 42, status: 'reading' }), bookId);
    await delay(6000);
    assert.equal(await pageA.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id && book.currentPage === 42), bookId), true);

    await pageA.evaluate((id) => window.LibriqE2E.toggleFavorite(id), bookId);
    await delay(6000);
    assert.equal(await pageB.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id && book.isFavorite === true), bookId), true);
    await pageB.evaluate((id) => window.LibriqE2E.toggleFavorite(id), bookId);
    await delay(6000);
    assert.equal(await pageA.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id && book.isFavorite === false), bookId), true);

    const deleteId = await pageA.evaluate(() => window.LibriqE2E.addBook({ title: 'DELETE E2E TEST', author: 'LibriQ', status: 'wishlist' }).id);
    await delay(6000);
    assert.equal(await pageB.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id), deleteId), true);
    await pageA.evaluate((id) => window.LibriqE2E.deleteBook(id), deleteId);
    await delay(6000);
    assert.equal(await pageB.evaluate((id) => !window.LibriqE2E.getBooks().some((book) => book.id === id), deleteId), true);
    const tombstoneStatus = await pageA.evaluate(() => window.LibriqSyncDebug.status());
    assert.equal(tombstoneStatus.tombstoneCount >= 1, true);
    await resumePage(pageA, sharedUid, 'a@example.com');
    await resumePage(pageB, sharedUid, 'a@example.com');
    await delay(6000);
    assert.equal(await pageA.evaluate((id) => !window.LibriqE2E.getBooks().some((book) => book.id === id), deleteId), true);
    assert.equal(await pageB.evaluate((id) => !window.LibriqE2E.getBooks().some((book) => book.id === id), deleteId), true);

    const cleanupResult = await pageA.evaluate(() => {
      const now = Date.now();
      const freshAt = new Date(now - 29 * 24 * 60 * 60 * 1000).toISOString();
      const oldAt = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
      window.LibriqStorage.saveSyncTombstones({
        fresh_cleanup_test: { id: 'fresh_cleanup_test', deletedAt: freshAt, updatedAt: freshAt },
        old_cleanup_test: { id: 'old_cleanup_test', deletedAt: oldAt, updatedAt: oldAt },
      });
      const result = window.LibriqSyncDebug.pruneOldLocalTombstones(now);
      const remaining = window.LibriqStorage.getSyncTombstones();
      return {
        result,
        hasFresh: Boolean(remaining.fresh_cleanup_test),
        hasOld: Boolean(remaining.old_cleanup_test),
        remainingCount: Object.keys(remaining).length,
      };
    });
    assert.equal(cleanupResult.result.pruned, 1);
    assert.equal(cleanupResult.hasFresh, true);
    assert.equal(cleanupResult.hasOld, false);
    assert.equal(cleanupResult.remainingCount, 1);

    await pageB.evaluate(async () => {
      window.LibriqSyncBeta.setEnabled(false);
      window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
      window.LibriqSyncBeta.maybeAutoEnable('e2e-user-disabled');
      window.LibriqSyncBeta.refresh();
    });
    await delay(1000);
    const disabledStatus = await pageB.evaluate(() => window.LibriqSyncDebug.status());
    assert.equal(disabledStatus.enabled, false);
    assert.equal(disabledStatus.attached, false);
    assert.equal(disabledStatus.userDisabled, true);
    assert.equal(disabledStatus.status, 'off');

    await pageB.evaluate(() => {
      window.LibriqSyncBeta.setEnabled(true);
    });
    await waitForSyncAttached(pageB);
    const reenabledStatus = await pageB.evaluate(() => window.LibriqSyncDebug.status());
    assert.equal(reenabledStatus.enabled, true);
    assert.equal(reenabledStatus.attached, true);
    assert.equal(reenabledStatus.userDisabled, false);

    await pageB.evaluate(() => {
      window.LibriqE2E.disableAccountMode?.();
      window.LibriqSyncBeta.refresh();
    });
    await delay(1000);
    const pausedStatus = await pageB.evaluate(() => window.LibriqSyncDebug.status());
    assert.equal(pausedStatus.attached, false);
    assert.equal(pausedStatus.sessionMode, 'offline');
    assert.equal(['off', 'paused'].includes(pausedStatus.status), true);

    const offlineContext = await browser.newContext();
    const offlinePage = await setupPage(offlineContext, 'offline-sync-user', 'offline@example.com');
    await offlineContext.setOffline(true);
    await offlinePage.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await offlinePage.evaluate(() => {
      const book = window.LibriqE2E.addBook({
        title: 'OFFLINE SYNC TEST',
        author: 'LibriQ',
        status: 'reading',
        currentPage: 10,
        pageCount: 100,
      });
      window.LibriqE2E.updateBook(book.id, { currentPage: 11 });
    });
    await delay(1000);
    const offlineState = await offlinePage.evaluate(() => window.LibriqSyncDebug.status());
    assert.equal(offlineState.pending, true);
    assert.equal(offlineState.pendingBookIds.length >= 1, true);
    assert.equal(await offlinePage.evaluate(() => window.LibriqE2E.getBooks().some((book) => book.title === 'OFFLINE SYNC TEST')), true);
    assert.equal(await offlinePage.evaluate(() => window.LibriqStorage.getSyncMeta().pending), true);
    await offlineContext.setOffline(false);
    await offlinePage.evaluate(() => window.dispatchEvent(new Event('online')));
    await delay(6000);
    const offlineRemote = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/collection?path=${encodeURIComponent('users/offline-sync-user/sync/v1/books')}`).then(res => res.json());
    assert.equal(offlineRemote.some((book) => book.title === 'OFFLINE SYNC TEST' && book.currentPage === 11), true);
    await offlinePage.close();
    await offlineContext.close();

    const contextIsolation = await browser.newContext();
    const pageIsolation = await setupPage(contextIsolation, 'isolation-user-a', 'isolation-a@example.com');
    const isolationBookId = await pageIsolation.evaluate(() => {
      const book = window.LibriqE2E.addBook({
        title: 'ACCOUNT ISOLATION A',
        author: 'LibriQ',
        status: 'reading',
        currentPage: 12,
        pageCount: 240,
      });
      window.LibriqStorage.saveProfile({ name: 'Alice Account', theme: 'light' });
      window.LibriqStorage.saveGoals({ yearly: 42, year: new Date().getFullYear() });
      window.LibriqStorage.saveStreak({ current: 5, longest: 5, lastRead: new Date().toISOString() });
      window.LibriqStorage.addActivityEvent(window.LibriqStorage.buildActivityEvent('note_saved', book, { marker: 'user-a-activity' }, 'manual'));
      return book.id;
    });
    await delay(6000);
    assert.equal(await pageIsolation.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id), isolationBookId), true);

    await pageIsolation.evaluate(async () => {
      await window.LibriqFirebase.signOut();
    });
    await delay(1000);
    assert.equal(await pageIsolation.evaluate(() => window.LibriqNavigation.currentPage), 'session');

    await signInExistingPage(pageIsolation, 'isolation-user-b', 'isolation-b@example.com');
    await delay(3000);
    const userBState = await pageIsolation.evaluate(() => ({
      books: window.LibriqE2E.getBooks().length,
      profile: window.LibriqStorage.getProfile(),
      goals: window.LibriqStorage.getGoals(),
      streak: window.LibriqStorage.getStreak(),
      activity: window.LibriqStorage.getActivityLog(),
      stats: window.LibriqStorage.getStats(),
    }));
    assert.equal(userBState.books, 0);
    assert.equal(userBState.profile.name, 'Reader');
    assert.equal(userBState.goals.yearly, 12);
    assert.equal(userBState.streak.current, 0);
    assert.equal(userBState.activity.length, 0);
    assert.equal(userBState.stats.total, 0);
    assert.equal(await pageIsolation.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id), isolationBookId), false);
    const userBRemote = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/collection?path=${encodeURIComponent('users/isolation-user-b/sync/v1/books')}`).then(res => res.json());
    assert.equal(userBRemote.some((book) => book.id === isolationBookId), false);

    await pageIsolation.evaluate(async () => {
      await window.LibriqFirebase.signOut();
    });
    await signInExistingPage(pageIsolation, 'isolation-user-a', 'isolation-a@example.com');
    await delay(6000);
    assert.equal(await pageIsolation.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id), isolationBookId), true);
    const userARestored = await pageIsolation.evaluate(() => ({
      profile: window.LibriqStorage.getProfile(),
      goals: window.LibriqStorage.getGoals(),
      streak: window.LibriqStorage.getStreak(),
      activity: window.LibriqStorage.getActivityLog(),
    }));
    assert.equal(userARestored.profile.name, 'Alice Account');
    assert.equal(userARestored.goals.yearly, 42);
    assert.equal(userARestored.streak.current, 5);
    assert.equal(userARestored.activity.some((event) => event.payload?.marker === 'user-a-activity'), true);

    await pageIsolation.reload({ waitUntil: 'domcontentloaded' });
    await delay(2500);
    const signedInTrace = await pageIsolation.evaluate(() => window.__libriqBootTrace || []);
    assert.equal(signedInTrace.some((entry) => entry.text.includes('Sign in to LibriQ')), false);
    assert.equal(await pageIsolation.evaluate(() => window.LibriqNavigation.currentPage), 'dashboard');

    await pageIsolation.evaluate(async () => {
      await window.LibriqFirebase.signOut();
    });
    await pageIsolation.reload({ waitUntil: 'domcontentloaded' });
    await delay(2500);
    const signedOutTrace = await pageIsolation.evaluate(() => window.__libriqBootTrace || []);
    assert.equal(signedOutTrace.some((entry) => entry.text.includes('Dashboard')), false);
    assert.equal(signedOutTrace.some((entry) => entry.sidebarVisible), false);
    assert.equal(signedOutTrace.some((entry) => entry.text.includes('My Library')), false);
    assert.equal(await pageIsolation.evaluate(() => window.LibriqNavigation.currentPage), 'session');
    await pageIsolation.close();
    await contextIsolation.close();

    const deletionContext = await browser.newContext();
    const deletionPage = await setupPage(deletionContext, 'deletion-user', 'delete@example.com');
    const deletionBookId = await deletionPage.evaluate(() => window.LibriqE2E.addBook({
      title: 'DELETE ME',
      author: 'LibriQ',
      status: 'reading',
    }).id);
    await delay(6000);
    await deletionPage.evaluate(async ({ bookId, portValue }) => {
      await fetch(`http://127.0.0.1:${portValue}/__libriq_test_api/doc?path=${encodeURIComponent('users/deletion-user/backups/current')}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data: { app: 'LibriQ', data: { books: [{ id: bookId }], activity: [] } } }),
      });
    }, { bookId: deletionBookId, portValue: port });
    await deletionPage.evaluate(async () => {
      await window.LibriqSyncBeta.detachForAccountSwitch('test-delete-library');
      await window.LibriqFirebase.deleteCurrentUserLibraryData();
      window.LibriqStorage.clearAccountScopedData(window.LibriqFirebase.getCurrentUser().uid, { keys: ['BOOKS', 'ACTIVITY', 'STREAK', 'GOALS', 'BACKUP', 'CLOUD_BACKUP', 'SYNC_META', 'SYNC_TOMBSTONES'] });
    });
    await delay(2500);
    assert.equal(await deletionPage.evaluate(() => window.LibriqE2E.getBooks().length), 0);
    assert.equal(await deletionPage.evaluate(() => Boolean(window.LibriqFirebase.getCurrentUser())), true);
    const deletedLibraryRemote = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/collection?path=${encodeURIComponent('users/deletion-user/sync/v1/books')}`).then(res => res.json());
    assert.equal(deletedLibraryRemote.length, 0);
    const deletedBackupRemote = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/doc?path=${encodeURIComponent('users/deletion-user/backups/current')}`).then(res => res.json());
    assert.equal(deletedBackupRemote, null);
    await deletionPage.reload({ waitUntil: 'domcontentloaded' });
    await delay(2500);
    assert.equal(await deletionPage.evaluate(() => window.LibriqE2E.getBooks().length), 0);
    await deletionPage.evaluate(async () => {
      await window.LibriqSyncBeta.detachForAccountSwitch('test-delete-account');
      await window.LibriqFirebase.deleteCurrentUserAccount();
    });
    await delay(2500);
    assert.equal(await deletionPage.evaluate(() => Boolean(window.LibriqFirebase.getCurrentUser())), false);
    assert.equal(await deletionPage.evaluate(() => window.LibriqNavigation.currentPage), 'session');
    const deletedAccountRemote = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/collection?path=${encodeURIComponent('users/deletion-user/sync/v1/books')}`).then(res => res.json());
    assert.equal(deletedAccountRemote.length, 0);
    await deletionPage.close();
    await deletionContext.close();

    await pageA.close();
    await pageB.close();
    await browser.close();
    console.log('sync e2e ok');
  } finally {
    server.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
