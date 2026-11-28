import { LIBRIQ } from './data.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { isPollDismissedOrVoted, detectUserOS } from './services/mobileAppPoll.js';
import { chartDataTable, chartGroupAttrs, chartBarAttrs } from './shared/chartTable.js';

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
    const reading = Storage.getBooksByStatus(LIBRIQ.STATUS.READING);
    const books = Storage.getBooks();
    const featuredBook = pickFeaturedReadingBook(reading);
    const recentBooks = buildRecentBooks(books);
    const recentActivity = buildRecentActivity();
    const topGenres = stats.topGenres || [];
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
    const goalPct = goals.yearly > 0 ? Math.min(100, Math.round((stats.finishedThisYear / goals.yearly) * 100)) : 0;
    const ringOffset = Math.round(283 - (283 * goalPct / 100));
    const booksLeft = Math.max(0, goals.yearly - stats.finishedThisYear);
    const weeksLeft = Math.ceil((new Date(new Date().getFullYear(), 11, 31) - new Date()) / 604800000);

    main.innerHTML = `
      <div class="page dashboard-page" id="dashboardPage">
        <div class="dashboard-topbar">
          <div class="dashboard-page-context">
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
            <h1 class="greeting-title">Dashboard</h1>
          </div>
        </div>

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

            ${buildMobileAppPollCard()}

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
                  <span class="dashboard-compact-label">Books in library</span>
                  <strong>${stats.total}</strong>
                </div>
                <div class="dashboard-compact-card">
                  <span class="dashboard-compact-label">Currently reading</span>
                  <strong>${stats.reading}</strong>
                </div>
                <div class="dashboard-compact-card">
                  <span class="dashboard-compact-label">Finished this year</span>
                  <strong>${stats.finishedThisYear}</strong>
                </div>
                <div class="dashboard-compact-card">
                  <span class="dashboard-compact-label">Day streak</span>
                  <strong>${streak.current}</strong>
                </div>
              </div>
            </section>
            <p class="dashboard-privacy dashboard-privacy-main">${dashboardIcon('lock-keyhole')} A private record of a reading life. Only you can see your library.</p>
          </div>

          <aside class="dashboard-aside">
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
                  <p class="dashboard-goal-togo">${booksLeft > 0 ? `${booksLeft} ${booksLeft === 1 ? 'book' : 'books'} to go` : 'Goal complete'}</p>
                  <p class="dashboard-goal-time">${weeksLeft} ${weeksLeft === 1 ? 'week' : 'weeks'} left in ${new Date().getFullYear()}</p>
                </div>
              </div>
            </section>

            ${topGenres.length > 0 ? `
              <section class="dashboard-panel dashboard-genres-panel">
                <div class="section-header dashboard-section-header">
                  <h2 class="section-title">Top Genres</h2>
                </div>
                <div class="genre-list">
                  ${topGenres.map(([genre, count], i) => buildGenreRow(genre, count, stats.total, { tone: i === 0 ? 'accent' : 'neutral' })).join('')}
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
  const genre = book.genre || (Array.isArray(book.genres) ? book.genres[0] : '') || book.subject || book.category || '';
  const quote = buildFeaturedQuote(book);
  return `
    <div class="dashboard-hero-card">
      <div class="dashboard-hero-cover">
        ${Utils.buildCover(book, 'cover-xl')}
      </div>
      <div class="dashboard-hero-content">
        ${genre ? `<span class="dashboard-pill">${Utils.sanitize(genre)}</span>` : ''}
        <h3 class="dashboard-hero-title">${Utils.sanitize(book.title)}</h3>
        <p class="dashboard-hero-author">by ${Utils.sanitize(book.author || 'Unknown author')}</p>
        <div class="dashboard-progress-meta">
          <span>${timeLeft !== null ? `${timeLeft} pages left` : 'Progress'}</span>
          <strong>${pct}%</strong>
        </div>
        <div class="progress-bar dashboard-progress-bar" role="progressbar" aria-label="Reading progress for ${Utils.sanitize(book.title)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-valuetext="${pct}%, page ${Number(book.currentPage) || 0} of ${Number(book.pageCount) || 0}">
          <div class="progress-fill ${pct >= 100 ? 'complete' : ''}" style="width:${pct}%"></div>
        </div>
        <p class="dashboard-page-count">Page ${Number(book.currentPage) || 0} of ${Number(book.pageCount) || 0}</p>
        ${quote ? `<p class="dashboard-hero-quote">${Utils.sanitize(quote)}</p>` : ''}
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
        <h3 class="dashboard-hero-title">Your next session starts here</h3>
        <p class="dashboard-hero-author">Add a book to surface a featured reading card with progress and quick actions.</p>
        <div class="dashboard-hero-actions">
          <button class="btn btn-primary" type="button" data-action="open-search">
            <i class="ph ph-plus" aria-hidden="true"></i>
            Add Book
          </button>
          <button class="btn btn-secondary" type="button" data-action="open-manual-entry">
            <i class="ph ph-pencil" aria-hidden="true"></i>
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
  return source ? source.slice(0, 220) : '';
}

function buildRecentBooksRow(books) {
  return `
    <div class="dashboard-recent-row">
      ${books.slice(0, 4).map(book => `
        <button class="dashboard-recent-card" data-action="show-book-details" data-book-id="${Utils.sanitize(book.id)}" type="button">
          ${Utils.buildCover(book, 'cover-md')}
          <div class="dashboard-recent-copy">
            <strong>${Utils.sanitize(book.title)}</strong>
            <span class="dashboard-recent-author">${Utils.sanitize(book.author || 'Unknown author')}</span>
            <span class="dashboard-recent-meta">
              <span class="dashboard-recent-status" data-status="${Utils.sanitize(book.status || '')}">${Utils.statusLabel(book.status)}</span>
              <time>${Utils.formatDate(book.dateUpdated || book.dateStarted || book.dateAdded || new Date())}</time>
            </span>
          </div>
        </button>
      `).join('')}
    </div>`;
}

function buildRecentEmptyState() {
  return `
    <div class="dashboard-empty-state">
      <div class="empty-state-icon"><i class="ph ph-books" aria-hidden="true"></i></div>
      <div class="empty-state-title">No recent updates yet</div>
      <div class="empty-state-body">Add a few books or update reading progress and they will appear here.</div>
    </div>`;
}

function buildActivityEmptyState() {
  return `
    <div class="dashboard-empty-state dashboard-empty-state-compact">
      <div class="empty-state-icon"><i class="ph ph-clock-counter-clockwise" aria-hidden="true"></i></div>
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


