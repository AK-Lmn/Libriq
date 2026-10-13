import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { render, inspect, server, browser, output } from './test-integration-design.mjs';

const results = [];
const url = `http://127.0.0.1:${server.address().port}`;
const variants = [[1440, 'dark', false], [1440, 'light', false], [390, 'dark', false], [390, 'light', false], [320, 'dark', true], [320, 'light', true]];
try {
  for (const [width, theme, solid] of variants) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
    await page.goto(url);
    if (solid) await (await context.newCDPSession(page)).send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
    const audit = async name => {
      const result = await inspect(page);
      assert.equal(result.rootOverflow, false, name);
      assert.deepEqual(result.contrast, [], name);
      assert.deepEqual(result.images, [], name);
      assert.deepEqual(result.badges, [true, true, true, true]);
      await page.screenshot({ path: path.join(output, `${name}-${width}-${theme}${solid ? '-solid' : ''}.png`), fullPage: !result.dialog });
      results.push({ name, width, theme, solid, ...result });
    };
    const settled = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const fingerprint = () => page.evaluate(() => JSON.stringify(integrationFixture.Storage.getBooks()));
    const closeConfirmation = async () => { await page.keyboard.press('Escape'); await settled(); assert.equal(await page.locator('#actionConfirmationModal').count(), 0); };

    await render(page, 'details', theme, 'ready');
    let original = await fingerprint();
    await page.locator('[data-details-action="destructive"]').click();
    assert.equal(await page.locator('#actionConfirmationCancel').evaluate(el => document.activeElement === el), true);
    await audit('remove-book-confirm');
    await closeConfirmation();
    assert.equal(await fingerprint(), original);
    assert.equal(await page.locator('[data-details-action="destructive"]').evaluate(el => document.activeElement === el), true);
    await page.locator('[data-quote-action="delete"]').click();
    await audit('delete-quote-confirm');
    await page.locator('#actionConfirmationCancel').click();
    await settled();
    assert.equal(await fingerprint(), original);
    assert.equal(await page.locator('[data-quote-action="delete"]').evaluate(el => document.activeElement === el), true);
    await page.keyboard.press('Escape');
    await settled();
    assert.equal(await page.locator('body > [inert]').count(), 0);
    await page.evaluate(() => { integrationFixture.pendingRemoval = integrationFixture.Library.removeBook('fixture-0', 'Fixture reading volume 1'); });
    await closeConfirmation();
    await page.evaluate(() => integrationFixture.pendingRemoval);
    assert.equal(await fingerprint(), original);

    for (const [action, phrase] of [['clear-local-cache', 'CLEAR CACHE'], ['delete-library', 'DELETE'], ['delete-account', 'DELETE ACCOUNT']]) {
      await render(page, 'settings', theme, 'ready');
      original = await fingerprint();
      if (action === 'clear-local-cache') await page.evaluate(() => { integrationFixture.pendingClear = integrationFixture.Navigation.clearLocalCache(); });
      else await page.locator(`[data-action="${action}"]`).click();
      assert.equal(await page.locator('#dangerConfirmCancel').evaluate(el => document.activeElement === el), true);
      assert.equal(await page.locator('#dangerConfirmAction').isDisabled(), true);
      await page.locator('#dangerConfirmInput').fill(phrase.toLowerCase());
      assert.equal(await page.locator('#dangerConfirmAction').isDisabled(), true);
      await page.locator('#dangerConfirmInput').fill(phrase);
      assert.equal(await page.locator('#dangerConfirmAction').isEnabled(), true);
      await audit(action);
      await page.keyboard.press('Escape');
      await settled();
      assert.equal(await fingerprint(), original);
      assert.equal(await page.locator('body > [inert]').count(), 0);
    }

    for (const mode of ['restore', 'merge']) {
      await render(page, 'settings', theme, 'ready');
      original = await fingerprint();
      await page.evaluate(async () => {
        const { LibriqFirebase } = await import('./js/firebase-client.js');
        const { LibriqCloudBackup } = await import('./js/cloudBackup.js');
        const { books, Storage, Navigation } = integrationFixture;
        const snapshot = { app: 'LibriQ', appVersion: 'fixture', backupVersion: 1, updatedAt: '2026-10-01T12:00:00Z', deviceId: 'fixture-device', data: { books: [{ ...books[0], id: 'cloud-only', title: 'A cloud-only book' }], profile: Storage.getProfile(), goals: Storage.getGoals(), activity: [] } };
        const fail = () => { throw new Error('Unexpected destructive/cloud write in cancellation fixture'); };
        Object.assign(LibriqFirebase, { hasFirestore: () => true, readBackupDoc: async () => ({ exists: () => true, data: () => snapshot }), setBackupDoc: fail, deleteCurrentUserLibraryData: fail, deleteCurrentUserAccount: fail });
        Object.assign(LibriqCloudBackup, { restore: fail, merge: fail });
        Navigation.renderCurrentPage();
      });
      for (const stage of [1, 2]) {
        await page.locator(`[data-action="${mode}-cloud"]`).click();
        await page.locator('#backupImportModal').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#backupImportCancel').evaluate(el => document.activeElement === el), true);
        assert.match(await page.locator('#backupImportBody').innerText(), /A cloud-only book|Cloud backup/);
        if (stage === 1) await audit(`cloud-${mode}-review`);
        await page.locator(mode === 'restore' ? '#backupImportReplace' : '#backupImportMerge').click();
        await page.locator('#actionConfirmationCancel').waitFor();
        if (stage === 2) {
          await page.locator('#actionConfirmationAccept').click();
          await page.waitForFunction(() => document.getElementById('actionConfirmationTitle')?.textContent === 'Export a safety copy first');
          await audit(`cloud-${mode}-export-first`);
        }
        await closeConfirmation();
        assert.equal(await fingerprint(), original);
        assert.equal(await page.locator('body > [inert]').count(), 0);
        assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      }
    }

    for (const replace of [false, true]) {
      await render(page, 'settings', theme, 'ready');
      await page.evaluate(async () => {
        const { createExportPayload } = await import('./js/services/backupSerialization.js');
        const { Navigation, Storage, books } = integrationFixture;
        const payload = createExportPayload({ books: [{ ...books[0], id: 'local-import-only', title: 'Local import only' }], profile: Storage.getProfile(), goals: Storage.getGoals(), activity: [] }, { version: 'fixture', exportedAt: '2026-10-12T12:00:00Z' });
        await Navigation.importDataFromFile(new File([JSON.stringify(payload)], 'local-fixture.json', { type: 'application/json' }));
      });
      await audit(replace ? 'local-replace-review' : 'local-merge-review');
      await page.locator(replace ? '#backupImportReplace' : '#backupImportMerge').click();
      await page.waitForFunction(() => document.getElementById('backupImportModal').hidden);
      const imported = await page.evaluate(() => integrationFixture.Storage.getBooks());
      assert.equal(imported.length, replace ? 1 : 9);
      assert.ok(imported.some(book => book.id === 'local-import-only'));
      assert.equal(await page.locator('body > [inert]').count(), 0);
    }

    await render(page, 'quotes', theme, 'ready');
    await page.evaluate(() => {
      globalThis.copiedQuote = '';
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { globalThis.copiedQuote = text; } } });
    });
    await page.locator('[data-action="copy-quote"]').first().click();
    await page.waitForFunction(() => globalThis.copiedQuote.length > 0);
    assert.match(await page.evaluate(() => copiedQuote), /fixture quote/);
    await page.locator('[data-action="copy-quote-citation"]').first().click();
    await page.waitForFunction(() => globalThis.copiedQuote.includes('Fixture author'));
    const downloading = page.waitForEvent('download');
    await page.locator('[data-action="export-quote-markdown"]').first().click();
    const download = await downloading;
    assert.match(await fs.readFile(await download.path(), 'utf8'), /Fixture author/);
    await page.locator('[data-action="filter-quotes"][data-filter="kindle-notes"]').click();
    assert.equal(await page.locator('[data-action="copy-quote"]').count(), 0);
    await audit('quotes-filter-empty');

    for (const [state, text] of [['invalid', 'not clippings'], ['empty', ' '], ['valid', 'Integrated Kindle Book (Fixture Author)\n- Your Highlight on page 12 | Location 121-125 | Added on Monday, October 12, 2026\n\nAn integrated private clipping.\n==========']]) {
      await render(page, 'kindle', theme, 'ready');
      await page.locator('#kindleClippingsInput').setInputFiles({ name: 'My Clippings.txt', mimeType: 'text/plain', buffer: Buffer.from(text) });
      if (state === 'valid') {
        await page.waitForFunction(() => !document.querySelector('[data-action="continue-kindle-import"]').disabled);
        await audit('kindle-valid-preview');
        await page.locator('[data-action="continue-kindle-import"]').click();
        await page.waitForFunction(() => document.getElementById('kindleImportModal').hidden);
        const imported = await page.evaluate(() => integrationFixture.Storage.getBooks().find(book => book.title === 'Integrated Kindle Book'));
        assert.equal(imported.quotes.length, 1);
        assert.equal(imported.quotes[0].source, 'kindle');
        assert.equal(imported.quotes[0].text, 'An integrated private clipping.');
      } else {
        await page.waitForSelector('#kindleImportError');
        assert.equal(await page.locator('[data-action="continue-kindle-import"]').isDisabled(), true);
        await audit(`kindle-${state}-preview`);
        await page.keyboard.press('Escape');
      }
      await settled();
      assert.equal(await page.locator('body > [inert]').count(), 0);
    }

    await render(page, 'profile', theme, 'ready');
    await page.locator('.profile-editor summary').click();
    await page.locator('#profileName').fill('Integrated Reader');
    await page.locator('#profileBio').fill('Private café 日本語 biography');
    await audit('profile-expanded');
    await page.locator('#profileForm [type="submit"]').click();
    assert.equal(await page.evaluate(() => integrationFixture.Storage.getProfile().name), 'Integrated Reader');
    assert.equal(await page.evaluate(() => integrationFixture.Storage.getProfile().bio), 'Private café 日本語 biography');
    assert.deepEqual(errors, []);
    await context.close();
  }
  await fs.writeFile(path.join(output, 'action-results.json'), JSON.stringify(results, null, 2));
  console.log(`Integrated action safety and ${results.length} supporting renders passed`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
