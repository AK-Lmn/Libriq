// scripts/send-rebrand-announcement.mjs
import { renderAnnouncementEmail } from '../emails/rebrand-announcement.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error('Error: RESEND_API_KEY environment variable is required.');
  process.exit(1);
}

const allRecipients = [
  'kianxd.00@gmail.com',
  'blondolle@gmail.com',
  'saunctuarie@gmail.com',
  'cleincara@gmail.com',
  'etherealczarinne@gmail.com',
  'sunshinegirlybun@gmail.com',
  'rottenpigs024@gmail.com',
  'boncayao.allysabianca20@gmail.com',
  'euryopespare@gmail.com',
  'm.janevillon@gmail.com',
  'bestgirlning@gmail.com',
  'tracksouls287@gmail.com',
];

const targetArg = process.argv[2];
const recipients = targetArg ? [targetArg] : allRecipients;

const subject = 'LibriQ is back: what is new in v4.8';

const bodyText = `Hi reader,

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
      subject: subject,
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

  console.log('Rendering locked-in LibriQ React Email template...');
  const htmlContent = await renderAnnouncementEmail();
  console.log(`Template compiled: ${htmlContent.length} bytes.`);

  console.log(`\nDomain verified! Beginning dispatch to ${recipients.length} recipient(s)...`);
  let successCount = 0;

  for (const email of recipients) {
    try {
      const res = await sendEmail(email, htmlContent);
      console.log(`[OK] Sent to ${email} (id: ${res.id})`);
      successCount++;
      await new Promise(r => setTimeout(r, 600)); // safe 600ms rate limit
    } catch (err) {
      console.error(`[ERROR] Failed to send to ${email}:`, err.message);
    }
  }

  console.log(`\nDispatch finished: ${successCount}/${recipients.length} emails delivered successfully.`);
}

main().catch(console.error);
