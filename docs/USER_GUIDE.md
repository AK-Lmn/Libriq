# LibriQ User Guide

LibriQ is designed as a focused digital reading space rather than a spreadsheet-style tracker. This guide preserves the detailed product walkthrough previously included in the README.

## What You Can Do

- Search for books online
- Add books to a personal library
- Enter books manually when a search match is unavailable
- Search and sort the saved library
- Organize books by reading status
- Track reading progress by page and mark books as finished
- Favorite and unfavorite books
- Rate books and write private notes for each saved book
- View detailed book information and refresh missing metadata
- View reading statistics, yearly summaries, goals, streaks, and activity
- Export and import local library backups
- Back up library data to Firestore when signed in and manually restore it later
- Open the Help & Guide Center for app walkthroughs
- Refine online searches with advanced filters
- Discover library-based recommendations and open recommendation cards to view details or add books
- Hydrate subject-backed discovery rails from Open Library
- Browse free classics from Gutendex / Project Gutenberg
- Open readable or archive links from Internet Archive when available
- Sync Activity history through a signed-in account
- Read update highlights in the What's New modal
- Use the PWA shell and app icons for offline-friendly access

## Book Search

LibriQ uses Google Books and Open Library for primary book search. Search includes:

- A search modal and `Ctrl / Cmd + K` shortcut
- Results from multiple book APIs
- Merged and deduplicated results
- Covers, authors, page counts, genres, descriptions, and other metadata when available
- Add-to-library actions from search results
- Fallback handling when one source has limited data

Discovery-only and link-only sources have narrower roles:

- Open Library subjects power additional Discover rails.
- Gutendex / Project Gutenberg power the Free Classics rail.
- Internet Archive supplies readable or archive links when metadata is available.
- Gutendex and Internet Archive do not replace Google Books or Open Library as the main search providers.

### Advanced Search Filters

Online results can be filtered by:

- Author
- Published year
- Genre or subject
- Source
- Whether a description is available
- Whether a cover is available

These filters affect online results only; they do not change saved-library searching or sorting.

### Manual Book Entry

Manual entry is available when a useful API match cannot be found. Title and author are required. Cover URL, page count, genre or category, description, published year, publisher, language, and reading status are optional. Manual books use reliable IDs, carry `source: "manual"`, and support the same details, rating, progress, favorite, removal, notes, statistics, backup, and sync behavior as API-added books.

## Personal Library

The Library uses a cover-forward layout. Books can be filtered by All, Reading, Want to Read, Finished, Favorites, Needs Metadata, and saved shelf tags.

The local library search and sorting tools support:

- Searching saved title, author, genre, status, description, and other metadata
- Sorting by recently added, title, author, rating, reading progress, and recent updates
- Fast local filtering that remains available offline

Each saved book can include:

- Cover image
- Title and author
- Genres or categories
- Reading status
- Current page and total page count
- Progress percentage
- Favorite state
- Rating
- Private notes and quotes
- Description or synopsis
- Publisher, published year, and language
- Source and identity metadata

## Book Details

Book Details provides:

- Cover, title, author, status, genre, and source information
- Rating controls
- Current-page tracking and a Mark Finished action
- Private Notes with save, clear, and last-updated information
- Private quotes with optional page number and thought or context
- Favorite and unfavorite actions
- Remove-book action
- An About this book section
- Refresh Metadata action

If no synopsis is available, LibriQ shows:

> No description available yet.

Metadata refresh can fill missing synopsis, publisher, page count, cover, language, and genres. It does not overwrite progress, status, rating, favorite state, private notes, or quotes.

## Private Notes and Quotes

Users can write, edit, save, and clear personal notes, see when a note was last updated, and save private quotes with an optional page and thought. These values stay local unless they are included in an export, cloud backup, or enabled account-sync workflow. They are not public or used for analytics.

## Dashboard

The Dashboard summarizes:

- Total books
- Currently reading and finished counts
- Reading streak
- Current reading progress
- Reading goal progress
- Recent activity
- Quick access to Book Details and progress updates

## Statistics and Yearly Recap

Statistics are derived from saved library data and include:

- Total and finished books
- Pages read
- Average rating
- Reading streak
- Books and pages per month
- Genre breakdown
- Highest-rated books
- All-time reading summary
- A selectable Yearly Reading Recap

