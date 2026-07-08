const MAX_BOOKS = 15;
const MAX_RECOMMENDATIONS = 8;
const MAX_BODY_BYTES = 24 * 1024;
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_QUOTA = 5;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SAFE_ERROR_CODES = {
  FIREBASE_ADMIN_CONFIG_ERROR: 'FIREBASE_ADMIN_CONFIG_ERROR',
  FIRESTORE_CACHE_ERROR: 'FIRESTORE_CACHE_ERROR',
  FIRESTORE_QUOTA_ERROR: 'FIRESTORE_QUOTA_ERROR',
  GEMINI_BAD_REQUEST: 'GEMINI_BAD_REQUEST',
  GEMINI_API_ERROR: 'GEMINI_API_ERROR',
  GEMINI_PROVIDER_QUOTA_EXHAUSTED: 'GEMINI_PROVIDER_QUOTA_EXHAUSTED',
  GEMINI_RESPONSE_INVALID: 'GEMINI_RESPONSE_INVALID',
  UNKNOWN_SERVER_ERROR: 'UNKNOWN_SERVER_ERROR',
};
let _adminDepsPromise = null;

export function getGeminiEnv() {
  const mode = normalizeGeminiApiMode(process.env.GEMINI_API_MODE || 'generateContent');
  return {
    apiKey: String(process.env.GEMINI_API_KEY || '').trim(),
    model: normalizeGeminiModelName(process.env.GEMINI_MODEL || getDefaultGeminiModel(mode)),
    apiBase: String(process.env.GEMINI_API_BASE || DEFAULT_API_BASE).trim() || DEFAULT_API_BASE,
    mode,
  };
}

export function normalizeGeminiApiMode(value) {
  const clean = cleanText(value, 32).toLowerCase();
  return clean === 'interactions' ? 'interactions' : 'generatecontent';
}

export function getDefaultGeminiModel(mode = 'generatecontent') {
  return normalizeGeminiApiMode(mode) === 'interactions' ? 'gemini-3.1-flash-lite' : 'gemini-2.5-flash-lite';
}

export function normalizeGeminiModelName(value) {
  const clean = cleanText(value, 128);
  if (!clean) return DEFAULT_MODEL;
  return clean.replace(/^models\//i, '');
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
    },
  };
}

export function buildGeminiRequestBody(payload, mode = 'generatecontent') {
  const prompt = buildGeminiPrompt(payload);
  if (normalizeGeminiApiMode(mode) === 'interactions') {
    return {
      model: normalizeGeminiModelName(getDefaultGeminiModel('interactions')),
      input: prompt.contents?.[0]?.parts?.[0]?.text || '',
    };
  }
  return prompt;
}

export function parseGeminiRecommendations(responseText) {
  const parsed = safeJsonParse(responseText);
  const recommendations = normalizeGeminiResponseShape(parsed)?.recommendations
    || normalizeGeminiResponseShape(safeJsonParse(extractGeminiResponseText(parsed, responseText)))?.recommendations
    || [];
  return {
    recommendations: recommendations
      .map(normalizeRecommendation)
      .filter(Boolean)
      .slice(0, MAX_RECOMMENDATIONS),
  };
}

export function normalizeGeminiResponseShape(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const recommendations = [];
  const pushList = (list) => {
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      if (item && typeof item === 'object') recommendations.push(item);
    });
  };
  const pushFromText = (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    const parsed = safeJsonParse(text);
    if (parsed && typeof parsed === 'object') {
      const nested = normalizeGeminiResponseShape(parsed);
      if (nested?.recommendations?.length) recommendations.push(...nested.recommendations);
    }
  };
  pushList(payload.recommendations);
  pushList(payload.output?.recommendations);
  pushList(payload.data?.recommendations);
  pushList(payload.response?.recommendations);
  pushList(payload.results);
  pushFromText(payload.output?.text);
  pushFromText(payload.output?.output);
  pushFromText(payload.output?.response);
  pushFromText(payload.text);
  if (recommendations.length) return { recommendations };
  const text = extractGeminiResponseText(payload, '');
  if (!text) return null;
  const parsedText = safeJsonParse(text);
  if (parsedText && typeof parsedText === 'object') {
    const nested = normalizeGeminiResponseShape(parsedText);
    if (nested?.recommendations?.length) return nested;
  }
  return null;
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

