// Weekly reading email: what goes in it, who gets it, and the unsubscribe page.
//
// Readers opt in from Settings (users/{uid}/prefs/email, weeklyDigest: true).
// The email is built from what Account Sync has stored for them (books,
// streak, goals), so readers without sync have nothing to summarise and are
// skipped. Nothing here talks to Firebase or Resend directly: the routes in
// api/weekly-digest.js and api/digest-unsubscribe.js pass those in, which is
// what lets tests/weekly-digest.test.js run it all in memory.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const DAY_MS = 86400000;
const SITE = 'https://www.libriq.app';
const FROM = 'LibriQ <updates@libriq.app>';
const BATCH_SIZE = 50; // Resend's batch endpoint takes up to 100
const READ_CONCURRENCY = 5;
const MAX_READERS_PER_RUN = 500; // a Hobby function has about a minute
const QUOTE_MAX = 220; // characters of the featured quote shown in the email

// ---------- what the week looked like ----------

const time = value => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

export function summarizeWeek({ books = [], streak = null, goals = null, now = Date.now() } = {}) {
  const weekAgo = now - 7 * DAY_MS;
  const inWeek = ms => ms != null && ms >= weekAgo && ms <= now;
  const finished = books
    .filter(b => b.status === 'finished' && time(b.dateFinished) != null)
    .map(b => ({ title: String(b.title || 'Untitled'), author: String(b.author || ''), at: time(b.dateFinished), pages: Math.max(0, Number(b.pageCount) || 0) }));
  const finishedThisWeek = finished.filter(b => inWeek(b.at)).sort((a, b) => b.at - a.at);
  const pagesFinished = finishedThisWeek.reduce((sum, b) => sum + b.pages, 0);

  // Books put on the shelf this week, apart from ones that were also finished.
  const added = books
    .filter(b => inWeek(time(b.dateAdded)) && !(b.status === 'finished' && inWeek(time(b.dateFinished))))
    .sort((a, b) => time(b.dateAdded) - time(a.dateAdded));

  // Quotes saved this week. Only the newest is shown; notes are only counted.
  const quotes = [];
  for (const b of books) {
    if (!Array.isArray(b.quotes)) continue;
    for (const q of b.quotes) {
      const text = typeof q?.text === 'string' ? q.text.trim() : '';
      const at = time(q?.createdAt);
      if (text && inWeek(at)) quotes.push({ at, text, title: String(b.title || 'Untitled'), author: String(b.author || ''), page: q.page ?? null });
    }
  }
  quotes.sort((a, b) => b.at - a.at);
  const newest = quotes[0];
  const featuredQuote = newest
    ? { text: newest.text.length > QUOTE_MAX ? `${newest.text.slice(0, QUOTE_MAX).trimEnd()}…` : newest.text, title: newest.title, author: newest.author, page: newest.page }
    : null;
  const notesUpdated = books.filter(b => typeof b.notes === 'string' && b.notes.trim() && inWeek(time(b.notesUpdatedAt))).length;

  const reading = books.filter(b => b.status === 'reading');
  const readingNow = reading.slice(0, 3).map(b => {
    const pages = Number(b.pageCount) || 0;
    const current = Math.max(0, Number(b.currentPage) || 0);
    return {
      title: String(b.title || 'Untitled'),
      author: String(b.author || ''),
      percent: pages > 0 ? Math.min(100, Math.round((current / pages) * 100)) : null,
    };
  });

  const current = Number(streak?.currentStreak ?? streak?.current) || 0;
  const lastRead = time(streak?.lastReadDate ?? streak?.lastRead);
  const activeStreak = current > 0 && lastRead != null && now - lastRead <= 2 * DAY_MS ? current : 0;

  let goal = null;
  const target = Number(goals?.yearly ?? goals?.target) || 0;
  if (target > 0) {
    const year = Number(goals?.year) || new Date(now).getUTCFullYear();
    const done = finished.filter(b => new Date(b.at).getUTCFullYear() === year).length;
    const start = Date.UTC(year, 0, 1);
    const length = (Date.UTC(year + 1, 0, 1) - start) / DAY_MS;
    const elapsed = Math.min(length, Math.max(0, (now - start) / DAY_MS));
    const expected = (target * elapsed) / length;
    const diff = done - expected;
    goal = { year, target, finished: done, pace: diff >= 1 ? 'ahead' : diff <= -1 ? 'behind' : 'on pace' };
  }

  return {
    finishedThisWeek: finishedThisWeek.slice(0, 5).map(({ title, author }) => ({ title, author })),
    finishedCount: finishedThisWeek.length,
    pagesFinished,
    readingNow,
    readingCount: reading.length,
    addedThisWeek: added.slice(0, 3).map(b => ({ title: String(b.title || 'Untitled'), author: String(b.author || '') })),
    addedCount: added.length,
    quotesSaved: quotes.length,
    featuredQuote,
    notesUpdated,
    streak: activeStreak,
    goal,
    hasNews: finishedThisWeek.length > 0 || reading.length > 0 || activeStreak > 0
      || added.length > 0 || quotes.length > 0 || notesUpdated > 0,
  };
}

