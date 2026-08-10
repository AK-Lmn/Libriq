import { BookAPI } from './api/index.js';
import { LIBRIQ } from './data.js';
import { Storage } from './storage.js';
import { Utils } from './utils.js';
import { LibriqFirebase } from './firebase-client.js';
import { createBookDetailsPage } from './features/bookDetails/bookDetailsPage.js';

export const Library = (() => {
  const Identity = {
    getSourceLabels: (...args) => BookAPI.getSourceLabels(...args),
    normalizeSource: (...args) => BookAPI.normalizeSource(...args),
  };

  function showAddModal(bookData, options = {}) {
    const isManual = options.manual === true;
    const modal    = document.getElementById('addBookModal');
    const body     = document.getElementById('addBookBody');
    const closeBtn = document.getElementById('closeAddBook');
    const header   = modal.querySelector('.modal-title');

    if (header) header.textContent = isManual ? 'Manual Entry' : 'Add to Library';

    body.innerHTML = isManual ? buildManualForm(bookData) : buildAddForm(bookData);
    Utils.show(modal);

    if (isManual) {
      const statusSelect = body.querySelector('#manualStatusInput');
      const currentPageGroup = body.querySelector('#manualCurrentPageGroup');
      const ratingGroup = body.querySelector('#manualRatingGroup');
      const syncManualFields = () => {
        const status = statusSelect?.value;
        if (currentPageGroup) currentPageGroup.hidden = status !== LIBRIQ.STATUS.READING;
        if (ratingGroup) ratingGroup.hidden = status !== LIBRIQ.STATUS.FINISHED;
      };
      statusSelect?.addEventListener('change', syncManualFields);
      syncManualFields();
    } else {
      body.querySelectorAll('.status-option').forEach(btn => {
        btn.addEventListener('click', () => {
          body.querySelectorAll('.status-option').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          btn.querySelector('input').checked = true;
        });
      });
    }

    body.querySelector('#addBookForm').addEventListener('submit', (e) => {
      e.preventDefault();
      isManual ? submitManualBook(e.target) : submitAddBook(e.target, bookData);
    });

    closeBtn.onclick = closeAddModal;
    modal.onclick = (e) => { if (e.target === modal) closeAddModal(); };
  }

  function buildAddForm(book) {
    const genres = (book.genres || []).slice(0, 3);
    const sourceBadges = _getSourceLabels(book);
    const description = (book.description || book.shortDescription) ? String(book.description || book.shortDescription).replace(/<[^>]*>/g, '').trim() : '';

    return `
      <div class="book-preview">
        ${Utils.buildCover(book, 'cover-md')}
        <div class="book-preview-info">
          <div class="book-preview-title">${Utils.sanitize(book.title)}</div>
          <div class="book-preview-author">${Utils.sanitize(book.author)}</div>
          <div class="book-preview-meta">
            ${book.publishYear ? `<span class="badge">${book.publishYear}</span>` : ''}
            ${book.pageCount ? `<span class="badge">${Utils.formatPages(book.pageCount)}</span>` : ''}
            ${genres.map(g => `<span class="badge badge-accent">${Utils.sanitize(g)}</span>`).join('')}
          </div>
          ${sourceBadges.length ? `<div class="book-preview-meta">${sourceBadges.map(label => `<span class="badge badge-accent">${Utils.sanitize(label)}</span>`).join('')}</div>` : ''}
          ${description ? `<div class="book-preview-description">${Utils.sanitize(description)}</div>` : '<div class="book-preview-description book-preview-description--empty">No description available yet.</div>'}
        </div>
      </div>

      <form id="addBookForm" class="add-book-form">
        <div class="form-group">
          <label class="form-label">Add to shelf</label>
          <div class="status-select-group">
            <label class="status-option selected">
              <input type="radio" name="status" value="wishlist" checked hidden>
              <i class="ph ph-bookmark"></i>
              <span>Want to Read</span>
            </label>
            <label class="status-option">
              <input type="radio" name="status" value="reading" hidden>
              <i class="ph ph-book-open"></i>
              <span>Reading</span>
            </label>
            <label class="status-option">
              <input type="radio" name="status" value="finished" hidden>
              <i class="ph ph-check-circle"></i>
              <span>Finished</span>
            </label>
          </div>
        </div>

        <div class="form-group" id="pageProgressGroup" hidden>
          <label class="form-label" for="currentPageInput">Current page</label>
          <input
            type="number"
            id="currentPageInput"
            name="currentPage"
            class="form-input"
            placeholder="0"
            min="0"
            max="${book.pageCount || 9999}"
          />
        </div>

        <div class="form-group" id="ratingGroup" hidden>
          <label class="form-label">Your rating</label>
          <div class="star-rating star-lg" id="addBookStars">
            ${[1,2,3,4,5].map(n =>
              `<button class="star" type="button" data-action="set-add-rating" data-rating="${n}" aria-label="Rate ${n} out of 5">★</button>`
            ).join('')}
          </div>
          <input type="hidden" name="rating" id="ratingInput" value="">
        </div>

        <div class="form-group">
          <label class="form-label" for="tagsInput">Shelves <span class="text-tertiary">(optional)</span></label>
          <input
            type="text"
            id="tagsInput"
            name="tags"
            class="form-input"
            placeholder="e.g. Classics, Philosophy, Books to reread"
          />
        </div>

        <div class="modal-footer modal-footer--embedded">
          <button type="button" class="btn btn-ghost" data-action="close-add-dialog">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="ph ph-plus"></i>
            Add to Library
          </button>
        </div>
      </form>`;
  }

  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    document.addEventListener('change', (e) => {
      if (!e.target.matches('input[name="status"]')) return;
      const pageGroup   = document.getElementById('pageProgressGroup');
      const ratingGroup = document.getElementById('ratingGroup');
      if (!pageGroup) return;
      pageGroup.hidden = e.target.value !== 'reading';
      ratingGroup.hidden = e.target.value !== 'finished';
    });
    document.getElementById('addBookModal')?.addEventListener('click', (event) => {
      const trigger = event.target.closest?.('[data-action]');
      if (!trigger) return;
      const rating = Number.parseInt(trigger.dataset.rating || '', 10);
      if (trigger.dataset.action === 'set-add-rating' && Number.isFinite(rating)) _setFormRating(rating);
      if (trigger.dataset.action === 'set-manual-rating' && Number.isFinite(rating)) _setManualFormRating(rating);
      if (trigger.dataset.action === 'close-add-dialog') closeAddModal();
    });
  }

  function _setFormRating(value) {
    document.getElementById('ratingInput').value = value;
    document.querySelectorAll('#addBookStars .star').forEach((star, i) => {
      star.classList.toggle('filled', i < value);
    });
  }

  function _setManualFormRating(value) {
    document.getElementById('manualRatingInput').value = value;
    document.querySelectorAll('#manualBookStars .star').forEach((star, i) => {
      star.classList.toggle('filled', i < value);
    });
  }

  function _logActivity(type, book, payload = {}, source = null) {
    const event = Storage.buildActivityEvent(type, book, payload, source);
    if (event) {
      Storage.addActivityEvent(event);
      LibriqFirebase.queueActivitySync(event);
    }
  }

  function _parseShelfInput(value) {
    return Array.from(new Set(
      String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    ));
  }

  function _getMetadataGaps(book) {
    if (!book) return [];
    const gaps = [];
    if (!book.coverUrl) gaps.push('cover');
    if (!book.description) gaps.push('description');
    if (!book.pageCount) gaps.push('pageCount');
    if (!Array.isArray(book.genres) || book.genres.length === 0) gaps.push('genres');
    if (!book.publishYear) gaps.push('publishYear');
    if (!book.publisher) gaps.push('publisher');
    if (!book.language) gaps.push('language');
    return gaps;
  }

  function _getMetadataQuality(book) {
    const gaps = _getMetadataGaps(book);
    if (gaps.length === 0) return { label: 'Complete', className: 'complete' };
    if (gaps.includes('cover')) return { label: 'Missing cover', className: 'missing-cover' };
    if (gaps.includes('description')) return { label: 'No description yet', className: 'missing-description' };
    return { label: 'Missing details', className: 'missing-details' };
  }

  function _getSourceLabels(book) {
    const labels = Identity.getSourceLabels(book);
    if (labels.length > 0) return labels;
    const fallback = [];
    if (book?.source && book.source !== 'api') {
      const normalized = Identity.normalizeSource(book.source);
      const sourceLabelMap = {
        openlibrary: 'Open Library',
        google: 'Google Books',
      };
      if (sourceLabelMap[normalized]) fallback.push(sourceLabelMap[normalized]);
    }
    return fallback;
  }

  function submitAddBook(form, bookData) {
    const formData = new FormData(form);
    const status   = formData.get('status');
    const tags = _parseShelfInput(formData.get('tags'));

    const book = Storage.addBook({
      ...bookData,
      status,
      currentPage: status === 'reading'  ? parseInt(formData.get('currentPage') || 0) : 0,
      rating:      status === 'finished' ? (parseInt(formData.get('rating')) || null) : null,
      dateStarted: status !== 'wishlist' ? new Date().toISOString() : null,
      dateFinished: status === 'finished' ? new Date().toISOString() : null,
      tags,
    });

    _logActivity('book_added', book, { status }, book.source || 'api');

    closeAddModal();
    Utils.toast(`"${book.title}" added to your library`, 'success');
    Navigation.updateBadges();
    Navigation.renderCurrentPage();
  }

  function closeAddModal() {
    const modal = document.getElementById('addBookModal');
    Utils.hide(modal);
  }


  function updateProgress(bookId, currentPage) {
    const book = Storage.getBookById(bookId);
    if (!book) return;

    const updates = { currentPage };

    if (book.pageCount && currentPage >= book.pageCount) {
      updates.status = LIBRIQ.STATUS.FINISHED;
      updates.dateFinished = new Date().toISOString();
      Utils.toast(`🎉 Congratulations! You finished "${book.title}"`, 'success');
    }

    Storage.updateBook(bookId, updates);
    Storage.updateStreak();
    const updated = Storage.getBookById(bookId);
    _logActivity(
      updates.status === LIBRIQ.STATUS.FINISHED ? 'book_finished' : 'progress_updated',
      updated,
      { currentPage, pageCount: updated?.pageCount || 0 },
      updated?.source || 'system'
    );
    Navigation.updateBadges();
    return updated;
  }


  function setStatus(bookId, newStatus) {
    const updates = { status: newStatus };

    if (newStatus === LIBRIQ.STATUS.READING) {
      updates.dateStarted = updates.dateStarted || new Date().toISOString();
    }
    if (newStatus === LIBRIQ.STATUS.FINISHED) {
      updates.dateFinished = new Date().toISOString();
      updates.currentPage  = Storage.getBookById(bookId)?.pageCount || 0;
      Storage.updateStreak();
    }

    const book = Storage.updateBook(bookId, updates);
    _logActivity('status_changed', book, { status: newStatus }, book?.source || 'system');
    if (newStatus === LIBRIQ.STATUS.FINISHED) {
      _logActivity('book_finished', book, { status: newStatus }, book?.source || 'system');
    }
    Utils.toast(`Moved to "${Utils.statusLabel(newStatus)}"`, 'success');
    Navigation.updateBadges();
    return book;
  }


  function setRating(bookId, rating) {
    const current = Storage.getBookById(bookId);
    if (!current) return;
    const newRating = current.rating === rating ? null : rating;
    Storage.updateBook(bookId, { rating: newRating });
    _logActivity('rating_updated', Storage.getBookById(bookId), { rating: newRating }, current.source || 'system');
    Utils.toast(newRating ? `Rated ${newRating} ★` : 'Rating cleared', 'info');
    const detailsModal = document.getElementById('bookDetailsModal');
    if (detailsModal && !detailsModal.hasAttribute('hidden')) {
      Library.showDetailsModal(bookId);
      return;
    }
    if (Navigation.currentPage === 'library' || Navigation.currentPage === 'finished') {
      Navigation.renderCurrentPage();
    }
  }

  function buildManualForm(book = {}) {
    const selectedStatus = book.status || LIBRIQ.STATUS.WISHLIST;
    const selectedGenres = Array.isArray(book.genres) ? book.genres.join(', ') : '';
    const selectedShelves = Array.isArray(book.tags) ? book.tags.join(', ') : '';

    return `
      <div class="book-details-notes">
        <h3 class="book-details-section-title">Manual Entry</h3>
        <p class="text-sm text-tertiary manual-entry-copy">
          Add a book by hand when it is missing from Open Library or Google Books.
        </p>
      </div>

      <form id="addBookForm" class="add-book-form">
        <div class="form-group">
          <label class="form-label" for="manualTitleInput">Title <span class="form-required">*</span></label>
          <input type="text" id="manualTitleInput" name="title" class="form-input" value="${Utils.sanitize(book.title || '')}" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualAuthorInput">Author <span class="form-required">*</span></label>
          <input type="text" id="manualAuthorInput" name="author" class="form-input" value="${Utils.sanitize(book.author || '')}" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualCoverInput">Cover image URL <span class="text-tertiary">(optional)</span></label>
          <input type="url" id="manualCoverInput" name="coverUrl" class="form-input" value="${Utils.sanitize(book.coverUrl || '')}" placeholder="https://..." />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualPageCountInput">Page count <span class="text-tertiary">(optional)</span></label>
          <input type="number" id="manualPageCountInput" name="pageCount" class="form-input" value="${book.pageCount || ''}" min="1" step="1" />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualGenreInput">Genre/category <span class="text-tertiary">(optional)</span></label>
          <input type="text" id="manualGenreInput" name="genres" class="form-input" value="${Utils.sanitize(selectedGenres)}" placeholder="e.g. Fantasy, Memoir" />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualDescriptionInput">Description/synopsis <span class="text-tertiary">(optional)</span></label>
          <textarea id="manualDescriptionInput" name="description" class="form-input" rows="4" placeholder="Short description or synopsis...">${Utils.sanitize(book.description || '')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label" for="manualYearInput">Published year <span class="text-tertiary">(optional)</span></label>
          <input type="number" id="manualYearInput" name="publishYear" class="form-input" value="${book.publishYear || ''}" min="0" step="1" />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualPublisherInput">Publisher <span class="text-tertiary">(optional)</span></label>
          <input type="text" id="manualPublisherInput" name="publisher" class="form-input" value="${Utils.sanitize(book.publisher || '')}" />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualLanguageInput">Language <span class="text-tertiary">(optional)</span></label>
          <input type="text" id="manualLanguageInput" name="language" class="form-input" value="${Utils.sanitize(book.language || '')}" placeholder="English" />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualTagsInput">Shelves <span class="text-tertiary">(optional)</span></label>
          <input type="text" id="manualTagsInput" name="tags" class="form-input" value="${Utils.sanitize(selectedShelves)}" placeholder="e.g. Classics, Philosophy, Books to reread" />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualStatusInput">Reading status</label>
          <select id="manualStatusInput" name="status" class="form-input">
            <option value="${LIBRIQ.STATUS.WISHLIST}" ${selectedStatus === LIBRIQ.STATUS.WISHLIST ? 'selected' : ''}>Want to Read</option>
            <option value="${LIBRIQ.STATUS.READING}" ${selectedStatus === LIBRIQ.STATUS.READING ? 'selected' : ''}>Reading</option>
            <option value="${LIBRIQ.STATUS.FINISHED}" ${selectedStatus === LIBRIQ.STATUS.FINISHED ? 'selected' : ''}>Finished</option>
            <option value="${LIBRIQ.STATUS.DNF}" ${selectedStatus === LIBRIQ.STATUS.DNF ? 'selected' : ''}>Did Not Finish</option>
          </select>
        </div>

        <div class="form-group" id="manualCurrentPageGroup" ${selectedStatus === LIBRIQ.STATUS.READING ? '' : 'hidden'}>
          <label class="form-label" for="manualCurrentPageInput">Current page <span class="text-tertiary">(optional)</span></label>
          <input type="number" id="manualCurrentPageInput" name="currentPage" class="form-input" value="${book.currentPage || 0}" min="0" step="1" />
        </div>

        <div class="form-group" id="manualRatingGroup" ${selectedStatus === LIBRIQ.STATUS.FINISHED ? '' : 'hidden'}>
          <label class="form-label">Your rating</label>
          <div class="star-rating star-lg" id="manualBookStars">
            ${[1,2,3,4,5].map(n =>
              `<button class="star" type="button" data-action="set-manual-rating" data-rating="${n}" aria-label="Rate ${n} out of 5">★</button>`
            ).join('')}
          </div>
          <input type="hidden" name="rating" id="manualRatingInput" value="${book.rating || ''}">
        </div>

        <div class="modal-footer modal-footer--embedded">
          <button type="button" class="btn btn-ghost" data-action="close-add-dialog">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="ph ph-plus"></i>
            Save Manual Book
          </button>
        </div>
      </form>`;
  }


  function toggleFavorite(bookId) {
    const book = Storage.toggleFavorite(bookId);
    const msg = book?.isFavorite ? 'Added to favorites ❤️' : 'Removed from favorites';
    _logActivity(book?.isFavorite ? 'favorite_added' : 'favorite_removed', book, {}, book?.source || 'system');
    Utils.toast(msg, book?.isFavorite ? 'success' : 'info');
    return book;
  }


  function removeBook(bookId, title) {
    if (!confirm(`Remove "${title}" from your library?`)) return;
    Storage.removeBook(bookId);
    Utils.toast(`"${title}" removed`, 'info');
    Navigation.updateBadges();
    Navigation.renderCurrentPage();
  }

  function submitManualBook(form) {
    const formData = new FormData(form);
    const title = (formData.get('title') || '').trim();
    const author = (formData.get('author') || '').trim();
    if (!title || !author) {
      Utils.toast('Title and author are required', 'error');
      return;
    }

    const rawPageCount = (formData.get('pageCount') || '').toString().trim();
    const rawCurrentPage = (formData.get('currentPage') || '').toString().trim();
    const pageCount = rawPageCount ? parseInt(rawPageCount, 10) : 0;
    const currentPage = rawCurrentPage ? parseInt(rawCurrentPage, 10) : 0;
    if (rawPageCount && (!Number.isInteger(pageCount) || pageCount < 1)) {
      Utils.toast('Page count must be a positive number', 'error');
      return;
    }
    if (rawCurrentPage && (!Number.isInteger(currentPage) || currentPage < 0)) {
      Utils.toast('Current page must be zero or greater', 'error');
      return;
    }
    if (pageCount && currentPage > pageCount) {
      Utils.toast('Current page cannot exceed page count', 'error');
      return;
    }

    const genres = (formData.get('genres') || '')
      .split(',')
      .map(g => g.trim())
      .filter(Boolean);
    const status = formData.get('status') || LIBRIQ.STATUS.WISHLIST;
    const ratingValue = parseInt(formData.get('rating'), 10);
    const rating = Number.isInteger(ratingValue) && ratingValue > 0 ? ratingValue : null;
    const dateAdded = new Date().toISOString();

    const book = Storage.addBook({
      id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      source: 'manual',
      title,
      author,
      coverUrl: (formData.get('coverUrl') || '').trim() || null,
      pageCount,
      publishYear: parseInt(formData.get('publishYear'), 10) || null,
      publisher: (formData.get('publisher') || '').trim() || null,
      description: (formData.get('description') || '').trim() || null,
      genres,
      language: (formData.get('language') || '').trim() || 'English',
      status,
      currentPage: status === LIBRIQ.STATUS.READING ? currentPage : 0,
      rating: status === LIBRIQ.STATUS.FINISHED ? rating : null,
      isFavorite: false,
      notes: '',
      notesUpdatedAt: null,
      dateAdded,
      dateStarted: status !== LIBRIQ.STATUS.WISHLIST ? dateAdded : null,
      dateFinished: status === LIBRIQ.STATUS.FINISHED ? dateAdded : null,
      tags: _parseShelfInput(formData.get('tags')),
    });

    _logActivity('manual_book_added', book, { status, rating: book.rating || null }, 'manual');

    closeAddModal();
    Utils.toast(`"${book.title}" added to your library`, 'success');
    Navigation.updateBadges();
    Navigation.renderCurrentPage();
  }

  async function refreshMetadata(bookId) {
    const current = Storage.getBookById(bookId);
    if (!current) return { status: 'error' };

    let candidate = await _fetchMetadataCandidate(current);
    if (!candidate) return { status: 'no-new' };
    if (candidate?.source === 'openlibrary') {
      candidate = await BookAPI.enrichBook(candidate);
    }
    candidate = await BookAPI.enrichBookLinks({ ...current, ...candidate });

    const updates = _buildMetadataUpdates(current, candidate);
    if (Object.keys(updates).length === 0) return { status: 'no-new' };

    Storage.updateBook(bookId, updates);
    const updated = Storage.getBookById(bookId);
    _logActivity('metadata_refreshed', updated, { status: 'updated' }, updated?.source || 'system');
    return { status: 'updated' };
  }

  const bookDetailsFeature = createBookDetailsPage({
    storage: Storage,
    utils: Utils,
    constants: LIBRIQ,
    bookApi: BookAPI,
    createId: () => crypto.randomUUID(),
    actions: {
      logActivity: (...args) => _logActivity(...args),
      getMetadataQuality: book => _getMetadataQuality(book),
      parseShelfInput: value => _parseShelfInput(value),
      showProgressModal: bookId => showProgressModal(bookId),
      setStatus: (bookId, status) => setStatus(bookId, status),
      setRating: (bookId, rating) => setRating(bookId, rating),
      refreshMetadata: bookId => refreshMetadata(bookId),
      toggleFavorite: bookId => toggleFavorite(bookId),
      updateBadges: () => globalThis.Navigation?.updateBadges?.(),
      renderCurrentPage: () => globalThis.Navigation?.renderCurrentPage?.(),
    },
  });

  function showDetailsModal(bookId) {
    return bookDetailsFeature.render(bookId);
  }

  function closeDetailsModal() {
    return bookDetailsFeature.close();
  }

  function _normalizeMatchKey(book) {
    const clean = (str) => (str || '')
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const authorWord = clean(book.author).split(' ')[0] || '';
    return `${clean(book.title)}|${authorWord}`;
  }

  async function _fetchMetadataCandidate(book) {
    try {
      if (book.isbn) {
        return await BookAPI.lookupISBN(book.isbn);
      }

      const query = `${book.title} ${book.author}`.trim();
      const results = await BookAPI.searchBooks(query);
      const targetKey = _normalizeMatchKey(book);
      return results.find(result => _normalizeMatchKey(result) === targetKey) || null;
    } catch (err) {
      console.warn('[Libriq] Metadata refresh failed:', err);
      return null;
    }
  }

  function _buildMetadataUpdates(current, candidate) {
    const updates = {};
    const fields = ['pageCount', 'publisher', 'publishYear', 'coverUrl', 'genres', 'language', 'isbn', 'googleBooksId', 'openLibraryId', 'gutendexId', 'gutenbergId', 'internetArchiveId', 'internetArchiveIds', 'archiveUrl', 'readableSourceLinks'];

    fields.forEach((field) => {
      const currentValue = current[field];
      const candidateValue = candidate[field];
      const currentMissing =
        currentValue === null ||
        currentValue === undefined ||
        currentValue === '' ||
        (field === 'pageCount' && currentValue <= 0) ||
        (field === 'genres' && (!Array.isArray(currentValue) || currentValue.length === 0));
      const candidateValid =
        candidateValue !== null &&
        candidateValue !== undefined &&
        candidateValue !== '' &&
        (field !== 'pageCount' || candidateValue > 0) &&
        (field !== 'genres' || (Array.isArray(candidateValue) && candidateValue.length > 0));

      if (currentMissing && candidateValid) {
        updates[field] = candidateValue;
      }
    });

    const helper = BookAPI;
    const currentDescriptionUseful = helper.isUsefulDescription(current.description);
    const bestDescription = currentDescriptionUseful
      ? helper.normalizeDescriptionText(current.description)
      : helper.chooseBestDescription([
          { text: candidate.description, source: candidate.source || 'candidate', language: candidate.language, full: true },
          { text: candidate.shortDescription, source: candidate.source || 'candidate-snippet', language: candidate.language, snippet: true },
          { text: current.description, source: current.source || 'saved', language: current.language, full: true },
        ]);
    if (!currentDescriptionUseful && bestDescription && bestDescription !== helper.normalizeDescriptionText(current.description)) {
      updates.description = bestDescription;
    }

    const bestShortDescription = helper.chooseBestDescription([
      { text: current.shortDescription, source: current.source || 'saved-snippet', language: current.language, snippet: true },
      { text: candidate.shortDescription, source: candidate.source || 'candidate-snippet', language: candidate.language, snippet: true },
      { text: bestDescription || candidate.description, source: candidate.source || 'candidate', language: candidate.language, full: true },
    ], { preferShort: true });
    if (bestShortDescription && bestShortDescription !== helper?.normalizeDescriptionText?.(current.shortDescription)) {
      updates.shortDescription = bestShortDescription;
    }

    return updates;
  }

  function renderBookCard(book) {
    const pct     = Utils.readingProgress(book.currentPage, book.pageCount);
    const isReading = book.status === LIBRIQ.STATUS.READING;
    const isFinished = book.status === LIBRIQ.STATUS.FINISHED;

    const card = document.createElement('div');
    card.className = `book-card ${isFinished ? 'book-card--finished' : ''} ${isReading ? 'book-card--reading' : ''}`.trim();
    card.dataset.bookId = book.id;

    const genreBadges = (book.genres || []).slice(0, 2)
      .map(g => `<span class="badge badge-genre">${Utils.sanitize(g)}</span>`)
      .join('');
    const metadataQuality = _getMetadataQuality(book);

    card.innerHTML = `
      ${Utils.buildCover(book, 'cover-md')}
      <div class="book-card-info">
        <div class="book-card-title">${Utils.sanitize(book.title)}</div>
        <div class="book-card-author">${Utils.sanitize(book.author)}</div>
        <div class="book-card-meta">
          <span class="badge ${Utils.statusBadgeClass(book.status)}">
            ${Utils.statusLabel(book.status)}
          </span>
          <span class="badge badge-metadata badge-metadata-${metadataQuality.className}">${metadataQuality.label}</span>
          ${book.rating ? Utils.buildStars(book.rating) : ''}
          ${genreBadges}
        </div>

        ${isReading ? `
          <div class="reading-progress">
            <div class="progress-label">
              <span class="progress-text">Page ${book.currentPage} of ${book.pageCount || '?'}</span>
              <span class="progress-pct">${pct}%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
          </div>` : isFinished ? `
          <div class="book-card-complete">
            <i class="ph ph-check-circle"></i>
            Finished and ready for the next shelf.
          </div>` : ''}

        <div class="book-card-actions">
          <div class="book-card-actions-primary"></div>
          <div class="book-card-actions-secondary"></div>
        </div>
      </div>`;

    const primaryActions = card.querySelector('.book-card-actions-primary');
    const secondaryActions = card.querySelector('.book-card-actions-secondary');

    if (isReading) {
      const updateBtn = document.createElement('button');
      updateBtn.className = 'btn btn-primary btn-sm';
      updateBtn.innerHTML = '<i class="ph ph-pencil"></i> Update';
      updateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Library.showProgressModal(book.id);
      });
      primaryActions.appendChild(updateBtn);
    }

    if (book.status !== LIBRIQ.STATUS.FINISHED) {
      const finishBtn = document.createElement('button');
      finishBtn.className = 'btn btn-secondary btn-sm book-card-primary-action';
      finishBtn.innerHTML = `<i class="ph ph-check"></i> ${
        isReading ? 'Finish' : 'Start Reading'
      }`;
      finishBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isReading) {
          Library.setStatus(book.id, LIBRIQ.STATUS.FINISHED);
        } else {
          Library.setStatus(book.id, LIBRIQ.STATUS.READING);
        }
        Navigation.renderCurrentPage();
      });
      primaryActions.appendChild(finishBtn);
    }

    const favBtn = document.createElement('button');
    favBtn.className = 'btn btn-ghost btn-sm btn-icon';
    favBtn.title = book.isFavorite ? 'Unfavorite' : 'Favorite';
    favBtn.innerHTML = `<i class="${book.isFavorite ? 'ph-fill ph-heart' : 'ph ph-heart'}"></i>`;
    favBtn.addEventListener('click', (e) => {
  e.stopPropagation();

  Library.toggleFavorite(book.id);

  Navigation.updateBadges();
  Navigation.renderCurrentPage();
});
    secondaryActions.appendChild(favBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost btn-sm btn-icon';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = '<i class="ph ph-trash"></i>';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Library.removeBook(book.id, book.title);
    });
    secondaryActions.appendChild(removeBtn);

    card.addEventListener('click', (e) => {
      if (!e.target.closest('.book-card-actions')) {
        Library.showDetailsModal(book.id);
      }
    });

    return card;
  }

  function showProgressModal(bookId) {
    const book = Storage.getBookById(bookId);
    if (!book) return;

    const modal  = document.getElementById('addBookModal');
    const body   = document.getElementById('addBookBody');
    const header = modal.querySelector('.modal-title');
    if (header) header.textContent = 'Update Progress';

    const pct = Utils.readingProgress(book.currentPage, book.pageCount);

    body.innerHTML = `
      <div class="book-preview">
        ${Utils.buildCover(book, 'cover-md')}
        <div class="book-preview-info">
          <div class="book-preview-title">${Utils.sanitize(book.title)}</div>
          <div class="book-preview-author">${Utils.sanitize(book.author)}</div>
          <div class="progress-summary">
            <div class="progress-bar progress-bar--spaced">
              <div class="progress-fill" style="width:${pct}%"></div>
            </div>
            <span class="text-xs text-tertiary">${pct}% complete</span>
          </div>
        </div>
      </div>

      <form id="progressForm" class="add-book-form">
        <div class="form-group">
          <label class="form-label" for="progressPageInput">
            Current page
            ${book.pageCount ? `<span class="text-tertiary">of ${book.pageCount}</span>` : ''}
          </label>
          <input
            type="number"
            id="progressPageInput"
            name="currentPage"
            class="form-input"
            value="${book.currentPage}"
            min="0"
            max="${book.pageCount || 99999}"
            autofocus
          />
        </div>

        <div class="modal-footer modal-footer--embedded">
          <button type="button" class="btn btn-ghost" data-action="close-add-dialog">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="ph ph-floppy-disk"></i> Save
          </button>
        </div>
      </form>`;

    Utils.show(modal);

    body.querySelector('#progressForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const page = parseInt(new FormData(e.target).get('currentPage'), 10);
      Library.updateProgress(bookId, page);
      closeAddModal();
      Utils.toast('Progress updated', 'success');
      Navigation.renderCurrentPage();
    });

    document.getElementById('closeAddBook').onclick = closeAddModal;
    modal.onclick = (e) => { if (e.target === modal) closeAddModal(); };
  }

  return {
    init,
    showAddModal, closeAddModal,
    updateProgress, setStatus, setRating,
    toggleFavorite, removeBook,
    renderBookCard, showProgressModal,
    showDetailsModal, closeDetailsModal,
  };
})();

if (typeof window !== 'undefined') window.Library = Library;
