# LibriQ

**LibriQ** is a personal book-tracking web app designed to help readers organize their library, track reading progress, rate books, save favorites, write private notes, refresh book metadata, and view reading statistics in one calm and focused workspace.

The app is built with **HTML, CSS, and Vanilla JavaScript**, with book data powered by **Open Library** and **Google Books**.

LibriQ is currently focused on being a polished local-first reading tracker. Saved library data, reading progress, ratings, favorites, and private notes are stored in the browser using `localStorage`, with automatic cloud backup for signed-in users, safer manual cloud restore previews, manual cloud merge previews, automatic Account Sync for signed-in account-mode devices, Sync Health diagnostics, and optional JSON export/import for manual safety copies.

LibriQ also uses basic Google Analytics page-view tracking for anonymous traffic measurement only.

---

## Overview

LibriQ helps users manage their personal reading life through a simple and organized interface.

With LibriQ, users can:

* Search for books online
* Add books to a personal library
* Enter books manually when a search match is not available
* Search and sort the saved library
* Organize books by reading status
* Track reading progress by page
* Mark books as finished
* Favorite and unfavorite books
* Rate books
* Write private notes for each saved book
* View detailed book information
* Refresh missing book metadata
* View reading statistics and progress summaries
* Export and import local library backups
* Manually back up private library data to Firestore when signed in
* Manually restore a cloud backup later
* Open the Help & Guide Center for app walkthroughs
* Refine online searches with advanced filters
* Discover local recommendations from saved library data
* Read update highlights in the What's New modal
* Use the PWA shell and app icons for offline-friendly access

The app is designed to feel like a focused digital reading space instead of a plain spreadsheet-style tracker.

---

## What's New in v4.3.0

* Signed-in users can keep editing while temporarily offline
* Offline edits save locally and survive refresh
* Pending edits auto-sync when internet returns
* Offline deletes create UID-scoped tombstones
* Pending sync state stays scoped to the signed-in UID
* Local-only offline mode remains separate from signed-in account mode
* Settings now shows friendly sync status like "Saved locally. Will sync when online."
* Firestore sync paths, backup paths, tombstone behavior, account isolation, and book data models remain unchanged

## What's New in v4.2.0

* LibriQ now opens as a cloud-first account flow with Google, email sign-in, and account creation
* Email/password auth shows friendly errors for invalid email, wrong password, weak password, duplicate accounts, and network issues
* Continue offline moved into the no-internet fallback modal with Retry and local-only offline entry
* Firestore sync paths, tombstone behavior, backup paths, and book data models remain unchanged

---

## What's New in v4.1.1

* Settings is easier to read, with Account Sync and Cloud Backup controls simplified for everyday use
* Technical sync details now live behind Advanced diagnostics instead of the normal Settings view
* Account Sync behavior, tombstone safety, debug helpers, and E2E coverage remain in place

---

## What's New in v4.1.0

* Settings now includes Sync Health with account sync state, listener state, recent sync times, device ID, last error, and the active sync path
* Tombstone maintenance can safely prune old local delete records while keeping fresh tombstones for at least 30 days
* Account Sync still stays separate from backup, restore, and merge
* Cloud backup still writes to `users/{uid}/backups/current`
* Account Sync still writes books to `users/{uid}/sync/v1/books`

---

## What's New in v4.0.1

* Account Sync now turns on automatically for signed-in account-mode devices
* Automatic cloud backup, manual restore, and cloud merge remain separate safety tools
* Sync keeps the backup document untouched and uses `users/{uid}/sync/v1/books/{bookId}`
* Help & Guide and Settings now explain account sync status, offline pause behavior, and conflict safety
* Restore remains manual, and the backup path still stays `users/{uid}/backups/current`

---

## Screenshots

### Dashboard
![Dashboard](docs/screenshots/dashboard-desktop.png)
An at-a-glance home view with reading progress, goal tracking, and recent activity.

### Library
![Library](docs/screenshots/library-desktop.png)
A cover-forward shelf for browsing saved books, filters, and library search.