// ---------- the email ----------

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function renderDigest({ name = '', summary, unsubscribeUrl }) {
  const first = String(name || '').trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first},` : 'Hi,';
  const subject = summary.finishedCount > 0 ? `Your reading week: ${plural(summary.finishedCount, 'book')} finished` : 'Your reading week';

  // Each block is [heading, lines, kind?]; the same data renders as HTML and text.
  const blocks = [];
  if (summary.finishedCount > 0) {
    const lines = summary.finishedThisWeek.map(b => (b.author ? `${b.title} by ${b.author}` : b.title));
    if (summary.finishedCount > lines.length) lines.push(`and ${summary.finishedCount - lines.length} more`);
    if (summary.pagesFinished > 0) lines.push(`${summary.pagesFinished.toLocaleString('en-US')} pages in the books you finished.`);
    blocks.push([`Finished this week (${summary.finishedCount})`, lines]);
  }
  if (summary.readingCount > 0) {
    const lines = summary.readingNow.map(b => (b.percent == null ? b.title : `${b.title}, ${b.percent}% read`));
    if (summary.readingCount > lines.length) lines.push(`and ${summary.readingCount - lines.length} more`);
    blocks.push(['Reading now', lines]);
  }
  if (summary.addedCount > 0) {
    const lines = summary.addedThisWeek.map(b => b.title);
    if (summary.addedCount > lines.length) lines.push(`and ${summary.addedCount - lines.length} more`);
    blocks.push([`Added to your library (${summary.addedCount})`, lines]);
  }
  if (summary.featuredQuote) {
    const { text: quote, title, page } = summary.featuredQuote;
    const lines = [`“${quote}”`, page == null || page === '' ? title : `${title}, p. ${page}`];
    if (summary.quotesSaved > 1) lines.push(`and ${summary.quotesSaved - 1} more`);
    blocks.push([summary.quotesSaved > 1 ? `Quotes saved (${summary.quotesSaved})` : 'A quote you saved', lines, 'quote']);
  }
  if (summary.notesUpdated > 0) blocks.push(['Your notes', [`Updated on ${plural(summary.notesUpdated, 'book')}.`]]);
  if (summary.streak > 0) blocks.push(['Streak', [`${summary.streak}-day streak. Keep it going.`]]);
  if (summary.goal) {
    const { finished, target, year, pace } = summary.goal;
    blocks.push([`${year} goal`, [`${finished} of ${target} books, ${pace}.`]]);
  }

  const text = [
    greeting,
    '',
    'Here is your reading week on LibriQ.',
    '',
    ...blocks.flatMap(([heading, lines]) => [heading, ...lines.map(line => `  ${line}`), '']),
    `Open LibriQ: ${SITE}`,
    '',
    '--',
    'You get this because you turned on the weekly email in Settings.',
    `Unsubscribe: ${unsubscribeUrl}`,
  ].join('\n');

  const lineStyle = 'margin:0 0 6px;font:17px/1.5 Georgia,Cambria,serif;color:#f1ece4;';
  const quoteStyle = 'margin:0 0 6px;padding-left:14px;border-left:2px solid #d4a373;font:italic 18px/1.5 Georgia,Cambria,serif;color:#f1ece4;';
  const sourceStyle = 'margin:0 0 6px;padding-left:16px;font:14px/1.5 Helvetica,Arial,sans-serif;color:#a8a399;';
  const htmlBlocks = blocks.map(([heading, lines, kind]) => `
      <h2 style="margin:28px 0 8px;font:600 13px/1.2 Helvetica,Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#d4a373;">${escapeHtml(heading)}</h2>
      ${lines.map((line, i) => `<p style="${kind === 'quote' ? (i === 0 ? quoteStyle : sourceStyle) : lineStyle}">${escapeHtml(line)}</p>`).join('')}`).join('');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title>
<style>@media (max-width:600px){body{padding:0!important}.card{border-radius:0!important}}</style></head>
<body style="margin:0;padding:24px 12px;">
  <div class="card" style="max-width:560px;margin:0 auto;padding:40px 24px;background:#0d1017;border-radius:14px;">
    <p style="margin:0 0 4px;font:600 13px/1.2 Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#d4a373;">LibriQ</p>
    <h1 style="margin:0 0 20px;font:400 30px/1.2 Georgia,Cambria,serif;color:#f1ece4;">Your reading week</h1>
    <p style="margin:0;font:17px/1.5 Georgia,Cambria,serif;color:#c9c3ba;">${escapeHtml(greeting)} here is how your week went.</p>${htmlBlocks}
    <p style="margin:36px 0 0;"><a href="${SITE}" style="display:inline-block;padding:12px 22px;background:#d4a373;color:#07080c;font:600 15px/1 Helvetica,Arial,sans-serif;text-decoration:none;border-radius:6px;">Open LibriQ</a></p>
    <hr style="margin:36px 0 16px;border:0;border-top:1px solid #232733;">
    <p style="margin:0;font:13px/1.6 Helvetica,Arial,sans-serif;color:#8b8780;">You get this because you turned on the weekly email in Settings. <a href="${escapeHtml(unsubscribeUrl)}" style="color:#d4a373;">Unsubscribe</a></p>
  </div>
</body></html>`;

  return { subject, html, text };
}

