import { buildYearlyRecap, getRecapYears, rankRatedBooks } from './statisticsCalculations.js';

export function createStatisticsPage({ storage, utils, constants, actions, documentRoot }) {
  if (!storage || !utils || !constants || !actions) {
    throw new TypeError('createStatisticsPage requires storage, utils, constants, and actions.');
  }
  const pageDocument = documentRoot || globalThis.document;
  let boundMain = null;

  function renderStatsPage() {
      const main  = pageDocument.getElementById('mainContent');
      if (!main) {
        console.error('[LibriQ] Missing #mainContent while rendering statistics page.');
        return;
      }
      const stats = storage.getStats();
      const goals = storage.getGoals();
      const streak = storage.getStreak();
      const recapYears = _getRecapYears();
      const selectedYear = _getRecapYear(recapYears);
      const recap = _buildYearlyRecap(selectedYear);
    const ratedBooks = rankRatedBooks(storage.getBooks());

    main.innerHTML = `
      <div class="page stats-page" id="statsPage">
        <div class="page-header stats-header">
          <div class="stats-heading">
            <span class="library-eyebrow">Reading analytics</span>
            <h1 class="page-title">Statistics</h1>
            <p class="page-subtitle">Your reading at a glance</p>
          </div>
        </div>

        <div class="stats-row stagger stats-row--spaced">
          <div class="stat-card">
            <div class="stat-card-icon amber"><i class="ph ph-books"></i></div>
            <div class="stat-card-value">${stats.total}</div>
            <div class="stat-card-label">Total books</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-icon green"><i class="ph ph-check-circle"></i></div>
            <div class="stat-card-value">${stats.finished}</div>
            <div class="stat-card-label">Books finished</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-icon blue"><i class="ph ph-file-text"></i></div>
            <div class="stat-card-value">${utils.formatNumber(stats.totalPages)}</div>
            <div class="stat-card-label">Pages read</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-icon orange"><i class="ph ph-fire"></i></div>
            <div class="stat-card-value">${streak.longest}</div>
            <div class="stat-card-label">Longest streak</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-icon gold"><i class="ph ph-star"></i></div>
            <div class="stat-card-value">${stats.avgRating || '–'}</div>
            <div class="stat-card-label">Avg rating</div>
            <div class="stat-card-footnote">${stats.ratedCount ? `${stats.ratedCount} rated book${stats.ratedCount !== 1 ? 's' : ''}` : 'No rated books yet'}</div>
          </div>
        </div>

          <div class="goal-widget goal-widget--section">
          <div class="goal-header goal-header--responsive">
            <div>
              <div class="goal-title">Yearly Recap</div>
              <div class="stats-section-meta">Private summary from your local library</div>
            </div>
            <label class="library-sort-label library-sort-label--flush" for="recapYearSelect">Year</label>
            <select id="recapYearSelect" class="library-sort-select library-sort-select--year">
              ${recapYears.length ? recapYears.map(year => `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}</option>`).join('') : `<option value="${selectedYear}" selected>${selectedYear}</option>`}
            </select>
          </div>

          ${recap.missingFinishDates ? `
            <div class="stats-metadata-notice block-offset-md">
              <i class="ph ph-calendar-warning" aria-hidden="true"></i>
              <div>
                <div class="empty-state-title">${recap.missingFinishDates} finished book${recap.missingFinishDates !== 1 ? 's are' : ' is'} missing a finish date</div>
                <div class="empty-state-body">Statistics is using the best available local metadata so your finished books still appear here.</div>
              </div>
            </div>
          ` : ''}

          ${recap.finishedCount === 0 ? `
            <div class="empty-state stats-empty-state block-offset-md">
              <div class="empty-state-icon"><i class="ph ph-book-open"></i></div>
              <div class="empty-state-title">No finished books for this year yet.</div>
              <div class="empty-state-body">If your finished books are missing finish dates, Statistics will show a note above instead of counting them as empty.</div>
              <div class="inline-actions inline-actions--centered">
                <button class="btn btn-primary btn-sm" type="button" data-action="open-search">
                  <i class="ph ph-magnifying-glass"></i> Search Books
                </button>
                <button class="btn btn-secondary btn-sm" type="button" data-action="open-library">
                  <i class="ph ph-books"></i> Library
                </button>
              </div>
            </div>
          ` : `
            <div class="stats-row stagger block-offset-md">
              <div class="stat-card">
                <div class="stat-card-icon amber"><i class="ph ph-check-circle"></i></div>
                <div class="stat-card-value">${recap.finishedCount}</div>
                <div class="stat-card-label">Books finished</div>
              </div>
              <div class="stat-card">
                <div class="stat-card-icon blue"><i class="ph ph-file-text"></i></div>
                <div class="stat-card-value">${utils.formatNumber(recap.pagesRead)}</div>
                <div class="stat-card-label">Pages read</div>
              </div>
              <div class="stat-card">
                <div class="stat-card-icon gold"><i class="ph ph-star"></i></div>
                <div class="stat-card-value">${recap.avgRating || '–'}</div>
                <div class="stat-card-label">Average rating</div>
              </div>
              <div class="stat-card">
                <div class="stat-card-icon green"><i class="ph ph-calendar"></i></div>
                <div class="stat-card-value">${recap.activeMonthLabel}</div>
                <div class="stat-card-label">Most active month</div>
              </div>
            </div>

            <div class="stats-chart-grid block-offset-md">
              <div class="goal-widget stats-chart-card">
                <div class="goal-header">
                  <div class="goal-title">Most Read Genre / Shelf</div>
                  <div class="stats-section-meta">Based on finished books this year</div>
                </div>
                ${recap.topBucket ? `
                  <div class="activity-list block-offset-sm">
                    <div class="activity-item activity-item--noninteractive">
                      <div class="activity-text">
                        <div class="activity-subtitle">${utils.sanitize(recap.topBucket.type === 'shelf' ? 'Shelf' : 'Genre')}</div>
                        <div class="activity-title">${utils.sanitize(recap.topBucket.name)}</div>
                      </div>
                      <div class="activity-time">${recap.topBucket.count} book${recap.topBucket.count !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                ` : `
                  <div class="empty-state stats-empty-state block-offset-sm">
                    <div class="empty-state-icon"><i class="ph ph-tag"></i></div>
                    <div class="empty-state-title">No genres or shelves yet</div>
                    <div class="empty-state-body">Add a few shelf labels or books with genres to see this summary.</div>
                  </div>
                `}
              </div>

              <div class="goal-widget stats-chart-card">
                <div class="goal-header">
                  <div class="goal-title">Longest Book Finished</div>
                  <div class="stats-section-meta">By page count</div>
                </div>
                ${recap.longestBook ? `
                  <div class="activity-list block-offset-sm">
                    <div class="activity-item activity-item--noninteractive">
                      <div class="activity-text">
                        <div class="activity-title">${utils.sanitize(recap.longestBook.title)}</div>
                        <div class="activity-subtitle">${utils.sanitize(recap.longestBook.author)}</div>
                      </div>
                      <div class="activity-time">${utils.formatNumber(recap.longestBook.pageCount || 0)} pages</div>
                    </div>
                  </div>
                ` : `
                  <div class="empty-state stats-empty-state block-offset-sm">
                    <div class="empty-state-icon"><i class="ph ph-book"></i></div>
                    <div class="empty-state-title">No page counts yet</div>
                    <div class="empty-state-body">Books without page counts are skipped here.</div>
                  </div>
                `}
              </div>
            </div>

            <div class="goal-widget block-offset-md">
              <div class="goal-header">
                <div class="goal-title">Highest Rated</div>
                <div class="stats-section-meta">${recap.highestRatedBooks.length ? `${recap.highestRatedBooks.length} book${recap.highestRatedBooks.length !== 1 ? 's' : ''}` : 'No rated books this year'}</div>
              </div>
              ${recap.highestRatedBooks.length ? `
                <div class="rated-book-list">
                  ${recap.highestRatedBooks.map((book, index) => buildRatedBookRow(book, index + 1)).join('')}
                </div>
              ` : `
                <div class="empty-state stats-empty-state">
                  <div class="empty-state-icon stats-rating-empty-icon"><i class="ph ph-star"></i></div>
                  <div class="empty-state-title">No ratings yet</div>
                  <div class="empty-state-body">Rate books in Book Details to include them in the recap.</div>
                </div>
              `}
            </div>
          `}
        </div>

        <div class="dashboard-grid stats-layout">
          <div>
            <div class="stats-chart-grid">
              <div class="goal-widget stats-chart-card">
                <div class="goal-header">
                  <div class="goal-title">Books per Month</div>
                  <div class="stats-section-meta">Finished books by finish date</div>
                </div>
                ${actions.buildMonthlyChart(stats.monthlyData)}
              </div>

              <div class="goal-widget stats-chart-card">
                <div class="goal-header">
                  <div class="goal-title">Pages per Month</div>
                  <div class="stats-section-meta">Finished-book pages only</div>
                </div>
                ${buildPagesChart(stats.pagesByMonth)}
              </div>
            </div>

            ${stats.topGenres.length ? `
              <div class="goal-widget">
                <div class="goal-header"><div class="goal-title">Genres</div></div>
                <div class="genre-list">
                  ${stats.topGenres.map(([g, c]) => actions.buildGenreRow(g, c, stats.total)).join('')}
                </div>
              </div>` : ''}
          </div>

          <div class="stats-side-stack">
            <div class="goal-widget goal-widget--fit">
              <div class="goal-header"><div class="goal-title">All-Time Summary</div></div>
              <div class="activity-list">
                ${[
                  ['Total in library',   stats.total],
                  ['Currently reading',  stats.reading],
                  ['Finished',           stats.finished],
                  ['Want to read',       stats.wishlist],
                  ['Favorites',          stats.favorites],
                  ['Average rating',     stats.avgRating ? `${stats.avgRating} ★` : '–'],
                  ['Pages read',         stats.totalPages.toLocaleString()],
                  ['Current streak',     `${streak.current} days`],
                  ['Longest streak',     `${streak.longest} days`],
                  ['This year\'s goal',  `${stats.finishedThisYear} / ${goals.yearly}`],
                ].map(([label, val]) => `
                  <div class="activity-item activity-item--noninteractive">
                    <div class="activity-text">
                      <div class="activity-subtitle">${label}</div>
                    </div>
                    <div class="activity-time activity-time--metric">
                      ${val}
                    </div>
                  </div>`).join('')}
              </div>
            </div>

            <div class="goal-widget goal-widget--fit">
              <div class="goal-header">
                <div class="goal-title">Highest Rated</div>
                ${ratedBooks.length ? `<div class="stats-section-meta">${ratedBooks.length} rated book${ratedBooks.length !== 1 ? 's' : ''}</div>` : ''}
              </div>
              ${ratedBooks.length ? `
                <div class="rated-book-list">
                  ${ratedBooks.map((book, index) => buildRatedBookRow(book, index + 1)).join('')}
                </div>` : `
                <div class="empty-state stats-empty-state">
                  <div class="empty-state-icon stats-rating-empty-icon"><i class="ph ph-star"></i></div>
                  <div class="empty-state-title">No ratings yet</div>
                  <div class="empty-state-body">Rate a few books in Book Details and they will appear here.</div>
                </div>`}
            </div>
          </div>
        </div>
      </div>`;
    pageDocument.getElementById('recapYearSelect')?.addEventListener('change', event => {
      setRecapYear(event.target.value);
      renderStatsPage();
    });
    bindStatisticsActions(main);

  }

  function _getRecapYears() {
    return getRecapYears(storage.getBooks(), new Date().getFullYear(), constants.STATUS.FINISHED);
  }

  function _getRecapYear(years) {
    const storedYear = Number.parseInt(globalThis.sessionStorage?.getItem('libriq_stats_recap_year') || '', 10);
    if (Number.isInteger(storedYear) && Array.isArray(years) && years.includes(storedYear)) return storedYear;
    const currentYear = new Date().getFullYear();
    return (Array.isArray(years) && years.includes(currentYear)) ? currentYear : (years?.[0] || currentYear);
  }

  function setRecapYear(year) {
    const selectedYear = Number.parseInt(String(year || ''), 10);
    if (Number.isInteger(selectedYear)) globalThis.sessionStorage?.setItem('libriq_stats_recap_year', String(selectedYear));
  }

  function _buildYearlyRecap(year) {
    return buildYearlyRecap(storage.getBooks(), year, {
      finishedStatus: constants.STATUS.FINISHED,
      monthLabels: constants.MONTHS,
    });
  }

  function bindStatisticsActions(main) {
    if (boundMain === main) return;
    boundMain = main;
    main.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action]');
      if (trigger?.dataset.action === 'open-search') actions.openSearch?.();
      if (trigger?.dataset.action === 'open-library') actions.navigate?.('library');
    });
  }

  function buildRatedBookRow(book, rank) {
    return `
      <div class="rated-book-row">
        <div class="rated-book-rank">${rank}</div>
        ${utils.buildCover(book, 'cover-sm')}
        <div class="rated-book-info">
          <div class="rated-book-title">${utils.sanitize(book.title)}</div>
          <div class="rated-book-author">${utils.sanitize(book.author)}</div>
          <div class="rated-book-rating">
            ${utils.buildStars(book.rating, false)}
            <span>${book.rating}/5</span>
          </div>
        </div>
      </div>`;
  }

  function buildPagesChart(monthlyPages) {
    const data = Array.isArray(monthlyPages) ? monthlyPages : [];
    const max = Math.max(...data, 1);
    const currentMonth = new Date().getMonth();
    const hasData = data.some(val => val > 0);

    if (!hasData) {
      return `
        <div class="stats-empty-state">
          <div class="empty-state-icon"><i class="ph ph-chart-line-up"></i></div>
          <div class="empty-state-title">Not enough data yet</div>
          <div class="empty-state-body">Pages per month will appear after a few finished books with page counts.</div>
        </div>`;
    }

    return `
      <div class="monthly-chart monthly-chart-pages">
        ${constants.MONTHS.map((m, i) => {
          const val = data[i] || 0;
          const pct = Math.round((val / max) * 100);
          const isCurrent = i === currentMonth;
          return `
            <div class="chart-bar-wrap" data-tooltip="${utils.formatNumber(val)} pages in ${m}">
              <div class="chart-bar ${isCurrent ? 'current' : ''} chart-bar-pages"
                   style="height: ${Math.max(pct, 0)}%"></div>
              <div class="chart-bar-label">${m}</div>
            </div>`;
        }).join('')}
      </div>`;
  }

  return renderStatsPage;
}