### Book Details
![Book Details](docs/screenshots/book-details-desktop.png)
The book detail modal for progress, rating, notes, favorites, and metadata.

### Search
![Search](docs/screenshots/search-modal-desktop.png)
The search experience for finding books online before adding them locally.

### Help & Guide
![Help & Guide](docs/screenshots/help-guide-desktop.png)
A built-in guide for getting started, using backups, and learning key features.

### Mobile View
![Mobile View](docs/screenshots/dashboard-mobile.png)
A compact mobile layout that keeps the dashboard easy to scan on smaller screens.

---

## Features

### Book Search

LibriQ uses both **Open Library** and **Google Books** to search for book data.

Search features include:

* Search modal
* `Ctrl / Cmd + K` shortcut
* Results from multiple book APIs
* Merged and deduplicated search results
* Book covers, authors, page counts, genres, and descriptions when available
* Add-to-library action from search results
* Fallback handling when one source has limited data

### Manual Book Entry

LibriQ includes a manual entry flow for books that are not found through the online APIs.

Manual entry supports:

* Required title and author fields
* Optional cover, page count, genre, description, year, publisher, language, and reading status fields
* Local-only saving with the same library actions as API-added books

---

### Library Search & Sorting

The saved library includes its own search and sorting tools.

Library search and sorting includes:

* Search by title, author, genre, status, and other saved metadata
* Sorting by multiple saved-library fields
* Fast filtering that stays fully local and works offline

---

### Import / Export Backup

LibriQ includes local JSON import and export for backups.

Backup features include:

* Exporting the full local library backup
* Importing a JSON backup with validation
* Replace or merge import flow
* Backups that stay on the user's device

### Manual Cloud Backup

LibriQ also includes a cloud backup path for signed-in users.

Cloud backup features include:

* Automatic backup to Firestore after local library changes when signed in
* Manual restore from the saved cloud backup
* Continued local-only use when no account is signed in
* JSON export/import still available as an optional manual backup path
* Account Sync remains separate from backup, restore, and merge

---

### Help & Guide Center

LibriQ includes a built-in Help & Guide Center for onboarding and support.

The guide includes:

* Getting started help
* Search guidance
* Manual entry guidance
* Library management tips
* Progress and notes walkthroughs
* Backup guidance
* Manual cloud merge preview guidance
* Local-first storage explanations

---

### Advanced Search Filters

The search modal includes optional filters for refining online results.

Filters include:

* Author
* Published year
* Genre or subject
* Source
* Has description
* Has cover

---

### Local Recommendations

LibriQ includes recommendations based on the user's saved library.

Recommendations are derived locally from:

* Favorites
* Genres
* Ratings
* Reading status
* Saved reading patterns

---

### What's New Modal

LibriQ includes a local What's New modal for version highlights.

It shows:

* Recent feature summaries
* Dismissed-version tracking
* A lightweight release-notes experience that stays fully local

In v3.0.2, the modal is delayed until after normal app entry so it no longer pops over the session picker or auth-loading state.

In v4.0.0, the modal highlights the opt-in Realtime Sync Beta, the separate backup safety net, and conflict-safe behavior while keeping local export/import intact.

---

### PWA and Icons

LibriQ includes PWA-ready icon and manifest support.

This includes:

* Browser favicon assets
* App icon assets
* Apple touch icon support
* Maskable icon support
* Installed app shortcut icon sizes
* A service-worker-backed offline shell for the app interface

The offline shell is intended to keep the app usable locally while still requiring internet access for live Open Library and Google Books search.

---

### Personal Library

The Library page displays saved books in a cover-forward layout.

Books can be filtered by:

* All
* Reading
* Want to Read
* Finished
* Favorites

Each saved book can include:

* Cover image
* Title and author
* Genres or categories
* Reading status
* Current page
* Page count
* Progress percentage
* Favorite state
* Rating
* Private notes
* Description or synopsis when available

---

### Book Details

Each saved book has a detailed view for managing reading progress, personal notes, and metadata.

