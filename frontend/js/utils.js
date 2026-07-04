/* ============================================
   LIBRIQ UTILITIES
   Pure functions, no side effects
   ============================================ */

const Utils = {

  // ── DOM ──────────────────────────────────

  /** Select one element */
  $: (selector, parent = document) => parent.querySelector(selector),

  /** Select all elements */
  $$: (selector, parent = document) => [...parent.querySelectorAll(selector)],

  /** Create element with optional properties */
  createElement(tag, props = {}, children = []) {
    const el = document.createElement(tag);
    const { className, dataset, style, ...attrs } = props;

    if (className) el.className = className;
    if (dataset) Object.assign(el.dataset, dataset);
    if (style) Object.assign(el.style, style);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else {
        el.setAttribute(k, v);
      }
    });

    children.forEach(child => {
      if (typeof child === 'string') el.insertAdjacentHTML('beforeend', child);
      else if (child instanceof Node) el.appendChild(child);
    });

    return el;
  },

  /** Show/hide with hidden attribute */
  show: (el) => el && el.removeAttribute('hidden'),
  hide: (el) => el && el.setAttribute('hidden', ''),
  toggle: (el, force) => {
    if (force === undefined) force = el.hasAttribute('hidden');
    force ? Utils.show(el) : Utils.hide(el);
  },

  /** Detect Apple platforms for shortcut labels and key handling */
  isApplePlatform() {
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    const ua = navigator.userAgent || '';
    return /Mac|iPhone|iPad|iPod/.test(platform) || /iPhone|iPad|iPod/.test(ua);
  },

  /** Return the visible search shortcut label */
  getSearchShortcutLabel() {
    return Utils.isApplePlatform() ? '⌘K' : 'Ctrl K';
  },

  // ── Formatting ───────────────────────────

  /** Format page count */
  formatPages(n) {
    if (!n) return '–';
    return n.toLocaleString() + ' pages';
  },

  /** Format a date to readable string */
  formatDate(isoString) {
    if (!isoString) return '–';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  /** Format a date as relative time */
  timeAgo(isoString) {
    if (!isoString) return '';
    const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
    if (seconds < 60)   return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return Utils.formatDate(isoString);
  },

  /** Calculate reading progress as percentage */
  readingProgress(currentPage, totalPages) {
    if (!totalPages || totalPages === 0) return 0;
    return Math.min(100, Math.round((currentPage / totalPages) * 100));
  },

  /** Truncate text to n characters */
  truncate(text, n = 80) {
    if (!text || text.length <= n) return text || '';
    return text.slice(0, n).trimEnd() + '…';
  },

  /** Capitalize first letter */
  capitalize: (s) => s ? s[0].toUpperCase() + s.slice(1) : '',

  /** Debounce a function */
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  /** Sanitize HTML to prevent XSS */
  sanitize(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  /** Turn an account handle into a friendly display name */
  formatDisplayName(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return raw
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map(part => part[0].toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  },

  /** Extract a safe fallback name from an email prefix */
  formatEmailPrefixName(email) {
    const prefix = String(email || '').split('@')[0].trim();
    if (!prefix) return '';
    const cleaned = prefix.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!cleaned) return '';
    const firstToken = cleaned.split(/[._-]/).find(Boolean) || cleaned;
    const fallback = firstToken.match(/[A-Za-z]+/)?.[0] || firstToken;
    return Utils.formatDisplayName(fallback);
  },

  // ── Book helpers ─────────────────────────

  /** Get status label */
  statusLabel(status) {
    const map = {
      [LIBRIQ.STATUS.READING]:  'Reading',
      [LIBRIQ.STATUS.FINISHED]: 'Finished',
      [LIBRIQ.STATUS.WISHLIST]: 'Want to Read',
      [LIBRIQ.STATUS.DNF]:      'Did Not Finish',
    };
    return map[status] || 'Unknown';
  },

  /** Get status badge CSS class */
  statusBadgeClass(status) {
    const map = {
      [LIBRIQ.STATUS.READING]:  'badge-reading',
      [LIBRIQ.STATUS.FINISHED]: 'badge-finished',
      [LIBRIQ.STATUS.WISHLIST]: 'badge-wishlist',
      [LIBRIQ.STATUS.DNF]:      'badge-dnf',
    };
    return map[status] || '';
  },

  /** Get status icon */
  statusIcon(status) {
    const map = {
      [LIBRIQ.STATUS.READING]:  'ph-book-open',
      [LIBRIQ.STATUS.FINISHED]: 'ph-check-circle',
      [LIBRIQ.STATUS.WISHLIST]: 'ph-bookmark',
      [LIBRIQ.STATUS.DNF]:      'ph-x-circle',
    };
    return map[status] || 'ph-book';
  },

  /** Build cover HTML */
  buildCover(book, sizeClass = 'cover-md') {
    if (book.coverUrl) {
      return `
        <div class="book-cover ${sizeClass}" data-cover-fallback="true">
          <img src="${Utils.sanitize(book.coverUrl)}"
               alt="Cover of ${Utils.sanitize(book.title)}"
               loading="lazy"
               onerror="if(this.dataset.fallbackTriggered==='1') return; this.dataset.fallbackTriggered='1'; this.removeAttribute('src'); this.parentElement.innerHTML=Utils.buildCoverPlaceholder('${Utils.sanitize(book.title)}')">
        </div>`;
    }
    return `
      <div class="book-cover ${sizeClass}">
        ${Utils.buildCoverPlaceholder(book.title)}
      </div>`;
  },

  buildCoverPlaceholder(title) {
    return `
      <div class="book-cover-placeholder">
        <i class="ph ph-book"></i>
        <span class="cover-title">${Utils.sanitize(title)}</span>
      </div>`;
  },

  /** Build star rating HTML */
  buildStars(rating, interactive = false, bookId = null) {
    const stars = [1,2,3,4,5].map(n => {
      const filled = rating !== null && n <= rating ? 'filled' : '';
      const attrs = interactive
        ? `data-rating="${n}" data-book-id="${bookId}" onclick="Library.setRating('${bookId}', ${n})"`
        : '';
      return `<span class="star ${filled}" ${attrs}>★</span>`;
    }).join('');

    return `<div class="star-rating ${interactive ? '' : 'readonly'}">${stars}</div>`;
  },

  // ── Toast ─────────────────────────────────

  /**
   * Show a toast notification
   * @param {string} message
   * @param {'success'|'error'|'info'|'warning'} type
   */
  toast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      success: 'ph-check-circle',
      error:   'ph-x-circle',
      info:    'ph-info',
      warning: 'ph-warning',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i class="ph ${icons[type] || icons.info}"></i>
      <span>${Utils.sanitize(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    }, 3500);
  },

  // ── Genre color map ───────────────────────

  genreColor(genre) {
    const colors = {
      'Fantasy':          '#7C6CD4',
      'Science Fiction':  '#4A9EDB',
      'Fiction':          '#5BAE8A',
      'Non-Fiction':      '#DB8E4A',
      'Mystery':          '#B84A6D',
      'Thriller':         '#C45A5A',
      'Romance':          '#D46B8A',
      'Historical Fiction':'#8B6B4A',
      'Biography':        '#6B8B4A',
      'Self-Help':        '#4AB88B',
      'Philosophy':       '#9B6BD4',
      'Psychology':       '#4A8BD4',
      'Horror':           '#B84A4A',
      'Poetry':           '#D4A04A',
      'Classic':          '#8B7B5A',
    };
    return colors[genre] || '#9896A4';
  },

  // ── Number formatting ─────────────────────

  formatNumber(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  },
};
