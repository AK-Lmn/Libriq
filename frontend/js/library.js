/* ============================================
   LIBRIQ LIBRARY
   Book management: add, edit, remove, status
   ============================================ */

const Library = (() => {

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
        if (currentPageGroup) currentPageGroup.style.display = status === LIBRIQ.STATUS.READING ? 'flex' : 'none';
        if (ratingGroup) ratingGroup.style.display = status === LIBRIQ.STATUS.FINISHED ? 'flex' : 'none';
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

        <div class="form-group" id="pageProgressGroup" style="display:none">
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

        <div class="form-group" id="ratingGroup" style="display:none">
          <label class="form-label">Your rating</label>
          <div class="star-rating star-lg" id="addBookStars">
            ${[1,2,3,4,5].map(n =>
              `<span class="star" data-value="${n}" onclick="Library._setFormRating(${n})">★</span>`
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

        <div class="modal-footer" style="padding: 0; border: none; margin-top: var(--space-2);">
          <button type="button" class="btn btn-ghost" onclick="Library.closeAddModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="ph ph-plus"></i>
            Add to Library
          </button>
        </div>
      </form>`;
  }

  document.addEventListener('change', (e) => {
    if (!e.target.matches('input[name="status"]')) return;
    const pageGroup   = document.getElementById('pageProgressGroup');
    const ratingGroup = document.getElementById('ratingGroup');
    if (!pageGroup) return;
    pageGroup.style.display   = e.target.value === 'reading'  ? 'flex' : 'none';
    ratingGroup.style.display = e.target.value === 'finished' ? 'flex' : 'none';
  });

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
    if (event) Storage.addActivityEvent(event);
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

  // ── Update Progress ───────────────────────

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

  // ── Quick Status Change ───────────────────

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

  // ── Rating ────────────────────────────────

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
        <p class="text-sm text-tertiary" style="margin: 0;">
          Add a book by hand when it is missing from Open Library or Google Books.
        </p>
      </div>

      <form id="addBookForm" class="add-book-form">
        <div class="form-group">
          <label class="form-label" for="manualTitleInput">Title <span style="color: var(--color-danger);">*</span></label>
          <input type="text" id="manualTitleInput" name="title" class="form-input" value="${Utils.sanitize(book.title || '')}" required />
        </div>

        <div class="form-group">
          <label class="form-label" for="manualAuthorInput">Author <span style="color: var(--color-danger);">*</span></label>
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

        <div class="form-group" id="manualCurrentPageGroup" style="display:${selectedStatus === LIBRIQ.STATUS.READING ? 'flex' : 'none'}">
          <label class="form-label" for="manualCurrentPageInput">Current page <span class="text-tertiary">(optional)</span></label>
          <input type="number" id="manualCurrentPageInput" name="currentPage" class="form-input" value="${book.currentPage || 0}" min="0" step="1" />
        </div>

        <div class="form-group" id="manualRatingGroup" style="display:${selectedStatus === LIBRIQ.STATUS.FINISHED ? 'flex' : 'none'}">
          <label class="form-label">Your rating</label>
          <div class="star-rating star-lg" id="manualBookStars">
            ${[1,2,3,4,5].map(n =>
              `<span class="star" data-value="${n}" onclick="Library._setManualFormRating(${n})">★</span>`
            ).join('')}
          </div>
          <input type="hidden" name="rating" id="manualRatingInput" value="${book.rating || ''}">
        </div>

        <div class="modal-footer" style="padding: 0; border: none; margin-top: var(--space-2);">
          <button type="button" class="btn btn-ghost" onclick="Library.closeAddModal()">Cancel</button>
          <button type="submit" class="btn btn-primary">
            <i class="ph ph-plus"></i>
            Save Manual Book
          </button>
        </div>
      </form>`;
  }

  // ── Favorite ──────────────────────────────

  function toggleFavorite(bookId) {
    const book = Storage.toggleFavorite(bookId);
    const msg = book?.isFavorite ? 'Added to favorites ❤️' : 'Removed from favorites';
    _logActivity(book?.isFavorite ? 'favorite_added' : 'favorite_removed', book, {}, book?.source || 'system');
    Utils.toast(msg, book?.isFavorite ? 'success' : 'info');
    return book;
  }

  // ── Remove ────────────────────────────────

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

    const candidate = await _fetchMetadataCandidate(current);
    if (!candidate) return { status: 'no-new' };

    const updates = _buildMetadataUpdates(current, candidate);
    if (Object.keys(updates).length === 0) return { status: 'no-new' };

    Storage.updateBook(bookId, updates);
    const updated = Storage.getBookById(bookId);
    _logActivity('metadata_refreshed', updated, { status: 'updated' }, updated?.source || 'system');
    return { status: 'updated' };
  }

  function showDetailsModal(bookId) {
    const book   = Storage.getBookById(bookId);
    if (!book) return;

    const modal  = document.getElementById('bookDetailsModal');
    const body   = document.getElementById('bookDetailsBody');
    if (!modal || !body) return;

    const pct       = Utils.readingProgress(book.currentPage, book.pageCount);
    const isReading = book.status === LIBRIQ.STATUS.READING;
    const hasPages  = book.pageCount > 0;

    const description = book.description
      ? book.description.replace(/<[^>]*>/g, '')
      : null;
    const synopsis = description || 'No description available yet.';
    const notes = book.notes ?? '';
    const notesUpdatedText = book.notesUpdatedAt
      ? `Last updated ${Utils.formatDate(book.notesUpdatedAt)}`
      : '';
    const quotes = Array.isArray(book.quotes) ? book.quotes : [];

    const genreBadges = (book.genres || []).slice(0, 3)
      .map(g => `<span class="badge badge-genre">${Utils.sanitize(g)}</span>`)
      .join('');
    const shelfBadges = Array.isArray(book.tags) && book.tags.length
      ? book.tags.map(tag => `<span class="badge badge-accent">${Utils.sanitize(tag)}</span>`).join('')
      : '';
    const metadataQuality = _getMetadataQuality(book);

    body.innerHTML = `
      <div class="book-details-hero">
        ${Utils.buildCover(book, 'cover-xl')}
        <div class="book-details-hero-info">
          <h2 class="book-details-title">${Utils.sanitize(book.title)}</h2>
          <div class="book-details-author">${Utils.sanitize(book.author)}</div>

          <div class="book-details-badges">
            <span class="badge ${Utils.statusBadgeClass(book.status)}">
              ${Utils.statusLabel(book.status)}
            </span>
            <span class="badge badge-metadata badge-metadata-${metadataQuality.className}">${metadataQuality.label}</span>
            ${genreBadges}
          </div>

          ${shelfBadges ? `
          <div class="book-details-shelves">
            <div class="book-details-section-title">Shelves</div>
            <div class="book-details-shelf-list">${shelfBadges}</div>
          </div>` : ''}

          <div class="book-details-rating-panel">
            <h3 class="book-details-section-title">Your rating</h3>
            <div class="book-details-rating">
              ${Utils.buildStars(book.rating ?? 0, true, book.id)}
              <span class="book-details-rating-text">${book.rating ? `${book.rating}/5` : 'Not rated'}</span>
            </div>
          </div>

          <dl class="book-details-meta">
            ${book.publishYear ? `<div class="book-details-meta-row">
              <dt>Published</dt><dd>${book.publishYear}</dd>
            </div>` : ''}
            ${book.publisher ? `<div class="book-details-meta-row">
              <dt>Publisher</dt><dd>${Utils.sanitize(book.publisher)}</dd>
            </div>` : ''}
            ${book.language ? `<div class="book-details-meta-row">
              <dt>Language</dt><dd>${Utils.sanitize(book.language)}</dd>
            </div>` : ''}
            ${hasPages ? `<div class="book-details-meta-row">
              <dt>Pages</dt><dd>${book.pageCount.toLocaleString()}</dd>
            </div>` : ''}
            ${book.dateStarted ? `<div class="book-details-meta-row">
              <dt>Started</dt><dd>${Utils.formatDate(book.dateStarted)}</dd>
            </div>` : ''}
            ${book.dateFinished ? `<div class="book-details-meta-row">
              <dt>Finished</dt><dd>${Utils.formatDate(book.dateFinished)}</dd>
            </div>` : ''}
          </dl>
        </div>
      </div>

      ${(isReading && hasPages) ? `
        <div class="book-details-progress">
          <div class="book-details-progress-header">
            <span class="book-details-progress-label">Reading Progress</span>
            <span class="book-details-progress-pct">${pct}% Complete</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="book-details-progress-pages">
            Page ${book.currentPage.toLocaleString()} of ${book.pageCount.toLocaleString()}
          </div>
        </div>` : ''}

      <div class="book-details-description ${description ? '' : 'book-details-description--empty'}">
        <h3 class="book-details-section-title">About this book</h3>
        <p class="book-details-desc-text">${Utils.sanitize(synopsis)}</p>
      </div>

      <div class="book-details-notes" id="bookShelvesSection">
        <h3 class="book-details-section-title">Shelves</h3>
        <label class="book-details-notes-label" for="bookShelvesInput">Organize this book</label>
        <input
          id="bookShelvesInput"
          class="form-input"
          type="text"
          value="${Utils.sanitize(Array.isArray(book.tags) ? book.tags.join(', ') : '')}"
          placeholder="e.g. Classics, Philosophy, Books to reread"
        />
        <div class="book-details-notes-actions">
          <button type="button" class="btn btn-primary" id="saveBookShelvesBtn">
            <i class="ph ph-floppy-disk"></i>
            Save Shelves
          </button>
        </div>
      </div>

      <div class="book-details-notes" data-book-id="${book.id}">
        <h3 class="book-details-section-title">Private Notes</h3>
        <label class="book-details-notes-label" for="bookNotesTextarea">My Thoughts</label>
        <textarea
          id="bookNotesTextarea"
          class="book-details-notes-textarea"
          rows="6"
          placeholder="Write your private thoughts about this book..."
        >${Utils.sanitize(notes)}</textarea>
        <div class="book-details-notes-meta" id="bookNotesMeta"${notesUpdatedText ? '' : ' hidden'}>${Utils.sanitize(notesUpdatedText)}</div>
        <div class="book-details-notes-actions">
          <button type="button" class="btn btn-primary" id="saveBookNoteBtn">
            <i class="ph ph-floppy-disk"></i>
            Save Note
          </button>
          <button type="button" class="btn btn-ghost" id="clearBookNoteBtn">
            <i class="ph ph-eraser"></i>
            Clear Note
          </button>
        </div>
      </div>

      <div class="book-details-notes" data-book-id="${book.id}" id="bookQuotesSection">
        <h3 class="book-details-section-title">Private Quotes</h3>
        <div class="book-details-notes-label">Save favorite lines from this book</div>
        <textarea
          id="bookQuoteTextInput"
          class="book-details-notes-textarea"
          rows="4"
          placeholder="Paste a quote you want to keep..."
        ></textarea>
        <div style="display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); margin-top: var(--space-3);">
          <input id="bookQuotePageInput" class="form-input" type="number" min="1" placeholder="Page (optional)" />
          <input id="bookQuoteNoteInput" class="form-input" type="text" placeholder="Thought or context (optional)" />
        </div>
        <div class="book-details-notes-actions">
          <button type="button" class="btn btn-primary" id="saveBookQuoteBtn">
            <i class="ph ph-floppy-disk"></i>
            Save Quote
          </button>
        </div>
        <div id="bookQuotesList" style="margin-top: var(--space-3); display: grid; gap: var(--space-3);"></div>
      </div>

      `;

    Utils.show(modal);
    document.body.style.overflow = 'hidden';

    let actions = modal.querySelector('#bookDetailsFooter');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'modal-footer book-details-footer';
      actions.id = 'bookDetailsFooter';
      modal.querySelector('.book-details-modal')?.appendChild(actions);
    }
    actions.replaceChildren();
    const notesTextarea = body.querySelector('#bookNotesTextarea');
    const notesMeta = body.querySelector('#bookNotesMeta');
    const saveNoteBtn = body.querySelector('#saveBookNoteBtn');
    const clearNoteBtn = body.querySelector('#clearBookNoteBtn');
    const quoteTextInput = body.querySelector('#bookQuoteTextInput');
    const quotePageInput = body.querySelector('#bookQuotePageInput');
    const quoteNoteInput = body.querySelector('#bookQuoteNoteInput');
    const saveQuoteBtn = body.querySelector('#saveBookQuoteBtn');
    const quotesList = body.querySelector('#bookQuotesList');
    const shelvesInput = body.querySelector('#bookShelvesInput');
    const saveShelvesBtn = body.querySelector('#saveBookShelvesBtn');
    let editingQuoteId = null;

    function syncNotesMeta(updatedAt) {
      if (!notesMeta) return;
      if (!updatedAt) {
        notesMeta.textContent = '';
        notesMeta.hidden = true;
        return;
      }
      notesMeta.textContent = `Last updated ${Utils.formatDate(updatedAt)}`;
      notesMeta.hidden = false;
    }

    function saveNotes(nextNotes) {
      const updatedAt = new Date().toISOString();
      const updated = Storage.updateBook(book.id, {
        notes: nextNotes,
        notesUpdatedAt: updatedAt,
      });
      syncNotesMeta(updated?.notesUpdatedAt || updatedAt);
      _logActivity(nextNotes ? 'note_saved' : 'note_cleared', updated, nextNotes ? { length: nextNotes.length } : {}, updated?.source || 'system');
      return updated;
    }

    function normalizeQuotes(list) {
      return (Array.isArray(list) ? list : []).map(quote => ({
        id: quote.id || crypto.randomUUID(),
        text: String(quote.text || ''),
        page: quote.page ?? null,
        note: quote.note ?? '',
        createdAt: quote.createdAt || new Date().toISOString(),
        updatedAt: quote.updatedAt || quote.createdAt || new Date().toISOString(),
      }));
    }

    function renderQuotes() {
      if (!quotesList) return;
      const safeQuotes = normalizeQuotes(Storage.getBookById(book.id)?.quotes || book.quotes || []);
      if (!safeQuotes.length) {
        quotesList.innerHTML = `<div class="empty-state" style="margin: 0; padding: var(--space-3);"><div class="empty-state-body" style="margin:0;">No private quotes yet.</div></div>`;
        return;
      }

      quotesList.innerHTML = safeQuotes.map(quote => `
        <div class="activity-item" style="align-items:flex-start; padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--bg-elevated);">
          <div class="activity-text" style="gap: var(--space-1);">
            <div class="activity-title" style="white-space: pre-wrap;">${Utils.sanitize(quote.text)}</div>
            ${quote.page || quote.note ? `<div class="activity-subtitle">${[
              quote.page ? `p. ${Utils.sanitize(String(quote.page))}` : '',
              quote.note ? Utils.sanitize(quote.note) : '',
            ].filter(Boolean).join(' · ')}</div>` : ''}
          </div>
          <div class="activity-time" style="display:flex; gap: var(--space-2); flex-wrap: wrap; justify-content:flex-end;">
            <button type="button" class="btn btn-ghost btn-sm" data-quote-action="edit" data-quote-id="${quote.id}">Edit</button>
            <button type="button" class="btn btn-ghost btn-sm" data-quote-action="delete" data-quote-id="${quote.id}">Delete</button>
          </div>
        </div>
      `).join('');
    }

    function persistQuotes(nextQuotes, eventType, payload = {}) {
      const updated = Storage.updateBook(book.id, {
        quotes: nextQuotes,
      });
      renderQuotes();
      _logActivity(eventType, updated, payload, updated?.source || 'system');
      return updated;
    }

    function validateQuoteInput(text, pageValue) {
      const quoteText = String(text || '').trim();
      if (!quoteText) return 'Quote text is required.';

      if (pageValue) {
        const page = parseInt(pageValue, 10);
        if (!Number.isInteger(page) || page <= 0) return 'Page number must be a positive number.';
        if (book.pageCount && page > book.pageCount) return `Page number cannot exceed ${book.pageCount}.`;
      }

      return null;
    }

    function saveQuote(quoteId = editingQuoteId) {
      const text = quoteTextInput?.value || '';
      const pageValue = quotePageInput?.value || '';
      const noteValue = quoteNoteInput?.value || '';
      const validationError = validateQuoteInput(text, pageValue);
      if (validationError) {
        Utils.toast(validationError, 'error');
        return null;
      }

      const currentQuotes = normalizeQuotes(Storage.getBookById(book.id)?.quotes || []);
      const now = new Date().toISOString();
      const page = pageValue ? parseInt(pageValue, 10) : null;

      let nextQuotes;
      let eventType;
      let eventPayload = page ? { page } : {};

      if (quoteId) {
        nextQuotes = currentQuotes.map(quote => quote.id === quoteId ? {
          ...quote,
          text: text.trim(),
          page,
          note: noteValue.trim(),
          updatedAt: now,
        } : quote);
        eventType = 'quote_updated';
        eventPayload = { ...eventPayload, quoteCount: nextQuotes.length };
      } else {
        nextQuotes = [
          {
            id: crypto.randomUUID(),
            text: text.trim(),
            page,
            note: noteValue.trim(),
            createdAt: now,
            updatedAt: now,
          },
          ...currentQuotes,
        ];
        eventType = 'quote_saved';
        eventPayload = { ...eventPayload, quoteCount: nextQuotes.length };
      }

      const updated = persistQuotes(nextQuotes, eventType, eventPayload);
      if (updated) {
        quoteTextInput.value = '';
        if (quotePageInput) quotePageInput.value = '';
        if (quoteNoteInput) quoteNoteInput.value = '';
        editingQuoteId = null;
        if (saveQuoteBtn) saveQuoteBtn.textContent = 'Save Quote';
        Utils.toast(quoteId ? 'Quote updated' : 'Quote saved', 'success');
      }
      return updated;
    }

    function deleteQuote(quoteId) {
      const currentQuotes = normalizeQuotes(Storage.getBookById(book.id)?.quotes || []);
      const nextQuotes = currentQuotes.filter(quote => quote.id !== quoteId);
      const updated = persistQuotes(nextQuotes, 'quote_deleted', { quoteCount: nextQuotes.length });
      if (updated) Utils.toast('Quote deleted', 'info');
      return updated;
    }

    renderQuotes();

    function saveShelves(nextShelves) {
      const updated = Storage.updateBook(book.id, { tags: _parseShelfInput(nextShelves) });
      const refreshed = updated || Storage.getBookById(book.id);
      if (document.getElementById('bookDetailsModal')?.hasAttribute('hidden')) return refreshed;
      Library.showDetailsModal(book.id);
      return refreshed;
    }

    if (saveNoteBtn && notesTextarea) {
      saveNoteBtn.addEventListener('click', () => {
        saveNotes(notesTextarea.value.trimEnd());
        Utils.toast('Note saved', 'success');
      });
    }

    if (clearNoteBtn && notesTextarea) {
      clearNoteBtn.addEventListener('click', () => {
        notesTextarea.value = '';
        saveNotes('');
        Utils.toast('Note cleared', 'info');
      });
    }

    if (saveShelvesBtn && shelvesInput) {
      saveShelvesBtn.addEventListener('click', () => {
        saveShelves(shelvesInput.value);
        Utils.toast('Shelves saved', 'success');
      });
    }

    if (saveQuoteBtn) {
      saveQuoteBtn.addEventListener('click', () => saveQuote());
    }

    quotesList?.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-quote-action]');
      if (!btn) return;
      const quoteId = btn.dataset.quoteId;
      const action = btn.dataset.quoteAction;
      const currentQuote = normalizeQuotes(Storage.getBookById(book.id)?.quotes || []).find(q => q.id === quoteId);
      if (!currentQuote) return;

      if (action === 'delete') {
        if (!confirm('Delete this private quote?')) return;
        deleteQuote(quoteId);
        return;
      }

      if (action === 'edit') {
        editingQuoteId = quoteId;
        if (quoteTextInput) quoteTextInput.value = currentQuote.text || '';
        if (quotePageInput) quotePageInput.value = currentQuote.page ?? '';
        if (quoteNoteInput) quoteNoteInput.value = currentQuote.note || '';
        if (saveQuoteBtn) saveQuoteBtn.textContent = 'Update Quote';
        quoteTextInput?.focus();
        return;
      }
    });

    if (isReading) {
      const updateBtn = document.createElement('button');
      updateBtn.className = 'btn btn-primary';
      updateBtn.innerHTML = '<i class="ph ph-pencil"></i> Update Progress';
      updateBtn.addEventListener('click', () => {
        closeDetailsModal();
        Library.showProgressModal(book.id);
      });
      actions.appendChild(updateBtn);
    }

    if (book.status !== LIBRIQ.STATUS.FINISHED) {
      const finishBtn = document.createElement('button');
      finishBtn.className = 'btn btn-secondary';
      finishBtn.innerHTML = '<i class="ph ph-check"></i> Mark Finished';
      finishBtn.addEventListener('click', () => {
        Library.setStatus(book.id, LIBRIQ.STATUS.FINISHED);
        closeDetailsModal();
        Navigation.renderCurrentPage();
      });
      actions.appendChild(finishBtn);
    }

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn-secondary';
    refreshBtn.innerHTML = '<i class="ph ph-arrow-clockwise"></i> Refresh metadata';
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      try {
        const result = await Library.refreshMetadata(book.id);
        if (result.status === 'updated') {
          Utils.toast('Metadata updated', 'success');
          Navigation.updateBadges();
          Navigation.renderCurrentPage();
          if (!document.getElementById('bookDetailsModal')?.hasAttribute('hidden')) {
            Library.showDetailsModal(book.id);
          }
          return;
        }

        if (result.status === 'no-new') {
          Utils.toast('No new metadata found', 'info');
        } else {
          Utils.toast("Couldn't refresh metadata", 'error');
        }
      } finally {
        refreshBtn.disabled = false;
      }
    });
    actions.appendChild(refreshBtn);

    const favBtn = document.createElement('button');
    favBtn.className = 'btn btn-ghost btn-icon';
    favBtn.title = book.isFavorite ? 'Remove from favorites' : 'Add to favorites';
    const favIcon = document.createElement('i');
    favIcon.className = book.isFavorite ? 'ph-fill ph-heart' : 'ph ph-heart';
    if (book.isFavorite) favIcon.style.color = 'var(--color-danger)';
    favBtn.appendChild(favIcon);
    favBtn.addEventListener('click', () => {
    const updated = Library.toggleFavorite(book.id);

    favIcon.className = updated?.isFavorite ? 'ph-fill ph-heart' : 'ph ph-heart';
    favIcon.style.color = updated?.isFavorite ? 'var(--color-danger)' : '';
    favBtn.title = updated?.isFavorite ? 'Remove from favorites' : 'Add to favorites';

    Navigation.updateBadges();
    Navigation.renderCurrentPage();
});
    actions.appendChild(favBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost';
    removeBtn.innerHTML = '<i class="ph ph-trash"></i> Remove';
    removeBtn.addEventListener('click', () => {
      if (!confirm(`Remove "${book.title}" from your library?`)) return;
      closeDetailsModal();
      Storage.removeBook(book.id);
      Utils.toast(`"${book.title}" removed`, 'info');
      Navigation.updateBadges();
      Navigation.renderCurrentPage();
    });
    actions.appendChild(removeBtn);

    modal.querySelector('.modal-close').onclick = closeDetailsModal;
    modal.onclick = (e) => { if (e.target === modal) closeDetailsModal(); };
  }

  function closeDetailsModal() {
    const modal = document.getElementById('bookDetailsModal');
    Utils.hide(modal);
    document.body.style.overflow = '';
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
    const fields = ['description', 'pageCount', 'publisher', 'publishYear', 'coverUrl', 'genres', 'language', 'isbn', 'googleBooksId', 'openLibraryId'];

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
    favBtn.innerHTML = `<i class="${book.isFavorite ? 'ph-fill ph-heart' : 'ph ph-heart'}"
      style="color:${book.isFavorite ? 'var(--color-danger)' : ''}"></i>`;
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
          <div style="margin-top: var(--space-2);">
            <div class="progress-bar" style="margin-bottom: var(--space-1);">
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

        <div class="modal-footer" style="padding: 0; border: none; margin-top: var(--space-2);">
          <button type="button" class="btn btn-ghost" onclick="Library.closeAddModal()">Cancel</button>
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
    showAddModal, closeAddModal,
    updateProgress, setStatus, setRating,
    toggleFavorite, removeBook,
    renderBookCard, showProgressModal,
    showDetailsModal, closeDetailsModal, refreshMetadata,
    _setFormRating, _setManualFormRating,
  };
})();

window.Library = Library;
