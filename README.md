# LibriQ

**LibriQ** is a personal book-tracking web app designed to help readers organize their library, track reading progress, rate books, save favorites, write private notes, refresh book metadata, and view reading statistics in one calm and focused workspace.

The app is built with **HTML, CSS, and Vanilla JavaScript**, with book data powered by **Open Library** and **Google Books**.

LibriQ is currently focused on being a polished local-first reading tracker. Saved library data, reading progress, ratings, favorites, and private notes are stored in the browser using `localStorage`.

---

## Overview

LibriQ helps users manage their personal reading life through a simple and organized interface.

With LibriQ, users can:

* Search for books online
* Add books to a personal library
* Organize books by reading status
* Track reading progress by page
* Mark books as finished
* Favorite and unfavorite books
* Rate books
* Write private notes for each saved book
* View detailed book information
* Refresh missing book metadata
* View reading statistics and progress summaries

The app is designed to feel like a focused digital reading space instead of a plain spreadsheet-style tracker.

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
* “About this book” section
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

The Dashboard gives a quick overview of the user’s current reading activity.

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

Statistics are generated from the books saved in the user’s local library.

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

## How LibriQ Works

LibriQ is a frontend-only web app.

It uses:

* **HTML** for structure
* **CSS** for layout, styling, themes, and responsive design
* **Vanilla JavaScript** for app logic and interactions
* **Open Library API** for book search data
* **Google Books API** for additional book metadata
* **localStorage** for saving the user’s personal library

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
├── backend/
├── frontend/
│   ├── assets/
│   ├── css/
│   ├── js/
│   └── index.html
├── README.md
├── LICENSE
└── TESTING.md
```

---

## Current Status

LibriQ is still in active development.

The current version focuses on improving the core local-first reading tracker experience, including library management, book search, reading progress, book details, ratings, private notes, metadata, statistics, and responsive design.

---

## Patch Notes

This section tracks notable LibriQ updates. New version logs can be added here as the project grows.

### v2.1.0 — Private Notes

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

### v2.0.0 — Core Reading Tracker Update

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

* Manual book entry for books not found in external APIs
* Short descriptions in search results
* Import and export library data
* Saved library search and sorting
* Advanced search and filtering
* Better metadata matching
* Reading activity history
* Activity heatmap
* Better mobile navigation
* Local recommendations based on saved library data
* PWA support
* Optional backend and cloud sync
* User profiles and social reading features

Backend, accounts, cloud sync, and social features are intentionally treated as later-stage improvements because they require more careful planning around authentication, privacy, data storage, and user security.

---

## Notes

Some books may not show a full description because not all book data sources provide synopsis data for every result. When a description is unavailable, LibriQ displays a safe fallback instead of generating or inventing one.

Some external cover images may also fail to load if blocked by browser extensions or if the source does not provide a valid image.

Since LibriQ currently stores data locally, clearing browser data or using a different browser/device may remove or hide saved library data. Future import/export or cloud sync features may help with backups later.
