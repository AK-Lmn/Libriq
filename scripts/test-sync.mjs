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
      localStorage.setItem('libriq_sync_delete_tombstones', JSON.stringify({
        fresh_cleanup_test: { id: 'fresh_cleanup_test', deletedAt: freshAt, updatedAt: freshAt },
        old_cleanup_test: { id: 'old_cleanup_test', deletedAt: oldAt, updatedAt: oldAt },
      }));
      const result = window.LibriqSyncDebug.pruneOldLocalTombstones(now);
      const remaining = JSON.parse(localStorage.getItem('libriq_sync_delete_tombstones') || '{}');
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
    assert.equal(await pageIsolation.evaluate(() => window.LibriqE2E.getBooks().length), 0);
    assert.equal(await pageIsolation.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id), isolationBookId), false);
    const userBRemote = await fetch(`http://127.0.0.1:${port}/__libriq_test_api/collection?path=${encodeURIComponent('users/isolation-user-b/sync/v1/books')}`).then(res => res.json());
    assert.equal(userBRemote.some((book) => book.id === isolationBookId), false);

    await pageIsolation.evaluate(async () => {
      await window.LibriqFirebase.signOut();
    });
    await signInExistingPage(pageIsolation, 'isolation-user-a', 'isolation-a@example.com');
    await delay(6000);
    assert.equal(await pageIsolation.evaluate((id) => window.LibriqE2E.getBooks().some((book) => book.id === id), isolationBookId), true);
    await pageIsolation.close();
    await contextIsolation.close();

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
