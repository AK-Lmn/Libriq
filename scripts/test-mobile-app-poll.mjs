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
  getVoterId,
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

// 2. Voter ID stability
mockStorage.clear();
const voterId1 = getVoterId();
assert.ok(voterId1.startsWith('voter_'));
const voterId2 = getVoterId();
assert.equal(voterId1, voterId2, 'Voter ID must be persistent in localStorage');

// 3. Poll State (initial, dismissed, voted)
mockStorage.clear();
assert.equal(isPollDismissedOrVoted(), false);

// Card should render when not voted or dismissed
const cardHtmlInitial = buildMobileAppPollCard();
assert.ok(cardHtmlInitial.includes('dashboard-poll-card'));
assert.ok(cardHtmlInitial.includes('data-poll-choice="ios"'));
assert.ok(cardHtmlInitial.includes('data-poll-choice="android"'));
assert.ok(cardHtmlInitial.includes('data-poll-choice="web_ok"'));

// Dismiss poll
dismissPoll();
assert.equal(isPollDismissedOrVoted(), true);
assert.equal(mockStorage.get(POLL_STORAGE_KEYS.DISMISSED), '1');
assert.equal(buildMobileAppPollCard(), '', 'Card should not render once dismissed');

// 4. Submit Poll Vote
mockStorage.clear();
const mockWrites = [];
const mockFirebaseClient = {
  getState: () => ({ user: { uid: 'user_test_123', email: 'reader@example.com' } }),
  getFirestoreClient: () => ({}),
  doc: (db, ...segments) => segments.join('/'),
  setDoc: async (ref, payload) => {
    mockWrites.push({ ref, payload });
  },
};

const result = await submitPollVote('ios', { firebaseClient: mockFirebaseClient });
assert.equal(result.success, true);
assert.equal(result.payload.choice, 'ios');
assert.equal(result.payload.uid, 'user_test_123');
assert.equal(result.payload.email, 'reader@example.com');
assert.equal(mockStorage.get(POLL_STORAGE_KEYS.VOTED), 'ios');
assert.equal(mockStorage.get(POLL_STORAGE_KEYS.DISMISSED), '1');
assert.equal(isPollDismissedOrVoted(), true);
assert.equal(buildMobileAppPollCard(), '', 'Card should not render once voted');

// Verify Firestore writes: should have written to user doc and public votes doc
assert.equal(mockWrites.length, 2);
assert.equal(mockWrites[0].ref, 'users/user_test_123/polls/mobile_app');
assert.equal(mockWrites[0].payload.choice, 'ios');
assert.equal(mockWrites[1].ref, 'polls/mobile_app/votes/user_test_123');
assert.equal(mockWrites[1].payload.choice, 'ios');

console.log('All mobileAppPoll tests passed successfully!');
