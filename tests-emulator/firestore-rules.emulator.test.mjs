// Runs against the Firestore emulator (needs Java 11+):
//   npm run test:rules
import { test, before, after, beforeEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, orderBy, limit, writeBatch } from 'firebase/firestore';

let env;
const ALICE = 'alice';
const BOB = 'bob';
const NOW = '2026-11-19T10:00:00.000Z';

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-libriq',
    firestore: { rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
after(() => env?.cleanup());
beforeEach(() => env.clearFirestore());

const db = uid => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();

// Same shape as normalizeBookForSync() in frontend/js/sync.js.
function realBook(id = 'book-1', overrides = {}) {
  return {
    id, title: 'Project Hail Mary', author: 'Andy Weir',
    cover: 'https://covers.openlibrary.org/b/id/1-L.jpg', coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
    imageLinks: null, isbn: '9780593135204', isbns: ['9780593135204'],
    identifiers: [{ type: 'ISBN_13', identifier: '9780593135204' }],
    source: 'openlibrary', sources: ['openlibrary'], sourceBadges: ['Open Library'], sourceIds: { openlibrary: 'OL1W' },
    status: 'reading', currentPage: 120, pages: 496, pageCount: 496,
    description: 'A lone astronaut. '.repeat(200), genres: ['Science Fiction'], subjects: ['Space'],
    subjectPeople: [], subjectPlaces: [], subjectTimes: [],
    language: 'en', publisher: 'Ballantine', publishYear: 2021, firstPublishYear: 2021, editionCount: 12, coverId: '1',
    rating: 5, review: null, isFavorite: true, shelves: ['sci-fi'], tags: [],
    notes: 'Long notes. '.repeat(2000), notesUpdatedAt: NOW,
    quotes: Array.from({ length: 300 }, (_, i) => ({ id: `q${i}`, text: 'A highlighted passage from the book.', location: String(i) })),
    createdAt: NOW, dateAdded: NOW, dateStarted: NOW, dateFinished: null, updatedAt: NOW, deletedAt: null,
    googleBooksId: null, openLibraryId: 'OL1M', openLibraryWorkKey: '/works/OL1W', openLibraryEditionKey: null,
    openLibraryAuthorKeys: ['/authors/OL1A'], gutendexId: null, gutenbergId: null, internetArchiveId: null,
    internetArchiveIds: [], archiveUrl: null, readableSourceLinks: [], downloadLinks: {},
    deviceId: 'device-1', sourceDeviceId: 'device-1', appVersion: '4.8.4',
    ...overrides,
  };
}
const tombstone = id => ({ id, deletedAt: NOW, updatedAt: NOW, deviceId: 'device-1', sourceDeviceId: 'device-1', appVersion: '4.8.4' });
const bookRef = (fs, uid, id) => doc(fs, 'users', uid, 'sync', 'v1', 'books', id);

test('owner can write, read and delete a realistic book and a tombstone', async () => {
  const fs = db(ALICE);
  await assertSucceeds(setDoc(bookRef(fs, ALICE, 'book-1'), realBook()));
  await assertSucceeds(getDoc(bookRef(fs, ALICE, 'book-1')));
  await assertSucceeds(setDoc(bookRef(fs, ALICE, 'book-2'), tombstone('book-2')));
  await assertSucceeds(deleteDoc(bookRef(fs, ALICE, 'book-1')));
});

test('batched sync upload of 400 books succeeds', async () => {
  const fs = db(ALICE);
  const batch = writeBatch(fs);
  for (let i = 0; i < 400; i++) batch.set(bookRef(fs, ALICE, `b${i}`), realBook(`b${i}`, { notes: '', quotes: [] }));
  await assertSucceeds(batch.commit());
});

test('other users and signed-out visitors cannot touch someone else\'s data', async () => {
  await env.withSecurityRulesDisabled(c => setDoc(bookRef(c.firestore(), ALICE, 'book-1'), realBook()));
  await assertFails(getDoc(bookRef(db(BOB), ALICE, 'book-1')));
  await assertFails(setDoc(bookRef(db(BOB), ALICE, 'book-1'), realBook()));
  await assertFails(deleteDoc(bookRef(db(BOB), ALICE, 'book-1')));
  await assertFails(getDoc(bookRef(anon(), ALICE, 'book-1')));
  await assertFails(getDocs(collection(db(BOB), 'users', ALICE, 'sync', 'v1', 'books')));
});

test('paths that are not on the allowlist are denied, even for the owner', async () => {
  const fs = db(ALICE);
  await assertFails(setDoc(doc(fs, 'users', ALICE), { anything: true }));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'stash', 'x'), { big: 'data' }));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'profile', 'other'), { displayName: 'x' }));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'sync', 'v2', 'books', 'b'), realBook('b')));
  await assertFails(setDoc(doc(fs, 'anything', 'x'), { a: 1 }));
});

