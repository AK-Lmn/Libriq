// scripts/send-mobile-poll-email.mjs
// LibriQ community poll email dispatch.
// Recipients are loaded exclusively from LIBRIQ_POLL_RECIPIENTS (JSON array) or the
// gitignored scripts/.recipients.json file. No addresses are hardcoded or logged in plaintext.

import fs from 'node:fs';
import path from 'node:path';
import {
  loadRecipients,
  maskEmail,
  readProgress,
  writeProgress,
  sendSequentially,
} from './mail-common.mjs';

function loadEnvFile() {
  if (process.env.RESEND_API_KEY) return;
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      }
    }
  } catch {}
}

loadEnvFile();

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error('Error: RESEND_API_KEY environment variable is required.');
  process.exit(1);
}

// Recipients come only from env or the gitignored local file. Never hardcoded.
const recipients = loadRecipients('LIBRIQ_POLL_RECIPIENTS', path.resolve(process.cwd(), 'scripts/.recipients.json'));

const subject = 'Quick question: iOS or Android?';

const bodyText = `Hi reader,

Quick question — we are currently deciding whether to prioritize an iOS (Apple App Store) or Android (Google Play) native app next for LibriQ. As an early registered reader, your vote directly shapes what we build first.

Which one do you use / prefer?

1. Vote for iPhone / iOS:
   https://libriq.app?vote=ios

2. Vote for Android:
   https://libriq.app?vote=android

3. I'm happy with the web version:
   https://libriq.app?vote=web_ok

You can also simply reply directly to this email with your thoughts or features you'd like to see next.

Happy reading,
The LibriQ Team

---
LibriQ (https://libriq.app)
Private by design. No tracking pixels, no ads, ever.
To unsubscribe or manage your account, simply reply to this email or visit Settings in the app.`;

async function sendEmail(to, htmlContent) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'LibriQ <updates@libriq.app>',
      to: [to],
      subject,
      html: htmlContent,
      text: bodyText,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || JSON.stringify(result));
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isAll = args.includes('--all');
  const specificEmail = args.find((a) => a.includes('@'));

  let targets = recipients;
  if (specificEmail) targets = [specificEmail];
  else if (!isAll) targets = []; // fail closed: no default hardcoded target

  const htmlPath = path.resolve(process.cwd(), 'emails', 'mobile-poll.html');
  let htmlContent = bodyText;
  try {
    htmlContent = fs.readFileSync(htmlPath, 'utf8');
  } catch {}

  const maskedList = targets.map(maskEmail).join(', ');
  console.log(`\n=============================================================`);
  console.log(`📧 LibriQ Community Poll Email Dispatcher`);
  console.log(`=============================================================`);
  console.log(`Subject:      ${subject}`);
  console.log(`Recipients:   ${targets.length} target(s): ${maskedList}`);
  console.log(`Dry Run:      ${isDryRun ? 'YES (No emails will be sent)' : 'NO (Live sending)'}\n`);

  if (targets.length === 0) {
    console.log('No recipients configured. Set LIBRIQ_POLL_RECIPIENTS (JSON array) or create scripts/.recipients.json.');
    console.log('Example: LIBRIQ_POLL_RECIPIENTS="[\"user@example.com\"]" node scripts/send-mobile-poll-email.mjs --dry-run\n');
    return;
  }

  if (!isAll && !specificEmail) {
    console.log(`[Tip] Preview mode: no specific target and --all not given, so nothing will be sent.`);
    console.log(`      Pass a specific email, or use --all to mail all configured recipients.\n`);
  }

  if (isDryRun) {
    console.log('Dry run complete. No network calls made.');
    return;
  }

  const progressPath = path.resolve(process.cwd(), 'scripts/.send-progress-mobile-poll.json');

  const sendOne = async (email) => {
    await sendEmail(email, htmlContent);
  };

  const { sent, failed, skipped } = await sendSequentially({
    recipients: targets,
    sendOne,
    delayMs: 1000, // 1s pace between sends
    maxRetries: 3,
    progressPath,
    onProgress: ({ email, masked, sent: ok, failed: bad, skipped: skip, error }) => {
      if (skip) {
        console.log(`Skipping ${masked} (already sent).`);
      } else if (ok) {
        console.log(`OK to ${masked}.`);
      } else {
        console.log(`FAILED to ${masked}: ${error}`);
      }
    },
  });

  console.log(`\nResults: ${sent} sent, ${failed} failed, ${skipped} skipped (already complete).`);
  console.log(`=============================================================\n`);
}

main().catch(console.error);