// ---------- unsubscribe links ----------

const unsubscribeKey = secret => createHmac('sha256', String(secret)).update('libriq-digest-unsubscribe-v1').digest();

export function unsubscribeToken(secret, uid) {
  return createHmac('sha256', unsubscribeKey(secret)).update(String(uid)).digest('base64url');
}

export function verifyUnsubscribeToken(secret, uid, token) {
  if (!secret || !uid || !token) return false;
  const expected = Buffer.from(unsubscribeToken(secret, uid));
  const given = Buffer.from(String(token));
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const unsubscribeUrl = (secret, uid) => `${SITE}/api/digest-unsubscribe?u=${encodeURIComponent(uid)}&t=${unsubscribeToken(secret, uid)}`;

// ---------- ISO week, for the idempotency key ----------

export function isoWeekKey(ms) {
  const date = new Date(ms);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayOfWeek = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayOfWeek); // the Thursday of this ISO week
  const yearStart = Date.UTC(target.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((target - yearStart) / DAY_MS + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// ---------- GET /api/weekly-digest (Vercel cron) ----------

function sameSecret(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function inChunks(items, size, fn) {
  for (let i = 0; i < items.length; i += size) await fn(items.slice(i, i + size));
}

export function createWeeklyDigestHandler({ getAdmin, sendBatch, env = process.env, now = Date.now }) {
  return async function weeklyDigest(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).end();
    }
    const secret = String(env.CRON_SECRET || '');
    if (!secret) return res.status(503).json({ ok: false, code: 'not-configured' });
    const auth = String(req.headers?.authorization || '');
    if (!auth.startsWith('Bearer ') || !sameSecret(auth.slice(7), secret)) return res.status(401).end();

    // Previews share the production Firebase project, so they never send.
    const dryRun = req.query?.dryRun === '1' || env.VERCEL_ENV !== 'production';
    if (!dryRun && !env.RESEND_API_KEY) return res.status(503).json({ ok: false, code: 'not-configured' });

    // ?only=<email> is for test sends: it narrows the run to one address (still
    // opted in, verified and with news) and sends under a fresh idempotency key.
    let only = null;
    if (req.query?.only !== undefined) {
      only = typeof req.query.only === 'string' ? req.query.only.trim().toLowerCase() : '';
      if (!only) return res.status(400).json({ ok: false, code: 'bad-only' });
    }
    const admin = await getAdmin();
    if (!admin) return res.status(503).json({ ok: false, code: 'not-configured' });

    // The name set in LibriQ beats the sign-in account's name (often a Google
    // or email name). The profile's default "Reader" is not a real name.
    const greetingName = (profile, fallback) => {
      const own = String(profile?.displayName || profile?.name || '').trim();
      return own && own !== 'Reader' ? own : fallback;
    };

    const result ={ ok: true, dryRun, optedIn: 0, mailed: 0, skippedQuiet: 0, skippedUnverified: 0, failed: 0 };
    const candidates = [];
    let pageToken;
    do {
      const page = await admin.listAuthUsers(pageToken);
      const optedIn = await admin.readDigestOptIns(page.users.map(user => user.uid));
      for (const user of page.users.filter(u => optedIn.has(u.uid))) {
        if (only && String(user.email || '').toLowerCase() !== only) continue;
        result.optedIn += 1;
        if (!user.emailVerified || !user.email) result.skippedUnverified += 1;
        else if (candidates.length < MAX_READERS_PER_RUN) candidates.push(user);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);

    const messages = [];
    await inChunks(candidates, READ_CONCURRENCY, group => Promise.all(group.map(async user => {
      try {
        const data = await admin.readReaderData(user.uid);
        const summary = summarizeWeek({ ...data, now: now() });
        if (!summary.hasNews) { result.skippedQuiet += 1; return; }
        const link = unsubscribeUrl(secret, user.uid);
        const mail = renderDigest({ name: greetingName(data.profile, user.displayName), summary, unsubscribeUrl: link });
        messages.push({
          uid: user.uid,
          payload: {
            from: FROM,
            to: [user.email],
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
            headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          },
        });
      } catch (error) {
        result.failed += 1;
        console.error('[weekly-digest] could not build a digest', error?.message || String(error));
      }
    })));

    if (dryRun) {
      result.mailed = messages.length;
      return res.status(200).json(result);
    }
    const week = isoWeekKey(now());
    await inChunks(messages, BATCH_SIZE, async batch => {
      const digest = createHash('sha1').update(batch.map(m => m.uid).sort().join(',')).digest('hex').slice(0, 12);
      try {
        await sendBatch(batch.map(m => m.payload), `weekly-digest-${week}-${digest}${only ? `-test-${now()}` : ''}`);
        result.mailed += batch.length;
      } catch (error) {
        result.failed += batch.length;
        console.error('[weekly-digest] batch not sent', error?.message || String(error));
      }
    });
    return res.status(200).json(result);
  };
}

// ---------- /api/digest-unsubscribe ----------

const page = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)} - LibriQ</title></head>
<body style="margin:0;background:#07080c;color:#f1ece4;font:17px/1.6 Georgia,Cambria,serif;">
  <main style="max-width:480px;margin:0 auto;padding:72px 24px;">
    <p style="margin:0 0 8px;font:600 13px/1.2 Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#d4a373;">LibriQ</p>
    <h1 style="margin:0 0 16px;font-weight:400;font-size:28px;">${escapeHtml(title)}</h1>
    ${body}
  </main>
</body></html>`;
const button = 'padding:12px 22px;background:#d4a373;color:#07080c;border:0;border-radius:6px;font:600 15px Helvetica,Arial,sans-serif;cursor:pointer;';

export function createDigestUnsubscribeHandler({ setDigestOff, env = process.env, now = Date.now }) {
  return async function digestUnsubscribe(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).end();
    }
    const uid = String(req.query?.u || '');
    const token = String(req.query?.t || '');
    if (!verifyUnsubscribeToken(String(env.CRON_SECRET || ''), uid, token)) {
      return res.status(400).send(page('This link is not valid', '<p>It may be incomplete or out of date. You can turn the weekly email off any time in LibriQ under Settings.</p>'));
    }
    // Opening the link only asks. Mail scanners fetch links, so nothing
    // changes until the button below (or a mail app's one-click POST).
    if (req.method === 'GET') {
      const action = `/api/digest-unsubscribe?u=${encodeURIComponent(uid)}&t=${encodeURIComponent(token)}`;
      return res.status(200).send(page('Stop the weekly email?', `<p>You will not get the weekly reading email any more.</p>
    <form method="post" action="${escapeHtml(action)}"><button type="submit" style="${button}">Stop the weekly email</button></form>`));
    }
    try {
      await setDigestOff(uid, new Date(now()).toISOString());
    } catch (error) {
      console.error('[digest-unsubscribe] failed', error?.message || String(error));
      return res.status(500).send(page('That did not work', '<p>Please try again in a moment, or turn the weekly email off in LibriQ under Settings.</p>'));
    }
    return res.status(200).send(page('You are unsubscribed', '<p>The weekly reading email is turned off. You can turn it back on in LibriQ under Settings.</p>'));
  };
}
