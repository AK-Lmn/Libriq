// Runs the weekly digest route against the Firestore and Auth emulators with the
// real Firebase Admin SDK (no network, no credentials):
//   npm run test:rules
// The in-memory tests in tests/weekly-digest.test.js cover the logic; this
// covers the three Admin calls they stub: listUsers paging, getAll for the
// opt-in docs, and the field-limited books query.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createDigestAdmin } from '../api/_lib/digestAdmin.js';
import { createWeeklyDigestHandler, createDigestUnsubscribeHandler, unsubscribeToken } from '../api/_lib/weeklyDigest.js';

const NOW = Date.parse('2026-11-30T14:00:00.000Z');
const daysAgo = n => new Date(NOW - n * 86400000).toISOString();
let app; let auth; let db;

before(() => {
  // Its own project ID: the rules tests clear 'demo-libriq' between tests, in parallel with this file.
  app = initializeApp({ projectId: 'demo-libriq-digest' }, 'weekly-digest-test');
  auth = getAuth(app);
  db = getFirestore(app);
});
after(() => deleteApp(app));

async function reader(uid, { email, verified = true, digest, books = [], streak, goals, profile } = {}) {
  await auth.createUser({ uid, email, emailVerified: verified, displayName: uid });
  if (profile) await db.doc(`users/${uid}/profile/current`).set(profile);
  if (digest !== undefined) await db.doc(`users/${uid}/prefs/email`).set({ weeklyDigest: digest, updatedAt: daysAgo(1) });
  for (const [i, book] of books.entries()) {
    await db.doc(`users/${uid}/sync/v1/books/b${i}`).set({ id: `b${i}`, description: 'x'.repeat(500), notes: 'private', ...book });
  }
  if (streak) await db.doc(`users/${uid}/streak/current`).set(streak);
  if (goals) await db.doc(`users/${uid}/goals/current`).set(goals);
}

const res = () => {
  const out = { statusCode: 200, headers: {}, body: undefined };
  out.setHeader = (k, v) => { out.headers[k] = v; return out; };
  out.status = code => { out.statusCode = code; return out; };
  out.json = body => { out.body = body; return out; };
  out.send = body => { out.body = body; return out; };
  out.end = body => { out.body = body; return out; };
  return out;
};

test('the route reads real Auth users and Firestore docs and mails only the right readers', async () => {
  await reader('busy', { email: 'busy@example.test', digest: true, profile: { displayName: 'Bea Busy', bio: 'x' },
    books: [
      { title: 'Done', author: 'A', status: 'finished', dateFinished: daysAgo(1), pageCount: 300,
        quotes: [{ id: 'q1', text: 'A line worth keeping.', page: 9, createdAt: daysAgo(2) }], notes: 'private', notesUpdatedAt: daysAgo(2) },
      { title: 'Now', status: 'reading', currentPage: 10, pageCount: 40, dateAdded: daysAgo(3) },
    ],
    streak: { currentStreak: 4, longestStreak: 9, lastReadDate: daysAgo(0) }, goals: { year: 2026, yearly: 24 } });
  await reader('off', { email: 'off@example.test', digest: false, books: [{ title: 'Done', status: 'finished', dateFinished: daysAgo(1) }] });
  await reader('never-asked', { email: 'never@example.test', books: [{ title: 'Done', status: 'finished', dateFinished: daysAgo(1) }] });
  await reader('unverified', { email: 'unverified@example.test', verified: false, digest: true, books: [{ title: 'Done', status: 'finished', dateFinished: daysAgo(1) }] });
  await reader('quiet', { email: 'quiet@example.test', digest: true, books: [{ title: 'Shelf', status: 'wishlist' }] });
  await reader('nosync', { email: 'nosync@example.test', digest: true });

  const sent = [];
  const handler = createWeeklyDigestHandler({
    getAdmin: async () => createDigestAdmin({ auth, db }),
    sendBatch: async (messages, key) => { sent.push({ messages, key }); },
    env: { CRON_SECRET: 's', RESEND_API_KEY: 'k', VERCEL_ENV: 'production' },
    now: () => NOW,
  });
  const out = res();
  await handler({ method: 'GET', headers: { authorization: 'Bearer s' }, query: {} }, out);
  assert.deepEqual(out.body, { ok: true, dryRun: false, optedIn: 4, mailed: 1, skippedQuiet: 2, skippedUnverified: 1, failed: 0 });
  const [message] = sent.flatMap(call => call.messages);
  assert.deepEqual(message.to, ['busy@example.test']);
  assert.match(message.subject, /1 book finished/);
  assert.match(message.text, /Now, 25% read/);
  assert.match(message.text, /4-day streak/);
  assert.match(message.text, /2026 goal/);
  assert.match(message.text, /^Hi Bea,/, 'the name set in LibriQ, not the sign-in name');
  assert.match(message.text, /300 pages/);
  assert.match(message.text, /A line worth keeping\./);
  assert.match(message.text, /Done, p\. 9/);
  assert.match(message.text, /Updated on 1 book/);
  assert.doesNotMatch(message.html + message.text, /private/, 'private notes never reach the email');
});

test('listUsers paging reaches every account', async () => {
  // 1,000 is the page size; make a few more than that would be slow, so
  // check the paging contract with the real SDK using a small page instead.
  const first = await auth.listUsers(2);
  assert.equal(first.users.length, 2);
  assert.ok(first.pageToken, 'the SDK hands back a token while more accounts remain');
  const admin = createDigestAdmin({ auth, db });
  const seen = [];
  let token;
  do {
    const page = await admin.listAuthUsers(token);
    seen.push(...page.users.map(user => user.uid));
    token = page.nextPageToken;
  } while (token);
  assert.deepEqual(seen.sort(), ['busy', 'never-asked', 'nosync', 'off', 'quiet', 'unverified']);
});

test('the unsubscribe page turns a stored opt-in off', async () => {
  const handler = createDigestUnsubscribeHandler({
    setDigestOff: (uid, updatedAt) => db.doc(`users/${uid}/prefs/email`).set({ weeklyDigest: false, updatedAt }),
    env: { CRON_SECRET: 's' },
    now: () => NOW,
  });
  const out = res();
  await handler({ method: 'POST', query: { u: 'busy', t: unsubscribeToken('s', 'busy') }, headers: {} }, out);
  assert.equal(out.statusCode, 200);
  const doc = await db.doc('users/busy/prefs/email').get();
  assert.deepEqual(doc.data(), { weeklyDigest: false, updatedAt: new Date(NOW).toISOString() });
  // The stored document still satisfies the Firestore rule's shape (two keys, a bool and a short string).
  assert.deepEqual(Object.keys(doc.data()).sort(), ['updatedAt', 'weeklyDigest']);
  assert.equal(typeof doc.data().weeklyDigest, 'boolean');
  assert.ok(doc.data().updatedAt.length <= 40);
});
