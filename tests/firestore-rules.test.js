import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The rules pin exact key lists for whole-document writes. If the app starts
// writing a new field and the rules aren't updated, every sync or backup
// write is rejected. These tests keep the two in step.

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

function returnedKeys(source, fnHeader) {
  const start = source.indexOf(fnHeader);
  assert.ok(start !== -1, `${fnHeader} not found`);
  // Top-level keys sit exactly one level (2 spaces) deeper than `return {`.
  const returnAt = source.indexOf('return {', start);
  const indent = returnAt - source.lastIndexOf('\n', returnAt) - 1;
  const body = source.slice(returnAt + 'return {'.length);
  const block = body.slice(0, body.indexOf(`\n${' '.repeat(indent)}};`));
  return [...block.matchAll(new RegExp(`^ {${indent + 2}}(\\w+)(?::|,)`, 'gm'))].map(m => m[1]);
}

function rulesKeyList(rules, validator) {
  const start = rules.indexOf(`function ${validator}(`);
  const list = rules.slice(rules.indexOf('hasOnly([', start) + 'hasOnly(['.length);
  return [...list.slice(0, list.indexOf('])')).matchAll(/'(\w+)'/g)].map(m => m[1]);
}

test('every key normalizeBookForSync writes is allowed by the book rule', async () => {
  const [sync, rules] = await Promise.all([read('frontend/js/sync.js'), read('firestore.rules')]);
  const written = returnedKeys(sync, 'function normalizeBookForSync(book)');
  assert.ok(written.length > 40, `parsed ${written.length} keys`);
  const allowed = new Set(rulesKeyList(rules, 'isValidBook'));
  assert.deepEqual(written.filter(k => !allowed.has(k)), []);
});

test('delete tombstones only use keys the book rule allows', async () => {
  const [sync, rules] = await Promise.all([read('frontend/js/sync.js'), read('firestore.rules')]);
  const start = sync.indexOf('function recordLocalDelete(id)');
  const block = sync.slice(sync.indexOf('tombstones[id] = {', start), sync.indexOf('};', start));
  const written = [...block.matchAll(/^\s+(\w+)(?::|,)/gm)].map(m => m[1]);
  assert.ok(written.includes('deletedAt'));
  const allowed = new Set(rulesKeyList(rules, 'isValidBook'));
  assert.deepEqual(written.filter(k => !allowed.has(k)), []);
});

test('every top-level key of the cloud backup is allowed by the backup rule', async () => {
  const [backup, rules] = await Promise.all([read('frontend/js/cloudBackup.js'), read('firestore.rules')]);
  const written = returnedKeys(backup, 'function buildPayload()');
  assert.ok(written.includes('data') && written.includes('bookCount'));
  const allowed = new Set(rulesKeyList(rules, 'isValidBackup'));
  assert.deepEqual(written.filter(k => !allowed.has(k)), []);
});

test('rules deny anything under users/{uid} that is not on the allowlist', async () => {
  const rules = await read('firestore.rules');
  assert.doesNotMatch(rules, /\{document=\*\*\}/, 'no recursive wildcard');
  for (const path of ['sync/v1/books/{bookId}', 'activity/{eventId}', 'profile/current', 'goals/current', 'streak/current', 'backups/current', 'polls/mobile_app', 'prefs/email']) {
    assert.match(rules, new RegExp(`match /${path.replace(/[{}/]/g, '\\$&')} \\{`), path);
  }
  assert.doesNotMatch(rules, /allow (read|write)[^;]*: if true/);
});
