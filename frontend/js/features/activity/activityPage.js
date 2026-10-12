const FILTER_TYPES = Object.freeze({
  books: ['book_added', 'manual_book_added', 'status_changed', 'progress_updated', 'book_finished', 'rating_updated', 'favorite_added', 'favorite_removed'],
  progress: ['status_changed', 'progress_updated', 'book_finished'],
  notes: ['note_saved', 'note_cleared', 'quote_saved', 'quote_updated', 'quote_deleted'],
  backups: ['backup_exported', 'backup_imported'],
  metadata: ['metadata_refreshed'],
});

const ACTIVITY_PRESENTATION = Object.freeze({
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
});

const ACTIVITY_ASSETS = Object.freeze({
  book_added: 'book-plus', manual_book_added: 'book-plus1', status_changed: 'chart-no-axes-column-increasing',
  progress_updated: 'chart-no-axes-column-increasing', book_finished: 'check', rating_updated: 'notebook-pen1',
  favorite_added: 'book-plus', favorite_removed: 'book-plus', note_saved: 'notebook-pen1', note_cleared: 'notebook-pen1',
  quote_saved: 'notebook-pen1', quote_updated: 'notebook-pen1', quote_deleted: 'notebook-pen1',
  metadata_refreshed: 'refresh-cw', backup_exported: 'hard-drive-download', backup_imported: 'hard-drive-download',
});

export function filterActivityEvents(events, filter) {
  const list = Array.isArray(events) ? [...events] : [];
  const allowedTypes = FILTER_TYPES[filter];
  const filtered = allowedTypes ? list.filter(event => allowedTypes.includes(String(event.type || ''))) : list;
  return filtered.sort((a, b) => activityTime(b) - activityTime(a));
}

export function groupActivityByDate(events, now = new Date()) {
  const groups = new Map();
  const today = now.toDateString();
  const yesterday = new Date(now.getTime() - 86400000).toDateString();

  for (const event of events || []) {
    const date = new Date(event.timestamp || event.createdAt || now);
    const key = date.toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(normalizeActivity(event));
  }

  return Array.from(groups, ([key, items]) => ({
    label: key === today ? 'Today' : key === yesterday ? 'Yesterday' : new Date(key).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    items,
  }));
}

export function createActivityPage({ storage, utils, actions, session, documentRoot }) {
  if (!storage || !utils) throw new TypeError('createActivityPage requires storage and utils.');
  const sessionStore = session || globalThis.sessionStorage;
  const pageDocument = documentRoot || globalThis.document;

  function render() {
    const main = pageDocument?.getElementById('mainContent');
    if (!main) return;
    const events = storage.getActivityLog?.() || [];
    const storedFilter = sessionStore?.getItem('libriq_activity_filter') || 'all';
    const filter = Object.hasOwn(FILTER_TYPES, storedFilter) ? storedFilter : 'all';
    const bookOptions = new Map(events.filter(event => event.bookId).map(event => [String(event.bookId), event.bookTitle || 'Unknown title']));
    const storedBook = sessionStore?.getItem('libriq_activity_book');
    const bookFilter = bookOptions.has(storedBook) ? storedBook : 'all';
    const sort = sessionStore?.getItem('libriq_activity_sort') === 'oldest' ? 'oldest' : 'newest';
    const filtered = filterActivityEvents(events, filter).filter(event => bookFilter === 'all' || String(event.bookId) === bookFilter);
    if (sort === 'oldest') filtered.reverse();
    const grouped = groupActivityByDate(filtered);

    main.innerHTML = `
      <div class="page" id="activityPage">
        <div class="page-header library-header activity-header">
          <div class="library-heading">
            <h1 class="page-title">Activity Log</h1>
            <p class="page-subtitle">The quiet record of your reading life.</p>
          </div>
        </div>
        <div class="activity-toolbar">
        <div id="activityFilters">
          <details class="activity-filter-menu"><summary><img src="assets/revamp/insights/activity-layers.svg" alt="" width="16" height="16" />${filter === 'all' ? 'All activity' : filter.charAt(0).toUpperCase() + filter.slice(1)}</summary>
          <div class="activity-filter-options">
          ${buildFilterChip('all', 'All activity', events.length, filter)}
          ${buildFilterChip('books', 'Books', countEvents(events, FILTER_TYPES.books), filter)}
          ${buildFilterChip('progress', 'Progress', countEvents(events, FILTER_TYPES.progress), filter)}
          ${buildFilterChip('notes', 'Notes', countEvents(events, FILTER_TYPES.notes), filter)}
          ${buildFilterChip('backups', 'Backups', countEvents(events, FILTER_TYPES.backups), filter)}
          ${buildFilterChip('metadata', 'Metadata', countEvents(events, FILTER_TYPES.metadata), filter)}
          </div></details>
          <select class="activity-select" id="activityBookFilter" aria-label="Filter activity by book">
            <option value="all">All books</option>
            ${Array.from(bookOptions, ([id, title]) => `<option value="${utils.sanitize(id)}" ${bookFilter === id ? 'selected' : ''}>${utils.sanitize(title)}</option>`).join('')}
          </select>
        </div>
        <select class="activity-sort" id="activitySort" aria-label="Activity order"><option value="newest" ${sort === 'newest' ? 'selected' : ''}>Newest first</option><option value="oldest" ${sort === 'oldest' ? 'selected' : ''}>Oldest first</option></select>
        </div>
        <div class="activity-history">
          ${grouped.length ? grouped.map(group => `
            <section class="activity-day-group">
              <h2 class="activity-day-label">${utils.sanitize(group.label)} <small>${group.items.length} event${group.items.length !== 1 ? 's' : ''}</small></h2>
              <div class="activity-list">${group.items.map(item => buildActivityItem(item, utils)).join('')}</div>
            </section>`).join('') : buildEmptyState(filter)}
        </div>
        <p class="activity-footnote"><span class="activity-count" role="status">${filtered.length} event${filtered.length !== 1 ? 's' : ''}</span> · Your activity is private to your account.</p>
      </div>`;

    main.querySelector('#activityFilters')?.addEventListener('click', event => {
      const button = event.target.closest('.chip[data-filter]');
      if (!button) return;
      sessionStore?.setItem('libriq_activity_filter', button.dataset.filter);
      render();
    });
    main.querySelector('#activityBookFilter')?.addEventListener('change', event => {
      sessionStore?.setItem('libriq_activity_book', event.target.value);
      render();
    });
    main.querySelector('#activitySort')?.addEventListener('change', event => {
      sessionStore?.setItem('libriq_activity_sort', event.target.value);
      render();
    });
    main.querySelector('[data-action="open-library"]')?.addEventListener('click', () => actions?.navigate?.('library'));
    main.querySelector('[data-action="open-search"]')?.addEventListener('click', () => actions?.openSearch?.());
  }

  return render;
}

