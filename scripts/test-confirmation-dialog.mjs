import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { confirmAction, confirmTypedAction } from '../frontend/js/components/ui/confirmation.js';
import { startSupportFixture, initializeSupportPage } from './test-support-dialogs-design.mjs';

assert.equal(await confirmAction('No DOM available'), false);
assert.equal(await confirmTypedAction({ expected: 'DELETE' }), false);
const server = await startSupportFixture();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).origin === server.url ? route.continue() : route.abort());
  await page.goto(server.url);
  await initializeSupportPage(page);
  const start = async (options = {}) => {
    await page.evaluate(options => {
      document.getElementById('fixtureTrigger').focus();
      window.result = null;
      window.supportFixture.confirmAction('Remove "A private book" from your library?', options).then(result => { window.result = result; });
    }, options);
    await page.waitForFunction(() => document.activeElement?.id === 'actionConfirmationCancel');
  };
  const end = async expected => {
    await page.waitForFunction(() => window.result !== null);
    assert.equal(await page.evaluate(() => window.result), expected);
    assert.equal(await page.locator('#actionConfirmationModal').count(), 0);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixtureTrigger');
    assert.equal(await page.evaluate(() => document.getElementById('app').inert), false);
    assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  };
  for (const [action, expected] of [['cancel', false], ['close', false], ['escape', false], ['backdrop', false], ['accept', true], ['enter', false]]) {
    await start({ title: 'Remove book?', confirmLabel: 'Remove book' });
    assert.equal(await page.evaluate(() => document.getElementById('app').inert), true);
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
    const dialog = page.locator('#actionConfirmationModal');
    assert.equal(await dialog.getAttribute('aria-labelledby'), 'actionConfirmationTitle');
    assert.equal(await dialog.getAttribute('aria-describedby'), 'actionConfirmationDescription');
    if (action === 'escape' || action === 'enter') await page.keyboard.press(action === 'escape' ? 'Escape' : 'Enter');
    else if (action === 'backdrop') await dialog.click({ position: { x: 2, y: 2 } });
    else await page.locator({ cancel: '#actionConfirmationCancel', close: '.action-confirmation .modal-close', accept: '#actionConfirmationAccept' }[action]).click();
    await end(expected);
  }
  await start();
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'actionConfirmationAccept');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close confirmation');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'actionConfirmationAccept');
  await page.keyboard.press('Escape');
  await end(false);

  await start({ title: '<img src=x onerror=alert(1)>', detail: '<script>throw new Error("unsafe")</script>', confirmLabel: '<b>Continue</b>' });
  assert.equal(await page.locator('.action-confirmation img, .action-confirmation script, .action-confirmation b').count(), 0);
  assert.match(await page.locator('#actionConfirmationDetail').textContent(), /<script>/);
  assert.equal(await page.locator('#actionConfirmationModal').getAttribute('aria-describedby'), 'actionConfirmationDescription actionConfirmationDetail');
  assert.equal(await page.evaluate(() => window.supportFixture.confirmAction('Overlapping request')), false);
  assert.equal(await page.locator('.action-confirmation').count(), 1);
  await page.keyboard.press('Escape');
  await end(false);

  assert.equal(await page.evaluate(() => window.supportFixture.confirmAction('   ')), false);
  assert.equal(await page.evaluate(() => window.supportFixture.confirmAction(null)), false);
  await page.evaluate(() => {
    window.controller = new AbortController(); window.controller.abort();
  });
  assert.equal(await page.evaluate(() => window.supportFixture.confirmAction('Already cancelled', { signal: window.controller.signal })), false);
  await page.evaluate(() => {
    window.controller = new AbortController();
    window.result = null;
    window.supportFixture.confirmAction('Can be cancelled', { signal: window.controller.signal }).then(result => { window.result = result; });
  });
  await page.waitForSelector('#actionConfirmationModal');
  await page.evaluate(() => window.controller.abort());
  await end(false);

  // Consecutive warnings must restore focus before opening the second dialog.
  await page.evaluate(() => {
    document.getElementById('fixtureTrigger').focus();
    window.sequence = (async () => {
      if (!await window.supportFixture.confirmAction('Restore cloud backup?')) return false;
      return window.supportFixture.confirmAction('Export first if you want a safety copy. Restore now?');
    })();
  });
  await page.locator('#actionConfirmationAccept').click();
  await page.waitForFunction(() => document.getElementById('actionConfirmationDescription')?.textContent.startsWith('Export first'));
  await page.waitForFunction(() => document.activeElement?.id === 'actionConfirmationCancel');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.sequence), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'fixtureTrigger');

  // Parent dialog uses Utils; the same AccessibleDialog stack must stay intact.
  await page.evaluate(() => {
    const { Utils } = window.supportFixture;
    document.getElementById('fixtureTrigger').focus();
    Utils.show(document.getElementById('backupImportModal'));
  });
  await page.locator('#backupImportCancel').focus();
  await page.evaluate(() => { window.result = null; window.supportFixture.confirmAction('Nested confirmation').then(result => { window.result = result; }); });
  await page.waitForFunction(() => document.activeElement?.id === 'actionConfirmationCancel');
  assert.equal(await page.evaluate(() => document.getElementById('backupImportModal').inert), true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.result === false);
  assert.equal(await page.evaluate(() => document.getElementById('backupImportModal').inert), false);
  assert.equal(await page.evaluate(() => document.getElementById('backupImportModal').hasAttribute('aria-hidden')), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'backupImportCancel');
  assert.equal(await page.evaluate(() => document.getElementById('backupImportModal').hidden), false);
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  await page.evaluate(() => window.supportFixture.Utils.hide(document.getElementById('backupImportModal')));
  await page.waitForFunction(() => document.activeElement?.id === 'fixtureTrigger');

  for (const expected of ['CLEAR CACHE', 'DELETE', 'DELETE ACCOUNT']) {
    await page.evaluate(expected => {
      window.result = null;
      window.supportFixture.confirmTypedAction({ title: 'Confirm fixture action', body: 'Original action-specific consequences.', prompt: `Type ${expected} to continue`, expected, actionLabel: 'Confirm' }).then(result => { window.result = result; });
    }, expected);
    await page.waitForFunction(() => document.activeElement?.id === 'dangerConfirmCancel');
    const input = page.locator('#dangerConfirmInput'), action = page.locator('#dangerConfirmAction');
    assert.equal(await action.isDisabled(), true);
    for (const phrase of [expected.toLowerCase(), `${expected}X`, '']) { await input.fill(phrase); assert.equal(await action.isDisabled(), true); }
    await input.fill(expected);
    assert.equal(await action.isEnabled(), true);
    // Changing the value without an input event cannot bypass the final guard.
    await input.evaluate(el => { el.value = 'WRONG'; });
    await action.click();
    assert.equal(await page.evaluate(() => window.result), null);
    await input.fill(` ${expected} `);
    await action.click();
    await page.waitForFunction(() => window.result === true);
    assert.equal(await page.locator('#dangerConfirmModal').isHidden(), true);
    assert.equal(await action.isDisabled(), true);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'fixtureTrigger');
  }
  for (const close of ['cancel', 'close', 'escape', 'backdrop']) {
    await page.evaluate(() => {
      window.result = null;
      window.supportFixture.confirmTypedAction({ title: 'Delete?', body: 'Original consequences.', prompt: 'Type DELETE to continue', expected: 'DELETE', actionLabel: 'Delete' }).then(result => { window.result = result; });
    });
    await page.waitForFunction(() => document.activeElement?.id === 'dangerConfirmCancel');
    if (close === 'escape') await page.keyboard.press('Escape');
    else if (close === 'backdrop') await page.locator('#dangerConfirmModal').click({ position: { x: 2, y: 2 } });
    else await page.locator(close === 'cancel' ? '#dangerConfirmCancel' : '#closeDangerConfirm').click();
    await page.waitForFunction(() => window.result === false);
    assert.equal(await page.locator('#dangerConfirmModal').isHidden(), true);
  }
  const typedOptions = { title: 'Delete?', body: 'Original consequences.', prompt: 'Type DELETE to continue', expected: 'DELETE', actionLabel: 'Delete' };
  for (const key of Object.keys(typedOptions)) {
    for (const value of [undefined, '', '   ', null]) {
      assert.equal(await page.evaluate(options => window.supportFixture.confirmTypedAction(options), { ...typedOptions, [key]: value }), false);
      assert.equal(await page.locator('#dangerConfirmModal').isHidden(), true);
    }
  }
  await page.locator('#dangerConfirmAction').evaluate(el => el.remove());
  assert.equal(await page.evaluate(options => window.supportFixture.confirmTypedAction(options), typedOptions), false);
  assert.deepEqual(errors, []);
  console.log('Confirmation dialogs passed: safe defaults, exact typed phrases, focus trap/restoration, nested dialogs, sequential warnings, abort/concurrency, XSS and fail-closed checks.');
} finally { await browser.close(); await server.close(); }
