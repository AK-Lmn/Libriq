// Book details: actions stay visible while the details scroll, there is one
// way to close (no "Back to library" next to "Close"), the quote counter
// reads as a count, and Remove is styled as destructive with an Undo.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'book-details-polish-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  for (const [theme, width, height] of [['dark', 1280, 800], ['light', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page, { testName });
    const id = await page.evaluate(t => {
      window.LibriqE2E.seedAuth('details', 'details@example.test', 'Details');
      window.LibriqE2E.enableAccountMode();
      window.LibriqSyncBeta.setEnabled(false);
      document.documentElement.dataset.theme = t;
      const book = window.LibriqE2E.addBook({ title: 'Undo Me', author: 'Someone', status: 'reading', pageCount: 300, currentPage: 40,
        description: 'A long description. '.repeat(80), notes: 'My notes' });
      window.LibriqNavigation.goTo('library');
      window.Library.showDetailsModal(book.id);
      return book.id;
    }, theme);
    const modal = page.locator('#bookDetailsModal');
    await modal.waitFor({ state: 'visible' });

    // One way to close.
    assert.equal(await modal.locator('.book-details-back').count(), 0, `${theme}: no redundant Back button`);
    assert.equal(await modal.locator('.modal-close').count(), 1);

    // Quote counter reads as a count.
    assert.match(await modal.locator('#bookQuotesCount').textContent(), /^0 quotes$/);

    // Actions stay visible after scrolling the details to the bottom.
    await page.locator('#bookDetailsBody').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await page.locator('#bookDetailsBody').evaluate(el => { el.scrollTop = 0; });
    const visibleAtTop = await page.evaluate(() => {
      const bar = document.querySelector('#bookDetailsFooter');
      const body = document.querySelector('#bookDetailsBody');
      const r = bar.getBoundingClientRect(), b = body.getBoundingClientRect();
      return { position: getComputedStyle(bar).position, inView: r.top >= b.top - 1 && r.bottom <= b.bottom + 1 };
    });
    assert.equal(visibleAtTop.position, 'sticky', `${theme}: action bar is sticky`);
    assert.equal(visibleAtTop.inView, true, `${theme}: actions visible without scrolling to the bottom`);

    // Remove is destructive-styled and offers Undo.
    const remove = modal.locator('[data-details-action="destructive"]');
    assert.ok(await remove.evaluate(el => el.classList.contains('btn-danger')), `${theme}: Remove uses the danger style`);
    await page.screenshot({ path: `artifacts/ux/details-${theme}-${width}.png` });
    await remove.click();
    await page.locator('#actionConfirmationAccept').click();
    await page.waitForFunction(bookId => !window.LibriqStorage.getBookById(bookId), id);
    const undo = page.locator('#toastContainer button', { hasText: 'Undo' });
    await undo.waitFor();
    await undo.click();
    await page.waitForFunction(bookId => Boolean(window.LibriqStorage.getBookById(bookId)), id);
    const restored = await page.evaluate(bookId => window.LibriqStorage.getBookById(bookId), id);
    assert.equal(restored.title, 'Undo Me');
    assert.equal(restored.currentPage, 40, 'progress kept');
    assert.equal(restored.notes, 'My notes', 'notes kept');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Book details polish browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
