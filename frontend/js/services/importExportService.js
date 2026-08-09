export function createImportExportService({
  storage,
  constants,
  createBook,
  createExportPayload,
  serializeBackup,
  parseBackupText,
  validateBackup,
  downloadFile,
  readFileText,
  clock,
  createId,
}) {
  if (!storage || !constants || typeof createExportPayload !== 'function' || typeof serializeBackup !== 'function'
    || typeof parseBackupText !== 'function' || typeof validateBackup !== 'function'
    || typeof downloadFile !== 'function' || typeof readFileText !== 'function' || typeof clock !== 'function') {
    throw new TypeError('createImportExportService requires storage, serialization, file adapters, and a clock.');
  }

  function exportCurrentLibrary() {
    const activity = storage.getActivityLog?.() || [];
    const exportedAt = toIsoString(clock());
    const payload = createExportPayload({
      books: storage.getBooks(),
      profile: storage.getProfile(),
      goals: storage.getGoals(),
      streak: storage.getStreak(),
      activity,
    }, { version: constants.VERSION, exportedAt });
    const contents = serializeBackup(payload);
    const filename = `libriq-backup-${toIsoString(clock()).slice(0, 10)}.json`;
    downloadFile({ contents, mimeType: 'application/json', filename });
    return { ok: true, payload, exportedAt, filename, itemCount: payload.data.books.length, activityCount: activity.length };
  }

  async function parseImportFile(file) {
    try {
      const payload = parseBackupText(await readFileText(file));
      if (!validateBackup(payload)) return { ok: false, reason: 'invalid-backup' };
      return { ok: true, payload };
    } catch (error) {
      return { ok: false, reason: 'invalid-json', error };
    }
  }

  void createBook;
  void createId;
  return { exportCurrentLibrary, parseImportFile };
}

export function createBrowserDownloadFile({ BlobCtor, urlApi, documentRoot }) {
  return function downloadFile({ contents, mimeType, filename }) {
    const blob = new BlobCtor([contents], { type: mimeType });
    const url = urlApi.createObjectURL(blob);
    try {
      const anchor = documentRoot.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    } finally {
      urlApi.revokeObjectURL(url);
    }
  };
}

export function readBrowserFileText(file) {
  return file.text();
}

function toIsoString(value) {
  return typeof value === 'string' ? new Date(value).toISOString() : value.toISOString();
}
