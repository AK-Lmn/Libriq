// A returning visitor goes from the boot screen straight to the dashboard.
// The boot screen used to be full-screen, so the sidebar (desktop) or top bar
// (mobile) appeared with the dashboard and pushed the page: CLS 0.19 desktop,
// 0.07 mobile. js/shell-hint.js now boots them inside the app chrome.
// A first-time visitor still gets the full-screen boot screen.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'dashboard-cls-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

async function throttle(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

const recordShifts = () => {
  window.__cls = 0;
  new PerformanceObserver(list => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
};

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  for (const [width, height] of [[412, 823], [1280, 800]]) {
    const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 500 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    // A first visit boots full-screen, with no app chrome.
    await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => document.body.classList.contains('app-booting')), false, `${width}: first visit boots full-screen`);
    await page.waitForFunction(() => window.LibriqE2E && window.LibriqNavigation, null, { timeout: 30000 });
    await page.evaluate(() => {
      window.LibriqE2E.seedAuth('cls', 'cls@example.test', 'Cls Reader');
      window.LibriqE2E.enableAccountMode();
      localStorage.setItem('libriq_sync_beta_enabled', '0');
      for (let i = 0; i < 6; i++) window.LibriqE2E.addBook({ title: `Book ${i}`, author: 'A', status: i < 2 ? 'reading' : 'finished', pageCount: 300, currentPage: 120, rating: 4 });
    });

    // Coming back: boot inside the chrome, then the dashboard, without shifts.
    await throttle(context, page);
    await page.addInitScript(recordShifts);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => document.body.classList.contains('app-booting')), true, `${width}: returning visit boots in the app chrome`);
    await page.waitForSelector('#dashboardPage', { timeout: 90000 });
    await page.waitForTimeout(2000);
    const result = await page.evaluate(() => ({ cls: window.__cls, booting: document.body.classList.contains('app-booting') }));
    assert.equal(result.booting, false, `${width}: app-booting is cleared after boot`);
    assert.ok(result.cls < 0.05, `${width}: dashboard load CLS ${result.cls.toFixed(3)}`);
    assert.deepEqual(errors, []);
    console.log(`${width}px: CLS ${result.cls.toFixed(3)}`);
    await context.close();
  }
  console.log('Dashboard CLS browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
