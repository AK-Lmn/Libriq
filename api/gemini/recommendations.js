import {
  readJsonBody,
  callGemini,
  createFirestoreGeminiStore,
  getFirebaseAdminDependencies,
  handleGeminiRequest,
  DEFAULT_QUOTA,
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
    const body = await readJsonBody(req);
    const adminDeps = await getFirebaseAdminDependencies();
    if (!adminDeps?.auth || !adminDeps?.firestore) {
      res.statusCode = 503;
      res.end(JSON.stringify({ error: 'Gemini backend is not configured yet.' }));
      return;
    }

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
    res.end(JSON.stringify({
      error: statusCode === 503
        ? 'Gemini recommendations are not available right now.'
        : statusCode === 413
          ? 'Request body too large.'
          : 'Unable to generate recommendations right now.',
    }));
  }
}