The Book Details view includes:

* Book cover
* Title and author
* Status and genre badges
* Rating control
* Reading progress section
* Current page tracking
* Mark finished action
* Private Notes section
* Save and clear note actions
* Last updated timestamp for notes
* Favorite/unfavorite action
* Remove book action
* "About this book" section
* Refresh metadata action

If a book does not have a synopsis from the available sources, LibriQ shows:

> No description available yet.

The metadata refresh action can attempt to fill missing details such as synopsis, publisher, page count, cover, language, and genres without overwriting personal reading data like progress, status, rating, favorite state, or private notes.

---

### Private Notes

LibriQ includes local-only private notes for saved books.

Users can:

* Write personal thoughts for each book
* Save notes from the Book Details modal
* Edit existing notes
* Clear saved notes
* See when a note was last updated

Private notes are stored locally in the browser using `localStorage`. They are not public, not synced to an account, and not sent to a backend.

---

### Dashboard

The Dashboard gives a quick overview of the user's current reading activity.

It includes:

* Total books
* Currently reading count
* Finished books
* Reading streak
* Currently reading section
* Reading goal progress
* Recent activity
* Quick access to book details and progress updates

---

### Statistics

The Statistics page summarizes reading activity and saved library data.

Current statistics include:

* Total books
* Books finished
* Pages read
* Average rating
* Reading streak
* Books per month
* Pages per month
* Genre breakdown
* Highest-rated books
* All-time reading summary

Statistics are generated from the books saved in the user's local library.

---

### Reading Goals

LibriQ includes reading goal tracking to help users monitor progress toward a yearly reading target.

The reading goal view can show:

* Current reading goal
* Books completed
* Books remaining
* Completion percentage
* Goal progress visualization

---

### Theme and Responsive Design

LibriQ supports both dark and light themes, while the main visual direction is optimized around a warm dark interface.

The app is responsive across:

* Desktop
* Tablet
* Mobile screens

The interface includes mobile-friendly spacing, touch targets, cards, modals, and layouts.

---

## Design Direction

LibriQ uses a calm, reading-first visual direction.

The design focuses on:

* Warm dark surfaces
* Gold accent colors
* Elegant serif headings
* Clean sans-serif interface text
* Cover-forward book cards
* Soft borders and subtle shadows
* Clear reading progress visuals
* Mobile-friendly spacing
* Improved contrast and focus states

---

## Branding & Icon System

LibriQ uses a custom bookmark-inspired "Q" icon designed in Figma. The mark connects the app name with reading, saving books, and keeping a personal library.

The icon system includes:

* Browser favicon assets
* App icon assets
* Apple touch icon
* PWA-ready icon sizes
* Maskable icon support for installable app shortcuts

The visual direction uses:

* A warm gold mark
* A deep brown / black background
* A look that stays consistent with LibriQ's calm reading-first interface

---

## How LibriQ Works

LibriQ is a frontend-only web app.

It uses:

* **HTML** for structure
* **CSS** for layout, styling, themes, and responsive design
* **Vanilla JavaScript** for app logic and interactions
* **Open Library API** for book search data
* **Google Books API** for additional book metadata
* **localStorage** for saving the user's personal library
* **Custom Figma-designed icon assets** for the favicon, app icon, and PWA manifest

Because the app stores data locally, saved books, notes, ratings, and progress are tied to the browser being used.

---

## Data Stored Locally

LibriQ can save the following information for each book:

* Book ID
* Title
* Author
* Cover image
* Page count
* Current page
* Reading status
* Favorite state
* Rating
* Private notes
* Notes last updated date
* Description
* Genres
* Publisher
* Published year
* Language
* Date added
* Date started
* Date finished

This allows the app to preserve reading progress, ratings, private notes, and personal book state between sessions.

---

## Project Structure

```text
LibriQ/
|-- frontend/
|   |-- assets/
|   |   `-- icons/
|   |-- css/
|   |-- js/
|   |-- index.html
|   `-- manifest.json
|-- docs/
|   `-- screenshots/
|-- scripts/
|-- package.json
|-- package-lock.json
|-- README.md
`-- LICENSE
```

