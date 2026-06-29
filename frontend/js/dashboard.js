/* ============================================
   LIBRIQ DASHBOARD
   Home page renderer
   ============================================ */

const Dashboard = {

  render() {
    const main    = document.getElementById('mainContent');
    const stats   = Storage.getStats();
    const streak  = Storage.getStreak();
    const goals   = Storage.getGoals();
    const profile = Storage.getProfile();
    const reading = Storage.getBooksByStatus(LIBRIQ.STATUS.READING);
    const books   = Storage.getBooks();

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    const goalPct = Math.min(100, Math.round((stats.finishedThisYear / goals.yearly) * 100));
    const ringOffset = Math.round(283 - (283 * goalPct / 100));
    const booksLeft  = Math.max(0, goals.yearly - stats.finishedThisYear);
    const weeksLeft  = Math.ceil((new Date(new Date().getFullYear(), 11, 31) - new Date()) / 604800000);

    const recentActivity = buildRecentActivity(books);
    const topGenres      = stats.topGenres;

    main.innerHTML = `
      <div class="page" id="dashboardPage">

        <!-- Header -->
        <div class="dashboard-header">
          <div class="dashboard-greeting">
            <span class="greeting-label">${greeting} ✦</span>
            <h1 class="greeting-title">
              Welcome back, <span>${Utils.sanitize(profile.name)}</span>
            </h1>
          </div>
          <div class="dashboard-actions">
            <button class="btn btn-primary" onclick="Search.open()">
              <i class="ph ph-plus"></i>
              Add Book
            </button>
          </div>
        </div>

        <!-- Stats Row -->
        <div class="stats-row stagger">
          <div class="stat-card">
            <div class="stat-card-icon amber">
              <i class="ph ph-books"></i>
            </div>
            <div class="stat-card-value">${stats.total}</div>
            <div class="stat-card-label">Books in library</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-icon blue">
              <i class="ph ph-book-open"></i>
            </div>
            <div class="stat-card-value">${stats.reading}</div>
            <div class="stat-card-label">Currently reading</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-icon green">
              <i class="ph ph-check-circle"></i>
            </div>
            <div class="stat-card-value">${stats.finishedThisYear}</div>
            <div class="stat-card-label">Finished this year</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-icon orange">
              <i class="ph ph-fire"></i>
            </div>
            <div class="stat-card-value">${streak.current}</div>
            <div class="stat-card-label">Day streak</div>
          </div>
        </div>

        <!-- Main Grid -->
        <div class="dashboard-grid">

          <!-- Left Column -->
          <div class="dashboard-main">

            <!-- Currently Reading -->
            <section>
              <div class="section-header">
                <h2 class="section-title">Currently Reading</h2>
                <button class="section-action" onclick="Navigation.goTo('reading')">
                  View all
                </button>
              </div>
              <div class="currently-reading-list">
                ${reading.length === 0
                  ? buildReadingEmptyState()
                  : reading.slice(0, 3).map(b => buildReadingCard(b)).join('')
                }
              </div>
            </section>

            <!-- Monthly Chart -->
            <section>
              <div class="section-header">
                <h2 class="section-title">Books Read — ${new Date().getFullYear()}</h2>
                <button class="section-action" onclick="Navigation.goTo('stats')">
                  Full stats
                </button>
              </div>
              ${buildMonthlyChart(stats.monthlyData)}
            </section>

            <!-- Want to Read shelf -->
            <section>
              <div class="section-header">
                <h2 class="section-title">Up Next</h2>
                <button class="section-action" onclick="Navigation.goTo('wishlist')">
                  View all
                </button>
              </div>
              ${buildWishlistShelf()}
            </section>
          </div>

          <!-- Right Column -->
          <div class="dashboard-aside">

            <!-- Reading Goal -->
            <div class="goal-widget">
              <div class="goal-header">
                <div>
                  <div class="goal-title">Reading Goal</div>
                  <div class="goal-year text-xs text-tertiary">${new Date().getFullYear()}</div>
                </div>
                <button class="btn btn-ghost btn-sm" onclick="Navigation.goTo('goals')">
                  Edit
                </button>
              </div>
              <div class="goal-progress-ring">
                <div class="goal-ring-wrap">
                  <svg class="goal-ring-svg" viewBox="0 0 100 100">
                    <circle class="goal-ring-bg" cx="50" cy="50" r="45"/>
                    <circle class="goal-ring-fill ${goalPct >= 100 ? 'complete' : ''}"
                      cx="50" cy="50" r="45"
                      style="stroke-dashoffset: ${ringOffset}"
                      id="goalRingFill"/>
                  </svg>
                  <div class="goal-ring-text">
                    <span class="goal-ring-value">${stats.finishedThisYear}</span>
                    <span class="goal-ring-total">of ${goals.yearly}</span>
                  </div>
                </div>
                <div class="goal-stats">
                  <div class="goal-stat">
                    <div class="goal-stat-value">${goalPct}%</div>
                    <div class="goal-stat-label">Complete</div>
                  </div>
                  <div class="goal-stat">
                    <div class="goal-stat-value">${booksLeft}</div>
                    <div class="goal-stat-label">Books left</div>
                  </div>
                  <div class="goal-stat">
                    <div class="goal-stat-value">${weeksLeft}</div>
                    <div class="goal-stat-label">Weeks left</div>
                  </div>
                  <div class="goal-stat">
                    <div class="goal-stat-value">${stats.avgRating || '–'}</div>
                    <div class="goal-stat-label">Avg rating</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="goal-widget">
              <div class="goal-header">
                <div class="goal-title">Recent Activity</div>
              </div>
              <div class="activity-list">
                ${recentActivity.length
                  ? recentActivity.slice(0, 5).map(a => buildActivityItem(a)).join('')
                  : `<p class="text-sm text-tertiary" style="padding: var(--space-4) 0;">
                      No activity yet. Start reading!
                    </p>`
                }
              </div>
            </div>

            <!-- Top Genres -->
            ${topGenres.length > 0 ? `
              <div class="goal-widget">
                <div class="goal-header">
                  <div class="goal-title">Top Genres</div>
                </div>
                <div class="genre-list">
                  ${topGenres.map(([genre, count]) => buildGenreRow(genre, count, stats.total)).join('')}
                </div>
              </div>` : ''
            }

          </div>
        </div>
      </div>`;

    // Animate goal ring in after render
    requestAnimationFrame(() => {
      // Ring animation happens via CSS transition on the inline style
    });
  },
};

