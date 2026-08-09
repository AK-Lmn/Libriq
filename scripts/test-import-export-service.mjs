import assert from 'node:assert/strict';
import { createExportPayload, parseBackupText, serializeBackup, validateBackup } from '../frontend/js/services/backupSerialization.js';
import { createBrowserDownloadFile, createImportExportService } from '../frontend/js/services/importExportService.js';

const downloads = [];
const storage = {
  getBooks: () => [{ id: 'book-1' }],
  getProfile: () => ({ name: 'Reader' }),
  getGoals: () => ({ yearly: 12 }),
  getStreak: () => ({ current: 2 }),
  getActivityLog: () => [{ id: 'event-1' }, { id: 'event-2' }],
};
const times = [new Date('2026-08-10T12:00:00Z'), new Date('2026-08-10T12:00:01Z')];
const service = createImportExportService({
  storage, constants: { VERSION: '4.7.0' }, createBook: value => value,
  createExportPayload, serializeBackup, parseBackupText, validateBackup,
  downloadFile: options => downloads.push(options),
  readFileText: file => file.text(),
  clock: () => times.shift(), createId: () => 'id-1',
});

const exported = service.exportCurrentLibrary();
assert.equal(exported.ok, true);
assert.equal(exported.exportedAt, '2026-08-10T12:00:00.000Z');
assert.equal(exported.filename, 'libriq-backup-2026-08-10.json');
assert.equal(exported.itemCount, 1);
assert.equal(exported.activityCount, 2);
assert.equal(exported.payload.version, '4.7.0');
assert.deepEqual(exported.payload.data.books, [{ id: 'book-1' }]);
assert.equal(downloads.length, 1);
assert.equal(downloads[0].filename, exported.filename);
assert.equal(downloads[0].mimeType, 'application/json');
assert.deepEqual(JSON.parse(downloads[0].contents), exported.payload);

const validFile = { text: async () => JSON.stringify(exported.payload) };
assert.deepEqual(await service.parseImportFile(validFile), { ok: true, payload: exported.payload });
const invalidJson = await service.parseImportFile({ text: async () => '{bad' });
assert.equal(invalidJson.ok, false);
assert.equal(invalidJson.reason, 'invalid-json');
assert.ok(invalidJson.error instanceof Error);
assert.deepEqual(await service.parseImportFile({ text: async () => '{"app":"Other"}' }), { ok: false, reason: 'invalid-backup' });

const cleanup = [];
const clicked = [];
class FakeBlob {
  constructor(parts, options) { this.parts = parts; this.type = options.type; }
}
const browserDownload = createBrowserDownloadFile({
  BlobCtor: FakeBlob,
  urlApi: {
    createObjectURL(blob) { cleanup.push(['create', blob]); return 'blob:test'; },
    revokeObjectURL(url) { cleanup.push(['revoke', url]); },
  },
  documentRoot: {
    createElement(tag) {
      assert.equal(tag, 'a');
      return { click() { clicked.push([this.href, this.download]); } };
    },
  },
});
browserDownload({ contents: '{}', mimeType: 'application/json', filename: 'backup.json' });
assert.deepEqual(clicked, [['blob:test', 'backup.json']]);
assert.equal(cleanup[0][0], 'create');
assert.deepEqual(cleanup[1], ['revoke', 'blob:test']);

const failedCleanup = [];
const failingDownload = createBrowserDownloadFile({
  BlobCtor: FakeBlob,
  urlApi: {
    createObjectURL: () => 'blob:failed',
    revokeObjectURL: url => failedCleanup.push(url),
  },
  documentRoot: { createElement: () => ({ click() { throw new Error('click failed'); } }) },
});
assert.throws(() => failingDownload({ contents: '{}', mimeType: 'application/json', filename: 'backup.json' }), /click failed/);
assert.deepEqual(failedCleanup, ['blob:failed']);

console.log('Import/export service tests passed');
