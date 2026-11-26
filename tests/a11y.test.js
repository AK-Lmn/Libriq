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
  const nav = (await read('frontend/js/navigation.js')) + (await read('frontend/js/features/session/sessionPage.js'));
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

test('chart bars are one keyboard stop, each bar named with its value', async () => {
  const { chartGroupAttrs, chartBarAttrs } = await import('../frontend/js/shared/chartTable.js');
  assert.equal(chartGroupAttrs('Books finished per month, 2026'),
    'role="group" aria-label="Books finished per month, 2026. Use the arrow keys to read each month."');
  assert.equal(chartBarAttrs('3 books in Mar', true), 'role="img" aria-label="3 books in Mar" tabindex="0"');
  assert.equal(chartBarAttrs('0 books in Jan', false), 'role="img" aria-label="0 books in Jan" tabindex="-1"');
  assert.doesNotMatch(chartBarAttrs('<b>1</b> in "Jan"', false), /<b>|"Jan"/, 'label is escaped');
});

test('both Stats charts are keyboard-readable and keep the screen-reader table', async () => {
  const dashboard = await read('frontend/js/dashboard.js');
  const monthly = dashboard.slice(dashboard.indexOf('export function buildMonthlyChart'), dashboard.indexOf('function buildRecentActivity'));
  const stats = await read('frontend/js/features/statistics/statisticsPage.js');
  const pages = stats.slice(stats.indexOf('function buildPagesChart'));
  for (const [name, chart] of [['monthly', monthly], ['pages', pages]]) {
    assert.ok(!chart.includes('aria-hidden="true"'), `${name}: bars are no longer hidden (they are focusable)`);
    assert.ok(chart.includes('chartGroupAttrs('), `${name}: chart is a labelled group`);
    assert.ok(chart.includes('chartBarAttrs('), `${name}: bars are named`);
    assert.ok(chart.includes('chartDataTable({'), `${name}: table kept`);
  }
  assert.ok(!dashboard.includes('function buildPagesChart'), 'unused duplicate removed');
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

async function* jsFiles(dir) {
  const { readdir } = await import('node:fs/promises');
  for (const entry of await readdir(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) yield* jsFiles(rel);
    else if (entry.name.endsWith('.js')) yield rel;
  }
}

test('icons rendered from JS are hidden from screen readers', async () => {
  const offenders = [];
  for await (const file of jsFiles('frontend/js')) {
    const source = await read(file);
    for (const m of source.matchAll(/<i class="ph[^"]*"[^>]*>/g)) {
      if (!/aria-hidden="true"/.test(m[0])) offenders.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('icon-only buttons rendered from JS have an accessible name', async () => {
  const offenders = [];
  for await (const file of jsFiles('frontend/js')) {
    const source = await read(file);
    for (const m of source.matchAll(/<button\b([^>]*)>\s*(?:<i [^>]*><\/i>|<img [^>]*>|\$\{[^}]*[Ii]con\([^}]*\)\})\s*<\/button>/g)) {
      if (!/aria-label=|aria-labelledby=|title=/.test(m[1])) offenders.push(`${file}: ${m[0].slice(0, 120)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test('every progress bar rendered from JS exposes progressbar semantics', async () => {
  const offenders = [];
  for await (const file of jsFiles('frontend/js')) {
    const source = await read(file);
    for (const m of source.matchAll(/<div class="(?:progress-bar|goal-completion|stats-goal-track)[^"]*"[^>]*>/g)) {
      const tag = m[0];
      // Either a real progressbar, or explicitly decorative next to visible numbers.
      const ok = (/role="progressbar"/.test(tag) && /aria-valuenow=/.test(tag) && /aria-label(ledby)?=/.test(tag))
        || /aria-hidden="true"/.test(tag);
      if (!ok) offenders.push(`${file}: ${tag.slice(0, 140)}`);
    }
  }
  assert.deepEqual(offenders, []);
});
