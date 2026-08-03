import assert from 'node:assert/strict';
import { FetchClientError, fetchJson, request } from '../frontend/js/shared/fetchClient.js';

const originalFetch = globalThis.fetch;

try {
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  assert.deepEqual(await fetchJson('https://example.test/books'), { ok: true });

  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts < 3) return new Response('', { status: 503 });
    return new Response(JSON.stringify({ recovered: true }), { status: 200 });
  };
  assert.deepEqual(await fetchJson('https://example.test/retry', {
    retries: 2,
    retryDelayMs: 0,
  }), { recovered: true });
  assert.equal(attempts, 3);

  globalThis.fetch = async () => new Response('', { status: 404 });
  await assert.rejects(
    fetchJson('https://example.test/missing', { retries: 3 }),
    error => error instanceof FetchClientError
      && error.code === 'HTTP_ERROR'
      && error.status === 404
      && error.retryable === false,
  );

  globalThis.fetch = (_url, { signal }) => new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  await assert.rejects(
    request('https://example.test/slow', { timeoutMs: 5 }),
    error => error.code === 'TIMEOUT' && error.name === 'AbortError',
  );

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    request('https://example.test/cancelled', { signal: controller.signal }),
    error => error.code === 'ABORTED',
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Fetch client tests passed');
