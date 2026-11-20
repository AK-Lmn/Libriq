// Each dashboard number has one home: the yearly goal in the Reading Goal
// panel, the streak in Reading Momentum, and no Quick Workspace panel
// repeating the activity list.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'dashboard-metrics-browser';
const port = 4175;
const baseUrl = `http://127.0.0.1:${port}`;
const server = startE2EServer({ port, testName });

let browser;
try {
  await waitForServer(baseUrl, { testName });
  browser = await chromium.launch({ headless: true });
  for (const [theme, width, height] of [['dark', 1280, 900], ['light', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
    await waitForAppReady(page, { testName });
    await page.evaluate(t => {
      window.LibriqE2E.seedAuth('metrics', 'metrics@example.test', 'Metrics');
      window.LibriqE2E.enableAccountMode();
      window.LibriqSyncBeta.setEnabled(false);
      document.documentElement.dataset.theme = t;
      window.LibriqStorage.saveGoals({ ...window.LibriqStorage.getGoals(), yearly: 12 });
      window.LibriqE2E.addBook({ title: 'Metric Book', author: 'Someone', status: 'reading', pageCount: 300, currentPage: 90 });
      window.LibriqNavigation.goTo('dashboard');
    }, theme);
    await page.waitForSelector('#dashboardPage .dashboard-goal-panel');
    const m = await page.evaluate(() => {
      const root = document.getElementById('dashboardPage');
      const text = root.innerText;
      const card = root.querySelector('.dashboard-compact-card');
      return {
        goalShown: (text.match(/\b0\s*\/\s*12\b/g) || []).length,
        streakLabels: (text.match(/day streak/gi) || []).length,
        quickWorkspace: /Quick Workspace/i.test(text),
        avgRating: /avg rating|average rating/i.test(text),
        cardBg: getComputedStyle(card).backgroundColor,
      };
    });
    assert.equal(m.goalShown, 1, `${theme}: the yearly goal appears once`);
    assert.equal(m.streakLabels, 1, `${theme}: the streak appears once`);
    assert.equal(m.quickWorkspace, false, `${theme}: no Quick Workspace panel`);
    assert.equal(m.avgRating, false, `${theme}: average rating lives on Statistics`);
    assert.match(m.cardBg, /rgba\(0, 0, 0, 0\)|transparent/, `${theme}: momentum stats are not cards inside the panel`);
    await page.screenshot({ path: `artifacts/ux/dashboard-${theme}-${width}.png`, fullPage: true });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log('Dashboard metrics browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
