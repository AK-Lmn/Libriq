import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('icon fonts in the app shell are hidden from screen readers', async () => {
  const html = await read('frontend/index.html');
  const icons = html.match(/<i class="ph[^"]*"[^>]*>/g) || [];
  assert.ok(icons.length > 0);
  const exposed = icons.filter(tag => !/aria-hidden="true"/.test(tag));
  assert.deepEqual(exposed, []);
});

test('theme toggle has a stable name that matches its visible text', async () => {
  const html = await read('frontend/index.html');
  const button = html.match(/<button[^>]*id="themeToggle"[^>]*>/)[0];
  assert.doesNotMatch(button, /aria-label=/, 'visible text names the button');
  assert.match(button, /aria-pressed="(true|false)"/);
  const nav = await read('frontend/js/navigation.js');
  assert.doesNotMatch(nav, /'Light mode'/, 'label no longer flips between Dark mode and Light mode');
});

test('change-email input has an accessible name', async () => {
  const source = await read('frontend/js/features/settings/settingsPage.js');
  assert.match(source, /id="changeEmailInput"[^>]*aria-label="New email address"/);
});
