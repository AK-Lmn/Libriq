import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import * as config from '../api/config.js';

const { resolveAuthSecret } = config;
const STRONG = 'x'.repeat(48);

function secretFromChildProcess(env) {
  const script = "import('./api/config.js').then(m => process.stdout.write(m.resolveAuthSecret(process.env)))";
  return execFileSync(process.execPath, ['-e', script], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
}

describe('AUTH_SECRET resolution (no hardcoded signing key)', () => {
  it('does not export a hardcoded development secret', () => {
    assert.equal('INSECURE_DEV_SECRET' in config, false);
  });

  it('uses a different random secret per process when AUTH_SECRET is unset and NODE_ENV is missing', () => {
    const a = secretFromChildProcess({});
    const b = secretFromChildProcess({});
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.notEqual(a, b, 'two processes must not share a predictable signing key');
  });

  it('refuses to resolve a secret in production when AUTH_SECRET is unset', () => {
    assert.throws(() => resolveAuthSecret({ NODE_ENV: 'production' }), { name: 'ConfigValidationError' });
  });

  it('refuses a self-described placeholder secret in production', () => {
    assert.throws(
      () => resolveAuthSecret({ NODE_ENV: 'production', AUTH_SECRET: 'changeme-'.padEnd(40, 'z') }),
      { name: 'ConfigValidationError' },
    );
  });

  it('returns the configured secret in production', () => {
    assert.equal(resolveAuthSecret({ NODE_ENV: 'production', AUTH_SECRET: STRONG, AUTH_USERS: '[]' }), STRONG);
  });

  it('returns the configured secret in development', () => {
    assert.equal(resolveAuthSecret({ NODE_ENV: 'development', AUTH_SECRET: 'dev-secret-123456' }), 'dev-secret-123456');
  });

  it('keeps the fallback stable within one process so issued tokens stay verifiable', () => {
    assert.equal(resolveAuthSecret({ NODE_ENV: 'test' }), resolveAuthSecret({}));
  });
});
