# Firebase, Authentication, Sync, and Backup

LibriQ uses the Firebase client SDK for authentication and Cloud Firestore. The browser application does not require Firebase Admin credentials or a private server-side service account.

## Authentication

The normal account flow supports Google sign-in, email/password sign-in, and account creation. Friendly messages cover invalid email, incorrect credentials, weak passwords, duplicate accounts, popup cancellation or blocking, unauthorized domains, disallowed user agents, and network failures.

### Password policy and email enumeration protection

New passwords need at least 8 characters (`frontend/js/shared/passwordPolicy.js`). The sign-up form checks this before calling Firebase, but Firebase is what enforces it, so two Console settings must match:

1. Firebase Console -> Authentication -> Settings -> Password policy: enforce, minimum length 8. Choose "Require enforcement" only for new passwords; existing users with shorter passwords can still sign in.
2. Firebase Console -> Authentication -> Settings -> User actions -> Email enumeration protection: on.

With enumeration protection on, a wrong email and a wrong password both come back as `auth/invalid-credential`, and password reset reports success for unknown addresses. The app already shows one message for both sign-in cases and "sent if an account exists" for resets. Sign-up still says when an email is taken; Firebase can't hide that without blocking sign-up.

When account services cannot be reached, a no-internet fallback can offer Retry and Continue offline. In-app browser and webview detection can recommend opening LibriQ in Chrome or Safari when Google sign-in is likely to fail. Session restoration waits for Firebase auth rehydration instead of briefly showing the signed-out screen.

## Local Data and Account Scope

Books, reading progress, ratings, favorites, notes, quotes, goals, streaks, and activity have a device-local representation. Signed-in storage is scoped by Firebase UID so account libraries remain isolated. Offline mode keeps the current device usable and pauses account sync.

## Account Sync

Account Sync turns on automatically for signed-in account-mode devices and stores individual books at:

```text
users/{uid}/sync/v1/books/{bookId}
```

It uses timestamp-aware, conservative conflict handling. When timestamps are unclear, local data is retained rather than overwritten. Deleted-book tombstones stop removed records from returning; old tombstones can be pruned while fresh records are retained for at least 30 days.

Settings exposes everyday sync state and an Advanced diagnostics area with listener state, recent snapshot and write times, device ID, last error, pending books and deletions, tombstone information, eligibility, and the active sync path.

Activity history uses:

```text
users/{uid}/activity/{activityId}
```

The route never trusts a frontend-provided UID. Dashboard and Activity can therefore remain aligned after reloads or local site-data clearing.

## Cloud Backup

Cloud backup is separate from Account Sync and writes a backup document to:

```text
users/{uid}/backups/current
```

Backup behavior includes automatic backup after local changes when signed in, explicit Back Up Now, manual restore with a preview, and cloud/device merge with a preview. Restore remains manual. Sync does not write to or replace the backup document, and backup/restore/merge do not change the sync namespace.

Local JSON export and import remain available as a separate manual safety path.

## Deletion Safety

Delete Library Data removes the current signed-in account's library data. Delete Account uses strict typed confirmation and friendly recent-login handling. Cleanup covers Firestore library documents, cloud backup data, UID-scoped cache, and pending sync state. Pending state is cleared before deletion so removed data is not uploaded again.

Clear Local Cache remains a diagnostics action and is distinct from deleting account or library data.

### Server-side account deletion

Delete Account first asks `POST /api/delete-account` (a Vercel function, `api/delete-account.js`) to do the work. The browser sends its Firebase ID token; the server checks it (including revocation), requires a sign-in within the last five minutes, deletes everything under `users/{uid}` with `recursiveDelete` plus the poll vote, and then deletes the Firebase Auth user. Data goes first so a failure leaves an account the reader can sign back into and retry.

If the route answers 404, 405 or 503 (local dev, or no credentials configured) or the request can't be sent, the browser falls back to the older client-side wipe.

The route needs one environment variable in the Vercel project:

1. Firebase Console -> Project settings -> Service accounts -> Generate new private key. This downloads a JSON key.
2. Vercel -> the LibriQ project -> Settings -> Environment Variables. Add `FIREBASE_SERVICE_ACCOUNT` with the whole JSON as the value (base64 of the JSON also works), for Production and Preview, marked Sensitive.
3. Redeploy, then delete the downloaded JSON file. Never commit it.

