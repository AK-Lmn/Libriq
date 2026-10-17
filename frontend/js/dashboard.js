import { LIBRIQ } from './data.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { LibriqFirebase } from './firebase-client.js';
import { resolveAccountDisplayName } from './accountDisplayName.js';
import { isPollDismissedOrVoted, detectUserOS } from './services/mobileAppPoll.js';

export const Dashboard = {

  render() {
    const main = document.getElementById('mainContent');
    if (!main) {
      console.error('[LibriQ] Missing #mainContent while rendering dashboard page.');
      return;
    }
    main.hidden = false;
    main.style.display = '';
    main.style.visibility = '';
    main.style.opacity = '';

    const stats = Storage.getStats();
    const streak = Storage.getStreak();
    const goals = Storage.getGoals();
    const profile = Storage.getProfile();
    const reading = Storage.getBooksByStatus(LIBRIQ.STATUS.READING);
    const books = Storage.getBooks();
    const featuredBook = pickFeaturedReadingBook(reading);
    const recentBooks = buildRecentBooks(books);
    const recentActivity = buildRecentActivity();
    const topGenres = stats.topGenres || [];
    const accountName = resolveAccountDisplayName(profile, LibriqFirebase.getState().user);
    const syncState = window.LibriqSyncBeta?.getState?.() || { status: 'off', message: 'Account sync off', pending: false };
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const syncLabel = offline
      ? 'Offline'
      : syncState.status === 'error'
        ? 'Sync issue'
        : syncState.pending
          ? 'Syncing'
          : syncState.status === 'paused'
            ? 'Paused'
            : syncState.status === 'synced'
              ? 'Ready'
              : syncState.enabled
                ? 'Sync on'
                : 'Ready';

    const now = new Date();
    const localDate = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const hour = now.getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const goalPct = goals.yearly > 0 ? Math.min(100, Math.round((stats.finishedThisYear / goals.yearly) * 100)) : 0;
    const ringOffset = Math.round(283 - (283 * goalPct / 100));
    const booksLeft = Math.max(0, goals.yearly - stats.finishedThisYear);
    const weeksLeft = Math.ceil((new Date(new Date().getFullYear(), 11, 31) - new Date()) / 604800000);

    main.innerHTML = `
      <div class="page dashboard-page" id="dashboardPage">
        <div class="dashboard-topbar">
          <div class="dashboard-page-context">
            <strong>Dashboard</strong>
            <time datetime="${localDate}">${now.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</time>
          </div>
          <div class="dashboard-actions">
          <div class="dashboard-sync">
            <span class="dashboard-sync-dot"></span>
            <span>${syncLabel}</span>
          </div>
            <button class="btn btn-primary dashboard-add-book" type="button" data-action="open-search">
              ${dashboardIcon('plus')}
              Add Book
            </button>
          </div>
        </div>

        <div class="dashboard-hero-shell">
          <div class="dashboard-greeting">
            <span class="greeting-label">${greeting}</span>
            <h1 class="greeting-title">Welcome back, <span>${Utils.sanitize(accountName)}</span>.</h1>
            <p class="greeting-subtitle">A quiet moment. A few more pages.</p>
          </div>
          <div class="dashboard-micro-stats">
            <div class="dashboard-mini-card">
              <span class="dashboard-mini-label">${dashboardIcon('flame')} Day streak</span>
              <div class="dashboard-mini-value">${streak.current} <small>${streak.current === 1 ? 'Day' : 'Days'}</small></div>
            </div>
            <div class="dashboard-mini-card">
              <span class="dashboard-mini-label">${dashboardIcon('target')} ${new Date().getFullYear()} goal</span>
              <div class="dashboard-mini-value">${goals.yearly > 0 ? `${stats.finishedThisYear}/${goals.yearly}` : `${stats.finishedThisYear}`} <small>books</small></div>
            </div>
          </div>
        </div>

        ${buildMobileAppPollCard()}
        ${buildOnboardingChecklist(books, goals)}

        <div class="dashboard-layout">
          <div class="dashboard-main">
            <section class="dashboard-panel dashboard-feature-panel">
              <div class="section-header dashboard-section-header">
                <h2 class="section-title">Reading Now</h2>
                <button class="section-action" type="button" data-action="navigate" data-route="reading">${reading.length} ${reading.length === 1 ? 'book' : 'books'} ${dashboardIcon('arrow-up-right')}</button>
              </div>
              ${featuredBook ? buildFeaturedReadingHero(featuredBook) : buildFeaturedEmptyHero()}
            </section>

            <section class="dashboard-panel dashboard-recent-panel">
              <div class="section-header dashboard-section-header">
                <h2 class="section-title">Recently Updated</h2>
                <button class="section-action" type="button" data-action="navigate" data-route="library">View all library</button>
              </div>
              ${recentBooks.length ? buildRecentBooksRow(recentBooks) : buildRecentEmptyState()}
            </section>

            <section class="dashboard-panel dashboard-compact-panel">
              <div class="section-header dashboard-section-header">
                <h2 class="section-title">Reading Momentum</h2>
                <button class="section-action" type="button" data-action="navigate" data-route="stats">Full stats</button>
              </div>
              <div class="dashboard-compact-grid">
                <div class="dashboard-compact-card">
                  ${dashboardIcon('library')}
                  <span class="dashboard-compact-label">Books in library</span>
                  <strong>${stats.total}</strong>
                  <span>All saved titles</span>
                </div>
                <div class="dashboard-compact-card">
                  ${dashboardIcon('book-open')}
                  <span class="dashboard-compact-label">Currently reading</span>
                  <strong>${stats.reading}</strong>
                  <span>Active progress updates</span>
                </div>
                <div class="dashboard-compact-card">
                  ${dashboardIcon('circle-check')}
                  <span class="dashboard-compact-label">Finished this year</span>
                  <strong>${stats.finishedThisYear}</strong>
                  <span>${booksLeft} left to goal</span>
                </div>
                <div class="dashboard-compact-card">
                  ${dashboardIcon('flame')}
                  <span class="dashboard-compact-label">Day streak</span>
                  <strong>${streak.current}</strong>
                  <span>Consecutive reading days</span>
                </div>
              </div>
            </section>
            <p class="dashboard-privacy dashboard-privacy-main">${dashboardIcon('lock-keyhole')} A private record of a reading life. Only you can see your library.</p>
          </div>

          <aside class="dashboard-aside">
            <section class="dashboard-panel dashboard-quick-panel">
              <div class="section-header dashboard-section-header">
                <h2 class="section-title">Quick Workspace</h2>
                <button class="section-action" type="button" data-action="navigate" data-route="activity">View Activity ${dashboardIcon('arrow-up-right')}</button>
              </div>
              <div class="dashboard-quick-note">
                <div class="dashboard-quote-label">${dashboardIcon('notebook-pen')} Latest capture</div>
                <p>${Utils.sanitize(getQuickNoteText(profile, recentActivity, featuredBook))}</p>
              </div>
              <div class="dashboard-quick-meta">
                <span>${dashboardIcon('timer')} ${recentActivity.length ? `Last update: ${Utils.timeAgo(recentActivity[0].date)}` : 'Your next session awaits'}</span>
                <span>${stats.avgRating ? `Average rating ${stats.avgRating}` : 'No ratings yet'}</span>
              </div>
            </section>

            <section class="dashboard-panel dashboard-activity-panel">
              <div class="section-header dashboard-section-header">
                <h2 class="section-title">Recent Activity</h2>
                <button class="section-action" type="button" data-action="navigate" data-route="activity">View all ${dashboardIcon('arrow-up-right')}</button>
              </div>
              <div class="activity-list dashboard-activity-list">
                ${recentActivity.length
                  ? recentActivity.slice(0, 5).map(a => buildActivityItem(a)).join('')
                  : buildActivityEmptyState()}
              </div>
            </section>

            <section class="dashboard-panel dashboard-goal-panel">
              <div class="goal-header dashboard-goal-header">
                <div>
                  <div class="goal-title">Reading Goal</div>
                  <div class="goal-year text-xs text-tertiary">${new Date().getFullYear()}</div>
                </div>
                <button class="btn btn-ghost btn-sm" type="button" data-action="navigate" data-route="goals">Edit</button>
              </div>
              <div class="goal-progress-ring dashboard-goal-ring">
                <div class="goal-ring-wrap">
                  <svg class="goal-ring-svg" viewBox="0 0 100 100" role="img" aria-label="${goalPct}% of yearly reading goal complete">
                    <circle class="goal-ring-bg" cx="50" cy="50" r="45"></circle>
                    <circle class="goal-ring-fill ${goalPct >= 100 ? 'complete' : ''}"
                      cx="50" cy="50" r="45"
                      style="stroke-dashoffset: ${ringOffset}"
                      id="goalRingFill"></circle>
                  </svg>
                  <div class="goal-ring-text">
                    <span class="goal-ring-value">${stats.finishedThisYear}/${goals.yearly}</span>
                    <span class="goal-ring-total">books finished</span>
                  </div>
                </div>
                <div class="dashboard-goal-copy">
                  <span class="dashboard-quote-label">${new Date().getFullYear()} challenge</span>
                  <h3>${booksLeft > 0 ? `${booksLeft} more ${booksLeft === 1 ? 'story' : 'stories'}.` : 'Every story counts.'}</h3>
                  <p>${goalPct >= 100 ? 'Your goal is complete. Keep exploring.' : 'Keep reading at your own pace.'}</p>
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
            </section>

            ${topGenres.length > 0 ? `
              <section class="dashboard-panel dashboard-genres-panel">
                <div class="section-header dashboard-section-header">
                  <h2 class="section-title">Top Genres</h2>
                </div>
                <div class="genre-list">
                  ${topGenres.map(([genre, count]) => buildGenreRow(genre, count, stats.total)).join('')}
                </div>
              </section>` : ''
            }
          </aside>
        </div>
        <p class="dashboard-privacy dashboard-privacy-mobile">${dashboardIcon('lock-keyhole')} A private record of a reading life. Only you can see your library.</p>
      </div>`;
  },
};

