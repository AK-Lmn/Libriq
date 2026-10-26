import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { issueToken, verifyToken, resetAuthSecretCache } from '../api/auth.js';
import { resolveAuthSecret } from '../api/config.js';
import { createTestServer, apiRequest } from './helpers/testServer.js';

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function sign(content, secret) {
  return crypto.createHmac('sha256', secret).update(content).digest('base64url');
}

/** Builds a genuinely expired token (exp in the past) signed with the active secret. */
function makeExpiredToken(secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    sub: 'expired-user',
    role: 'user',
    permissions: [],
    iat: now - 100,
    exp: now - 10,
  });
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

describe('Authentication & Authorization', () => {
  let testEnv;
  let secret;

  before(async () => {
    process.env.NODE_ENV = 'test';
    process.env.AUTH_USERS = JSON.stringify([
      {
        userId: 'test-user',
        role: 'admin',
        permissions: ['read', 'reserve', 'checkout', 'return', 'manage_catalog'],
        password: 'test-pass',
      },
      { userId: 'regular-user', role: 'user', permissions: ['read'], password: 'user-pass' },
    ]);
    resetAuthSecretCache();
    secret = resolveAuthSecret(process.env);
    testEnv = await createTestServer();
  });

  after(async () => {
    await testEnv.close();
    delete process.env.AUTH_USERS;
    delete process.env.NODE_ENV;
    resetAuthSecretCache();
  });

  describe('Token Issuance & Claims', () => {
    it('issues a valid signed token containing expected claims', () => {
      const token = issueToken({
        userId: 'user-123',
        role: 'member',
        permissions: ['read', 'reserve'],
      });

      assert.equal(typeof token, 'string');
      const parts = token.split('.');
      assert.equal(parts.length, 3);

      const verification = verifyToken(token);
      assert.equal(verification.valid, true);
      assert.equal(verification.payload.sub, 'user-123');
      // Unrecognized roles are normalized to 'user', never elevated.
      assert.equal(verification.payload.role, 'user');
      assert.deepEqual(verification.payload.permissions, ['read', 'reserve']);
      assert.ok(verification.payload.exp > verification.payload.iat);
      assert.ok(Number.isInteger(verification.payload.exp));
      assert.ok(Number.isInteger(verification.payload.iat));
    });

    it('issues tokens only against configured credentials', async () => {
      const res = await apiRequest(testEnv.url, '/api/auth/token', {
        method: 'POST',
        body: { userId: 'test-user', password: 'test-pass' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.token);
      assert.ok(res.data.data.expiresAt);
      assert.ok(Number.isInteger(res.data.data.expiresIn));
      assert.ok(res.data.data.expiresIn > 0);

      const verified = verifyToken(res.data.data.token);
      assert.equal(verified.valid, true);
      assert.equal(verified.payload.sub, 'test-user');
      assert.equal(verified.payload.role, 'admin');
      assert.deepEqual(verified.payload.permissions, [
        'read', 'reserve', 'checkout', 'return', 'manage_catalog',
      ]);
    });

    it('rejects token issuance without userId', async () => {
      const res = await apiRequest(testEnv.url, '/api/auth/token', {
        method: 'POST',
        body: { password: 'test-pass' },
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'VALIDATION_ERROR');
      assert.ok(Array.isArray(res.data.error.details));
    });

    it('rejects token issuance without password', async () => {
      const res = await apiRequest(testEnv.url, '/api/auth/token', {
        method: 'POST',
        body: { userId: 'test-user' },
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'VALIDATION_ERROR');
    });

    it('rejects invalid credentials (unknown user and wrong password are indistinguishable)', async () => {
      const wrongPassword = await apiRequest(testEnv.url, '/api/auth/token', {
        method: 'POST',
        body: { userId: 'test-user', password: 'wrong-pass' },
      });
      assert.equal(wrongPassword.status, 401);
      assert.equal(wrongPassword.data.error.code, 'INVALID_CREDENTIALS');

      const unknownUser = await apiRequest(testEnv.url, '/api/auth/token', {
        method: 'POST',
        body: { userId: 'no-such-user', password: 'any-pass' },
      });
      assert.equal(unknownUser.status, 401);
      assert.equal(unknownUser.data.error.code, 'INVALID_CREDENTIALS');
    });

    it('returns AUTH_UNAVAILABLE when no credentials are configured', async () => {
      // Temporarily clear credentials to confirm fail-closed behaviour.
      delete process.env.AUTH_USERS;
      resetAuthSecretCache();

      const res = await apiRequest(testEnv.url, '/api/auth/token', {
        method: 'POST',
        body: { userId: 'test-user', password: 'test-pass' },
      });

      assert.equal(res.status, 503);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'AUTH_UNAVAILABLE');

      // Restore for subsequent tests.
      process.env.AUTH_USERS = JSON.stringify([
        {
          userId: 'test-user',
          role: 'admin',
          permissions: ['read', 'reserve', 'checkout', 'return', 'manage_catalog'],
          password: 'test-pass',
        },
        { userId: 'regular-user', role: 'user', permissions: ['read'], password: 'user-pass' },
      ]);
      resetAuthSecretCache();
    });
  });

  describe('Token Verification, Expiration & Tamper Resistance', () => {
    it('verifies a valid token via the /api/auth/verify endpoint', async () => {
      const token = issueToken({ userId: 'verify-user', role: 'user' });
      const res = await apiRequest(testEnv.url, '/api/auth/verify', {
        method: 'POST',
        body: { token },
      });

      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.valid, true);
      assert.equal(res.data.data.payload.sub, 'verify-user');
      assert.equal(res.data.data.payload.role, 'user');
      assert.ok(Number.isInteger(res.data.data.payload.iat));
      assert.ok(Number.isInteger(res.data.data.payload.exp));
    });

    it('rejects an expired token with explicit 401', async () => {
      const expiredToken = makeExpiredToken(secret);
      const verification = verifyToken(expiredToken);
      assert.equal(verification.valid, false);
      assert.equal(verification.error, 'TOKEN_EXPIRED');

      const res = await apiRequest(testEnv.url, '/api/auth/verify', {
        method: 'POST',
        body: { token: expiredToken },
      });

      assert.equal(res.status, 401);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'TOKEN_EXPIRED');
    });

    it('rejects a token missing a valid numeric expiry', () => {
      const now = Math.floor(Date.now() / 1000);
      const header = b64url({ alg: 'HS256', typ: 'JWT' });
      const payload = b64url({ sub: 'no-exp', role: 'user', permissions: [], iat: now });
      const token = `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;

      const verification = verifyToken(token);
      assert.equal(verification.valid, false);
      assert.equal(verification.error, 'TOKEN_MALFORMED');
    });

    it('rejects a tampered token payload with explicit 401', async () => {
      const token = issueToken({ userId: 'normal-user', role: 'user' });
      const parts = token.split('.');

      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      payload.role = 'admin';
      const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const verification = verifyToken(tamperedToken);
      assert.equal(verification.valid, false);
      assert.equal(verification.error, 'TOKEN_TAMPERED');

      const res = await apiRequest(testEnv.url, '/api/auth/verify', {
        method: 'POST',
        body: { token: tamperedToken },
      });

      assert.equal(res.status, 401);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'TOKEN_TAMPERED');
    });

    it('rejects tokens signed with an invalid secret', () => {
      const wrongSecretToken = issueToken({ userId: 'attacker' }, { secret: 'unauthorized-signing-secret-value!!' });
      const verification = verifyToken(wrongSecretToken);
      assert.equal(verification.valid, false);
      assert.equal(verification.error, 'TOKEN_TAMPERED');
    });
  });

  describe('Route Protection (401 / 403 Response Standards)', () => {
    it('returns explicit 401 when accessing protected route without token', async () => {
      const res = await apiRequest(testEnv.url, '/api/auth/me');

      assert.equal(res.status, 401);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'UNAUTHORIZED');
      assert.match(res.data.error.message, /token required/i);
    });

    it('returns explicit 401 when accessing protected route with expired token', async () => {
      const expiredToken = makeExpiredToken(secret);
      const res = await apiRequest(testEnv.url, '/api/auth/me', {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });

      assert.equal(res.status, 401);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'TOKEN_EXPIRED');
    });

    it('returns explicit 401 when accessing protected route with tampered token', async () => {
      const validToken = issueToken({ userId: 'user-tampered' });
      const tamperedToken = validToken.slice(0, -4) + 'abcd';
      const res = await apiRequest(testEnv.url, '/api/auth/me', {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });

      assert.equal(res.status, 401);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'TOKEN_TAMPERED');
    });

    it('returns explicit 403 when user has insufficient role for privileged route', async () => {
      const userToken = issueToken({ userId: 'regular-user', role: 'user' });
      const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
        method: 'POST',
        headers: { Authorization: `Bearer ${userToken}` },
        body: { title: 'Test Book', author: 'Author' },
      });

      assert.equal(res.status, 403);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'FORBIDDEN');
    });

    it('allows access to privileged route when token has admin role', async () => {
      const adminToken = issueToken({ userId: 'admin-user', role: 'admin' });
      const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: { title: 'Admin Book', author: 'Authorized Author' },
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.title, 'Admin Book');
    });
  });
});
