// css/icons.css keeps only the Phosphor icons the app names. Every icon the
// app actually renders must still have a glyph: walk the main pages, the
// search dialog and book details, and check each visible .ph element.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'icons-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

const missingGlyphs = () => [...document.querySelectorAll('.ph')]
  .filter(el => el.getClientRects().length)
  .filter(el => {
    const before = getComputedStyle(el, '::before');
    const self = getComputedStyle(el);
    // The session screens swap the font glyph for an SVG mask (--session-icon).
    const drawnAsImage = [self.maskImage, self.webkitMaskImage].some(v => v && v !== 'none');
    const content = before.content;
    return !drawnAsImage && (!content || content === 'none' || content === 'normal' || content === '""');
  })
  .map(el => el.className);

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // Signed out: boot and sign-in screens.
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  assert.deepEqual(await page.evaluate(missingGlyphs), [], 'boot screen');
  await page.waitForFunction(() => window.LibriqNavigation && !document.querySelector('.session-page--boot'), null, { timeout: 30000 });
  assert.deepEqual(await page.evaluate(missingGlyphs), [], 'sign-in page');

  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });
  const bookId = await page.evaluate(() => {
    window.LibriqE2E.seedAuth('icons', 'icons@example.test', 'Icons');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    return window.LibriqE2E.addBook({ title: 'Icon Book', author: 'Someone', status: 'reading', pageCount: 200, currentPage: 20 }).id;
  });
  const seen = {};
  for (const route of ['dashboard', 'library', 'reading', 'stats', 'goals', 'activity', 'quotes', 'recommendations', 'help', 'profile', 'settings']) {
    await page.evaluate(r => window.LibriqNavigation.goTo(r), route);
    await page.waitForTimeout(150);
    seen[route] = await page.evaluate(missingGlyphs);
  }
  await page.evaluate(() => window.Search.open());
  await page.locator('#searchInput').fill('x');
  await page.waitForTimeout(300);
  seen.search = await page.evaluate(missingGlyphs);
  await page.keyboard.press('Escape');
  await page.evaluate(id => window.Library.showDetailsModal(id), bookId);
  await page.locator('#bookDetailsModal').waitFor({ state: 'visible' });
  seen.details = await page.evaluate(missingGlyphs);
  for (const [where, missing] of Object.entries(seen)) assert.deepEqual(missing, [], `${where}: icons without a glyph`);
  assert.deepEqual(errors, []);
  console.log(`Icons browser test passed (${Object.keys(seen).length + 2} screens)`);
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
