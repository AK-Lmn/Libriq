const MAX_BOOKS = 15;
const MAX_RECOMMENDATIONS = 8;
const MAX_BODY_BYTES = 24 * 1024;
const DEFAULT_MODEL = 'gemini-2.0-flash';
const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_QUOTA = 5;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let _adminDepsPromise = null;

export function getGeminiEnv() {
  return {
    apiKey: String(process.env.GEMINI_API_KEY || '').trim(),
    model: String(process.env.GEMINI_MODEL || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
    apiBase: String(process.env.GEMINI_API_BASE || DEFAULT_API_BASE).trim() || DEFAULT_API_BASE,
  };
}

export function getFirebaseAdminEnv() {
  const serviceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || '');
  const projectId = String(process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || '').trim();

  return {
    serviceAccountJson,
    clientEmail,
    privateKey,
    projectId,
  };
}

export function normalizeBookInput(book) {
  if (!book || typeof book !== 'object' || Array.isArray(book)) return null;
  const result = {
    title: cleanText(book.title),
    author: cleanText(book.author),
    genres: cleanStringList(book.genres),
    subjects: cleanStringList(book.subjects),
    status: cleanText(book.status),
    rating: cleanRating(book.rating),
    isFavorite: Boolean(book.isFavorite),
  };
  if (!result.title || !result.author) return null;
  return result;
}

export function validateRequestBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be an object.' };
  }

  const mode = cleanText(body.mode);
  if (!mode) return { ok: false, error: 'mode is required.' };

  if (!Array.isArray(body.books)) {
    return { ok: false, error: 'books must be an array.' };
  }
  if (body.books.length > MAX_BOOKS) {
    return { ok: false, error: `books may not exceed ${MAX_BOOKS} items.` };
  }

  const books = [];
  for (const entry of body.books) {
    const normalized = normalizeBookInput(entry);
    if (!normalized) {
      return { ok: false, error: 'Each book must include title and author only from the allowed fields.' };
    }
    books.push(normalized);
  }

  const stripped = {
    mode,
    books,
  };

  return { ok: true, value: stripped };
}

export function buildGeminiPrompt(payload) {
  const safeBooks = Array.isArray(payload.books) ? payload.books.slice(0, MAX_BOOKS) : [];
  return {
    systemInstruction: {
      parts: [{
        text: [
          'You are LibriQ, a book recommendation assistant.',
          'Return concise JSON only.',
          `Return no more than ${MAX_RECOMMENDATIONS} recommendations.`,
          'Avoid recommending books the user already has in the supplied context.',
          'Use only the provided reading signals.',
        ].join(' '),
      }],
    },
    contents: [{
      role: 'user',
      parts: [{
        text: JSON.stringify({
          mode: payload.mode,
          books: safeBooks,
        }),
      }],
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 1200,
      responseMimeType: 'application/json',
    },
  };
}

export function parseGeminiRecommendations(responseText) {
  const parsed = safeJsonParse(responseText);
  const recommendations = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
  return {
    recommendations: recommendations
      .map(normalizeRecommendation)
      .filter(Boolean)
      .slice(0, MAX_RECOMMENDATIONS),
  };
}

export function normalizeRecommendation(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const title = cleanText(entry.title);
  const author = cleanText(entry.author);
  const reason = cleanText(entry.reason, 240);
  if (!title || !author || !reason) return null;
  const next = { title, author, reason };
  const sourceHint = cleanText(entry.sourceHint, 64);
  if (sourceHint) next.sourceHint = sourceHint;
  const confidence = cleanConfidence(entry.confidence);
  if (confidence !== null) next.confidence = confidence;
  return next;
}

export function cleanText(value, max = 160) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\s+/g, ' ').slice(0, max);
}

export function cleanStringList(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => cleanText(item, 64)).filter(Boolean))).slice(0, 8);
}

export function cleanRating(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 0 || number > 5) return null;
  return Math.round(number * 10) / 10;
}

export function cleanConfidence(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (number < 0 || number > 1) return null;
  return Math.round(number * 100) / 100;
}

export function safeJsonParse(text) {
  if (!text) return null;
  try {
    return JSON.parse(String(text));
  } catch {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

export function normalizePrivateKey(value) {
  return String(value || '')
    .trim()
    .replace(/\\n/g, '\n');
}

export function parseServiceAccountJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    return {
      projectId: String(parsed.project_id).trim(),
      clientEmail: String(parsed.client_email).trim(),
      privateKey: normalizePrivateKey(parsed.private_key),
    };
  } catch {
    return null;
  }
}

