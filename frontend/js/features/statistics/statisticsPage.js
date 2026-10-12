import { buildYearlyRecap, getRecapYears, rankRatedBooks } from './statisticsCalculations.js';

const icon = name => `<img class="insights-icon" src="assets/revamp/insights/stats-${name}.svg" alt="" />`;

export function createStatisticsPage({ storage, utils, constants, actions, documentRoot }) {
  if (!storage || !utils || !constants || !actions) {
    throw new TypeError('createStatisticsPage requires storage, utils, constants, and actions.');
  }
  const pageDocument = documentRoot || globalThis.document;
  let boundMain = null;

  function renderStatsPage() {
    const main = pageDocument.getElementById('mainContent');
    if (!main) {
      console.error('[LibriQ] Missing #mainContent while rendering statistics page.');
      return;
    }
    const stats = storage.getStats();
    const goals = storage.getGoals();
    const streak = storage.getStreak();
    const books = storage.getBooks();
    const currentYear = new Date().getFullYear();
    const years = getRecapYears(books, currentYear, constants.STATUS.FINISHED);
    const storedYear = Number.parseInt(globalThis.sessionStorage?.getItem('libriq_stats_recap_year') || '', 10);
    const selectedYear = years.includes(storedYear) ? storedYear : currentYear;
    const recap = buildYearlyRecap(books, selectedYear, { finishedStatus: constants.STATUS.FINISHED, monthLabels: constants.MONTHS });
    const ratedBooks = rankRatedBooks(books);
    const goal = Math.max(0, Number(goals.yearly) || 0);
    const goalPercent = goal ? Math.min(100, Math.round(stats.finishedThisYear / goal * 100)) : 0;

    main.innerHTML = `
      <div class="page stats-page" id="statsPage">
        <header class="page-header stats-header">
          <div class="stats-heading">
            <span class="library-eyebrow">Reading analytics</span>
            <h1 class="page-title">Statistics</h1>
            <p class="page-subtitle">Your reading at a glance</p>
          </div>
          <span class="stats-date">${icon('calendar-days')}${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
        </header>
        <div class="stats-row">
          ${[
            ['library1', 'Total books', stats.total, 'Your personal library'],
            ['book-check', 'Books finished', stats.finished, `${stats.finishedThisYear} finished this year`],
            ['files', 'Pages read', utils.formatNumber(stats.totalPages), 'Across finished books'],
            ['flame', 'Longest streak', `${streak.longest} <small>days</small>`, 'Consecutive reading days'],
            ['star', 'Avg rating', `${stats.avgRating || '–'} <small>/ 5</small>`, `${stats.ratedCount || 0} rated books`],
          ].map(([asset, label, value, footnote]) => `
            <div class="stat-card">
              <div class="stat-card-heading"><span class="stat-card-icon">${icon(asset)}</span><span class="stat-card-label">${label}</span></div>
              <div class="stat-card-value">${value}</div><div class="stat-card-footnote">${footnote}</div>
            </div>`).join('')}
        </div>
        <section class="goal-widget stats-recap">
          <div class="goal-header">
            <div><h2 class="goal-title">Yearly Recap</h2><p class="stats-section-meta">A year in pages, so far.</p></div>
            <select id="recapYearSelect" aria-label="Recap year">
              ${years.map(year => `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}</option>`).join('')}
            </select>
          </div>
          ${recap.missingFinishDates ? `
            <div class="stats-metadata-notice"><i class="ph ph-calendar-warning" aria-hidden="true"></i>
              <div><strong>${recap.missingFinishDates} finished book${recap.missingFinishDates !== 1 ? 's are' : ' is'} missing a finish date</strong>
              <p>Statistics uses the best available local metadata so your finished books still appear here.</p></div>
            </div>` : ''}
          ${recap.finishedCount === 0 ? `
            <div class="empty-state stats-empty-state">
              ${icon('book-check')}<h3 class="empty-state-title">No finished books for this year yet.</h3>
              <p class="empty-state-body">Finish a book to begin your yearly recap.</p>
              <div class="inline-actions"><button class="btn btn-primary" data-action="open-search">Search Books</button><button class="btn btn-secondary" data-action="open-library">Library</button></div>
            </div>` : `
            <div class="recap-metrics">
              ${[
                ['Books finished', recap.finishedCount, goal ? `of your ${goal}-book goal` : 'Set your reading goal'],
                ['Pages read', utils.formatNumber(recap.pagesRead), `${utils.formatNumber(Math.round(recap.pagesRead / recap.finishedCount))} pages per book`],
                ['Average rating', recap.avgRating || '–', `${recap.ratedCount} rated books`],
                ['Most active month', recap.activeMonthLabel, `${Math.max(...recap.monthCounts)} books`],
              ].map(([label, value, note]) => `<div class="recap-metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`).join('')}
            </div>
            <div class="stats-chart-grid recap-highlights">
              <div class="recap-highlight">
                <h3>Most Read Genre/Shelf</h3>
                ${recap.topBucket ? `<div class="recap-highlight-content">${icon('orbit')}<div><strong>${utils.sanitize(recap.topBucket.name)}</strong><p>${recap.topBucket.count} books · ${Math.round(recap.topBucket.count / recap.finishedCount * 100)}% of this year's reading</p></div></div>` : '<p>No genres or shelves yet</p>'}
              </div>
              <div class="recap-highlight">
                <h3>Longest Book Finished</h3>
                ${recap.longestBook ? `<div class="recap-highlight-content">${utils.buildCover(recap.longestBook, 'cover-sm')}<div><strong>${utils.sanitize(recap.longestBook.title)}</strong><p>${utils.sanitize(recap.longestBook.author)}</p><p>${utils.formatNumber(recap.longestBook.pageCount || 0)} pages</p></div></div>` : '<p>No page counts yet</p>'}
              </div>
            </div>
            <section class="recap-ratings">
              <div class="goal-header"><h3 class="goal-title">Highest Rated</h3><span class="stats-section-meta">In ${selectedYear}</span></div>
              ${recap.highestRatedBooks.length ? buildRatedBookList(recap.highestRatedBooks) : ratingEmpty()}
            </section>`}
        </section>
        <div class="stats-rhythm-heading"><h2>Your reading rhythm</h2><span>A little progress, page by page.</span></div>
        <div class="stats-layout">
          <div class="stats-reading-charts">
            <section class="goal-widget stats-chart-card">
              <div class="goal-header"><h2 class="goal-title">Books per Month</h2><span class="stats-section-meta">${currentYear}</span></div>
              <p class="stats-chart-total"><strong>${stats.finishedThisYear}</strong> books finished this year</p>
              <div class="stats-chart-plot"><div class="stats-chart-axis" aria-hidden="true"><span>${Math.max(...stats.monthlyData, 1)}</span><span>0</span></div>${actions.buildMonthlyChart(stats.monthlyData)}</div>
              <p class="stats-chart-legend">Finished books by finish date · ${constants.MONTHS[new Date().getMonth()]} in progress</p>
            </section>
            <section class="goal-widget stats-chart-card">
              <div class="goal-header"><h2 class="goal-title">Pages per Month</h2><span class="stats-section-meta">${currentYear}</span></div>
              <p class="stats-chart-total"><strong>${utils.formatNumber((stats.pagesByMonth || []).reduce((sum, val) => sum + val, 0))}</strong> pages read this year</p>
              <div class="stats-chart-plot"><div class="stats-chart-axis" aria-hidden="true"><span>${utils.formatNumber(Math.max(...(stats.pagesByMonth || []), 1))}</span><span>0</span></div>${buildPagesChart(stats.pagesByMonth)}</div>
              <p class="stats-chart-legend">Finished-book pages only · ${constants.MONTHS[new Date().getMonth()]} in progress</p>
            </section>
            <section class="goal-widget">
              <div class="goal-header"><h2 class="goal-title">Genres</h2><span class="stats-section-meta">${currentYear}</span></div>
              ${stats.topGenres.length ? `<div class="genre-list">${stats.topGenres.map(([g, c]) => actions.buildGenreRow(g, c, stats.total)).join('')}</div>` : '<p class="stats-section-meta">Add books with genres to see your reading mix.</p>'}
              <p class="stats-chart-legend">${stats.total} books · based on your library</p>
            </section>
          </div>
          <div class="stats-side-stack">
            <section class="goal-widget">
              <div class="goal-header"><h2 class="goal-title">All-Time Summary</h2></div>
              <div class="activity-list">
                ${[
                  ['Total books', stats.total], ['Reading', stats.reading], ['Finished', stats.finished],
                  ['Want to read', stats.wishlist], ['Did not finish', books.filter(book => book.status === constants.STATUS.DNF).length], ['Favorites', stats.favorites],
                  ['Avg rating', stats.avgRating ? `${stats.avgRating} / 5` : '–'],
                  ['Pages read', utils.formatNumber(stats.totalPages)], ['Current streak', `${streak.current} days`],
                  ['Longest streak', `${streak.longest} days`],
                ].map(([label, val]) => `<div class="activity-item"><span class="activity-subtitle">${label}</span><span class="activity-time">${val}</span></div>`).join('')}
              </div>
              <div class="stats-year-goal">
                <div class="activity-item"><span class="activity-subtitle">This year's goal</span><span class="activity-time">${stats.finishedThisYear} / ${goal}</span></div>
                <div class="stats-goal-track" role="progressbar" aria-label="This year's reading goal" aria-valuenow="${goalPercent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${goalPercent}%"></span></div>
                <p class="stats-section-meta">${goal ? `${goalPercent}% complete · ${Math.max(0, goal - stats.finishedThisYear)} books to go` : 'Set a goal to track your progress'}</p>
              </div>
            </section>
            <section class="goal-widget">
              <div class="goal-header"><h2 class="goal-title">Highest Rated</h2>${icon('star')}</div>
              <p class="stats-section-meta">All time · ${stats.ratedCount || 0} rated books</p>
              ${ratedBooks.length ? buildRatedBookList(ratedBooks) : ratingEmpty()}
            </section>
          </div>
        </div>
      </div>`;
    pageDocument.getElementById('recapYearSelect')?.addEventListener('change', event => {
      const year = Number.parseInt(event.target.value, 10);
      if (years.includes(year)) globalThis.sessionStorage?.setItem('libriq_stats_recap_year', String(year));
      renderStatsPage();
    });
    if (boundMain !== main) {
      boundMain = main;
      main.addEventListener('click', event => {
        const trigger = event.target.closest?.('[data-action]');
        if (trigger?.dataset.action === 'open-search') actions.openSearch?.();
        if (trigger?.dataset.action === 'open-library') actions.navigate?.('library');
      });
    }
  }

  function ratingEmpty() {
    return `<div class="stats-empty-state"><span class="stats-rating-empty-icon">${icon('star')}</span><h3 class="empty-state-title">No ratings yet</h3><p class="empty-state-body">Rate books in Book Details to include them here.</p></div>`;
  }

  function buildRatedBookRow(book, rank) {
    return `<div class="rated-book-row"><span class="rated-book-rank">${String(rank).padStart(2, '0')}</span>
      ${utils.buildCover(book, 'cover-sm')}<div class="rated-book-info"><div class="rated-book-title">${utils.sanitize(book.title)}</div><div class="rated-book-author">${utils.sanitize(book.author)}</div></div>
      <span class="rated-book-rating">${icon('star1')}${book.rating} <span class="sr-only">out of 5 stars</span></span></div>`;
  }

  function buildRatedBookList(books) {
    const rows = books.map((book, index) => buildRatedBookRow(book, index + 1));
    return `<div class="rated-book-list">${rows.slice(0, 3).join('')}</div>${rows.length > 3 ? `<details class="stats-more-ratings"><summary>Show ${rows.length - 3} more rated books</summary><div class="rated-book-list">${rows.slice(3).join('')}</div></details>` : ''}`;
  }

  function buildPagesChart(monthlyPages) {
    const data = Array.isArray(monthlyPages) ? monthlyPages : [];
    const max = Math.max(...data, 1);
    if (!data.some(val => val > 0)) {
      return '<div class="stats-empty-state"><h3 class="empty-state-title">Not enough data yet</h3><p class="empty-state-body">Pages per month will appear after a few finished books with page counts.</p></div>';
    }
    return `<div class="monthly-chart monthly-chart-pages" role="img" aria-label="Pages read by month">
      ${constants.MONTHS.map((m, i) => {
        const val = data[i] || 0;
        const pct = Math.round((val / max) * 100);
        return `<div class="chart-bar-wrap" data-tooltip="${utils.formatNumber(val)} pages in ${m}">
          <div class="chart-bar ${i === new Date().getMonth() ? 'current' : ''} chart-bar-pages" style="height: ${Math.max(pct, 0)}%"></div><div class="chart-bar-label">${m}</div></div>`;
      }).join('')}</div>`;
  }

  return renderStatsPage;
}
