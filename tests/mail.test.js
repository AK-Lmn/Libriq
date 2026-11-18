import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  UNSUBSCRIBE_MAILTO,
  broadcastPayload,
  loadSuppressed,
  filterSuppressed,
} from '../scripts/mail-common.mjs';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

test('broadcast emails carry a List-Unsubscribe header', () => {
  assert.equal(UNSUBSCRIBE_MAILTO, 'mailto:support@libriq.app?subject=unsubscribe');
  const payload = broadcastPayload({ to: 'a@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
  assert.deepEqual(payload.to, ['a@example.com']);
  assert.equal(payload.from, 'LibriQ <updates@libriq.app>');
  assert.equal(payload.headers['List-Unsubscribe'], `<${UNSUBSCRIBE_MAILTO}>`);
  assert.equal(payload.subject, 'Hi');
});

test('opted-out addresses are skipped, ignoring case and spaces', () => {
  const { targets, suppressed } = filterSuppressed(
    ['Reader@Example.com', 'keep@example.com', ' other@example.com '],
    ['reader@example.com', 'OTHER@example.com'],
  );
  assert.deepEqual(targets, ['keep@example.com']);
  assert.equal(suppressed, 2);
  assert.deepEqual(filterSuppressed(['a@example.com'], []), { targets: ['a@example.com'], suppressed: 0 });
});

test('the opt-out list loads from an env var or a gitignored file, and fails open to empty', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'libriq-mail-'));
  const file = path.join(dir, 'suppressed.json');
  await writeFile(file, JSON.stringify(['x@example.com']));
  const before = process.env.LIBRIQ_EMAIL_SUPPRESSED;
  delete process.env.LIBRIQ_EMAIL_SUPPRESSED;
  assert.deepEqual(loadSuppressed(file), ['x@example.com']);
  process.env.LIBRIQ_EMAIL_SUPPRESSED = '["y@example.com"]';
  assert.deepEqual(loadSuppressed(file), ['x@example.com', 'y@example.com'], 'both sources are merged');
  if (before === undefined) delete process.env.LIBRIQ_EMAIL_SUPPRESSED; else process.env.LIBRIQ_EMAIL_SUPPRESSED = before;
  assert.deepEqual(loadSuppressed(path.join(dir, 'missing.json')), []);
});

test('both broadcast scripts use the shared payload and skip opted-out readers', async () => {
  for (const file of ['scripts/send-mobile-poll-email.mjs', 'scripts/send-rebrand-announcement.mjs']) {
    const source = await read(file);
    assert.ok(source.includes('broadcastPayload('), `${file} builds its payload with the header`);
    assert.ok(source.includes('filterSuppressed('), `${file} removes opted-out readers`);
  }
  assert.match(await read('.gitignore'), /^scripts\/\.suppressed\.json$/m);
});
