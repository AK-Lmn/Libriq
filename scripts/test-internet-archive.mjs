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
  return async function fetch(url) {
    const parsed = new URL(String(url));
    parsed.searchParams.delete('_ts');
    const clean = parsed.toString().replace(/\?$/, '');

    if (clean === 'https://archive.org/metadata/ia-test-book') {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            metadata: { identifier: 'ia-test-book' },
            files: [
              { name: 'ia-test-book_djvu.txt', format: 'Text', url: 'https://archive.org/download/ia-test-book/ia-test-book_djvu.txt' },
              { name: 'ia-test-book.pdf', format: 'PDF', url: 'https://archive.org/download/ia-test-book/ia-test-book.pdf' },
            ],
          };
        },
      };
    }

    return {
      ok: false,
      status: 404,
      async json() {
        return null;
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

  loadScript(path.join(repoRoot, 'frontend/js/api/internetArchive.js'), context);

  const identifiers = vm.runInNewContext(`InternetArchiveAPI._collectArchiveIdentifiers(${JSON.stringify({
    internetArchiveId: '  ia-test-book  ',
    internetArchiveIds: ['ia-test-book', 'archive-test'],
    ocaid: 'ia-test-book',
    sourceIds: { archive: 'ia-test-book' },
    identifiers: [{ type: 'ocaid', identifier: 'ia-test-book' }],
  })})`, context);
  assert.equal(JSON.stringify(identifiers), JSON.stringify(['ia-test-book', 'archive-test']));

  const derived = vm.runInNewContext(`InternetArchiveAPI._deriveArchiveUrl('ia-test-book')`, context);
  assert.equal(derived, 'https://archive.org/details/ia-test-book');

  const enriched = await vm.runInNewContext(`InternetArchiveAPI.enrichBookLinks(${JSON.stringify({
    title: 'Legacy Book',
    internetArchiveId: 'ia-test-book',
    readableSourceLinks: [],
  })})`, context);
  assert.ok(String(enriched.archiveUrl || '').includes('archive.org'));
  assert.ok(Array.isArray(enriched.readableSourceLinks));
  assert.ok(enriched.readableSourceLinks.some(link => link.includes('archive.org')));
  assert.ok(enriched.sourceBadges.includes('Internet Archive'));

  context.navigator.onLine = false;
  const offline = await vm.runInNewContext(`InternetArchiveAPI.enrichBookLinks(${JSON.stringify({
    title: 'Offline Book',
    internetArchiveId: 'ia-test-book',
  })})`, context);
  assert.equal(offline.title, 'Offline Book');
  assert.equal(offline.archiveUrl, undefined);

  console.log('internet archive test passed');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
