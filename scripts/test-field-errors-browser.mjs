// Form errors point at the field they are about: aria-invalid on the field,
// the message in its aria-describedby, and focus moved to the first one.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'field-errors-browser';
let baseUrl;
const server = startE2EServer({ testName });

const fieldState = (page, id) => page.evaluate(fieldId => {
  const el = document.getElementById(fieldId);
  const describedBy = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  return {
    invalid: el.getAttribute('aria-invalid'),
    descriptions: describedBy.map(d => document.getElementById(d)?.textContent.trim()).filter(Boolean),
    focused: document.activeElement === el,
  };
}, id);

let browser;
try {
  baseUrl = await waitForServer(server, { testName });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });

  // --- Sign-in form -------------------------------------------------------
  await page.evaluate(() => {
    window.__nextAuthError = 'auth/invalid-email';
    window.LibriqFirebase.signInWithEmail = async () => { throw Object.assign(new Error('x'), { code: window.__nextAuthError }); };
    window.LibriqNavigation.goTo('session');
  });
  await page.waitForSelector('#emailAuthForm');
  await page.locator('#sessionSigninTab').click();
  await page.locator('#sessionEmailInput').fill('not-an-email');
  await page.locator('#sessionPasswordInput').fill('whatever123');
  await page.locator('#emailAuthSubmit').click();
  await page.waitForFunction(() => !document.getElementById('sessionAuthError').hidden);
  let email = await fieldState(page, 'sessionEmailInput');
  let password = await fieldState(page, 'sessionPasswordInput');
  assert.equal(email.invalid, 'true');
  assert.ok(email.descriptions.some(d => /valid email/i.test(d)), JSON.stringify(email));
  assert.equal(email.focused, true, 'focus moves to the field with the problem');
  assert.equal(password.invalid, null, 'only the email is flagged');

  // Typing in the field clears its error state.
  await page.locator('#sessionEmailInput').fill('reader@example.test');
  email = await fieldState(page, 'sessionEmailInput');
  assert.equal(email.invalid, null);
  assert.ok(!email.descriptions.some(d => /valid email/i.test(d)));

  // Wrong credentials point at both fields (we can't say which is wrong).
  await page.evaluate(() => { window.__nextAuthError = 'auth/invalid-credential'; });
  await page.locator('#emailAuthSubmit').click();
  await page.waitForFunction(() => document.getElementById('sessionPasswordInput').getAttribute('aria-invalid') === 'true');
  email = await fieldState(page, 'sessionEmailInput');
  password = await fieldState(page, 'sessionPasswordInput');
  assert.equal(email.invalid, 'true');
  assert.equal(password.invalid, 'true');
  assert.ok(password.descriptions.some(d => /does not look right/.test(d)));
  assert.equal(email.focused, true, 'focus goes to the first flagged field');

  // --- Manual add form ----------------------------------------------------
  await page.evaluate(() => {
    window.LibriqE2E.seedAuth('ferr-user', 'ferr@example.test', 'Field Errors');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    window.LibriqNavigation.goTo('dashboard');
    window.Search.openManualEntry();
  });
  await page.waitForSelector('#manualTitleInput');
  await page.locator('#manualTitleInput').fill('A Test Book');
  await page.locator('#manualAuthorInput').fill('Someone');
  await page.locator('#manualPageCountInput').fill('100');
  await page.locator('#manualStatusInput').selectOption('reading');
  await page.locator('#manualCurrentPageInput').fill('150');
  await page.locator('#addBookForm button[type="submit"]').click();
  const current = await fieldState(page, 'manualCurrentPageInput');
  await page.screenshot({ path: 'artifacts/field-errors/manual-current-page.png' });
  assert.equal(current.invalid, 'true');
  assert.ok(current.descriptions.some(d => /cannot exceed page count/i.test(d)), JSON.stringify(current));
  assert.equal(current.focused, true);
  assert.equal(await page.evaluate(() => window.LibriqStorage.getBooks().some(b => b.title === 'A Test Book')), false, 'not saved');

  await page.locator('#manualCurrentPageInput').fill('50');
  assert.equal((await fieldState(page, 'manualCurrentPageInput')).invalid, null, 'cleared on edit');
  await page.locator('#addBookForm button[type="submit"]').click();
  await page.waitForFunction(() => window.LibriqStorage.getBooks().some(b => b.title === 'A Test Book'));

  assert.deepEqual(errors, []);
  console.log('Field errors browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
