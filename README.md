# LibriQ

**LibriQ** is a personal book-tracking web app designed to help readers organize their library, track reading progress, save favorites, rate books, and view reading insights in one calm and focused workspace.

The project is built with **HTML, CSS, and Vanilla JavaScript**, with book data powered by **Open Library** and **Google Books**.

LibriQ focuses on a clean reading experience: search for books, add them to your library, update your progress, revisit your favorites, and understand your reading habits through simple statistics.

---

## Overview

LibriQ is made for personal reading management.

It allows users to:

* Search for books online
* Save books to a personal library
* Organize books by reading status
* Track reading progress by page
* Mark books as finished
* Favorite books
* Rate books
* View book details and metadata
* Refresh missing book information
* See reading statistics and progress summaries

All saved library data is stored locally in the browser using `localStorage`.

---

## Core Features

### Book Search

LibriQ uses both **Open Library** and **Google Books** to search for books.

Search features include:

* Search modal
* `Ctrl / Cmd + K` shortcut
* Results from multiple book APIs
* Merged and deduplicated results
* Book covers, authors, page counts, genres, and descriptions when available
* Add-to-library action from search results

If one source does not provide complete information, LibriQ can still use available data from the other source when possible.

---

### Personal Library

The Library page displays saved books in a cover-forward layout.

Books can be organized by status:

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
* Description or synopsis when available

---

### Book Details

Each book has a detailed view for managing reading progress and metadata.

The Book Details view includes:

* Book cover
* Title and author
* Status and genre badges
* Rating control
* Reading progress section
* Current page tracking
* Mark finished action
* Favorite/unfavorite action
* Remove book action
* “About this book” section
* Refresh metadata action

If a book does not have a synopsis from the available APIs, LibriQ shows:

> No description available yet.

The metadata refresh action can attempt to fill missing details such as synopsis, publisher, page count, cover, language, and genres without overwriting personal reading data like progress, status, favorite state, or rating.

---

### Dashboard

The Dashboard gives a quick overview of the current reading state.

It includes:

* Total books
* Currently reading count
* Finished books
* Reading streak
* Currently reading list
* Reading goal progress
* Recent activity
* Quick access to updating progress and book details

---

### Statistics

The Statistics page summarizes reading activity and saved library data.

Current statistics include:

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

* Current goal
* Books completed
* Books remaining
* Completion percentage
* Goal progress visualization

---

## Design Direction

LibriQ v2 uses a calm, reading-first visual direction.

The design focuses on:

* Warm dark surfaces
* Gold accent colors
* Elegant serif headings
* Clean sans-serif interface text
* Cover-forward book cards
* Soft borders and subtle shadows
* Clear reading progress visuals
* Mobile-friendly spacing and touch targets
* Better contrast and accessibility states

The goal of the interface is to feel less like a spreadsheet and more like a focused digital reading space.

Full design system and implementation notes:

**[LibriQ v2 Design System](./LibriQ-v2-Design-System.md)**

---

## How LibriQ Works

LibriQ is a frontend-only web app.

It uses:

* **HTML** for structure
* **CSS** for layout, themes, and responsive design
* **Vanilla JavaScript** for app logic and interactions
* **Open Library API** for book search data
* **Google Books API** for additional book metadata
* **localStorage** for saving the user’s personal library

Because the app stores data locally, saved books and progress are tied to the browser being used.

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
* Description
* Genres
* Publisher
* Published year
* Language
* Date added
* Date started
* Date finished

This allows the app to preserve reading progress and personal book state between sessions.

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
├── LibriQ-v2-Design-System.md
├── LICENSE
└── TESTING.md
```

---

## Current Status

LibriQ v2 currently includes:

* Design system foundation
* Shared component polish
* Dashboard redesign
* Library redesign
* Search modal redesign
* Book Details redesign
* Statistics redesign
* Mobile responsive polish
* Rating system
* About this book section
* Rating-based statistics
* Metadata refresh action

The app is still being improved through focused feature and design passes.

---

## Possible Future Improvements

Future improvements may include:

* Favicon and app icon polish
* Better metadata matching for older saved books
* Import/export library data
* More advanced sorting and filtering
* Reading activity history
* Activity heatmap
* Personal notes or reviews
* Better mobile navigation patterns
* Optional cloud sync or account support

---

## Notes

Some books may not show a full description because not all book APIs provide synopsis data for every result. When a description is unavailable, LibriQ displays a safe fallback instead of generating or inventing one.

Some external cover images may also fail to load if blocked by browser extensions or if the source does not provide a valid image.