export function buildFirebaseAdminCredential() {
  const env = getFirebaseAdminEnv();
  const parsed = parseServiceAccountJson(env.serviceAccountJson);
  if (parsed) return parsed;
  if (env.projectId && env.clientEmail && env.privateKey) {
    return {
      projectId: env.projectId,
      clientEmail: env.clientEmail,
      privateKey: env.privateKey,
    };
  }
  return null;
}

export function getRequestSizeBytes(req) {
  const length = Number(req?.headers?.['content-length'] || req?.headers?.['Content-Length'] || 0);
  return Number.isFinite(length) ? length : 0;
}

export async function readJsonBody(req, limit = MAX_BODY_BYTES) {
  if (getRequestSizeBytes(req) > limit) {
    const error = new Error('Request body too large.');
    error.statusCode = 413;
    throw error;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
    const total = chunks.reduce((sum, buffer) => sum + buffer.length, 0);
    if (total > limit) {
      const error = new Error('Request body too large.');
      error.statusCode = 413;
      throw error;
    }
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  const parsed = safeJsonParse(raw);
  if (!parsed) {
    const error = new Error('Invalid JSON body.');
    error.statusCode = 400;
    throw error;
  }
  return parsed;
}

export async function callGemini(payload) {
  const env = getGeminiEnv();
  if (!env.apiKey) {
    const error = new Error('Gemini API key is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const response = await fetch(`${env.apiBase}/models/${encodeURIComponent(env.model)}:generateContent?key=${encodeURIComponent(env.apiKey)}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildGeminiPrompt(payload)),
  });

  if (!response.ok) {
    const error = new Error(`Gemini request failed with HTTP ${response.status}.`);
    error.statusCode = response.status;
    throw error;
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part?.text || '').join('') || data?.text || '';
  return parseGeminiRecommendations(text);
}

export function createQuotaStub(uid) {
  return {
    implemented: false,
    pendingFirebaseAdmin: true,
    uid: uid || null,
    note: 'Daily quota storage is pending Firebase Admin-backed verification.',
  };
}

export function createCacheStub(mode) {
  return {
    implemented: false,
    pendingFirebaseAdmin: true,
    mode: mode || null,
    ttlHours: 24,
    note: '24-hour cache storage is pending server-side persistence.',
  };
}

export function createMemoryGeminiStore(initialState = {}) {
  const quota = new Map();
  const cache = new Map();
  const quotaQuota = Number(initialState.quotaLimit || DEFAULT_QUOTA) || DEFAULT_QUOTA;
  const now = () => new Date().toISOString();

  return {
    quotaLimit: quotaQuota,
    async getQuota(uid, dateKey) {
      return quota.get(`${uid}:${dateKey}`) || null;
    },
    async incrementQuota(uid, dateKey) {
      const key = `${uid}:${dateKey}`;
      const current = quota.get(key) || { count: 0 };
      const next = {
        count: current.count + 1,
        updatedAt: now(),
        lastRequestAt: now(),
      };
      quota.set(key, next);
      return next;
    },
    async getCache(uid, mode) {
      return cache.get(`${uid}:${mode}`) || null;
    },
    async setCache(uid, mode, payload) {
      const record = {
        payload,
        generatedAt: now(),
        expiresAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        mode,
      };
      cache.set(`${uid}:${mode}`, record);
      return record;
    },
  };
}

export async function createFirestoreGeminiStore(firestore) {
  if (!firestore) return null;
  return {
    quotaLimit: DEFAULT_QUOTA,
    async getQuota(uid, dateKey) {
      const snap = await firestore.collection('users').doc(uid).collection('ai_recommendations_quota').doc(dateKey).get();
      return snap.exists ? snap.data() : null;
    },
    async incrementQuota(uid, dateKey) {
      const ref = firestore.collection('users').doc(uid).collection('ai_recommendations_quota').doc(dateKey);
      const snap = await ref.get();
      const currentCount = Number(snap.exists ? snap.data()?.count : 0) || 0;
      const next = {
        count: currentCount + 1,
        updatedAt: new Date().toISOString(),
        lastRequestAt: new Date().toISOString(),
      };
      await ref.set(next, { merge: true });
      return next;
    },
    async getCache(uid, mode) {
      const snap = await firestore.collection('users').doc(uid).collection('ai_recommendations_cache').doc(mode).get();
      if (!snap.exists) return null;
      return snap.data();
    },
    async setCache(uid, mode, payload) {
      const now = new Date();
      const record = {
        payload,
        generatedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + CACHE_TTL_MS).toISOString(),
        mode,
      };
      await firestore.collection('users').doc(uid).collection('ai_recommendations_cache').doc(mode).set(record, { merge: true });
      return record;
    },
  };
}

