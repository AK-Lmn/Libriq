# Changelog

## v4.7.0

LibriQ 4.7 stabilizes the cloud-first experience with richer discovery, synced activity history, clickable recommendation cards, and smoother session restore.

### Highlights

* Smarter book discovery and richer metadata identity across ISBN, title, author, and source IDs
* Source badges and richer book metadata across Google Books, Open Library, Project Gutenberg, and Internet Archive
* Open Library subject-backed discovery rails and Gutendex / Project Gutenberg free classics discovery
* Internet Archive readable/archive links only
* Clickable recommendation cards that open saved details or add flows more naturally
* Firebase-backed activity history with Dashboard and Activity staying in sync after reloads and site-data clears
* Session restore now avoids a false sign-in screen during temporary auth rehydration
* Gemini AI recommendations remain parked/experimental while provider compatibility is tuned

### Notes

* Search still uses Google Books and Open Library as the main providers
* Gutendex remains discovery-only
* Internet Archive remains link enrichment only
* Older saved books continue to render normally without new source fields
* No destructive saved-library migration was introduced

## v4.6.0

LibriQ 4.6 focuses on smarter metadata, better discovery, and safer source identity handling while staying backward-compatible with older saved libraries.

### Highlights

* Smarter book identity and dedupe across ISBN, title, author, and source IDs
* Source badges for Google Books, Open Library, Project Gutenberg, and Internet Archive
* Open Library richer metadata scaffolding with works, editions, authors, subjects, and Book Details subject display
* Subject-backed Discover rails that hydrate after local recommendations
* Gutendex Free Classics discovery rail for public-domain books
* Internet Archive readable/archive link enrichment only, without turning IA into a search source
* Responsible API identity metadata prepared safely for future proxy use

### Notes

* Search still uses Google Books and Open Library as the main providers
* Gutendex remains discovery-only
* Internet Archive remains link enrichment only
* Older saved books continue to render normally without new source fields
* No destructive saved-library migration was introduced

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