The project is on the Spark plan, so there is no Cloud Function on user delete: an account removed by hand in the Firebase Console keeps its Firestore data until it is cleaned up separately.

## Firestore Rules

[`firestore.rules`](../firestore.rules) at the repo root is the source of truth. `firebase.json` points the Firebase CLI at it. Don't edit rules in the Console; change the file and deploy it.

Paths the browser reads or writes, and the rule that covers each:

| Path | Who | Rule |
| --- | --- | --- |
| `users/{uid}/sync/v1/books/{bookId}` | owner | whole-doc writes; keys limited to what `normalizeBookForSync()` writes; `id` must match the doc id; strings, lists and maps size-capped |
| `users/{uid}/activity/{activityId}` | owner | merge writes; `id` must match the doc id; known fields type- and size-checked; at most 40 keys |
| `users/{uid}/profile/current` | owner | merge writes; known fields checked; at most 30 keys (older docs keep their extra fields) |
| `users/{uid}/goals/current` | owner | same as profile |
| `users/{uid}/streak/current` | owner | same as profile |
| `users/{uid}/backups/current` | owner | whole-doc writes; top-level keys fixed; up to 10,000 books and 20,000 activity entries |
| `users/{uid}/polls/mobile_app` | owner | same fields as the poll vote below |
| `polls/mobile_app/votes/{uid}` | owner, create/update only | `polls/{pollId}/votes/{voterUid}`: no client reads or deletes; fields limited to `choice`, `os`, `createdAt` |

Anything outside these paths is denied, including the `users/{uid}` doc itself and any other subcollection.

Rules can't look inside list items (quotes, highlights) or cap how many book or activity docs a user has. The 1 MiB Firestore document limit is the backstop there.

`tests/firestore-rules.test.js` fails if the app starts writing a book or backup key the rules don't list. `npm run test:rules` runs the rules against the Firestore emulator (needs Java 11+).

### Deploying

The repo has no `.firebaserc`, so the project id stays out of git. Pass it on the command line (or run `firebase use --add` locally; `.firebaserc` is per-developer).

1. Copy the current live rules from Firebase Console -> Firestore Database -> Rules into a scratch file and diff them against `firestore.rules`. Anything live that the file doesn't cover will stop working after deploy.
2. Deploy:

   ```sh
   firebase deploy --only firestore:rules --project <project-id>
   ```

3. In the Console Rules playground, check that an unauthenticated `get`/`list` on `polls/mobile_app/votes` is denied.

### Reading poll results

Poll votes are not publicly readable. `scripts/poll-results.mjs` reads them through the Firestore REST API with your own Google credentials:

```sh
gcloud auth login                 # a Google account with IAM access to the project
npm run poll:results              # uses `gcloud auth print-access-token`
npm run poll:results -- --demo    # sample output, no network
```

The account needs read access to Firestore, for example `roles/datastore.viewer`. You can pass a token instead of having the script call gcloud: `FIRESTORE_ACCESS_TOKEN=$(gcloud auth print-access-token) npm run poll:results`. `FIREBASE_PROJECT_ID` comes from `.env` or the environment. The script prints only `choice` and `os` counts.

### Cleaning up legacy poll data

Before this change, votes stored the voter's email, uid, user agent and an anonymous `voter_*` id. `scripts/cleanup-poll-pii.mjs` is a one-off fix for existing data in `polls/mobile_app/votes`:

- docs with ids starting `voter_` (anonymous, no account) are deleted
- uid-keyed docs have `email`, `userAgent`, `voterId`, `uid` and `timestamp` removed

It uses the same gcloud token as `poll-results.mjs` and needs write access (`roles/datastore.user`). It prints counts only, never ids or field values.

```sh
node scripts/cleanup-poll-pii.mjs           # dry run: counts only, no writes
node scripts/cleanup-poll-pii.mjs --apply   # delete anonymous docs, strip PII fields
```

Run the dry run first and check the counts. Deploy the new rules before or right after `--apply` so old clients can't write the fields back.

## Privacy Boundary

Account Sync does not add social features. Basic page-view analytics does not include book titles, authors, ISBNs, notes, search terms, progress, or private library content. Firebase client configuration is public client configuration; private Firebase Admin credentials, if used by deployment tooling outside the browser application, must remain in protected deployment environment variables.

See [Deployment](DEPLOYMENT.md) for local and hosted environment configuration.
