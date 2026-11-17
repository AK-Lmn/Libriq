// frontend/js/services/mobileAppPoll.js

export const POLL_STORAGE_KEYS = {
  VOTED: 'libriq_poll_mobile_app_voted',
  DISMISSED: 'libriq_poll_mobile_app_dismissed',
  VOTER_ID: 'libriq_poll_voter_id',
};

export function detectUserOS(ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) {
  const val = String(ua || '').toLowerCase();
  if (/iphone|ipad|ipod/.test(val)) return 'iOS';
  if (/android/.test(val)) return 'Android';
  if (/macintosh|mac os x/.test(val)) return 'macOS';
  if (/windows/.test(val)) return 'Windows';
  if (/linux/.test(val)) return 'Linux';
  return 'Other';
}

export function isPollDismissedOrVoted() {
  if (typeof localStorage === 'undefined') return false;
  return Boolean(
    localStorage.getItem(POLL_STORAGE_KEYS.DISMISSED) === '1' ||
    localStorage.getItem(POLL_STORAGE_KEYS.VOTED)
  );
}

export function dismissPoll() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(POLL_STORAGE_KEYS.DISMISSED, '1');
  }
}

export const POLL_CHOICES = Object.freeze(['ios', 'android', 'web_ok']);

// Votes carry only what firestore.rules allows on polls/{pollId}/votes/{uid}:
// { choice, os, createdAt }. No email, uid, user agent or device id.
export async function submitPollVote(choice, { firebaseClient, firestoreInstance } = {}) {
  if (!POLL_CHOICES.includes(choice)) {
    return { success: false, error: 'invalid_choice' };
  }

  const votePayload = {
    choice,
    os: detectUserOS(),
    createdAt: new Date().toISOString(),
  };

  // Save locally first so the card hides even when the remote write is skipped.
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(POLL_STORAGE_KEYS.VOTED, choice);
    localStorage.setItem(POLL_STORAGE_KEYS.DISMISSED, '1');
    // Drop the legacy anonymous voter id; it is no longer used.
    localStorage.removeItem?.(POLL_STORAGE_KEYS.VOTER_ID);
  }

  const client = firebaseClient || globalThis.LibriqFirebase;
  const uid = client?.getState?.()?.user?.uid || null;
  const db = uid ? (firestoreInstance || client.getFirestoreClient?.()) : null;

  // Accounts are mandatory: only signed-in users write to Firestore.
  if (!uid || !db || typeof client.doc !== 'function' || typeof client.setDoc !== 'function') {
    return { success: true, localOnly: true, payload: votePayload };
  }

  const refs = [
    client.doc(db, 'users', uid, 'polls', 'mobile_app'),
    client.doc(db, 'polls', 'mobile_app', 'votes', uid),
  ];
  const settled = await Promise.allSettled(refs.map((ref) => Promise.resolve().then(() => client.setDoc(ref, votePayload))));
  if (settled.every(result => result.status === 'rejected')) {
    return { success: false, error: 'write_failed', payload: votePayload };
  }

  return { success: true, payload: votePayload };
}
