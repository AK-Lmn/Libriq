// Loads the app with the production Content-Security-Policy from vercel.json
// (the local test server doesn't send it) and fails on any violation. Also
// checks the delegated cover fallback that replaced the inline onerror.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'csp-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const csp = vercel.headers.find(entry => entry.headers.some(h => h.key === 'Content-Security-Policy')).headers
  .find(h => h.key === 'Content-Security-Policy').value
  // No report endpoint locally; violations are collected in the page instead.
  .replace(/;\s*report-uri [^;]+/, '').replace(/;\s*report-to [^;]+/, '');

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.route('**/*', async route => {
    if (route.request().resourceType() !== 'document') return route.continue();
    const response = await route.fetch();
    return route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  await context.addInitScript(() => {
    window.__cspViolations = [];
    document.addEventListener('securitypolicyviolation', e => {
      window.__cspViolations.push(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} at ${e.sourceFile || ''}:${e.lineNumber || ''}`);
    });
  });

  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });

  await page.evaluate(() => {
    window.LibriqE2E.seedAuth('csp-user', 'csp-user@example.com', 'CSP Reader');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    window.LibriqE2E.addBook({ title: 'Broken Cover', author: 'LibriQ', status: 'reading', coverUrl: 'https://127.0.0.1:1/missing.jpg' });
  });
  for (const route of ['dashboard', 'library', 'stats', 'goals', 'activity', 'recommendations', 'settings', 'help']) {
    await page.evaluate(name => window.LibriqNavigation.goTo(name), route);
    await page.waitForTimeout(250);
  }

  // A cover that fails to load falls back to the placeholder via the
  // delegated error listener.
  await page.evaluate(() => window.LibriqNavigation.goTo('library'));
  await page.waitForFunction(() => [...document.querySelectorAll('[data-cover-title]')]
    .length === 0 || document.querySelector('.book-cover-placeholder .cover-title')?.textContent.includes('Broken Cover'), null, { timeout: 8000 });
  const placeholderShown = await page.evaluate(() => [...document.querySelectorAll('.book-cover-placeholder .cover-title')]
    .some(el => el.textContent.includes('Broken Cover')));
  assert.equal(placeholderShown, true, 'broken cover falls back to the placeholder');

  // Each navigation resets the page, so collect before leaving it.
  const violations = [...await page.evaluate(() => window.__cspViolations)];
  await page.goto(`${baseUrl}/privacy.html`, { waitUntil: 'load' });
  violations.push(...await page.evaluate(() => window.__cspViolations));
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'load' });
  await waitForAppReady(page, { testName });
  violations.push(...await page.evaluate(() => window.__cspViolations));

  assert.deepEqual(violations, [], 'no CSP violations');
  assert.deepEqual(errors, [], 'no page errors');
  console.log('CSP browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
