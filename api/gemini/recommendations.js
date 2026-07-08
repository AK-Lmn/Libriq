import {
  readJsonBody,
  callGemini,
  createFirestoreGeminiStore,
  getFirebaseAdminDependencies,
  handleGeminiRequest,
  DEFAULT_QUOTA,
  SAFE_ERROR_CODES,
} from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('allow', 'POST');
    res.end(JSON.stringify({
      error: 'Method not allowed.',
      details: 'POST only.',
    }));
    return;
  }

  try {
    const adminDeps = await getFirebaseAdminDependencies();
    if (!adminDeps?.auth || !adminDeps?.firestore) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'server_error', code: SAFE_ERROR_CODES.FIREBASE_ADMIN_CONFIG_ERROR }));
      return;
    }

    const body = await readJsonBody(req);

    const store = await createFirestoreGeminiStore(adminDeps.firestore);
    const result = await handleGeminiRequest({
      req,
      authHeader: req.headers?.authorization || req.headers?.Authorization || '',
      body,
      auth: adminDeps.auth,
      store,
      callGeminiFn: callGemini,
      quotaLimit: DEFAULT_QUOTA,
    });

    res.statusCode = result.statusCode;
    res.end(JSON.stringify(result.body));
  } catch (err) {
    const statusCode = Number(err?.statusCode || 500);
    res.statusCode = statusCode;
    const code = err?.code || SAFE_ERROR_CODES.UNKNOWN_SERVER_ERROR;
    res.end(JSON.stringify({
      error: 'server_error',
      code,
    }));
  }
}
