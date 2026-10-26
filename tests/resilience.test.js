import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { issueToken } from '../api/auth.js';
import { createTestServer, apiRequest } from './helpers/testServer.js';

describe('API & Boundary Resilience', () => {
  let testEnv;
  let adminToken;

  before(async () => {
    testEnv = await createTestServer();
    adminToken = issueToken({ userId: 'admin', role: 'admin' });
  });

  after(async () => {
    await testEnv.close();
  });

  describe('Malformed Payloads & Type Safety', () => {
    it('rejects syntax-invalid JSON body with explicit 400 Bad Request', async () => {
      const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        body: '{"title": "Broken JSON, missing brace',
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'MALFORMED_PAYLOAD');
      assert.match(res.data.error.message, /not valid JSON/i);
    });

    it('rejects payloads with missing required fields with explicit 400', async () => {
      const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          title: 'Has Title But No Author',
        },
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'VALIDATION_ERROR');
      assert.ok(Array.isArray(res.data.error.details));
      assert.ok(res.data.error.details.some((d) => d.includes('author')));
    });

    it('rejects payloads with unexpected types with explicit 400', async () => {
      const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          title: 12345, // expected string
          author: 'Valid Author',
          totalCopies: 'not-a-number', // expected number
        },
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'VALIDATION_ERROR');
    });

    it('rejects non-object payloads (arrays) with explicit 400', async () => {
      const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: [{ title: 'Array payload' }],
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'MALFORMED_PAYLOAD');
    });

    it('rejects excessive payload sizes with explicit 413 Payload Too Large', async () => {
      // Build a 150KB payload (exceeds default 100KB limit)
      const largeTitle = 'A'.repeat(150 * 1024);
      const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          title: largeTitle,
          author: 'Author',
        },
      });

      assert.equal(res.status, 413);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'PAYLOAD_TOO_LARGE');
    });
  });

  describe('SQL & NoSQL Injection Prevention', () => {
    it('neutralizes classic SQL injection payloads in string fields (stored literally, never executed)', async () => {
      const sqlInjectionPayloads = [
        "Robert'); DROP TABLE Books;--",
        "' OR '1'='1",
        "' UNION SELECT username, password FROM users--",
      ];

      for (const payload of sqlInjectionPayloads) {
        const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: {
            title: payload,
            author: 'Injected Author',
          },
        });

        // Structurally valid input is accepted; the payload is treated as data,
        // not executable code, so injection is neutralized rather than blocked.
        assert.equal(res.status, 201, `Expected 201 for SQL injection payload: ${payload}`);
        assert.equal(res.data.success, true);
        assert.equal(res.data.data.title, payload);
      }
    });

    it('rejects NoSQL injection operators ($-prefixed keys) in request body', async () => {
      const nosqlInjectionPayloads = [
        { title: 'Normal Title', author: 'Author', $where: 'sleep(5000)' },
        { title: 'Normal Title', author: 'Author', query: { $gt: '' } },
        { title: 'Normal Title', author: 'Author', $ne: null },
      ];

      for (const payload of nosqlInjectionPayloads) {
        const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminToken}` },
          body: payload,
        });

        assert.equal(res.status, 400, 'Expected 400 for NoSQL operator injection');
        assert.equal(res.data.success, false);
        assert.equal(res.data.error.code, 'INVALID_PAYLOAD_STRUCTURE');
        assert.ok(res.data.error.details);
      }
    });

    it('rejects prototype-pollution keys in request body', async () => {
      const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        // Raw JSON so __proto__ arrives as an own key (JSON.parse creates own props,
        // unlike object literals which set the prototype).
        body: '{"title":"Normal Title","author":"Author","__proto__":{"polluted":true}}',
      });

      assert.equal(res.status, 400);
      assert.equal(res.data.success, false);
      assert.equal(res.data.error.code, 'INVALID_PAYLOAD_STRUCTURE');
    });

    it('stores script-like strings literally (XSS mitigated at output encoding, not input blocking)', async () => {
      const res = await apiRequest(testEnv.url, '/api/catalog/resources', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          title: 'Harmless Title',
          author: '<script>alert("xss")</script>',
        },
      });

      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.equal(res.data.data.author, '<script>alert("xss")</script>');
    });
  });
});
