import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { chromium } from 'playwright';

const root = path.resolve('frontend');
const output = path.resolve(process.env.LIBRIQ_QUOTES_KINDLE_ARTIFACTS || path.join(os.tmpdir(), 'libriq-quotes-kindle-design'));
const cssFiles = ['css/features/quotes.css', 'css/features/kindle-import.css'];
const html = (await fs.readFile(path.join(root, 'index.html'), 'utf8'))
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '')
  .replace('</head>', `${cssFiles.map(file => `<link rel="stylesheet" href="${file}" />`).join('')}\n</head>`);
for (const file of cssFiles) {
  const source = await fs.readFile(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, /--gold|#(?:D4A853|c9a84c|8B7355)/i, `${file}: semantic cool palette`);
  for (const [, asset] of source.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) await fs.access(path.resolve(root, path.dirname(file), asset));
  assert.match(source, /prefers-reduced-motion/);
  assert.match(source, /prefers-reduced-transparency/);
  assert.match(source, /@supports not/);
}
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return res.writeHead(403).end();
  try {
    const body = pathname === '/' ? html : await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json' }[path.extname(file)] || 'text/html' }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch();
const results = [];
const clippings = [
  'The Left Hand of Darkness (Ursula K. Le Guin)\n- Your Highlight on page 12 | Location 121-125 | Added on Monday, October 12, 2026\n\nThe only thing that makes life possible is permanent, intolerable uncertainty.\n==========',
  'The Left Hand of Darkness (Ursula K. Le Guin)\n- Your Note on page 14 | Location 140 | Added on Monday, October 12, 2026\n\nReturn to this passage after the final chapter.\n==========',
  'A Wizard of Earthsea (Ursula K. Le Guin)\n- Your Highlight on page 29 | Location 291 | Added on Monday, October 12, 2026\n\nTo hear, one must be silent.\n==========',
].join('\n');

async function fixture(page, theme, state) {
  await page.evaluate(async ({ theme, state }) => {
    document.documentElement.dataset.theme = theme;
    document.body.classList.remove('auth-booting', 'auth-signed-out');
    const { createQuotesPage } = await import('./js/features/quotes/quotesPage.js');
    const { createKindleImportPage } = await import('./js/features/kindleImport/kindleImportPage.js');
    const { parseKindleClippings } = await import('./js/services/kindleClippingsParser.js');
    const { createKindleImportService } = await import('./js/services/kindleImportService.js');
    const { createKindleQuoteImport } = await import('./js/services/kindleQuoteImport.js');
    const { applyNavigationChrome } = await import('./js/navigationChrome.js');
    const long = state === 'long';
    const passage = 'The only thing that makes life possible is permanent, intolerable uncertainty.';
    const books = [{ id: 'fixture-book', title: long ? 'A very long book title — café 日本語 '.repeat(6) : 'The Left Hand of Darkness', author: long ? 'An author with a deliberately lengthy name '.repeat(4) : 'Ursula K. Le Guin', quotes: [
      { id: 'manual', text: long ? `${'A passage saved for another day, with space to think and room to return.\n'.repeat(12)}${'UnbrokenText'.repeat(20)}` : 'It is good to have an end to journey toward; but it is the journey that matters, in the end.', note: long ? 'A long private reflection, with a second line.\n'.repeat(8) : 'A reminder to enjoy the pages between the beginning and the end.', page: 0 },
      { id: 'highlight', text: passage, note: '', page: 121, location: '121–125', source: 'kindle' },
      { id: 'note', text: '', note: 'Return to this passage after the final chapter.', page: 140, source: 'kindle' },
    ] }];
    const library = state === 'empty' ? [] : books;
    const calls = { copied: [], downloaded: [], opened: [], toasts: [], cancelled: 0, imports: 0 };
    const utils = {
      sanitize: value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]),
      toast: (message, type) => { calls.toasts.push({ message, type }); document.getElementById('fixtureFeedback').textContent = message; document.getElementById('fixtureFeedback').hidden = false; },
    };
    const feedback = document.createElement('p');
    feedback.id = 'fixtureFeedback';
    feedback.setAttribute('role', 'status');
    feedback.style.cssText = 'color:var(--text-strong);background:var(--glass-solid-2);position:fixed;bottom:96px;right:16px;max-width:calc(100% - 32px);padding:12px;border-radius:12px;z-index:999';
    feedback.hidden = true;
    document.body.append(feedback);
    const render = createQuotesPage({ storage: { getBooks: () => library }, utils,
      clipboard: { writeText: async text => { if (state === 'error') throw new Error('Fixture clipboard denied'); calls.copied.push(text); } },
      downloadMarkdown: async detail => calls.downloaded.push(detail),
      actions: { showBookDetails: id => calls.opened.push(id) },
    });
    applyNavigationChrome('quotes');
    document.querySelectorAll('[data-page]').forEach(el => { el.classList.toggle('active', el.dataset.page === 'quotes'); });
    document.getElementById('badge-library').textContent = String(library.length);
    render();
    const dependencies = { createBook: book => book, createId: () => crypto.randomUUID(), now: () => '2026-10-12T12:00:00Z' };
    const service = createKindleImportService(dependencies);
    const quoteImport = createKindleQuoteImport(dependencies);
    const kindle = createKindleImportPage({ parseClippings: parseKindleClippings, buildImportPlan: service.buildImportPlan, applyKindleImportPlan: quoteImport.applyKindleImportPlan,
      actions: {
        getExistingBooks: () => books,
        cancel: () => { calls.cancelled += 1; },
        continueImport: async () => {
          calls.imports += 1;
          if (state === 'importing') return new Promise(resolve => { globalThis.settleFixtureImport = resolve; });
          if (state === 'execution-error') throw new Error('Fixture import failed');
          utils.toast('Kindle import complete: 1 books created, 1 books matched, 1 quotes imported, 2 duplicates skipped.', 'success');
          feedback.hidden = false;
          return { booksCreated: 1, booksMatched: 1, quotesImported: 1, duplicatesSkipped: 2 };
        },
      },
    });
    const trigger = document.createElement('button');
    trigger.id = 'fixtureKindleTrigger';
    trigger.type = 'button';
    trigger.textContent = 'Import Kindle Clippings';
    trigger.style.cssText = 'min-height:44px;color:var(--text-body);background:var(--glass-solid-2);border:1px solid var(--glass-border);border-radius:12px;padding:12px';
    trigger.addEventListener('click', () => kindle.open());
    document.getElementById('quotesPage').append(trigger);
    globalThis.scopedFixture = { render, kindle, calls, books };
  }, { theme, state });
  await page.evaluate(() => document.fonts.ready);
}

