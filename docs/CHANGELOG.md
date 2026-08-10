# LibriQ Changelog

This document preserves the full version history and notable patch notes previously maintained in the project README.

## v4.7.0

- Smarter book metadata identity and safer dedupe across ISBN, title, author, and source IDs
- Source badges for Google Books, Open Library, Project Gutenberg, and Internet Archive
- Open Library richer metadata scaffolding with works, editions, authors, subjects, and compact subject display in Book Details
- Open Library subject-backed Discover rails and Gutendex / Project Gutenberg free classics discovery
- Internet Archive readable/archive links only, with no change to main search behavior
- Clickable recommendation cards that open details and add flows more naturally
- Firebase-backed activity history so Dashboard and Activity stay aligned after reloads and site-data clears
- Session restore is smoother and no longer flashes the sign-in screen during temporary auth rehydration
- Backward-compatible saved books with no destructive migration

## v4.6 - Metadata and Discovery Foundation

The v4.7 release retained the v4.6 metadata and discovery work while extending activity, recommendations, and session restoration.

## v4.4.0 - Account & Data Deletion

**Added**

- Delete library data for the current signed-in account
- Delete account with strict typed confirmation and friendly reauth handling
- Safe cleanup for Firestore library docs, cloud backup data, UID-scoped cache, and pending sync state

**Changed**

- Destructive actions now live in a clearer Danger Zone / Account & Data area
- Clear local cache is tucked under Advanced diagnostics instead of the primary destructive actions
- Deleted data is prevented from re-uploading by clearing pending sync state first

**Notes**

- Firestore sync paths still use `users/{uid}/sync/v1/books`
- Cloud backup paths still use `users/{uid}/backups/current`
- Tombstone behavior, account isolation, and the book data model remain intact

## v4.2.0 - Cloud-first Auth Flow

**Added**

- Email/password account creation and sign-in
- No-internet fallback modal with Retry and Continue offline
- Friendly auth errors that avoid exposing raw Firebase error strings

**Changed**

- Normal login now focuses on Google, email sign-in, and account creation
- Continue offline moved out of the normal login screen and into the connection fallback
- Existing Firestore sync paths, backup paths, tombstones, and book data models remain unchanged

The v4.2 overview also recorded that LibriQ opens as a cloud-first account flow with Google, email sign-in, and account creation; email/password authentication shows friendly errors for invalid email, wrong password, weak password, duplicate accounts, and network issues; Continue offline moved into the no-internet fallback modal with Retry and fallback offline entry; and Firestore sync paths, tombstone behavior, backup paths, and book data models remain unchanged.

## v4.1.1

- Settings is easier to read, with Account Sync and Cloud Backup controls simplified for everyday use
- Technical sync details now live behind Advanced diagnostics instead of the normal Settings view
- Account Sync behavior, tombstone safety, debug helpers, and E2E coverage remain in place

## v4.1.0

- Settings now includes Sync Health with account sync state, listener state, recent sync times, device ID, last error, and the active sync path
- Tombstone maintenance can safely prune old local delete records while keeping fresh tombstones for at least 30 days
- Account Sync still stays separate from backup, restore, and merge
- Cloud backup still writes to `users/{uid}/backups/current`
- Account Sync still writes books to `users/{uid}/sync/v1/books`

## v4.0.1 - Automatic Account Sync

**Added**

- Automatic Account Sync for signed-in users in account mode
- Books-only realtime sync under `users/{uid}/sync/v1/books/{bookId}`
- Sync status, last synced, listener state, and turn-off controls in Settings
- Conservative conflict handling that keeps local data when timestamps are unclear

**Changed**

- Automatic cloud backup still writes to `users/{uid}/backups/current`
- Manual restore and merge remain separate from sync
- Continue offline pauses sync while keeping the current device usable

**Notes**

- Realtime Sync Beta is optional and does not add social features or analytics events
- Firestore rules must allow the `users/{uid}/sync/{document=**}` namespace

The v4.0.1 overview also recorded that Account Sync turns on automatically for signed-in account-mode devices; automatic cloud backup, manual restore, and cloud merge remain separate safety tools; sync keeps the backup document untouched; Help & Guide and Settings explain account sync status, offline pause behavior, and conflict safety; and restore remains manual.

## v4.0.0 - Realtime Sync Beta Messaging

The What's New modal highlighted the opt-in Realtime Sync Beta, the separate backup safety net, and conflict-safe behavior while keeping local export/import intact.

## v3.0.2 - Sign-in Environment Guard

**Added**

- Conservative detection for likely in-app browsers and webviews such as TikTok, Instagram, Facebook, Messenger, and LINE
- Helpful guidance when Google sign-in is likely to fail inside an app browser
- A simple `Open in browser` link so users can jump to Chrome or Safari when needed

**Changed**

- Google sign-in now shows friendlier popup, unauthorized-domain, and disallowed-useragent guidance
- Continue offline stays available as the fallback when account services are unavailable
- The What's New modal now waits until the app has entered cleanly instead of interrupting the session picker

**Notes**

