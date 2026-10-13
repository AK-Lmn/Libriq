import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve(process.env.LIBRIQ_BOOK_DIALOG_ARTIFACTS || path.join(os.tmpdir(), 'libriq-book-dialogs-design'));
const html = (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace('</head>', '<link rel="stylesheet" href="/css/features/book-dialogs.css"></head>');
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
  try {
    const body = pathname === '/' ? html : await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)] || 'text/html' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const evidence = [];

async function setup(page, theme) {
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(async theme => {
    document.documentElement.dataset.theme = theme;
    document.body.classList.remove('auth-booting');
    document.body.style.background = 'var(--bg)';
    const { Storage } = await import('./js/storage.js');
    const { Utils } = await import('./js/utils.js');
    const { Library } = await import('./js/library.js');
    const { Search } = await import('./js/search.js');
    const { BookAPI } = await import('./js/api/index.js');
    const { LibriqFirebase } = await import('./js/firebase-client.js');
    // Isolated account/provider fixture. Production bootstrap and networking never run.
    Storage.setActiveAccountUid('book-dialog-fixture');
    LibriqFirebase.queueActivitySync = () => {};
    Object.assign(BookAPI, { getLastSearchMeta: () => globalThis.fixtureMeta || {}, searchBooks: async () => [] });
    globalThis.Navigation = { updateBadges() {}, renderCurrentPage() {}, goTo() {} };
    Library.init(); Search.init();
    const trigger = document.createElement('button');
    trigger.id = 'fixtureTrigger'; trigger.textContent = 'Open reading workspace';
    document.getElementById('mainContent').replaceChildren(trigger);
    globalThis.dialogFixture = { Storage, Utils, Library, Search, BookAPI };
  }, theme);
  await page.evaluate(() => document.fonts.ready);
}

async function render(page, window, state = 'ready') {
  await page.evaluate(({ window, state }) => {
    const { Storage, Utils, Library, Search, BookAPI } = globalThis.dialogFixture;
    Search.close(); Library.closeAddModal();
    document.getElementById('fixtureTrigger').focus();
    const long = state === 'long';
    const book = {
      id: 'fixture-book', title: long ? 'A very long story of libraries, journeys, café 日本語, and unexpected discoveries '.repeat(5) : 'The Art of Paying Attention',
      author: long ? 'An exceptionally long author name '.repeat(4) : 'Elena Rivers',
      source: 'openlibrary', sourceBadges: ['Open Library', 'Google Books'],
      genres: ['Literary fiction', 'Essays'], tags: ['Weekend reads'], pageCount: state === 'missing' ? 0 : 304, currentPage: 108,
      publishYear: 2024, status: 'reading', rating: 4,
      coverUrl: state === 'missing' ? null : '/assets/revamp/library/books.svg',
      description: state === 'missing' ? '' : long ? 'A thoughtful and unusually long synopsis '.repeat(20) : 'A thoughtful collection about finding wonder in the everyday. Small observations open the door to a richer reading life.',
    };
    Storage.saveBooks(window === 'search' ? [] : [book]);
    globalThis.fixtureBook = book;
    globalThis.fixtureMeta = state === 'offline' ? { offline: true, blockedOffline: true } : state === 'cached' ? { offline: true, fromCache: true } : {};
    BookAPI.searchBooks = async () => {
      if (state === 'loading') return new Promise(() => {});
      if (state === 'error') throw new Error('Isolated fixture provider failure');
      return ['empty', 'offline'].includes(state) ? [] : [book, { ...book, id: 'another-fixture', source: 'google', title: 'A Book Without a Cover', author: 'Robin Lake', coverUrl: null, description: '' }];
    };
    if (window === 'search') Search.open();
    if (window === 'add') Library.showAddModal(book);
    if (window === 'manual') Library.showAddModal(long ? book : {}, { manual: true });
    if (window === 'progress') Library.showProgressModal(book.id);
  }, { window, state });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (window === 'search' && state !== 'initial') {
    await page.locator('#searchInput').fill('Attention');
    await page.waitForFunction(loading => {
      const status = document.getElementById('searchStatus').textContent;
      return status !== 'Enter at least 3 characters to search.' &&
        document.getElementById('searchResults').getAttribute('aria-busy') === String(loading);
    }, state === 'loading');
    if (state === 'filtered') {
      await page.locator('#searchAdvancedToggle').click();
      await page.locator('#searchFilterAuthor').fill('No matching author');
    }
    if (['ready', 'cached', 'long'].includes(state)) {
      assert.equal(await page.locator('#searchEmptyState').isVisible(), false);
      assert.equal(await page.locator('#searchResults .search-result-item').count(), 2);
    }
  }
}

