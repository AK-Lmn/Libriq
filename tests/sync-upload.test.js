import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BATCH_LIMIT, chunk, withTimeout, commitInChunks } from '../frontend/js/services/syncUpload.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('changes are split into Firestore-sized batches', () => {
  assert.ok(BATCH_LIMIT <= 500, 'Firestore allows at most 500 writes per batch');
  const items = Array.from({ length: 901 }, (_, i) => i);
  const chunks = chunk(items, 400);
  assert.deepEqual(chunks.map(c => c.length), [400, 400, 101]);
  assert.deepEqual(chunk([], 400), []);
});

test('withTimeout rejects a write that never settles', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20, 'batch 1'), /timed out after 20ms: batch 1/);
  assert.equal(await withTimeout(Promise.resolve('ok'), 20), 'ok');
});

test('batches commit one at a time and progress is saved after each', async () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ id: `b${i}` }));
  const committed = [];
  const saved = [];
  let active = 0;
  const result = await commitInChunks(items, {
    size: 4,
    timeoutMs: 1000,
    commitChunk: async batch => {
      active += 1;
      assert.equal(active, 1, 'never more than one batch in flight');
      await new Promise(r => setTimeout(r, 2));
      committed.push(batch.map(i => i.id));
      active -= 1;
    },
    onCommitted: batch => saved.push(batch.map(i => i.id)),
  });
  assert.deepEqual(committed, [['b0', 'b1', 'b2', 'b3'], ['b4', 'b5', 'b6', 'b7'], ['b8']]);
  assert.deepEqual(saved, committed);
  assert.deepEqual(result, { committed: 9, batches: 3 });
});

test('a failed batch stops the run but keeps earlier batches saved', async () => {
  const items = Array.from({ length: 6 }, (_, i) => ({ id: `b${i}` }));
  const saved = [];
  let calls = 0;
  await assert.rejects(commitInChunks(items, {
    size: 2,
    timeoutMs: 1000,
    commitChunk: async () => { calls += 1; if (calls === 2) throw new Error('permission-denied'); },
    onCommitted: batch => saved.push(...batch.map(i => i.id)),
  }), /permission-denied/);
  assert.deepEqual(saved, ['b0', 'b1'], 'only the first batch is recorded as uploaded');
  assert.equal(calls, 2, 'later batches are not attempted');
});

test('a hung batch times out instead of blocking sync forever', async () => {
  await assert.rejects(commitInChunks([{ id: 'a' }], {
    size: 400, timeoutMs: 20, commitChunk: () => new Promise(() => {}), onCommitted: () => {},
  }), /timed out/);
});

test('sync.js uses batched commits and keeps snapshots that arrive mid-upload', async () => {
  const sync = await read('frontend/js/sync.js');
  const upload = sync.slice(sync.indexOf('async function uploadLocalBooks'), sync.indexOf('function compareTimes'));
  assert.ok(upload.includes('commitInChunks('), 'upload goes through commitInChunks');
  assert.ok(upload.includes('LibriqFirebase.writeBatch('), 'each chunk is one writeBatch');
  assert.ok(!upload.includes('Promise.all('), 'no unbounded parallel writes');
  assert.ok(sync.includes('deferredSnapshot'), 'a snapshot during upload is kept, not dropped');
  const client = await read('frontend/js/firebase-client.js');
  assert.match(client, /writeBatch: \(/, 'firebase-client exposes writeBatch');
});
