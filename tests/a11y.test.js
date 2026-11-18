import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('icon fonts in the app shell are hidden from screen readers', async () => {
  const html = await read('frontend/index.html');
  const icons = html.match(/<i class="ph[^"]*"[^>]*>/g) || [];
  assert.ok(icons.length > 0);
  const exposed = icons.filter(tag => !/aria-hidden="true"/.test(tag));
  assert.deepEqual(exposed, []);
});

test('theme toggle has a stable name that matches its visible text', async () => {
  const html = await read('frontend/index.html');
  const button = html.match(/<button[^>]*id="themeToggle"[^>]*>/)[0];
  assert.doesNotMatch(button, /aria-label=/, 'visible text names the button');
  assert.match(button, /aria-pressed="(true|false)"/);
  const nav = await read('frontend/js/navigation.js');
  assert.doesNotMatch(nav, /'Light mode'/, 'label no longer flips between Dark mode and Light mode');
});

test('change-email input has an accessible name', async () => {
  const source = await read('frontend/js/features/settings/settingsPage.js');
  assert.match(source, /id="changeEmailInput"[^>]*aria-label="New email address"/);
});

test('bar chart values are available as a screen-reader table', async () => {
  const { chartDataTable } = await import('../frontend/js/shared/chartTable.js');
  const months = ['Jan', 'Feb', 'Mar'];
  const html = chartDataTable({ caption: 'Books finished per month, 2026', valueHeader: 'Books', months, values: [2, 0, 5] });
  assert.match(html, /^<table class="sr-only">/);
  assert.match(html, /<caption>Books finished per month, 2026<\/caption>/);
  assert.match(html, /<th scope="col">Month<\/th><th scope="col">Books<\/th>/);
  assert.equal((html.match(/<th scope="row">/g) || []).length, 3);
  assert.match(html, /<th scope="row">Mar<\/th><td>5<\/td>/);
  const formatted = chartDataTable({ caption: 'c', valueHeader: 'Pages', months: ['Jan'], values: [1234], format: n => n.toLocaleString('en-US') });
  assert.match(formatted, /<td>1,234<\/td>/);
  const hostile = chartDataTable({ caption: '<b>x</b>', valueHeader: 'v', months: ['<i>'], values: [1] });
  assert.doesNotMatch(hostile, /<b>|<i>/, 'caption and labels are escaped');
});

test('both Stats charts hide the bars from screen readers and include the table', async () => {
  const dashboard = await read('frontend/js/dashboard.js');
  const monthly = dashboard.slice(dashboard.indexOf('export function buildMonthlyChart'), dashboard.indexOf('function buildRecentActivity'));
  assert.ok(monthly.includes('<div class="monthly-chart" aria-hidden="true">'));
  assert.ok(monthly.includes('chartDataTable({'));
  assert.ok(!dashboard.includes('function buildPagesChart'), 'unused duplicate removed');
  const stats = await read('frontend/js/features/statistics/statisticsPage.js');
  const pages = stats.slice(stats.indexOf('function buildPagesChart'));
  assert.ok(pages.includes('<div class="monthly-chart monthly-chart-pages" aria-hidden="true">'));
  assert.ok(pages.includes('chartDataTable({'));
  assert.ok(!pages.includes('role="img"'), 'no unlabelled image role replacing the data');
});

test('goal stepper buttons are 44px touch targets', async () => {
  const css = await read('frontend/css/features/goals.css');
  const rule = css.match(/\.goal-stepper button \{([^}]*)\}/)?.[1] || '';
  assert.match(rule, /width: 44px/);
  assert.match(rule, /height: 44px/);
  assert.match(css, /\.goal-stepper \{[^}]*flex-direction: row/);
});

test('mobile bottom nav stays readable over scrolling content', async () => {
  const css = await read('frontend/css/sidebar.css');
  const rules = selector => [...css.matchAll(new RegExp(`${selector} \\{([^}]*)\\}`, 'g'))].map(m => m[1]);
  const nav = rules('\\.mobile-bottom-nav').find(body => body.includes('position: fixed')) || '';
  assert.match(nav, /background: color-mix\(in srgb, var\(--bg\) 97%, transparent\)/);
  const item = rules('\\.mobile-bottom-item').find(body => body.includes('flex: 1')) || '';
  assert.match(item, /color: var\(--text-body\)/, 'inactive labels use body text, not the muted grey');
});

test('read-only star ratings are announced as text', async () => {
  const { Utils } = await import('../frontend/js/utils.js');
  const four = Utils.buildStars(4);
  assert.match(four, /^<div class="star-rating readonly" role="img" aria-label="Rated 4 out of 5">/);
  assert.equal((four.match(/aria-hidden="true"/g) || []).length, 5, 'individual star icons stay hidden');
  assert.match(Utils.buildStars(null), /aria-label="Not rated"/);
  assert.match(Utils.buildStars(1), /aria-label="Rated 1 out of 5"/);
});

test('scrollable regions are keyboard reachable', async () => {
  const html = await read('frontend/index.html');
  for (const [id, label] of [['searchResults', 'Search results'], ['whatsNewBody', 'Release notes'], ['backupImportBody', 'Backup details']]) {
    assert.match(html, new RegExp(`id="${id}" tabindex="0" role="region" aria-label="${label}"`));
  }
  assert.match(await read('frontend/js/features/help/helpPage.js'), /help-shortcuts-table-wrapper" tabindex="0" role="region" aria-label="Keyboard shortcuts"/);
});
