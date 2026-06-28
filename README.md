# 📚 LibriQ

**LibriQ** is a modern personal library and reading tracker built with **HTML, CSS, and Vanilla JavaScript**. It helps readers organize their books, track reading progress, discover new titles through online book APIs, and view reading statistics—all without requiring an account or backend.

> Read smarter. Track better. Discover more.

---

## ✨ Features

### 📖 Library Management

* Add books from online search or manually
* Edit book information
* Remove books from your library
* Mark books as:

  * 📚 To Read
  * 📖 Reading
  * ✅ Finished
* Favorite books
* Track reading progress
* Responsive book cards with detailed information

### 🔍 Smart Book Search

* Search millions of books using:

  * Open Library API
  * Google Books API
* Automatic result merging and deduplication
* Book descriptions and genre badges
* High-quality cover images
* Session caching for faster repeated searches

### 📊 Dashboard

* Reading statistics
* Total books
* Books currently reading
* Completed books
* Favorite books
* Reading progress overview

### 📄 Book Details

* Large book cover
* Synopsis / description
* Author
* Publisher
* Publication year
* Language
* Genre
* ISBN
* Reading progress
* Quick actions

### ⚡ User Experience

* Responsive design
* Keyboard shortcuts
* Toast notifications
* Smooth modal interactions
* Fast client-side performance
* Local storage persistence

---

## 🛠️ Built With

* HTML5
* CSS3
* Vanilla JavaScript (ES6+)
* Local Storage API
* Open Library API
* Google Books API

---

## 📂 Project Structure

```
LibriQ/
│
├── frontend/
│   ├── css/
│   ├── js/
│   │   ├── api/
│   │   │   ├── cache.js
│   │   │   ├── googleBooks.js
│   │   │   ├── index.js
│   │   │   ├── mergeBooks.js
│   │   │   ├── normalizeBook.js
│   │   │   └── openLibrary.js
│   │   ├── app.js
│   │   ├── dashboard.js
│   │   ├── library.js
│   │   ├── navigation.js
│   │   ├── search.js
│   │   ├── storage.js
│   │   ├── utils.js
│   │   └── data.js
│   └── index.html
└── README.md
```

---

## 🚀 Getting Started

### Clone the repository

```bash
git clone https://github.com/yourusername/libriq.git
```

### Open the project

Since LibriQ is built with Vanilla JavaScript, you can run it using any local development server.

For example, with VS Code:

* Install **Live Server**
* Right-click `index.html`
* Select **Open with Live Server**

---

## 🌐 APIs Used

### Open Library API

Used for:

* Book search
* Cover images
* Publication data
* Subjects / genres

### Google Books API

Used for:

* Rich book descriptions
* Publisher information
* Language
* Ratings
* Preview links
* Missing metadata enrichment

---

## 💾 Data Storage

LibriQ stores all user data locally using the browser's **Local Storage**.

This includes:

* Library
* Favorites
* Reading progress
* Reading status
* Dashboard statistics

No user data is sent to a server.

---

## 🎯 Current Features

* [x] Personal library
* [x] Reading tracker
* [x] Favorites
* [x] Progress tracking
* [x] Reading dashboard
* [x] Open Library integration
* [x] Google Books integration
* [x] Book details modal
* [x] Search caching
* [x] Responsive UI

---

## 🚧 Future Plans

* Reading goals
* Reading streaks
* Search filters
* Recently viewed books
* Book recommendations
* Notes and highlights
* CSV / JSON import & export
* Dark mode
* PWA support
* Cloud synchronization

---

## 📄 License

This project is licensed under the MIT License.

Feel free to use, learn from, and contribute to the project.