---

## Current Status

LibriQ is still in active development.

The current version focuses on improving the core local-first reading tracker experience, including library management, book search, reading progress, book details, ratings, private notes, metadata, statistics, responsive design, search filtering, local recommendations, backups, automatic cloud backup, help content, and the PWA offline shell.

---

## Local Setup Notes

LibriQ searches public book sources like Open Library and Google Books. Normal users do not need to configure anything.

If you want Firebase sign-in to work while testing locally:

1. Create a root-level `.env` file.
2. Add these variables:
   * `GOOGLE_BOOKS_API_KEY`
   * `FIREBASE_API_KEY`
   * `FIREBASE_AUTH_DOMAIN`
   * `FIREBASE_PROJECT_ID`
   * `FIREBASE_STORAGE_BUCKET`
   * `FIREBASE_MESSAGING_SENDER_ID`
   * `FIREBASE_APP_ID`
3. Run `npm run build` to generate `frontend/js/config.local.js` for local testing.
4. Serve the app locally and open `http://localhost:5500/frontend/index.html`.
5. Add `localhost` to Firebase Auth > Settings > Authorized domains.

Notes:

* Use `localhost`, not `127.0.0.1`, for local Firebase sign-in tests.
* `.env` is ignored by git, so your secrets stay local.
* `frontend/js/config.js` stays a committed placeholder.
* `frontend/js/config.local.js` is generated from your local environment and is ignored by git.
* If `frontend/js/config.local.js` is empty, the expected env vars were not present when you ran the build.

If no key is provided, Google Books search still runs with the public endpoint and the app falls back to Open Library results when needed.

### Vercel Deployment

For Vercel deployments, set `GOOGLE_BOOKS_API_KEY` in Project Settings > Environment Variables with a restricted Google Books API key.

LibriQ's build step generates `frontend/js/config.js` from that environment variable during deployment.

After adding or updating the variable, redeploy the project so the generated config is refreshed.

Suggested Vercel settings:

* Build Command: `npm run build`
* Output Directory: `frontend`

### Firestore Rules for Backup and Sync

LibriQ's cloud backup and Realtime Sync Beta require Firestore rules that allow both the backup path and the new sync namespace for the signed-in user:

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

---

## Patch Notes

This section tracks notable LibriQ updates. New version logs can be added here as the project grows.

### v4.2.0 - Cloud-first Auth Flow

**Added**

* Email/password account creation and sign-in
* No-internet fallback modal with Retry and Continue offline
* Friendly auth errors that avoid exposing raw Firebase error strings

**Changed**

* Normal login now focuses on Google, email sign-in, and account creation
* Continue offline moved out of the normal login screen and into the connection fallback
* Existing Firestore sync paths, backup paths, tombstones, and book data models remain unchanged

### v4.3.0 - Signed-in Offline Sync

**Added**

* Signed-in offline editing that keeps working while internet is temporarily unavailable
* Persistent pending sync state for local writes and deletes
* UID-scoped pending tombstones and reconnect-safe retry behavior

**Changed**

* Offline edits now save locally, survive refresh, and auto-sync when the connection returns
* Settings shows a friendlier pending state such as "Saved locally. Will sync when online."
* Local-only offline mode stays separate from signed-in account mode

**Notes**

* Firestore sync paths still use `users/{uid}/sync/v1/books`
* Cloud backup paths still use `users/{uid}/backups/current`
* Account isolation, tombstone handling, and the book data model remain intact

### v4.0.1 - Automatic Account Sync

**Added**

* Automatic Account Sync for signed-in users in account mode
* Books-only realtime sync under `users/{uid}/sync/v1/books/{bookId}`
* Sync status, last synced, listener state, and turn-off controls in Settings
* Conservative conflict handling that keeps local data when timestamps are unclear

**Changed**

