// Product events fire from the running app: the first book once (not the
// second), and setting a goal. Each request carries only the event name.
// Off on 127.0.0.1 unless ?libriq_product_events=1 is set.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'product-events-browser';
const server = startE2EServer({ testName });

let browser;
try {
  const baseUrl = await waitForServer(server, { testName });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const events = [];
  await page.route('**/api/product-event', async route => {
    events.push(JSON.parse(route.request().postData() || 'null'));
    await route.fulfill({ status: 204 });
  });
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1&libriq_product_events=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });
  await page.evaluate(() => {
    window.LibriqE2E.seedAuth('events', 'events@example.test', 'Events');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    window.LibriqE2E.addBook({ title: 'First Book', author: 'A', status: 'reading', pageCount: 100, currentPage: 1 });
    window.LibriqE2E.addBook({ title: 'Second Book', author: 'B', status: 'wishlist' });
    window.LibriqNavigation.goTo('goals');
  });
  await page.waitForSelector('#goalsForm');
  await page.locator('#yearlyGoalInput').fill('20');
  await page.locator('#goalsForm button[type="submit"]').click();
  await page.waitForTimeout(500);

  assert.deepEqual(events, [{ name: 'first_book' }, { name: 'goal_set' }], 'first book once, then the goal; name only');

  // A reload doesn't count the first book again.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });
  await page.evaluate(() => window.LibriqE2E.addBook({ title: 'Third Book', author: 'C', status: 'wishlist' }));
  await page.waitForTimeout(300);
  assert.equal(events.filter(e => e.name === 'first_book').length, 1);

  // Without the flag, 127.0.0.1 sends nothing.
  const quiet = await browser.newPage();
  let sent = 0;
  await quiet.route('**/api/product-event', route => { sent += 1; return route.fulfill({ status: 204 }); });
  await quiet.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(quiet, { testName });
  await quiet.evaluate(() => {
    localStorage.removeItem('libriq_first_book_counted');
    window.LibriqE2E.seedAuth('quiet', 'quiet@example.test', 'Quiet');
    window.LibriqE2E.addBook({ title: 'Local Book', author: 'D', status: 'reading' });
  });
  await quiet.waitForTimeout(300);
  assert.equal(sent, 0, 'no events from a local host');
  console.log('Product events browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
