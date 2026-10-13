import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve(process.env.LIBRIQ_SESSION_ARTIFACTS || path.join(os.tmpdir(), 'libriq-session-design'));
const source = await fs.readFile(path.join(root, 'js/navigation.js'), 'utf8');
const sessionCSS = await fs.readFile(path.join(root, 'css/features/session.css'), 'utf8');
const backupMarkup = source.match(/card\.id = 'newDeviceCloudPrompt';\s*card\.innerHTML = `([\s\S]*?)`;/)?.[1];
assert.ok(backupMarkup, 'Backup fixture uses the exact production presentation');
assert.doesNotMatch(sessionCSS, /--gold|rgba\(200,\s*148|rgba\(245,\s*158/);
for (const [, url] of sessionCSS.matchAll(/url\(['"]?([^)'" ]+)/g)) {
  await fs.access(path.resolve(root, 'css/features', url));
}
const html = (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace('</head>', '<link rel="stylesheet" href="css/features/session.css"></head>');
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

async function render(page, target, theme) {
  await page.evaluate(async ({ target, theme, backupMarkup }) => {
    document.documentElement.dataset.theme = theme;
    const { Storage } = await import('./js/storage.js');
    const { BookAPI } = await import('./js/api/index.js');
    const { Utils } = await import('./js/utils.js');
    const { LibriqFirebase } = await import('./js/firebase-client.js');
    const { LibriqCloudBackup } = await import('./js/cloudBackup.js');
    const user = { uid: 'session-design-fixture', displayName: 'A reader with a wonderfully long name 日本語 café '.repeat(3), email: 'reader@example.test', providerData: [{ providerId: 'password' }] };
    const auth = { initialized: true, available: true, ready: true, user: null, signedOutConfirmed: true, restoringSession: false };
    const state = { calls: [], auth, user, discovery: 'results' };
    Object.assign(LibriqFirebase, {
      getState: () => auth, getCurrentUser: () => auth.user, hasFirestore: () => false, onChange: () => () => {},
      getSessionContext: () => ({ isInAppBrowser: target === 'embedded', hasBrowserHelp: false }),
      signInWithGoogle: async () => { state.calls.push('google'); throw new Error('Fixture only: no OAuth'); },
      signInWithEmail: async () => {
        state.calls.push('signin');
        if (target === 'auth-submitting') return new Promise(resolve => { state.resolveAuth = resolve; });
        const code = target === 'network-fallback' ? 'auth/network-request-failed' : 'auth/invalid-credential';
        throw Object.assign(new Error('Isolated fixture auth error'), { code });
      },
      createAccountWithEmail: async () => { state.calls.push('signup'); throw Object.assign(new Error('Fixture account exists'), { code: 'auth/email-already-in-use' }); },
      sendPasswordResetToEmail: async () => { state.calls.push('reset'); },
      signOut: async () => { state.calls.push('signout'); auth.user = null; },
    });
    Object.assign(LibriqCloudBackup, { refresh() {}, getState: () => ({ available: false, status: 'idle' }) });
    globalThis.LibriqSyncBeta = { refresh() {}, getState: () => ({ enabled: false, status: 'off' }), pauseForOffline() { state.calls.push('pause-offline'); } };
    Object.assign(BookAPI, {
      searchBooks: async () => {
        state.calls.push('search');
        if (target === 'discovery-loading') return new Promise(() => {});
        if (target === 'discovery-error') throw new Error('Isolated fixture provider unavailable');
        if (target === 'discovery-empty') return [];
        return [{ title: target === 'discovery-long' ? 'The Long Chapter 日本語 café — '.repeat(12) : 'Project Hail Mary', author: target === 'discovery-long' ? 'A very long author name '.repeat(8) : 'Andy Weir', pageCount: 496, year: 2021 }];
      },
    });
    Storage.saveBooks([]);
    Storage.saveProfile({ name: target === 'existing-account' ? user.displayName : 'Fixture Reader', theme });
    const { Navigation } = await import('./js/navigation.js');
    state.Navigation = Navigation;
    globalThis.sessionDesignFixture = state;
    Navigation.init();
    // Production predicates remain intact. Dormant account markup is deliberately
    // exercised only in this isolated renderer, never in the production bootstrap.
    state.signedInSuppressed = !Navigation.shouldRenderSessionScreen({ ...auth, user });
    state.restoringSuppressed = !Navigation.shouldRenderSessionScreen({ ...auth, restoringSession: true });
    if (target === 'existing-account') {
      auth.user = user; auth.signedOutConfirmed = false;
      Navigation.setSessionPreference('offline');
      Navigation.shouldRenderSessionScreen = () => true;
    }
    if (['boot', 'restoring'].includes(target)) {
      auth.ready = false; auth.restoringSession = target === 'restoring';
      Navigation.goTo('boot');
      return;
    }
    if (target === 'service-fallback') auth.available = false;
    Navigation.goTo('session');
    if (['signup', 'reset', 'reset-invalid', 'reset-sent'].includes(target)) Navigation.setEmailAuthMode(target === 'signup' ? 'signup' : 'reset');
    if (['invalid-credentials', 'auth-submitting', 'network-fallback'].includes(target)) {
      document.getElementById('sessionEmailInput').value = 'reader@example.test';
      document.getElementById('sessionPasswordInput').value = 'fixture-password';
      document.getElementById('emailAuthSubmit').focus();
      document.getElementById('emailAuthForm').requestSubmit();
    }
    if (['reset-invalid', 'reset-sent'].includes(target)) {
      document.getElementById('sessionResetEmailInput').value = target === 'reset-invalid' ? 'invalid' : 'reader@example.test';
      document.getElementById('sessionResetSubmit').click();
    }
    if (target.startsWith('discovery-')) document.querySelector('.session-demo-tag').click();
    if (target === 'backup-found') {
      // The existing opposing predicates make this callout dormant. Render only
      // its production markup; never read, restore, or dismiss a real backup.
      const card = document.createElement('div');
      card.id = 'newDeviceCloudPrompt'; card.className = 'session-backup-callout'; card.innerHTML = backupMarkup;
      document.querySelector('.session-hero').replaceWith(card);
    }
    if (target === 'install') {
      const { initInstallPrompt } = await import('./js/installPrompt.js');
      initInstallPrompt();
      const event = new Event('beforeinstallprompt', { cancelable: true });
      event.prompt = async () => { state.calls.push('install'); };
      window.dispatchEvent(event);
    }
  }, { target, theme, backupMarkup });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function inspect(page) {
  return page.evaluate(() => {
    const shown = el => Boolean(el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden], [inert]'));
    const rgba = value => {
      const channels = value.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0];
      if (value.startsWith('color(srgb ')) channels.splice(0, 3, ...channels.slice(0, 3).map(channel => channel * 255));
      return channels;
    };
    const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
    const luminance = rgb => rgb.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const contrast = [];
    const touch = [];
    const labels = [];
    const overflow = [];
    for (const el of document.querySelectorAll('.session-page *, .install-prompt *')) {
      if (!shown(el)) continue;
      const s = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.right > innerWidth + 1 || rect.left < -1) overflow.push(el.id || el.className);
      if (el.matches('button, a[href], input') && !el.disabled && (rect.height < 43 || rect.width < 43)) touch.push(`${el.id || el.className}: ${rect.width}×${rect.height}`);
      if (el.matches('input') && !el.labels?.length && !el.getAttribute('aria-label')) labels.push(el.id);
      if (el.matches(':disabled') || (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !el.matches('input'))) continue;
      let background = [255, 255, 255];
      const chain = []; for (let parent = el; parent; parent = parent.parentElement) chain.unshift(parent);
      chain.forEach(parent => { background = blend(rgba(getComputedStyle(parent).backgroundColor), background); });
      const check = (color, role) => {
        const a = luminance(blend(rgba(color), background)), b = luminance(background);
        const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && parseInt(s.fontWeight) >= 700);
        if (ratio < (large && role === 'text' ? 3 : 4.5)) contrast.push(`${el.id || el.className} ${role}: ${ratio.toFixed(2)}`);
      };
      check(s.color, 'text');
      if (el.matches('input[placeholder]')) check(getComputedStyle(el, '::placeholder').color, 'placeholder');
    }
    return {
      rootOverflow: document.documentElement.scrollWidth > innerWidth,
      contrast, touch, labels, overflow,
      images: [...document.images].filter(shown).filter(el => !el.complete || !el.naturalWidth).map(el => el.src),
      signedInSuppressed: sessionDesignFixture.signedInSuppressed,
      restoringSuppressed: sessionDesignFixture.restoringSuppressed,
      calls: [...sessionDesignFixture.calls],
      motion: [...document.querySelectorAll('.session-page *')].filter(shown).filter(el => getComputedStyle(el).animationName !== 'none').map(el => el.className),
    };
  });
}

try {
  const targets = ['signin', 'signup', 'reset', 'boot', 'restoring', 'embedded', 'existing-account', 'invalid-credentials', 'auth-submitting', 'reset-invalid', 'reset-sent', 'network-fallback', 'service-fallback', 'discovery-results', 'discovery-empty', 'discovery-error', 'discovery-loading', 'discovery-long', 'backup-found', 'install'];
  for (const [variant, width, theme, solid, noBackdrop] of [
    ['desktop-dark', 1440, 'dark', false], ['mobile-dark', 390, 'dark', false],
    ['desktop-light', 1440, 'light', false], ['mobile-light', 390, 'light', false],
    ['desktop-dark-solid', 1440, 'dark', true], ['desktop-light-solid', 1440, 'light', true],
    ['narrow-dark-solid', 320, 'dark', true], ['narrow-light-solid', 320, 'light', true],
    ['desktop-dark-no-backdrop', 1440, 'dark', false, true], ['mobile-light-no-backdrop', 390, 'light', false, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') return route.abort();
      if (noBackdrop && url.pathname.endsWith('/css/features/session.css')) {
        // Chromium supports backdrop-filter. Activate the exact production
        // fallback declarations to verify the unsupported-browser presentation.
        return route.fulfill({ contentType: 'text/css', body: sessionCSS.replace('@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))', '@supports (display: grid)') });
      }
      return route.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    if (solid) await (await context.newCDPSession(page)).send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    for (const target of targets) {
      if (process.env.LIBRIQ_SESSION_WINDOWS && !process.env.LIBRIQ_SESSION_WINDOWS.split(',').includes(target)) continue;
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await render(page, target, theme);
      const result = await inspect(page);
      const name = `${target}-${variant}`;
      await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: !['network-fallback', 'service-fallback', 'install'].includes(target) });
      assert.deepEqual(errors, [], `${name}: script errors`);
      assert.equal(result.rootOverflow, false, `${name}: document overflow`);
      assert.deepEqual(result.overflow, [], `${name}: unclipped controls/text`);
      assert.deepEqual(result.contrast, [], `${name}: text/placeholder AA`);
      assert.deepEqual(result.touch, [], `${name}: 44px controls`);
      assert.deepEqual(result.labels, [], `${name}: input labels`);
      assert.deepEqual(result.images, [], `${name}: local images loaded`);
      assert.deepEqual(result.motion, [], `${name}: reduced motion`);
      assert.equal(result.signedInSuppressed, true, `${name}: existing account gate preserved`);
      assert.equal(result.restoringSuppressed, true, `${name}: restoring gate preserved`);
      if (solid || noBackdrop) {
        for (const surface of await page.locator('.session-auth-panel, .session-boot-card, .session-backup-callout').all()) {
          assert.equal(await surface.evaluate(el => Number(getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.[3] ?? 1)), 1, `${name}: opaque fallback`);
          assert.equal(await surface.evaluate(el => getComputedStyle(el).backdropFilter), 'none', `${name}: no fallback blur`);
        }
      }
      if (target === 'signin') {
        assert.equal(await page.locator('#emailAuthForm').getAttribute('data-auth-mode'), 'signin');
        if (width < 768) assert.ok((await page.locator('.session-auth-panel').boundingBox()).y < (await page.locator('.session-copy').boundingBox()).y, `${name}: email before showcase`);
        assert.equal(await page.evaluate(() => Boolean(document.querySelector('.session-auth-panel').compareDocumentPosition(document.querySelector('.session-demo-showcase')) & Node.DOCUMENT_POSITION_FOLLOWING)), true, `${name}: auth precedes showcase in keyboard order`);
        await page.locator('#sessionSigninTab').focus(); await page.keyboard.press('ArrowRight');
        assert.equal(await page.locator('#emailAuthForm').getAttribute('data-auth-mode'), 'signup');
        assert.ok(await page.locator('#sessionSignupTab').evaluate(el => el === document.activeElement));
        await page.keyboard.press('Home');
        assert.equal(await page.locator('#emailAuthForm').getAttribute('data-auth-mode'), 'signin');
        await page.locator('#sessionEmailInput').fill('reader@example.test');
        await page.locator('#forgotPasswordLink').click();
        assert.equal(await page.locator('#sessionResetEmailInput').inputValue(), 'reader@example.test');
        assert.ok(await page.locator('#sessionResetEmailInput').evaluate(el => el === document.activeElement));
        await page.locator('#sessionResetBackBtn').click();
        assert.ok(await page.locator('#sessionEmailInput').evaluate(el => el === document.activeElement));
      }
      if (target === 'embedded') {
        assert.equal(await page.locator('#emailAuthForm').getAttribute('data-auth-mode'), 'signup');
        assert.equal(await page.locator('#googleSignInBtn').isDisabled(), true);
        assert.ok(await page.locator('.session-inapp-link').isVisible());
        assert.equal(result.calls.includes('google'), false);
      }
      if (target === 'signup') {
        assert.equal(await page.locator('#sessionPasswordInput').getAttribute('autocomplete'), 'new-password');
        assert.ok(await page.locator('#sessionPasswordHelp').isVisible());
        await page.locator('#sessionEmailInput').fill('reader@example.test');
        await page.locator('#sessionPasswordInput').fill('fixture-password');
        await page.locator('#emailAuthSubmit').click();
        await page.waitForFunction(() => !document.getElementById('sessionAuthError').hidden);
        assert.deepEqual(await page.evaluate(() => sessionDesignFixture.calls), ['signup']);
      }
      if (target === 'auth-submitting') {
        assert.equal(await page.locator('#emailAuthSubmit').isDisabled(), true);
        assert.equal(await page.locator('#emailAuthForm').getAttribute('aria-busy'), 'true');
        assert.match(await page.locator('#emailAuthSubmit').textContent(), /Signing you in/);
      }
      if (['reset-invalid', 'invalid-credentials'].includes(target)) assert.ok(await page.locator('#sessionAuthError').isVisible());
      if (target === 'reset-invalid') assert.deepEqual(result.calls, []);
      if (target === 'reset-sent') { assert.ok(await page.locator('#sessionAuthStatus').isVisible()); assert.deepEqual(result.calls, ['reset']); }
      if (['network-fallback', 'service-fallback'].includes(target)) {
        assert.ok(await page.locator('#sessionFallbackModal').isVisible());
        assert.match(await page.locator('#sessionFallbackTitle').textContent(), target === 'service-fallback' ? /Account services/ : /Connection/);
        assert.ok(await page.locator('#sessionFallbackClose').evaluate(el => el === document.activeElement), `${name}: safe dismissal focused`);
        await page.keyboard.press('Shift+Tab');
        assert.ok(await page.locator('#fallbackOfflineBtn').evaluate(el => el === document.activeElement));
        await page.keyboard.press('Tab');
        assert.ok(await page.locator('#sessionFallbackClose').evaluate(el => el === document.activeElement));
        await page.keyboard.press('Escape');
        assert.ok(await page.locator('#sessionFallbackModal').isHidden());
        assert.equal(await page.locator('.session-hero').evaluate(el => el.inert), false);
        assert.equal(await page.locator('body').evaluate(el => el.style.overflow), '');
        if (target === 'network-fallback') {
          await page.waitForFunction(() => document.activeElement === document.getElementById('emailAuthSubmit'));
        } else {
          await page.evaluate(() => sessionDesignFixture.Navigation.goTo('session'));
          assert.ok(await page.locator('#sessionFallbackModal').isVisible());
          await page.keyboard.press('Escape');
          assert.equal(await page.locator('body').evaluate(el => el.style.overflow), '', `${name}: rerender releases previous dialog lock`);
        }
        if (target === 'network-fallback') {
          await page.locator('#emailAuthSubmit').click();
          await page.waitForFunction(() => !document.getElementById('sessionFallbackModal').hidden);
          await page.evaluate(() => {
            sessionDesignFixture.auth.user = sessionDesignFixture.user;
            sessionDesignFixture.auth.signedOutConfirmed = false;
            window.dispatchEvent(new CustomEvent('libriq:auth-changed'));
          });
          assert.equal(await page.evaluate(() => sessionDesignFixture.Navigation.currentPage), 'dashboard');
          assert.equal(await page.locator('body').evaluate(el => el.style.overflow), '', `${name}: account transition releases dialog lock`);
          assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
        }
      }
      if (target === 'discovery-results') {
        await page.locator('.session-demo-save-btn').click();
        assert.equal(await page.locator('#emailAuthForm').getAttribute('data-auth-mode'), 'signup');
        assert.ok(await page.locator('#sessionEmailInput').evaluate(el => el === document.activeElement));
        assert.equal(await page.evaluate(() => sessionDesignFixture.Navigation.currentPage), 'session');
      }
      if (target === 'discovery-empty') assert.match(await page.locator('#sessionDemoResults').textContent(), /No books found/);
      if (target === 'discovery-error') assert.match(await page.locator('#sessionDemoResults').textContent(), /unavailable/);
      if (target === 'discovery-loading') assert.ok(await page.locator('#sessionDemoSpinner').isVisible());
      if (target === 'existing-account') {
        assert.match(await page.locator('#googleContinueBtn').textContent(), /Continue as/);
        await page.locator('#switchAccountBtn').click();
        assert.deepEqual(await page.evaluate(() => sessionDesignFixture.calls), ['signout']);
      }
      if (target === 'backup-found') {
        assert.ok(await page.locator('#newDeviceCloudRestoreBtn').isVisible());
        assert.ok(await page.locator('#newDeviceCloudDismissBtn').isVisible());
        assert.deepEqual(result.calls, []);
      }
      if (target === 'install') {
        assert.ok(await page.locator('#installPrompt').isVisible());
        await page.locator('#installPromptDismiss').click();
        assert.ok(await page.locator('#installPrompt').isHidden());
        assert.equal(await page.evaluate(() => localStorage.getItem('libriq_install_prompt_dismissed')), '1');
        await page.evaluate(() => {
          localStorage.removeItem('libriq_install_prompt_dismissed');
          const event = new Event('beforeinstallprompt', { cancelable: true });
          event.prompt = async () => { sessionDesignFixture.calls.push('install'); };
          window.dispatchEvent(event);
        });
        await page.locator('#installPromptAction').click();
        assert.ok(await page.locator('#installPrompt').isHidden());
        assert.deepEqual(await page.evaluate(() => sessionDesignFixture.calls), ['install']);
      }
      results.push({ name, coverage: 'designed', ...result });
      console.log(`${name}: passed`);
    }
    await context.close();
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Session design: ${results.length} renders passed; screenshots in ${output}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