* Automatic cloud backup still writes to `users/{uid}/backups/current`
* Manual restore and merge remain separate from sync
* Continue offline pauses sync and leaves local data working

**Notes**

* Realtime Sync Beta is optional and does not add social features or analytics events
* Firestore rules must allow the `users/{uid}/sync/{document=**}` namespace

### v3.0.2 - Sign-in Environment Guard

**Added**

* Conservative detection for likely in-app browsers and webviews such as TikTok, Instagram, Facebook, Messenger, and LINE
* Helpful guidance when Google sign-in is likely to fail inside an app browser
* A simple `Open in browser` link so users can jump to Chrome or Safari when needed

**Changed**

* Google sign-in now shows friendlier popup, unauthorized-domain, and disallowed-useragent guidance
* Continue offline stays available as the primary fallback in every session flow
* The What's New modal now waits until the app has entered cleanly instead of interrupting the session picker

**Notes**

* LibriQ remains local-first and privacy-first
* No Firestore, cloud backup, cloud sync, or private library upload was added

### v2.20.0 - Final Local-First Polish

**Changed**

* Settings, Help, backups, and empty states now use calmer local-first wording
* Private notes and quotes are described as staying local unless included in an exported backup
* Optional account backup is mentioned subtly as a future possibility

**Notes**

* No backend, accounts, cloud sync, or new analytics behavior was added
* The local-first experience remains the same, just clearer and more polished

### v2.19.0 - Private Quotes

**Added**

* Private quote saving inside Book Details
* Optional page number and optional thought/context for each quote
* Quote data included naturally in local exports and imports

**Changed**

* Private notes and quotes stay local unless included in an exported backup
* No backend, accounts, cloud sync, or quote analytics were added

### v2.18.0 - Backup Confidence

**Added**

* Last exported timestamp in Settings > Data
* Safer import preview before replace or merge
* Export-first warning for Clear All Data

**Changed**

* Merge mode now checks id, ISBN, then normalized title and author
* Backups remain manual, private notes are included in exports, and no cloud sync or accounts were added

### v2.17.1 - Maintenance Polish

**Fixed**

* Theme switching now applies immediately, and the toggle label/icon update in sync
* Statistics keeps the selected Yearly Recap year and rerenders the recap correctly
* App versioning and the service worker cache now match at v2.17.1

**Notes**

* No backend, account, sync, or new analytics behavior was added
* The patch stays local-only and keeps the existing privacy model intact

### v2.17.0 - Yearly Reading Recap

**Added**

* Local Yearly Reading Recap in Statistics
* Year selector for reviewing a selected year of finished books
* Fun summary stats based on local library data

**Changed**

* The recap is generated from the user’s saved local library data
* Private notes are not used in recap calculations
* No sharing, backend, cloud sync, or analytics behavior was added or changed

**Notes**

* This update stays read-only and local-first
* Existing storage data and backup compatibility are unchanged

### v2.14.0 - Search & Privacy Transparency

**Added**

* Search source status in Settings for Open Library and Google Books
* Google Books key status in Settings showing only configured or not configured
* Privacy and local data notes in Settings

**Changed**

* Settings now makes it clear that normal users do not need to configure anything

**Notes**

* This update does not change search behavior, storage behavior, or local data handling
* The app still falls back to Open Library when Google Books is rate-limited or unavailable

### v2.13.0 - Metadata Cleanup Tools

**Added**

* Needs Metadata view for spotting books with incomplete metadata
* Lightweight metadata quality indicators on saved books
* Easier access to the existing Refresh Metadata action for cleanup

**Changed**

* Metadata gaps are now easier to review without changing saved reading data

**Notes**

* Refresh remains user-triggered and does not mass-update the library
* Manual books and API-added books both remain supported

### v2.12.0 - Project Showcase & Screenshots

**Added**

* README screenshot showcase for the project
* Labeled screenshots for Dashboard, Library, Book Details, Search, Help, and mobile viewing

**Changed**

* Documentation is easier to browse thanks to a concise visual section

**Notes**