async function inspect(page) {
  return page.evaluate(() => {
    const modal = [...document.querySelectorAll('[role="dialog"]')].find(el => !el.hidden);
    const shown = el => el.getClientRects().length && !el.closest('[hidden], [inert]');
    const rgba = value => {
      const channels = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
      if (value.startsWith('color(srgb ')) channels.splice(0, 3, ...channels.slice(0, 3).map(v => v * 255));
      return channels;
    };
    const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
    const luminance = rgb => rgb.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const contrast = [];
    const check = (el, foreground, large, name) => {
      let background = [255, 255, 255];
      const chain = []; for (let p = el; p; p = p.parentElement) chain.unshift(p);
      chain.forEach(p => { background = blend(rgba(getComputedStyle(p).backgroundColor), background); });
      const a = luminance(blend(rgba(foreground), background)), b = luminance(background);
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      if (ratio < (large ? 3 : 4.5)) contrast.push(`${name}: ${ratio.toFixed(2)}`);
    };
    for (const el of modal.querySelectorAll('*')) {
      if (!shown(el) || el.matches(':disabled')) continue;
      const s = getComputedStyle(el);
      if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
        const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && parseInt(s.fontWeight) >= 700);
        check(el, s.color, large, `${el.tagName}.${el.className} ${el.textContent.trim().slice(0, 35)}`);
      }
      if (el.matches('input[placeholder], textarea[placeholder]')) check(el, getComputedStyle(el, '::placeholder').color, false, `${el.id} placeholder`);
    }
    const panel = modal.firstElementChild;
    const smallTargets = [...modal.querySelectorAll('button, .status-option, .search-filter-check')].filter(shown).filter(el => el.getBoundingClientRect().height < 43).map(el => el.id || el.className);
    const brokenImages = [...modal.querySelectorAll('img')].filter(shown).filter(el => !el.complete || !el.naturalWidth).map(el => el.src);
    return { modal: modal.id, contrast, smallTargets, brokenImages,
      overflow: document.documentElement.scrollWidth > innerWidth || panel.scrollWidth > panel.clientWidth,
      blur: getComputedStyle(panel).backdropFilter,
    };
  });
}

async function capture(page, name, solid = false) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => {
    const modal = [...document.querySelectorAll('[role="dialog"]')].find(el => !el.hidden);
    await Promise.all([...modal.querySelectorAll('img')].map(img => { img.loading = 'eager'; return img.decode(); }));
  });
  await page.waitForLoadState('networkidle');
  const result = await inspect(page);
  await page.screenshot({ path: path.join(output, `${name}.png`) });
  assert.equal(result.overflow, false, `${name}: overflow`);
  assert.deepEqual(result.contrast, [], `${name}: contrast`);
  assert.deepEqual(result.smallTargets, [], `${name}: touch targets`);
  assert.deepEqual(result.brokenImages, [], `${name}: cover load`);
  if (solid) assert.equal(result.blur, 'none', `${name}: solid fallback`);
  evidence.push({ name, ...result });
  console.log(`${name}: passed`);
}