- LibriQ remains local-first and privacy-first
- No Firestore, cloud backup, cloud sync, or private library upload was added

## v2.20.0 - Final Local-First Polish

**Changed**

- Settings, Help, backups, and empty states now use calmer local-first wording
- Private notes and quotes are described as staying local unless included in an exported backup
- Optional account backup is mentioned subtly as a future possibility

**Notes**

- No backend, accounts, cloud sync, or new analytics behavior was added
- The local-first experience remains the same, just clearer and more polished

## v2.19.0 - Private Quotes

**Added**

- Private quote saving inside Book Details
- Optional page number and optional thought/context for each quote
- Quote data included naturally in local exports and imports

**Changed**

- Private notes and quotes stay local unless included in an exported backup
- No backend, accounts, cloud sync, or quote analytics were added

## v2.18.0 - Backup Confidence

**Added**

- Last exported timestamp in Settings > Data
- Safer import preview before replace or merge
- Export-first warning for Clear All Data

**Changed**

- Merge mode now checks id, ISBN, then normalized title and author
- Backups remain manual, private notes are included in exports, and no cloud sync or accounts were added

## v2.17.1 - Maintenance Polish

**Fixed**

- Theme switching now applies immediately, and the toggle label/icon update in sync
- Statistics keeps the selected Yearly Recap year and rerenders the recap correctly
- App versioning and the service worker cache now match at v2.17.1

**Notes**

- No backend, account, sync, or new analytics behavior was added
- The patch keeps the existing privacy model intact

## v2.17.0 - Yearly Reading Recap

**Added**

- Local Yearly Reading Recap in Statistics
- Year selector for reviewing a selected year of finished books
- Fun summary stats based on local library data

**Changed**

- The recap is generated from the user’s saved local library data
- Private notes are not used in recap calculations
- No sharing, backend, cloud sync, or analytics behavior was added or changed

**Notes**

- This update stays read-only and local-first
- Existing storage data and backup compatibility are unchanged

## v2.14.0 - Search & Privacy Transparency

**Added**

- Search source status in Settings for Open Library and Google Books
- Google Books key status in Settings showing only configured or not configured
- Privacy and local data notes in Settings

**Changed**

- Settings now makes it clear that normal users do not need to configure anything

**Notes**

- This update does not change search behavior, storage behavior, or local data handling
- The app still falls back to Open Library when Google Books is rate-limited or unavailable

## v2.13.0 - Metadata Cleanup Tools

**Added**

- Needs Metadata view for spotting books with incomplete metadata
- Lightweight metadata quality indicators on saved books
- Easier access to the existing Refresh Metadata action for cleanup

**Changed**

- Metadata gaps are now easier to review without changing saved reading data

**Notes**

- Refresh remains user-triggered and does not mass-update the library
- Manual books and API-added books both remain supported

## v2.12.0 - Project Showcase & Screenshots

**Added**

- README screenshot showcase for the project
- Labeled screenshots for Dashboard, Library, Book Details, Search, Help, and mobile viewing

**Changed**

- Documentation is easier to browse thanks to a concise visual section

**Notes**

- This update does not change user data or localStorage behavior
- Screenshot automation remains unchanged

## v2.11.0 - Reading Activity History

**Added**

- Local reading activity history stored in `libriq_activity`
- Activity page with date grouping and filters for books, progress, notes, backups, and metadata
- Recent Activity dashboard feed powered by the activity log
- Activity history included in local JSON backups

**Changed**

- Recent dashboard activity now prefers the saved activity log and falls back to derived book dates when the log is empty
- Backup import now restores activity history on replace and safely merges activity on merge imports

**Notes**

- Activity data stays local in the browser and is capped to the latest 500 events
- Older backups without activity still import normally

## v2.10.1 - Offline Search State Polish

**Added**

- Clearer offline search messaging when the app is offline
- Search UI state handling that avoids stale offline banners
- Clear labeling for cached offline web results

**Changed**

- Online web search is now blocked while `navigator.onLine` reports offline status
- Fresh online results now restore the normal `From the web` label
- Offline search no longer implies a fresh fetch when the browser is disconnected

**Notes**

- Saved library features remain fully usable offline
- Online Open Library and Google Books search still requires internet access

## v2.10.0 - PWA Offline Shell

**Added**

- PWA-friendly offline app shell support
- Finalized LibriQ favicon and app icon assets
- Manifest support for installable app behavior
- App shell caching for local access to the interface
- Offline access to the saved local library

**Changed**

- The app shell is designed to stay available even when network access is unavailable
- Live Open Library and Google Books search remains network-dependent

**Notes**

- The offline shell is intended for local app access, not offline web search
- Saved books, notes, ratings, progress, and local search continue to work without internet

## v2.9.0 - What's New Modal

**Added**

- Local-only What's New modal that appears after updating to a newer LibriQ version
- Dismissed-version tracking in `libriq_seen_version`
- Friendly release notes summary for the latest local-first improvements

**Changed**

- The app now shows a simple release notes popup only when the current version has not been dismissed yet
- The modal can be closed with the button or Escape without affecting saved library data

