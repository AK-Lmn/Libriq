import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { deleteAccountWithReauth, reauthMethodFor, isRecentLoginError } from '../frontend/js/services/accountDeletion.js';

const stale = () => Object.assign(new Error('stale'), { code: 'auth/requires-recent-login' });

test('a fresh sign-in deletes without asking anything', async () => {
  let asked = 0;
  const result = await deleteAccountWithReauth({
    deleteAccount: async () => {},
    confirmIdentity: async () => { asked += 1; return true; },
  });
  assert.equal(result, 'deleted');
  assert.equal(asked, 0);
});

test('a stale sign-in asks the reader to confirm, then retries once', async () => {
  const calls = [];
  let attempt = 0;
  const result = await deleteAccountWithReauth({
    deleteAccount: async () => { calls.push('delete'); if (attempt++ === 0) throw stale(); },
    confirmIdentity: async () => { calls.push('confirm'); return true; },
  });
  assert.equal(result, 'deleted');
  assert.deepEqual(calls, ['delete', 'confirm', 'delete']);
});

test('backing out of the confirmation cancels without a second delete', async () => {
  const calls = [];
  const result = await deleteAccountWithReauth({
    deleteAccount: async () => { calls.push('delete'); throw stale(); },
    confirmIdentity: async () => { calls.push('confirm'); return false; },
  });
  assert.equal(result, 'cancelled');
  assert.deepEqual(calls, ['delete', 'confirm']);
});

test('other errors, a wrong password, or a second stale refusal surface to the caller', async () => {
  await assert.rejects(deleteAccountWithReauth({
    deleteAccount: async () => { throw Object.assign(new Error('net'), { code: 'auth/network-request-failed' }); },
    confirmIdentity: async () => true,
  }), /net/);
  await assert.rejects(deleteAccountWithReauth({
    deleteAccount: async () => { throw stale(); },
    confirmIdentity: async () => { throw Object.assign(new Error('bad'), { code: 'auth/invalid-credential' }); },
  }), err => err.code === 'auth/invalid-credential');
  let n = 0;
  await assert.rejects(deleteAccountWithReauth({
    deleteAccount: async () => { n += 1; throw stale(); },
    confirmIdentity: async () => true,
  }), err => isRecentLoginError(err));
  assert.equal(n, 2, 'only one retry');
});

test('email accounts confirm with their password, Google-only accounts with Google', () => {
  assert.equal(reauthMethodFor({ hasPasswordProvider: true, providers: ['password'] }), 'password');
  assert.equal(reauthMethodFor({ hasPasswordProvider: true, providers: ['password', 'google.com'] }), 'password');
  assert.equal(reauthMethodFor({ hasPasswordProvider: false, providers: ['google.com'] }), 'google');
  assert.equal(reauthMethodFor({ hasPasswordProvider: false, providers: [] }), null);
});

test('settings no longer tells readers to sign out and back in', async () => {
  const nav = await readFile(new URL('../frontend/js/navigation.js', import.meta.url), 'utf8');
  const accountData = await readFile(new URL('../frontend/js/features/settings/accountData.js', import.meta.url), 'utf8');
  assert.doesNotMatch(nav + accountData, /sign out and sign in again, then delete your account/);
  assert.match(accountData, /deleteAccountWithReauth\(/);
});