async function inspect(page, scope) {
  return page.evaluate(scope => {
    const element = document.querySelector(scope);
    const shown = el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[hidden], [inert]');
    const rgba = color => { const channels = color.match(/[\d.]+/g)?.map(Number) || [0, 0, 0, 0]; if (color.startsWith('color(srgb ')) channels.splice(0, 3, ...channels.slice(0, 3).map(v => v * 255)); return channels; };
    const blend = (fg, bg) => fg.slice(0, 3).map((v, i) => v * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
    const luminance = rgb => rgb.map(v => { const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }).reduce((n, v, i) => n + v * [.2126, .7152, .0722][i], 0);
    const contrast = [];
    const overflow = [];
    const targets = [];
    for (const el of [element, ...element.querySelectorAll('*')]) {
      if (!shown(el)) continue;
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.right > innerWidth + 1 || rect.left < -1) overflow.push(`${el.tagName}.${el.className}`);
      if (el.matches('button, input') && rect.height < 44) targets.push(`${el.tagName}.${el.className}: ${rect.height}`);
      if (el.matches(':disabled')) continue;
      let background = [255, 255, 255];
      const chain = []; for (let p = el; p; p = p.parentElement) chain.unshift(p);
      chain.forEach(p => { background = blend(rgba(getComputedStyle(p).backgroundColor), background); });
      const check = (color, label, large = false) => {
        const a = luminance(blend(rgba(color), background)), b = luminance(background);
        const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        if (ratio < (large ? 3 : 4.5)) contrast.push(`${label}: ${ratio.toFixed(2)}`);
      };
      if ([...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
        const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && parseInt(style.fontWeight) >= 700);
        check(style.color, `${el.tagName}.${el.className}: ${el.textContent.trim().slice(0, 50)}`, large);
      }
      if (el.matches('input[placeholder]')) check(getComputedStyle(el, '::placeholder').color, `${el.id} placeholder`);
    }
    return { contrast, overflow, targets, rootOverflow: document.documentElement.scrollWidth > innerWidth, missingImages: [...document.images].filter(shown).filter(img => !img.complete || !img.naturalWidth).map(img => img.src), footerVisible: scope === '#kindleImportModal' ? element.querySelector('.modal-footer').getBoundingClientRect().bottom <= innerHeight + 1 : true };
  }, scope);
}