function dashboardIcon(name) {
  return `<span class="dashboard-icon" data-icon="${name}" aria-hidden="true"></span>`;
}

function pickFeaturedReadingBook(reading) {
  return (reading || [])
    .slice()
    .filter(Boolean)
    .sort((a, b) => {
      const aDate = new Date(a.dateUpdated || a.dateStarted || a.dateAdded || 0).getTime();
      const bDate = new Date(b.dateUpdated || b.dateStarted || b.dateAdded || 0).getTime();
      return bDate - aDate;
    })[0] || null;
}

function buildFeaturedReadingHero(book) {
  const pct = Utils.readingProgress(book.currentPage, book.pageCount);
  const timeLeft = book.pageCount && book.currentPage ? Math.max(0, book.pageCount - book.currentPage) : null;
  return `
    <div class="dashboard-hero-card">
      <div class="dashboard-hero-cover">
        ${Utils.buildCover(book, 'cover-xl')}
      </div>
      <div class="dashboard-hero-content">
        <span class="dashboard-pill">${Utils.sanitize(book.genre || book.subject || book.category || 'Reading now')}</span>
        <h3 class="dashboard-hero-title">${Utils.sanitize(book.title)}</h3>
        <p class="dashboard-hero-author">by ${Utils.sanitize(book.author || 'Unknown author')}${timeLeft !== null ? ` • ${timeLeft} pages left` : ''}</p>
        <div class="dashboard-progress-meta">
          <span>${timeLeft !== null ? `${timeLeft} pages left` : 'Progress'}</span>
          <strong>${pct}%</strong>
        </div>
        <div class="progress-bar dashboard-progress-bar">
          <div class="progress-fill ${pct >= 100 ? 'complete' : ''}" style="width:${pct}%"></div>
        </div>
        <p class="dashboard-page-count">Page ${book.currentPage || 0} / ${book.pageCount || '–'}</p>
        <p class="dashboard-hero-quote">${Utils.sanitize(buildFeaturedQuote(book))}</p>
        <div class="dashboard-hero-actions">
          <button class="btn btn-primary" type="button" data-action="update-progress" data-book-id="${Utils.sanitize(book.id)}">
            ${dashboardIcon('book-open')}
            Resume Reading
          </button>
          <button class="btn btn-secondary" type="button" data-action="show-book-details" data-book-id="${Utils.sanitize(book.id)}">
            View Details
          </button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="toggle-favorite" data-book-id="${Utils.sanitize(book.id)}" aria-pressed="${Boolean(book.isFavorite)}" aria-label="${book.isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
            ${dashboardIcon('heart')}
          </button>
        </div>
      </div>
    </div>`;
}

