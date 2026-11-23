// The dashboard's getting-started checklist belongs to the account. Dismissing
// it as one reader doesn't hide it for another account on the same device,
// and setting a goal ticks the goal step for that account only.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'onboarding-browser';
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
    window.LibriqNavigation.goTo('dashboard');
  }, uid);
  const checklist = () => page.locator('.onboarding-checklist');
  const goalStepDone = () => page.locator('.onboarding-step').nth(1).evaluate(el => el.classList.contains('completed'));

  // Reader A dismisses the checklist.
  await signInAs('reader-a');
  await checklist().waitFor();
  await page.locator('[data-action="dismiss-onboarding"]').click();
  await checklist().waitFor({ state: 'detached' });

  // Reader B, same device, still sees it, and the goal step isn't done.
  await signInAs('reader-b');
  await checklist().waitFor();
  assert.equal(await goalStepDone(), false);

  // Saving a goal (even the default 12) ticks the step for reader B.
  await page.evaluate(() => window.LibriqNavigation.goTo('goals'));
  await page.waitForSelector('#goalsForm');
  await page.locator('#yearlyGoalInput').fill('12');
  await page.locator('#goalsForm button[type="submit"]').click();
  await page.evaluate(() => window.LibriqNavigation.goTo('dashboard'));
  await checklist().waitFor();
  assert.equal(await goalStepDone(), true, 'goal step done for reader B');

  // Reader A's dismissal survives a reload and the switch back.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });
  await signInAs('reader-a');
  await page.waitForSelector('.dashboard-panel, .dashboard-hero, #mainContent h1');
  assert.equal(await checklist().count(), 0, 'still dismissed for reader A');

  assert.deepEqual(errors, []);
  console.log('Onboarding per account browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
