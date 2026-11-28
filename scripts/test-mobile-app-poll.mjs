// scripts/test-mobile-app-poll.mjs
import assert from 'node:assert/strict';

// Setup browser globals for test environment
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) ?? null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};

Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
  configurable: true,
  writable: true,
});

const {
  detectUserOS,
  POLL_CHOICES,
  isPollDismissedOrVoted,
  dismissPoll,
  submitPollVote,
  POLL_STORAGE_KEYS,
} = await import('../frontend/js/services/mobileAppPoll.js');

const { buildMobileAppPollCard } = await import('../frontend/js/dashboard.js');

console.log('Testing mobileAppPoll service...');

// 1. OS Detection
assert.equal(detectUserOS('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'iOS');
assert.equal(detectUserOS('Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X)'), 'iOS');
assert.equal(detectUserOS('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'Android');
assert.equal(detectUserOS('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'macOS');
assert.equal(detectUserOS('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows');
assert.equal(detectUserOS('Mozilla/5.0 (X11; Ubuntu; Linux x86_64)'), 'Linux');
assert.equal(detectUserOS('Unknown/1.0'), 'Other');

// 2. Allowed choices
assert.deepEqual([...POLL_CHOICES], ['ios', 'android', 'web_ok']);

// 3. Poll State (initial, dismissed, voted)
mockStorage.clear();
assert.equal(isPollDismissedOrVoted(), false);

// Card should render when not voted or dismissed
const cardHtmlInitial = buildMobileAppPollCard();
assert.ok(cardHtmlInitial.includes('dashboard-poll-card'));
assert.ok(cardHtmlInitial.includes('data-poll-choice="ios"'));
assert.ok(cardHtmlInitial.includes('data-poll-choice="android"'));
assert.ok(cardHtmlInitial.includes('data-poll-choice="web_ok"'));
// Plain statements, a quiet label instead of a pill, and no emoji or sparkle.
assert.doesNotMatch(cardHtmlInitial.replace(/<[^>]+>/g, ' '), /!/, 'no exclamation marks in the poll copy');
assert.doesNotMatch(cardHtmlInitial, /dashboard-poll-badge-dot|Community Poll/);
assert.match(cardHtmlInitial, /<span class="dashboard-poll-label">Community poll<\/span>/);
// The success message starts hidden, and nothing but the hidden attribute shows it.
assert.match(cardHtmlInitial, /id="dashboardPollSuccess" hidden/);

// Dismiss poll
dismissPoll();
assert.equal(isPollDismissedOrVoted(), true);
assert.equal(mockStorage.get(POLL_STORAGE_KEYS.DISMISSED), '1');
assert.equal(buildMobileAppPollCard(), '', 'Card should not render once dismissed');

// 4. Submit Poll Vote (signed in)
mockStorage.clear();
mockStorage.set(POLL_STORAGE_KEYS.VOTER_ID, 'voter_legacy_1');
const mockWrites = [];
const makeClient = (user) => ({
  getState: () => ({ user }),
  getFirestoreClient: () => ({}),
  doc: (db, ...segments) => segments.join('/'),
  setDoc: async (ref, payload, options) => {
    mockWrites.push({ ref, payload, options });
  },
});
const signedInClient = makeClient({ uid: 'user_test_123', email: 'reader@example.com' });

const ALLOWED_KEYS = ['choice', 'createdAt', 'os'];
const assertCleanPayload = (payload) => {
  assert.deepEqual(Object.keys(payload).sort(), ALLOWED_KEYS, 'payload must only contain choice, os, createdAt');
  for (const banned of ['email', 'uid', 'userAgent', 'voterId', 'timestamp']) {
    assert.equal(banned in payload, false, `payload must not contain ${banned}`);
  }
  assert.equal(JSON.stringify(payload).includes('reader@example.com'), false);
  assert.equal(typeof payload.createdAt, 'string');
  assert.ok(!Number.isNaN(Date.parse(payload.createdAt)), 'createdAt must be an ISO string');
  assert.ok(payload.createdAt.length <= 40);
  assert.ok(payload.os.length <= 16);
};

const result = await submitPollVote('ios', { firebaseClient: signedInClient });
assert.equal(result.success, true);
assert.equal(result.localOnly, undefined);
assert.equal(result.payload.choice, 'ios');
assert.equal(result.payload.os, 'iOS');
assertCleanPayload(result.payload);
assert.equal(mockStorage.get(POLL_STORAGE_KEYS.VOTED), 'ios');
assert.equal(mockStorage.get(POLL_STORAGE_KEYS.DISMISSED), '1');
assert.equal(mockStorage.has(POLL_STORAGE_KEYS.VOTER_ID), false, 'legacy voter id should be cleared');
assert.equal(isPollDismissedOrVoted(), true);
assert.equal(buildMobileAppPollCard(), '', 'Card should not render once voted');

// Firestore writes: user doc and public votes doc, both keyed by uid, clean payloads
assert.equal(mockWrites.length, 2);
assert.deepEqual(mockWrites.map((w) => w.ref).sort(), [
  'polls/mobile_app/votes/user_test_123',
  'users/user_test_123/polls/mobile_app',
]);
for (const w of mockWrites) {
  assert.equal(w.payload.choice, 'ios');
  assertCleanPayload(w.payload);
  assert.equal(w.options?.merge, undefined, 'writes must overwrite so legacy PII fields are dropped');
}

// 5. Signed out: local only, no Firestore writes
for (const client of [makeClient(null), makeClient({ email: 'no-uid@example.com' }), undefined]) {
  mockStorage.clear();
  mockWrites.length = 0;
  const prevGlobal = globalThis.LibriqFirebase;
  delete globalThis.LibriqFirebase;
  const signedOut = await submitPollVote('android', { firebaseClient: client });
  globalThis.LibriqFirebase = prevGlobal;
  assert.equal(signedOut.success, true);
  assert.equal(signedOut.localOnly, true);
  assertCleanPayload(signedOut.payload);
  assert.equal(mockWrites.length, 0, 'no Firestore write when signed out');
  assert.equal(mockStorage.get(POLL_STORAGE_KEYS.VOTED), 'android');
}

// 6. Invalid choice rejected: no local state, no writes
for (const bad of ['web', 'IOS', '', null, undefined, 'ios; drop', { choice: 'ios' }]) {
  mockStorage.clear();
  mockWrites.length = 0;
  const rejected = await submitPollVote(bad, { firebaseClient: signedInClient });
  assert.equal(rejected.success, false);
  assert.equal(rejected.error, 'invalid_choice');
  assert.equal(mockWrites.length, 0);
  assert.equal(mockStorage.has(POLL_STORAGE_KEYS.VOTED), false);
}

// 7. A failing remote write does not throw, and reports the failure so a
//    queued emailed vote stays queued for the next attempt.
mockWrites.length = 0;
const failingClient = { ...signedInClient, setDoc: () => { throw new Error('permission-denied'); } };
const failed = await submitPollVote('web_ok', { firebaseClient: failingClient });
assert.equal(failed.success, false);
assert.equal(failed.error, 'write_failed');

console.log('All mobileAppPoll tests passed successfully!');
