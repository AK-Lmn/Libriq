// Delete Account with a stale sign-in: the reader confirms their password in
// place and the delete retries, instead of being told to sign out and back in.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'delete-reauth-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });

  // Stub the account calls so nothing real is deleted: the first delete is
  // refused as stale, the retry succeeds.
  const setup = async ({ method }) => page.evaluate(async ({ method }) => {
    window.LibriqE2E.seedAuth('reauth-user', 'reader@example.test', 'Reauth Reader');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    const { LibriqFirebase } = await import('./js/firebase-client.js');
    window.__reauth = { deletes: 0, reauth: [] };
    Object.assign(LibriqFirebase, {
      getCurrentAuthUser: async () => ({ email: 'reader@example.test' }),
      getUserEmailAuthInfo: () => ({ email: 'reader@example.test', hasPasswordProvider: method === 'password', providers: [method === 'password' ? 'password' : 'google.com'] }),
      deleteCurrentUserAccount: async () => {
        window.__reauth.deletes += 1;
        if (window.__reauth.deletes === 1) throw Object.assign(new Error('stale'), { code: 'auth/requires-recent-login' });
        return true;
      },
      reauthenticateCurrentUser: async ({ password = null } = {}) => { window.__reauth.reauth.push(password); return true; },
    });
    window.LibriqNavigation.goTo('settings');
  }, { method });

  const startDelete = async () => {
    await page.locator('[data-action="delete-account"]').click();
    await page.locator('#dangerConfirmInput').fill('DELETE ACCOUNT');
    await page.locator('#dangerConfirmAction').click();
  };

  // Password account: dialog appears, is labelled, focuses the field, and
  // only enables the button once something is typed.
  await setup({ method: 'password' });
  await startDelete();
  const dialog = page.locator('#passwordConfirmationModal');
  await dialog.waitFor({ state: 'visible' });
  assert.match(await dialog.innerText(), /Password for reader@example\.test/);
  assert.equal(await page.locator('#passwordConfirmationInput').getAttribute('type'), 'password');
  assert.equal(await page.locator('#passwordConfirmationInput').getAttribute('autocomplete'), 'current-password');
  await page.waitForFunction(() => document.activeElement?.id === 'passwordConfirmationInput');
  assert.equal(await page.locator('#passwordConfirmationAccept').isDisabled(), true);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'artifacts/delete-reauth/password-dialog.png' });
  await page.locator('#passwordConfirmationInput').fill('correct horse');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__reauth.deletes === 2);
  assert.deepEqual(await page.evaluate(() => window.__reauth.reauth), ['correct horse']);
  await page.waitForFunction(() => [...document.querySelectorAll('#toastContainer .toast')].some(t => /Account deleted/.test(t.textContent)));
  assert.equal(await dialog.count(), 0, 'dialog removed');

  // Cancel: no re-check, no second delete, no "deleted" toast.
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });
  await setup({ method: 'password' });
  await startDelete();
  await dialog.waitFor({ state: 'visible' });
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => window.__reauth), { deletes: 1, reauth: [] });
  assert.equal(await page.locator('body > [inert]').count(), 0, 'page usable after cancel');

  // Google account: a confirm step, then the popup re-check (no password).
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });
  await setup({ method: 'google' });
  await startDelete();
  await page.locator('#actionConfirmationAccept').waitFor();
  assert.equal(await page.locator('#actionConfirmationAccept').innerText(), 'Continue with Google');
  await page.locator('#actionConfirmationAccept').click();
  await page.waitForFunction(() => window.__reauth.deletes === 2);
  assert.deepEqual(await page.evaluate(() => window.__reauth.reauth), [null]);

  assert.deepEqual(errors, []);
  console.log('Delete account re-auth browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
