// The weekly reading email is opt-in per account. Settings shows a row that is
// off by default, the choice is saved to users/{uid}/prefs/email, it survives
// a reload, another reader on the same device starts off, and deleting the
// account removes it.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'digest-optin-browser';
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
  const openSettings = () => page.evaluate(() => window.LibriqNavigation.goTo('settings'));
  const toggle = () => page.locator('[data-action="toggle-weekly-digest"]');
  const saved = () => page.evaluate(() => window.LibriqFirebase.readEmailPrefs());

  await signInAs('reader-a');
  await openSettings();
  await toggle().waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-action="toggle-weekly-digest"]')?.disabled);
  assert.match(await toggle().innerText(), /Turn on weekly email/, 'off by default');
  assert.equal((await saved()).weeklyDigest, false, 'nothing is saved until the reader chooses');
  assert.match(await page.locator('.settings-account-digest-row').innerText(), /reader-a@example\.test/, 'names the address');

  await toggle().click();
  await page.waitForFunction(() => /Turn off weekly email/.test(document.querySelector('[data-action="toggle-weekly-digest"]')?.textContent || ''));
  const on = await saved();
  assert.equal(on.weeklyDigest, true, 'saved as on');
  assert.match(on.updatedAt, /^\d{4}-\d{2}-\d{2}T/, 'with a timestamp');

  // Survives a reload.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });
  await signInAs('reader-a');
  await openSettings();
  await page.waitForFunction(() => /Turn off weekly email/.test(document.querySelector('[data-action="toggle-weekly-digest"]')?.textContent || ''));

  // Another reader on the same device starts off.
  await signInAs('reader-b');
  await openSettings();
  await page.waitForFunction(() => /Turn on weekly email/.test(document.querySelector('[data-action="toggle-weekly-digest"]')?.textContent || ''));

  // Back to reader A: turn it off again.
  await signInAs('reader-a');
  await openSettings();
  await page.waitForFunction(() => /Turn off weekly email/.test(document.querySelector('[data-action="toggle-weekly-digest"]')?.textContent || ''));
  await toggle().click();
  await page.waitForFunction(() => /Turn on weekly email/.test(document.querySelector('[data-action="toggle-weekly-digest"]')?.textContent || ''));
  assert.equal((await saved()).weeklyDigest, false);

  // Turn it on once more, then delete the account: the choice goes with it.
  await toggle().click();
  await page.waitForFunction(async () => (await window.LibriqFirebase.readEmailPrefs()).weeklyDigest === true);
  await page.evaluate(() => window.LibriqFirebase.deleteCurrentUserAccount());
  await signInAs('reader-a');
  assert.equal((await saved()).weeklyDigest, false, 'deleting the account removes the saved choice');

  assert.deepEqual(errors, []);
  console.log('Weekly digest opt-in browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
