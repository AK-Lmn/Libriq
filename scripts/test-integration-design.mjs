import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve(process.env.LIBRIQ_INTEGRATION_ARTIFACTS || path.join(os.tmpdir(), 'libriq-integration-design'));
const html = (await fs.readFile(path.join(root, 'index.html'), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
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
const results = [];
const routes = ['dashboard', 'library', 'reading', 'wishlist', 'finished', 'favorites', 'abandoned', 'stats', 'goals', 'activity', 'recommendations', 'settings', 'profile', 'help', 'quotes'];
const overlays = ['details', 'search', 'add', 'manual', 'progress', 'kindle', 'whats-new', 'backup', 'danger', 'signin', 'signup', 'reset', 'boot', 'session-fallback'];
const designed = new Set([...routes.filter(route => !['quotes', 'abandoned'].includes(route)), 'details']);

async function render(page, window, theme, state) {
  await page.evaluate(async ({ window: target, theme, state }) => {
    document.documentElement.dataset.theme = theme;
    const { Storage } = await import('./js/storage.js');
    const { Utils } = await import('./js/utils.js');
    const { Library } = await import('./js/library.js');
    const { Search } = await import('./js/search.js');
    const { BookAPI } = await import('./js/api/index.js');
    const { LibriqFirebase } = await import('./js/firebase-client.js');
    const { LibriqCloudBackup } = await import('./js/cloudBackup.js');
    const { createBook } = await import('./js/data.js');
    // Fixture-only account/provider state; no production bootstrap or cloud requests.
    const user = { uid: 'integration-fixture', displayName: 'Fixture Reader', email: 'fixture@example.test', emailVerified: true, providerData: [{ providerId: 'password' }], metadata: { creationTime: '2025-06-17T12:00:00Z' } };
    const auth = { initialized: true, available: true, ready: true, user, signedOutConfirmed: false, restoringSession: false };
    Object.assign(LibriqFirebase, { getState: () => auth, getCurrentUser: () => auth.user, hasFirestore: () => false, onChange: () => () => {} });
    Object.assign(LibriqCloudBackup, { refresh() {}, getState: () => ({ available: false, status: 'idle' }) });
    globalThis.LibriqSyncBeta = { refresh() {}, getState: () => ({ enabled: false, status: 'off' }) };
    Storage.setActiveAccountUid(user.uid);
    const books = Array.from({ length: 8 }, (_, i) => createBook({ id: `fixture-${i}`, title: state === 'long' ? 'A very long book title with Unicode café 日本語 and a continuing chapter '.repeat(4) : `Fixture reading volume ${i + 1}`, author: state === 'long' ? 'An author with a deliberately lengthy name '.repeat(3) : `Fixture author ${i + 1}`, status: ['reading', 'wishlist', 'finished'][i % 3], pageCount: 304, currentPage: i % 3 === 2 ? 304 : 108, rating: 4, isFavorite: i % 2 === 0, genres: ['Fiction'], tags: ['Owned'], dateFinished: '2026-10-01', notes: 'Private notes from a fixture account.', quotes: [{ id: `quote-${i}`, text: 'A fixture quote for a private reading workspace.', page: 23, source: 'manual' }] }));
    if (target === 'abandoned') books.forEach(book => { book.status = 'abandoned'; });
    Storage.saveBooks(state === 'empty' && target !== 'details' && target !== 'progress' ? [] : books);
    Storage.saveProfile({ name: 'Fixture Reader', theme });
    Storage.saveGoals({ yearly: 12, year: 2026 });
    Storage.replaceActivityLog([{ id: 'event', type: 'progress_updated', timestamp: '2026-10-12T12:00:00Z', bookId: books[0].id, bookTitle: books[0].title, payload: { currentPage: 108, pageCount: 304 } }]);
    Object.assign(BookAPI, {
      searchBySubject: async () => { if (state === 'error') throw new Error('Fixture provider unavailable'); return [createBook({ id: 'remote-fixture', title: 'A new fixture discovery', author: 'Fixture author', status: 'wishlist', source: 'openlibrary', sourceBadges: ['Open Library'], genres: ['Fiction'], pageCount: 200 })]; },
      searchCuratedClassics: async () => [],
    });
    const { Navigation } = await import('./js/navigation.js');
    globalThis.Navigation = Navigation;
    if (!globalThis.fixtureInitialized) { Navigation.init(); Search.init(); globalThis.fixtureInitialized = true; }
    document.querySelectorAll('[role="dialog"]').forEach(el => { if (!el.hidden) Utils.hide(el); });
    document.body.style.overflow = '';
    if (['signin', 'signup', 'reset', 'session-fallback'].includes(target)) {
      auth.user = null; auth.signedOutConfirmed = true;
      Navigation.goTo('session');
      Navigation.setEmailAuthMode(target === 'signup' ? 'signup' : target === 'reset' ? 'reset' : 'signin');
      if (target === 'session-fallback') {
        LibriqFirebase.signInWithEmail = async () => { throw Object.assign(new Error('Fixture network unavailable'), { code: 'auth/network-request-failed' }); };
        document.getElementById('sessionEmailInput').value = 'reader@example.test';
        document.getElementById('sessionPasswordInput').value = 'fixture-password';
        document.getElementById('emailAuthForm').requestSubmit();
      }
    } else if (target === 'boot') Navigation.goTo('boot');
    else if (['dashboard', 'library', 'reading', 'wishlist', 'finished', 'favorites', 'abandoned', 'stats', 'goals', 'activity', 'recommendations', 'settings', 'profile', 'help', 'quotes'].includes(target)) Navigation.goTo(target);
    else {
      Navigation.goTo(['kindle', 'backup', 'danger'].includes(target) ? 'settings' : 'library');
      if (target === 'details') Library.showDetailsModal(books[0].id);
      if (target === 'search') Search.open();
      if (target === 'add') Library.showAddModal(books[0]);
      if (target === 'manual') Search.openManualEntry();
      if (target === 'progress') Library.showProgressModal(books[0].id);
      if (target === 'kindle') document.querySelector('[data-action="open-kindle-import"]').click();
      if (target === 'whats-new') Utils.show(document.getElementById('whatsNewModal'));
      if (target === 'backup') {
        const { createExportPayload } = await import('./js/services/backupSerialization.js');
        const payload = createExportPayload({ books, profile: Storage.getProfile(), goals: Storage.getGoals(), activity: [] }, { version: 'fixture', exportedAt: '2026-10-12T12:00:00Z' });
        await Navigation.importDataFromFile(new File([JSON.stringify(payload)], 'fixture-backup.json', { type: 'application/json' }));
      }
      if (target === 'danger') Navigation.confirmDeleteLibraryData();
    }
    globalThis.integrationFixture = { Navigation, Library, books, Storage };
    Navigation.updateBadges();
  }, { window, theme, state });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function inspect(page) {
  return page.evaluate(() => {
    const shown = el => el && el.getClientRects().length && el.getBoundingClientRect().right > 0 && el.getBoundingClientRect().left < innerWidth && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden], [inert]');
    const rgba = value => {
      const channels = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
      if (value.startsWith('color(srgb ')) channels.splice(0, 3, ...channels.slice(0, 3).map(channel => channel * 255));
      return channels;
    };
    const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
    const luminance = rgb => rgb.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const contrast = [];
    for (const el of document.querySelectorAll('#mainContent *, .sidebar *, .mobile-topbar *, .mobile-bottom-nav *, [role="dialog"] *')) {
      if (!shown(el) || el.matches(':disabled, [aria-disabled="true"]') || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const s = getComputedStyle(el);
      const foreground = rgba(s.color);
      let background = [255, 255, 255];
      const chain = []; for (let p = el; p; p = p.parentElement) chain.unshift(p);
      chain.forEach(p => { background = blend(rgba(getComputedStyle(p).backgroundColor), background); });
      const a = luminance(blend(foreground, background)), b = luminance(background);
      const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
      const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && parseInt(s.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) contrast.push(`${el.tagName}.${el.className}: ${ratio.toFixed(2)} (${el.textContent.trim().slice(0, 42)})`);
    }
    const navs = ['.sidebar', '.mobile-topbar', '.mobile-bottom-nav'].filter(selector => shown(document.querySelector(selector)));
    const visibleDialog = [...document.querySelectorAll('[role="dialog"]')].find(el => shown(el));
    const content = document.getElementById('mainContent').getBoundingClientRect();
    return { navigation: document.body.dataset.navigation, route: document.body.dataset.route,
      rootOverflow: document.documentElement.scrollWidth > innerWidth,
      content: { x: content.x, y: content.y, width: content.width }, navs,
      dialog: visibleDialog?.id || null, contrast,
      images: [...document.querySelectorAll('img')].filter(shown).filter(img => !img.complete || !img.naturalWidth).map(img => img.src),
      hubs: [...document.querySelectorAll('.nav-hub > summary')].map(el => el.textContent.trim()),
      badges: ['badge-library', 'badge-reading', 'badge-wishlist', 'badge-finished'].map(id => Boolean(document.getElementById(id))),
      bottom: getComputedStyle(document.querySelector('.mobile-bottom-nav')).position,
    };
  });
}

try {
  for (const [variant, width, theme, solid, state] of [
    ['desktop-dark', 1440, 'dark', false, 'ready'], ['mobile-dark', 390, 'dark', false, 'ready'],
    ['desktop-light', 1440, 'light', false, 'ready'], ['mobile-light', 390, 'light', false, 'ready'],
    ['desktop-solid', 1440, 'dark', true, 'ready'], ['mobile-light-solid', 390, 'light', true, 'ready'],
    ['narrow-empty', 320, 'dark', true, 'empty'], ['tablet-long', 1024, 'dark', false, 'long'],
    ['mobile-error', 390, 'dark', false, 'error'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    if (solid) await (await context.newCDPSession(page)).send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const window of [...routes, ...overlays]) {
      if (process.env.LIBRIQ_INTEGRATION_WINDOWS && !process.env.LIBRIQ_INTEGRATION_WINDOWS.split(',').includes(window)) continue;
      await render(page, window, theme, state);
      if (routes.includes(window)) await page.waitForFunction(({ window, width }) => {
        const top = width > 768 && ['library', 'recommendations', 'settings', 'help'].includes(window);
        const x = width > 768 && !top ? window === 'profile' ? 208 : window === 'activity' ? 224 : ['reading', 'wishlist', 'finished', 'favorites', 'abandoned'].includes(window) ? 232 : 240 : 0;
        return document.getElementById('mainContent').getBoundingClientRect().x === x;
      }, { window, width }, { timeout: 5000 });
      const result = await inspect(page);
      const name = `${window}-${variant}`;
      const modalWindow = ['details', 'search', 'add', 'manual', 'progress', 'kindle', 'whats-new', 'backup', 'danger', 'session-fallback'].includes(window);
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: !modalWindow });
      assert.deepEqual(errors, [], `${name}: script errors`);
      assert.equal(result.rootOverflow, false, `${name}: document overflow`);
      assert.deepEqual(result.images, [], `${name}: images load`);
      assert.deepEqual(result.contrast, [], `${name}: normal text AA`);
      assert.deepEqual(result.hubs, ['Library', 'Insights', 'Discover', 'Account']);
      assert.ok(result.badges.every(Boolean));
      if (routes.includes(window)) {
        const top = width > 768 && ['library', 'recommendations', 'settings', 'help'].includes(window);
        assert.equal(result.navigation, top ? 'top' : 'side', name);
        assert.deepEqual(result.navs, width > 768 ? ['.sidebar'] : ['.mobile-topbar', '.mobile-bottom-nav'], `${name}: no duplicate chrome`);
        assert.equal(result.content.x, width > 768 && !top ? window === 'profile' ? 208 : window === 'activity' ? 224 : ['reading', 'wishlist', 'finished', 'favorites'].includes(window) ? 232 : 240 : 0, `${name}: source gutter`);
        if (width <= 768) assert.equal(result.bottom, 'fixed');
      }
      if (window === 'library' && variant === 'desktop-dark') {
        const summary = page.locator('.nav-hub > summary').first();
        await summary.focus(); await page.keyboard.press('Enter');
        assert.equal(await page.locator('.nav-hub').first().getAttribute('open'), '');
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.nav-hub').first().getAttribute('open'), null);
        assert.ok(await summary.evaluate(el => el === document.activeElement));
        await summary.click(); await page.locator('.nav-hub > summary').nth(1).click();
        assert.equal(await page.locator('.nav-hub[open]').count(), 1);
        await page.locator('.page-title').click();
        assert.equal(await page.locator('.nav-hub[open]').count(), 0);
      }
      if (window === 'library' && variant === 'mobile-dark') {
        assert.ok(await page.locator('#sidebar').evaluate(el => el.inert));
        await page.locator('#mobileMenuBtn').click();
        assert.ok(await page.locator('#sidebar').evaluate(el => !el.inert && el.contains(document.activeElement)));
        await page.keyboard.press('Escape');
        assert.ok(await page.locator('#sidebar').evaluate(el => el.inert));
        assert.ok(await page.locator('#mobileMenuBtn').evaluate(el => el === document.activeElement));
        await page.locator('.mobile-bottom-item[data-page="stats"]').click();
        assert.equal(await page.locator('body').getAttribute('data-route'), 'stats');
        assert.equal(await page.locator('.mobile-bottom-item[data-page="stats"]').getAttribute('aria-current'), 'page');
        await page.locator('#mobileMenuBtn').click();
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForFunction(() => !document.getElementById('sidebar').classList.contains('open'));
        assert.equal(await page.locator('body').evaluate(el => el.style.overflow), '');
        assert.equal(await page.locator('#sidebarOverlay').evaluate(el => el.classList.contains('visible')), false);
        await page.setViewportSize({ width: 390, height: 900 });
        await page.waitForFunction(() => document.getElementById('sidebar').inert);
      }
      if (window === 'danger') { assert.equal(result.dialog, 'dangerConfirmModal'); await page.locator('#dangerConfirmCancel').click(); }
      if (['signin', 'signup', 'reset'].includes(window)) assert.equal(await page.locator('#emailAuthForm').getAttribute('data-auth-mode'), window === 'signup' ? 'signup' : window === 'reset' ? 'reset' : 'signin');
      if (window === 'session-fallback') assert.equal(result.dialog, 'sessionFallbackModal');
      if (window === 'backup') { assert.equal(result.dialog, 'backupImportModal'); await page.locator('#backupImportCancel').click(); }
      if (window === 'kindle') assert.equal(result.dialog, 'kindleImportModal');
      if (window === 'details') {
        assert.equal(result.dialog, 'bookDetailsModal');
        await page.locator('#bookQuoteTextInput').scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(output, `${name}-quotes-workspace.png`) });
        await page.locator('#bookDetailsModal').evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.screenshot({ path: path.join(output, `${name}-actions.png`) });
        await page.keyboard.press('Escape');
        assert.ok(await page.locator('#bookDetailsModal').evaluate(el => el.hidden));
      }
      results.push({ name, ...result, verification: designed.has(window) ? 'designed' : 'inherited layout only' });
      console.log(`${name}: passed${!designed.has(window) && result.contrast.length ? ` (${result.contrast.length} inherited contrast gaps)` : ''}`);
    }
    await context.close();
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
