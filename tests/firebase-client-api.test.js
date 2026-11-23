// Every LibriqFirebase.<name> the frontend calls must exist on the exported
// object. A call like `LibriqFirebase.subscribe?.(...)` on a missing method
// does nothing and throws nothing, which is how the demo-search pick and the
// queued poll vote went unclaimed after sign-up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const JS_DIR = new URL('../frontend/js/', import.meta.url);
const SKIP = new Set(['app.bundle.js']);

function jsFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'vendor' ? [] : jsFiles(path);
    return name.endsWith('.js') && !SKIP.has(name) ? [path] : [];
  });
}

function exportedNames() {
  const source = readFileSync(new URL('firebase-client.js', JS_DIR), 'utf8');
  const start = source.indexOf('export const LibriqFirebase = {');
  assert.ok(start >= 0, 'firebase-client.js exports LibriqFirebase');
  const body = source.slice(start, source.indexOf('\n};', start));
  return new Set([...body.matchAll(/^ {2}([A-Za-z_$][\w$]*)\s*[:,(]/gm)].map(match => match[1]));
}

test('frontend only calls LibriqFirebase methods that exist', () => {
  const exported = exportedNames();
  assert.ok(exported.has('onChange') && exported.has('signInWithEmail'), 'export list parsed');
  const missing = [];
  for (const file of jsFiles(JS_DIR.pathname.replace(/^\/([A-Za-z]:)/, '$1'))) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bLibriqFirebase\??\.\??([A-Za-z_$][\w$]*)/g)) {
      if (!exported.has(match[1])) missing.push(`${file.split(/[\\/]frontend[\\/]/)[1]}: ${match[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
