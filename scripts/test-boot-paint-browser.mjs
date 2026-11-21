// The boot screen in index.html is the first thing a visitor sees. The app
// must keep that node while it starts: rebuilding an identical copy counts as
// a new paint, which pushed LCP from 1.4s to 3.7s on mobile and shifted the
// layout. The title should be inserted once, by the HTML parser.
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
  await page.addInitScript(() => {
    window.__bootTitleInserts = 0;
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
  });
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  // Signed out, the app replaces the boot screen with the sign-in page.
  await page.waitForFunction(() => window.LibriqNavigation && !document.querySelector('.session-page--boot'), null, { timeout: 30000 });
  const inserts = await page.evaluate(() => window.__bootTitleInserts);
  assert.equal(inserts, 1, `boot title inserted ${inserts} times; the app rebuilt the boot screen`);
  assert.equal(await page.locator('.seo-intro').count(), 0, 'static crawler copy is removed once the app runs');
  assert.deepEqual(errors, []);
  console.log('Boot paint browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
