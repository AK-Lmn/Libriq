import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarizeWeek, renderDigest, unsubscribeToken, verifyUnsubscribeToken, isoWeekKey,
  createWeeklyDigestHandler, createDigestUnsubscribeHandler,
} from '../api/_lib/weeklyDigest.js';

const NOW = Date.parse('2026-11-30T14:00:00.000Z'); // a Monday
const day = n => new Date(NOW - n * 86400000).toISOString();
const book = (title, extra = {}) => ({ id: title, title, author: 'An Author', status: 'wishlist', ...extra });

// ---------- summarizeWeek ----------

test('counts what was finished in the last seven days, newest first', () => {
  const summary = summarizeWeek({
    now: NOW,
    books: [
      book('Old', { status: 'finished', dateFinished: day(8) }),
      book('Edge', { status: 'finished', dateFinished: day(7) }),
      book('Recent', { status: 'finished', dateFinished: day(2) }),
      book('Newest', { status: 'finished', dateFinished: day(0.5) }),
      book('Not finished', { status: 'reading', dateFinished: day(1) }),
    ],
  });
  assert.deepEqual(summary.finishedThisWeek.map(b => b.title), ['Newest', 'Recent', 'Edge']);
  assert.equal(summary.finishedCount, 3);
});

test('lists reading-now books with progress and counts them all', () => {
  const summary = summarizeWeek({
    now: NOW,
    books: [
      book('A', { status: 'reading', currentPage: 50, pageCount: 200 }),
      book('B', { status: 'reading', currentPage: 10 }),
      book('C', { status: 'reading', currentPage: 1, pageCount: 4 }),
      book('D', { status: 'reading' }),
    ],
  });
  assert.equal(summary.readingCount, 4);
  assert.equal(summary.readingNow.length, 3, 'only three are listed');
  assert.equal(summary.readingNow[0].percent, 25);
  assert.equal(summary.readingNow[1].percent, null, 'no page count, no percentage');
});

test('a streak counts only if the reader read in the last two days', () => {
  assert.equal(summarizeWeek({ now: NOW, books: [], streak: { currentStreak: 5, lastReadDate: day(1) } }).streak, 5);
  assert.equal(summarizeWeek({ now: NOW, books: [], streak: { currentStreak: 5, lastReadDate: day(4) } }).streak, 0);
  assert.equal(summarizeWeek({ now: NOW, books: [], streak: { current: 3, lastRead: day(0) } }).streak, 3, 'older field names still work');
  assert.equal(summarizeWeek({ now: NOW, books: [], streak: null }).streak, 0);
});

test('goal progress counts the goal year and says ahead, on pace or behind', () => {
  const finishedIn = (n, iso) => Array.from({ length: n }, (_, i) => book(`B${i}`, { status: 'finished', dateFinished: iso }));
  // 30 Nov 2026 is day 334 of 365, so a goal of 12 expects about 11 finished.
  const books = [...finishedIn(14, '2026-05-01T00:00:00.000Z'), ...finishedIn(5, '2025-05-01T00:00:00.000Z')];
  const ahead = summarizeWeek({ now: NOW, books, goals: { year: 2026, yearly: 12 } }).goal;
  assert.deepEqual({ target: ahead.target, finished: ahead.finished, pace: ahead.pace }, { target: 12, finished: 14, pace: 'ahead' });
  assert.equal(summarizeWeek({ now: NOW, books: finishedIn(11, '2026-05-01T00:00:00.000Z'), goals: { year: 2026, yearly: 12 } }).goal.pace, 'on pace');
  assert.equal(summarizeWeek({ now: NOW, books: finishedIn(3, '2026-05-01T00:00:00.000Z'), goals: { year: 2026, yearly: 12 } }).goal.pace, 'behind');
  assert.equal(summarizeWeek({ now: NOW, books, goals: null }).goal, null);
  assert.equal(summarizeWeek({ now: NOW, books, goals: { year: 2026 } }).goal, null, 'no target, no goal line');
});

test('a week with nothing to report has no news', () => {
  assert.equal(summarizeWeek({ now: NOW, books: [book('Shelf only')], streak: null, goals: null }).hasNews, false);
  assert.equal(summarizeWeek({ now: NOW, books: [book('R', { status: 'reading' })] }).hasNews, true);
  assert.equal(summarizeWeek({ now: NOW, books: [], streak: { currentStreak: 2, lastReadDate: day(0) } }).hasNews, true);
});