function buildFeaturedEmptyHero() {
  return `
    <div class="dashboard-hero-card dashboard-hero-card-empty">
      <div class="dashboard-hero-cover dashboard-empty-cover">${dashboardIcon('book-open')}</div>
      <div class="dashboard-hero-content">
        <span class="dashboard-pill">Reading now</span>
        <h3 class="dashboard-hero-title">Your next session starts here</h3>
        <p class="dashboard-hero-author">Add a book to surface a featured reading card with progress and quick actions.</p>
        <div class="dashboard-hero-actions">
          <button class="btn btn-primary" type="button" data-action="open-search">
            <i class="ph ph-plus"></i>
            Add Book
          </button>
          <button class="btn btn-secondary" type="button" data-action="open-manual-entry">
            <i class="ph ph-pencil"></i>
            Add Manually
          </button>
          <button class="btn btn-secondary" type="button" data-action="navigate" data-route="library">
            Browse Library
          </button>
        </div>
      </div>
    </div>`;
}

function buildFeaturedQuote(book) {
  const source = String(book.notes?.[0]?.text || book.quote || book.description || '').trim();
  if (source) return source.slice(0, 220);
  return 'Continue from where you left off and keep the reading momentum flowing.';
}

function buildRecentBooksRow(books) {
  return `
    <div class="dashboard-recent-row">
      ${books.slice(0, 4).map(book => `
        <button class="dashboard-recent-card" data-action="show-book-details" data-book-id="${Utils.sanitize(book.id)}" type="button">
          ${Utils.buildCover(book, 'cover-md')}
          <div class="dashboard-recent-copy">
            <strong>${Utils.sanitize(book.title)}</strong>
            <span>${Utils.formatDate(book.dateUpdated || book.dateStarted || book.dateAdded || new Date())}</span>
            <span class="dashboard-recent-author">${Utils.sanitize(book.author || 'Unknown author')}</span>
            <span class="dashboard-recent-status" data-status="${Utils.sanitize(book.status || '')}">${Utils.sanitize(book.status || 'Saved').replaceAll('_', ' ')}</span>
          </div>
        </button>
      `).join('')}
    </div>`;
}

