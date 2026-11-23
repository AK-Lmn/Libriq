import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProductEvents, EVENTS } from '../frontend/js/shared/productEvents.js';
import { createProductEventHandler, dayKey } from '../api/_lib/productEvent.js';

const LIVE = { hostname: 'www.libriq.app', search: '' };

function memoryStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)) };
}

test('events are sent by name only, from the live site only', () => {
  const sent = [];
  const live = createProductEvents({ location: LIVE, send: name => sent.push(name), storage: memoryStorage() });
  live.track('goal_set');
  live.track('not_an_event');
  assert.deepEqual(sent, ['goal_set']);

  for (const hostname of ['127.0.0.1', 'localhost', 'libriq-git-feat-x-projactsss.vercel.app']) {
    createProductEvents({ location: { hostname, search: '' }, send: () => assert.fail(`sent from ${hostname}`), storage: memoryStorage() }).track('goal_set');
  }
  const forced = [];
  createProductEvents({ location: { hostname: '127.0.0.1', search: '?libriq_product_events=1' }, send: n => forced.push(n), storage: memoryStorage() }).track('first_book');
  assert.deepEqual(forced, ['first_book'], 'tests can force it on');
  assert.deepEqual(EVENTS, ['sign_up', 'first_book', 'import_goodreads', 'import_kindle', 'goal_set']);
});

test('a sign-up is an account created in the last ten minutes, counted once per device', () => {
  const sent = [];
  const storage = memoryStorage();
  const now = Date.parse('2026-11-23T10:00:00Z');
  const events = createProductEvents({ location: LIVE, send: n => sent.push(n), storage, now: () => now });
  const fresh = { uid: 'u1', metadata: { creationTime: 'Mon, 23 Nov 2026 09:55:00 GMT' } };
  events.trackSignUp(fresh);
  events.trackSignUp(fresh);
  events.trackSignUp({ uid: 'u2', metadata: { creationTime: 'Mon, 23 Nov 2026 08:00:00 GMT' } });
  events.trackSignUp(null);
  assert.deepEqual(sent, ['sign_up']);
});

test('first_book is counted once per device', () => {
  const sent = [];
  const events = createProductEvents({ location: LIVE, send: n => sent.push(n), storage: memoryStorage() });
  events.trackFirstBook(1);
  events.trackFirstBook(1);
  events.trackFirstBook(3);
  assert.deepEqual(sent, ['first_book']);
});

function fakeRes() {
  return {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    end() { return this; },
  };
}

test('the handler counts known events from the live site in production', async () => {
  const counted = [];
  const handler = createProductEventHandler({
    increment: async (name, day) => counted.push([name, day]),
    env: { VERCEL_ENV: 'production' },
    now: () => Date.parse('2026-11-23T23:30:00Z'),
  });
  const ok = fakeRes();
  await handler({ method: 'POST', headers: { origin: 'https://www.libriq.app' }, body: '{"name":"import_kindle"}' }, ok);
  assert.equal(ok.statusCode, 204);
  assert.deepEqual(counted, [['import_kindle', '2026-11-23']]);
});

test('the handler ignores previews, other origins, unknown names and other methods', async () => {
  const counted = [];
  const make = env => createProductEventHandler({ increment: async n => counted.push(n), env });
  const cases = [
    [make({ VERCEL_ENV: 'preview' }), { method: 'POST', headers: { origin: 'https://www.libriq.app' }, body: '{"name":"goal_set"}' }, 204],
    [make({ VERCEL_ENV: 'production' }), { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{"name":"goal_set"}' }, 403],
    [make({ VERCEL_ENV: 'production' }), { method: 'POST', headers: { origin: 'https://www.libriq.app' }, body: '{"name":"hack"}' }, 400],
    [make({ VERCEL_ENV: 'production' }), { method: 'GET', headers: {} }, 405],
  ];
  for (const [handler, req, status] of cases) {
    const res = fakeRes();
    await handler(req, res);
    assert.equal(res.statusCode, status, JSON.stringify(req));
  }
  assert.deepEqual(counted, []);
});

test('counters are grouped by UTC day', () => {
  assert.equal(dayKey(Date.parse('2026-11-23T23:59:59Z')), '2026-11-23');
  assert.equal(dayKey(Date.parse('2026-11-24T00:00:00Z')), '2026-11-24');
});