// ---------- the extra sections: added, pages, quotes, notes ----------

test('books added this week are counted, unless they were also finished this week', () => {
  const summary = summarizeWeek({
    now: NOW,
    books: [
      book('Old', { dateAdded: day(9) }),
      book('New 1', { dateAdded: day(1) }),
      book('New 2', { dateAdded: day(3), status: 'reading' }),
      book('Added and finished', { dateAdded: day(2), status: 'finished', dateFinished: day(1) }),
      book('No date'),
    ],
  });
  assert.equal(summary.addedCount, 2);
  assert.deepEqual(summary.addedThisWeek.map(b => b.title), ['New 1', 'New 2']);
});

test('pages come from the books finished this week, all of them, not just the five listed', () => {
  const books = Array.from({ length: 7 }, (_, i) => book(`F${i}`, { status: 'finished', dateFinished: day(1), pageCount: 100 }));
  books.push(book('Old finish', { status: 'finished', dateFinished: day(20), pageCount: 999 }));
  books.push(book('No pages', { status: 'finished', dateFinished: day(1) }));
  const summary = summarizeWeek({ now: NOW, books });
  assert.equal(summary.finishedThisWeek.length, 5);
  assert.equal(summary.pagesFinished, 700);
});

test('quotes saved this week are counted, and the newest one is featured and trimmed', () => {
  const long = 'word '.repeat(80).trim();
  const summary = summarizeWeek({
    now: NOW,
    books: [
      book('A', { author: 'Ann', quotes: [
        { id: 'q1', text: 'Too old to count.', createdAt: day(12) },
        { id: 'q2', text: 'Saved on Monday.', page: 12, createdAt: day(5) },
      ] }),
      book('B', { author: 'Bo', quotes: [{ id: 'q3', text: long, createdAt: day(1) }, { id: 'q4', text: '   ', createdAt: day(1) }, 'not a quote'] }),
      book('C', { quotes: 'broken' }),
    ],
  });
  assert.equal(summary.quotesSaved, 2);
  assert.equal(summary.featuredQuote.title, 'B');
  assert.equal(summary.featuredQuote.author, 'Bo');
  assert.ok(summary.featuredQuote.text.length <= 221 && summary.featuredQuote.text.endsWith('…'), 'long quotes are cut with an ellipsis');
  const other = summarizeWeek({ now: NOW, books: [book('A', { quotes: [{ text: 'Short one.', page: 7, createdAt: day(2) }] })] });
  assert.deepEqual(other.featuredQuote, { text: 'Short one.', title: 'A', author: 'An Author', page: 7 });
});

test('notes updated this week are only counted, and their text never reaches the summary', () => {
  const summary = summarizeWeek({
    now: NOW,
    books: [
      book('A', { notes: 'my private thoughts', notesUpdatedAt: day(2) }),
      book('B', { notes: 'older private thoughts', notesUpdatedAt: day(30) }),
      book('C', { notes: '', notesUpdatedAt: day(1) }),
    ],
  });
  assert.equal(summary.notesUpdated, 1);
  assert.doesNotMatch(JSON.stringify(summary), /private thoughts/);
});

test('adding a book, saving a quote or writing a note is news on its own', () => {
  assert.equal(summarizeWeek({ now: NOW, books: [book('X', { dateAdded: day(1) })] }).hasNews, true);
  assert.equal(summarizeWeek({ now: NOW, books: [book('X', { quotes: [{ text: 'q', createdAt: day(1) }] })] }).hasNews, true);
  assert.equal(summarizeWeek({ now: NOW, books: [book('X', { notes: 'n', notesUpdatedAt: day(1) })] }).hasNews, true);
  assert.equal(summarizeWeek({ now: NOW, books: [book('X', { dateAdded: day(30) })] }).hasNews, false);
});

// ---------- renderDigest ----------

const extrasSummary = summarizeWeek({
  now: NOW,
  books: [
    book('Piranesi', { author: 'Susanna Clarke', status: 'finished', dateFinished: day(1), dateAdded: day(30), pageCount: 272,
      quotes: [{ text: 'The Beauty of the House is immeasurable <i>.</i>', page: 41, createdAt: day(2) }] }),
    book('Fresh <b>Arrival</b>', { dateAdded: day(2) }),
    book('Notes only', { notes: 'secret', notesUpdatedAt: day(3) }),
  ],
});