async function capture(page, scope, name, errors, externalRequests, solid) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const inspection = await inspect(page, scope);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: scope === '#quotesPage' });
  assert.deepEqual(errors, [], `${name}: script errors`);
  assert.deepEqual(externalRequests, [], `${name}: no live account/provider requests`);
  assert.equal(inspection.rootOverflow, false, `${name}: root overflow`);
  assert.deepEqual(inspection.overflow, [], `${name}: unclipped width`);
  assert.deepEqual(inspection.contrast, [], `${name}: AA text and placeholders`);
  assert.deepEqual(inspection.targets, [], `${name}: 44px touch targets`);
  assert.deepEqual(inspection.missingImages, [], `${name}: local assets`);
  assert.equal(inspection.footerVisible, true, `${name}: reachable fixed footer`);
  const css = await page.evaluate(scope => {
    const el = document.querySelector(scope === '#quotesPage' ? '#quotesPage .quotes-header' : '#kindleImportModal .kindle-import-panel');
    const s = getComputedStyle(el);
    return { blur: s.backdropFilter, fill: s.backgroundColor, animation: s.animationName };
  }, scope);
  if (solid) assert.equal(css.blur, 'none', `${name}: opaque zero-blur fallback`);
  assert.equal(css.animation, 'none', `${name}: reduced motion`);
  results.push({ name, ...inspection, css });
  console.log(`${name}: passed`);
}

