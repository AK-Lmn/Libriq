import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve(process.env.LIBRIQ_ACCOUNT_ARTIFACTS || path.join(os.tmpdir(), 'libriq-account-design'));
const html = (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace('class="auth-booting"', 'class="account-design-fixture"')
  .replace('</head>', '<link rel="stylesheet" href="css/features/profile.css"><link rel="stylesheet" href="css/features/help.css"></head>');
// Isolated render fixture: production authentication and shell files remain unchanged.
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
  try {
    const body = pathname === '/' ? html : await fs.readFile(file);
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
      '.html': 'text/html', '.woff2': 'font/woff2', '.png': 'image/png' }[path.extname(file)] || 'text/html';
    res.writeHead(200, { 'Content-Type': type }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
await fs.mkdir(output, { recursive: true });
let browser;
const results = [];
try {
  browser = await chromium.launch();
  for (const feature of ['settings', 'profile', 'help']) {
    for (const [variant, width, theme, state, solid] of [
      ['desktop-dark', 1440, 'dark', 'ready', false],
      ['mobile-dark', 390, 'dark', 'ready', false],
      ['desktop-light', 1440, 'light', 'ready', false],
      ['mobile-light', 390, 'light', 'ready', false],
      ['desktop-solid', 1440, 'dark', 'ready', true],
      ['mobile-light-solid', 390, 'light', 'ready', true],
      ['mobile-empty-solid', 390, 'dark', 'empty', true],
      ['narrow', 320, 'dark', 'ready', false],
      ['mobile-unavailable', 390, 'dark', 'unavailable', false],
      ['mobile-offline', 390, 'dark', 'offline', false],
    ]) {
      const name = `${feature}-${variant}`;
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(base);
      if (solid) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', { features: [
          { name: 'prefers-reduced-transparency', value: 'reduce' },
          { name: 'prefers-reduced-motion', value: 'reduce' },
        ] });
      }
      await page.evaluate(async ({ feature, theme, state }) => {
        document.documentElement.dataset.theme = theme;
        document.querySelectorAll('[data-page]').forEach(el => {
          const active = el.dataset.page === feature;
          el.classList.toggle('active', active);
          if (active) el.setAttribute('aria-current', 'page');
          else el.removeAttribute('aria-current');
        });
        const { Utils } = await import('./js/utils.js');
        const empty = state === 'empty';
        const user = { displayName: 'Fixture Reader', email: 'fixture@example.test', emailVerified: false,
          providerData: [{ providerId: 'password' }], metadata: { creationTime: '2025-06-17T12:00:00Z' } };
        const books = empty ? [] : Array.from({ length: 17 }, (_, i) => ({ id: `fixture-book-${i}` }));
        const storage = {
          getBooks: () => books,
          getProfile: () => ({ name: 'Fixture Reader', bio: 'A personal reading space.' }),
          getStats: () => ({ total: empty ? 0 : 17, finished: empty ? 0 : 11, finishedThisYear: empty ? 0 : 6,
            totalPages: empty ? 0 : 4170, avgRating: empty ? null : '4.2', ratedCount: empty ? 0 : 8 }),
          getStreak: () => ({ best: empty ? 0 : 15 }),
          getBackupMeta: () => ({ lastExportedAt: empty ? null : '2026-10-10T10:30:00Z' }),
          getCloudBackupMeta: () => ({ lastCloudBackupAt: empty ? null : '2026-10-10T10:45:00Z', bookCount: empty ? null : 17 }),
          getSyncReadiness: () => ({ syncReady: !empty, hasDeviceId: !empty, hasUpdatedAtCoverage: !empty,
            hasDeletedAtSupport: true, hasBackupMetadata: !empty }),
          saveProfile: profile => window.savedProfile = profile,
        };
        const call = value => () => window.fixtureCalls.push(value);
        window.fixtureCalls = [];
        const actions = {
          getActiveTheme: () => document.documentElement.dataset.theme,
          getFirebaseState: () => ({ initialized: true, available: state !== 'unavailable', user }),
          getCurrentUser: () => user,
          getUserEmailAuthInfo: () => ({ email: user.email, emailVerified: false, hasPasswordProvider: true, hasEmail: true, providerData: user.providerData }),
          getCloudBackupState: () => ({ status: state === 'offline' ? 'paused' : 'ready', message: state === 'offline' ? 'Backup paused while offline' : empty ? 'No cloud backup yet.' : 'Backup up to date', lastSavedAt: empty ? null : '2026-10-10T10:45:00Z' }),
          formatLastSavedLabel: () => 'Last backed up: October 10, 2026',
          hasFirestore: () => state !== 'unavailable',
          getSessionPreference: () => state === 'offline' ? 'offline' : 'account',
          getDisplayName: () => user.displayName,
          getSyncState: () => ({ enabled: state !== 'offline', status: 'ready', listenerAttached: state !== 'offline', deviceId: 'fixture-device', pendingBookIds: [], pendingDeleteIds: [], eligibilityAllowed: true, lastSyncedAt: empty ? null : '2026-10-10T10:45:00Z' }),
          toggleTheme: () => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; window.fixtureRender(); },
          openSearch: call('search'), navigate: page => window.fixtureCalls.push(page),
          confirmDeleteLibraryData: call('confirm-library'), confirmDeleteAccount: call('confirm-account'),
          backupToCloud: call('backup'), openCloudRestorePreview: call('restore-preview'), openCloudMergePreview: call('merge-preview'),
          exportData: call('export'), promptImportData: call('import'), openKindleImport: call('kindle'),
          refreshSync: call('refresh-sync'), toggleSync: call('toggle-sync'), accountAction: call('account'),
          sendVerification: call('verification'), refreshEmailStatus: call('email-status'), resetPassword: call('reset'),
          changeEmail: email => window.fixtureCalls.push(email),
        };
        const { [`create${feature[0].toUpperCase()}${feature.slice(1)}Page`]: createPage } = await import(`./js/features/${feature}/${feature}Page.js`);
        window.fixtureRender = createPage({ storage, utils: { ...Utils, toast: call('toast') }, actions, constants: { VERSION: '4.7.0' } });
        window.fixtureRender();
      }, { feature, theme, state });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle');
      const rootSelector = `#${feature}Page`;
      const geometry = await page.locator(rootSelector).evaluate((root, feature) => {
        const surface = root.querySelector(feature === 'settings' ? '.settings-panel' : feature === 'profile' ? '.profile-identity' : '.help-section');
        return {
          scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth,
          content: root.getBoundingClientRect().toJSON(),
          overflow: [...root.querySelectorAll('*')].filter(el => el.getClientRects().length && el.getBoundingClientRect().right > innerWidth + 1).map(el => el.className),
          assets: [...root.querySelectorAll('img')].filter(img => !img.complete || !img.naturalWidth).map(img => img.src),
          icons: [...root.querySelectorAll('img[src*="/account/"]')].filter(img => img.getClientRects().length).map(img => ({ url: img.src, natural: [img.naturalWidth, img.naturalHeight], rendered: [img.offsetWidth, img.offsetHeight] })),
          font: ['Inter', 'Lora', 'IBM Plex Mono'].every(font => document.fonts.check(`14px "${font}"`)),
          reduced: matchMedia('(prefers-reduced-transparency: reduce)').matches,
          fill: getComputedStyle(surface).backgroundColor, blur: getComputedStyle(surface).backdropFilter,
          animation: getComputedStyle(root).animationName,
          columns: feature === 'profile' ? getComputedStyle(root.querySelector('.profile-stats-grid')).gridTemplateColumns.split(' ').length : null,
        };
      }, feature);
      assert.deepEqual(errors, [], name);
      assert.equal(geometry.scroll, geometry.width, `${name}: no document overflow`);
      assert.deepEqual(geometry.overflow, [], `${name}: no clipped overflowing content`);
      assert.deepEqual(geometry.assets, [], `${name}: all local Figma assets loaded`);
      for (const icon of geometry.icons) {
        assert.ok(Math.abs(icon.rendered[0] / icon.rendered[1] - icon.natural[0] / icon.natural[1]) < 0.01, `${name}: asset aspect ratio ${icon.url}`);
        assert.ok(Math.abs(icon.rendered[0] - icon.natural[0]) < 1, `${name}: exported SVG width preserved ${icon.url}`);
      }
      assert.ok(geometry.font, `${name}: local fonts loaded`);
      if (feature === 'profile') assert.equal(geometry.columns, width >= 1101 ? 5 : 2);
      if (solid) {
        assert.ok(geometry.reduced);
        assert.ok(geometry.fill.startsWith('rgb('), `${name}: solid fallback (${geometry.fill})`);
        assert.equal(geometry.blur, 'none');
      }
      if (width < 768) assert.equal(geometry.blur, 'none', `${name}: mobile blur limited`);
      const failures = await page.locator(rootSelector).evaluate(root => {
        window.fixtureContrast = root => {
        const rgba = color => color.match(/[\d.]+/g).map(Number);
        const blend = (front, back) => front.slice(0, 3).map((v, i) => v * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
        const luminance = color => color.reduce((sum, value, i) => {
          const v = value / 255;
          return sum + (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
        }, 0);
        return [...root.querySelectorAll('*')].filter(el => el.getClientRects().length &&
          !el.closest('details:not([open]) > :not(summary)') && !el.closest(':disabled') &&
          [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())).flatMap(el => {
          let background = [255, 255, 255];
          const ancestors = [];
          for (let node = el; node; node = node.parentElement) ancestors.unshift(node);
          for (const node of ancestors) background = blend(rgba(getComputedStyle(node).backgroundColor), background);
          const foreground = blend(rgba(getComputedStyle(el).color), background);
          const levels = [luminance(background), luminance(foreground)].sort((a, b) => a - b);
          const ratio = (levels[1] + 0.05) / (levels[0] + 0.05);
          return ratio < 4.5 ? [`${el.className || el.tagName}: ${ratio.toFixed(2)}:1`] : [];
        });
        };
        return window.fixtureContrast(root);
      });
      assert.deepEqual(failures, [], `${name}: WCAG AA text contrast`);
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
      if (width < 768) {
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const footerClear = await page.locator(rootSelector).evaluate(root => root.querySelector('footer').getBoundingClientRect().bottom <= document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top);
        assert.ok(footerClear, `${name}: footer clear of sticky navigation`);
      }
      if (state === 'ready') {
        if (feature === 'settings') {
          await page.locator('[data-theme-choice="light"]').click();
          assert.equal(await page.locator('html').getAttribute('data-theme'), 'light');
          assert.equal(await page.locator('[data-theme-choice="light"]').getAttribute('aria-pressed'), 'true');
          for (const action of ['export-data', 'prompt-import', 'open-kindle-import', 'delete-library', 'delete-account', 'restore-cloud', 'merge-cloud']) {
            await page.locator(`[data-action="${action}"]`).click();
          }
          assert.deepEqual(await page.evaluate(() => window.fixtureCalls), ['export', 'import', 'kindle', 'confirm-library', 'confirm-account', 'restore-preview', 'merge-preview']);
        } else if (feature === 'profile') {
          await page.locator('.profile-editor summary').click();
          await page.locator('#profileName').fill('Updated Fixture');
          await page.locator('#profileBio').fill('Updated fixture biography');
          await page.locator('[data-action="save-profile"] button[type="submit"]').click();
          assert.deepEqual(await page.evaluate(() => window.savedProfile), { name: 'Updated Fixture', bio: 'Updated fixture biography' });
          assert.deepEqual(await page.locator(rootSelector).evaluate(root => window.fixtureContrast(root)), [], `${name}: expanded profile editor contrast`);
        } else {
          const section = page.locator('#help-section-1');
          await section.locator(':scope > summary').click();
          assert.equal(await section.getAttribute('open'), null);
          await section.locator(':scope > summary').click();
          assert.notEqual(await section.getAttribute('open'), null);
          await page.locator('[data-action="open-search"]').first().click();
          await page.locator('[data-action="open-library"]').last().click();
          assert.deepEqual(await page.evaluate(() => window.fixtureCalls), ['search', 'library']);
        }
      }
      results.push({ name, geometry, contrast: 'all visible normal text >=4.5:1', errors });
      console.log(`${name}: passed`);
      await context.close();
    }
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Account design checks passed; artifacts: ${output}`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
