import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pageHeader } from '../frontend/js/shared/pageHeader.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('pageHeader renders one h1, an optional subtitle and an optional aside', () => {
  const html = pageHeader({ title: 'Quotes', subtitle: 'Saved passages', aside: '<button>Add</button>' });
  assert.match(html, /^<header class="page-header">/);
  assert.equal(html.match(/<h1 class="page-title">Quotes<\/h1>/g).length, 1);
  assert.match(html, /<p class="page-subtitle">Saved passages<\/p>/);
  assert.match(html, /<\/div><button>Add<\/button><\/header>$/);
  assert.doesNotMatch(pageHeader({ title: 'Goals' }), /page-subtitle/);
});

test('pageHeader keeps page-specific hooks for layout and scripts', () => {
  const html = pageHeader({ title: 'Reading', className: 'status-header', headingClass: 'status-heading', afterTitle: '<span class="note">DNF</span>' });
  assert.match(html, /<header class="page-header status-header"><div class="page-heading status-heading"><h1 class="page-title">Reading<\/h1><span class="note">DNF<\/span>/);
});

// Every signed-in page opens with the shared header and no label above the
// title, so headers look and read the same from page to page.
test('app pages use the shared header and no eyebrow label', async () => {
  const pages = [
    'frontend/js/features/library/libraryPage.js',
    'frontend/js/features/library/libraryShelvesPage.js',
    'frontend/js/features/statistics/statisticsPage.js',
    'frontend/js/features/activity/activityPage.js',
    'frontend/js/features/goals/goalsPage.js',
    'frontend/js/features/quotes/quotesPage.js',
    'frontend/js/features/settings/settingsPage.js',
    'frontend/js/features/profile/profilePage.js',
  ];
  for (const file of pages) {
    const source = await read(file);
    assert.match(source, /pageHeader\(\{/, `${file} uses pageHeader`);
    assert.doesNotMatch(source, /class="[^"]*eyebrow[^"]*"/, `${file} has no eyebrow`);
  }
  assert.doesNotMatch(await read('frontend/js/features/help/helpPage.js'), /help-eyebrow/);
});