try {
  for (const [variant, width, theme, solid] of [
    ['desktop-dark', 1440, 'dark', false], ['desktop-light', 1440, 'light', false],
    ['mobile-dark', 390, 'dark', false], ['mobile-light', 390, 'light', false],
    ['desktop-solid', 1440, 'dark', true], ['narrow-light-solid', 320, 'light', true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = []; const remoteRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => {
      if (new URL(route.request().url()).hostname !== '127.0.0.1') { remoteRequests.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await setup(page, theme);
    if (solid) await (await context.newCDPSession(page)).send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const window of ['search', 'add', 'manual', 'progress']) {
      await render(page, window, window === 'search' ? 'initial' : 'ready');
      await capture(page, `${window}-${variant}`, solid);
      if (window === 'manual') {
        await page.locator('#manualStatusInput').selectOption('reading');
        assert.ok(await page.locator('#manualCurrentPageGroup').isVisible());
        assert.equal(await page.locator('#manualRatingGroup').isVisible(), false);
        await page.locator('#manualStatusInput').selectOption('finished');
        await page.locator('[data-action="set-manual-rating"][data-rating="4"]').click();
        assert.equal(await page.locator('#manualRatingInput').inputValue(), '4');
        await capture(page, `${window}-finished-${variant}`, solid);
      }
      if (window === 'add') {
        await page.locator('input[name="status"][value="wishlist"]').focus();
        await page.keyboard.press('ArrowRight');
        assert.ok(await page.locator('input[name="status"][value="reading"]').isChecked());
        assert.ok(await page.locator('#pageProgressGroup').isVisible());
        await page.keyboard.press('ArrowRight');
        assert.ok(await page.locator('#ratingGroup').isVisible());
        assert.equal(await page.locator('#pageProgressGroup').isVisible(), false);
        await page.locator('[data-action="set-add-rating"][data-rating="5"]').click();
        assert.equal(await page.locator('#ratingInput').inputValue(), '5');
        await capture(page, `${window}-finished-${variant}`, solid);
      }
      if (window === 'search') {
        for (const state of ['ready', 'filtered', 'empty', 'error', 'loading', 'offline', 'cached']) {
          await render(page, window, state);
          await capture(page, `${window}-${state}-${variant}`, solid);
        }
      }
      await page.keyboard.press('Escape');
      assert.ok(await page.locator(window === 'search' ? '#searchModal' : '#addBookModal').evaluate(el => el.hidden));
      await page.waitForFunction(() => document.activeElement?.id === 'fixtureTrigger');
    }
    for (const window of ['search', 'add', 'manual', 'progress']) {
      await render(page, window, 'long');
      await capture(page, `${window}-long-${variant}`, solid);
      if (window === 'manual') {
        await page.locator('#manualTagsInput').scrollIntoViewIfNeeded();
        await capture(page, `${window}-long-fields-${variant}`, solid);
      }
    }
    for (const window of ['add', 'progress']) {
      await render(page, window, 'missing');
      await capture(page, `${window}-missing-${variant}`, solid);
    }
    // Preserve form and storage semantics on isolated books only.
    await render(page, 'manual');
    assert.equal(await page.locator('#addBookForm').evaluate(el => el.checkValidity()), false);
    await page.locator('#manualTitleInput').fill('Hand-entered fixture');
    await page.locator('#manualAuthorInput').fill('Fixture author');
    await page.locator('#manualPageCountInput').fill('100');
    await page.locator('#manualStatusInput').selectOption('reading');
    await page.locator('#manualCurrentPageInput').fill('101');
    await page.locator('#addBookForm button[type="submit"]').click();
    assert.equal(await page.locator('#addBookModal').evaluate(el => el.hidden), false);
    await capture(page, `manual-validation-${variant}`, solid);
    await page.locator('#manualCurrentPageInput').fill('20');
    await page.locator('#addBookForm button[type="submit"]').click();
    assert.ok(await page.evaluate(() => dialogFixture.Storage.getBooks().some(b => b.source === 'manual' && b.currentPage === 20 && b.pageCount === 100)));
    await render(page, 'progress');
    await page.locator('#progressPageInput').fill('304');
    await page.locator('#progressForm button[type="submit"]').click();
    const completed = await page.evaluate(() => dialogFixture.Storage.getBookById('fixture-book'));
    assert.equal(completed.status, 'finished'); assert.ok(completed.dateFinished);
    assert.equal(completed.currentPage, 304);
    await render(page, 'search', 'ready');
    await page.locator('#searchInput').focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    await page.waitForSelector('#addBookModal:not([hidden])');
    await page.waitForFunction(() => document.getElementById('addBookModal').contains(document.activeElement));
    await page.locator('input[name="status"][value="reading"]').check();
    await page.locator('#currentPageInput').fill('42');
    await page.locator('#tagsInput').fill('Classics, Weekend reads');
    await page.locator('#addBookForm button[type="submit"]').click();
    assert.ok(await page.evaluate(() => dialogFixture.Storage.getBooks().some(b => b.currentPage === 42 && b.tags.includes('Classics'))));
    await render(page, 'search', 'empty');
    await page.locator('#searchEmptyState [data-manual-entry]').click();
    await page.waitForSelector('#manualTitleInput');
    await page.waitForFunction(() => document.getElementById('addBookModal').contains(document.activeElement));
    await page.locator('#addBookForm button[type="submit"]').focus();
    await page.keyboard.press('Tab');
    assert.ok(await page.locator('#closeAddBook').evaluate(el => el === document.activeElement));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.activeElement?.id === 'fixtureTrigger');
    await page.evaluate(() => {
      dialogFixture.BookAPI.searchBooks = () => new Promise(resolve => { globalThis.resolvePendingSearch = resolve; });
      dialogFixture.Search.open();
    });
    await page.locator('#searchInput').fill('Pending search');
    await page.waitForFunction(() => typeof globalThis.resolvePendingSearch === 'function');
    await page.keyboard.press('Escape');
    await page.evaluate(async () => { resolvePendingSearch([fixtureBook]); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(await page.locator('#searchStatus').textContent(), 'Enter at least 3 characters to search.');
    assert.equal(await page.locator('#searchResults .search-result-item').count(), 0);
    await page.evaluate(() => {
      dialogFixture.Storage.saveBooks([fixtureBook]);
      dialogFixture.BookAPI.searchBooks = async () => [];
      Navigation.goTo = route => { globalThis.fixtureRoute = route; };
      dialogFixture.Search.open();
    });
    await page.locator('#searchInput').fill('Attention');
    await page.waitForSelector('#searchResults .search-result-item');
    await page.locator('#searchInput').focus();
    await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => fixtureRoute), 'library');
    assert.ok(await page.locator('#searchModal').evaluate(el => el.hidden));
    await page.waitForFunction(() => document.activeElement?.id === 'fixtureTrigger');
    assert.deepEqual(errors, [], `${variant}: script errors`);
    assert.deepEqual(remoteRequests, [], `${variant}: no live providers/auth`);
    await context.close();
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  console.log(`Book dialog design checks passed (${evidence.length} captures). Artifacts: ${output}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