try {
  for (const [variant, width, theme, solid, unsupported] of [
    ['desktop-dark', 1440, 'dark', false, false], ['mobile-dark', 390, 'dark', false, false],
    ['desktop-light', 1440, 'light', false, false], ['mobile-light', 390, 'light', false, false],
    ['desktop-solid', 1440, 'dark', true, false], ['narrow-light-solid', 320, 'light', true, false],
    ['narrow-dark', 320, 'dark', false, false], ['desktop-unsupported', 1440, 'light', true, true],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 900 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    if (unsupported) {
      await context.route('**/*.css', async route => {
        const response = await route.fetch();
        const css = (await response.text()).replace(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/g, '@supports (display: block)');
        await route.fulfill({ response, body: css });
      });
    }
    const page = await context.newPage();
    const errors = [], externalRequests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (new URL(request.url()).hostname !== '127.0.0.1') externalRequests.push(request.url()); });
    if (solid && !unsupported) await (await context.newCDPSession(page)).send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    const reset = async state => { await page.goto(`http://127.0.0.1:${server.address().port}`); await fixture(page, theme, state); };
    for (const state of ['ready', 'empty', 'no-match', 'long', 'error']) {
      await reset(state);
      if (state === 'no-match') await page.locator('#quotesSearchInput').fill('this query cannot match any fixture');
      if (state === 'error') {
        await page.locator('[data-action="copy-quote"]').first().click();
        await page.waitForFunction(() => scopedFixture.calls.toasts.length === 1);
        assert.equal(await page.evaluate(() => scopedFixture.calls.toasts[0].type), 'error');
      }
      await capture(page, '#quotesPage', `quotes-${state}-${variant}`, errors, externalRequests, solid);
      if (state === 'ready') {
        for (const [filter, count] of [['manual', 1], ['kindle-highlights', 1], ['kindle-notes', 1], ['all', 3]]) {
          await page.locator(`[data-filter="${filter}"]`).click();
          assert.equal(await page.locator('.quote-list-item').count(), count);
          assert.equal(await page.locator(`[data-filter="${filter}"]`).getAttribute('aria-pressed'), 'true');
        }
        await page.locator('#quotesSearchInput').fill('uncertainty');
        assert.equal(await page.locator('.quote-list-item').count(), 1);
        await page.locator('[data-action="clear-quotes-search"]').click();
        assert.equal(await page.locator('.quote-list-item').count(), 3);
        assert.ok(await page.locator('#quotesSearchInput').evaluate(el => el === document.activeElement));
        for (const action of ['copy-quote', 'copy-quote-citation', 'export-quote-markdown', 'open-quote-book']) await page.locator(`[data-action="${action}"]`).first().click();
        await page.waitForFunction(() => scopedFixture.calls.downloaded.length === 1);
        const calls = await page.evaluate(() => scopedFixture.calls);
        assert.equal(calls.copied.length, 2);
        assert.match(calls.copied[1], /— Ursula K\. Le Guin, The Left Hand of Darkness, p\. 0/);
        assert.match(calls.downloaded[0].text, /Book: The Left Hand of Darkness/);
        assert.deepEqual(calls.opened, ['fixture-book']);
      }
    }
    for (const state of ['initial', 'preview', 'empty', 'invalid', 'unreadable', 'reading', 'long', 'execution-error', 'importing', 'result']) {
      await reset(state === 'long' ? 'kindle-long' : state);
      await page.locator('#fixtureKindleTrigger').click();
      await page.waitForFunction(() => document.activeElement?.matches('.kindle-import-footer [data-action="cancel-kindle-import"]'));
      assert.equal(await page.locator('#continueKindleImport').isDisabled(), true);
      assert.equal(await page.locator('#app').evaluate(el => el.inert), true);
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      if (['reading', 'unreadable'].includes(state)) {
        await page.evaluate(state => {
          const input = document.getElementById('kindleClippingsInput');
          const file = { name: 'My Clippings.txt', text: () => state === 'unreadable' ? Promise.reject(new Error('Fixture unreadable file')) : new Promise(resolve => { globalThis.settleFixtureRead = resolve; }) };
          Object.defineProperty(input, 'files', { configurable: true, value: [file] });
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }, state);
      } else if (state !== 'initial') {
        await page.locator('#kindleClippingsInput').setInputFiles({ name: state === 'long' ? `${'Very-long-file-name-日本語-'.repeat(8)}My Clippings.txt` : 'My Clippings.txt', mimeType: 'text/plain', buffer: Buffer.from(state === 'empty' ? ' ' : state === 'invalid' ? 'not kindle clippings' : clippings) });
      }
      if (['preview', 'long', 'execution-error', 'importing', 'result'].includes(state)) {
        await page.waitForSelector('#kindleImportSummary');
        assert.equal(await page.locator('#continueKindleImport').isEnabled(), true);
        assert.deepEqual(await page.locator('.kindle-preview-stat dd').allTextContents(), ['1', '1', '2', '1', '1', '2']);
        assert.equal(await page.evaluate(() => scopedFixture.books[0].quotes.length), 3, 'preview does not mutate books');
      }
      if (['execution-error', 'importing', 'result'].includes(state)) await page.locator('#continueKindleImport').click();
      if (state === 'execution-error') { await page.waitForSelector('#kindleImportError'); assert.equal(await page.locator('#continueKindleImport').isEnabled(), true); }
      if (state === 'importing') {
        assert.equal(await page.locator('#continueKindleImport').isDisabled(), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#kindleImportModal').isVisible(), true, 'cannot dismiss mid-import');
      }
      if (['empty', 'invalid', 'unreadable', 'reading', 'initial'].includes(state)) assert.equal(await page.locator('#continueKindleImport').isDisabled(), true);
      if (state === 'result') {
        await page.waitForFunction(() => document.getElementById('kindleImportModal').hidden);
        assert.equal(await page.locator('#fixtureFeedback').isVisible(), true);
        assert.match(await page.locator('#fixtureFeedback').textContent(), /1 quotes imported, 2 duplicates skipped/);
        assert.equal(await page.evaluate(() => scopedFixture.calls.imports), 1);
        await capture(page, '#quotesPage', `kindle-result-${variant}`, errors, externalRequests, solid);
      } else {
        await capture(page, '#kindleImportModal', `kindle-${state}-${variant}`, errors, externalRequests, solid);
        if (state === 'initial') {
          await page.locator('.kindle-import-footer [data-action="cancel-kindle-import"]').focus();
          await page.keyboard.press('Tab');
          assert.ok(await page.locator('.modal-close[data-action="cancel-kindle-import"]').evaluate(el => el === document.activeElement), 'Tab wraps inside dialog');
          await page.keyboard.press('Shift+Tab');
          assert.ok(await page.locator('.kindle-import-footer [data-action="cancel-kindle-import"]').evaluate(el => el === document.activeElement), 'Shift+Tab wraps inside dialog');
        }
        if (state !== 'importing') {
          await page.keyboard.press('Escape');
          await page.waitForFunction(() => document.activeElement?.id === 'fixtureKindleTrigger');
          assert.equal(await page.locator('#app').evaluate(el => el.inert), false);
          assert.equal(await page.evaluate(() => scopedFixture.kindle.getPreview()), null);
        } else await page.evaluate(() => scopedFixture.kindle.close());
      }
    }
    await context.close();
  }
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.log(`Quotes and Kindle design tests passed: ${results.length} state/viewport/theme renders. Artifacts: ${output}`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
