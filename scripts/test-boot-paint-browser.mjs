// The boot screen in index.html is the first thing a visitor sees. Two things
// used to repaint it when the app started, which moved LCP from first paint
// (1.4s) to app start (3.7s) on mobile and caused a 0.07 layout shift:
// - renderBootPage() replaced it with an identical copy (a new paint), and
// - the app added body.session-choice-active, which the static page lacked.
// The app must keep the parsed boot node and must not move it.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'boot-paint-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 412, height: 823 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Mobile-like throttling so the page paints before the app starts, as it
  // does on phones. Without it the app runs before first paint and hides
  // the problem.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Hold Firebase so the app stays on the boot screen after it starts.
  await page.route('**/vendor/firebase-*.js', () => {});
  await page.addInitScript(() => {
    window.__bootTitleInserts = 0;
    window.__shift = 0;
    const seen = new WeakSet();
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          const title = node.id === 'sessionBootTitle' ? node : node.querySelector?.('#sessionBootTitle');
          if (title && !seen.has(title)) { seen.add(title); window.__bootTitleInserts += 1; }
        }
      }
    }).observe(document, { childList: true, subtree: true });
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__shift += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  // The app has started once it has removed the crawler-only copy.
  await page.waitForFunction(() => window.LibriqNavigation && !document.querySelector('.seo-intro'), null, { timeout: 90000 });
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => ({ inserts: window.__bootTitleInserts, shift: window.__shift, booting: Boolean(document.querySelector('.session-page--boot')) }));
  assert.equal(result.booting, true, 'still on the boot screen');
  assert.equal(result.inserts, 1, `boot title inserted ${result.inserts} times; the app rebuilt the boot screen`);
  assert.ok(result.shift < 0.01, `boot screen moved when the app started (CLS ${result.shift.toFixed(3)})`);
  assert.deepEqual(errors, []);
  console.log('Boot paint browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
