// scripts/send-styled-test-email.mjs
import { renderAnnouncementEmail } from '../emails/rebrand-announcement.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error('Error: RESEND_API_KEY environment variable is required.');
  process.exit(1);
}

const targetEmail = process.argv[2] || 'kianxd.00@gmail.com';
const subject = 'LibriQ is back: the rebrand [Design Preview]';

const plainTextFallback = `Hi reader,

We built LibriQ with a simple promise: a quiet, private sanctuary for your reading life, free from algorithmic noise, social pressure, and advertising clutter.

Over the past few weeks, we have completely overhauled the platform. Today, we are introducing LibriQ v4.8 with major design and architectural enhancements:

What is new in LibriQ:

- The 3D Digital Bookshelf: View your collection on virtual cedar shelves with ambient lighting, distinctive spine bindings, and interactive inspection. Tap the Bookshelf switcher in your library (or press "V" on desktop) to explore it.
- Deep Indigo Visual Identity: A refined, high-contrast dark interface engineered specifically for comfortable night reading and distraction-free tracking.
- Local-First Offline Speed: Upgraded IndexedDB caching that enables instant page loads, offline progress updates, and automatic synchronization when reconnected.
- Background Metadata Enrichment: Automated synopsis and cover retrieval via Open Library, Google Books, and Wikipedia for complete edition details.
- Comprehensive Help Center: Built-in instant topic search, keyboard navigation matrix, and troubleshooting guides.

Your library data, private notes, and reading history remain intact and ready for you.

Return to your library:
https://libriq.app

Best regards,
The LibriQ Team
https://libriq.app

---
You are receiving this update because you registered an account on LibriQ (https://libriq.app).
LibriQ is private by design: we do not sell data, track browsing across the web, or display advertisements.
To unsubscribe from future product announcements or delete your account, reply to this email or visit Settings in the app.`;

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