test('the email shows pages, the featured quote, added books and note counts, escaped', () => {
  const { html, text } = renderDigest({ name: 'Bea', summary: extrasSummary, unsubscribeUrl: 'https://x/u' });
  assert.match(text, /272 pages/);
  assert.match(text, /The Beauty of the House is immeasurable <i>\.<\/i>/, 'plain text keeps the quote as written');
  assert.match(text, /Piranesi, p\. 41/);
  assert.match(text, /Added to your library \(1\)/);
  assert.match(text, /Fresh <b>Arrival<\/b>/);
  assert.match(text, /Your notes\n {2}Updated on 1 book\./);
  assert.match(html, /immeasurable &lt;i&gt;\.&lt;\/i&gt;/);
  assert.match(html, /Fresh &lt;b&gt;Arrival&lt;\/b&gt;/);
  assert.doesNotMatch(html + text, /secret/, 'note text is never in the email');
  assert.doesNotMatch(html + text, /\p{Extended_Pictographic}/u, 'no emoji');
});

test('on a wide screen the email is a dark card, not a full-width dark band, and on a phone it fills the screen', () => {
  const { html } = renderDigest({ name: 'Bea', summary: fullSummary, unsubscribeUrl: 'https://x/u' });
  assert.doesNotMatch(html, /<body[^>]*background/, 'the page behind the card is left to the mail client');
  assert.match(html, /<div[^>]*class="card"[^>]*max-width:560px[^>]*border-radius:\d+px/, 'a fixed-width rounded card');
  assert.match(html, /@media \(max-width:\s*600px\)[\s\S]*?\.card\s*\{[^}]*border-radius:\s*0\s*!important/, 'the card goes edge to edge on phones');
  assert.match(html, /@media \(max-width:\s*600px\)[\s\S]*?body\s*\{[^}]*padding:\s*0\s*!important/, 'and the page padding goes away');
});

test('quotes saved are counted in the heading when there is more than one', () => {
  const summary = summarizeWeek({ now: NOW, books: [book('A', { quotes: [
    { text: 'One.', createdAt: day(1) }, { text: 'Two.', createdAt: day(2) }, { text: 'Three.', createdAt: day(3) },
  ] })] });
  const { text } = renderDigest({ summary, unsubscribeUrl: 'https://x/u' });
  assert.match(text, /Quotes saved \(3\)/);
  assert.match(text, /and 2 more/);
});

const fullSummary = summarizeWeek({
  now: NOW,
  books: [
    book('The <b>Dispossessed</b>', { author: 'Ursula K. Le Guin', status: 'finished', dateFinished: day(1) }),
    book('Piranesi', { status: 'finished', dateFinished: day(3) }),
    book('Middlemarch', { status: 'reading', currentPage: 100, pageCount: 800 }),
  ],
  streak: { currentStreak: 6, lastReadDate: day(0) },
  goals: { year: 2026, yearly: 24 },
});

test('subject says how many books were finished, or just names the week', () => {
  const one = summarizeWeek({ now: NOW, books: [book('X', { status: 'finished', dateFinished: day(1) })] });
  assert.equal(renderDigest({ summary: one, unsubscribeUrl: 'https://x/u' }).subject, 'Your reading week: 1 book finished');
  assert.equal(renderDigest({ summary: fullSummary, unsubscribeUrl: 'https://x/u' }).subject, 'Your reading week: 2 books finished');
  const none = summarizeWeek({ now: NOW, books: [book('R', { status: 'reading' })] });
  assert.equal(renderDigest({ summary: none, unsubscribeUrl: 'https://x/u' }).subject, 'Your reading week');
});

test('the email carries the numbers, escapes book titles, and links to unsubscribe', () => {
  const { html, text } = renderDigest({ name: 'Mika <script>', summary: fullSummary, unsubscribeUrl: 'https://www.libriq.app/api/digest-unsubscribe?u=1&t=2' });
  assert.doesNotMatch(html, /<script>|<b>Dispossessed/, 'markup in titles and names is escaped');
  assert.match(html, /The &lt;b&gt;Dispossessed&lt;\/b&gt;/);
  assert.match(html, /6-day streak|6 days/);
  assert.match(html, /Middlemarch/);
  assert.match(html, /href="https:\/\/www\.libriq\.app\/api\/digest-unsubscribe\?u=1&amp;t=2"/);
  assert.match(text, /Unsubscribe: https:\/\/www\.libriq\.app\/api\/digest-unsubscribe\?u=1&t=2/);
  assert.match(text, /The <b>Dispossessed<\/b> by Ursula K\. Le Guin/, 'plain text is not HTML-escaped');
  assert.match(text, /turned on the weekly email in Settings/);
  assert.doesNotMatch(html + text, /\p{Extended_Pictographic}/u, 'no emoji');
});

