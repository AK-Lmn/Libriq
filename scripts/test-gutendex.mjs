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
  return async function fetch() {
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          results: [
            {
              id: 123,
              title: 'Pride and Prejudice',
              authors: [{ name: 'Jane Austen', key: '/authors/123' }],
              formats: {
                'text/html': 'https://www.gutenberg.org/ebooks/123.html.images',
                'application/epub+zip': 'https://www.gutenberg.org/ebooks/123.epub3.images',
                'text/plain': 'https://www.gutenberg.org/ebooks/123.txt.utf-8',
              },
              bookshelves: ['Classic Fiction'],
              languages: ['en'],
              summaries: ['A classic novel about manners and marriage.'],
            },
          ],
        };
      },
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
    navigator: { onLine: true },
  };
  context.window = context;
  context.globalThis = context;

  loadScript(path.join(repoRoot, 'frontend/js/api/bookIdentity.js'), context);
  loadScript(path.join(repoRoot, 'frontend/js/api/normalizeBook.js'), context);
  loadScript(path.join(repoRoot, 'frontend/js/api/gutendex.js'), context);

  const results = await vm.runInNewContext(`GutendexAPI.searchCuratedClassics({ limit: 3, topic: 'classics' })`, context);
  assert.equal(results.length, 1);
  assert.equal(results[0].title, 'Pride and Prejudice');
  assert.equal(results[0].source, 'gutenberg');
  assert.ok(results[0].sourceBadges.includes('Project Gutenberg'));
  assert.equal(results[0].gutendexId, '123');
  assert.equal(results[0].gutenbergId, '123');
  assert.equal(Array.isArray(results[0].readableSourceLinks), true);
  assert.ok(results[0].readableSourceLinks[0].includes('gutenberg.org'));

  context.navigator.onLine = false;
  const offlineResults = await vm.runInNewContext(`GutendexAPI.searchCuratedClassics({ limit: 3, topic: 'classics' })`, context);
  assert.equal(offlineResults.length, 0);

  console.log('gutendex test passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

