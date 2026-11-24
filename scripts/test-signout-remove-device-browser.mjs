// "Sign out and remove" in Settings signs the reader out and deletes their
// account's copy from this device: every libriq:users:{uid}:* key and the
// saved-covers cache. Another account's data on the same device stays.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'signout-remove-device-browser';
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

  const signInAs = uid => page.evaluate(id => {
    window.LibriqE2E.seedAuth(id, `${id}@example.test`, id);
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
  }, uid);
  const keysFor = uid => page.evaluate(id => Object.keys(localStorage).filter(key => key.startsWith(`libriq:users:${id}:`)), uid);

  // Reader B used this device earlier; reader A is signed in now.
  await signInAs('reader-b');
  await page.evaluate(() => window.LibriqE2E.addBook({ title: 'B book', author: 'B', status: 'reading' }));
  await signInAs('reader-a');
  await page.evaluate(async () => {
    window.LibriqE2E.addBook({ title: 'A book', author: 'A', status: 'reading' });
    const covers = await caches.open('libriq-covers-v1');
    await covers.put('/cover-test.jpg', new Response('img'));
  });
  assert.ok((await keysFor('reader-a')).length > 0, 'reader A has data on the device');
  const readerBKeys = await keysFor('reader-b');
  assert.ok(readerBKeys.length > 0, 'reader B has data on the device');

  await page.evaluate(() => window.LibriqNavigation.goTo('settings'));
  await page.locator('[data-action="remove-device-data"]').click();
  await page.locator('#actionConfirmationModal').waitFor();
  assert.match(await page.locator('#actionConfirmationModal').innerText(), /cloud/i, 'the dialog says the cloud copy stays');
  await page.locator('#actionConfirmationAccept').click();

  await page.waitForFunction(() => !window.LibriqFirebase.getState().user);
  await page.waitForFunction(async () => !(await caches.has('libriq-covers-v1')));
  assert.deepEqual(await keysFor('reader-a'), [], "reader A's data is gone from the device");
  assert.deepEqual(await keysFor('reader-b'), readerBKeys, "reader B's data stays");

  // Cancelling leaves everything in place.
  await signInAs('reader-a');
  await page.evaluate(() => window.LibriqE2E.addBook({ title: 'A again', author: 'A', status: 'reading' }));
  await page.evaluate(() => window.LibriqNavigation.goTo('settings'));
  await page.locator('[data-action="remove-device-data"]').click();
  await page.locator('#actionConfirmationCancel').click();
  assert.equal(await page.evaluate(() => window.LibriqFirebase.getState().user?.uid), 'reader-a', 'still signed in');
  assert.ok((await keysFor('reader-a')).length > 0, 'data kept on cancel');

  assert.deepEqual(errors, []);
  console.log('Sign out and remove device data browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
