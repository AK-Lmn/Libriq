import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'dialog-accessibility-browser';
const port = 4182;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });
let browser;
let context;

try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext();
  await context.addInitScript(() => {
    localStorage.setItem('libriq_session_pref', 'offline');
    localStorage.setItem('libriq_preferred_session_mode', 'offline');
    localStorage.setItem('libriq_seen_version', '4.7.0');
  });

  const page = await context.newPage();
  const errors = [];
  const firebaseRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/vendor\/firebase-(?:app|auth|firestore)\.js/.test(request.url())) {
      firebaseRequests.push(request.url());
    }
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__LIBRIQ_APP_READY__));
  await page.waitForSelector('#dashboardPage');

  const trigger = page.locator('[data-action="open-search"]').first();
  await trigger.focus();
  await trigger.click();
  await page.waitForSelector('#searchModal:not([hidden])');

  const opened = await page.evaluate(() => ({
    activeId: document.activeElement?.id,
    bodyOverflow: document.body.style.overflow,
    appInert: document.getElementById('app')?.inert,
    modalLabel: document.getElementById('searchModal')?.getAttribute('aria-label'),
  }));
  assert.equal(opened.activeId, 'searchInput');
  assert.equal(opened.bodyOverflow, 'hidden');
  assert.equal(opened.appInert, true);
  assert.equal(opened.modalLabel, 'Search books');

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => document.getElementById('searchModal')?.hasAttribute('hidden'));
  await page.waitForFunction(() => document.activeElement?.matches?.('[data-action="open-search"]'));
  const closed = await page.evaluate(() => ({
    bodyOverflow: document.body.style.overflow,
    appInert: document.getElementById('app')?.inert,
    focusReturned: document.activeElement?.matches?.('[data-action="open-search"]') || false,
  }));
  assert.equal(closed.bodyOverflow, '');
  assert.equal(closed.appInert, false);
  assert.equal(closed.focusReturned, true);
  assert.deepEqual(errors, []);
  assert.deepEqual(firebaseRequests, []);

  console.log('Accessible dialog browser test passed.');
} finally {
  await closePlaywright(browser, context ? [context] : [], { testName });
  await stopE2EServer(server, { testName });
}
