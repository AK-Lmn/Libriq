import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCspReportHandler } from '../api/_lib/cspReport.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => readFile(join(root, file), 'utf8');

async function siteHeader(key) {
  const vercel = JSON.parse(await read('vercel.json'));
  const all = vercel.headers.find(entry => entry.headers.some(h => h.key === 'Content-Security-Policy'));
  return all.headers.find(h => h.key === key)?.value;
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'vendor') yield* walk(full);
    } else yield full;
  }
}

test('script-src allows no inline script and no eval', async () => {
  const csp = await siteHeader('Content-Security-Policy');
  const scriptSrc = csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src '));
  assert.ok(scriptSrc, 'script-src present');
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'|'unsafe-eval'/);
});

test('CSP violations are reported to /api/csp-report', async () => {
  const csp = await siteHeader('Content-Security-Policy');
  assert.match(csp, /report-uri \/api\/csp-report/);
  assert.match(csp, /report-to csp-endpoint/);
  assert.equal(await siteHeader('Reporting-Endpoints'), 'csp-endpoint="/api/csp-report"');
});

test('HTML pages have no executable inline scripts', async () => {
  for (const page of ['index.html', 'privacy.html', 'terms.html']) {
    const html = await read(`frontend/${page}`);
    const inline = [...html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>/g)]
      .filter(m => !/type="application\/ld\+json"/.test(m[1]));
    assert.deepEqual(inline.map(m => m[0]), [], page);
  }
});

test('no inline event handler attributes in pages or rendered templates', async () => {
  const offenders = [];
  for await (const file of walk(join(root, 'frontend'))) {
    if (!/\.(html|js)$/.test(file)) continue;
    const text = await readFile(file, 'utf8');
    for (const m of text.matchAll(/\son(?:click|error|load|change|input|submit|key\w+|mouse\w+|focus|blur)\s*=\s*["']/g)) {
      offenders.push(`${relative(root, file)}: ${m[0].trim()}`);
    }
  }
  assert.deepEqual(offenders, []);
});

function fakeRes() {
  return {
    statusCode: 200, ended: false, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    end() { this.ended = true; return this; },
  };
}

test('csp-report logs a compact line for both report formats and answers 204', async () => {
  const logged = [];
  const handler = createCspReportHandler({ log: entry => logged.push(entry) });

  const legacy = fakeRes();
  await handler({ method: 'POST', body: JSON.stringify({ 'csp-report': {
    'document-uri': 'https://www.libriq.app/', 'violated-directive': 'script-src-elem',
    'effective-directive': 'script-src-elem', 'blocked-uri': 'inline', 'source-file': 'https://www.libriq.app/', 'line-number': 12,
  } }) }, legacy);
  assert.equal(legacy.statusCode, 204);

  const modern = fakeRes();
  await handler({ method: 'POST', body: [{ type: 'csp-violation', url: 'https://www.libriq.app/', body: {
    effectiveDirective: 'img-src', blockedURL: 'https://evil.example/x.png', documentURL: 'https://www.libriq.app/',
  } }] }, modern);
  assert.equal(modern.statusCode, 204);

  assert.deepEqual(logged.map(e => [e.directive, e.blocked]), [
    ['script-src-elem', 'inline'],
    ['img-src', 'https://evil.example/x.png'],
  ]);
});

test('csp-report ignores junk, caps field length and rejects other methods', async () => {
  const logged = [];
  const handler = createCspReportHandler({ log: entry => logged.push(entry) });
  const get = fakeRes();
  await handler({ method: 'GET' }, get);
  assert.equal(get.statusCode, 405);

  const junk = fakeRes();
  await handler({ method: 'POST', body: 'not json' }, junk);
  assert.equal(junk.statusCode, 204);

  await handler({ method: 'POST', body: { 'csp-report': { 'violated-directive': 'x'.repeat(5000), 'blocked-uri': 'y' } } }, fakeRes());
  assert.equal(logged.length, 1);
  assert.ok(logged[0].directive.length <= 300);
});
