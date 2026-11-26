# Weekly reading email

Readers opt in under Settings > Account > "Weekly reading email" (off by default).
Every Monday at 14:00 UTC a Vercel cron calls `GET /api/weekly-digest`, which
emails a short summary to each opted-in reader with a verified address.

What is in it, from the data Account Sync stores for that reader: books finished
in the last 7 days, books being read, the streak (only if they read in the last
2 days) and goal progress. A reader with nothing to report that week gets no
email. A reader without Account Sync has no server-side data, so they are skipped.

## Pieces

| Part | Where |
| --- | --- |
| Opt-in row, saved to `users/{uid}/prefs/email` | `frontend/js/features/settings/settingsPage.js`, `LibriqFirebase.readEmailPrefs/writeEmailPrefs` |
| Firestore rule for that document | `firestore.rules` (`isValidEmailPrefs`) |
| Digest logic, email template, unsubscribe page | `api/_lib/weeklyDigest.js` |
| Admin reads (Auth users, opt-ins, books/streak/goals) | `api/_lib/digestAdmin.js` |
| Routes | `api/weekly-digest.js`, `api/digest-unsubscribe.js` |
| Schedule | `vercel.json` (`crons`, `functions`) |

Mail goes out through Resend's batch endpoint as `LibriQ <updates@libriq.app>`,
at most 50 per request, with an `Idempotency-Key` per week and batch so a retry
does not double-send. Each email has a `List-Unsubscribe` header (one-click POST)
and a link to `/api/digest-unsubscribe`, which asks first (mail scanners open
links) and only turns the email off on the button press or a mail app's POST.

## Turning it on (Production, in this order)

1. Deploy the rules: `firebase deploy --only firestore:rules`. Until then the
   Settings toggle cannot save.
2. In Vercel > Settings > Environment Variables, for **Production** add:
   - `CRON_SECRET`: a long random string (Vercel sends it to the cron as
     `Authorization: Bearer ...`; unsubscribe links are signed with a key
     derived from it, so changing it invalidates links in emails already sent).
   - `RESEND_API_KEY`: a Resend key allowed to send from `libriq.app`.
   - The `FIREBASE_ADMIN_*` variables already exist (used by `/api/delete-account`).
3. Deploy. The cron appears under Vercel > Settings > Cron Jobs.
4. Check without sending anything:
   `curl -H "Authorization: Bearer $CRON_SECRET" "https://www.libriq.app/api/weekly-digest?dryRun=1"`
   returns `{ ok, dryRun, optedIn, mailed, skippedQuiet, skippedUnverified, failed }`,
   where `mailed` is how many it would send.
5. Opt your own account in and run the same URL without `dryRun=1` to send once.

## Turning it off

Remove the cron from `vercel.json`, or delete `CRON_SECRET` (the route then answers
503 and nobody is mailed). Readers can also turn it off themselves.

## Limits

- Previews and non-production runs are always dry runs: previews share the
  production Firebase project.
- One run covers at most 500 opted-in readers and the function may run for 60 s.
  It lists every Auth account (1,000 per page) and reads each account's opt-in
  document, which is fine for a small user base. Past a few thousand accounts,
  store opt-ins where a collection-group query can find them instead.
- Hobby crons run at most once a day and may start up to an hour late.
- Local checks: `npm test` (logic, route, unsubscribe page) and `npm run test:rules`
  (rules plus the Admin reads against the Firestore and Auth emulators).