Private notes are not used in recap calculations.

## Reading Goals

The Goals view shows the yearly target, completed and remaining books, completion percentage, and progress visualization. Goal presets provide quick target selection.

## Activity

Activity records book, progress, note, backup, metadata, and related reading events. It powers the Activity page and recent Dashboard feed. Activity is capped to the latest 500 events, is included in JSON backups, and can sync through the signed-in account. Older backups without activity remain compatible.

## Recommendations

Recommendations are derived from saved-library signals including favorites, genres, authors, ratings, reading status, current reading mood, Want to Read items, reading patterns, and book identity. Saved recommendation cards open Book Details; unsaved recommendations can continue into the existing add flow. Recommendation derivation does not invent book metadata.

## Backup and Restore

### Local JSON Backup

LibriQ can export the full local library and related profile, goal, streak, activity, notes, quotes, and metadata state. Import validates the backup before applying it and offers Replace or Merge.

- Replace warns before overwriting current data.
- Merge checks book ID, ISBN, then normalized title and author.
- Private notes and quotes are included naturally.
- Backup files remain on the user's device unless the user moves or uploads them.
- Settings records the last exported timestamp.
- Clear All Data includes an export-first warning.

### Cloud Backup

Signed-in users can create Firestore backups. The application supports automatic backup after local changes, manual restore with a preview, and manual cloud merge with a preview. Account Sync is separate from backup, restore, and merge. JSON import and export remain available as a manual safety path.

See [Firebase](FIREBASE.md) for the operational distinction between backup and sync.

## Help & Guide Center

The built-in static guide contains getting-started help, search and manual-entry guidance, library-management tips, progress and notes walkthroughs, backup and cloud-merge guidance, account-backed storage explanations, FAQ and troubleshooting content, and quick actions back to Search or Library.

## What's New Modal

The local What's New modal shows recent feature summaries, stores dismissed-version state in `libriq_seen_version`, and can be closed without affecting library data. Since v3.0.2 it waits until normal app entry, avoiding the session picker and auth-loading state. The v4.0 messaging distinguishes Account Sync from the separate backup safety net and retains local import/export.

## PWA and Offline Use

LibriQ includes favicon assets, app icons, Apple touch icons, maskable icons, installable-app shortcut sizes, a web app manifest, and a service-worker-backed offline shell. Saved library features, notes, ratings, progress, and local search remain usable offline. Live Google Books and Open Library search still requires internet access, and offline result labels do not imply a fresh fetch.

## Themes, Responsive Design, and Branding

LibriQ supports dark and light themes across desktop, tablet, and mobile layouts. The Studio direction uses cooler surface cards, blue-tinted neutrals, restrained accent use, serif headings, clean sans-serif interface text, cover-forward cards, soft borders, subtle shadows, clear progress visuals, accessible contrast, focus states, touch targets, cards, modals, and mobile-friendly spacing.

The bookmark-inspired “Q” icon was designed in Figma to connect the LibriQ name with reading and saving books. The icon system includes browser favicons, app icons, an Apple touch icon, PWA sizes, and maskable shortcut support. Its warm gold mark and deep brown/black background align with the calm reading-first interface.

## Data Stored Locally

For each book, LibriQ can store:

- Book ID
- Title and author
- Cover image
- Page count and current page
- Reading status
- Favorite state
- Rating
- Private notes and the notes-updated date
- Private quotes
- Description
- Genres
- Publisher
- Published year
- Language
- Date added, date started, and date finished
- Source and identity metadata

This preserves reading progress, ratings, notes, quotes, and personal book state between sessions. Local data is tied to the browser and account scope in use. Clearing site data or changing browsers can hide or remove local state unless it has been exported, backed up, or synced.

## Troubleshooting and Provider Limitations

Some books do not include a full description because providers do not supply one for every result. LibriQ displays a safe fallback instead of generating a synopsis. External covers can also fail when blocked by an extension or when the source has no valid image.

## Roadmap Notes

Earlier possible improvements included better metadata matching, reading activity history, an activity heatmap, better mobile navigation, further PWA and offline work, optional backend and cloud sync, and user profiles or social reading. Activity history, account support, backup, sync, and major PWA work have since shipped. Remaining backend, account, and social work requires careful authentication, privacy, storage, and security planning.
