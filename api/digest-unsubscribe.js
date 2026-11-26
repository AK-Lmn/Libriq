// Vercel serverless function: GET and POST /api/digest-unsubscribe?u=…&t=…
// The link in each weekly email (see _lib/weeklyDigest.js). Turns the
// reader's weekly email off by writing users/{uid}/prefs/email.
import { createDigestUnsubscribeHandler } from './_lib/weeklyDigest.js';
import { readAdminCredentials } from './_lib/adminCredentials.js';

let dbPromise = null;

async function loadDb() {
  const serviceAccount = readAdminCredentials();
  if (!serviceAccount) throw new Error('Firebase admin credentials are not configured.');
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore(getApps()[0] || initializeApp({ credential: cert(serviceAccount) }));
}

async function setDigestOff(uid, updatedAt) {
  if (!dbPromise) dbPromise = loadDb().catch(error => { dbPromise = null; throw error; });
  const db = await dbPromise;
  await db.doc(`users/${uid}/prefs/email`).set({ weeklyDigest: false, updatedAt });
}

export default createDigestUnsubscribeHandler({ setDigestOff });
