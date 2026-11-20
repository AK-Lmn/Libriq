import { LIBRIQ } from './data.js';
import { AccessibleDialog } from './components/ui/dialog.js';
import { coverImgAttrs } from './shared/coverSize.js';

const dialogControllers = new WeakMap();

function _getDialogController(element) {
  if (!element?.matches?.('[role="dialog"]')) return null;
  if (!dialogControllers.has(element)) {
    dialogControllers.set(element, new AccessibleDialog(element, {
      panel: element.firstElementChild,
      closeOnBackdrop: true,
      closeOnEscape: true,
    }));
  }
  return dialogControllers.get(element);
}

function _safeCoverUrl(value) {
  const url = String(value || '').trim();
  if (!url) return null;
  const scheme = url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme) return url;
  if (scheme === 'http' || scheme === 'https' || scheme === 'blob') return url;
  if (scheme === 'data' && /^data:image\/(?:avif|gif|jpeg|jpg|png|webp);/i.test(url)) return url;
  return null;
}

// Image fallbacks and interactive stars use delegated listeners instead of
// inline onerror/onclick attributes, which the CSP blocks.
// error events don't bubble, so listen in the capture phase.
function _handleImageError(event) {
  const img = event.target;
  if (img?.tagName !== 'IMG' || img.dataset.fallbackTriggered === '1') return;
  const cover = img.closest?.('[data-cover-fallback]');
  if (cover) {
    img.dataset.fallbackTriggered = '1';
    cover.innerHTML = Utils.buildCoverPlaceholder(cover.dataset.coverTitle || '');
    return;
  }
  if (img.dataset.fallbackSrc) {
    img.dataset.fallbackTriggered = '1';
    img.removeAttribute('srcset');
    img.src = img.dataset.fallbackSrc;
  }
}

function _handleStarClick(event) {
  const star = event.target?.closest?.('[data-action="set-star-rating"]');
  if (!star) return;
  globalThis.Library?.setRating?.(star.dataset.bookId, Number(star.dataset.rating));
}

let _delegatedHandlersInstalled = false;

