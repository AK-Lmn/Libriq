// scripts/poll-results.mjs
// Reads polls/mobile_app/votes with the caller's own Google credentials.
// The collection is not publicly readable (see firestore.rules); you need
// IAM access to the Firebase project, e.g. roles/datastore.viewer.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Only these fields are ever read or printed. Legacy docs may still hold
// email/uid/userAgent; they are dropped here and never shown.
const VOTE_FIELDS = ['choice', 'os', 'createdAt'];

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  const env = {};
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        env[key] = val;
      }
    }
  }
  return { ...env, ...process.env };
}

function renderProgressBar(percentage, maxBars = 16) {
  const filled = Math.round((percentage / 100) * maxBars);
  const empty = maxBars - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

export function getAccessToken(env = process.env) {
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

function parseFirestoreFields(fields = {}) {
  const out = {};
  for (const [key, val] of Object.entries(fields)) {
    if (!VOTE_FIELDS.includes(key)) continue;
    if (val.stringValue !== undefined) out[key] = val.stringValue;
    else if (val.integerValue !== undefined) out[key] = Number(val.integerValue);
    else if (val.timestampValue !== undefined) out[key] = val.timestampValue;
    else if (val.booleanValue !== undefined) out[key] = val.booleanValue;
    else out[key] = val;
  }
  return out;
}

function displayResults(votes, { isDemo = false } = {}) {
  const total = votes.length;

  console.log('\n=============================================================');
  console.log(`📱 LibriQ Mobile App Poll Results${isDemo ? ' [DEMO MODE]' : ''}`);
  console.log('=============================================================');

  if (total === 0) {
    console.log('\nNo votes recorded yet.');
    console.log('The poll is active on the LibriQ Dashboard for your readers.\n');
    return;
  }

  const choices = { ios: 0, android: 0, web_ok: 0, other: 0 };
  const osBreakdown = {};

  for (const v of votes) {
    const c = (v.choice || 'other').toLowerCase();
    if (c === 'ios') choices.ios++;
    else if (c === 'android') choices.android++;
    else if (c === 'web_ok') choices.web_ok++;
    else choices.other++;

    const os = v.os || 'Unknown';
    osBreakdown[os] = (osBreakdown[os] || 0) + 1;
  }

  const pct = (count) => (total > 0 ? ((count / total) * 100).toFixed(1) : '0.0');

  console.log(`Total Votes: ${total}\n`);
  console.log('Choice Breakdown:');
  console.log('-------------------------------------------------------------');
  console.log(`🍏 Yes, iOS:        ${String(choices.ios).padStart(3)} votes  (${pct(choices.ios).padStart(5)}%)  ${renderProgressBar(pct(choices.ios))}`);
  console.log(`🤖 Yes, Android:    ${String(choices.android).padStart(3)} votes  (${pct(choices.android).padStart(5)}%)  ${renderProgressBar(pct(choices.android))}`);
  console.log(`🌐 Web is fine:     ${String(choices.web_ok).padStart(3)} votes  (${pct(choices.web_ok).padStart(5)}%)  ${renderProgressBar(pct(choices.web_ok))}`);
  if (choices.other > 0) {
    console.log(`❓ Other / Custom:  ${String(choices.other).padStart(3)} votes  (${pct(choices.other).padStart(5)}%)  ${renderProgressBar(pct(choices.other))}`);
  }

  console.log('\nVoter Platforms (Detected OS):');
  console.log('-------------------------------------------------------------');
  const sortedOS = Object.entries(osBreakdown).sort((a, b) => b[1] - a[1]);
  for (const [osName, count] of sortedOS) {
    console.log(`• ${osName.padEnd(16)}: ${count} (${pct(count)}%)`);
  }

  // Recommendation summary
  console.log('\nRecommendation:');
  console.log('-------------------------------------------------------------');
  if (choices.ios > choices.android) {
    console.log(`🏆 iOS is leading by ${choices.ios - choices.android} vote(s)! Prioritize Apple App Store first.`);
  } else if (choices.android > choices.ios) {
    console.log(`🏆 Android is leading by ${choices.android - choices.ios} vote(s)! Prioritize Google Play first.`);
  } else if (choices.ios === choices.android && choices.ios > 0) {
    console.log('⚖️ iOS and Android are tied! You can build with Capacitor / React Native to target both.');
  } else {
    console.log('Awaiting more reader votes before deciding.');
  }

  console.log('=============================================================\n');
}

async function main() {
  const args = process.argv.slice(2);
  const isDemo = args.includes('--demo');

  if (isDemo) {
    const demoVotes = [
      { choice: 'ios', os: 'iOS', createdAt: '2026-10-17T12:00:00Z' },
      { choice: 'ios', os: 'iOS', createdAt: '2026-10-17T12:05:00Z' },
      { choice: 'ios', os: 'iOS', createdAt: '2026-10-17T12:10:00Z' },
      { choice: 'ios', os: 'macOS', createdAt: '2026-10-17T12:15:00Z' },
      { choice: 'ios', os: 'Windows', createdAt: '2026-10-17T12:20:00Z' },
      { choice: 'android', os: 'Android', createdAt: '2026-10-17T12:25:00Z' },
      { choice: 'android', os: 'Android', createdAt: '2026-10-17T12:30:00Z' },
      { choice: 'android', os: 'Windows', createdAt: '2026-10-17T12:35:00Z' },
      { choice: 'web_ok', os: 'macOS', createdAt: '2026-10-17T12:40:00Z' },
      { choice: 'web_ok', os: 'Windows', createdAt: '2026-10-17T12:45:00Z' },
    ];
    displayResults(demoVotes, { isDemo: true });
    return;
  }

  const env = loadEnv();
  const projectId = env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    console.error('Error: FIREBASE_PROJECT_ID is not configured in .env or environment.');
    process.exit(1);
  }

  const token = getAccessToken(env);
  if (!token) {
    printAuthHelp('No access token. Install the Google Cloud CLI and sign in, or set FIRESTORE_ACCESS_TOKEN.');
    process.exitCode = 1;
    return;
  }

  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/polls/mobile_app/votes`;
  const votes = [];
  let pageToken = '';

  try {
    do {
      const url = new URL(baseUrl);
      url.searchParams.set('pageSize', '300');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

      if (res.status === 401 || res.status === 403) {
        printAuthHelp(`Firestore returned HTTP ${res.status} for project "${projectId}".`);
        process.exitCode = 1;
        return;
      }
      if (res.status === 404) break;
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`Error querying Firestore (HTTP ${res.status}): ${errText.slice(0, 500)}`);
        process.exitCode = 1;
        return;
      }

      const data = await res.json();
      for (const doc of Array.isArray(data.documents) ? data.documents : []) {
        votes.push(parseFirestoreFields(doc.fields));
      }
      pageToken = data.nextPageToken || '';
    } while (pageToken);

    displayResults(votes);
  } catch (err) {
    console.error('Failed to fetch poll results:', err.message);
    process.exitCode = 1;
  }
}

function printAuthHelp(reason) {
  console.log('\n=============================================================');
  console.log('Firestore access denied');
  console.log('=============================================================');
  console.log(reason);
  console.log('\nPoll votes are private. Read them with your own Google account:');
  console.log('1. gcloud auth login            (sign in as a project member)');
  console.log('2. Make sure that account has IAM access to the Firebase project,');
  console.log('   e.g. roles/datastore.viewer (Cloud Console -> IAM & Admin).');
  console.log('3. Re-run: npm run poll:results');
  console.log('\nOr pass a token directly: FIRESTORE_ACCESS_TOKEN=$(gcloud auth print-access-token)');
  console.log('Preview the output format offline: npm run poll:results -- --demo');
  console.log('=============================================================\n');
}

main().catch(console.error);
