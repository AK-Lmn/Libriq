import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeleteAccountHandler, RECENT_AUTH_SECONDS } from '../api/_lib/deleteAccount.js';

const NOW = 1_800_000_000; // seconds

function fakeRes() {
  return {
    statusCode: 200, headers: {}, body: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function setup({ claims = { uid: 'alice', auth_time: NOW - 30 }, verifyError, deleteError, configured = true } = {}) {
  const calls = [];
  const handler = createDeleteAccountHandler({
    now: () => NOW * 1000,
    getAdmin: async () => {
      if (!configured) return null;
      return {
        verifyIdToken: async (token, checkRevoked) => {
          calls.push(['verify', token, checkRevoked]);
          if (verifyError) throw verifyError;
          return claims;
        },
        recursiveDelete: async path => { calls.push(['recursiveDelete', path]); },
        deleteDoc: async path => { calls.push(['deleteDoc', path]); },
        deleteUser: async uid => {
          calls.push(['deleteUser', uid]);
          if (deleteError) throw deleteError;
        },
      };
    },
  });
  return { handler, calls };
}

const req = (overrides = {}) => ({ method: 'POST', headers: { authorization: 'Bearer good-token' }, ...overrides });

test('a fresh token wipes users/{uid} and the poll vote, then deletes the account', async () => {
  const { handler, calls } = setup();
  const res = fakeRes();
  await handler(req(), res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(calls, [
    ['verify', 'good-token', true],
    ['recursiveDelete', 'users/alice'],
    ['deleteDoc', 'polls/mobile_app/votes/alice'],
    ['deleteUser', 'alice'],
  ]);
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('data is wiped before the account so a failed delete can be retried', async () => {
  const { handler, calls } = setup({ deleteError: new Error('boom') });
  const res = fakeRes();
  await handler(req(), res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.code, 'delete-failed');
  assert.deepEqual(calls.map(c => c[0]), ['verify', 'recursiveDelete', 'deleteDoc', 'deleteUser']);
});

test('only POST is accepted', async () => {
  const { handler, calls } = setup();
  const res = fakeRes();
  await handler(req({ method: 'GET' }), res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
  assert.deepEqual(calls, []);
});

test('a missing or malformed bearer token is rejected without touching data', async () => {
  for (const authorization of [undefined, '', 'Basic abc', 'Bearer ']) {
    const { handler, calls } = setup();
    const res = fakeRes();
    await handler(req({ headers: authorization === undefined ? {} : { authorization } }), res);
    assert.equal(res.statusCode, 401, String(authorization));
    assert.deepEqual(calls, []);
  }
});

test('an invalid or revoked token is rejected', async () => {
  const { handler, calls } = setup({ verifyError: Object.assign(new Error('revoked'), { code: 'auth/id-token-revoked' }) });
  const res = fakeRes();
  await handler(req(), res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'invalid-token');
  assert.deepEqual(calls.map(c => c[0]), ['verify']);
});

test('a sign-in older than the recent-auth window needs a fresh sign-in', async () => {
  const { handler, calls } = setup({ claims: { uid: 'alice', auth_time: NOW - RECENT_AUTH_SECONDS - 1 } });
  const res = fakeRes();
  await handler(req(), res);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'auth/requires-recent-login');
  assert.deepEqual(calls.map(c => c[0]), ['verify']);
});

test('without server credentials the route says so, and the client falls back', async () => {
  const { handler, calls } = setup({ configured: false });
  const res = fakeRes();
  await handler(req(), res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'not-configured');
  assert.deepEqual(calls, []);
});
