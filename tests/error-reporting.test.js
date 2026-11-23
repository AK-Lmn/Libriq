import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scrub, buildReport, installErrorReporting } from '../frontend/js/shared/errorReporting.js';
import { createClientErrorHandler } from '../api/_lib/clientError.js';

const PAGE = { origin: 'https://www.libriq.app', pathname: '/', hostname: 'www.libriq.app', search: '' };

test('scrub removes emails, query strings and fragments, and caps length', () => {
  assert.equal(scrub('failed for kim@example.com at https://www.libriq.app/?uid=abc#x'), 'failed for [email] at https://www.libriq.app/');
  assert.equal(scrub('x'.repeat(900), 500).length, 500);
  assert.equal(scrub(null), null);
});

test('buildReport keeps the page path and drops the query string', () => {
  const error = new TypeError('Cannot read properties of undefined (reading "title")');
  const report = buildReport('error', { message: error.message, source: 'https://www.libriq.app/js/app.bundle.js?v=1', line: 3, column: 9, error }, { ...PAGE, pathname: '/', search: '?vote=ios' }, '4.8.4');
  assert.equal(report.kind, 'error');
  assert.equal(report.page, '/');
  assert.equal(report.source, 'https://www.libriq.app/js/app.bundle.js');
  assert.equal(report.line, 3);
  assert.equal(report.release, '4.8.4');
  assert.match(report.stack, /TypeError/);
});

function fakeTarget() {
  const listeners = {};
  return {
    addEventListener: (type, fn) => { listeners[type] = fn; },
    removeEventListener: type => { delete listeners[type]; },
    fire: (type, event) => listeners[type]?.(event),
    listeners,
  };
}

test('installErrorReporting sends uncaught errors and rejections, once each, at most five per page', () => {
  const sent = [];
  const target = fakeTarget();
  installErrorReporting({ target, location: PAGE, send: report => sent.push(report), release: '4.8.4' });

  const boom = new Error('boom');
  target.fire('error', { message: 'boom', filename: 'https://www.libriq.app/js/app.bundle.js', lineno: 1, colno: 2, error: boom });
  target.fire('error', { message: 'boom', filename: 'https://www.libriq.app/js/app.bundle.js', lineno: 1, colno: 2, error: boom });
  target.fire('unhandledrejection', { reason: new Error('sync failed') });
  assert.deepEqual(sent.map(r => [r.kind, r.message]), [['error', 'boom'], ['unhandledrejection', 'sync failed']]);

  for (let i = 0; i < 10; i++) target.fire('error', { message: `e${i}`, filename: '', lineno: i, colno: 0 });
  assert.equal(sent.length, 5, 'capped per page load');
});

test('installErrorReporting ignores browser noise and stays off on local hosts', () => {
  const sent = [];
  const target = fakeTarget();
  installErrorReporting({ target, location: PAGE, send: report => sent.push(report) });
  target.fire('error', { message: 'Script error.', filename: '', lineno: 0, colno: 0 });
  target.fire('error', { message: 'ResizeObserver loop completed with undelivered notifications.' });
  assert.equal(sent.length, 0);

  const local = fakeTarget();
  const uninstall = installErrorReporting({ target: local, location: { ...PAGE, hostname: '127.0.0.1' }, send: () => assert.fail('sent from localhost') });
  assert.equal(Object.keys(local.listeners).length, 0);
  uninstall();
});

function fakeRes() {
  return {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    end() { return this; },
  };
}

test('client-error handler logs one compact line and answers 204', async () => {
  const logged = [];
  const handler = createClientErrorHandler({ log: entry => logged.push(entry) });
  const res = fakeRes();
  await handler({ method: 'POST', body: JSON.stringify({ kind: 'error', message: 'boom kim@example.com', page: '/', source: 'https://www.libriq.app/js/app.bundle.js', line: 1, column: 2, stack: 'Error: boom', release: '4.8.4' }) }, res);
  assert.equal(res.statusCode, 204);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].message, 'boom [email]', 'the server scrubs too');
  assert.equal(logged[0].kind, 'error');
});

test('client-error handler rejects other methods, junk and oversized bodies', async () => {
  const logged = [];
  const handler = createClientErrorHandler({ log: entry => logged.push(entry) });
  const get = fakeRes();
  await handler({ method: 'GET' }, get);
  assert.equal(get.statusCode, 405);
  for (const body of ['not json', JSON.stringify({ kind: 'nope', message: 'x' }), JSON.stringify({ kind: 'error' }), 'x'.repeat(20000)]) {
    const res = fakeRes();
    await handler({ method: 'POST', body }, res);
    assert.ok([204, 400, 413].includes(res.statusCode));
  }
  assert.equal(logged.length, 0);
});
