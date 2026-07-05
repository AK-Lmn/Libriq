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
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await delay(3000);
  await page.evaluate(({ uid, email }) => {
    window.LibriqE2E.seedAuth(uid, email, uid);
    window.LibriqE2E.enableAccountMode();
    window.LibriqE2E.enableSyncBeta();
    window.dispatchEvent(new CustomEvent('libriq:auth-changed', { detail: window.LibriqFirebase.getState() }));
    window.LibriqNavigation.goTo('dashboard');
    window.LibriqSyncBeta.refresh();
  }, { uid, email });
  await delay(3000);
  const attached = await page.evaluate(() => Boolean(window.LibriqE2E && window.LibriqSyncDebug && window.LibriqSyncDebug.status().attached));
  assert.equal(attached, true);
  return page;
}

async function main() {
  const server = startServer();
  try {
    await delay(1500);
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
    assert.equal(statusA.sessionMode, 'account');
    assert.match(statusA.listenerPath, /users\/test-user\/sync\/v1\/books/);
    assert.ok(statusA.deviceId);
    assert.notEqual(statusA.deviceId, statusB.deviceId);

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