export function buildGeminiApiUrl(apiBase, model, apiKey) {
  const base = String(apiBase || DEFAULT_API_BASE).trim() || DEFAULT_API_BASE;
  const cleanModel = normalizeGeminiModelName(model);
  const safeApiKey = String(apiKey || '').trim();
  const mode = normalizeGeminiApiMode(process.env.GEMINI_API_MODE || 'generateContent');
  if (mode === 'interactions') {
    return `${base}/interactions`;
  }
  return `${base}/models/${encodeURIComponent(cleanModel)}:generateContent?key=${encodeURIComponent(safeApiKey)}`;
}

export function extractGeminiResponseText(data, fallbackText = '') {
  const parts = data?.candidates?.[0]?.content?.parts;
  const direct = Array.isArray(parts)
    ? parts.map((part) => String(part?.text || '')).join('')
    : '';
  const candidates = [direct, data?.text, data?.output, data?.response].map(value => String(value || '').trim()).filter(Boolean);
  if (candidates.length) return candidates[0];
  const fallback = String(fallbackText || '').trim();
  if (!fallback) return '';
  const fenced = fallback.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return String(fenced[1]).trim();
  return fallback;
}

export function logGeminiApiEvent(step, details = {}) {
  const safe = {
    step: String(step || '').trim(),
    status: Number.isFinite(Number(details.status)) ? Number(details.status) : undefined,
    model: normalizeGeminiModelName(details.model || ''),
    bodyKind: details.bodyKind ? String(details.bodyKind).trim() : undefined,
    code: details.code ? String(details.code).trim() : undefined,
  };
  const compact = Object.fromEntries(Object.entries(safe).filter(([, value]) => value !== undefined && value !== ''));
  if (Object.keys(compact).length) {
    console.warn('[Libriq/Gemini API]', compact);
  }
}