function activityTime(event) {
  const value = new Date(event?.timestamp || event?.createdAt || 0).getTime();
  return Number.isFinite(value) ? value : 0;
}

function countEvents(events, types) {
  return (events || []).filter(event => types.includes(event.type)).length;
}

function buildFilterChip(key, label, count, active) {
  return `<button type="button" class="chip activity-chip ${active === key ? 'active' : ''}" data-action="filter-activity" data-filter="${key}" aria-pressed="${active === key}">${label} <span class="activity-chip-count">${count}</span></button>`;
}

function normalizeActivity(event) {
  const presentation = ACTIVITY_PRESENTATION[event.type] || ['Activity', 'ph-bell', 'var(--color-neutral-dim)', 'var(--text-tertiary)'];
  return {
    ...event,
    title: event.bookTitle || (event.type?.startsWith('backup_') ? 'Library backup' : 'Unknown title'),
    subtitle: event.bookAuthor || '',
    label: presentation[0],
    icon: presentation[1],
    iconBg: presentation[2],
    iconColor: presentation[3],
    payloadText: activityDetail(event),
    date: event.timestamp || event.createdAt,
  };
}

function activityDetail(event) {
  const status = String(event.payload?.status || '').toLowerCase();
  const details = {
    book_finished: 'Marked as finished', progress_updated: 'Progress updated', metadata_refreshed: 'Metadata refreshed',
    favorite_added: 'Added to favorites', favorite_removed: 'Removed from favorites', note_saved: 'Note saved',
    note_cleared: 'Note cleared', backup_exported: 'Backup exported', backup_imported: 'Backup imported',
  };
  if (event.type === 'status_changed' && status === 'finished') return 'Status updated to Finished';
  if (event.type === 'status_changed' && status) return `Status updated to ${status.charAt(0).toUpperCase() + status.slice(1)}`;
  if (event.type === 'rating_updated' && event.payload?.rating != null) return `Rating updated to ${event.payload.rating}/5`;
  if (event.type === 'progress_updated' && event.payload?.currentPage != null) return `Page ${event.payload.currentPage}${event.payload?.pageCount ? ` of ${event.payload.pageCount}` : ''}`;
  return details[event.type] || '';
}

function buildActivityItem(activity, utils) {
  const asset = ACTIVITY_ASSETS[activity.type] || 'history1';
  const type = Object.hasOwn(ACTIVITY_ASSETS, activity.type) ? activity.type : 'unknown';
  return `<article class="activity-item activity-row">
    <div class="activity-icon activity-icon--${type}"><img src="assets/revamp/insights/activity-${asset}.svg" alt="" /></div>
    <div class="activity-content">
      <div class="activity-title-row"><div class="activity-title">${utils.sanitize(activity.label)}</div><div class="activity-time">${utils.sanitize(utils.timeAgo(activity.date))}</div></div>
      <div class="activity-subtitle">${utils.sanitize([activity.title, activity.subtitle, activity.payloadText].filter(Boolean).join(' · '))}</div>
    </div>
  </article>`;
}

function buildEmptyState(filter) {
  const messages = {
    all: ['Your story starts here', 'Add a book, track your progress, or save a note. Your reading activity will gather here, quietly.'],
    books: ['No book activity yet', 'Add or update a book to see it here.'], progress: ['No progress updates yet', 'Track a reading session or finish a book to populate this view.'],
    notes: ['No notes activity yet', 'Save or clear a note to see it here.'], backups: ['No backup activity yet', 'Export or import a backup to track it here.'],
    metadata: ['No metadata refreshes yet', 'Refresh a book’s metadata to record it here.'],
  };
  const [title, body] = messages[filter] || messages.all;
  return `<div class="empty-state activity-empty-state grid-full-width">
    <div class="empty-state-icon"><img src="assets/revamp/insights/activity-book-open1.svg" alt="" /></div><h2 class="empty-state-title">${title}</h2><p class="empty-state-body">${body}</p>
    <div class="inline-actions inline-actions--centered"><button type="button" class="btn btn-secondary btn-sm" data-action="open-library">Library</button><button type="button" class="btn btn-primary btn-sm" data-action="open-search">Search Books</button></div>
  </div>`;
}