// ---------- unsubscribe tokens ----------

test('unsubscribe tokens verify only for the right reader and secret', () => {
  const token = unsubscribeToken('secret-1', 'reader-a');
  assert.equal(verifyUnsubscribeToken('secret-1', 'reader-a', token), true);
  assert.equal(verifyUnsubscribeToken('secret-1', 'reader-b', token), false);
  assert.equal(verifyUnsubscribeToken('secret-2', 'reader-a', token), false);
  assert.equal(verifyUnsubscribeToken('secret-1', 'reader-a', `${token}x`), false);
  assert.equal(verifyUnsubscribeToken('secret-1', 'reader-a', ''), false);
  assert.equal(verifyUnsubscribeToken('', 'reader-a', token), false, 'no secret, no tokens');
  assert.notEqual(token, unsubscribeToken('secret-1', 'reader-b'));
});

test('the week key follows ISO weeks', () => {
  assert.equal(isoWeekKey(Date.parse('2026-11-30T14:00:00Z')), '2026-W49');
  assert.equal(isoWeekKey(Date.parse('2026-01-01T00:00:00Z')), '2026-W01');
  assert.equal(isoWeekKey(Date.parse('2027-01-03T00:00:00Z')), '2026-W53');
});

// ---------- the weekly route ----------

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.setHeader = (k, v) => { res.headers[k] = v; return res; };
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.body = body; return res; };
  res.send = body => { res.body = body; return res; };
  res.end = body => { res.body = body; return res; };
  return res;
}

const READERS = {
  quiet: { email: 'quiet@example.test', emailVerified: true, books: [book('Shelf only')], digest: true },
  busy: { email: 'busy@example.test', emailVerified: true, displayName: 'Bea Busy', books: [book('Done', { status: 'finished', dateFinished: day(1) })], digest: true },
  off: { email: 'off@example.test', emailVerified: true, books: [book('Done', { status: 'finished', dateFinished: day(1) })], digest: false },
  unverified: { email: 'unverified@example.test', emailVerified: false, books: [book('Done', { status: 'finished', dateFinished: day(1) })], digest: true },
  noemail: { email: '', emailVerified: false, books: [book('Done', { status: 'finished', dateFinished: day(1) })], digest: true },
  reading: { email: 'reading@example.test', emailVerified: true, books: [book('R', { status: 'reading', currentPage: 5, pageCount: 50 })], digest: true },
};

function makeAdmin(readers = READERS, { pageSize = 2 } = {}) {
  const uids = Object.keys(readers);
  return {
    async listAuthUsers(pageToken) {
      const start = pageToken ? Number(pageToken) : 0;
      const slice = uids.slice(start, start + pageSize);
      return {
        users: slice.map(uid => ({ uid, email: readers[uid].email, emailVerified: readers[uid].emailVerified, displayName: readers[uid].displayName || '' })),
        nextPageToken: start + pageSize < uids.length ? String(start + pageSize) : undefined,
      };
    },
    async readDigestOptIns(list) { return new Set(list.filter(uid => readers[uid].digest)); },
    async readReaderData(uid) { return { books: readers[uid].books, streak: null, goals: null, profile: readers[uid].profile || null }; },
  };
}

const ENV = { CRON_SECRET: 'cron-secret', RESEND_API_KEY: 're_test', VERCEL_ENV: 'production' };

function makeHandler({ admin = makeAdmin(), env = ENV, sent = [], failBatch = false } = {}) {
  const handler = createWeeklyDigestHandler({
    getAdmin: async () => admin,
    sendBatch: async (messages, key) => {
      if (failBatch) throw new Error('resend down');
      sent.push({ messages, key });
    },
    env,
    now: () => NOW,
  });
  return { handler, sent };
}

const req = (overrides = {}) => ({ method: 'GET', headers: { authorization: 'Bearer cron-secret' }, query: {}, ...overrides });

