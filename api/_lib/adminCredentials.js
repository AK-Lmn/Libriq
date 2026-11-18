// Firebase Admin credentials for server routes. Accepts either
// FIREBASE_SERVICE_ACCOUNT (the service-account JSON, raw or base64) or the
// three FIREBASE_ADMIN_* variables already set in the Vercel project.
// Returns null when nothing usable is configured.

function fromServiceAccountJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const json = text.startsWith('{') ? text : Buffer.from(text, 'base64').toString('utf8');
  return JSON.parse(json);
}

function normalizePrivateKey(value) {
  let key = String(value || '').trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  // Env UIs often store the PEM on one line with literal \n sequences.
  return key.replace(/\\n/g, '\n');
}

export function readAdminCredentials(env = process.env) {
  const fromJson = fromServiceAccountJson(env.FIREBASE_SERVICE_ACCOUNT);
  if (fromJson) return fromJson;

  const projectId = String(env.FIREBASE_ADMIN_PROJECT_ID || '').trim();
  const clientEmail = String(env.FIREBASE_ADMIN_CLIENT_EMAIL || '').trim();
  const privateKey = normalizePrivateKey(env.FIREBASE_ADMIN_PRIVATE_KEY);
  if (!projectId || !clientEmail || !privateKey.includes('PRIVATE KEY-----')) return null;
  return { project_id: projectId, client_email: clientEmail, private_key: privateKey };
}
