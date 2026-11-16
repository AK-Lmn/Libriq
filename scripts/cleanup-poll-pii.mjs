// scripts/cleanup-poll-pii.mjs
//
// One-off cleanup for polls/mobile_app/votes (security audit 2026-11-16, finding #1).
// Older client versions stored email, uid, userAgent, voterId and timestamp on
// every vote, and anonymous votes under ids like `voter_<random>_<ms>`.
//
//   - docs whose id starts with `voter_` (anonymous, no account) are deleted
//   - every other doc (keyed by Firebase uid) keeps only choice/os/createdAt
//
// Dry run by default: prints counts only. Pass --apply to write.
// Auth: your own Google account via `gcloud auth print-access-token`
// (or FIRESTORE_ACCESS_TOKEN). Needs IAM write access, e.g. roles/datastore.user.
//
//   node scripts/cleanup-poll-pii.mjs            # dry run
//   node scripts/cleanup-poll-pii.mjs --apply    # perform deletes/patches
//
// Never prints field values or document ids, so no email or uid reaches the terminal.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PII_FIELDS = ['email', 'userAgent', 'voterId', 'uid', 'timestamp'];
const ANON_PREFIX = 'voter_';

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[trimmed.slice(0, idx).trim()] = val;
    }
  }
  return { ...env, ...process.env };
}

function getAccessToken(env) {
  if (env.FIRESTORE_ACCESS_TOKEN) return env.FIRESTORE_ACCESS_TOKEN.trim();
  try {
    // gcloud is a .cmd shim on Windows, which Node cannot spawn without cmd.exe.
    const [cmd, args] = process.platform === 'win32'
      ? [process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'gcloud auth print-access-token']]
      : ['gcloud', ['auth', 'print-access-token']];
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

async function firestoreFetch(url, token, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `HTTP ${res.status}: access denied. Run \`gcloud auth login\` as a project member with ` +
      'Firestore IAM access (roles/datastore.viewer to dry-run, roles/datastore.user to --apply).'
    );
  }
  return res;
}

async function listVotes(baseUrl, token) {
  const docs = [];
  let pageToken = '';
  do {
    const url = new URL(baseUrl);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await firestoreFetch(url, token);
    if (res.status === 404) break;
    if (!res.ok) throw new Error(`List failed (HTTP ${res.status})`);
    const data = await res.json();
    docs.push(...(Array.isArray(data.documents) ? data.documents : []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return docs;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const env = loadEnv();
  const projectId = env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error('FIREBASE_PROJECT_ID is not set in .env or the environment.');
    process.exit(1);
  }
  const token = getAccessToken(env);
  if (!token) {
    console.error('No access token. Install the Google Cloud CLI and run `gcloud auth login`, or set FIRESTORE_ACCESS_TOKEN.');
    process.exit(1);
  }

  const apiRoot = 'https://firestore.googleapis.com/v1/';
  const baseUrl = `${apiRoot}projects/${encodeURIComponent(projectId)}/databases/(default)/documents/polls/mobile_app/votes`;
  const docs = await listVotes(baseUrl, token);

  const toDelete = [];
  const toPatch = [];
  let clean = 0;
  for (const doc of docs) {
    const id = doc.name.split('/').pop();
    if (id.startsWith(ANON_PREFIX)) {
      toDelete.push(doc);
      continue;
    }
    const present = PII_FIELDS.filter((f) => doc.fields && f in doc.fields);
    if (present.length) toPatch.push({ doc, present });
    else clean++;
  }

  const fieldCounts = Object.fromEntries(PII_FIELDS.map((f) => [f, toPatch.filter((p) => p.present.includes(f)).length]));
  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: project ${projectId}, polls/mobile_app/votes`);
  console.log(`  total docs:            ${docs.length}`);
  console.log(`  delete (anonymous):    ${toDelete.length}`);
  console.log(`  strip PII (uid-keyed): ${toPatch.length}`);
  for (const [f, n] of Object.entries(fieldCounts)) console.log(`    - ${f.padEnd(10)} ${n}`);
  console.log(`  already clean:         ${clean}`);

  if (!apply) {
    console.log('\nNo changes made. Re-run with --apply to perform the cleanup.');
    return;
  }

  let deleted = 0;
  let patched = 0;
  let failed = 0;

  for (const doc of toDelete) {
    const res = await firestoreFetch(`${apiRoot}${doc.name}`, token, { method: 'DELETE' });
    if (res.ok) deleted++;
    else failed++;
  }

  for (const { doc, present } of toPatch) {
    // Fields named in updateMask but absent from the body are removed.
    const url = new URL(`${apiRoot}${doc.name}`);
    for (const f of present) url.searchParams.append('updateMask.fieldPaths', f);
    url.searchParams.set('currentDocument.exists', 'true');
    const res = await firestoreFetch(url, token, { method: 'PATCH', body: JSON.stringify({ fields: {} }) });
    if (res.ok) patched++;
    else failed++;
  }

  console.log(`\nDone: ${deleted} deleted, ${patched} patched, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error(`cleanup-poll-pii failed: ${err.message}`);
  process.exit(1);
});
