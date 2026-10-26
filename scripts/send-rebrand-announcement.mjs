// scripts/send-rebrand-announcement.mjs
// LibriQ rebrand announcement email dispatch.
// Recipients are loaded exclusively from LIBRIQ_ANNOUNCE_RECIPIENTS (JSON array) or the
// gitignored scripts/.recipients.json file. No addresses are hardcoded or logged in plaintext.

import { renderAnnouncementEmail } from '../emails/rebrand-announcement.js';

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
const recipients = loadRecipients(
  'LIBRIQ_ANNOUNCE_RECIPIENTS',
  path.resolve(process.cwd(), 'scripts/.recipients.json'),
);

const subject = 'LibriQ is officially back live';

const bodyText = `Hi reader,

A few weeks ago, I unpublished LibriQ completely because I felt like it was nowhere near where it needed to be. Today, we are live again with a complete rebrand. Thank you so much to all the users who registered early and believed in this project—I hope to see many more readers joining us.

We took that time down to rebuild from the foundation up. Here is what is new in the rebrand:

1. The 3D Cedar Bookshelf
Your books now stand on realistic virtual wooden shelves. Pan, rotate, and interact with your personal library like a physical bookcase, or tap any spine to open its notes and quotes. Press "V" on desktop or use the switcher in your library to explore it.

2. Automatic Book Descriptions & Metadata
No more missing summaries or manual typing. LibriQ now automatically enriches books with blurbs and details via Wikipedia and Open Library in the background.

3. Full Offline Reliability & Instant Speed
All icons and library assets are now self-hosted locally on your device. You can track pages and add quotes completely offline—everything syncs smoothly to the cloud whenever you reconnect.

LibriQ is now live. Your shelves, reading streaks, and private notes are waiting for you.

Open LibriQ:
https://libriq.app

Happy reading,
Kian & The LibriQ Team

---
LibriQ (https://libriq.app)
Private by design. No tracking pixels, no ads, ever.
To unsubscribe or manage your account, simply reply to this email or visit Settings in the app.`;

async function checkDomainStatus() {
  const res = await fetch('https://api.resend.com/domains/9fa08728-9d66-4df1-acc8-f07fe6b853dd', {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const data = await res.json();
  return data;
}

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
  console.log('Checking domain status for libriq.app on Resend...');
  const domain = await checkDomainStatus();
  console.log(`Domain status: ${domain.status}`);

  if (domain.status !== 'verified') {
    console.warn('\nWarning: libriq.app is not verified yet. Please add the DNS records and verify in Resend first.');
    return;
  }

  const maskedList = recipients.map(maskEmail).join(', ');
  console.log(`\nDomain verified! Beginning dispatch to ${recipients.length} recipient(s): ${maskedList}`);

  if (recipients.length === 0) {
    console.log('No recipients configured. Set LIBRIQ_ANNOUNCE_RECIPIENTS (JSON array) or create scripts/.recipients.json.');
    console.log('Example: LIBRIQ_ANNOUNCE_RECIPIENTS="[\"user@example.com\"]" node scripts/send-rebrand-announcement.mjs\n');
    return;
  }

  console.log('Rendering locked-in LibriQ React Email template...');
  const htmlContent = await renderAnnouncementEmail();
  console.log(`Template compiled: ${htmlContent.length} bytes.`);

  const progressPath = path.resolve(process.cwd(), 'scripts/.send-progress-rebrand-announcement.json');

  const sendOne = async (email) => {
    await sendEmail(email, htmlContent);
  };

  const { sent, failed, skipped } = await sendSequentially({
    recipients,
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

  console.log(`\nDispatch finished: ${sent} sent, ${failed} failed, ${skipped} skipped (already complete).`);
}

main().catch(console.error);
