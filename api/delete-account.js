// Vercel serverless function: POST /api/delete-account
// Needs FIREBASE_SERVICE_ACCOUNT (the service-account JSON, raw or base64) in
// the Vercel project's environment. Without it the route answers 503 and the
// browser falls back to deleting from the client.
import { createDeleteAccountHandler } from './_lib/deleteAccount.js';

let adminPromise = null;

function readServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
  if (!raw) return null;
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(json);
}

async function loadAdmin() {
  const serviceAccount = readServiceAccount();
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
