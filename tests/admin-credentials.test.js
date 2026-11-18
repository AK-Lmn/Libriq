import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAdminCredentials } from '../api/_lib/adminCredentials.js';

const PEM = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n';
const sa = { project_id: 'p1', client_email: 'sa@p1.iam.gserviceaccount.com', private_key: PEM };

test('FIREBASE_SERVICE_ACCOUNT as raw JSON or base64', () => {
  assert.deepEqual(readAdminCredentials({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa) }), sa);
  assert.deepEqual(readAdminCredentials({ FIREBASE_SERVICE_ACCOUNT: Buffer.from(JSON.stringify(sa)).toString('base64') }), sa);
});

test('falls back to the three FIREBASE_ADMIN_* variables', () => {
  const creds = readAdminCredentials({
    FIREBASE_ADMIN_PROJECT_ID: 'p1',
    FIREBASE_ADMIN_CLIENT_EMAIL: 'sa@p1.iam.gserviceaccount.com',
    // Vercel values often hold the PEM with literal "\n" sequences.
    FIREBASE_ADMIN_PRIVATE_KEY: PEM.replace(/\n/g, '\\n'),
  });
  assert.deepEqual(creds, { project_id: 'p1', client_email: 'sa@p1.iam.gserviceaccount.com', private_key: PEM });
});

test('strips quotes around a pasted private key', () => {
  const creds = readAdminCredentials({
    FIREBASE_ADMIN_PROJECT_ID: 'p1', FIREBASE_ADMIN_CLIENT_EMAIL: 'e', FIREBASE_ADMIN_PRIVATE_KEY: `"${PEM}"`,
  });
  assert.equal(creds.private_key, PEM);
});

test('FIREBASE_SERVICE_ACCOUNT wins when both are set', () => {
  const creds = readAdminCredentials({
    FIREBASE_SERVICE_ACCOUNT: JSON.stringify(sa),
    FIREBASE_ADMIN_PROJECT_ID: 'other', FIREBASE_ADMIN_CLIENT_EMAIL: 'x', FIREBASE_ADMIN_PRIVATE_KEY: PEM,
  });
  assert.equal(creds.project_id, 'p1');
});

test('null when nothing usable is configured', () => {
  assert.equal(readAdminCredentials({}), null);
  assert.equal(readAdminCredentials({ FIREBASE_ADMIN_PROJECT_ID: 'p1', FIREBASE_ADMIN_CLIENT_EMAIL: 'e' }), null, 'missing key');
  assert.equal(readAdminCredentials({ FIREBASE_ADMIN_PROJECT_ID: 'p1', FIREBASE_ADMIN_CLIENT_EMAIL: 'e', FIREBASE_ADMIN_PRIVATE_KEY: 'not a pem' }), null);
});
