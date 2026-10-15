// scripts/send-styled-test-email.mjs
import { renderAnnouncementEmail } from '../emails/rebrand-announcement.js';

import fs from 'node:fs';
import path from 'node:path';

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

const targetEmail = process.argv[2] || 'kianxd.00@gmail.com';
const subject = 'LibriQ is officially back live';

const plainTextFallback = `Hi reader,

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

async function main() {
  console.log('Compiling React Email template to bulletproof HTML...');
  const html = await renderAnnouncementEmail();
  console.log(`Rendered HTML: ${html.length} bytes.`);

  console.log(`Dispatching test email to ${targetEmail} from LibriQ <updates@libriq.app>...`);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'LibriQ <updates@libriq.app>',
      to: [targetEmail],
      subject: subject,
      html: html,
      text: plainTextFallback,
    }),
  });

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || JSON.stringify(result));
  }

  console.log(`[OK] Successfully sent React Email design to ${targetEmail}!`);
  console.log(`Resend Email ID: ${result.id}`);
}

main().catch(console.error);