export function buildMonthlyChart(monthlyData) {
  const max = Math.max(...monthlyData, 1);
  const currentMonth = new Date().getMonth();

  return `
    <div class="monthly-chart" ${chartGroupAttrs(`Books finished per month, ${new Date().getFullYear()}`)}>
      ${LIBRIQ.MONTHS.map((m, i) => {
        const val = monthlyData[i];
        const pct = Math.round((val / max) * 100);
        const isCurrent = i === currentMonth;
        const tip = `${val} book${val !== 1 ? 's' : ''} in ${m}`;
        return `
          <div class="chart-bar-wrap" data-tooltip="${tip}" ${chartBarAttrs(tip, isCurrent)}>
            <div class="chart-bar ${isCurrent ? 'current' : ''}"
                 style="height: ${Math.max(pct, 0)}%"></div>
            <div class="chart-bar-label">${m}</div>
          </div>`;
      }).join('')}
    </div>
    ${chartDataTable({ caption: `Books finished per month, ${new Date().getFullYear()}`, valueHeader: 'Books', months: LIBRIQ.MONTHS, values: monthlyData })}`;
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

// `tone` ('accent' or 'neutral') lets a caller draw one series in the palette,
// with the leader in the accent. Without it each genre keeps its own colour, as
// the Statistics page shows them.
export function buildGenreRow(genre, count, total, { tone } = {}) {
  const pct = Math.round((count / total) * 100);
  const fillStyle = tone ? `width:${pct}%` : `width:${pct}%; background: ${Utils.genreColor(genre)}`;
  return `
    <div class="genre-row"${tone ? ` data-tone="${tone}"` : ''}>
      <div class="genre-info">
        <span class="genre-name">${Utils.sanitize(genre)}</span>
        <span class="genre-count">${count}</span>
      </div>
      <div class="progress-bar" aria-hidden="true">
        <div class="progress-fill" style="${fillStyle}"></div>
      </div>
    </div>`;
}

function buildOnboardingChecklist(books, goals) {
  if (typeof localStorage === 'undefined') return '';
  const onboarding = Storage.getOnboarding();
  if (onboarding.dismissed) return '';
  if (books && books.length >= 3) return '';

  const hasBook = Array.isArray(books) && books.length > 0;
  const hasGoal = onboarding.goalSet || Boolean(goals && goals.yearly !== 12);
  const hasImport = onboarding.imported;

  return `
    <section class="onboarding-checklist" aria-label="Getting started with LibriQ">
      <div class="onboarding-header">
        <div class="onboarding-header-copy">
          <h2 class="onboarding-title">Getting started with your reading space</h2>
          <p class="onboarding-subtitle">Complete these 3 quick steps to personalize your reading life.</p>
        </div>
        <button class="onboarding-dismiss" type="button" data-action="dismiss-onboarding" aria-label="Dismiss checklist">
          <i class="ph ph-x" aria-hidden="true"></i>
        </button>
      </div>

      <div class="onboarding-steps">
        <div class="onboarding-step ${hasBook ? 'completed' : ''}">
          <div class="onboarding-step-icon">
            <i class="ph ${hasBook ? 'ph-check-circle' : 'ph-book-plus'}" aria-hidden="true"></i>
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
            <i class="ph ${hasGoal ? 'ph-check-circle' : 'ph-target'}" aria-hidden="true"></i>
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
            <i class="ph ${hasImport ? 'ph-check-circle' : 'ph-download-simple'}" aria-hidden="true"></i>
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
          <span class="dashboard-poll-label">Community poll</span>
          <h2 class="dashboard-poll-title">Would you like a native mobile app for LibriQ?</h2>
          <p class="dashboard-poll-subtitle">
            We're deciding whether to build an <strong>iOS</strong> or an <strong>Android</strong> app first. Which would you use?
          </p>
        </div>
        <div class="dashboard-poll-actions" id="dashboardPollActionRow">
          <button class="btn btn-secondary dashboard-poll-btn ${os === 'iOS' ? 'is-detected' : ''}" type="button" data-action="submit-mobile-poll" data-poll-choice="ios">
            <span class="poll-btn-icon"><i class="ph ph-apple-logo" aria-hidden="true"></i></span>
            <span>Yes, <strong>iOS</strong></span>
            ${os === 'iOS' ? '<span class="poll-detected-chip">Your OS</span>' : ''}
          </button>
          <button class="btn btn-secondary dashboard-poll-btn ${os === 'Android' ? 'is-detected' : ''}" type="button" data-action="submit-mobile-poll" data-poll-choice="android">
            <span class="poll-btn-icon"><i class="ph ph-android-logo" aria-hidden="true"></i></span>
            <span>Yes, <strong>Android</strong></span>
            ${os === 'Android' ? '<span class="poll-detected-chip">Your OS</span>' : ''}
          </button>
          <button class="btn btn-ghost dashboard-poll-btn" type="button" data-action="submit-mobile-poll" data-poll-choice="web_ok">
            <span class="poll-btn-icon"><i class="ph ph-globe" aria-hidden="true"></i></span>
            <span>Web is fine</span>
          </button>
        </div>
        <div class="dashboard-poll-success" id="dashboardPollSuccess" hidden>
          <span class="poll-success-icon"><i class="ph ph-check" aria-hidden="true"></i></span>
          <span>Vote recorded. Thanks for helping decide.</span>
        </div>
      </div>
      <button class="dashboard-poll-close" type="button" data-action="dismiss-mobile-poll" aria-label="Dismiss survey">
        <i class="ph ph-x" aria-hidden="true"></i>
      </button>
    </section>`;
}
