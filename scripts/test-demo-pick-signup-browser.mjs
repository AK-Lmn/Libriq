// A book picked in the landing page's Live Book Search is still there after
// sign-up. Signed out, the visitor searches, presses Save, creates an account
// with the real form, and finds the book on Want to Read.
//
// Runs in the app's test mode (localhost only): sign-up goes through the same
// form and code path, but the account is a local fake, so nothing reaches
// Firebase. The email and password below are made-up test values.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'demo-pick-signup-browser';
const server = startE2EServer({ testName });

let browser;
try {
  const baseUrl = await waitForServer(server, { testName });
  browser = await chromium.launch({ headless: true });
  for (const [width, height] of [[1280, 900], [390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#sessionDemoInput', { timeout: 30000 });
    await page.evaluate(async () => {
      const { BookAPI } = await import('./js/api/index.js');
      BookAPI.searchBooks = async () => [{ id: 'ol-phm', title: 'Project Hail Mary', author: 'Andy Weir', pageCount: 496, source: 'openlibrary' }];
    });

    // Search and save from the demo, signed out.
    await page.locator('#sessionDemoInput').fill('Hail Mary');
    await page.locator('.session-demo-save-btn').first().click();
    assert.ok(await page.evaluate(() => localStorage.getItem('libriq_pending_demo_book')), `${width}: the pick is remembered`);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'sessionEmailInput', `${width}: sign-up form is focused`);

    // Create the account with the real form.
    await page.locator('#sessionEmailInput').fill(`demo-${width}@example.test`);
    await page.locator('#sessionPasswordInput').fill('test-only-password-1');
    await page.locator('#emailAuthSubmit').click();
    await page.waitForFunction(() => window.LibriqStorage?.getBooks?.().some(book => book.title === 'Project Hail Mary'), null, { timeout: 30000 });

    const result = await page.evaluate(() => ({
      book: window.LibriqStorage.getBooks().find(book => book.title === 'Project Hail Mary'),
      pending: localStorage.getItem('libriq_pending_demo_book'),
    }));
    assert.equal(result.book.status, 'wishlist', `${width}: on Want to Read`);
    assert.equal(result.book.author, 'Andy Weir');
    assert.equal(result.pending, null, `${width}: the pick is used up`);

    await page.evaluate(() => window.LibriqNavigation.goTo('wishlist'));
    await page.waitForFunction(() => document.querySelector('#mainContent')?.textContent.includes('Project Hail Mary'), null, { timeout: 10000 });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Demo pick survives sign-up browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
