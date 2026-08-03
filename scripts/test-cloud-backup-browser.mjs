import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'cloud-backup-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });
let browser;
let context;

async function readBackup(uid) {
  const path = encodeURIComponent(`users/${uid}/backups/current`);
  return fetch(`${baseUrl}/__libriq_test_api/doc?path=${path}`).then(response => response.json());
}

async function waitFor(predicate, message, timeout = 12000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  const failedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => failedRequests.push(request.url()));
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });

  const uid = 'cloud-backup-user';
  await page.evaluate(({ uid }) => {
    window.LibriqE2E.seedAuth(uid, `${uid}@example.com`, 'Cloud Reader');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    window.LibriqCloudBackup.refresh();
    window.LibriqNavigation.goTo('dashboard');
  }, { uid });

  const bookId = await page.evaluate(() => window.LibriqE2E.addBook({
    title: 'Cloud Backup Book', author: 'LibriQ', status: 'wishlist', rating: 0,
  }).id);
  await waitFor(async () => (await readBackup(uid))?.data?.books?.some(book => book.id === bookId), 'automatic book backup did not complete');

  await page.evaluate(id => window.LibriqE2E.updateBook(id, { currentPage: 33, rating: 4 }), bookId);
  await waitFor(async () => (await readBackup(uid))?.data?.books?.some(book => book.id === bookId && book.currentPage === 33 && book.rating === 4), 'progress/rating backup did not complete');

  await page.evaluate(() => {
    const Storage = window.LibriqStorage;
    Storage.saveProfile({ ...Storage.getProfile(), displayName: 'Cloud Profile' });
    Storage.saveGoals({ ...Storage.getGoals(), yearly: 25 });
    Storage.saveStreak({ ...Storage.getStreak(), current: 6 });
    window.dispatchEvent(new CustomEvent('libriq:profile:updated', { detail: Storage.getProfile() }));
    window.dispatchEvent(new CustomEvent('libriq:goals:updated', { detail: Storage.getGoals() }));
    window.dispatchEvent(new CustomEvent('libriq:streak:updated', { detail: Storage.getStreak() }));
    window.dispatchEvent(new CustomEvent('libriq:activity:updated'));
  });
  await waitFor(async () => {
    const backup = await readBackup(uid);
    return backup?.data?.profile?.displayName === 'Cloud Profile' && backup?.data?.goals?.yearly === 25 && backup?.data?.streak?.current === 6;
  }, 'profile/goals/streak backup did not complete');

  await context.setOffline(true);
  await page.evaluate(id => window.LibriqE2E.updateBook(id, { currentPage: 40 }), bookId);
  assert.equal(await page.evaluate(() => window.LibriqCloudBackup.getState().status), 'paused');
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await waitFor(async () => (await readBackup(uid))?.data?.books?.some(book => book.id === bookId && book.currentPage === 40), 'reconnect backup did not complete');

  assert.equal(await page.evaluate(() => window.LibriqCloudBackup.runBackup('manual-browser-test', false)), true);
  await page.evaluate(() => window.LibriqNavigation.goTo('settings'));
  await page.waitForSelector('#settingsCloudBackupCard');
  assert.match(await page.locator('#cloudBackupStatusText').textContent(), /backup|backed/i);

  const previewMutationSafe = await page.evaluate(() => {
    const Storage = window.LibriqStorage;
    const before = JSON.stringify(Storage.getBooks());
    const backup = {
      app: 'LibriQ',
      data: { books: [{ id: 'preview-cloud', title: 'Preview Cloud', author: 'LibriQ' }], profile: {}, goals: {}, streak: {}, activity: [] },
    };
    const plan = window.LibriqCloudBackup.previewMerge(backup);
    return { newBooks: plan.newBooksToAdd.length, unchanged: before === JSON.stringify(Storage.getBooks()) };
  });
  assert.deepEqual(previewMutationSafe, { newBooks: 1, unchanged: true });
  assert.equal(await page.evaluate(() => window.LibriqCloudBackup.normalizeBackup({ app: 'Wrong', data: { books: [] } })), null);
  const applyResults = await page.evaluate(() => {
    const Storage = window.LibriqStorage;
    const mergeBackup = {
      app: 'LibriQ',
      data: { books: [{ id: 'merge-cloud', title: 'Merge Cloud', author: 'LibriQ' }], profile: {}, goals: {}, streak: {}, activity: [] },
    };
    const merge = window.LibriqCloudBackup.applyMerge(mergeBackup);
    const merged = Storage.getBooks().some(book => book.id === 'merge-cloud');
    const restoreBackup = {
      app: 'LibriQ',
      data: { books: [{ id: 'restore-cloud', title: 'Restore Cloud', author: 'LibriQ' }], profile: { displayName: 'Restored' }, goals: {}, streak: {}, activity: [] },
    };
    const restore = window.LibriqCloudBackup.applyRestore(restoreBackup);
    return {
      mergeOk: merge.ok,
      merged,
      restoreOk: restore.ok,
      restoredOnly: Storage.getBooks().length === 1 && Storage.getBooks()[0].id === 'restore-cloud',
    };
  });
  assert.deepEqual(applyResults, { mergeOk: true, merged: true, restoreOk: true, restoredOnly: true });

  const otherUid = 'cloud-backup-other';
  await page.evaluate(({ otherUid }) => {
    window.LibriqE2E.seedAuth(otherUid, `${otherUid}@example.com`, 'Other Reader');
    window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
    window.LibriqCloudBackup.refresh();
  }, { otherUid });
  assert.equal(await page.evaluate(() => window.LibriqCloudBackup.getState().activeUid), otherUid);
  await page.evaluate(() => window.LibriqFirebase.signOut());
  assert.equal(await page.evaluate(() => window.LibriqCloudBackup.getState().status), 'paused');
  assert.deepEqual(errors, [], `failed requests: ${failedRequests.join(', ')}`);
  console.log('Cloud Backup browser lifecycle test passed');
} finally {
  await closePlaywright(browser, context ? [context] : [], { testName });
  await stopE2EServer(server, { testName });
}
