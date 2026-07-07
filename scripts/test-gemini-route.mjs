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

  const tooMany = lib.validateRequestBody({
    mode: 'home',
    books: Array.from({ length: 16 }, (_, i) => ({ title: `T${i}`, author: 'A' })),
  });
  assert.equal(tooMany.ok, false);

  const invalid = lib.parseGeminiRecommendations('{"recommendations":[{"title":"Good","author":"Auth","reason":"Why","confidence":2},{"title":"","author":"B","reason":"bad"}]}');
  assert.equal(invalid.recommendations.length, 1);
  assert.equal(invalid.recommendations[0].title, 'Good');
  assert.equal(Object.prototype.hasOwnProperty.call(invalid.recommendations[0], 'confidence'), false);

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

  const quotaStore = {
    async getQuota(uid, dateKey) {
      return this.map?.get(`${uid}:${dateKey}`) || null;
    },
    async incrementQuota(uid, dateKey) {
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

  let geminiCalls = 0;
  const cacheStore = {
    async getQuota() {
      return { count: 0 };
    },
    async incrementQuota() {
      return { count: 1 };
    },
    async getCache() {
      return {
        payload: { recommendations: [{ title: 'Cached', author: 'Author', reason: 'Cached reason' }] },
        expiresAt: new Date(Date.now() + 10000).toISOString(),
      };
    },
    async setCache() {
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

  const cacheMissStore = {
    async getQuota() {
      return { count: 0 };
    },
    async incrementQuota() {
      return { count: 1 };
    },
    async getCache() {
      return null;
    },
    async setCache(uid, mode, payload) {
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

  const bodyMin = lib.validateRequestBody({
    mode: 'home',
    books: [{ title: 'A', author: 'B', notes: 'drop', uid: 'drop' }],
  });
  assert.equal(bodyMin.ok, true);
  assert.equal(Object.prototype.hasOwnProperty.call(bodyMin.value.books[0], 'notes'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(bodyMin.value.books[0], 'uid'), false);

  const noUidStore = {
    async getQuota() {
      return { count: 0 };
    },
    async incrementQuota() {
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
    callGeminiFn: async () => ({ recommendations: [] }),
  });
  assert.equal(noUidFromBody.statusCode, 200);
  assert.equal(noUidFromBody.body.meta.mode, 'home');
  assert.equal(Object.prototype.hasOwnProperty.call(noUidFromBody.body.meta, 'uid'), false);

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
