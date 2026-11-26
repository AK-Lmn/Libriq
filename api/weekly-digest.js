// Vercel cron: GET /api/weekly-digest, Mondays (see vercel.json "crons").
// Needs CRON_SECRET (Vercel sends it as a Bearer token), RESEND_API_KEY, and
// the same Firebase Admin credentials as /api/delete-account. Add
// ?dryRun=1 to count who would be mailed without sending anything.
import { createWeeklyDigestHandler } from './_lib/weeklyDigest.js';
import { readAdminCredentials } from './_lib/adminCredentials.js';
import { createDigestAdmin } from './_lib/digestAdmin.js';

let adminPromise = null;

async function loadAdmin() {
  const serviceAccount = readAdminCredentials();
  if (!serviceAccount) return null;
  const { initializeApp, getApps, cert } = await import('firebase-admin/app');
  const { getAuth } = await import('firebase-admin/auth');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
  return createDigestAdmin({ auth: getAuth(app), db: getFirestore(app) });
}

function getAdmin() {
  if (!adminPromise) {
    adminPromise = loadAdmin().catch(err => {
      adminPromise = null;
      console.error('[weekly-digest] admin init failed', err?.message || String(err));
      return null;
    });
  }
  return adminPromise;
}

// https://resend.com/docs/api-reference/emails/send-batch-emails
async function sendBatch(messages, idempotencyKey) {
  const response = await fetch('https://api.resend.com/emails/batch', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error(`Resend answered ${response.status}`);
}

export default createWeeklyDigestHandler({ getAdmin, sendBatch });
