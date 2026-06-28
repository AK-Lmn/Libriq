# 📚 LibriQ

> Your personal digital bookshelf for tracking, organizing, and discovering books.

LibriQ is a modern web application built with **HTML, CSS, and Vanilla JavaScript** that helps readers manage their personal library, monitor reading progress, and discover books from multiple online sources.

Designed with a clean interface and modular architecture, LibriQ combines local library management with live book discovery using the **Open Library API** and **Google Books API**.

**🌐 Live Demo:** https://libriq.vercel.app

---

## ✨ Features

### 📖 Personal Library

* Add books to your collection
* Track reading progress
* Organize books by reading status:

  * Reading
  * Completed
  * On Hold
  * Dropped
* Favorite books
* Edit and delete entries

### 🔍 Smart Book Search

* Search your personal library instantly
* Search millions of books online
* Unified search powered by:

  * Open Library API
  * Google Books API
* Automatic merging and deduplication of results
* Rich metadata from multiple providers

### 📊 Reading Dashboard

* Total books overview
* Reading statistics
* Reading progress tracking
* Reading distribution
* Favorite books summary

### ⚡ Performance

* Modular API architecture
* Session-based search caching
* Debounced search input
* Optimized API requests
* Responsive user interface

---

# 🛠 Tech Stack

### Frontend

* HTML5
* CSS3
* Vanilla JavaScript (ES6)

### APIs

* Open Library API
* Google Books API

### Deployment

* Vercel

---

# 📂 Project Structure

```text
frontend/
│
├── css/
│
├── js/
│   ├── api/
│   │   ├── cache.js
│   │   ├── googleBooks.js
│   │   ├── index.js
│   │   ├── mergeBooks.js
│   │   ├── normalizeBook.js
│   │   └── openLibrary.js
│   │
│   ├── app.js
│   ├── dashboard.js
│   ├── data.js
│   ├── library.js
│   ├── navigation.js
│   ├── search.js
│   ├── storage.js
│   └── utils.js
│
├── index.html
└── README.md
```

---

# 🚀 Getting Started

Clone the repository:

```bash
git clone https://github.com/yourusername/libriq.git
```

Navigate to the project:

```bash
cd libriq
```

Run the project using your preferred local server, such as:

* VS Code Live Server
* Vite
* Any static HTTP server

---

# 🔍 Search Architecture

LibriQ uses a modular search pipeline that combines multiple book providers into a single search experience.

```text
User Search
      │
      ▼
 BookAPI.searchBooks()
      │
 ┌───────────────┐
 │               │
 ▼               ▼
Open Library   Google Books
 │               │
 └──────┬────────┘
        ▼
 Normalize Data
        ▼
 Merge Results
        ▼
 Session Cache
        ▼
 Display Results
```

This architecture makes it easy to integrate additional providers in the future without changing the application's search interface.

---

# 🎯 Future Improvements

* ISBN barcode scanning
* Personalized book recommendations
* Reading goals
* Reading streaks
* Export/Import library
* User authentication
* Cloud synchronization
* Dark mode
* Advanced reading analytics
* Wishlist
* Book notes and highlights

---

# 🤝 Contributing

Contributions, issues, and feature requests are welcome. Feel free to fork the repository and submit a pull request.

---

# 📄 License

This project is licensed under the MIT License.

⭐ If you found LibriQ useful or interesting, consider giving the repository a star!