export const Utils = {

  $: (selector, parent = document) => parent.querySelector(selector),

  $$: (selector, parent = document) => [...parent.querySelectorAll(selector)],

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

  show(el, options = {}) {
    if (!el) return;
    const dialog = _getDialogController(el);
    if (dialog) dialog.open(options);
    else el.removeAttribute('hidden');
  },
  hide(el, options = {}) {
    if (!el) return;
    const dialog = _getDialogController(el);
    if (dialog) dialog.close(options);
    else el.setAttribute('hidden', '');
  },
  toggle: (el, force) => {
    if (force === undefined) force = el.hasAttribute('hidden');
    force ? Utils.show(el) : Utils.hide(el);
  },

  isApplePlatform() {
    const platform = navigator.userAgentData?.platform || navigator.platform || '';
    const ua = navigator.userAgent || '';
    return /Mac|iPhone|iPad|iPod/.test(platform) || /iPhone|iPad|iPod/.test(ua);
  },

  getSearchShortcutLabel() {
    return Utils.isApplePlatform() ? '⌘K' : 'Ctrl K';
  },

  formatPages(n) {
    const pages = Number(n);
    if (!Number.isFinite(pages) || pages <= 0) return 'None';
    return Math.trunc(pages).toLocaleString() + ' pages';
  },

  formatDate(isoString) {
    if (!isoString) return 'None';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  timeAgo(isoString) {
    if (!isoString) return '';
    const seconds = Math.floor((Date.now() - new Date(isoString)) / 1000);
    if (seconds < 60)   return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return Utils.formatDate(isoString);
  },

  readingProgress(currentPage, totalPages) {
    if (!totalPages || totalPages === 0) return 0;
    return Math.min(100, Math.round((currentPage / totalPages) * 100));
  },

  truncate(text, n = 80) {
    if (!text || text.length <= n) return text || '';
    return text.slice(0, n).trimEnd() + '…';
  },

  capitalize: (s) => s ? s[0].toUpperCase() + s.slice(1) : '',

  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  sanitize(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

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

  formatEmailPrefixName(email) {
    const prefix = String(email || '').split('@')[0].trim();
    if (!prefix) return '';
    const cleaned = prefix.replace(/[^a-zA-Z0-9._-]/g, '');
    if (!cleaned) return '';
    const firstToken = cleaned.split(/[._-]/).find(Boolean) || cleaned;
    const fallback = firstToken.match(/[A-Za-z]+/)?.[0] || firstToken;
    return Utils.formatDisplayName(fallback);
  },

  statusLabel(status) {
    const map = {
      [LIBRIQ.STATUS.READING]:  'Reading',
      [LIBRIQ.STATUS.FINISHED]: 'Finished',
      [LIBRIQ.STATUS.WISHLIST]: 'Want to Read',
      [LIBRIQ.STATUS.DNF]:      'Did Not Finish',
    };
    return map[status] || 'Unknown';
  },

  statusBadgeClass(status) {
    const map = {
      [LIBRIQ.STATUS.READING]:  'badge-reading',
      [LIBRIQ.STATUS.FINISHED]: 'badge-finished',
      [LIBRIQ.STATUS.WISHLIST]: 'badge-wishlist',
      [LIBRIQ.STATUS.DNF]:      'badge-dnf',
    };
    return map[status] || '';
  },

  statusIcon(status) {
    const map = {
      [LIBRIQ.STATUS.READING]:  'ph-book-open',
      [LIBRIQ.STATUS.FINISHED]: 'ph-check-circle',
      [LIBRIQ.STATUS.WISHLIST]: 'ph-bookmark',
      [LIBRIQ.STATUS.DNF]:      'ph-x-circle',
    };
    return map[status] || 'ph-book';
  },

  buildCover(book, sizeClass = 'cover-md') {
    const coverUrl = _safeCoverUrl(book.coverUrl);
    if (coverUrl) {
      // Whoever renders a cover gets the fallback listener, even without the app boot.
      if (typeof document !== 'undefined') Utils.installDelegatedHandlers(document);
      return `
        <div class="book-cover ${sizeClass}" data-cover-fallback="true" data-cover-title="${Utils.sanitize(book.title)}">
          <img ${coverImgAttrs(coverUrl, sizeClass, Utils.sanitize)}
               alt="Cover of ${Utils.sanitize(book.title)}"
               loading="lazy"
               referrerpolicy="no-referrer"
               decoding="async">
        </div>`;
    }
    return `
      <div class="book-cover ${sizeClass}">
        ${Utils.buildCoverPlaceholder(book.title)}
      </div>`;
  },

  // Called once at boot (appModules.js). Not run on import so the module
  // stays side-effect free.
  installDelegatedHandlers(doc = document) {
    if (_delegatedHandlersInstalled || typeof doc?.addEventListener !== 'function') return;
    _delegatedHandlersInstalled = true;
    doc.addEventListener('error', _handleImageError, true);
    doc.addEventListener('click', _handleStarClick);
  },

  buildCoverPlaceholder(title) {
    return `
      <div class="book-cover-placeholder">
        <i class="ph ph-book" aria-hidden="true"></i>
        <span class="cover-title">${Utils.sanitize(title)}</span>
      </div>`;
  },

  buildStars(rating, interactive = false, bookId = null) {
    const stars = [1,2,3,4,5].map(n => {
      const filled = rating !== null && n <= rating ? 'filled' : '';
      const attrs = interactive
        ? `data-action="set-star-rating" data-rating="${n}" data-book-id="${Utils.sanitize(bookId)}"`
        : '';
      return `<span class="star ${filled}" ${attrs}><i class="ph${filled ? '-fill' : ''} ph-star" aria-hidden="true"></i></span>`;
    }).join('');

    if (interactive) {
      if (typeof document !== 'undefined') Utils.installDelegatedHandlers(document);
      return `<div class="star-rating">${stars}</div>`;
    }
    // Read-only: one image with a text equivalent instead of five silent icons.
    const label = rating ? `Rated ${rating} out of 5` : 'Not rated';
    return `<div class="star-rating readonly" role="img" aria-label="${label}">${stars}</div>`;
  },

  toast(message, type = 'success', { persistent = false, action = null } = {}) {
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
      <i class="ph ${icons[type] || icons.info}" aria-hidden="true"></i>
      <span>${Utils.sanitize(message)}</span>
    `;

    const dismiss = () => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    };

    // An action (Undo, Reload) works on any toast; the toast stays up longer
    // so there is time to reach it.
    const hasAction = Boolean(action?.label && typeof action.onClick === 'function');
    if (hasAction) {
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-dismiss toast-action';
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', () => { action.onClick(); dismiss(); }, { once: true });
      toast.appendChild(actionBtn);
    }

    if (persistent) {
      // Stays until the reader closes it (a failed save, an update to load).
      toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'toast-dismiss';
      close.textContent = 'Dismiss';
      close.addEventListener('click', dismiss, { once: true });
      toast.appendChild(close);
    }

    container.appendChild(toast);
    if (!persistent) setTimeout(dismiss, hasAction ? 8000 : 3500);
    return toast;
  },

  genreColor(genre) {
    /* ds-allow-hardcode: genre color taxonomy mapping */
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

  formatNumber(n) {
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  },
};