export function normalizePrivateKey(value) {
  let text = String(value || '').trim();
  text = text.replace(/^["']/, '').replace(/["']$/, '');
  text = text.replace(/,\s*$/, '');
  text = text.replace(/^["']/, '').replace(/["']$/, '');
  return text.replace(/\\n/g, '\n');
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

export function logGeminiRoute(step, details = {}) {
  const safe = {
    step: String(step || '').trim(),
    code: String(details.code || '').trim(),
    status: Number.isFinite(Number(details.status)) ? Number(details.status) : undefined,
    cache: details.cache ? String(details.cache).trim() : undefined,
    quota: details.quota ? String(details.quota).trim() : undefined,
    uid: details.uid ? String(details.uid).slice(0, 6) : undefined,
  };
  const compact = Object.fromEntries(Object.entries(safe).filter(([, value]) => value !== undefined && value !== ''));
  if (Object.keys(compact).length) {
    console.warn('[Libriq/Gemini]', compact);
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
    error.code = SAFE_ERROR_CODES.FIREBASE_ADMIN_CONFIG_ERROR;
    throw error;
  }

  const requestBody = buildGeminiRequestBody(payload, env.mode);
  const response = await fetch(buildGeminiApiUrl(env.apiBase, env.model, env.apiKey), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(env.mode === 'interactions' ? { 'x-goog-api-key': env.apiKey } : {}),
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const bodyKind = String(response.headers?.get?.('content-type') || '').toLowerCase().includes('json') ? 'json' : 'text';
    const error = new Error(`Gemini request failed with HTTP ${response.status}.`);
    error.statusCode = response.status;
    error.code = response.status === 429
      ? SAFE_ERROR_CODES.GEMINI_PROVIDER_QUOTA_EXHAUSTED
      : response.status === 400
        ? SAFE_ERROR_CODES.GEMINI_BAD_REQUEST
        : SAFE_ERROR_CODES.GEMINI_API_ERROR;
    error.geminiStatus = response.status;
    error.bodyKind = bodyKind;
    logGeminiApiEvent(response.status === 429 ? 'gemini-provider-quota' : response.status === 400 ? 'gemini-bad-request' : 'gemini-api-non-2xx', {
      status: response.status,
      model: env.model,
      bodyKind,
      code: error.code,
    });
    throw error;
  }

  const responseText = await response.text().catch(() => '');
  const data = safeJsonParse(responseText) || null;
  const text = extractGeminiResponseText(data, responseText);
  const parsed = parseGeminiRecommendations(text);
  if (!parsed.recommendations.length) {
    const error = new Error('Gemini response was invalid.');
    error.statusCode = 502;
    error.code = SAFE_ERROR_CODES.GEMINI_RESPONSE_INVALID;
    logGeminiApiEvent('gemini-response-invalid', {
      model: env.model,
      bodyKind: data ? 'json' : 'text',
      code: SAFE_ERROR_CODES.GEMINI_RESPONSE_INVALID,
    });
    throw error;
  }
  return parsed;
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
    async consumeQuota(uid, dateKey) {
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
    async incrementQuota(uid, dateKey) {
      return this.consumeQuota(uid, dateKey);
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
    async consumeQuota(uid, dateKey) {
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
    async incrementQuota(uid, dateKey) {
      return this.consumeQuota(uid, dateKey);
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

function safeModeKey(value) {
  return cleanText(value, 32).replace(/[^a-z0-9_-]/gi, '_') || 'default';
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
  const cacheMode = safeModeKey(validation.value.mode);
  let cacheRecord = null;
  try {
    cacheRecord = await store.getCache(uid, cacheMode);
  } catch {
    logGeminiRoute('cache-read-failed', { code: SAFE_ERROR_CODES.FIRESTORE_CACHE_ERROR, uid });
    return { statusCode: 503, body: { error: 'server_error', code: SAFE_ERROR_CODES.FIRESTORE_CACHE_ERROR } };
  }
  if (cacheRecord && isCacheRecordValid(cacheRecord, now())) {
    logGeminiRoute('cache-hit', { cache: 'hit', uid });
    const cached = normalizeGeminiResponsePayload(cacheRecord.payload);
    if (!cached.recommendations.length) {
      logGeminiRoute('cache-invalid', { code: SAFE_ERROR_CODES.GEMINI_RESPONSE_INVALID, uid });
      return { statusCode: 502, body: { error: 'server_error', code: SAFE_ERROR_CODES.GEMINI_RESPONSE_INVALID } };
    }
    return {
      statusCode: 200,
      body: {
        recommendations: cached.recommendations,
        meta: buildMeta({ uid, mode: validation.value.mode, fromCache: true, implemented: true }),
      },
    };
  }

  let quotaRecord = null;
  try {
    quotaRecord = await store.getQuota(uid, dateKey);
  } catch {
    logGeminiRoute('quota-read-failed', { code: SAFE_ERROR_CODES.FIRESTORE_QUOTA_ERROR, uid });
    return { statusCode: 503, body: { error: 'server_error', code: SAFE_ERROR_CODES.FIRESTORE_QUOTA_ERROR } };
  }
  const currentCount = Number(quotaRecord?.count || 0) || 0;
  logGeminiRoute('quota-check', { quota: `count:${currentCount}`, uid });
  if (currentCount >= quotaLimit) {
    return { statusCode: 429, body: { error: 'Daily Gemini recommendation limit reached. Try again tomorrow.' } };
  }

  const geminiPayload = validation.value;
  let geminiResult;
  try {
    geminiResult = await callGeminiFn(geminiPayload);
  } catch (err) {
    if (err?.code === SAFE_ERROR_CODES.GEMINI_RESPONSE_INVALID) {
      logGeminiRoute('gemini-invalid-response', { code: SAFE_ERROR_CODES.GEMINI_RESPONSE_INVALID, uid, status: err?.statusCode || err?.status });
      return { statusCode: 502, body: { error: 'server_error', code: SAFE_ERROR_CODES.GEMINI_RESPONSE_INVALID } };
    }
    const statusCode = Number(err?.statusCode || err?.status || 500);
    if (err?.code === SAFE_ERROR_CODES.GEMINI_BAD_REQUEST || statusCode === 400) {
      logGeminiRoute('gemini-bad-request', { code: SAFE_ERROR_CODES.GEMINI_BAD_REQUEST, uid, status: 400 });
      return {
        statusCode: 400,
        body: {
          error: 'server_error',
          code: SAFE_ERROR_CODES.GEMINI_BAD_REQUEST,
          geminiStatus: 400,
        },
      };
    }
    if (err?.code === SAFE_ERROR_CODES.GEMINI_PROVIDER_QUOTA_EXHAUSTED || statusCode === 429) {
      logGeminiRoute('gemini-provider-quota', { code: SAFE_ERROR_CODES.GEMINI_PROVIDER_QUOTA_EXHAUSTED, uid, status: 429 });
      return {
        statusCode: 429,
        body: {
          error: 'server_error',
          code: SAFE_ERROR_CODES.GEMINI_PROVIDER_QUOTA_EXHAUSTED,
          geminiStatus: 429,
        },
      };
    }
    if (statusCode === 503 && err?.code === SAFE_ERROR_CODES.FIREBASE_ADMIN_CONFIG_ERROR) {
      logGeminiRoute('config-missing', { code: SAFE_ERROR_CODES.FIREBASE_ADMIN_CONFIG_ERROR });
      return { statusCode: 503, body: { error: 'server_error', code: SAFE_ERROR_CODES.FIREBASE_ADMIN_CONFIG_ERROR } };
    }
    logGeminiRoute('gemini-api-failed', { code: SAFE_ERROR_CODES.GEMINI_API_ERROR, uid, status: statusCode });
    return {
      statusCode: statusCode >= 400 && statusCode < 600 ? statusCode : 500,
      body: {
        error: 'server_error',
        code: SAFE_ERROR_CODES.GEMINI_API_ERROR,
        geminiStatus: Number.isFinite(statusCode) ? statusCode : undefined,
      },
    };
  }
  const cleaned = normalizeGeminiResponsePayload(geminiResult);
  if (!cleaned.recommendations.length) {
    logGeminiRoute('gemini-invalid-response', { code: SAFE_ERROR_CODES.GEMINI_RESPONSE_INVALID, uid });
    return { statusCode: 502, body: { error: 'server_error', code: SAFE_ERROR_CODES.GEMINI_RESPONSE_INVALID } };
  }

  let cacheSaved = false;
  try {
    await store.setCache(uid, cacheMode, cleaned);
    cacheSaved = true;
  } catch {
    logGeminiRoute('cache-write-failed', { code: SAFE_ERROR_CODES.FIRESTORE_CACHE_ERROR, uid });
    return { statusCode: 503, body: { error: 'server_error', code: SAFE_ERROR_CODES.FIRESTORE_CACHE_ERROR } };
  }

  try {
    await consumeQuotaRecord(store, uid, dateKey);
  } catch {
    logGeminiRoute('quota-write-failed', { code: SAFE_ERROR_CODES.FIRESTORE_QUOTA_ERROR, uid });
    return {
      statusCode: 503,
      body: { error: 'server_error', code: SAFE_ERROR_CODES.FIRESTORE_QUOTA_ERROR, cacheSaved: cacheSaved || undefined },
    };
  }

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

export function isSuccessfulGeminiPayload(payload) {
  return normalizeGeminiResponsePayload(payload).recommendations.length > 0;
}

export async function consumeQuotaRecord(store, uid, dateKey) {
  if (!store) throw new Error('Gemini storage is unavailable.');
  if (typeof store.consumeQuota === 'function') return store.consumeQuota(uid, dateKey);
  if (typeof store.incrementQuota === 'function') return store.incrementQuota(uid, dateKey);
  throw new Error('Gemini storage cannot consume quota.');
}

export function createSafeServerError(code = SAFE_ERROR_CODES.UNKNOWN_SERVER_ERROR, statusCode = 500, step = '') {
  const error = new Error('server_error');
  error.code = code || SAFE_ERROR_CODES.UNKNOWN_SERVER_ERROR;
  error.statusCode = statusCode;
  error.step = step || '';
  return error;
}

// Dev/test reset note:
// To clear a user's daily quota manually, delete or reset:
// users/{uid}/ai_recommendations_quota/{yyyy-mm-dd}

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
  SAFE_ERROR_CODES,
};
