// scripts/send-mobile-poll-email.mjs
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
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isAll = args.includes('--all');
  const specificEmail = args.find((a) => a.includes('@'));

  let targets = [];
  if (specificEmail) {
    targets = [specificEmail];
  } else if (isAll) {
    targets = allRecipients;
  } else {
    // Default to admin test email first
    targets = ['kianxd.00@gmail.com'];
  }

  const htmlPath = path.resolve(process.cwd(), 'emails', 'mobile-poll.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');

  console.log(`\n=============================================================`);
  console.log(`📧 LibriQ Community Poll Email Dispatcher`);
  console.log(`=============================================================`);
  console.log(`Subject:      ${subject}`);
  console.log(`Recipients:   ${targets.length} target(s): ${targets.join(', ')}`);
  console.log(`Dry Run:      ${isDryRun ? 'YES (No emails will be sent)' : 'NO (Live sending)'}\n`);

  if (!isAll && !specificEmail) {
    console.log(`[Tip] Running in single-target preview mode (to kianxd.00@gmail.com).`);
    console.log(`      To blast to all 12 registered users, run:`);
    console.log(`      node scripts/send-mobile-poll-email.mjs --all\n`);
  }

  if (isDryRun) {
    console.log('Dry run complete. No network calls made.');
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const recipient of targets) {
    process.stdout.write(`Sending to ${recipient}... `);
    try {
      const res = await sendEmail(recipient, htmlContent);
      console.log(`OK (ID: ${res.id})`);
      sent++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${sent} sent, ${failed} failed.`);
  console.log(`=============================================================\n`);
}

main().catch(console.error);