**Notes**

- This feature stays fully local and does not send any data anywhere
- Existing book data, import/export, search, Help, and recommendations are unchanged

## v2.8.0 - Local Recommendations

**Added**

- Recommendations page in the app navigation
- Local suggestion groups based on saved library signals like favorite genres, authors, ratings, favorites, currently reading mood, and Want to Read shelf
- Recommendation cards with cover, title, author, reason label, and saved status

**Changed**

- Recommendations are generated fully from the user's local library data
- Saved recommendation cards open the existing Book Details modal

**Notes**

- No backend, analytics, cloud sync, or generated book data were added
- Import/export, manual entry, search, Help, and existing library behavior remain unchanged

## v2.7.0 - Advanced Search Filters

**Added**

- Compact advanced filters inside the existing search modal
- Filter controls for author, published year, genre/subject, source, has description, and has cover
- Clear/reset filters action
- Small active-filter indicator in the search UI

**Changed**

- Online search results can now be refined before adding a book to the library
- Filters work on the merged search result data already returned by Open Library and Google Books

**Notes**

- Search filters only affect online search results and do not change saved library search or sorting
- Manual entry, book details, notes, backups, and Help remain unchanged

## v2.6.0 - Help & Guide Center

**Added**

- Beginner-friendly Help & Guide Center in the app navigation
- Card-based walkthrough sections for getting started, search, manual entry, library management, progress tracking, private notes, backups, and local-first storage
- FAQ / troubleshooting section for common local-first questions
- Quick action buttons to jump back into search or the library from the guide

**Changed**

- Help content is fully local and static, matching LibriQ's frontend-only model
- The new guide uses the same calm card-based visual language as the rest of the app

**Notes**

- This feature is for product guidance only and does not add accounts, sync, or backend services
- Existing library data, notes, import/export behavior, and sorting logic are unchanged

## v2.5.0 - Library Search & Sorting

**Added**

- Saved-library search for quickly finding books in the local collection
- Sorting controls for organizing saved books by common library fields
- Local-only search and sort behavior that works without internet access

**Changed**

- Library browsing is faster for larger collections because search and sorting happen on saved local data
- Saved books can be organized without affecting online search or manual entry flows

**Notes**

- This feature does not change online book search behavior
- Library search and sorting remain fully local and independent of the Open Library and Google Books APIs

## v2.4.0 - Import / Export Backup

**Added**

- Local JSON export for the full LibriQ library backup
- Local JSON import with validation before any data is applied
- Replace or merge import flow for restoring backups safely

**Changed**

- Exported backups now include books plus relevant local data such as profile, goals, and streak state
- Import handling preserves the local-first model and keeps API books, manual books, ratings, progress, favorites, notes, and metadata intact

**Notes**

- Backups stay on the user's device and are never uploaded anywhere
- Merge mode deduplicates by existing book ID and replace mode clearly warns before overwriting current local data

## v2.3.0 - Search Result Descriptions

**Added**

- Short description previews in book search results when synopsis data is available
- A safe fallback message for results without a description

**Changed**

- Search results now surface merged description data from Open Library and Google Books before adding a book
- Book additions continue to persist the full description into the saved local book object

**Notes**

- Descriptions are displayed as short previews only and remain part of the existing local-first data model

## v2.2.0 - Manual Book Entry

**Added**

- Manual book entry flow for books that cannot be found through Open Library or Google Books
- Manual Entry action in the search modal and no-results state
- Manual Book Entry form with required title and author fields
- Optional cover URL, page count, genre/category, description, published year, publisher, language, and reading status fields
- Reliable IDs for manually created books
- `source: "manual"` metadata for manually entered books

**Changed**

- Manual books now use the same local storage model and support the same Book Details, rating, progress, favorite, remove, notes, and statistics features as API books
- Search modal now provides a more direct fallback when no API results are available

**Notes**

- Manual books remain local-first and are stored only in the browser using `localStorage`
- Existing Open Library and Google Books add flows are unchanged

## v2.1.0 - Private Notes

**Added**

- Private notes for each saved book
- Notes textarea inside the Book Details modal
- Save Note and Clear Note actions
- Last updated timestamp for saved notes
- `notes` and `notesUpdatedAt` fields in saved book data

**Changed**

- Book Details now supports personal reading thoughts without requiring a backend or account system
- Metadata refresh preserves private notes together with existing personal reading data

**Notes**

- Notes are stored through `localStorage` and remain private to the current browser/device
- This update moves LibriQ closer to a personal reading journal while keeping the app local-first

## v2.0.0 - Core Reading Tracker Update

**Added / Improved**

- Updated LibriQ branding
- Book search using Open Library and Google Books
- Merged and deduplicated search results
- Personal library with status filters
- Book Details modal with rating, progress, favorite, remove, and metadata refresh actions
- Statistics page with reading summaries
- Responsive desktop and mobile design
- Light and dark theme support
- Deployment cleanup for Vercel
- README rewritten as a project overview and guide

**Notes**

- This version established LibriQ as a stable local-first personal book tracker and the foundation for future product updates
