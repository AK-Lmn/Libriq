// scripts/send-rebrand-announcement.mjs
const RESEND_API_KEY = process.env.RESEND_API_KEY;

if (!RESEND_API_KEY) {
  console.error('Error: RESEND_API_KEY environment variable is required.');
  process.exit(1);
}

const recipients = [
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

const subject = 'LibriQ is back: the rebrand';

const bodyText = `Hi reader,

We built LibriQ with a simple promise: a quiet, private sanctuary for your reading life, free from algorithmic noise, social pressure, and advertising clutter.

Over the past few weeks, we have completely overhauled the platform. Today, we are introducing LibriQ v4.8 with a major design and architectural update:

What is new in LibriQ:

- The 3D Digital Bookshelf: View your collection on virtual cedar shelves with ambient lighting, distinctive spine bindings, and interactive inspection. Tap the Bookshelf view switcher in your library (or press "V" on desktop) to explore it.
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

async function checkDomainStatus() {
  const res = await fetch('https://api.resend.com/domains/9fa08728-9d66-4df1-acc8-f07fe6b853dd', {
    headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
  });
  const data = await res.json();
  return data;
}

async function sendEmail(to) {
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
    console.log('Records needed:');
    domain.records?.forEach(r => {
      console.log(`- [${r.type}] Host: "${r.name}" -> Value: "${r.value}" (Status: ${r.status})`);
    });
    return;
  }

  console.log(`\nDomain verified! Beginning dispatch to ${recipients.length} registered users...`);
  let successCount = 0;

  for (const email of recipients) {
    try {
      const res = await sendEmail(email);
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
