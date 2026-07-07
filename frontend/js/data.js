/* ============================================
   LIBRIQ DATA LAYER
   Data models, constants, seed data
   ============================================ */

const LIBRIQ = {
  VERSION: '4.4.0',

  // Reading status constants
  STATUS: {
    READING:  'reading',
    FINISHED: 'finished',
    WISHLIST: 'wishlist',
    DNF:      'dnf',
  },

  // Genre list
  GENRES: [
    'Fiction', 'Non-Fiction', 'Fantasy', 'Science Fiction', 'Mystery',
    'Thriller', 'Romance', 'Historical Fiction', 'Biography', 'Self-Help',
    'Philosophy', 'Psychology', 'Horror', 'Poetry', 'Graphic Novel',
    'Young Adult', 'Classic', 'Literary Fiction', 'Adventure', 'Business',
  ],

  // Month abbreviations
  MONTHS: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
};

/**
 * Book model factory — every book in the library follows this shape.
 * Designing it with optional fields so it's easy to add later.
 */
function createBook(data) {
  const now = new Date().toISOString();
  return {
    id:           data.id           || crypto.randomUUID(),
    title:        data.title        || 'Unknown Title',
    author:       data.author       || 'Unknown Author',
    coverUrl:     data.coverUrl     || null,
    isbn:         data.isbn         || null,
    pageCount:    data.pageCount    || 0,
    publishYear:  data.publishYear  || null,
    publisher:    data.publisher    || null,
    description:  data.description  || null,
    genres:       data.genres       || [],
    language:     data.language     || 'English',

    // Library state
    status:       data.status       || LIBRIQ.STATUS.WISHLIST,
    dateAdded:    data.dateAdded    || now,
    dateStarted:  data.dateStarted  || null,
    dateFinished: data.dateFinished || null,
    createdAt:    data.createdAt    || data.dateAdded || now,
    updatedAt:    data.updatedAt    || data.dateFinished || data.dateStarted || data.dateAdded || now,
    deletedAt:    data.deletedAt    ?? null,

    // Progress
    currentPage:  data.currentPage  || 0,

    // Rating & review (1–5, null = unrated)
    rating:       data.rating       ?? null,
    review:       data.review       || null,

    // Extras
    isFavorite:   data.isFavorite   || false,
    tags:         data.tags         || [],
    notes:        data.notes        ?? '',
    notesUpdatedAt: data.notesUpdatedAt || null,
    quotes:       Array.isArray(data.quotes) ? data.quotes.map(q => ({
      id: q.id || crypto.randomUUID(),
      text: String(q.text || ''),
      page: q.page ?? null,
      note: q.note ?? '',
      createdAt: q.createdAt || now,
      updatedAt: q.updatedAt || q.createdAt || now,
    })) : [],

    // Source metadata (from API search)
    source: data.source || 'api',
    googleBooksId: data.googleBooksId || null,
    openLibraryId: data.openLibraryId || null,
    gutendexId: data.gutendexId || null,
    gutenbergId: data.gutenbergId || null,
    internetArchiveId: data.internetArchiveId || null,
    internetArchiveIds: Array.isArray(data.internetArchiveIds) ? data.internetArchiveIds : [],
    archiveUrl: data.archiveUrl || null,
    readableSourceLinks: Array.isArray(data.readableSourceLinks) ? data.readableSourceLinks : [],
  };
}

function createBookPatch(data = {}) {
  const now = new Date().toISOString();
  return {
    ...data,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
    deletedAt: data.deletedAt ?? null,
  };
}

/**
 * User profile model
 */
function createProfile(data = {}) {
  return {
    name:          data.name          || 'Reader',
    avatar:        data.avatar        || null,
    bio:           data.bio           || null,
    joinDate:      data.joinDate      || new Date().toISOString(),
    yearlyGoal:    data.yearlyGoal    || 12,
    preferredGenres: data.preferredGenres || [],
    theme:         data.theme         || 'dark',
    streakData:    data.streakData    || { current: 0, longest: 0, lastRead: null },
  };
}

/**
 * Seed data — kept for demos, screenshots, and opt-in testing
 */