test('book writes with unknown fields, a mismatched id or oversized values are denied', async () => {
  const fs = db(ALICE);
  await assertFails(setDoc(bookRef(fs, ALICE, 'b1'), realBook('b1', { extra: 'x' })));
  await assertFails(setDoc(bookRef(fs, ALICE, 'b1'), realBook('other-id')));
  await assertFails(setDoc(bookRef(fs, ALICE, 'b1'), realBook('b1', { title: 'x'.repeat(2001) })));
  await assertFails(setDoc(bookRef(fs, ALICE, 'b1'), realBook('b1', { notes: 'x'.repeat(200001) })));
  await assertFails(setDoc(bookRef(fs, ALICE, 'b1'), realBook('b1', { tags: Array(501).fill('t') })));
  await assertFails(setDoc(bookRef(fs, ALICE, 'b1'), realBook('b1', { isFavorite: 'yes' })));
});

test('activity: owner writes with merge and reads with the app\'s query', async () => {
  const fs = db(ALICE);
  const event = {
    id: 'act_1', type: 'book_added', timestamp: NOW, createdAt: NOW, updatedAt: NOW,
    bookId: 'book-1', bookTitle: 'Project Hail Mary', bookAuthor: 'Andy Weir', coverUrl: null,
    status: 'reading', message: 'Added a book', payload: { from: 'search' }, sourceDeviceId: 'device-1', pending: false,
  };
  await assertSucceeds(setDoc(doc(fs, 'users', ALICE, 'activity', 'act_1'), event, { merge: true }));
  await assertSucceeds(getDocs(query(collection(fs, 'users', ALICE, 'activity'), orderBy('timestamp', 'desc'), limit(200))));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'activity', 'act_2'), event));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'activity', 'act_1'), { ...event, message: 'x'.repeat(2001) }));
});

test('profile, goals and streak: merge writes keep working with fields from older versions', async () => {
  const fs = db(ALICE);
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), 'users', ALICE, 'profile', 'current'), { joinDate: NOW, legacyFlag: true }));
  await assertSucceeds(setDoc(doc(fs, 'users', ALICE, 'profile', 'current'),
    { displayName: 'Kim', name: 'Kim', bio: null, avatar: null, createdAt: NOW, updatedAt: NOW }, { merge: true }));
  await assertSucceeds(setDoc(doc(fs, 'users', ALICE, 'goals', 'current'),
    { year: 2026, yearly: 24, target: 24, completed: null, createdAt: NOW, updatedAt: NOW }, { merge: true }));
  await assertSucceeds(setDoc(doc(fs, 'users', ALICE, 'streak', 'current'),
    { currentStreak: 3, longestStreak: 9, lastReadDate: '2026-11-19', createdAt: NOW, updatedAt: NOW }, { merge: true }));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'profile', 'current'), { bio: 'x'.repeat(5001) }, { merge: true }));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'goals', 'current'), { yearly: 'x'.repeat(201) }, { merge: true }));
});

test('cloud backup: full payload accepted, unknown top-level keys rejected', async () => {
  const fs = db(ALICE);
  const payload = {
    app: 'LibriQ', version: '4.8.4', backupVersion: 4, appVersion: '4.8.4', schemaVersion: 2, deviceId: 'device-1',
    createdAt: NOW, updatedAt: NOW, bookCount: 2, notesCount: 1, quotesCount: 0, activityCount: 1,
    lastLocalUpdatedAt: NOW, syncReady: false,
    data: { books: [realBook('a', { quotes: [] }), realBook('b', { notes: '', quotes: [] })], profile: { displayName: 'Kim' }, goals: {}, streak: {}, activity: [{ id: 'act_1' }] },
  };
  await assertSucceeds(setDoc(doc(fs, 'users', ALICE, 'backups', 'current'), payload));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'backups', 'current'), { ...payload, extra: 1 }));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'backups', 'current'), { ...payload, data: { ...payload.data, other: [] } }));
});

test('poll vote: valid choice accepted on both paths, anything else rejected', async () => {
  const fs = db(ALICE);
  const vote = { choice: 'ios', os: 'windows', createdAt: NOW };
  await assertSucceeds(setDoc(doc(fs, 'users', ALICE, 'polls', 'mobile_app'), vote));
  await assertSucceeds(setDoc(doc(fs, 'polls', 'mobile_app', 'votes', ALICE), vote));
  await assertFails(setDoc(doc(fs, 'polls', 'mobile_app', 'votes', BOB), vote));
  await assertFails(getDoc(doc(fs, 'polls', 'mobile_app', 'votes', ALICE)));
  await assertFails(setDoc(doc(fs, 'users', ALICE, 'polls', 'mobile_app'), { ...vote, choice: 'blackberry' }));
});