// ── Dashboard helpers ─────────────────────────

function buildReadingCard(book) {
  const pct = Utils.readingProgress(book.currentPage, book.pageCount);
  return `
    <div class="reading-card" onclick="Library.showProgressModal('${book.id}')">
      ${Utils.buildCover(book, 'cover-sm')}
      <div class="reading-card-info">
        <div class="reading-card-title">${Utils.sanitize(book.title)}</div>
        <div class="reading-card-author">${Utils.sanitize(book.author)}</div>
        <div class="reading-progress">
          <div class="progress-label">
            <span class="progress-text">
              Page ${book.currentPage}${book.pageCount ? ` of ${book.pageCount}` : ''}
            </span>
            <span class="progress-pct">${pct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
        <div class="reading-card-actions" onclick="event.stopPropagation()">
          <button class="btn btn-primary btn-sm"
            onclick="Library.showProgressModal('${book.id}')">
            <i class="ph ph-pencil"></i> Update
          </button>
          <button class="btn btn-ghost btn-sm"
            onclick="Library.toggleFavorite('${book.id}'); Navigation.updateBadges(); Navigation.renderCurrentPage();">
            <i class="${book.isFavorite ? 'ph-fill ph-heart' : 'ph ph-heart'}"
               style="color: ${book.isFavorite ? 'var(--color-danger)' : ''}"></i>
          </button>
        </div>
      </div>
    </div>`;
}

