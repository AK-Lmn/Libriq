// scripts/send-styled-test-email.mjs
import { renderAnnouncementEmail } from '../emails/rebrand-announcement.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error('Error: RESEND_API_KEY environment variable is required.');
  process.exit(1);
}

const targetEmail = process.argv[2] || 'kianxd.00@gmail.com';
const subject = 'LibriQ is back: what is new in v4.8';

const plainTextFallback = `Hi reader,

We started LibriQ because we wanted a clean way to track books without ads, social media feeds, or pressure. Just your shelves, your notes, and your reading pace.

Over the last couple of weeks, we made some big improvements to the app. Here is a quick look at what is new:

1. The 3D Bookshelf
You can now see your books standing on virtual wooden shelves. Rotate and browse through your collection like a physical bookcase, or tap a book to inspect its details. Press "V" on desktop or use the switcher icon in your library to try it.

2. A Darker, Cleaner Look
We refreshed the entire app with a deep indigo dark mode. It has clear contrast that stays comfortable on your eyes during late-night reading sessions.

3. Works Completely Offline
Your library now loads straight from your device. You can log pages or add notes on the train or without Wi-Fi, and your progress syncs automatically when you are back online.

4. Faster Book Info & Better Help
Book summaries and cover art now load faster using Wikipedia, Open Library, and Google Books. We also added instant search in the Help Center so you can look up keyboard shortcuts and tips anytime.

Your books are waiting. All your reading history, private notes, and custom categories remain safe and untouched.

Open LibriQ:
https://libriq.app

Happy reading,
The LibriQ Team

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
