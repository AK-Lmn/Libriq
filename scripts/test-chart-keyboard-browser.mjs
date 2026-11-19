// Monthly bar charts: one tab stop each, arrow keys move between bars, and
// the focused bar shows its value tooltip.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'chart-keyboard-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });

  await page.evaluate(() => {
    window.LibriqE2E.seedAuth('chart-user', 'chart@example.test', 'Chart Reader');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    const year = new Date().getFullYear();
    for (let m = 0; m < 3; m++) {
      const date = new Date(year, m, 10).toISOString();
      window.LibriqE2E.addBook({ title: `Finished ${m}`, author: 'A', status: 'finished', pageCount: 200 + m * 50, currentPage: 200 + m * 50, dateFinished: date, dateStarted: date });
    }
    window.LibriqNavigation.goTo('stats');
  });
  const chart = page.locator('.monthly-chart').first();
  await chart.waitFor();

  const info = await chart.evaluate(el => ({
    role: el.getAttribute('role'),
    label: el.getAttribute('aria-label'),
    hidden: el.getAttribute('aria-hidden'),
    stops: el.querySelectorAll('[role="img"][tabindex="0"]').length,
    bars: el.querySelectorAll('[role="img"]').length,
    unnamed: [...el.querySelectorAll('[role="img"]')].filter(b => !b.getAttribute('aria-label')).length,
  }));
  assert.equal(info.role, 'group');
  assert.match(info.label, /per month/);
  assert.equal(info.hidden, null);
  assert.equal(info.bars, 12);
  assert.equal(info.stops, 1, 'one tab stop per chart');
  assert.equal(info.unnamed, 0);

  // Focus the chart's tab stop, then walk with the keyboard.
  await chart.locator('[role="img"][tabindex="0"]').focus();
  await page.keyboard.press('Home');
  const focused = () => page.evaluate(() => ({
    label: document.activeElement?.getAttribute('aria-label'),
    stops: document.activeElement?.closest('.monthly-chart')?.querySelectorAll('[tabindex="0"]').length,
  }));
  let state = await focused();
  assert.match(state.label, /in Jan$/);
  assert.equal(state.stops, 1);
  await page.keyboard.press('ArrowRight');
  assert.match((await focused()).label, /in Feb$/);
  await page.keyboard.press('End');
  assert.match((await focused()).label, /in Dec$/);
  await page.keyboard.press('ArrowLeft');
  state = await focused();
  assert.match(state.label, /in Nov$/);
  assert.equal(state.stops, 1, 'roving tabindex follows focus');

  // The value tooltip is visible on keyboard focus, not only on hover.
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  const tooltip = await page.evaluate(() => {
    const el = document.activeElement;
    const after = getComputedStyle(el, '::after');
    return { opacity: after.opacity, content: after.content };
  });
  assert.equal(tooltip.opacity, '1');
  assert.match(tooltip.content, /in Jan/);

  await page.screenshot({ path: 'artifacts/chart-keyboard/stats-focus.png', clip: await chart.boundingBox().then(b => ({ x: b.x - 10, y: b.y - 50, width: b.width + 20, height: b.height + 60 })) }).catch(() => {});

  // Tab leaves the chart in one step.
  await page.evaluate(() => { window.__chart = document.activeElement.closest('.monthly-chart'); });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => window.__chart.contains(document.activeElement)), false, 'one Tab leaves this chart');
  assert.deepEqual(errors, []);
  console.log('Chart keyboard browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
