// Vercel serverless function: POST /api/client-error (see api/_lib/clientError.js).
// Stores reports with the same Firebase Admin credentials as /api/delete-account.
import { createClientErrorHandler } from './_lib/clientError.js';
import { readAdminCredentials } from './_lib/adminCredentials.js';

const RETAIN_DAYS = 30;
let adminPromise = null;

async function loadAdmin() {
  const serviceAccount = readAdminCredentials();
  if (!serviceAccount) return null;
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue, Timestamp } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  return { db: getFirestore(app), FieldValue, Timestamp };
}

async function store(entry, day) {
  if (!adminPromise) adminPromise = loadAdmin().catch(error => { adminPromise = null; throw error; });
  const admin = await adminPromise;
  if (!admin) return;
  const { fingerprint, ...fields } = entry;
  await admin.db.doc(`clientErrors/${day}-${fingerprint}`).set({
    ...fields,
    day,
    count: admin.FieldValue.increment(1),
    lastSeen: admin.FieldValue.serverTimestamp(),
    // A Firestore TTL policy on expireAt deletes old reports automatically.
    expireAt: admin.Timestamp.fromMillis(Date.now() + RETAIN_DAYS * 86400000),
  }, { merge: true });
}

export default createClientErrorHandler({ store });
