import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve(process.env.LIBRIQ_SUPPORTING_ARTIFACTS || path.join(os.tmpdir(), 'libriq-supporting-pages'));
// Render only: the production bootstrap, auth and provider requests never run.
const html = (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace('class="auth-booting"', 'class="supporting-render-fixture"')
  .replace('</head>', '<link rel="stylesheet" href="css/features/profile.css"><link rel="stylesheet" href="css/features/library.css"><link rel="stylesheet" href="css/components/toast.css"></head>');
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
const variants = [
  ['desktop-dark', 1440, 'dark'], ['desktop-light', 1440, 'light'],
  ['mobile-dark', 390, 'dark'], ['mobile-light', 390, 'light'],
  ['desktop-solid', 1440, 'dark', 'solid'], ['mobile-light-solid', 390, 'light', 'solid'],
  ['narrow-long-dark', 320, 'dark', 'long'], ['mobile-long-light', 390, 'light', 'long'],
  ['mobile-empty', 390, 'dark', 'empty'], ['desktop-empty-light', 1440, 'light', 'empty'],
  ['desktop-unsupported', 1440, 'dark', 'unsupported'], ['mobile-light-unsupported', 320, 'light', 'unsupported'],
];

async function setup(page, feature, theme, state) {
  await page.evaluate(async ({ feature, theme, state }) => {
    document.documentElement.dataset.theme = theme;
    const { Utils } = await import('./js/utils.js');
    const empty = state === 'empty';
    const long = state === 'long';
    const profile = { name: long ? 'A'.repeat(40) : 'Fixture Reader', bio: long ? 'A reading life 日本語 café. '.repeat(10).slice(0, 200) : '' };
    const books = empty ? [] : Array.from({ length: 4 }, (_, i) => ({
      id: `set-aside-${i}`, title: long ? 'UnbrokenLongBookTitle'.repeat(12) : ['A story for another day', 'The unfinished chapter', 'A change of pace', 'Not quite my kind of book'][i],
      author: long ? 'A long author name with café 日本語 '.repeat(4) : 'Fixture Author', status: 'dnf',
      pageCount: i ? 320 : 0, currentPage: i * 12, tags: i ? [] : ['Owned'], genres: ['Fiction'],
      description: 'A fixture description.', dateAdded: '2026-10-12', publisher: 'Fixture', publishYear: 2020, language: 'en',
    }));
    const calls = [];
    const storage = {
      getProfile: () => profile, saveProfile: value => { Object.assign(profile, value); calls.push(['save', value]); },
      getStats: () => ({ total: books.length, finished: 0, totalPages: 0, avgRating: 0, ratedCount: 0 }),
      getStreak: () => ({ best: empty ? 0 : 12 }), getBooks: () => books,
      getBooksByStatus: status => books.filter(book => book.status === status), getBookById: id => books.find(book => book.id === id),
    };
    const user = { displayName: profile.name, email: long ? `${'long'.repeat(18)}@example.test` : 'reader@example.test', metadata: { creationTime: '2025-06-17' } };
    window.fixture = { calls, books, profile };
    if (feature === 'profile' || feature === 'toasts') {
      const { createProfilePage } = await import('./js/features/profile/profilePage.js');
      const render = createProfilePage({ storage, utils: Utils, actions: { getFirebaseState: () => ({ user }), profileSaved: () => calls.push('profile-saved') } });
      render();
      window.fixture.render = render;
    } else {
      const [{ createLibraryShelvesPage }, { Library }, { Storage }] = await Promise.all([
        import('./js/features/library/libraryShelvesPage.js'), import('./js/library.js'), import('./js/storage.js'),
      ]);
      Object.assign(Storage, storage);
      globalThis.Navigation = { updateBadges() {}, renderCurrentPage() {} };
      Object.assign(Library, {
        showDetailsModal: id => calls.push(['details', id]), toggleFavorite: id => { storage.getBookById(id).isFavorite = true; calls.push(['favorite', id]); },
        setStatus: (id, status) => calls.push(['status', id, status]), removeBook: id => calls.push(['remove-request', id]),
      });
      const shelves = createLibraryShelvesPage({ storage, library: Library, utils: Utils, actions: {
        navigate: target => calls.push(['navigate', target]), openSearch: () => calls.push('search'),
        openManualEntry: () => calls.push('manual'), importBackup: () => calls.push('import'),
      } });
      shelves.renderStatusPage('dnf');
      window.fixture.render = () => shelves.renderStatusPage('dnf');
    }
  }, { feature, theme, state });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
}

async function inspect(page, selector, { fallback = false, mobile = false } = {}) {
  const result = await page.evaluate(({ selector, fallback, mobile }) => {
    const root = document.querySelector(selector);
    const shown = el => el.getClientRects().length && !el.closest('[hidden], details:not([open]) > :not(summary)');
    const rgba = value => {
      const values = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
      if (value.startsWith('color(srgb ')) values.splice(0, 3, ...values.slice(0, 3).map(v => v * 255));
      return values;
    };
    const blend = (a, b) => a.slice(0, 3).map((v, i) => v * (a[3] ?? 1) + b[i] * (1 - (a[3] ?? 1)));
    const luminance = rgb => rgb.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const contrast = [];
    const overflow = [];
    const assets = new Set();
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (!shown(el)) continue;
      const bounds = el.getBoundingClientRect();
      if (bounds.right > innerWidth + 1 || bounds.left < -1) overflow.push(el.className || el.id);
      const css = getComputedStyle(el);
      const maskUrl = css.maskImage.match(/url\("([^"\n]+)"\)/)?.[1];
      if (maskUrl) assets.add(maskUrl);
      if (el.matches('img')) assets.add(el.src);
      const text = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (!text && !el.matches('input, textarea')) continue;
      let background = [255, 255, 255];
      const ancestors = []; for (let p = el; p; p = p.parentElement) ancestors.unshift(p);
      ancestors.forEach(p => { background = blend(rgba(getComputedStyle(p).backgroundColor), background); });
      const check = (color, role) => {
        const a = luminance(blend(rgba(color), background)), b = luminance(background);
        const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        const large = parseFloat(css.fontSize) >= 24 || (parseFloat(css.fontSize) >= 18.66 && parseInt(css.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) contrast.push(`${el.className || el.id} ${role}: ${ratio.toFixed(2)}`);
      };
      check(css.color, 'text');
      if (el.getAttribute('placeholder')) check(getComputedStyle(el, '::placeholder').color, 'placeholder');
    }
    const surfaces = [...root.querySelectorAll('.profile-editor, .book-card, .toast')].map(el => {
      const css = getComputedStyle(el);
      return { fill: css.backgroundColor, blur: css.backdropFilter };
    });
    return { overflow, contrast, assets: [...assets], surfaces, fallback, mobile, rootOverflow: document.documentElement.scrollWidth > innerWidth };
  }, { selector, fallback, mobile });
  assert.equal(result.rootOverflow, false, 'No document horizontal overflow');
  assert.deepEqual(result.overflow, [], 'No clipped content or actions');
  assert.deepEqual(result.contrast, [], 'WCAG AA visible text and placeholders');
  for (const asset of result.assets) assert.equal((await page.request.get(asset)).status(), 200, `Local asset: ${asset}`);
  for (const surface of result.surfaces) {
    if (fallback) assert.ok(surface.fill.startsWith('rgb('), 'Opaque fallback');
    if (fallback || mobile) assert.ok(!surface.blur || surface.blur === 'none', 'No mobile/fallback nested blur');
  }
  return result;
}

try {
  for (const feature of ['profile', 'dnf', 'toasts']) {
    for (const [variant, width, theme, state = 'ready'] of variants) {
      const name = `${feature}-${variant}`;
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1') return route.abort();
        if (state === 'unsupported' && url.pathname.endsWith('.css')) {
          const response = await route.fetch();
          return route.fulfill({ response, body: (await response.text()).replace(/(?:-webkit-)?backdrop-filter/g, 'unsupported-backdrop-filter') });
        }
        return route.continue();
      });
      if (state === 'solid') {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
      }
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await setup(page, feature, theme, state);
      const options = { fallback: ['solid', 'unsupported'].includes(state), mobile: width < 768 };
      if (feature === 'profile') {
        assert.equal(await page.locator('.profile-editor').getAttribute('open'), null);
        await inspect(page, '#profilePage', options);
        await page.screenshot({ path: path.join(output, `${name}-collapsed.png`), fullPage: true });
        const summary = page.locator('.profile-editor summary');
        await summary.focus();
        await page.keyboard.press('Enter');
        assert.notEqual(await page.locator('.profile-editor').getAttribute('open'), null);
        assert.equal(await page.locator('#profileName').getAttribute('maxlength'), '40');
        assert.equal(await page.locator('#profileBio').getAttribute('maxlength'), '200');
        await inspect(page, '#profilePage', options);
        await page.screenshot({ path: path.join(output, `${name}-expanded.png`), fullPage: true });
        await page.locator('#profileName').fill('Updated Reader');
        await page.locator('#profileBio').fill('Private reading notes.');
        await page.getByRole('button', { name: 'Save Profile' }).click();
        assert.deepEqual(await page.evaluate(() => window.fixture.profile), { name: 'Updated Reader', bio: 'Private reading notes.' });
        assert.equal(await page.locator('.toast-success').innerText(), 'Profile saved');
        await page.screenshot({ path: path.join(output, `${name}-saved.png`), fullPage: true });
        await page.locator('#profileBio').focus();
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('.profile-editor').getAttribute('open'), null);
        assert.ok(await summary.evaluate(el => el === document.activeElement));
      } else if (feature === 'dnf') {
        assert.equal(await page.locator('.page-title').innerText(), 'Abandoned');
        assert.equal(await page.locator('[data-status="dnf"]').getAttribute('aria-pressed'), 'true');
        if (state !== 'empty') assert.equal(await page.locator('.badge-dnf').first().innerText(), 'Did Not Finish');
        assert.equal(await page.locator('.book-card').count(), state === 'empty' ? 0 : 4);
        await inspect(page, '#statusPage', options);
        await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
        if (state !== 'empty') {
          await page.locator('.card-details-btn').first().click();
          await page.locator('.card-fav-btn').first().click();
          const disclosure = page.locator('.library-card-disclosure').first();
          await disclosure.locator('summary').click();
          await inspect(page, '#statusPage', options);
          await page.screenshot({ path: path.join(output, `${name}-actions.png`), fullPage: true });
          await disclosure.locator('[data-action="start-reading"]').click();
          await disclosure.locator('[data-action="remove-book"]').click();
          assert.deepEqual((await page.evaluate(() => window.fixture.calls)).slice(0, 4), [['details', 'set-aside-0'], ['favorite', 'set-aside-0'], ['status', 'set-aside-0', 'reading'], ['remove-request', 'set-aside-0']]);
        }
        await page.locator('#shelfSearchInput').fill('No matching title <日本語>');
        assert.ok(await page.getByText('No matches on this shelf').isVisible());
        await inspect(page, '#statusPage', options);
        await page.screenshot({ path: path.join(output, `${name}-no-match.png`), fullPage: true });
        await page.locator('.empty-state [data-action="clear-shelf-search"]').click();
        assert.equal(await page.locator('#shelfSearchInput').inputValue(), '');
        if (state !== 'empty') {
          await page.locator('#shelfShelfSelect').selectOption('Owned');
          assert.equal(await page.locator('.book-card').count(), 1);
          await page.locator('#shelfSortSelect').selectOption('title-az');
        }
        await page.locator('[data-status="reading"]').click();
        assert.deepEqual((await page.evaluate(() => window.fixture.calls)).at(-1), ['navigate', 'reading']);
      } else {
        assert.equal(await page.locator('#toastContainer').getAttribute('aria-live'), 'polite');
        await page.evaluate(async state => {
          const { Utils } = await import('./js/utils.js');
          for (const [type, message] of [['success', 'Profile saved.'], ['error', 'Could not save your changes. Please try again.'], ['warning', 'You’re offline. Changes will sync when you reconnect.'], ['info', 'Your private reading space is ready.']]) {
            Utils.toast(state === 'long' ? `${message} ${'A long message with café 日本語 and uninterruptedtext'.repeat(4)}` : message, type);
          }
        }, state);
        await inspect(page, '#toastContainer', options);
        const placement = await page.locator('#toastContainer').evaluate(el => ({ bottom: el.getBoundingClientRect().bottom, top: el.getBoundingClientRect().top, navTop: document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top }));
        if (width <= 768) assert.ok(placement.bottom <= placement.navTop - 8, 'Toasts clear the bottom navigation');
        assert.ok(placement.top >= 0, 'Toast stack stays on screen');
        assert.equal(await page.locator('.toast').count(), 4);
        await page.screenshot({ path: path.join(output, `${name}.png`) });
        await page.waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, { timeout: 6000 });
      }
      assert.deepEqual(errors, [], name);
      results.push({ name, passed: true, contrast: 'WCAG AA', fallback: options.fallback });
      console.log(`${name}: passed`);
      await context.close();
    }
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Supporting renderer checks passed; artifacts: ${output}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
