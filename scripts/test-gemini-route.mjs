import assert from 'node:assert/strict';

const libUrl = new URL('../api/gemini/_lib.js', import.meta.url).href;
const routeUrl = new URL('../api/gemini/recommendations.js', import.meta.url).href;

async function main() {
  const lib = await import(libUrl);
  const route = await import(routeUrl);
  assert.equal(typeof route.default, 'function');

  const validation = lib.validateRequestBody({
    mode: 'home',
    books: [{
      title: 'The Hobbit',
      author: 'J.R.R. Tolkien',
      genres: ['Fantasy'],
      subjects: ['Adventure'],
      status: 'reading',
      rating: 4.5,
      isFavorite: true,
      notes: 'ignore me',
      uid: 'secret',
    }],
  });
  assert.equal(validation.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(validation.value.books[0], 'notes'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(validation.value.books[0], 'uid'), false);

  assert.equal(lib.normalizePrivateKey('"line1\\nline2",'), 'line1\nline2');
  const parsedCred = lib.parseServiceAccountJson(JSON.stringify({
    project_id: 'proj',
    client_email: 'reader@example.com',
    private_key: '"abc\\n123"',
  }));
  assert.equal(parsedCred.privateKey, 'abc\n123');
  assert.equal(parsedCred.projectId, 'proj');
  assert.equal(lib.normalizeGeminiModelName(' models/gemini-2.5-flash '), 'gemini-2.5-flash');
  assert.equal(lib.normalizeGeminiApiMode(' interactions '), 'interactions');
  assert.equal(lib.normalizeGeminiApiMode('generateContent'), 'generatecontent');
  assert.ok(lib.buildGeminiApiUrl('https://generativelanguage.googleapis.com/v1beta', 'models/gemini-2.0-flash', 'abc').includes('/models/gemini-2.0-flash:generateContent?key=abc'));
  const originalApiMode = process.env.GEMINI_API_MODE;
  process.env.GEMINI_API_MODE = 'interactions';
  assert.equal(lib.buildGeminiApiUrl('https://generativelanguage.googleapis.com/v1beta', 'models/gemini-2.0-flash', 'abc'), 'https://generativelanguage.googleapis.com/v1beta/interactions');
  const interactionBody = lib.buildGeminiRequestBody({ mode: 'home', books: [{ title: 'A', author: 'B' }] }, 'interactions');
  assert.equal(interactionBody.model, 'gemini-2.0-flash');
  assert.equal(typeof interactionBody.input, 'string');
  process.env.GEMINI_API_MODE = originalApiMode;

  const originalApiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = '';
  await assert.rejects(
    () => lib.callGemini({ mode: 'home', books: [{ title: 'A', author: 'B' }] }),
    (err) => err.code === lib.SAFE_ERROR_CODES.FIREBASE_ADMIN_CONFIG_ERROR && err.statusCode === 503
  );
  process.env.GEMINI_API_KEY = originalApiKey;

  const tooMany = lib.validateRequestBody({
    mode: 'home',
    books: Array.from({ length: 16 }, (_, i) => ({ title: `T${i}`, author: 'A' })),
  });
  assert.equal(tooMany.ok, false);

  const invalid = lib.parseGeminiRecommendations('{"recommendations":[{"title":"Good","author":"Auth","reason":"Why","confidence":2},{"title":"","author":"B","reason":"bad"}]}');
  assert.equal(invalid.recommendations.length, 1);
  assert.equal(invalid.recommendations[0].title, 'Good');
  assert.equal(Object.prototype.hasOwnProperty.call(invalid.recommendations[0], 'confidence'), false);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 400,
    headers: { get: () => 'application/json' },
    async text() {
      return JSON.stringify({ error: { message: 'bad request' } });
    },
  });
  await assert.rejects(
    () => lib.callGemini({ mode: 'home', books: [{ title: 'A', author: 'B' }] }),
    (err) => err.code === lib.SAFE_ERROR_CODES.GEMINI_API_ERROR && err.statusCode === 400
  );

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    async text() {
      return JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n{"recommendations":[{"title":"A","author":"B","reason":"ok"}]}\n```' }] } }] });
    },
  });
  const parsedGemini = await lib.callGemini({ mode: 'home', books: [{ title: 'A', author: 'B' }] });
  assert.equal(parsedGemini.recommendations.length, 1);
  globalThis.fetch = originalFetch;

  const missingAuth = await lib.handleGeminiRequest({
    body: { mode: 'home', books: [] },
    auth: null,
    store: lib.createMemoryGeminiStore(),
    callGeminiFn: async () => ({ recommendations: [] }),
  });
  assert.equal(missingAuth.statusCode, 401);

  const invalidAuth = await lib.handleGeminiRequest({
    authHeader: 'Bearer bad-token',
    body: { mode: 'home', books: [{ title: 'Book', author: 'Author' }] },
    auth: {
      async verifyIdToken() {
        throw new Error('invalid');
      },
    },
    store: lib.createMemoryGeminiStore(),
    callGeminiFn: async () => ({ recommendations: [] }),
  });
  assert.equal(invalidAuth.statusCode, 401);

  const invalidRequestStore = {
    quotaCalls: 0,
    async getQuota() {
      return { count: 0 };
    },
    async consumeQuota() {
      this.quotaCalls += 1;
      return { count: 1 };
    },
    async getCache() {
      return null;
    },
    async setCache() {
      return null;
    },
  };
  const invalidRequest = await lib.handleGeminiRequest({
    authHeader: 'Bearer valid-token',
    body: { mode: 'home', books: [{ title: '', author: '' }] },
    auth: {
      async verifyIdToken() {
        return { uid: 'user-1' };
      },
    },
    store: invalidRequestStore,
    callGeminiFn: async () => ({ recommendations: [] }),
  });
  assert.equal(invalidRequest.statusCode, 400);
  assert.equal(invalidRequestStore.quotaCalls, 0);

  const quotaStore = {
    quotaCalls: 0,
    cacheCalls: 0,
    async getQuota(uid, dateKey) {
      return this.map?.get(`${uid}:${dateKey}`) || null;
    },
    async consumeQuota(uid, dateKey) {
      this.quotaCalls += 1;
      this.map = this.map || new Map();
      const key = `${uid}:${dateKey}`;
      const current = this.map.get(key) || { count: 0 };
      const next = { count: current.count + 1, updatedAt: new Date().toISOString(), lastRequestAt: new Date().toISOString() };
      this.map.set(key, next);
      return next;
    },
    async getCache() {
      return null;
    },
    async setCache() {
      this.cacheCalls += 1;
      return null;
    },
  };
  const quotaAuth = {
    async verifyIdToken() {
      return { uid: 'user-1' };
    },
  };
  for (let i = 0; i < 5; i += 1) {
    const result = await lib.handleGeminiRequest({
      authHeader: 'Bearer valid-token',
      body: { mode: 'home', books: [{ title: 'Book', author: 'Author' }] },
      auth: quotaAuth,
      store: quotaStore,
      callGeminiFn: async () => ({ recommendations: [{ title: 'Rec', author: 'Rec', reason: 'Why' }] }),
    });
    assert.equal(result.statusCode, 200);
  }
  const quotaExceeded = await lib.handleGeminiRequest({
    authHeader: 'Bearer valid-token',
    body: { mode: 'home', books: [{ title: 'Book', author: 'Author' }] },
    auth: quotaAuth,
    store: quotaStore,
    callGeminiFn: async () => ({ recommendations: [{ title: 'Rec', author: 'Rec', reason: 'Why' }] }),
  });
  assert.equal(quotaExceeded.statusCode, 429);
  assert.equal(quotaStore.quotaCalls, 5);

  const quotaBlockedStore = {
    quotaCalls: 0,
    async getQuota() {
      return { count: 5 };
    },
    async consumeQuota() {
      this.quotaCalls += 1;
      return { count: 6 };
    },
    async getCache() {
      return null;
    },
    async setCache() {
      return null;
    },
  };
  let quotaBlockedCalls = 0;
  const quotaBlocked = await lib.handleGeminiRequest({
    authHeader: 'Bearer valid-token',
    body: { mode: 'home', books: [{ title: 'Book', author: 'Author' }] },
    auth: quotaAuth,
    store: quotaBlockedStore,
    callGeminiFn: async () => {
      quotaBlockedCalls += 1;
      return { recommendations: [{ title: 'Rec', author: 'Rec', reason: 'Why' }] };
    },
  });
  assert.equal(quotaBlocked.statusCode, 429);
  assert.equal(quotaBlockedCalls, 0);
  assert.equal(quotaBlockedStore.quotaCalls, 0);

  const failingGeminiStore = {
    quotaCalls: 0,
    cacheCalls: 0,
    async getQuota() {
      return { count: 0 };
    },
    async consumeQuota() {
      this.quotaCalls += 1;
      return { count: 1 };
    },
    async getCache() {
      return null;
    },
    async setCache() {
      this.cacheCalls += 1;
      return null;
    },
  };
  const geminiFailure = await lib.handleGeminiRequest({
    authHeader: 'Bearer valid-token',
    body: { mode: 'home', books: [{ title: 'Book', author: 'Author' }] },
    auth: quotaAuth,
    store: failingGeminiStore,
    callGeminiFn: async () => {
      throw new Error('model failed');
    },
  });
  assert.equal(geminiFailure.statusCode, 500);
  assert.equal(failingGeminiStore.quotaCalls, 0);
  assert.equal(failingGeminiStore.cacheCalls, 0);

  let geminiCalls = 0;
  const cacheStore = {
    quotaCalls: 0,
    cacheCalls: 0,
    async getQuota() {
      return { count: 0 };
    },
    async consumeQuota() {
      this.quotaCalls += 1;
      return { count: 1 };
    },
    async getCache() {
      return {
        payload: { recommendations: [{ title: 'Cached', author: 'Author', reason: 'Cached reason' }] },
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      };
    },
    async setCache() {
      this.cacheCalls += 1;
      throw new Error('should not set cache on hit');
    },
  };
  const cacheHit = await lib.handleGeminiRequest({
    authHeader: 'Bearer valid-token',
    body: { mode: 'home', books: [{ title: 'Book', author: 'Author' }] },
    auth: quotaAuth,
    store: cacheStore,
    callGeminiFn: async () => {
      geminiCalls += 1;
      return { recommendations: [] };
    },
  });
  assert.equal(cacheHit.statusCode, 200);
  assert.equal(cacheHit.body.recommendations[0].title, 'Cached');
  assert.equal(geminiCalls, 0);
  assert.equal(cacheStore.quotaCalls, 0);
  assert.equal(cacheStore.cacheCalls, 0);

  const cacheMissStore = {
    quotaCalls: 0,
    cacheCalls: 0,
    async getQuota() {
      return { count: 0 };
    },
    async consumeQuota() {
      this.quotaCalls += 1;
      return { count: 1 };
    },
    async getCache() {
      return null;
    },
    async setCache(uid, mode, payload) {
      this.cacheCalls += 1;
      this.saved = { uid, mode, payload };
    },
  };
  const cacheMiss = await lib.handleGeminiRequest({
    authHeader: 'Bearer valid-token',
    body: { mode: 'home', books: [{ title: 'Book', author: 'Author' }] },
    auth: quotaAuth,
    store: cacheMissStore,
    callGeminiFn: async () => ({ recommendations: [{ title: 'Dune', author: 'Frank Herbert', reason: 'Good fit', extra: 'remove' }] }),
  });
  assert.equal(cacheMiss.statusCode, 200);
  assert.equal(cacheMiss.body.recommendations[0].title, 'Dune');
  assert.equal(Object.prototype.hasOwnProperty.call(cacheMiss.body.recommendations[0], 'extra'), false);
  assert.equal(cacheMissStore.saved.uid, 'user-1');
  assert.equal(cacheMissStore.quotaCalls, 1);
  assert.equal(cacheMissStore.cacheCalls, 1);

  const providerQuotaStore = {
    quotaCalls: 0,
    async getQuota() {
      return { count: 0 };
    },
    async consumeQuota() {
      this.quotaCalls += 1;
      return { count: 1 };
    },
    async getCache() {
      return null;
    },
    async setCache() {
      return null;
    },
  };
  const providerQuota = await lib.handleGeminiRequest({
    authHeader: 'Bearer valid-token',
    body: { mode: 'home', books: [{ title: 'Book', author: 'Author' }] },
    auth: quotaAuth,
    store: providerQuotaStore,
    callGeminiFn: async () => {
      const error = new Error('provider quota');
      error.statusCode = 429;
      error.code = lib.SAFE_ERROR_CODES.GEMINI_PROVIDER_QUOTA_EXHAUSTED;
      error.geminiStatus = 429;
      throw error;
    },
  });
  assert.equal(providerQuota.statusCode, 429);
  assert.equal(providerQuota.body.code, 'GEMINI_PROVIDER_QUOTA_EXHAUSTED');
  assert.equal(providerQuota.body.geminiStatus, 429);
  assert.equal(providerQuotaStore.quotaCalls, 0);

  const malformedStore = {
    quotaCalls: 0,
    async getQuota() {
      return { count: 0 };
    },
    async consumeQuota() {
      this.quotaCalls += 1;
      return { count: 1 };
    },
    async getCache() {
      return null;
    },
    async setCache() {
      return null;
    },
  };
  const malformed = await lib.handleGeminiRequest({
    authHeader: 'Bearer valid-token',
    body: { mode: 'home', books: [{ title: 'Book', author: 'Author' }] },
    auth: quotaAuth,
    store: malformedStore,
    callGeminiFn: async () => ({ recommendations: [{ title: '', author: 'Bad', reason: '' }] }),
  });
  assert.equal(malformed.statusCode, 502);
  assert.equal(malformedStore.quotaCalls, 0);

  const bodyMin = lib.validateRequestBody({
    mode: 'home',
    books: [{ title: 'A', author: 'B', notes: 'drop', uid: 'drop' }],
  });
  assert.equal(bodyMin.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(bodyMin.value.books[0], 'notes'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(bodyMin.value.books[0], 'uid'), false);

  const noUidStore = {
    quotaCalls: 0,
    async getQuota() {
      return { count: 0 };
    },
    async consumeQuota() {
      this.quotaCalls += 1;
      return { count: 1 };
    },
    async getCache() {
      return null;
    },
    async setCache() {
      return null;
    },
  };
  const noUidFromBody = await lib.handleGeminiRequest({
    authHeader: 'Bearer valid-token',
    body: {
      mode: 'home',
      uid: 'fake-uid',
      books: [{ title: 'Book', author: 'Author' }],
    },
    auth: quotaAuth,
    store: noUidStore,
    callGeminiFn: async () => ({ recommendations: [{ title: 'Book 2', author: 'Author 2', reason: 'Why' }] }),
  });
  assert.equal(noUidFromBody.statusCode, 200);
  assert.equal(noUidFromBody.body.meta.mode, 'home');
  assert.equal(Object.prototype.hasOwnProperty.call(noUidFromBody.body.meta, 'uid'), false);
  assert.equal(noUidStore.quotaCalls, 1);

  const handlerResponse = await route.default({
    method: 'POST',
    headers: { authorization: 'Bearer valid-token', 'content-length': '0' },
    async *[Symbol.asyncIterator]() {},
  }, {
    setHeader() {},
    end() {},
  });
  assert.equal(typeof handlerResponse, 'undefined');

  console.log('gemini route test passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
