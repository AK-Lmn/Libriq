// Uploads changed books in Firestore batches, one batch at a time.
// - Firestore allows 500 writes per batch; 400 leaves headroom.
// - Each batch has a timeout, so a write that never settles can't leave sync
//   stuck "in flight" until the page reloads.
// - Progress (which books are uploaded) is saved after every batch, so a
//   failure part-way through only retries what didn't make it.

export const BATCH_LIMIT = 400;
export const BATCH_TIMEOUT_MS = 30_000;

export function chunk(items, size = BATCH_LIMIT) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

export function withTimeout(promise, ms, label = 'write') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Sync ${label} timed out after ${ms}ms: ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function commitInChunks(items, { size = BATCH_LIMIT, timeoutMs = BATCH_TIMEOUT_MS, commitChunk, onCommitted }) {
  const batches = chunk(items, size);
  let committed = 0;
  for (let i = 0; i < batches.length; i += 1) {
    await withTimeout(Promise.resolve().then(() => commitChunk(batches[i])), timeoutMs, `batch ${i + 1}`);
    committed += batches[i].length;
    onCommitted(batches[i]);
  }
  return { committed, batches: batches.length };
}
