import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteAccountOnServer } from '../frontend/js/services/serverAccountDelete.js';

const reply = (status, body = {}) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });

test('posts the ID token to /api/delete-account and reports a server delete', async () => {
  let seen;
  const result = await deleteAccountOnServer({
    getIdToken: async () => 'tok',
    fetchFn: async (url, init) => { seen = { url, init }; return reply(200, { ok: true })(); },
  });
  assert.equal(result, 'deleted');
  assert.equal(seen.url, '/api/delete-account');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers.Authorization, 'Bearer tok');
  assert.equal(seen.init.credentials, 'omit');
});

test('falls back to the client wipe when the route is missing or not configured', async () => {
  for (const status of [404, 405, 503]) {
    assert.equal(await deleteAccountOnServer({ getIdToken: async () => 'tok', fetchFn: reply(status) }), 'fallback', String(status));
  }
  assert.equal(await deleteAccountOnServer({ getIdToken: async () => 'tok', fetchFn: async () => { throw new TypeError('offline'); } }), 'fallback');
  assert.equal(await deleteAccountOnServer({ getIdToken: async () => null, fetchFn: reply(200) }), 'fallback', 'no token');
});

test('a stale sign-in surfaces as requires-recent-login', async () => {
  await assert.rejects(
    deleteAccountOnServer({ getIdToken: async () => 'tok', fetchFn: reply(403, { code: 'auth/requires-recent-login' }) }),
    err => err.code === 'auth/requires-recent-login',
  );
});

test('a server failure is an error, not a silent fallback', async () => {
  // The server may already have wiped data; a client wipe on top would hide
  // that the account itself still exists.
  for (const status of [401, 500]) {
    await assert.rejects(
      deleteAccountOnServer({ getIdToken: async () => 'tok', fetchFn: reply(status, { code: 'delete-failed' }) }),
      err => err.code === 'account-delete-failed',
      String(status),
    );
  }
});