function buildReadingEmptyState() {
  return `
    <div class="empty-state" style="padding: var(--space-8);">
      <div class="empty-state-icon"><i class="ph ph-book-open"></i></div>
      <div class="empty-state-title">No books in progress</div>
      <div class="empty-state-body">Search for a book and start reading.</div>
      <button class="btn btn-primary" onclick="Search.open()">
        <i class="ph ph-magnifying-glass"></i> Find a book
      </button>
    </div>`;
}

function buildWishlistShelf() {
  const books = Storage.getBooksByStatus(LIBRIQ.STATUS.WISHLIST).slice(0, 8);
  if (books.length === 0) {
    return `<p class="text-sm text-secondary" style="padding: var(--space-2) 0;">
      Your reading queue is empty. <button class="section-action" onclick="Search.open()">Add some books →</button>
    </p>`;
  }
  return `
    <div class="books-shelf">
      ${books.map(b => `
        <div class="shelf-item" onclick="Library.showAddModal(${JSON.stringify(b).replace(/"/g, '&quot;')})">
          ${Utils.buildCover(b, 'cover-lg')}
          <div class="shelf-item-title">${Utils.sanitize(b.title)}</div>
        </div>`).join('')}
    </div>`;
}

function buildMonthlyChart(monthlyData) {
  const max = Math.max(...monthlyData, 1);
  const currentMonth = new Date().getMonth();

  return `
    <div class="monthly-chart">
      ${LIBRIQ.MONTHS.map((m, i) => {
        const val = monthlyData[i];
        const pct = Math.round((val / max) * 100);
        const isCurrent = i === currentMonth;
        return `
          <div class="chart-bar-wrap" data-tooltip="${val} book${val !== 1 ? 's' : ''} in ${m}">
            <div class="chart-bar ${isCurrent ? 'current' : ''}"
                 style="height: ${Math.max(pct, 0)}%"></div>
            <div class="chart-bar-label">${m}</div>
          </div>`;
      }).join('')}
    </div>`;
}

function buildRecentActivity(books) {
  const activities = [];

  books.forEach(b => {
    if (b.dateFinished) {
      activities.push({
        type: 'finished',
        title: b.title,
        date: b.dateFinished,
        icon: 'ph-check-circle',
        iconBg: 'var(--color-success-dim)',
        iconColor: 'var(--color-success)',
      });
    }
    if (b.dateStarted && b.status === LIBRIQ.STATUS.READING) {
      activities.push({
        type: 'started',
        title: b.title,
        date: b.dateStarted,
        icon: 'ph-book-open',
        iconBg: 'var(--color-info-dim)',
        iconColor: 'var(--color-info)',
      });
    }
    if (b.dateAdded && !b.dateStarted) {
      activities.push({
        type: 'added',
        title: b.title,
        date: b.dateAdded,
        icon: 'ph-bookmark',
        iconBg: 'var(--accent-dim)',
        iconColor: 'var(--accent)',
      });
    }
  });

  return activities.sort((a, b) => new Date(b.date) - new Date(a.date));
}

function buildActivityItem(activity) {
  const labels = {
    finished: 'Finished',
    started:  'Started reading',
    added:    'Added to wishlist',
  };
  return `
    <div class="activity-item">
      <div class="activity-icon" style="background:${activity.iconBg}; color:${activity.iconColor}">
        <i class="ph ${activity.icon}"></i>
      </div>
      <div class="activity-text">
        <div class="activity-title">${Utils.sanitize(activity.title)}</div>
        <div class="activity-subtitle">${labels[activity.type] || ''}</div>
      </div>
      <div class="activity-time">${Utils.timeAgo(activity.date)}</div>
    </div>`;
}

function buildGenreRow(genre, count, total) {
  const pct = Math.round((count / total) * 100);
  const color = Utils.genreColor(genre);
  return `
    <div class="genre-row">
      <div class="genre-info">
        <span class="genre-name">${Utils.sanitize(genre)}</span>
        <span class="genre-count">${count}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${pct}%; background: ${color}"></div>
      </div>
    </div>`;
}