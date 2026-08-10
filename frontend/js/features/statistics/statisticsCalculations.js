function getEffectiveFinishedDate(book, finishedStatus) {
  if (!book || book.status !== finishedStatus) return null;
  const candidates = [
    book.dateFinished,
    book.completedAt,
    book.finishedAt,
    book.updatedAt,
    book.createdAt,
    book.dateAdded,
  ];
  for (const value of candidates) {
    const time = new Date(value || 0).getTime();
    if (Number.isFinite(time) && time > 0) return new Date(time).toISOString();
  }
  return null;
}

export function getRecapYears(books, currentYear, finishedStatus) {
  const years = new Set([currentYear]);
  (books || []).forEach(book => {
    const year = Number.parseInt(String(getEffectiveFinishedDate(book, finishedStatus) || '').slice(0, 4), 10);
    if (!Number.isNaN(year)) years.add(year);
  });
  return Array.from(years).sort((a, b) => b - a);
}

export function rankRatedBooks(books) {
  return (books || [])
    .filter(book => typeof book.rating === 'number' && book.rating > 0)
    .map((book, index) => ({ book, index }))
    .sort((a, b) => b.book.rating - a.book.rating || a.index - b.index)
    .map(entry => entry.book);
}

export function buildYearlyRecap(books, year, { finishedStatus, monthLabels }) {
  const finishedEntries = (books || [])
    .map(book => ({ book, finishedDate: getEffectiveFinishedDate(book, finishedStatus) }))
    .filter(({ finishedDate }) => {
      const finishedYear = Number.parseInt(String(finishedDate || '').slice(0, 4), 10);
      return Number.isInteger(finishedYear) && finishedYear === year;
    });
  const finishedBooks = finishedEntries.map(entry => entry.book);
  const finishedCount = finishedBooks.length;
  const missingFinishDates = finishedBooks.filter(book => !book.dateFinished && !book.completedAt && !book.finishedAt).length;
  const pagesRead = finishedBooks.reduce((sum, book) => sum + (Number(book.pageCount) > 0 ? Number(book.pageCount) : 0), 0);
  const ratedBooks = finishedBooks.filter(book => typeof book.rating === 'number' && book.rating > 0);
  const avgRating = ratedBooks.length
    ? (ratedBooks.reduce((sum, book) => sum + book.rating, 0) / ratedBooks.length).toFixed(1)
    : null;

  const monthCounts = Array(12).fill(0);
  finishedEntries.forEach(({ finishedDate }) => {
    const month = new Date(finishedDate).getMonth();
    if (!Number.isNaN(month)) monthCounts[month]++;
  });
  const activeMonthIndex = monthCounts.indexOf(Math.max(...monthCounts));
  const activeMonthLabel = activeMonthIndex >= 0 ? monthLabels[activeMonthIndex] : '–';

  const longestBook = finishedBooks
    .filter(book => Number(book.pageCount) > 0)
    .slice()
    .sort((a, b) => (Number(b.pageCount) || 0) - (Number(a.pageCount) || 0))[0] || null;

  const highestRatedBooks = ratedBooks
    .slice()
    .sort((a, b) => (b.rating || 0) - (a.rating || 0)
      || new Date(getEffectiveFinishedDate(b, finishedStatus) || 0) - new Date(getEffectiveFinishedDate(a, finishedStatus) || 0))
    .filter(book => book.rating === (ratedBooks[0]?.rating || null))
    .slice(0, 5);

  const genreCounts = new Map();
  const shelfCounts = new Map();
  finishedBooks.forEach(book => {
    (Array.isArray(book.genres) ? book.genres : []).forEach(genre => incrementCount(genreCounts, genre));
    (Array.isArray(book.tags) ? book.tags : []).forEach(tag => incrementCount(shelfCounts, tag));
  });

  const topGenre = topCountEntry(genreCounts);
  const topShelf = topCountEntry(shelfCounts);
  let topBucket = null;
  if (topGenre && topShelf) {
    topBucket = topShelf.count >= topGenre.count
      ? { ...topShelf, type: 'shelf' }
      : { ...topGenre, type: 'genre' };
  } else if (topShelf) {
    topBucket = { ...topShelf, type: 'shelf' };
  } else if (topGenre) {
    topBucket = { ...topGenre, type: 'genre' };
  }

  return { finishedCount, pagesRead, avgRating, activeMonthLabel, longestBook, highestRatedBooks, topBucket, missingFinishDates };
}

function incrementCount(counts, value) {
  const clean = String(value || '').trim();
  if (clean) counts.set(clean, (counts.get(clean) || 0) + 1);
}

function topCountEntry(counts) {
  const entries = Array.from(counts.entries());
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const [name, count] = entries[0];
  return { name, count };
}
