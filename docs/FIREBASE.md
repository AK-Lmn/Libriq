# Firebase, Authentication, Sync, and Backup

LibriQ uses the Firebase client SDK for authentication and Cloud Firestore. The browser application does not require Firebase Admin credentials or a private server-side service account.

## Authentication

The normal account flow supports Google sign-in, email/password sign-in, and account creation. Friendly messages cover invalid email, incorrect credentials, weak passwords, duplicate accounts, popup cancellation or blocking, unauthorized domains, disallowed user agents, and network failures.

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

## Firestore Rules

Cloud backup and Account Sync require rules for both the backup document and sync namespace. These rules are preserved exactly from the original README:

```rules
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/backups/{backupId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    match /users/{userId}/sync/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Cloud-backed activity additionally requires:

```rules
match /users/{uid}/activity/{activityId} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

## Privacy Boundary

Account Sync does not add social features. Basic page-view analytics does not include book titles, authors, ISBNs, notes, search terms, progress, or private library content. Firebase client configuration is public client configuration; private Firebase Admin credentials, if used by deployment tooling outside the browser application, must remain in protected deployment environment variables.

See [Deployment](DEPLOYMENT.md) for local and hosted environment configuration.
