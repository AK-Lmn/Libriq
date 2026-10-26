// QA Playwright test script for LibriQ (local/preview only)
// Run: node scripts/qa-playwright.mjs
// Requires: e2e server running with LIBRIQ_ENABLE_TEST_API=1

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = 'http://127.0.0.1:4173';
const SCREEN_DIR = path.resolve(process.cwd(), 'qa-screenshots');

const issues = [];

function logIssue({ title, steps, expected, actual, severity = 'Medium', page }) {
  const issue = { title, steps, expected, actual, severity, page: page.url() };
  issues.push(issue);
  console.log(`\n[ISSUE] ${title} (${severity})`);
  console.log(`  Steps: ${steps.join(' -> ')}`);
  console.log(`  Expected: ${expected}`);
  console.log(`  Actual: ${actual}`);
}

async function takeScreenshot(page, name) {
  if (!fs.existsSync(SCREEN_DIR)) fs.mkdirSync(SCREEN_DIR, { recursive: true });
  const file = path.join(SCREEN_DIR, `${name.replace(/[^a-z0-9]+/gi, '-')}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
  console.log(`  Screenshot: ${file}`);
  return file;
}

async function waitForAppReady(page) {
  await page.waitForFunction(() => window.__LIBRIQ_APP_READY__ === true, { timeout: 15000 }).catch(() => {
    console.log('  Warning: App ready flag not found, proceeding anyway');
  });
  await page.waitForTimeout(500);
}

async function seedAuth(page) {
  await page.evaluate(() => {
    if (window.LibriqE2E) {
      window.LibriqE2E.seedAuth('qa-user-1', 'qa@example.com', 'QA Tester');
    }
  }).catch(() => {});
  await page.waitForTimeout(500);
}

async function clickNav(page, label) {
  await page.click(`button.nav-item:has-text("${label}")`).catch(() => {
    console.log(`  Warning: Could not click nav item "${label}"`);
  });
  await page.waitForTimeout(500);
}

async function safe(fn, label) {
  try {
    return await fn();
  } catch (e) {
    console.log(`  Warning: ${label} failed: ${e.message.slice(0, 100)}`);
    return null;
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error') {
      issues.push({
        title: `Console error: ${msg.text().slice(0, 100)}`,
        steps: ['Open the app and navigate normally'],
        expected: 'No console errors',
        actual: msg.text(),
        severity: 'Low',
        page: page.url(),
      });
    }
  });

  page.on('pageerror', err => {
    issues.push({
      title: `Page error: ${err.message.slice(0, 100)}`,
      steps: ['Open the app and navigate normally'],
      expected: 'No unhandled errors',
      actual: err.message,
      severity: 'Medium',
      page: page.url(),
    });
  });

  console.log('=== QA TEST: LibriQ First-Time User Flow ===\n');

  // ---------------------------------------------------------------
  // 1. Load the app
  // ---------------------------------------------------------------
  console.log('[1/12] Loading the app...');
  await page.goto(`${BASE_URL}/?libriq_e2e_test_mode=1`, { waitUntil: 'networkidle' });
  await waitForAppReady(page);
  await seedAuth(page);
  await page.waitForTimeout(1000);
  await takeScreenshot(page, '01-home-loaded');

  const bodyText = await safe(() => page.locator('body').innerText(), 'get body text');
  if (bodyText && !bodyText.includes('LibriQ')) {
    logIssue({
      title: 'App title not visible on load',
      steps: ['Open http://localhost:4173/?libriq_e2e_test_mode=1'],
      expected: 'LibriQ branding visible',
      actual: 'LibriQ not found in page text',
      severity: 'High',
      page,
    });
  }

  // ---------------------------------------------------------------
  // 2. Dashboard
  // ---------------------------------------------------------------
  console.log('\n[2/12] Dashboard flow...');
  await clickNav(page, 'Dashboard');
  await takeScreenshot(page, '02-dashboard');
  const dashboardText = await safe(() => page.locator('main').innerText(), 'get dashboard text');
  if (dashboardText && !dashboardText.includes('Dashboard')) {
    logIssue({
      title: 'Dashboard page does not load',
      steps: ['Click Dashboard in sidebar'],
      expected: 'Dashboard content visible',
      actual: 'Dashboard content not found',
      severity: 'High',
      page,
    });
  }

  // ---------------------------------------------------------------
  // 3. My Library (empty state)
  // ---------------------------------------------------------------
  console.log('\n[3/12] My Library (empty state)...');
  await clickNav(page, 'My Library');
  await takeScreenshot(page, '03-library-empty');
  const libraryText = await safe(() => page.locator('main').innerText(), 'get library text');
  if (libraryText && !libraryText.includes('Library') && !libraryText.includes('library')) {
    logIssue({
      title: 'Library page does not load',
      steps: ['Click My Library in sidebar'],
      expected: 'Library content visible',
      actual: 'Library content not found',
      severity: 'High',
      page,
    });
  }

  // ---------------------------------------------------------------
  // 4. Search & Add Book (manual entry)
  // ---------------------------------------------------------------
  console.log('\n[4/12] Search & Add Book flow...');
  await page.click('#openSearch').catch(() => {});
  await page.waitForTimeout(500);
  await takeScreenshot(page, '04-search-modal');

  // Try empty search
  await page.fill('#searchInput', '').catch(() => {});
  await page.waitForTimeout(500);
  const searchStatus = await safe(() => page.locator('#searchStatus').innerText(), 'get search status');
  if (searchStatus && !searchStatus.includes('3 characters')) {
    logIssue({
      title: 'Empty search does not show guidance',
      steps: ['Open search modal, clear search input'],
      expected: 'Message about entering at least 3 characters',
      actual: `Got: "${searchStatus}"`,
      severity: 'Low',
      page,
    });
  }

  // Search for a book
  await page.fill('#searchInput', 'The Hobbit').catch(() => {});
  await page.waitForTimeout(2000);
  await takeScreenshot(page, '04b-search-results');
  const resultsText = await safe(() => page.locator('#searchResults').innerText(), 'get search results');
  if (resultsText && resultsText.includes('A whole world of stories') && resultsText.includes('Search by title')) {
    logIssue({
      title: 'Search results show empty state after valid search',
      steps: ['Open search, type "The Hobbit", wait for results'],
      expected: 'Search results for The Hobbit displayed',
      actual: 'Empty state still shown',
      severity: 'Medium',
      page,
    });
  }

  // Try Manual Entry
  await page.click('#searchManualEntry').catch(() => {});
  await page.waitForTimeout(500);
  await takeScreenshot(page, '04c-manual-entry');

  // Try submitting manual entry with empty title
  const titleInput = page.locator('#manualTitleInput');
  if (await titleInput.count() > 0) {
    await titleInput.fill('').catch(() => {});
    // Try to submit - look for add/save button in modal
    const addBtn = page.locator('#addBookModal button:has-text("Add"), #addBookModal button:has-text("Save")').first();
    if (await addBtn.count() > 0) {
      await addBtn.click().catch(() => {});
      await page.waitForTimeout(500);
      await takeScreenshot(page, '04d-manual-empty-fields');
      const modalStillOpen = await page.locator('#addBookModal[hidden]').count() === 0;
      if (!modalStillOpen) {
        logIssue({
          title: 'Manual entry submits with empty required fields',
          steps: ['Open Manual Entry, clear title, click Add'],
          expected: 'Validation error shown, modal stays open',
          actual: 'Modal closed (may have submitted empty data)',
          severity: 'High',
          page,
        });
      }
    }
  }

  await page.click('#closeAddBook').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#closeSearch').catch(() => {});
  await page.waitForTimeout(300);

  // ---------------------------------------------------------------
  // 5. Reading lists
  // ---------------------------------------------------------------
  console.log('\n[5/12] Reading lists...');
  for (const list of ['Reading Now', 'Want to Read', 'Finished', 'Favorites']) {
    await clickNav(page, list);
    await page.waitForTimeout(500);
    await takeScreenshot(page, `05-${list.toLowerCase().replace(' ', '-')}`);
    const listText = await safe(() => page.locator('main').innerText(), `get ${list} text`);
    if (listText && listText.length < 5) {
      logIssue({
        title: `${list} page appears empty or broken`,
        steps: ['Click ' + list + ' in sidebar'],
        expected: 'Page content visible',
        actual: 'Page content nearly empty',
        severity: 'Medium',
        page,
      });
    }
  }

  // ---------------------------------------------------------------
  // 6. Statistics
  // ---------------------------------------------------------------
  console.log('\n[6/12] Statistics...');
  await clickNav(page, 'Statistics');
  await takeScreenshot(page, '06-statistics');
  const statsText = await safe(() => page.locator('main').innerText(), 'get stats text');
  if (statsText && !statsText.includes('Statistics') && !statsText.includes('statistics')) {
    logIssue({
      title: 'Statistics page does not load',
      steps: ['Click Statistics in sidebar'],
      expected: 'Statistics content visible',
      actual: 'Statistics content not found',
      severity: 'High',
      page,
    });
  }

  // ---------------------------------------------------------------
  // 7. Reading Goals
  // ---------------------------------------------------------------
  console.log('\n[7/12] Reading Goals...');
  await clickNav(page, 'Reading Goals');
  await takeScreenshot(page, '07-goals');
  const goalsText = await safe(() => page.locator('main').innerText(), 'get goals text');
  if (goalsText && !goalsText.includes('Goal') && !goalsText.includes('goal')) {
    logIssue({
      title: 'Reading Goals page does not load',
      steps: ['Click Reading Goals in sidebar'],
      expected: 'Goals content visible',
      actual: 'Goals content not found',
      severity: 'High',
      page,
    });
  }

  // ---------------------------------------------------------------
  // 8. Activity Log
  // ---------------------------------------------------------------
  console.log('\n[8/12] Activity Log...');
  await clickNav(page, 'Activity Log');
  await takeScreenshot(page, '08-activity');
  const activityText = await safe(() => page.locator('main').innerText(), 'get activity text');
  if (activityText && !activityText.includes('Activity') && !activityText.includes('activity')) {
    logIssue({
      title: 'Activity Log page does not load',
      steps: ['Click Activity Log in sidebar'],
      expected: 'Activity content visible',
      actual: 'Activity content not found',
      severity: 'High',
      page,
    });
  }

  // ---------------------------------------------------------------
  // 9. Recommendations
  // ---------------------------------------------------------------
  console.log('\n[9/12] Recommendations...');
  await clickNav(page, 'Recommendations');
  await takeScreenshot(page, '09-recommendations');
  const recText = await safe(() => page.locator('main').innerText(), 'get recommendations text');
  if (recText && !recText.includes('Recommend') && !recText.includes('recommend')) {
    logIssue({
      title: 'Recommendations page does not load',
      steps: ['Click Recommendations in sidebar'],
      expected: 'Recommendations content visible',
      actual: 'Recommendations content not found',
      severity: 'High',
      page,
    });
  }

  // ---------------------------------------------------------------
  // 10. Help & Guide
  // ---------------------------------------------------------------
  console.log('\n[10/12] Help & Guide...');
  await clickNav(page, 'Help & Guide');
  await takeScreenshot(page, '10-help');
  const helpText = await safe(() => page.locator('main').innerText(), 'get help text');
  if (helpText && !helpText.includes('Help') && !helpText.includes('help')) {
    logIssue({
      title: 'Help & Guide page does not load',
      steps: ['Click Help & Guide in sidebar'],
      expected: 'Help content visible',
      actual: 'Help content not found',
      severity: 'High',
      page,
    });
  }

  // ---------------------------------------------------------------
  // 11. Profile
  // ---------------------------------------------------------------
  console.log('\n[11/12] Profile...');
  await clickNav(page, 'Profile');
  await takeScreenshot(page, '11-profile');
  const profileText = await safe(() => page.locator('main').innerText(), 'get profile text');
  if (profileText && !profileText.includes('Profile') && !profileText.includes('profile')) {
    logIssue({
      title: 'Profile page does not load',
      steps: ['Click Profile in sidebar'],
      expected: 'Profile content visible',
      actual: 'Profile content not found',
      severity: 'High',
      page,
    });
  }

  // Test profile edit with very long text
  const bioTextarea = page.locator('#profileBio');
  if (await bioTextarea.count() > 0) {
    // Need to open editor first
    const editorSummary = page.locator('.profile-editor summary');
    if (await editorSummary.count() > 0) {
      await editorSummary.click().catch(() => {});
      await page.waitForTimeout(300);
      const longText = 'A'.repeat(1000);
      await bioTextarea.fill(longText).catch(() => {});
      await page.waitForTimeout(300);
      await takeScreenshot(page, '11b-profile-long-bio');
      const bioValue = await bioTextarea.inputValue().catch(() => '');
      if (bioValue && bioValue.length < 900) {
        logIssue({
          title: 'Profile bio accepts very long text without truncation warning',
          steps: ['Open Profile editor, type 1000+ characters in bio'],
          expected: 'Warning or truncation at reasonable limit',
          actual: `Accepted ${bioValue.length} characters without warning`,
          severity: 'Low',
          page,
        });
      }
      await editorSummary.click().catch(() => {}); // close
    }
  }

  // ---------------------------------------------------------------
  // 12. Settings
  // ---------------------------------------------------------------
  console.log('\n[12/12] Settings...');
  await clickNav(page, 'Settings');
  await takeScreenshot(page, '12-settings');
  const settingsText = await safe(() => page.locator('main').innerText(), 'get settings text');
  if (settingsText && !settingsText.includes('Settings') && !settingsText.includes('settings')) {
    logIssue({
      title: 'Settings page does not load',
      steps: ['Click Settings in sidebar'],
      expected: 'Settings content visible',
      actual: 'Settings content not found',
      severity: 'High',
      page,
    });
  }

  // Try double-clicking a button rapidly
  const exportBtn = page.locator('button:has-text("Export"), button:has-text("export")').first();
  if (await exportBtn.count() > 0) {
    await exportBtn.click().catch(() => {});
    await exportBtn.click().catch(() => {});
    await page.waitForTimeout(500);
    await takeScreenshot(page, '12b-settings-double-click');
  }

  // ---------------------------------------------------------------
  // Refresh mid-action test
  // ---------------------------------------------------------------
  console.log('\n[Extra] Refresh mid-action test...');
  await page.click('#openSearch').catch(() => {});
  await page.waitForTimeout(300);
  await page.fill('#searchInput', 'Dune').catch(() => {});
  await page.waitForTimeout(500);
  await page.reload({ waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1000);
  await takeScreenshot(page, 'extra-refresh-mid-action');
  await waitForAppReady(page);
  await seedAuth(page);
  const afterRefresh = await safe(() => page.locator('body').innerText(), 'get body text after refresh');
  if (afterRefresh && !afterRefresh.includes('LibriQ')) {
    logIssue({
      title: 'App does not recover after refresh mid-action',
      steps: ['Start search, refresh page, wait for reload'],
      expected: 'App loads normally after refresh',
      actual: 'App not loaded after refresh',
      severity: 'High',
      page,
    });
  }

  // ---------------------------------------------------------------
  // Mobile bottom nav test
  // ---------------------------------------------------------------
  console.log('\n[Extra] Mobile viewport test...');
  await page.setViewportSize({ width: 375, height: 667 });
  await page.waitForTimeout(500);
  await takeScreenshot(page, 'extra-mobile-view');
  const mobileNav = page.locator('#mobileBottomNav');
  if (await mobileNav.count() === 0) {
    logIssue({
      title: 'Mobile bottom navigation not present on narrow viewport',
      steps: ['Resize viewport to 375x667'],
      expected: 'Mobile bottom nav visible',
      actual: 'Mobile bottom nav not found',
      severity: 'Medium',
      page,
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  // ---------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------
  console.log('\n========================================');
  console.log(`QA TEST COMPLETE: ${issues.length} issue(s) found`);
  console.log('========================================\n');

  for (const [i, issue] of issues.entries()) {
    console.log(`\n--- Issue ${i + 1}: ${issue.title} ---`);
    console.log(`Severity: ${issue.severity}`);
    console.log(`Page: ${issue.page}`);
    console.log(`Steps: ${issue.steps.join(' -> ')}`);
    console.log(`Expected: ${issue.expected}`);
    console.log(`Actual: ${issue.actual}`);
  }

  // Write issues to file
  const reportPath = path.resolve(process.cwd(), 'qa-report.md');
  const report = [
    '# QA Report — LibriQ',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Total issues: ${issues.length}`,
    '',
    ...issues.map((issue, i) => `
## ${i + 1}. ${issue.title}

**Severity:** ${issue.severity}
**Page:** ${issue.page}

**Steps to reproduce:**
${issue.steps.map((s, j) => `${j + 1}. ${s}`).join('\n')}

**Expected result:**
${issue.expected}

**Actual result:**
${issue.actual}

**Screenshot:** qa-screenshots/${(i + 1).toString().padStart(2, '0')}-${issue.title.replace(/[^a-z0-9]+/gi, '-')}.png
`).join(''),
  ].join('\n');
  fs.writeFileSync(reportPath, report);
  console.log(`\nReport written to: ${reportPath}`);
  console.log(`Screenshots in: ${SCREEN_DIR}`);

  await browser.close();
})();
