import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const repoRoot = process.cwd();

function loadScript(filePath, context) {
  const source = fs.readFileSync(filePath, 'utf8');
  vm.runInNewContext(source, context, { filename: filePath });
}

function createFetchStub() {
  const responses = new Map([
    ['https://openlibrary.org/works/OL123W.json', {
      key: '/works/OL123W',
      subjects: ['Fantasy', 'Adventure'],
      subject_places: ['Middle-earth'],
      subject_people: ['Bilbo Baggins'],
      subject_times: ['Third Age'],
      covers: [12345],
      edition_count: 7,
      first_publish_year: 1937,
    }],
    ['https://openlibrary.org/works/OL123W/editions.json?limit=20', {
      entries: [
        { key: '/books/OL1M', covers: [12345], url: 'https://openlibrary.org/books/OL1M' },
      ],
    }],
    ['https://openlibrary.org/authors/OL1A.json', {
      key: '/authors/OL1A',
      url: 'https://openlibrary.org/authors/OL1A',
      name: 'J. R. R. Tolkien',
    }],
  ]);

  return async function fetch(url) {
    const parsed = new URL(String(url));
    parsed.searchParams.delete('_ts');
    const clean = parsed.toString().replace(/\?$/, '');
    const value = responses.get(clean);
    if (!value) {
      return {
        ok: false,
        status: 404,
        async json() { return null; },
      };
    }
    return {
      ok: true,
      status: 200,
      async json() { return value; },
    };
  };
}

async function main() {
  const context = {
    console,
    window: null,
    globalThis: null,
    fetch: createFetchStub(),
    AbortController,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
  };
  context.window = context;
  context.globalThis = context;
  context.navigator = { onLine: true };
  loadScript(path.join(repoRoot, 'frontend/js/api/bookIdentity.js'), context);
  loadScript(path.join(repoRoot, 'frontend/js/api/normalizeBook.js'), context);
  loadScript(path.join(repoRoot, 'frontend/js/api/openLibrary.js'), context);

  const normalized = vm.runInNewContext(`NormalizeBook.fromOpenLibrary(${JSON.stringify({
    key: '/works/OL123W',
    title: 'Sample Book',
    author_name: ['J. R. R. Tolkien'],
    author_key: ['authors/OL1A'],
    cover_i: 12345,
    cover_edition_key: 'OL1M',
    first_publish_year: 1937,
    edition_count: 7,
    subject: ['Fantasy', 'Adventure'],
    subject_places: ['Middle-earth'],
    subject_people: ['Bilbo Baggins'],
    subject_times: ['Third Age'],
    isbn: ['9780000000000'],
  })})`, context);

  assert.equal(normalized.openLibraryWorkKey, '/works/OL123W');
  assert.equal(normalized.openLibraryEditionKey, 'OL1M');
  assert.equal(normalized.coverId, 12345);
  assert.equal(normalized.editionCount, 7);
  assert.equal(JSON.stringify(normalized.subjects), JSON.stringify(['Fantasy', 'Adventure']));
  assert.equal(JSON.stringify(normalized.subjectPlaces), JSON.stringify(['Middle-earth']));
  assert.equal(JSON.stringify(normalized.subjectPeople), JSON.stringify(['Bilbo Baggins']));
  assert.equal(JSON.stringify(normalized.subjectTimes), JSON.stringify(['Third Age']));

  const enriched = await vm.runInNewContext(`OpenLibraryAPI.enrichBook(${JSON.stringify({
    ...normalized,
    coverUrl: null,
    subjects: [],
    subjectPlaces: [],
    subjectPeople: [],
    subjectTimes: [],
    editionCount: null,
    readableSourceLinks: [],
  })})`, context);
  assert.equal(enriched.coverId, 12345);
  assert.equal(enriched.coverUrl.includes('covers.openlibrary.org'), true);
  assert.equal(enriched.editionCount, 7);
  assert.equal(JSON.stringify(enriched.subjects), JSON.stringify(['Fantasy', 'Adventure', 'Middle-earth', 'Bilbo Baggins', 'Third Age']));
  assert.equal(JSON.stringify(enriched.subjectPlaces), JSON.stringify(['Middle-earth']));
  assert.equal(JSON.stringify(enriched.subjectPeople), JSON.stringify(['Bilbo Baggins']));
  assert.equal(JSON.stringify(enriched.subjectTimes), JSON.stringify(['Third Age']));
  assert.equal(Array.isArray(enriched.readableSourceLinks), true);

  const safeFallback = await vm.runInNewContext(`OpenLibraryAPI.enrichBook(${JSON.stringify({ title: 'Legacy Book' })})`, context);
  assert.equal(safeFallback.title, 'Legacy Book');
  assert.doesNotThrow(() => vm.runInNewContext('OpenLibraryAPI.enrichBook(null)', context));

  const warnings = [];
  const abortContext = {
    console: {
      ...console,
      warn: (...args) => warnings.push(args.join(' ')),
    },
    window: null,
    globalThis: null,
    fetch: async () => { throw Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' }); },
    AbortController,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    navigator: { onLine: true },
  };
  abortContext.window = abortContext;
  abortContext.globalThis = abortContext;
  loadScript(path.join(repoRoot, 'frontend/js/api/bookIdentity.js'), abortContext);
  loadScript(path.join(repoRoot, 'frontend/js/api/normalizeBook.js'), abortContext);
  loadScript(path.join(repoRoot, 'frontend/js/api/openLibrary.js'), abortContext);
  const aborted = await vm.runInNewContext(`OpenLibraryAPI.searchBySubject('fiction', { limit: 2 })`, abortContext);
  assert.equal(aborted.length, 0);
  assert.equal(warnings.some(line => line.includes('Subject search failed')), false);

  console.log('open library enrichment test passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
