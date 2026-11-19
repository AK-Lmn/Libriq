// Search polish: one focus ring (on the field wrapper, not nested inside it),
// a 2-character minimum so short titles like "It" work, and no keyboard
// hints on touch devices.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'search-polish-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

async function openSearch(page, theme = 'dark') {
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });
  await page.evaluate(async t => {
    window.LibriqE2E.seedAuth('polish', 'polish@example.test', 'Polish');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    document.documentElement.dataset.theme = t;
    const { BookAPI } = await import('./js/api/index.js');
    window.__queries = [];
    BookAPI.searchBooks = async q => { window.__queries.push(q); return [{ id: 'it-1', title: 'It', author: 'Stephen King', source: 'openlibrary' }]; };
    window.LibriqNavigation.goTo('dashboard');
    window.Search.open();
  }, theme);
}

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });

  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await openSearch(page, theme);
    assert.match(await page.locator('#searchStatus').textContent(), /at least 2 characters/);

    await page.locator('#searchInput').focus();
    await page.keyboard.type('It');
    await page.waitForFunction(() => document.querySelectorAll('#searchResultsList [role="option"]').length === 1);
    assert.deepEqual(await page.evaluate(() => window.__queries), ['It'], `${theme}: a 2-character query searches`);

    const rings = await page.evaluate(() => {
      const input = document.getElementById('searchInput');
      const wrap = input.closest('.search-input-wrap');
      const i = getComputedStyle(input), w = getComputedStyle(wrap);
      return { inputOutline: i.outlineStyle, inputShadow: i.boxShadow, wrapShadow: w.boxShadow, wrapBorder: w.borderTopColor };
    });
    assert.equal(rings.inputOutline, 'none', `${theme}: no ring on the inner input`);
    assert.equal(rings.inputShadow, 'none', `${theme}: no glow on the inner input`);
    assert.notEqual(rings.wrapShadow, 'none', `${theme}: the field wrapper carries the one ring`);
    assert.deepEqual(errors, []);
    await page.close();
  }

  // One character still asks for more instead of searching.
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openSearch(page);
  await page.locator('#searchInput').fill('I');
  await page.waitForTimeout(500);
  assert.deepEqual(await page.evaluate(() => window.__queries), []);
  await page.close();

  // Touch devices: no keyboard shortcut hints in the footer.
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const phone = await touch.newPage();
  await openSearch(phone);
  const hints = await phone.evaluate(() => [...document.querySelectorAll('#searchModal .search-footer kbd')]
    .filter(k => k.getClientRects().length > 0).length);
  assert.equal(hints, 0, 'keyboard hints hidden on touch');
  await touch.close();

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await openSearch(desktop);
  const desktopHints = await desktop.evaluate(() => [...document.querySelectorAll('#searchModal .search-footer kbd')]
    .filter(k => k.getClientRects().length > 0).length);
  assert.ok(desktopHints > 0, 'keyboard hints still shown with a mouse');
  await desktop.close();

  console.log('Search polish browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
