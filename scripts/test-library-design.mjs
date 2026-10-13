import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve(process.env.LIBRIQ_DESIGN_OUTPUT || 'artifacts/library-design');
const covers = process.env.LIBRIQ_DESIGN_COVERS;
// Isolated renderer: no production auth bootstrap or authentication changes.
const html = `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="css/reset.css"><link rel="stylesheet" href="assets/fonts/fonts.css"><link rel="stylesheet" href="css/tokens.css"><link rel="stylesheet" href="css/base.css"><link rel="stylesheet" href="css/components.css"><link rel="stylesheet" href="css/features/library.css">
  </head><body><main id="mainContent" class="main-content" role="main"></main></body></html>`;
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(`${root}${path.sep}`) && file !== root) return res.writeHead(403).end();
  try {
    let body;
    if (pathname === '/') body = html;
    else if (/^\/__cover\/\d\.svg$/.test(pathname)) {
      const index = Number(pathname.match(/\d/)[0]);
      // Repeatable stand-in for data-supplied imagery, never a production asset.
      body = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="240" viewBox="0 0 160 240"><rect width="160" height="240" fill="${['#16373e', '#192844', '#26364f', '#233944'][index]}"/><text x="16" y="36" fill="#f2f5fb" font-size="14">Fixture cover ${index + 1}</text></svg>`;
      if (covers) {
        body = await fs.readFile(path.resolve(covers, `cover-${index}.png`));
        return res.writeHead(200, { 'Content-Type': 'image/png' }).end(body);
      }
    } else body = await fs.readFile(file);
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)] || 'text/html';
    res.writeHead(200, { 'Content-Type': type }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
await fs.mkdir(output, { recursive: true });
const results = [];

async function setup(page, { theme = 'dark', empty = false, shelf = false, shell = false, fallback = false } = {}) {
  await page.goto(base);
  await page.evaluate(async ({ theme, empty, shelf, shell, fallback }) => {
    document.documentElement.dataset.theme = theme;
    if (!shell) document.getElementById('mainContent').style.marginLeft = '0';
    const [{ Storage }, { Utils }, { Library }, { LIBRIQ }, { createLibraryPage }, { createLibraryShelvesPage }] = await Promise.all([
      import('./js/storage.js'), import('./js/utils.js'), import('./js/library.js'), import('./js/data.js'),
      import('./js/features/library/libraryPage.js'), import('./js/features/library/libraryShelvesPage.js'),
    ]);
    const titles = ['The Waves', 'A Field Guide to Getting Lost', 'Piranesi', 'The Left Hand of Darkness'];
    const statuses = shelf ? ['reading', 'reading', 'reading', 'reading'] : ['reading', 'wishlist', 'finished', 'reading'];
    const books = empty ? [] : titles.map((title, index) => ({ id: `book-${index}`, title,
      author: ['Virginia Woolf', 'Rebecca Solnit', 'Susanna Clarke', 'Ursula K. Le Guin'][index],
      coverUrl: fallback && index === 0 ? '/missing-cover.png' : `/__cover/${index}.svg`,
      status: statuses[index], currentPage: [126, 42, 0, 207][index], pageCount: [300, 224, 240, 304][index],
      dateAdded: `2026-10-${12 - index}`, dateStarted: `2026-10-${12 - index}`,
      isFavorite: index === 0, rating: index === 2 ? 4 : 0, genres: ['Fiction'], tags: index === 0 ? ['Owned'] : [],
      description: 'A complete description for the renderer fixture.', publisher: 'Fixture publisher', publishYear: 2020, language: 'en',
    }));
    Object.assign(Storage, { getBooks: () => books, getBooksByStatus: status => books.filter(book => book.status === status), getBookById: id => books.find(book => book.id === id) });
    const calls = [];
    globalThis.Utils = Utils;
    globalThis.Navigation = { renderCurrentPage: () => calls.push('rerender'), updateBadges: () => calls.push('badges') };
    Object.assign(Library, {
      showDetailsModal: id => calls.push(`details:${id}`), showProgressModal: id => calls.push(`progress:${id}`),
      toggleFavorite: id => { const book = books.find(book => book.id === id); book.isFavorite = !book.isFavorite; calls.push(`favorite:${id}`); },
      setStatus: (id, status) => { books.find(book => book.id === id).status = status; calls.push(`status:${id}:${status}`); },
      removeBook: id => calls.push(`remove:${id}`),
    });
    const state = new Map();
    const actions = { stateStorage: { getItem: key => state.get(key) || null, setItem: (key, value) => state.set(key, String(value)) }, openSearch: () => calls.push('search'),
      openManualEntry: () => calls.push('manual'), importBackup: () => calls.push('import'), navigate: page => calls.push(`navigate:${page}`) };
    const library = createLibraryPage({ storage: Storage, library: Library, utils: Utils, constants: LIBRIQ, actions });
    const shelves = createLibraryShelvesPage({ storage: Storage, library: Library, utils: Utils, actions });
    Object.assign(globalThis, { fixture: { calls, books, library, shelves } });
    if (shelf) shelves.renderStatusPage('reading'); else library();
  }, { theme, empty, shelf, shell, fallback });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

async function verify(page, name, { width, shelf, empty, reduced, shell }) {
  const geometry = await page.evaluate(() => {
    const grid = document.querySelector('.books-grid');
    const card = document.querySelector('.book-card');
    return { width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll('#libraryPage *, #statusPage *')].filter(el => el.getClientRects().length && getComputedStyle(el).position !== 'absolute' && el.getBoundingClientRect().right > innerWidth + 1).map(el => el.className),
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      card: card && { width: card.getBoundingClientRect().width, height: card.getBoundingClientRect().height, cover: card.querySelector('.book-cover').getBoundingClientRect().height, blur: getComputedStyle(card).backdropFilter, fill: getComputedStyle(card).backgroundColor, titleFont: getComputedStyle(card.querySelector('.book-card-title')).fontFamily },
      reduced: matchMedia('(prefers-reduced-transparency: reduce)').matches };
  });
  assert.ok(geometry.scroll <= geometry.width, `${name}: root overflow`);
  assert.deepEqual(geometry.overflowing, [], `${name}: content overflow`);
  if (!empty) {
    const columns = shelf ? width < 768 ? 2 : width < 1024 ? 2 : width < 1200 ? 3 : 4 : width < 768 ? 1 : width < 1024 ? 2 : 3;
    assert.equal(geometry.columns, columns, name);
    assert.ok(geometry.card.titleFont.includes('Lora'), `${name}: local Lora typography`);
    assert.equal(geometry.card.cover, shelf ? width < 768 ? 190 : 264 : width < 768 ? 120 : 260, name);
    if (!shelf && width === 390 && !shell) {
      assert.equal(geometry.card.width, 350);
      assert.ok(geometry.card.height >= 152 && geometry.card.height <= 156, `${name}: compact 152px card geometry`);
    }
    if (width < 768) assert.equal(geometry.card.blur, 'none', `${name}: mobile blur limited`);
    if (reduced) { assert.ok(geometry.reduced); assert.equal(geometry.card.blur, 'none'); assert.ok(geometry.card.fill.startsWith('rgb(')); }
  }
  const masks = await page.locator('.library-icon').evaluateAll(icons => [...new Set(icons.filter(icon => icon.getClientRects().length).map(icon => getComputedStyle(icon).maskImage))]);
  for (const mask of masks) {
    const url = mask.match(/url\("([^"]+)"\)/)?.[1];
    assert.ok(url?.includes('/assets/revamp/library/'), `${name}: local icon slot`);
    const asset = await page.request.get(url);
    assert.equal(asset.status(), 200);
    assert.ok((await asset.body()).length > 0);
  }
  assert.ok(await page.locator('.book-cover img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0 && img.getBoundingClientRect().width > 0)), `${name}: cover loading`);
  const contrast = await page.evaluate(() => {
    const rgba = value => value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
    const blend = (fg, bg) => fg.slice(0, 3).map((value, i) => value * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
    const luminance = rgb => rgb.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const selectors = '.page-subtitle,.library-eyebrow,.library-sort-label,.library-sort-select,.chip,.chip span,.library-grid-summary span,.book-card-title,.book-card-author,.badge,.progress-text,.progress-pct,.library-footer span,.library-breadcrumb,.shelf-summary small,.empty-state-body,.library-empty-context,.btn,summary';
    return [...document.querySelectorAll(`#libraryPage :is(${selectors}),#statusPage :is(${selectors})`)].filter(el => el.getClientRects().length && !el.classList.contains('library-icon') && getComputedStyle(el).fontSize !== '0px').flatMap(el => {
      let bg = [255, 255, 255];
      const ancestors = [];
      for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
      for (const node of ancestors) bg = blend(rgba(getComputedStyle(node).backgroundColor), bg);
      const fg = blend(rgba(getComputedStyle(el).color), bg);
      const levels = [luminance(fg), luminance(bg)].sort((a, b) => a - b);
      const ratio = (levels[1] + .05) / (levels[0] + .05);
      return ratio < 4.5 ? [`${el.className}: ${ratio.toFixed(2)}`] : [];
    });
  });
  assert.deepEqual(contrast, [], `${name}: AA text contrast`);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
  results.push({ name, geometry, assets: masks.length, contrast: '>=4.5:1' });
  console.log(`${name}: passed`);
}

