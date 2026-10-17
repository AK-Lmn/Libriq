// scripts/poll-results.mjs
import fs from 'node:fs';
import path from 'node:path';

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

function parseFirestoreFields(fields = {}) {
  const out = {};
  for (const [key, val] of Object.entries(fields)) {
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

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/polls/mobile_app/votes`;

  try {
    const res = await fetch(url);
    if (res.status === 403) {
      console.log('\n=============================================================');
      console.log('⚠️  Firestore Permission Notice');
      console.log('=============================================================');
      console.log('Firestore security rules currently require read permission for the /polls collection.');
      console.log('\nTo enable public poll voting and terminal results:');
      console.log('1. Go to Firebase Console -> Firestore Database -> Rules');
      console.log('2. Add this block under match /databases/{database}/documents:');
      console.log('\n   match /polls/{pollId}/votes/{voteId} {');
      console.log('     allow read, write: if true;');
      console.log('   }\n');
      console.log('3. Click "Publish".');
      console.log('(You can also test the output format anytime by running: npm run poll:results -- --demo)');
      console.log('=============================================================\n');
      return;
    }

    if (res.status === 404) {
      displayResults([]);
      return;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`Error querying Firestore (HTTP ${res.status}): ${errText}`);
      return;
    }

    const data = await res.json();
    const documents = Array.isArray(data.documents) ? data.documents : [];
    const votes = documents.map((doc) => parseFirestoreFields(doc.fields));

    displayResults(votes);
  } catch (err) {
    console.error('Failed to fetch poll results:', err.message);
  }
}

main().catch(console.error);
