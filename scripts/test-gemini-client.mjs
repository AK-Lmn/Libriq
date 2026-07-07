import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = process.cwd();

function loadScript(filePath, context) {
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, context, { filename: filePath });
}

async function main() {
  const fetchCalls = [];
  const context = {
    console,
    window: null,
    globalThis: null,
    navigator: { onLine: true },
    fetch: async (...args) => {
      fetchCalls.push(args);
      return {
        ok: true,
        status: 200,
        async json() {
          return { recommendations: [] };
        },
      };
    },
    LIBRIQ: {
      STATUS: { READING: 'reading', WISHLIST: 'wishlist', FINISHED: 'finished' },
    },
    LibriqFirebase: {
      getState: () => ({ user: { uid: 'firebase-uid' }, ready: true }),
      getCurrentUserIdToken: async () => 'token',
    },
    BookIdentity: {
      buildCompositeKey: (book) => `${String(book.title || '').toLowerCase()}|${String(book.author || '').toLowerCase()}`,
    },
  };
  context.window = context;
  context.globalThis = context;
  loadScript(path.join(repoRoot, 'frontend/js/api/geminiClient.js'), context);

  const sampleBooks = [
    { title: 'A', author: 'B', isFavorite: true, status: 'reading', rating: 5, genres: ['Fantasy'], subjects: ['Magic'], notes: 'skip' },
    { title: 'A', author: 'B', isFavorite: false, status: 'finished', rating: 4 },
    { title: 'C', author: 'D', status: 'finished', rating: 4.6, genres: ['History'] },
  ];
  const contextBooks = vm.runInNewContext(`GeminiRecommendationsAPI.buildContextBooks(${JSON.stringify(sampleBooks)})`, context);
  assert.equal(contextBooks.length, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(contextBooks[0], 'notes'), false);

  const payloadBooks = [
    { title: 'A', author: 'B', genres: ['Fantasy'], subjects: ['Magic'], status: 'reading', rating: 4.5, isFavorite: true, notes: 'skip', quotes: ['skip'] },
    ...Array.from({ length: 20 }, (_, i) => ({ title: `Book ${i}`, author: 'Author', genres: ['Genre'] })),
  ];
  const payload = vm.runInNewContext(`GeminiRecommendationsAPI.buildRequestPayload('recommendations', ${JSON.stringify(payloadBooks)})`, context);
  assert.equal(payload.books.length <= 15, true);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.books[0], 'notes'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.books[0], 'quotes'), false);

  const normalized = vm.runInNewContext(`GeminiRecommendationsAPI.normalizeResponse(${JSON.stringify({
    recommendations: [{ title: 'Dune', author: 'Frank Herbert', reason: 'Fits', confidence: 0.9, sourceHint: 'Gemini', extra: 'drop' }],
    meta: { fromCache: true },
  })})`, context);
  assert.equal(normalized.recommendations.length, 1);
  assert.equal(normalized.meta.fromCache, true);
  assert.equal(Object.prototype.hasOwnProperty.call(normalized.recommendations[0], 'extra'), false);

  await vm.runInNewContext(`GeminiRecommendationsAPI.generateRecommendations({ mode: 'recommendations', books: ${JSON.stringify(sampleBooks)} })`, context);
  assert.equal(fetchCalls.length >= 1, true);
  const headers = fetchCalls[0][1].headers;
  assert.equal(String(headers.authorization || headers.Authorization || '').startsWith('Bearer '), true);
  fetchCalls.length = 0;

  await assert.rejects(async () => {
    context.navigator.onLine = false;
    await vm.runInNewContext(`GeminiRecommendationsAPI.generateRecommendations({ mode: 'recommendations', books: [] })`, context);
  }, /offline/);

  assert.equal(fetchCalls.length, 0);

  context.navigator.onLine = true;
  context.LibriqFirebase.getState = () => ({ user: { uid: 'firebase-uid' }, ready: false });
  await assert.rejects(async () => {
    await vm.runInNewContext(`GeminiRecommendationsAPI.generateRecommendations({ mode: 'recommendations', books: [] })`, context);
  }, (err) => err.code === 'auth-loading');

  context.LibriqFirebase.getState = () => ({ user: null, ready: true });
  context.LibriqFirebase.getCurrentUserIdToken = async () => null;
  await assert.rejects(async () => {
    await vm.runInNewContext(`GeminiRecommendationsAPI.generateRecommendations({ mode: 'recommendations', books: [] })`, context);
  }, (err) => err.code === 'auth-expired');

  console.log('gemini client test passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
