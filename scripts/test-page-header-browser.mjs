// Every app page opens with the same header: one serif title at the same
// size, an optional subtitle in the same style, and no label above it.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'page-header-browser';
let baseUrl;
const server = startE2EServer({ testName });
const ROUTES = ['library', 'reading', 'stats', 'activity', 'goals', 'quotes', 'settings', 'profile', 'help'];

let browser;
try {
  baseUrl = await waitForServer(server, { testName });
  browser = await chromium.launch({ headless: true });
  for (const [theme, width, height] of [['dark', 1280, 800], ['light', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page, { testName });
    await page.evaluate(t => {
      window.LibriqE2E.seedAuth('header', 'header@example.test', 'Header');
      window.LibriqE2E.enableAccountMode();
      window.LibriqSyncBeta.setEnabled(false);
      document.documentElement.dataset.theme = t;
      window.LibriqE2E.addBook({ title: 'Header Book', author: 'Someone', status: 'reading', pageCount: 200, currentPage: 20 });
    }, theme);
    const seen = {};
    for (const route of ROUTES) {
      await page.evaluate(r => window.LibriqNavigation.goTo(r), route);
      await page.waitForFunction(() => document.querySelector('#mainContent h1, main h1'));
      const h = await page.evaluate(() => {
        const h1s = [...document.querySelectorAll('main h1, #mainContent h1')].filter(el => el.getClientRects().length);
        const title = h1s[0];
        const header = title.closest('.page-header, .help-introduction');
        const sub = header?.querySelector('.page-subtitle');
        const before = title.previousElementSibling;
        return {
          count: h1s.length,
          size: getComputedStyle(title).fontSize,
          family: getComputedStyle(title).fontFamily.split(',')[0],
          subSize: sub ? getComputedStyle(sub).fontSize : null,
          eyebrows: header ? [...header.querySelectorAll('[class*="eyebrow"]')].filter(el => el.getClientRects().length).length : -1,
          labelAbove: before ? before.textContent.trim() : '',
        };
      });
      assert.equal(h.count, 1, `${theme} ${route}: one visible h1`);
      assert.equal(h.eyebrows, 0, `${theme} ${route}: no eyebrow label`);
      assert.equal(h.labelAbove, '', `${theme} ${route}: nothing above the title`);
      seen[route] = h;
    }
    const sizes = new Set(Object.values(seen).map(h => `${h.size} ${h.family}`));
    assert.equal(sizes.size, 1, `${theme}: one title style across pages ${JSON.stringify(seen)}`);
    const subs = new Set(Object.values(seen).map(h => h.subSize).filter(Boolean));
    assert.equal(subs.size, 1, `${theme}: one subtitle size across pages`);
    for (const route of ['library', 'stats', 'settings']) {
      await page.evaluate(r => window.LibriqNavigation.goTo(r), route);
      await page.screenshot({ path: `artifacts/ux/header-${route}-${theme}-${width}.png` });
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Page header browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