const SEED_BOOKS = [
  {
    id: 'seed-1',
    title: 'The Name of the Wind',
    author: 'Patrick Rothfuss',
    coverUrl: 'https://covers.openlibrary.org/b/id/8352507-M.jpg',
    pageCount: 662,
    publishYear: 2007,
    genres: ['Fantasy', 'Adventure'],
    status: LIBRIQ.STATUS.FINISHED,
    currentPage: 662,
    rating: 5,
    review: 'An extraordinary piece of fantasy writing. Rothfuss paints a world so vivid it lingers long after the last page.',
    isFavorite: true,
    dateAdded: new Date(Date.now() - 90 * 86400000).toISOString(),
    dateStarted: new Date(Date.now() - 80 * 86400000).toISOString(),
    dateFinished: new Date(Date.now() - 60 * 86400000).toISOString(),
    tags: ['favorites', 'series'],
    googleBooksId: null,
    openLibraryId: 'OL8352507M',
  },
  {
    id: 'seed-2',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    coverUrl: 'https://covers.openlibrary.org/b/id/8303994-M.jpg',
    pageCount: 499,
    publishYear: 2011,
    genres: ['Psychology', 'Non-Fiction'],
    status: LIBRIQ.STATUS.READING,
    currentPage: 234,
    rating: null,
    isFavorite: false,
    dateAdded: new Date(Date.now() - 30 * 86400000).toISOString(),
    dateStarted: new Date(Date.now() - 20 * 86400000).toISOString(),
    tags: ['non-fiction', 'psychology'],
    openLibraryId: 'OL8303994M',
  },
  {
    id: 'seed-3',
    title: 'Dune',
    author: 'Frank Herbert',
    coverUrl: 'https://covers.openlibrary.org/b/id/8231432-M.jpg',
    pageCount: 688,
    publishYear: 1965,
    genres: ['Science Fiction'],
    status: LIBRIQ.STATUS.WISHLIST,
    currentPage: 0,
    rating: null,
    isFavorite: false,
    dateAdded: new Date(Date.now() - 10 * 86400000).toISOString(),
    tags: ['sci-fi', 'classics'],
    openLibraryId: 'OL8231432M',
  },
  {
    id: 'seed-4',
    title: 'Sapiens',
    author: 'Yuval Noah Harari',
    coverUrl: 'https://covers.openlibrary.org/b/id/8219670-M.jpg',
    pageCount: 443,
    publishYear: 2011,
    genres: ['Non-Fiction', 'History'],
    status: LIBRIQ.STATUS.FINISHED,
    currentPage: 443,
    rating: 4,
    isFavorite: true,
    dateAdded: new Date(Date.now() - 120 * 86400000).toISOString(),
    dateStarted: new Date(Date.now() - 110 * 86400000).toISOString(),
    dateFinished: new Date(Date.now() - 100 * 86400000).toISOString(),
    tags: ['non-fiction', 'history'],
    openLibraryId: 'OL8219670M',
  },
  {
    id: 'seed-5',
    title: 'The Midnight Library',
    author: 'Matt Haig',
    coverUrl: 'https://covers.openlibrary.org/b/id/10308656-M.jpg',
    pageCount: 304,
    publishYear: 2020,
    genres: ['Fiction', 'Literary Fiction'],
    status: LIBRIQ.STATUS.READING,
    currentPage: 88,
    rating: null,
    isFavorite: false,
    dateAdded: new Date(Date.now() - 7 * 86400000).toISOString(),
    dateStarted: new Date(Date.now() - 5 * 86400000).toISOString(),
    tags: [],
    openLibraryId: 'OL10308656M',
  },
  {
    id: 'seed-6',
    title: 'Project Hail Mary',
    author: 'Andy Weir',
    coverUrl: 'https://covers.openlibrary.org/b/id/10519460-M.jpg',
    pageCount: 476,
    publishYear: 2021,
    genres: ['Science Fiction'],
    status: LIBRIQ.STATUS.WISHLIST,
    currentPage: 0,
    rating: null,
    isFavorite: false,
    dateAdded: new Date(Date.now() - 3 * 86400000).toISOString(),
    tags: ['sci-fi'],
    openLibraryId: 'OL10519460M',
  },
];
