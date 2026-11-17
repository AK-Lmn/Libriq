// Things a visitor chose before their account was ready: a book picked in the
// sign-in demo search, or a vote from the poll email. Both wait in
// localStorage (which survives the sign-up and email-verification round trip)
// and are claimed once a signed-in account is active.

import { POLL_CHOICES } from './mobileAppPoll.js';

export const PENDING_KEYS = Object.freeze({
  BOOK: 'libriq_pending_demo_book',
  POLL_VOTE: 'libriq_pending_poll_vote',
});

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function defaultStorage() {
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function write(storage, key, value) {
  try { storage?.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

// Reads and removes an entry; returns its value only while it is fresh.
function take(storage, key, now) {
  if (!storage) return null;
  let entry = null;
  try { entry = JSON.parse(storage.getItem(key) || 'null'); } catch { entry = null; }
  try { storage.removeItem(key); } catch { /* ignore */ }
  if (!entry || typeof entry.savedAt !== 'number' || now - entry.savedAt > MAX_AGE_MS) return null;
  return entry.value ?? null;
}

function peek(storage, key, now) {
  if (!storage) return null;
  try {
    const entry = JSON.parse(storage.getItem(key) || 'null');
    if (entry && typeof entry.savedAt === 'number' && now - entry.savedAt <= MAX_AGE_MS) return entry.value ?? null;
  } catch { /* fall through */ }
  try { storage.removeItem(key); } catch { /* ignore */ }
  return null;
}

export function savePendingBook(book, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!book || typeof book.title !== 'string' || !book.title.trim()) return false;
  const value = JSON.parse(JSON.stringify(book));
  write(storage, PENDING_KEYS.BOOK, { savedAt: now, value });
  return true;
}

export function claimPendingBook({ storage = defaultStorage(), now = Date.now(), getBooks, isSameBook, addBook }) {
  const book = take(storage, PENDING_KEYS.BOOK, now);
  if (!book?.title) return { status: 'none' };
  if ((getBooks?.() || []).some(existing => isSameBook?.(existing, book))) return { status: 'duplicate', book };
  const added = addBook({
    ...book,
    status: 'wishlist',
    currentPage: 0,
    rating: null,
    dateStarted: null,
    dateFinished: null,
    tags: [],
  });
  return added ? { status: 'added', book: added } : { status: 'failed', book };
}

export function queuePollVote(choice, { storage = defaultStorage(), now = Date.now() } = {}) {
  if (!POLL_CHOICES.includes(choice)) return false;
  write(storage, PENDING_KEYS.POLL_VOTE, { savedAt: now, value: choice });
  return true;
}

// Submits a queued vote once signed in. The vote stays queued until the
// account write actually happens, so a slow auth restore can't lose it.
export async function flushPendingPollVote({ storage = defaultStorage(), now = Date.now(), isSignedIn, submit }) {
  if (!isSignedIn) return { flushed: false };
  const choice = peek(storage, PENDING_KEYS.POLL_VOTE, now);
  if (!choice) return { flushed: false };
  const result = await submit(choice);
  if (!result?.success || result.localOnly) return { flushed: false, result };
  try { storage?.removeItem(PENDING_KEYS.POLL_VOTE); } catch { /* ignore */ }
  return { flushed: true, choice, result };
}
