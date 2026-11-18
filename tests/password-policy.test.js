import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, newPasswordProblem } from '../frontend/js/shared/passwordPolicy.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('new passwords need at least 8 characters', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.match(newPasswordProblem(''), /at least 8 characters/);
  assert.match(newPasswordProblem('1234567'), /at least 8 characters/);
  assert.equal(newPasswordProblem('12345678'), null);
  // Length counts characters, not UTF-16 units: four emoji are four characters.
  assert.match(newPasswordProblem('📚📚📚📚'), /at least 8/);
});

test('very long passwords are refused before Firebase sees them', () => {
  assert.equal(MAX_PASSWORD_LENGTH, 4096);
  assert.equal(newPasswordProblem('a'.repeat(4096)), null);
  assert.match(newPasswordProblem('a'.repeat(4097)), /too long/);
});

test('sign-up checks the password before creating the account and says 8 everywhere', async () => {
  const nav = await read('frontend/js/navigation.js');
  const submit = nav.slice(nav.indexOf("getElementById('emailAuthForm')?.addEventListener('submit'"));
  const check = submit.indexOf('newPasswordProblem(password)');
  assert.ok(check !== -1, 'submit handler validates the new password');
  assert.ok(check < submit.indexOf('createAccountWithEmail('), 'before the account is created');
  assert.doesNotMatch(nav, /6 characters/);
  assert.match(nav, /Use at least \$\{MIN_PASSWORD_LENGTH\} characters\./);
  assert.match(nav, /setAttribute\('minlength', String\(MIN_PASSWORD_LENGTH\)\)/);
  assert.ok(nav.includes("setAttribute('aria-describedby', 'sessionPasswordHelp')"), 'help text is announced in sign-up mode');
});