function buildRecentEmptyState() {
  return `
    <div class="dashboard-empty-state">
      <div class="empty-state-icon"><i class="ph ph-books"></i></div>
      <div class="empty-state-title">No recent updates yet</div>
      <div class="empty-state-body">Add a few books or update reading progress and they will appear here.</div>
    </div>`;
}

function buildActivityEmptyState() {
  return `
    <div class="dashboard-empty-state dashboard-empty-state-compact">
      <div class="empty-state-icon"><i class="ph ph-clock-counter-clockwise"></i></div>
      <div class="empty-state-title">No activity yet</div>
      <div class="empty-state-body">Progress updates and book changes will show up here once you start reading.</div>
    </div>`;
}

function buildRecentBooks(books) {
  return (books || [])
    .slice()
    .filter(Boolean)
    .sort((a, b) => {
      const aDate = new Date(a.dateUpdated || a.dateStarted || a.dateAdded || 0).getTime();
      const bDate = new Date(b.dateUpdated || b.dateStarted || b.dateAdded || 0).getTime();
      return bDate - aDate;
    });
}

function getQuickNoteText(profile, recentActivity, featuredBook) {
  const name = String(profile?.name || '').trim();
  if (recentActivity?.length) {
    const item = recentActivity[0];
    return `Last update: ${item.label || item.type} for ${item.title}.`;
  }
  if (featuredBook) return `${featuredBook.title} is ready when you are, ${name || 'reader'}.`;
  return 'Add a book to start building your reading workspace.';
}

