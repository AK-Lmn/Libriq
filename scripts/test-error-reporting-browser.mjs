// An uncaught error and an unhandled rejection in the running app each send
// one scrubbed report to /api/client-error. Runs on both the source modules
// and the bundle. Reporting is off on 127.0.0.1 unless forced, as here.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'error-reporting-browser';
const server = startE2EServer({ testName });

let browser;
try {
  const baseUrl = await waitForServer(server, { testName });
  browser = await chromium.launch({ headless: true });
  for (const variant of ['sources', 'bundle']) {
    const page = await browser.newPage();
    const reports = [];
    await page.route('**/api/client-error', async route => {
      reports.push(JSON.parse(route.request().postData() || 'null'));
      await route.fulfill({ status: 204 });
    });
    const query = `libriq_error_reports=1${variant === 'bundle' ? '&libriq_bundle=1' : ''}`;
    await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.LibriqNavigation), null, { timeout: 30000 });

    await page.evaluate(() => {
      // The same error thrown twice from the same place is reported once.
      const fail = () => { throw new Error('Report me, reader@example.com saw https://www.libriq.app/?uid=123'); };
      setTimeout(fail, 0);
      setTimeout(fail, 0);
      Promise.reject(new Error('Rejected sync step'));
    });
    await page.waitForTimeout(800);

    const kinds = reports.map(report => report?.kind).sort();
    assert.deepEqual(kinds, ['error', 'unhandledrejection'], `${variant}: one report each (duplicate error sent once)`);
    const error = reports.find(report => report.kind === 'error');
    assert.equal(error.message, 'Report me, [email] saw https://www.libriq.app/', `${variant}: email and query string scrubbed`);
    assert.equal(error.page, '/', `${variant}: page sent as a path`);
    assert.match(error.release, /^\d+\.\d+\.\d+$/, `${variant}: app version attached`);
    assert.equal(reports.find(report => report.kind === 'unhandledrejection').message, 'Rejected sync step');
    await page.close();
  }

  // Without the flag, 127.0.0.1 sends nothing.
  const quiet = await browser.newPage();
  let sent = 0;
  await quiet.route('**/api/client-error', route => { sent += 1; return route.fulfill({ status: 204 }); });
  await quiet.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
  await quiet.waitForFunction(() => Boolean(window.LibriqNavigation), null, { timeout: 30000 });
  await quiet.evaluate(() => { setTimeout(() => { throw new Error('local only'); }, 0); });
  await quiet.waitForTimeout(500);
  assert.equal(sent, 0, 'no reports from a local host');
  console.log('Error reporting browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
