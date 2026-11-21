// Search follows the ARIA 1.2 combobox pattern: the input is a combobox that
// controls a listbox of options, and arrow keys move aria-activedescendant
// while focus stays in the input.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startE2EServer, waitForServer, waitForAppReady, stopE2EServer, closePlaywright } from './e2e-test-utils.mjs';

const testName = 'search-combobox-browser';
let baseUrl;
const server = startE2EServer({ testName });

let browser;
try {
  baseUrl = await waitForServer(server, { testName });
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseUrl}/?libriq_e2e_test_mode=1`, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page, { testName });

  await page.evaluate(async () => {
    window.LibriqE2E.seedAuth('combo-user', 'combo@example.test', 'Combo Reader');
    window.LibriqE2E.enableAccountMode();
    window.LibriqSyncBeta.setEnabled(false);
    window.LibriqE2E.addBook({ title: 'Dune', author: 'Frank Herbert', status: 'reading' });
    const { BookAPI } = await import('./js/api/index.js');
    BookAPI.searchBooks = async () => [
      { id: 'api-1', title: 'Dune Messiah', author: 'Frank Herbert', publishYear: 1969, source: 'openlibrary' },
      { id: 'api-2', title: 'Children of Dune', author: 'Frank Herbert', publishYear: 1976, source: 'openlibrary' },
    ];
    window.__route = null;
    window.LibriqNavigation.goTo('dashboard');
    window.Navigation.goTo = route => { window.__route = route; };
    window.Search.open();
  });

  const input = page.locator('#searchInput');
  const attr = name => input.getAttribute(name);
  assert.equal(await attr('role'), 'combobox');
  assert.equal(await attr('aria-autocomplete'), 'list');
  assert.equal(await attr('aria-expanded'), 'false', 'collapsed before a search');
  assert.equal(await attr('aria-activedescendant'), null);

  await input.fill('Dune');
  await page.waitForFunction(() => document.querySelectorAll('#searchResultsList [role="option"]').length === 3);
  assert.equal(await attr('aria-expanded'), 'true');
  const listId = await attr('aria-controls');
  const list = page.locator(`#${listId}`);
  assert.equal(await list.getAttribute('role'), 'listbox');
  assert.ok(await list.getAttribute('aria-label'), 'listbox is named');

  // Groups are labelled by their visible section headings.
  const groups = await page.evaluate(id => [...document.getElementById(id).querySelectorAll('[role="group"]')]
    .map(g => document.getElementById(g.getAttribute('aria-labelledby'))?.textContent.trim()), listId);
  assert.equal(groups.length, 2);
  assert.match(groups[0], /In Your Library/);
  assert.match(groups[1], /From the web/);

  const options = await page.evaluate(() => [...document.querySelectorAll('#searchResultsList [role="option"]')].map(o => ({
    id: o.id, selected: o.getAttribute('aria-selected'), label: o.getAttribute('aria-label'),
    tabbable: [...o.querySelectorAll('button, a, input')].filter(el => el.tabIndex >= 0).length,
  })));
  assert.ok(options.every(o => o.id && o.selected === 'false' && o.tabbable === 0), JSON.stringify(options));
  assert.match(options[0].label, /^Dune by Frank Herbert, in your library/);
  assert.match(options[1].label, /^Dune Messiah by Frank Herbert, 1969/);

  const active = () => page.evaluate(() => {
    const id = document.getElementById('searchInput').getAttribute('aria-activedescendant');
    const el = id && document.getElementById(id);
    return { id, selected: el?.getAttribute('aria-selected'), focusInInput: document.activeElement?.id === 'searchInput',
      selectedCount: document.querySelectorAll('#searchResultsList [role="option"][aria-selected="true"]').length };
  });

  await page.keyboard.press('ArrowDown');
  let state = await active();
  assert.equal(state.id, options[0].id);
  assert.equal(state.selected, 'true');
  assert.equal(state.selectedCount, 1);
  assert.equal(state.focusInInput, true, 'DOM focus stays in the input');

  await page.keyboard.press('ArrowDown');
  assert.equal((await active()).id, options[1].id);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  assert.equal((await active()).id, options[2].id, 'stops at the last option');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  assert.equal((await active()).id, options[0].id, 'stops at the first option');

  // A new query drops the old highlight.
  await input.fill('Dune M');
  await page.waitForFunction(() => document.querySelectorAll('#searchResultsList [role="option"]').length === 2);
  assert.equal(await attr('aria-activedescendant'), null);

  // Enter on the local result opens the library.
  await input.fill('Dune');
  await page.waitForFunction(() => document.querySelectorAll('#searchResultsList [role="option"]').length === 3);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => window.__route), 'library');
  assert.equal(await attr('aria-expanded'), 'false', 'collapsed after closing');
  assert.equal(await attr('aria-activedescendant'), null);

  assert.deepEqual(errors, []);
  console.log('Search combobox browser test passed');
} finally {
  await closePlaywright(browser, [], { testName });
  await stopE2EServer(server, { testName });
}
