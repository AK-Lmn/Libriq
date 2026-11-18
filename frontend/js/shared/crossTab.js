// Keeps a second LibriQ tab in step with the first. localStorage fires a
// `storage` event in every other tab when one tab writes, so a book added in
// tab A shows up in tab B without a reload.

const LIBRARY_KEYS = new Set(['books', 'profile', 'goals', 'streak', 'activity']);

// Only this account's library data. Sync bookkeeping (sync_meta,
// fingerprints) changes constantly during a sync and would re-render on loop.
export function isLibraryChange(key, uid) {
  const match = /^libriq:(?:users:([^:]+)|local):([a-z_]+)$/.exec(String(key || ''));
  if (!match || !LIBRARY_KEYS.has(match[2])) return false;
  const keyUid = match[1] || null;
  return keyUid === (uid || null);
}

const isEditing = el => Boolean(el?.matches?.('input, textarea, select, [contenteditable="true"]'));

export function watchOtherTabs({ win = globalThis, doc = globalThis.document, getUid, onChange, debounceMs = 250 }) {
  let timer = null;
  let waitingForBlur = false;

  const run = () => {
    timer = null;
    if (isEditing(doc?.activeElement)) {
      // Don't re-render under the reader's cursor; catch up when they leave the field.
      if (!waitingForBlur) {
        waitingForBlur = true;
        doc.addEventListener('focusout', onBlur, { once: true });
      }
      return;
    }
    onChange();
  };
  function onBlur() {
    waitingForBlur = false;
    run();
  }
  const onStorage = event => {
    if (!isLibraryChange(event?.key, getUid())) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, debounceMs);
  };

  win.addEventListener('storage', onStorage);
  return () => {
    win.removeEventListener('storage', onStorage);
    if (timer) clearTimeout(timer);
    doc?.removeEventListener?.('focusout', onBlur);
  };
}
