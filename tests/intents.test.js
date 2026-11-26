import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PENDING_KEYS,
  savePendingBook,
  claimPendingBook,
  queuePollVote,
  flushPendingPollVote,
} from '../frontend/js/services/pendingIntents.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
    has: key => map.has(key),
  };
}

const DAY = 24 * 60 * 60 * 1000;
const pick = { title: 'Project Hail Mary', author: 'Andy Weir', pageCount: 496, coverUrl: 'https://covers.example/x.jpg' };

test('a demo-search pick is added to the library once, after sign-in', () => {
  const storage = memoryStorage();
  savePendingBook(pick, { storage, now: 1000 });
  const added = [];
  const deps = {
    storage,
    now: 2000,
    getBooks: () => [],
    isSameBook: () => false,
    addBook: book => { added.push(book); return { id: 'b1', ...book }; },
  };
  const result = claimPendingBook(deps);
  assert.equal(result.status, 'added');
  assert.equal(added.length, 1);
  assert.equal(added[0].title, 'Project Hail Mary');
  assert.equal(added[0].status, 'wishlist');
  assert.equal(storage.has(PENDING_KEYS.BOOK), false, 'pick is consumed');
  assert.equal(claimPendingBook(deps).status, 'none', 'second claim adds nothing');
});

test('a pick already in the library is not duplicated', () => {
  const storage = memoryStorage();
  savePendingBook(pick, { storage, now: 0 });
  const result = claimPendingBook({
    storage, now: 1, getBooks: () => [{ title: 'Project Hail Mary' }], isSameBook: () => true,
    addBook: () => { throw new Error('should not add'); },
  });
  assert.equal(result.status, 'duplicate');
  assert.equal(storage.has(PENDING_KEYS.BOOK), false);
});

test('stale or broken picks are dropped', () => {
  const storage = memoryStorage();
  savePendingBook(pick, { storage, now: 0 });
  const deps = { storage, now: 8 * DAY, getBooks: () => [], isSameBook: () => false, addBook: () => assert.fail('stale pick added') };
  assert.equal(claimPendingBook(deps).status, 'none');
  storage.setItem(PENDING_KEYS.BOOK, '{not json');
  assert.equal(claimPendingBook({ ...deps, now: 0 }).status, 'none');
  assert.equal(storage.has(PENDING_KEYS.BOOK), false);
  savePendingBook({ author: 'No title' }, { storage, now: 0 });
  assert.equal(storage.has(PENDING_KEYS.BOOK), false, 'a pick without a title is not saved');
});

test('an emailed vote waits for sign-in and is kept until the account write succeeds', async () => {
  const storage = memoryStorage();
  queuePollVote('android', { storage, now: 0 });
  const calls = [];
  const submit = async choice => { calls.push(choice); return calls.length === 1 ? { success: true, localOnly: true } : { success: true }; };

  assert.equal((await flushPendingPollVote({ storage, now: 1, isSignedIn: false, submit })).flushed, false);
  assert.equal(calls.length, 0, 'nothing is submitted before sign-in');

  await flushPendingPollVote({ storage, now: 1, isSignedIn: true, submit });
  assert.equal(storage.has(PENDING_KEYS.POLL_VOTE), true, 'a local-only result keeps the vote queued');

  const done = await flushPendingPollVote({ storage, now: 2, isSignedIn: true, submit });
  assert.equal(done.flushed, true);
  assert.deepEqual(calls, ['android', 'android']);
  assert.equal(storage.has(PENDING_KEYS.POLL_VOTE), false);
});

test('invalid votes are never queued', () => {
  const storage = memoryStorage();
  queuePollVote('blackberry', { storage, now: 0 });
  assert.equal(storage.has(PENDING_KEYS.POLL_VOTE), false);
});

test('the app wires both intents to sign-in, and demo search matches the API minimum', async () => {
  const app = await read('frontend/js/app.js');
  assert.match(app, /queuePollVote\(/);
  assert.match(app, /LibriqFirebase\.onChange\(state => claimPendingIntents\(state\)\)/);
  assert.match(app, /flushPendingPollVote\(/);
  assert.match(app, /claimPendingBook\(/);
  const nav = (await read('frontend/js/navigation.js')) + (await read('frontend/js/features/session/sessionPage.js'));
  assert.match(nav, /savePendingBook\(/);
  // Demo search and the API share one minimum, so a short query can't be
  // sent to an API that would ignore it.
  assert.match(nav, /q\.length < MIN_SEARCH_LENGTH/);
  const api = await read('frontend/js/api/index.js');
  assert.match(api, /q\.length < MIN_SEARCH_LENGTH/);
});

function read(file) {
  return readFile(new URL(`../${file}`, import.meta.url), 'utf8');
}
