import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import {
  startE2EServer,
  waitForServer,
  stopE2EServer,
  closePlaywright,
} from './e2e-test-utils.mjs';

const testName = 'storage-browser';
const port = 4176;
const baseUrl = `http://127.0.0.1:${port}`;
const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const server = startE2EServer({ port, testName });
let browser;
const contexts = [];

async function openPage(context, init) {
  if (init) await context.addInitScript(init, version);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(
      () => Boolean(window.__LIBRIQ_APP_READY__ && window.LibriqStorage),
      null,
      { timeout: 10000 },
    );
  } catch (error) {
    throw new Error(`${error.message}\nBrowser errors: ${errors.join('\n')}`);
  }
  return { page, errors };
}

try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });

  const freshContext = await browser.newContext();
  contexts.push(freshContext);
  const { page: freshPage, errors: freshErrors } = await openPage(freshContext, (appVersion) => {
    localStorage.setItem('libriq_seen_version', appVersion);
    window.__storageEventCounts = {};
    for (const type of [
      'libriq:book:added',
      'libriq:book:updated',
      'libriq:book:removed',
      'libriq:profile:updated',
      'libriq:goals:updated',
      'libriq:streak:updated',
      'libriq:activity:updated',
      'libriq:storage:scope-changed',
      'libriq:reset',
    ]) {
      window.addEventListener(type, () => {
        window.__storageEventCounts[type] = (window.__storageEventCounts[type] || 0) + 1;
      });
    }
  });

  const freshState = await freshPage.evaluate(() => ({
    installed: Boolean(localStorage.getItem('libriq_installed')),
    deviceId: window.LibriqStorage.getDeviceId(),
    activeUid: window.LibriqStorage.getActiveAccountUid(),
    books: window.LibriqStorage.getBooks(),
    profile: window.LibriqStorage.getProfile(),
    goals: window.LibriqStorage.getGoals(),
    streak: window.LibriqStorage.getStreak(),
    activity: window.LibriqStorage.getActivityLog(),
  }));
  assert.equal(freshState.installed, true);
  assert.ok(freshState.deviceId);
  assert.equal(freshState.activeUid, null);
  assert.deepEqual(freshState.books, []);
  assert.equal(freshState.profile.name, 'Reader');
  assert.equal(freshState.goals.yearly, 12);
  assert.equal(freshState.streak.current, 0);
  assert.deepEqual(freshState.activity, []);

  const mutation = await freshPage.evaluate(() => {
    const storage = window.LibriqStorage;
    const book = storage.addBook({
      id: 'browser-book',
      title: 'Persistent Browser Book',
      author: 'Browser Reader',
      status: 'reading',
      currentPage: 12,
      pageCount: 300,
      rating: 3,
      notes: 'initial note',
      quotes: [{ id: 'browser-quote', text: 'A quote', page: 12 }],
      tags: ['browser'],
      shelves: ['persistence'],
    });
    storage.updateBook(book.id, {
      currentPage: 144,
      status: 'finished',
      rating: 5,
      isFavorite: true,
      notes: 'persisted note',
      quotes: [{ id: 'browser-quote', text: 'A quote', page: 144, note: 'saved' }],
      tags: ['browser', 'updated'],
      shelves: ['persistence', 'finished'],
    });
    storage.saveProfile({ name: 'Browser Profile', theme: 'light' });
    storage.saveGoals({ yearly: 36, year: 2026 });
    storage.saveStreak({ current: 9, longest: 15, lastRead: '2026-07-01T00:00:00.000Z' });
    storage.addActivityEvent(storage.buildActivityEvent('progress_updated', storage.getBookById(book.id), { page: 144 }, 'manual'));
    storage.saveSyncMeta({ pending: true, pendingBookIds: [book.id], pendingDeleteIds: [] });
    storage.saveSyncTombstones({ deleted: { deletedAt: '2026-07-01T00:00:00.000Z' } });
    storage.saveBackupMeta({ lastExportedAt: '2026-07-02T00:00:00.000Z' });
    storage.saveCloudBackupMeta({ lastCloudBackupAt: '2026-07-03T00:00:00.000Z' });
    return {
      events: window.__storageEventCounts,
      deviceId: storage.getDeviceId(),
    };
  });
  assert.equal(mutation.events['libriq:book:added'], 1);
  assert.equal(mutation.events['libriq:book:updated'], 1);
  assert.equal(mutation.events['libriq:profile:updated'], 1);
  assert.equal(mutation.events['libriq:goals:updated'], 1);
  assert.equal(mutation.events['libriq:streak:updated'], 1);
  assert.equal(mutation.events['libriq:activity:updated'], 1);

  await freshPage.reload({ waitUntil: 'domcontentloaded' });
  await freshPage.waitForFunction(() => Boolean(window.__LIBRIQ_APP_READY__ && window.LibriqStorage));
  const reloaded = await freshPage.evaluate(() => {
    const storage = window.LibriqStorage;
    return {
      book: storage.getBookById('browser-book'),
      profile: storage.getProfile(),
      goals: storage.getGoals(),
      streak: storage.getStreak(),
      activity: storage.getActivityLog(),
      deviceId: storage.getDeviceId(),
      syncMeta: storage.getSyncMeta(),
      tombstones: storage.getSyncTombstones(),
      backup: storage.getBackupMeta(),
      cloudBackup: storage.getCloudBackupMeta(),
    };
  });
  assert.equal(reloaded.book.currentPage, 144);
  assert.equal(reloaded.book.status, 'finished');
  assert.equal(reloaded.book.rating, 5);
  assert.equal(reloaded.book.isFavorite, true);
  assert.equal(reloaded.book.notes, 'persisted note');
  assert.deepEqual(reloaded.book.tags, ['browser', 'updated']);
  assert.deepEqual(reloaded.book.shelves, ['persistence', 'finished']);
  assert.equal(reloaded.book.quotes[0].page, 144);
  assert.equal(reloaded.profile.name, 'Browser Profile');
  assert.equal(reloaded.goals.yearly, 36);
  assert.equal(reloaded.streak.current, 9);
  assert.equal(reloaded.activity.length, 1);
  assert.equal(reloaded.deviceId, mutation.deviceId);
  assert.deepEqual(reloaded.syncMeta.pendingBookIds, ['browser-book']);
  assert.ok(reloaded.tombstones.deleted);
  assert.equal(reloaded.backup.lastExportedAt, '2026-07-02T00:00:00.000Z');
  assert.equal(reloaded.cloudBackup.lastCloudBackupAt, '2026-07-03T00:00:00.000Z');

  const isolation = await freshPage.evaluate(() => {
    const storage = window.LibriqStorage;
    storage.setActiveAccountUid('account-a');
    storage.addBook({ id: 'account-a-book', title: 'Account A', author: 'Reader' });
    storage.setActiveAccountUid('account-b');
    const accountBBefore = storage.getBooks();
    storage.addBook({ id: 'account-b-book', title: 'Account B', author: 'Reader' });
    storage.setActiveAccountUid('account-a');
    const accountA = storage.getBooks();
    storage.clearActiveAccountScope();
    const local = storage.getBooks();
    return { accountBBefore, accountA, local, events: window.__storageEventCounts };
  });
  assert.deepEqual(isolation.accountBBefore.map(book => book.id), ['browser-book']);
  assert.deepEqual(isolation.accountA.map(book => book.id), ['account-a-book', 'browser-book']);
  assert.equal(isolation.accountA.some(book => book.id === 'account-b-book'), false);
  assert.deepEqual(isolation.local.map(book => book.id), ['browser-book']);
  assert.equal(isolation.events['libriq:storage:scope-changed'], 4);

  const resetResult = await freshPage.evaluate(() => {
    const storage = window.LibriqStorage;
    storage.setActiveAccountUid('reset-account');
    storage.addBook({ id: 'reset-me', title: 'Reset Me', author: 'Reader' });
    window.__storageEventCounts['libriq:reset'] = 0;
    storage.resetAll();
    return {
      books: storage.getBooks(),
      resetEvents: window.__storageEventCounts['libriq:reset'],
      deviceId: storage.getDeviceId(),
    };
  });
  assert.deepEqual(resetResult.books, []);
  assert.equal(resetResult.resetEvents, 1);
  assert.ok(resetResult.deviceId);

  const populatedContext = await browser.newContext();
  contexts.push(populatedContext);
  const { page: populatedPage, errors: populatedErrors } = await openPage(populatedContext, (appVersion) => {
    localStorage.setItem('libriq_seen_version', appVersion);
    localStorage.setItem('libriq_installed', '2025-01-01T00:00:00.000Z');
    localStorage.setItem('libriq_device_id', 'existing-browser-device');
    localStorage.setItem('libriq:local:books', JSON.stringify([
      { id: 'preexisting', title: 'Preexisting Book', author: 'Reader', status: 'wishlist' },
    ]));
    localStorage.setItem('libriq:local:profile', JSON.stringify({ name: 'Existing Reader', displayName: 'Existing Reader', theme: 'dark' }));
  });
  assert.deepEqual(await populatedPage.evaluate(() => ({
    book: window.LibriqStorage.getBooks()[0].title,
    profile: window.LibriqStorage.getProfile().name,
    deviceId: window.LibriqStorage.getDeviceId(),
  })), {
    book: 'Preexisting Book',
    profile: 'Existing Reader',
    deviceId: 'existing-browser-device',
  });

  assert.deepEqual(freshErrors.filter(error => /Storage|ReferenceError|module|stale|Failed to load/i.test(error)), []);
  assert.deepEqual(populatedErrors.filter(error => /Storage|ReferenceError|module|stale|Failed to load/i.test(error)), []);
  console.log('Storage browser persistence test passed');
} finally {
  await closePlaywright(browser, contexts, { testName });
  await stopE2EServer(server, { testName });
}