test('only the cron secret opens the route', async () => {
  const { handler, sent } = makeHandler();
  for (const headers of [{}, { authorization: 'Bearer nope' }, { authorization: 'cron-secret' }, { authorization: 'Bearer cron-secrets' }]) {
    const res = makeRes();
    await handler(req({ headers }), res);
    assert.equal(res.statusCode, 401, JSON.stringify(headers));
  }
  assert.equal(sent.length, 0);
  const noSecret = makeHandler({ env: { ...ENV, CRON_SECRET: '' } });
  const res = makeRes();
  await noSecret.handler(req({ headers: { authorization: 'Bearer ' } }), res);
  assert.equal(res.statusCode, 503, 'without a configured secret the route stays closed');
  const wrongMethod = makeRes();
  await handler(req({ method: 'POST' }), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
});

test('mails opted-in, verified readers who had a week to report, and nobody else', async () => {
  const { handler, sent } = makeHandler();
  const res = makeRes();
  await handler(req(), res);
  assert.equal(res.statusCode, 200);
  const recipients = sent.flatMap(call => call.messages.map(m => m.to[0])).sort();
  assert.deepEqual(recipients, ['busy@example.test', 'reading@example.test']);
  assert.deepEqual(res.body, { ok: true, dryRun: false, optedIn: 5, mailed: 2, skippedQuiet: 1, skippedUnverified: 2, failed: 0 });
  const message = sent[0].messages.find(m => m.to[0] === 'busy@example.test');
  assert.equal(message.from, 'LibriQ <updates@libriq.app>');
  assert.match(message.subject, /^Your reading week/);
  assert.match(message.headers['List-Unsubscribe'], /^<https:\/\/www\.libriq\.app\/api\/digest-unsubscribe\?u=busy&t=[\w-]+>$/);
  assert.equal(message.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
  assert.match(message.html, /Bea/);
  const uid = new URL(message.headers['List-Unsubscribe'].slice(1, -1)).searchParams;
  assert.equal(verifyUnsubscribeToken('cron-secret', uid.get('u'), uid.get('t')), true, 'the link in the mail verifies');
});

test('the greeting uses the name set in LibriQ, not the sign-in account name', async () => {
  const done = [book('Done', { status: 'finished', dateFinished: day(1) })];
  const readers = {
    named: { email: 'a@example.test', emailVerified: true, displayName: 'Kim', profile: { displayName: 'Bea Busy' }, books: done, digest: true },
    generic: { email: 'b@example.test', emailVerified: true, displayName: 'Kim', profile: { displayName: 'Reader' }, books: done, digest: true },
    blank: { email: 'c@example.test', emailVerified: true, displayName: 'Cy Auth', profile: { displayName: '   ' }, books: done, digest: true },
    none: { email: 'd@example.test', emailVerified: true, displayName: 'Dee Auth', books: done, digest: true },
    nameless: { email: 'e@example.test', emailVerified: true, profile: { name: 'Eve Old' }, books: done, digest: true },
  };
  const { handler, sent } = makeHandler({ admin: makeAdmin(readers) });
  await handler(req(), makeRes());
  const greetingFor = to => sent.flatMap(call => call.messages).find(m => m.to[0] === to).text.split('\n')[0];
  assert.equal(greetingFor('a@example.test'), 'Hi Bea,', 'the LibriQ name wins');
  assert.equal(greetingFor('b@example.test'), 'Hi Kim,', 'the default name "Reader" is not a real name');
  assert.equal(greetingFor('c@example.test'), 'Hi Cy,', 'a blank LibriQ name falls back');
  assert.equal(greetingFor('d@example.test'), 'Hi Dee,', 'no profile falls back');
  assert.equal(greetingFor('e@example.test'), 'Hi Eve,', 'an older profile that only has name still works');
});

test('a dry run counts but sends nothing, and previews never send', async () => {
  const dry = makeHandler();
  const res = makeRes();
  await dry.handler(req({ query: { dryRun: '1' } }), res);
  assert.equal(dry.sent.length, 0);
  assert.deepEqual(res.body, { ok: true, dryRun: true, optedIn: 5, mailed: 2, skippedQuiet: 1, skippedUnverified: 2, failed: 0 });
  const preview = makeHandler({ env: { ...ENV, VERCEL_ENV: 'preview' } });
  const res2 = makeRes();
  await preview.handler(req(), res2);
  assert.equal(preview.sent.length, 0);
  assert.equal(res2.body.dryRun, true, 'a non-production run is always a dry run');
  const noKey = makeHandler({ env: { ...ENV, RESEND_API_KEY: '' } });
  const res3 = makeRes();
  await noKey.handler(req(), res3);
  assert.equal(res3.statusCode, 503, 'sending needs the Resend key');
  const res4 = makeRes();
  await noKey.handler(req({ query: { dryRun: '1' } }), res4);
  assert.equal(res4.statusCode, 200, 'a dry run does not');
});

test('a retry of the same week reuses the idempotency key', async () => {
  const { handler, sent } = makeHandler();
  await handler(req(), makeRes());
  await handler(req(), makeRes());
  assert.equal(sent.length >= 2, true);
  assert.equal(sent[0].key, sent[sent.length / 2].key, 'same batch, same key');
  assert.match(sent[0].key, /^weekly-digest-2026-W49-[\w-]+$/);
});

// ?only=<email> is for test sends: one verified, opted-in address, and a fresh
// idempotency key each time so Resend does not refuse a repeat as a duplicate.

function makeClockHandler(admin = makeAdmin()) {
  const sent = [];
  const clock = { now: NOW };
  const handler = createWeeklyDigestHandler({
    getAdmin: async () => admin,
    sendBatch: async (messages, key) => { sent.push({ messages, key }); },
    env: ENV,
    now: () => clock.now,
  });
  return { handler, sent, clock };
}
const only = (address, extra = {}) => req({ query: { only: address, ...extra } });

test('?only= mails that one address, ignores the case, and never anyone else', async () => {
  const { handler, sent } = makeClockHandler();
  const res = makeRes();
  await handler(only('BUSY@Example.test'), res);
  assert.deepEqual(res.body, { ok: true, dryRun: false, optedIn: 1, mailed: 1, skippedQuiet: 0, skippedUnverified: 0, failed: 0 });
  assert.deepEqual(sent.flatMap(call => call.messages.map(m => m.to[0])), ['busy@example.test']);
});

test('?only= uses a fresh idempotency key each time, and the normal run keeps its stable one', async () => {
  const { handler, sent, clock } = makeClockHandler();
  await handler(only('busy@example.test'), makeRes());
  clock.now += 1000;
  await handler(only('busy@example.test'), makeRes());
  assert.equal(sent.length, 2);
  assert.notEqual(sent[0].key, sent[1].key, 'a second test send is not a duplicate');
  assert.match(sent[0].key, /^weekly-digest-2026-W49-[\w-]+-test-\d+$/);
  await handler(req(), makeRes());
  await handler(req(), makeRes());
  const normal = sent.slice(2);
  assert.match(normal[0].key, /^weekly-digest-2026-W49-[0-9a-f]+$/, 'no test suffix on the real run');
  assert.equal(normal[0].key, normal[normal.length / 2].key, 'the real run is still idempotent');
});

test('?only= sends nothing for an address that is off, unknown, unverified or quiet', async () => {
  for (const [address, expected] of [
    ['off@example.test', { optedIn: 0, mailed: 0, skippedQuiet: 0, skippedUnverified: 0 }],
    ['nobody@example.test', { optedIn: 0, mailed: 0, skippedQuiet: 0, skippedUnverified: 0 }],
    ['unverified@example.test', { optedIn: 1, mailed: 0, skippedQuiet: 0, skippedUnverified: 1 }],
    ['quiet@example.test', { optedIn: 1, mailed: 0, skippedQuiet: 1, skippedUnverified: 0 }],
  ]) {
    const { handler, sent } = makeClockHandler();
    const res = makeRes();
    await handler(only(address), res);
    assert.equal(sent.length, 0, `${address} sends nothing`);
    assert.deepEqual({ ...res.body, ok: undefined, dryRun: undefined, failed: undefined }, { ...expected, ok: undefined, dryRun: undefined, failed: undefined }, address);
  }
});

test('?only= still honours a dry run, and a malformed value is refused', async () => {
  const { handler, sent } = makeClockHandler();
  const dry = makeRes();
  await handler(only('busy@example.test', { dryRun: '1' }), dry);
  assert.equal(dry.body.mailed, 1);
  assert.equal(sent.length, 0);
  for (const bad of ['', '   ', ['a@example.test', 'b@example.test']]) {
    const res = makeRes();
    await handler(only(bad), res);
    assert.equal(res.statusCode, 400, JSON.stringify(bad));
  }
  assert.equal(sent.length, 0);
});

test('sends in batches of at most 50, and counts a failed batch instead of crashing', async () => {
  const many = {};
  for (let i = 0; i < 120; i += 1) many[`u${i}`] = { email: `u${i}@example.test`, emailVerified: true, books: [book('R', { status: 'reading' })], digest: true };
  const { handler, sent } = makeHandler({ admin: makeAdmin(many, { pageSize: 100 }) });
  const res = makeRes();
  await handler(req(), res);
  assert.deepEqual(sent.map(call => call.messages.length), [50, 50, 20]);
  assert.equal(res.body.mailed, 120);
  const failing = makeHandler({ admin: makeAdmin(many, { pageSize: 100 }), failBatch: true });
  const res2 = makeRes();
  await failing.handler(req(), res2);
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.failed, 120);
  assert.equal(res2.body.mailed, 0);
});

test('without admin credentials the route reports it is not configured', async () => {
  const handler = createWeeklyDigestHandler({ getAdmin: async () => null, sendBatch: async () => {}, env: ENV, now: () => NOW });
  const res = makeRes();
  await handler(req(), res);
  assert.equal(res.statusCode, 503);
});

// ---------- the unsubscribe page ----------

function unsubscribeSetup() {
  const turnedOff = [];
  const handler = createDigestUnsubscribeHandler({
    setDigestOff: async uid => { turnedOff.push(uid); },
    env: { CRON_SECRET: 'cron-secret' },
  });
  const good = { u: 'reader-a', t: unsubscribeToken('cron-secret', 'reader-a') };
  return { handler, turnedOff, good };
}

test('opening the link only asks; nothing changes until the button is pressed', async () => {
  const { handler, turnedOff, good } = unsubscribeSetup();
  const res = makeRes();
  await handler({ method: 'GET', query: good, headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.match(String(res.body), /<form method="post"/);
  assert.match(String(res.body), /Stop the weekly email/);
  assert.deepEqual(turnedOff, [], 'a mail scanner opening the link does not unsubscribe anyone');
});

test('posting a valid link turns the email off, including mail apps one-click posts', async () => {
  const { handler, turnedOff, good } = unsubscribeSetup();
  const res = makeRes();
  await handler({ method: 'POST', query: good, body: 'List-Unsubscribe=One-Click', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(turnedOff, ['reader-a']);
  assert.match(String(res.body), /unsubscribed|turned off/i);
});

test('a bad or missing link is refused and changes nothing', async () => {
  const { handler, turnedOff, good } = unsubscribeSetup();
  for (const query of [{}, { u: good.u }, { u: good.u, t: 'wrong' }, { u: 'reader-b', t: good.t }]) {
    for (const method of ['GET', 'POST']) {
      const res = makeRes();
      await handler({ method, query, headers: {} }, res);
      assert.equal(res.statusCode, 400, `${method} ${JSON.stringify(query)}`);
    }
  }
  assert.deepEqual(turnedOff, []);
  const res = makeRes();
  await handler({ method: 'PUT', query: good, headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('if turning it off fails, the reader is told and can retry', async () => {
  const handler = createDigestUnsubscribeHandler({ setDigestOff: async () => { throw new Error('down'); }, env: { CRON_SECRET: 'cron-secret' } });
  const res = makeRes();
  await handler({ method: 'POST', query: { u: 'reader-a', t: unsubscribeToken('cron-secret', 'reader-a') }, headers: {} }, res);
  assert.equal(res.statusCode, 500);
  assert.match(String(res.body), /try again/i);
});

// ---------- wiring ----------

test('the cron points at a real route and the privacy policy describes the email', async () => {
  const { readFile, access } = await import('node:fs/promises');
  const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(vercel.crons, [{ path: '/api/weekly-digest', schedule: '0 14 * * 1' }], 'Mondays 14:00 UTC; Hobby allows one run a day at most');
  await access(new URL('../api/weekly-digest.js', import.meta.url));
  await access(new URL('../api/digest-unsubscribe.js', import.meta.url));
  assert.ok(vercel.functions['api/weekly-digest.js'].maxDuration >= 30, 'sending a batch of readers can outlast the 10 s default');
  const privacy = await readFile(new URL('../frontend/privacy.html', import.meta.url), 'utf8');
  assert.match(privacy, /weekly reading email/i);
  assert.match(privacy, /off by default/i);
  const settings = await readFile(new URL('../frontend/js/features/settings/settingsPage.js', import.meta.url), 'utf8');
  assert.match(settings, /Weekly reading email/);
});