export async function getFirebaseAdminDependencies() {
  if (_adminDepsPromise) return _adminDepsPromise;
  _adminDepsPromise = (async () => {
    const credential = buildFirebaseAdminCredential();
    if (!credential) return null;
    const [{ initializeApp, cert, getApps }, { getAuth }, { getFirestore }] = await Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/auth'),
      import('firebase-admin/firestore'),
    ]);
    const app = getApps().length ? getApps()[0] : initializeApp({ credential: cert(credential) });
    return {
      app,
      auth: getAuth(app),
      firestore: getFirestore(app),
    };
  })();
  return _adminDepsPromise;
}

export function getQuotaDateKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function isCacheRecordValid(record, now = new Date()) {
  if (!record || typeof record !== 'object') return false;
  const expiresAt = Date.parse(record.expiresAt || '');
  if (!Number.isFinite(expiresAt)) return false;
  return expiresAt > now.getTime();
}

export async function handleGeminiRequest({
  req,
  authHeader,
  body,
  auth,
  store,
  callGeminiFn = callGemini,
  now = () => new Date(),
  quotaLimit = DEFAULT_QUOTA,
} = {}) {
  const bearer = extractBearerToken(authHeader);
  if (!bearer) {
    return { statusCode: 401, body: { error: 'Missing authorization token.' } };
  }

  if (!auth || typeof auth.verifyIdToken !== 'function') {
    return { statusCode: 503, body: { error: 'Firebase auth is unavailable.' } };
  }

  let decoded;
  try {
    decoded = await auth.verifyIdToken(bearer, true);
  } catch {
    return { statusCode: 401, body: { error: 'Invalid authorization token.' } };
  }

  const uid = String(decoded?.uid || '').trim();
  if (!uid) return { statusCode: 401, body: { error: 'Invalid authorization token.' } };

  const validation = validateRequestBody(body);
  if (!validation.ok) return { statusCode: 400, body: { error: validation.error } };

  if (!store) {
    return { statusCode: 503, body: { error: 'Gemini storage is unavailable.' } };
  }

  const dateKey = getQuotaDateKey(now());
  const cacheRecord = await store.getCache(uid, validation.value.mode).catch(() => null);
  if (cacheRecord && isCacheRecordValid(cacheRecord, now())) {
    return {
      statusCode: 200,
      body: {
        recommendations: normalizeGeminiResponsePayload(cacheRecord.payload).recommendations,
        meta: buildMeta({ uid, mode: validation.value.mode, fromCache: true, implemented: true }),
      },
    };
  }

  const quotaRecord = await store.getQuota(uid, dateKey).catch(() => null);
  const currentCount = Number(quotaRecord?.count || 0) || 0;
  if (currentCount >= quotaLimit) {
    return { statusCode: 429, body: { error: 'Daily Gemini recommendation limit reached. Try again tomorrow.' } };
  }

  await store.incrementQuota(uid, dateKey).catch(() => null);
  const geminiPayload = validation.value;
  const geminiResult = await callGeminiFn(geminiPayload);
  const cleaned = normalizeGeminiResponsePayload(geminiResult);
  await store.setCache(uid, validation.value.mode, cleaned).catch(() => null);

  return {
    statusCode: 200,
    body: {
      recommendations: cleaned.recommendations,
      meta: buildMeta({ uid, mode: validation.value.mode, fromCache: false, implemented: true }),
    },
  };
}

export function normalizeGeminiResponsePayload(payload) {
  const recommendations = Array.isArray(payload?.recommendations) ? payload.recommendations : [];
  return {
    recommendations: recommendations
      .map(normalizeRecommendation)
      .filter(Boolean)
      .slice(0, MAX_RECOMMENDATIONS),
  };
}

export function buildMeta({ uid, mode, fromCache, implemented }) {
  return {
    mode: mode || null,
    fromCache: Boolean(fromCache),
    quota: {
      dailyLimit: DEFAULT_QUOTA,
      implemented: Boolean(implemented),
      secure: Boolean(implemented),
    },
    cache: {
      ttlHours: 24,
      implemented: Boolean(implemented),
      secure: Boolean(implemented),
    },
  };
}

export function extractBearerToken(authHeader) {
  const header = String(authHeader || '').trim();
  if (!header) return '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export {
  MAX_BOOKS,
  MAX_RECOMMENDATIONS,
  MAX_BODY_BYTES,
  DEFAULT_MODEL,
  DEFAULT_API_BASE,
  DEFAULT_QUOTA,
};
