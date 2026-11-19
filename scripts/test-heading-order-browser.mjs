// Every route: exactly one visible h1, and headings never skip a level going
// down (h2 -> h4). Dialogs are checked as their own documents.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'heading-order-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

const ROUTES = ['dashboard', 'library', 'reading', 'wishlist', 'finished', 'favorites', 'stats', 'goals',
  'activity', 'recommendations', 'help', 'profile', 'settings'];

function audit() {
  const visible = el => {
    if (el.closest('[hidden], [aria-hidden="true"], .sr-only-hidden')) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getClientRects().length > 0 || el.closest('.sr-only');
  };
  const scopes = [document.body, ...document.querySelectorAll('[role="dialog"]:not([hidden])')];
  const problems = [];
  for (const scope of scopes) {
    const headings = [...scope.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .filter(h => visible(h) && (scope === document.body ? !h.closest('[role="dialog"]') : true));
    const levels = headings.map(h => Number(h.tagName[1]));
    const name = scope === document.body ? 'page' : `dialog#${scope.id}`;
    if (scope === document.body) {
      const h1s = levels.filter(l => l === 1).length;
      if (h1s !== 1) problems.push(`${name}: ${h1s} h1 elements`);
    }
    // Like axe heading-order: a page may open at h1 or h2 (the session page
    // puts the sign-in card, an h2, before the hero h1 to match the mobile
    // order), but a level is never skipped after that.
    let prev = scope === document.body ? 1 : Math.min(...levels, 6) - 1;
    headings.forEach((h, i) => {
      const level = levels[i];
      if (level > prev + 1) problems.push(`${name}: h${prev || '-'} then h${level} "${h.textContent.trim().slice(0, 40)}"`);
      prev = level;
    });
  }
  return problems;
}

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });

  const report = {};
  // Signed-out session page first.
  await page.evaluate(() => window.LibriqNavigation.goTo('session'));
  await page.waitForTimeout(400);
  report.session = await page.evaluate(audit);

  await page.evaluate(() => {
    window.LibriqE2E.seedAuth('heading-user', 'heading@example.test', 'Heading Reader');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    const year = new Date().getFullYear();
    window.LibriqE2E.addBook({ title: 'Reading Book', author: 'A', status: 'reading', pageCount: 300, currentPage: 40 });
    window.LibriqE2E.addBook({ title: 'Done Book', author: 'B', status: 'finished', pageCount: 200, currentPage: 200, dateFinished: new Date(year, 0, 5).toISOString(), rating: 4 });
  });
  for (const route of ROUTES) {
    await page.evaluate(name => window.LibriqNavigation.goTo(name), route);
    await page.waitForTimeout(350);
    report[route] = await page.evaluate(audit);
  }

  const failures = Object.entries(report).filter(([, problems]) => problems.length);
  assert.deepEqual(Object.fromEntries(failures), {}, 'heading problems by route');
  console.log(`Heading order browser test passed (${Object.keys(report).length} routes)`);
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
