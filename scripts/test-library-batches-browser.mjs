// A 1,000-book library renders one batch at a time. The first paint holds 60
// cards, scrolling the "more" row into view adds the next batch, and the
// button does the same without a pointer. Shelf view batches too.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'library-batches-browser';
const server = startE2EServer({ testName });

let browser;
try {
  const baseUrl = await waitForServer(server, { testName });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });

  await page.evaluate(() => {
    window.LibriqE2E.seedAuth('reader', 'reader@example.test', 'Reader');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    const books = Array.from({ length: 1000 }, (_, i) => ({
      id: `bulk-${i}`, title: `Bulk ${String(i).padStart(4, '0')}`, author: 'Author', status: 'wishlist',
      dateAdded: new Date(Date.UTC(2026, 0, 1) + i * 60000).toISOString(),
    }));
    window.LibriqStorage.saveBooks(books);
    window.LibriqStorage.saveBooks(books);
    sessionStorage.setItem('libriq_library_sort', 'title-az');
    window.LibriqNavigation.goTo('library');
  });
  const cards = () => page.locator('#libraryGrid .book-card').count();
  // A plain evaluate: the page can re-render between Playwright's "stable" check and the scroll,
  // which makes scrollIntoViewIfNeeded throw "Element is not attached" under load.
  const scrollMoreIntoView = () => page.evaluate(() => document.getElementById('libraryMore')?.scrollIntoView());
  await page.waitForSelector('#libraryGrid .book-card');
  assert.equal(await cards(), 60, 'first paint is one batch');
  assert.match(await page.locator('#libraryResultCount').innerText(), /1000 books/, 'the count is the whole library');
  const nodes = await page.evaluate(() => document.querySelectorAll('#mainContent *').length);
  assert.ok(nodes < 6000, `page stays small (${nodes} nodes)`);

  // Scrolling the "more" row into view loads the next batch.
  await scrollMoreIntoView();
  await page.waitForFunction(() => document.querySelectorAll('#libraryGrid .book-card').length >= 120);

  // Keep going to the end; every book appears once, in order.
  await page.waitForFunction(() => {
    document.getElementById('libraryMore')?.scrollIntoView();
    return document.querySelectorAll('#libraryGrid .book-card').length >= 1000;
  }, null, { timeout: 60000, polling: 100 });
  assert.equal(await cards(), 1000);
  const titles = await page.locator('#libraryGrid .book-card-title').allInnerTexts();
  assert.deepEqual(titles, [...titles].sort(), 'sorted order holds across batches');
  assert.equal(new Set(titles).size, 1000, 'no duplicates');
  assert.equal(await page.locator('#libraryMore').isHidden(), true, 'the row hides at the end');

  // Searching starts over at one batch; favouriting keeps the batches shown.
  await page.locator('#librarySearchInput').fill('Bulk 0');
  await page.waitForFunction(() => document.querySelectorAll('#libraryGrid .book-card').length < 1000);
  assert.ok(await cards() < 1000 && await cards() % 60 === 0, 'a new search starts over in whole batches');
  const before = await cards();
  await page.locator('#libraryMoreBtn').click();
  assert.ok(await cards() > before, 'the button loads the next batch');
  await page.locator('#libraryGrid .book-card').nth(100).locator('[data-action="toggle-favorite"]').click();
  await page.waitForTimeout(300);
  assert.ok(await cards() >= 120, 'a favourite toggle does not reset the list');

  // Shelf view batches the same way.
  await page.locator('#librarySearchInput').fill('');
  await page.locator('[data-action="set-library-view"][data-view="shelf"]').click();
  await page.waitForSelector('#libraryGrid .bookshelf-spine, #libraryGrid [class*="spine"]');
  const spines = () => page.locator('#libraryGrid .bookshelf-spines > *').count();
  // Shelf tiers are short, so the row stays near the viewport and batches keep
  // arriving until it is far enough below the fold. Always whole batches, never all of them.
  await page.waitForFunction(() => document.querySelectorAll('#libraryGrid .bookshelf-spines > *').length >= 60);
  await page.waitForTimeout(500);
  const loaded = await spines();
  assert.ok(loaded >= 60 && loaded < 1000 && loaded % 60 === 0, `shelf view batches (${loaded} loaded)`);
  await scrollMoreIntoView();
  await page.waitForFunction(count => document.querySelectorAll('#libraryGrid .bookshelf-spines > *').length > count, loaded);
  assert.equal(await page.locator('#libraryGrid .bookshelf-showcase').count(), 1, 'one showcase, tiers appended');

  assert.deepEqual(errors, []);
  console.log('Library batches browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