* This update does not change user data or localStorage behavior
* Screenshot automation remains unchanged

### v2.11.0 - Reading Activity History

**Added**

* Local reading activity history stored in `libriq_activity`
* Activity page with date grouping and filters for books, progress, notes, backups, and metadata
* Recent Activity dashboard feed powered by the activity log
* Activity history included in local JSON backups

**Changed**

* Recent dashboard activity now prefers the saved activity log and falls back to derived book dates when the log is empty
* Backup import now restores activity history on replace and safely merges activity on merge imports

**Notes**

* Activity data stays local in the browser and is capped to the latest 500 events
* Older backups without activity still import normally

### v2.10.1 - Offline Search State Polish

**Added**

* Clearer offline search messaging when the app is offline
* Search UI state handling that avoids stale offline banners
* Clear labeling for cached offline web results

**Changed**

* Online web search is now blocked while `navigator.onLine` reports offline status
* Fresh online results now restore the normal `From the web` label
* Offline search no longer implies a fresh fetch when the browser is disconnected

**Notes**

* Saved library features remain fully usable offline
* Online Open Library and Google Books search still requires internet access

### v2.10.0 - PWA Offline Shell

**Added**

* PWA-friendly offline app shell support
* Finalized LibriQ favicon and app icon assets
* Manifest support for installable app behavior
* App shell caching for local access to the interface
* Offline access to the saved local library

**Changed**

* The app shell is designed to stay available even when network access is unavailable
* Live Open Library and Google Books search remains network-dependent

**Notes**

* The offline shell is intended for local app access, not offline web search
* Saved books, notes, ratings, progress, and local search continue to work without internet

### v2.9.0 - What's New Modal

**Added**

* Local-only What's New modal that appears after updating to a newer LibriQ version
* Dismissed-version tracking in `libriq_seen_version`
* Friendly release notes summary for the latest local-first improvements

**Changed**

* The app now shows a simple release notes popup only when the current version has not been dismissed yet
* The modal can be closed with the button or Escape without affecting saved library data

**Notes**

* This feature stays fully local and does not send any data anywhere
* Existing book data, import/export, search, Help, and recommendations are unchanged

### v2.8.0 - Local Recommendations

**Added**

* Recommendations page in the app navigation
* Local suggestion groups based on saved library signals like favorite genres, authors, ratings, favorites, currently reading mood, and Want to Read shelf
* Recommendation cards with cover, title, author, reason label, and saved status

**Changed**

* Recommendations are generated fully from the user's local library data
* Saved recommendation cards open the existing Book Details modal

**Notes**

* No backend, analytics, cloud sync, or generated book data were added
* Import/export, manual entry, search, Help, and existing library behavior remain unchanged

### v2.7.0 - Advanced Search Filters

**Added**

* Compact advanced filters inside the existing search modal
* Filter controls for author, published year, genre/subject, source, has description, and has cover
* Clear/reset filters action
* Small active-filter indicator in the search UI

**Changed**

* Online search results can now be refined before adding a book to the library
* Filters work on the merged search result data already returned by Open Library and Google Books

**Notes**

* Search filters only affect online search results and do not change saved library search or sorting
* Manual entry, book details, notes, backups, and Help remain unchanged

### v2.6.0 - Help & Guide Center

**Added**

* Beginner-friendly Help & Guide Center in the app navigation
* Card-based walkthrough sections for getting started, search, manual entry, library management, progress tracking, private notes, backups, and local-first storage
* FAQ / troubleshooting section for common local-first questions
* Quick action buttons to jump back into search or the library from the guide

**Changed**

* Help content is fully local and static, matching LibriQ's frontend-only model
* The new guide uses the same calm card-based visual language as the rest of the app

**Notes**

* This feature is for product guidance only and does not add accounts, sync, or backend services
* Existing library data, notes, import/export behavior, and sorting logic are unchanged

### v2.5.0 - Library Search & Sorting

**Added**

