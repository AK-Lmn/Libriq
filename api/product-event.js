// Vercel serverless function: POST /api/product-event (see _lib/productEvent.js).
// Uses the same Firebase Admin credentials as /api/delete-account.
import { createProductEventHandler } from './_lib/productEvent.js';
import { readAdminCredentials } from './_lib/adminCredentials.js';

let dbPromise = null;

async function loadDb() {
  const serviceAccount = readAdminCredentials();
  if (!serviceAccount) return null;
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  return { db: getFirestore(app), FieldValue };
}

async function increment(name, day) {
  if (!dbPromise) dbPromise = loadDb().catch(error => { dbPromise = null; throw error; });
  const admin = await dbPromise;
  if (!admin) return;
  await admin.db.doc(`metrics/events-${day}`).set(
    { [name]: admin.FieldValue.increment(1), updatedAt: admin.FieldValue.serverTimestamp() },
    { merge: true },
  );
}

export default createProductEventHandler({ increment });
