// Vercel serverless function: POST /api/delete-account
// Needs Firebase Admin credentials in the Vercel environment: either
// FIREBASE_SERVICE_ACCOUNT or the FIREBASE_ADMIN_* trio (see
// _lib/adminCredentials.js). Without them the route answers 503 and the
// browser falls back to deleting from the client.
import { createDeleteAccountHandler } from './_lib/deleteAccount.js';
import { readAdminCredentials } from './_lib/adminCredentials.js';

let adminPromise = null;

async function loadAdmin() {
  const serviceAccount = readAdminCredentials();
  if (!serviceAccount) return null;
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  const auth = getAuth(app);
  const db = getFirestore(app);
  return {
    verifyIdToken: (token, checkRevoked) => auth.verifyIdToken(token, checkRevoked),
    recursiveDelete: path => db.recursiveDelete(db.doc(path)),
    deleteDoc: path => db.doc(path).delete(),
    deleteUser: uid => auth.deleteUser(uid),
  };
}

function getAdmin() {
  if (!adminPromise) {
    adminPromise = loadAdmin().catch(err => {
      adminPromise = null;
      console.error('[delete-account] admin init failed', err?.message || String(err));
      return null;
    });
  }
  return adminPromise;
}

export default createDeleteAccountHandler({ getAdmin });
