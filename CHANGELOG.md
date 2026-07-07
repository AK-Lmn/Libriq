# Changelog

## v4.5.2

LibriQ's latest release is a Studio polish pass focused on the cloud-first account experience.

### Highlights

* Desktop and mobile polish across Dashboard, Library, Book Details, Status pages, Statistics, Activity, Recommendations, Settings, and Help & Guide
* Cloud-first auth clarity with Google sign-in, email/password sign-in, and fallback offline access only when account services are unavailable
* Safer account and data controls with strict typed confirmations preserved for library deletion and account deletion
* Add Book, Book Details, Settings, and mobile layouts tuned for clearer spacing and better contrast
* Recommendations light mode and visual surfaces aligned with the newer Studio direction
* Service worker stale-cache cleanup for local development

### Notes

* No Gemini recommendations yet
* No v4.6 metadata expansion yet
* No Tailwind migration
* No change to auth, sync, Firestore paths, or book data model behavior

## v4.4.0

* Account and library deletion safety work
* Strict destructive confirmations
* Clear local cache moved under Advanced diagnostics

