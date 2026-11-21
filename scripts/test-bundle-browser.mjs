// Deployed builds run js/app.bundle.js, while every other browser test runs
// the source modules. This test runs the bundle (?libriq_bundle=1): signed
// out it must reach the sign-in page, and signed in it must render the main
// pages, all without loading a single source module.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'bundle-browser';
let baseUrl;
const server = startE2EServer({ testName });

function track(page) {
  const scripts = [];
  const errors = [];
  page.on('request', req => { if (req.resourceType() === 'script') scripts.push(new URL(req.url()).pathname); });
  page.on('pageerror', e => errors.push(e.message));
  return { scripts, errors };
}

let browser;
try {
  baseUrl = await waitForServer(server, { testName });
  browser = await chromium.launch({ headless: true });

  // Signed out: boot.js picks the bundle and the app reaches sign-in.
  const page = await browser.newPage({ viewport: { width: 412, height: 823 } });
  const out = track(page);
  await page.goto(`${baseUrl}/?libriq_bundle=1`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.LibriqNavigation && !document.querySelector('.session-page--boot'), null, { timeout: 30000 });
  const appScripts = out.scripts.filter(p => p.startsWith('/js/') && !/^\/js\/(config|config\.local|localConfigLoader|shell-hint)\.js$/.test(p));
  assert.deepEqual(appScripts, ['/js/boot.js', '/js/app.bundle.js'], 'only the loader and the bundle load');
  assert.deepEqual(out.errors, []);
  await page.close();

  // Signed in (test hooks are part of the bundle too): main pages render.
  const app = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const inn = track(app);
  await app.goto(`${baseUrl}/?libriq_bundle=1&libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(app, { testName });
  await app.evaluate(() => {
    window.LibriqE2E.seedAuth('bundle', 'bundle@example.test', 'Bundle');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    window.LibriqE2E.addBook({ title: 'Bundled Book', author: 'Someone', status: 'reading', pageCount: 100, currentPage: 10 });
  });
  for (const route of ['dashboard', 'library', 'stats', 'goals', 'quotes', 'settings']) {
    await app.evaluate(r => window.LibriqNavigation.goTo(r), route);
    await app.waitForFunction(() => document.querySelectorAll('#mainContent h1').length === 1, null, { timeout: 10000 });
  }
  assert.ok(!inn.scripts.some(p => p === '/js/appModules.js' || p === '/js/app.js'), 'no source modules loaded');
  assert.deepEqual(inn.errors, []);
  console.log('Bundle browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