try {
  for (const shelf of [false, true]) {
    for (const [label, width, theme, empty, reduced, shell] of [
      ['desktop-dark', 1440, 'dark', false, false, false], ['desktop-light', 1440, 'light', false, false, false],
      ['mobile-dark', 390, 'dark', false, false, false], ['mobile-light', 390, 'light', false, false, false],
      ['solid-dark', 390, 'dark', false, true, false], ['solid-light', 1440, 'light', false, true, false],
      ['empty-desktop', 1440, 'dark', true, false, false], ['empty-mobile', 390, 'light', true, true, false],
      ['narrow', 320, 'dark', false, false, false], ['tablet', 768, 'light', false, false, false],
      ['existing-shell', 1440, 'dark', false, false, true],
    ]) {
      const name = `${shelf ? 'shelf' : 'library'}-${label}`;
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      if (reduced) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      }
      await setup(page, { theme, shelf, empty, shell });
      await verify(page, name, { width, shelf, empty, reduced, shell });
      assert.deepEqual(errors, [], name);
      await context.close();
    }
  }
  for (const shelf of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await setup(page, { shelf });
    const input = shelf ? '#shelfSearchInput' : '#librarySearchInput';
    const clear = shelf ? '#shelfSearchClear' : '#clearLibrarySearch';
    await page.locator(input).fill('no matches <script>');
    await page.locator('.empty-state-title').waitFor();
    assert.equal(await page.locator('.book-card').count(), 0);
    await page.screenshot({ path: path.join(output, `${shelf ? 'shelf' : 'library'}-no-results.png`), fullPage: true });
    await page.locator(clear).click();
    await page.locator('.book-card').first().waitFor();
    assert.equal(await page.locator('.book-card').count(), 4);
    await page.locator(shelf ? '#shelfSortSelect' : '#librarySortSelect').selectOption('title-az');
    assert.equal(await page.locator('.book-card-title').first().textContent(), 'A Field Guide to Getting Lost');
    await page.locator(shelf ? '#shelfShelfSelect' : '#libraryShelfSelect').selectOption('Owned');
    assert.equal(await page.locator('.book-card').count(), 1);
    await page.locator('.card-fav-btn').click();
    assert.equal(await page.locator('.card-fav-btn').getAttribute('aria-pressed'), 'false');
    await page.locator('.card-details-btn').focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(await page.evaluate(() => fixture.calls.slice(-1)), ['details:book-0']);
    await page.locator('summary').click();
    await page.locator('.card-progress-btn').click();
    await page.locator('.card-finish-btn').click();
    await page.locator('.card-remove-btn').click();
    assert.ok(await page.evaluate(() => fixture.calls.includes('progress:book-0') && fixture.calls.includes('status:book-0:finished') && fixture.calls.includes('remove:book-0')));
    if (shelf) {
      await page.locator('[data-status="wishlist"]').click();
      assert.equal(await page.locator('.book-card').count(), 0);
      await page.locator('.empty-state [data-action="browse-library"]').click();
      assert.equal(await page.evaluate(() => fixture.calls.at(-1)), 'navigate:library');
    } else {
      await page.locator('#libraryShelfSelect').selectOption('all');
      await page.evaluate(() => fixture.library());
      await page.locator('[data-filter="wishlist"]').click();
      await page.locator('summary').click();
      await page.locator('.card-start-btn').click();
      assert.ok(await page.evaluate(() => fixture.calls.includes('status:book-1:reading')));
      await page.locator('[data-filter="favorites"]').click();
      assert.equal(await page.locator('.book-card').count(), 0);
    }
    await page.close();
    console.log(`${shelf ? 'Shelf' : 'Library'} search/sort/custom shelf/details/favorite/progress/status/remove contracts: passed`);
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await setup(page, { fallback: true });
  assert.equal(await page.locator('.book-card').first().locator('.book-cover-placeholder').count(), 1);
  await page.screenshot({ path: path.join(output, 'library-cover-fallback.png'), fullPage: true });
  await setup(page, { empty: true });
  for (const action of ['open-search', 'open-manual-entry', 'import-backup']) await page.locator(`.empty-state [data-action="${action}"]`).click();
  assert.deepEqual(await page.evaluate(() => fixture.calls), ['search', 'manual', 'import']);
  await page.close();
  for (const status of ['reading', 'wishlist', 'finished', 'favorites']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 }, reducedMotion: 'reduce' });
    await setup(page, { shelf: true, empty: true });
    await page.evaluate(status => fixture.shelves.renderStatusPage(status), status);
    await verify(page, `shelf-empty-${status}`, { width: 390, shelf: true, empty: true });
    await page.close();
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log('Cover fallback and empty-state recovery contracts: passed');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