export function buildMonthlyChart(monthlyData) {
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
      ${LIBRIQ.MONTHS.map((m, i) => {
        const val = data[i] || 0;
        const pct = Math.round((val / max) * 100);
        const isCurrent = i === currentMonth;
        return `
          <div class="chart-bar-wrap" data-tooltip="${Utils.formatNumber(val)} pages in ${m}">
            <div class="chart-bar ${isCurrent ? 'current' : ''} chart-bar-pages"
                 style="height: ${Math.max(pct, 0)}%"></div>
            <div class="chart-bar-label">${m}</div>
          </div>`;
      }).join('')}
    </div>`;
}

function buildRecentActivity() {
  return (Storage.getActivityLog?.() || [])
    .slice()
    .sort((a, b) => new Date(b.timestamp || b.createdAt || 0) - new Date(a.timestamp || a.createdAt || 0))
    .slice(0, 5)
    .map(buildActivityFromEvent);
}

function buildActivityItem(activity) {
  const labels = {
    finished: 'Finished',
    started: 'Started reading',
    added: 'Added to wishlist',
  };
  const icon = {
    'ph-book-open': 'book-open', 'ph-check-circle': 'circle-check', 'ph-heart': 'heart',
    'ph-notebook': 'notebook-pen', 'ph-quote': 'notebook-pen', 'ph-bookmark': 'bookmark',
  }[activity.icon] || 'plus';
  return `
    <div class="activity-item">
      <div class="activity-icon" data-icon="${icon}">
        ${dashboardIcon(icon)}
      </div>
      <div class="activity-text">
        <div class="activity-title">${Utils.sanitize(activity.label || labels[activity.type] || activity.subtitle || '')}${activity.payloadText ? ` • ${Utils.sanitize(activity.payloadText)}` : ''}</div>
        <div class="activity-subtitle">${Utils.sanitize(activity.title)}</div>
        <div class="activity-time">${Utils.timeAgo(activity.date)}</div>
      </div>
    </div>`;
}

function buildActivityFromEvent(event) {
  const map = {
    book_added: ['Added book', 'ph-bookmark', 'var(--accent-dim)', 'var(--accent)'],
    manual_book_added: ['Added manually', 'ph-pencil', 'var(--accent-dim)', 'var(--accent)'],
    status_changed: ['Status changed', 'ph-arrows-left-right', 'var(--color-info-dim)', 'var(--color-info)'],
    progress_updated: ['Progress updated', 'ph-book-open', 'var(--color-info-dim)', 'var(--color-info)'],
    book_finished: ['Finished book', 'ph-check-circle', 'var(--color-success-dim)', 'var(--color-success)'],
    rating_updated: ['Rating updated', 'ph-star', 'var(--color-warning-dim)', 'var(--color-warning)'],
    favorite_added: ['Added to favorites', 'ph-heart', 'var(--color-danger-dim)', 'var(--color-danger)'],
    favorite_removed: ['Removed from favorites', 'ph-heart', 'var(--color-danger-dim)', 'var(--color-danger)'],
    note_saved: ['Note saved', 'ph-notebook', 'var(--color-info-dim)', 'var(--color-info)'],
    note_cleared: ['Note cleared', 'ph-eraser', 'var(--color-neutral-dim)', 'var(--text-tertiary)'],
    quote_saved: ['Quote saved', 'ph-quote', 'var(--color-info-dim)', 'var(--color-info)'],
    quote_updated: ['Quote updated', 'ph-quote', 'var(--color-warning-dim)', 'var(--color-warning)'],
    quote_deleted: ['Quote deleted', 'ph-quote', 'var(--color-neutral-dim)', 'var(--text-tertiary)'],
    metadata_refreshed: ['Metadata refreshed', 'ph-arrow-clockwise', 'var(--color-info-dim)', 'var(--color-info)'],
    backup_exported: ['Backup exported', 'ph-download-simple', 'var(--accent-dim)', 'var(--accent)'],
    backup_imported: ['Backup imported', 'ph-upload-simple', 'var(--accent-dim)', 'var(--accent)'],
  };
  const entry = map[event.type] || ['Activity', 'ph-bell', 'var(--color-neutral-dim)', 'var(--text-tertiary)'];
  const payloadBits = [];
  if (event.payload?.rating !== undefined && event.payload?.rating !== null) payloadBits.push(`${event.payload.rating}/5`);
  if (event.payload?.currentPage !== undefined) payloadBits.push(`p.${event.payload.currentPage}`);
  if (event.payload?.status) payloadBits.push(String(event.payload.status));

  return {
    type: event.type,
    title: event.bookTitle || 'Unknown title',
    subtitle: event.bookAuthor || '',
    date: event.timestamp,
    icon: entry[1],
    iconBg: entry[2],
    iconColor: entry[3],
    label: entry[0],
    source: event.source || '',
    payloadText: payloadBits.join(' • '),
  };
}

export function buildGenreRow(genre, count, total) {
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

function buildOnboardingChecklist(books, goals) {
  if (typeof localStorage === 'undefined') return '';
  if (localStorage.getItem('libriq_onboarding_dismissed') === '1') return '';
  if (books && books.length >= 3) return '';

  const hasBook = Array.isArray(books) && books.length > 0;
  const hasGoal = localStorage.getItem('libriq_goal_customized') === '1' || (goals && goals.yearly !== 12);
  const hasImport = localStorage.getItem('libriq_import_completed') === '1';

  return `
    <section class="onboarding-checklist" aria-label="Getting started with LibriQ">
      <div class="onboarding-header">
        <div class="onboarding-header-copy">
          <span class="onboarding-pill"><i class="ph ph-sparkle"></i> Quick Setup</span>
          <h2 class="onboarding-title">Getting started with your reading space</h2>
          <p class="onboarding-subtitle">Complete these 3 quick steps to personalize your reading life.</p>
        </div>
        <button class="onboarding-dismiss" type="button" data-action="dismiss-onboarding" aria-label="Dismiss checklist">
          <i class="ph ph-x"></i>
        </button>
      </div>

      <div class="onboarding-steps">
        <div class="onboarding-step ${hasBook ? 'completed' : ''}">
          <div class="onboarding-step-icon">
            <i class="ph ${hasBook ? 'ph-check-circle' : 'ph-book-plus'}"></i>
          </div>
          <div class="onboarding-step-content">
            <strong>1. Add what you&apos;re reading right now</strong>
            <p>Search by title or ISBN to add your first book to your shelf.</p>
          </div>
          <button class="btn ${hasBook ? 'btn-secondary' : 'btn-primary'} btn-sm" type="button" data-action="open-search">
            ${hasBook ? 'Add another' : 'Search books'}
          </button>
        </div>

        <div class="onboarding-step ${hasGoal ? 'completed' : ''}">
          <div class="onboarding-step-icon">
            <i class="ph ${hasGoal ? 'ph-check-circle' : 'ph-target'}"></i>
          </div>
          <div class="onboarding-step-content">
            <strong>2. Set your yearly reading goal</strong>
            <p>Aim for a target number of books to track your reading momentum.</p>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-action="navigate" data-route="goals">
            ${hasGoal ? 'Adjust goal' : 'Set goal'}
          </button>
        </div>

        <div class="onboarding-step ${hasImport ? 'completed' : ''}">
          <div class="onboarding-step-icon">
            <i class="ph ${hasImport ? 'ph-check-circle' : 'ph-download-simple'}"></i>
          </div>
          <div class="onboarding-step-content">
            <strong>3. Import Kindle clippings or Goodreads</strong>
            <p>Already reading elsewhere? Bring your highlights, clippings, or library backup.</p>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-action="navigate" data-route="settings">
            Import data
          </button>
        </div>
      </div>
    </section>`;
}

export function buildMobileAppPollCard() {
  if (isPollDismissedOrVoted()) return '';

  const os = detectUserOS();
  return `
    <section class="dashboard-panel dashboard-poll-card" id="dashboardMobilePoll" aria-label="Mobile app survey">
      <div class="dashboard-poll-content">
        <div class="dashboard-poll-main">
          <div class="dashboard-poll-badge">
            <span class="dashboard-poll-badge-dot"></span>
            <span>Community Poll</span>
          </div>
          <h2 class="dashboard-poll-title">Would you like a native mobile app for LibriQ? 📱</h2>
          <p class="dashboard-poll-subtitle">
            We're deciding whether to prioritize an <strong>iOS (Apple App Store)</strong> or <strong>Android (Google Play)</strong> app next. Cast your vote to help us choose!
          </p>
        </div>
        <div class="dashboard-poll-actions" id="dashboardPollActionRow">
          <button class="btn btn-secondary dashboard-poll-btn ${os === 'iOS' ? 'is-detected' : ''}" type="button" data-action="submit-mobile-poll" data-poll-choice="ios">
            <span class="poll-btn-emoji">🍏</span>
            <span>Yes, <strong>iOS</strong></span>
            ${os === 'iOS' ? '<span class="poll-detected-chip">Your OS</span>' : ''}
          </button>
          <button class="btn btn-secondary dashboard-poll-btn ${os === 'Android' ? 'is-detected' : ''}" type="button" data-action="submit-mobile-poll" data-poll-choice="android">
            <span class="poll-btn-emoji">🤖</span>
            <span>Yes, <strong>Android</strong></span>
            ${os === 'Android' ? '<span class="poll-detected-chip">Your OS</span>' : ''}
          </button>
          <button class="btn btn-ghost dashboard-poll-btn" type="button" data-action="submit-mobile-poll" data-poll-choice="web_ok">
            <span class="poll-btn-emoji">🌐</span>
            <span>Web is fine</span>
          </button>
        </div>
        <div class="dashboard-poll-success" id="dashboardPollSuccess" hidden>
          <span class="poll-success-icon">✓</span>
          <span>Vote recorded! Thank you for shaping LibriQ&apos;s roadmap.</span>
        </div>
      </div>
      <button class="dashboard-poll-close" type="button" data-action="dismiss-mobile-poll" aria-label="Dismiss survey">
        <i class="ph ph-x" aria-hidden="true"></i>
      </button>
    </section>`;
}