* Saved-library search for quickly finding books in the local collection
* Sorting controls for organizing saved books by common library fields
* Local-only search and sort behavior that works without internet access

**Changed**

* Library browsing is faster for larger collections because search and sorting happen on saved local data
* Saved books can be organized without affecting online search or manual entry flows

**Notes**

* This feature does not change online book search behavior
* Library search and sorting remain fully local and independent of the Open Library and Google Books APIs

### v2.4.0 - Import / Export Backup

**Added**

* Local JSON export for the full LibriQ library backup
* Local JSON import with validation before any data is applied
* Replace or merge import flow for restoring backups safely

**Changed**

* Exported backups now include books plus relevant local data such as profile, goals, and streak state
* Import handling preserves the local-first model and keeps API books, manual books, ratings, progress, favorites, notes, and metadata intact

**Notes**

* Backups stay on the user's device and are never uploaded anywhere
* Merge mode deduplicates by existing book ID and replace mode clearly warns before overwriting current local data

### v2.3.0 - Search Result Descriptions

**Added**

* Short description previews in book search results when synopsis data is available
* A safe fallback message for results without a description

**Changed**

* Search results now surface merged description data from Open Library and Google Books before adding a book
* Book additions continue to persist the full description into the saved local book object

**Notes**

* Descriptions are displayed as short previews only and remain part of the existing local-first data model

### v2.2.0 - Manual Book Entry

**Added**

* Manual book entry flow for books that cannot be found through Open Library or Google Books
* Manual Entry action in the search modal and no-results state
* Manual Book Entry form with required title and author fields
* Optional cover URL, page count, genre/category, description, published year, publisher, language, and reading status fields
* Reliable local-only IDs for manually created books
* `source: "manual"` metadata for manually entered books

**Changed**

* Manual books now use the same local storage model and support the same Book Details, rating, progress, favorite, remove, notes, and statistics features as API books
* Search modal now provides a more direct fallback when no API results are available

**Notes**

* Manual books remain local-first and are stored only in the browser using `localStorage`
* Existing Open Library and Google Books add flows are unchanged

### v2.1.0 - Private Notes

**Added**

* Private, local-only notes for each saved book
* Notes textarea inside the Book Details modal
* Save Note and Clear Note actions
* Last updated timestamp for saved notes
* `notes` and `notesUpdatedAt` fields in saved book data

**Changed**

* Book Details now supports personal reading thoughts without requiring a backend or account system
* Metadata refresh preserves private notes together with existing personal reading data

**Notes**

* Notes are stored through `localStorage` and remain private to the current browser/device
* This update moves LibriQ closer to a personal reading journal while keeping the app local-first

### v2.0.0 - Core Reading Tracker Update

**Added / Improved**

* Updated LibriQ branding
* Book search using Open Library and Google Books
* Merged and deduplicated search results
* Personal library with status filters
* Book Details modal with rating, progress, favorite, remove, and metadata refresh actions
* Statistics page with reading summaries
* Responsive desktop and mobile design
* Light and dark theme support
* Deployment cleanup for Vercel
* README rewritten as a project overview and guide

**Notes**

* This version established LibriQ as a stable local-first personal book tracker and the foundation for future product updates

---

## Possible Future Improvements

Future improvements may include:

* Better metadata matching
* Reading activity history
* Activity heatmap
* Better mobile navigation
* PWA and offline enhancements if full offline behavior still needs polish
* Optional backend and cloud sync
* User profiles and social reading features

Backend, accounts, cloud sync, and social features are intentionally treated as later-stage improvements because they require more careful planning around authentication, privacy, data storage, and user security.

---

## Notes

Some books may not show a full description because not all book data sources provide synopsis data for every result. When a description is unavailable, LibriQ displays a safe fallback instead of generating or inventing one.

Some external cover images may also fail to load if blocked by browser extensions or if the source does not provide a valid image.

Since LibriQ currently stores data locally, clearing browser data or using a different browser/device may remove or hide saved library data. Import/export is already implemented for local backups, and cloud sync remains a future possibility if you want cross-device access later.

