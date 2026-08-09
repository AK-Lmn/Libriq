import assert from 'node:assert/strict';
import { createExportPayload, parseBackupText, serializeBackup, validateBackup } from '../frontend/js/services/backupSerialization.js';

const snapshot = {
  books: [{ id: 'book-1' }], profile: { name: 'Reader' }, goals: { yearly: 12 },
  streak: { current: 3 }, activity: [{ id: 'event-1' }], ignored: true,
};
const payload = createExportPayload(snapshot, { version: '4.7.0', exportedAt: '2026-08-10T00:00:00.000Z' });
assert.deepEqual(payload, {
  app: 'LibriQ', version: '4.7.0', exportedAt: '2026-08-10T00:00:00.000Z',
  data: { books: snapshot.books, profile: snapshot.profile, goals: snapshot.goals, streak: snapshot.streak, activity: snapshot.activity },
});

const serialized = serializeBackup(payload);
assert.match(serialized, /\n  "app": "LibriQ"/);
assert.deepEqual(parseBackupText(serialized), payload);
assert.equal(validateBackup(payload), true);
assert.equal(validateBackup({ ...payload, app: 'Other' }), false);
assert.equal(validateBackup({ app: 'LibriQ', data: { books: {} } }), false);
assert.equal(validateBackup(null), false);
assert.throws(() => parseBackupText('{invalid'), SyntaxError);

console.log('Backup serialization tests passed');
