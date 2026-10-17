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

export function getVoterId() {
  if (typeof localStorage === 'undefined') return 'voter_anonymous';
  let voterId = localStorage.getItem(POLL_STORAGE_KEYS.VOTER_ID);
  if (!voterId) {
    voterId = `voter_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;
    localStorage.setItem(POLL_STORAGE_KEYS.VOTER_ID, voterId);
  }
  return voterId;
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

export async function submitPollVote(choice, { firebaseClient, firestoreInstance } = {}) {
  const os = detectUserOS();
  const voterId = getVoterId();
  const timestamp = new Date().toISOString();

  // Save locally first
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(POLL_STORAGE_KEYS.VOTED, choice);
    localStorage.setItem(POLL_STORAGE_KEYS.DISMISSED, '1');
  }

  const votePayload = {
    choice, // 'ios' | 'android' | 'web_ok'
    os,
    voterId,
    timestamp,
    createdAt: timestamp,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };

  const client = firebaseClient || globalThis.LibriqFirebase;
  if (!client) {
    return { success: true, localOnly: true, payload: votePayload };
  }

  const user = client.getState?.()?.user || null;
  if (user?.uid) {
    votePayload.uid = user.uid;
    if (user.email) votePayload.email = user.email;
  }

  const writePromises = [];

  // 1. If user is logged in, write to their user profile tree (always permitted by Firestore rules)
  if (user?.uid && typeof client.doc === 'function' && typeof client.setDoc === 'function') {
    try {
      const db = firestoreInstance || client.getFirestoreClient?.();
      if (db) {
        const userRef = client.doc(db, 'users', user.uid, 'polls', 'mobile_app');
        writePromises.push(client.setDoc(userRef, votePayload, { merge: true }).catch(() => null));
      }
    } catch {}
  }

  // 2. Also write to top-level public polls collection: polls/mobile_app/votes/{voteId}
  if (typeof client.doc === 'function' && typeof client.setDoc === 'function') {
    try {
      const db = firestoreInstance || client.getFirestoreClient?.();
      if (db) {
        const targetId = user?.uid || voterId;
        const pollRef = client.doc(db, 'polls', 'mobile_app', 'votes', targetId);
        writePromises.push(client.setDoc(pollRef, votePayload, { merge: true }).catch(() => null));
      }
    } catch {}
  }

  if (writePromises.length > 0) {
    await Promise.allSettled(writePromises);
  }

  return { success: true, payload: votePayload };
}
