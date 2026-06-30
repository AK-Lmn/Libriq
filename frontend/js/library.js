/* ============================================
   LIBRIQ LIBRARY
   Book management: add, edit, remove, status
   ============================================ */

const Library = (() => {

  // ── Add Book Modal ────────────────────────

  function showAddModal(bookData) {
    const modal    = document.getElementById('addBookModal');
    const body     = document.getElementById('addBookBody');
    const closeBtn = document.getElementById('closeAddBook');
    const header   = modal.querySelector('.modal-title');

    // Always reset — showProgressModal changes this to 'Update Progress'
    if (header) header.textContent = 'Add to Library';

    body.innerHTML = buildAddForm(bookData);
    Utils.show(modal);

    // Status selection
    body.querySelectorAll('.status-option').forEach(btn => {
      btn.addEventListener('click', () => {
        body.querySelectorAll('.status-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        btn.querySelector('input').checked = true;
      });
    });

    // Form submit
    body.querySelector('#addBookForm').addEventListener('submit', (e) => {
      e.preventDefault();
      submitAddBook(e.target, bookData);
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
          <label class="form-label" for="tagsInput">Tags <span class="text-tertiary">(optional)</span></label>
          <input
            type="text"
            id="tagsInput"
            name="tags"
            class="form-input"
            placeholder="e.g. favorites, summer-reading"
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

  // Toggle page/rating fields based on status
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

  function submitAddBook(form, bookData) {
    const formData = new FormData(form);
    const status   = formData.get('status');
    const tags = formData.get('tags')
      ? formData.get('tags').split(',').map(t => t.trim()).filter(Boolean)
      : [];

    const book = Storage.addBook({
      ...bookData,
      status,
      currentPage: status === 'reading'  ? parseInt(formData.get('currentPage') || 0) : 0,
      rating:      status === 'finished' ? (parseInt(formData.get('rating')) || null) : null,
      dateStarted: status !== 'wishlist' ? new Date().toISOString() : null,
      dateFinished: status === 'finished' ? new Date().toISOString() : null,
      tags,
    });

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

    // Auto-finish if last page reached
    if (book.pageCount && currentPage >= book.pageCount) {
      updates.status = LIBRIQ.STATUS.FINISHED;
      updates.dateFinished = new Date().toISOString();
      Utils.toast(`🎉 Congratulations! You finished "${book.title}"`, 'success');
    }

    Storage.updateBook(bookId, updates);
    Storage.updateStreak();
    Navigation.updateBadges();
    return Storage.getBookById(bookId);
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
    Utils.toast(`Moved to "${Utils.statusLabel(newStatus)}"`, 'success');
    Navigation.updateBadges();
    return book;
  }

  // ── Rating ────────────────────────────────

  function setRating(bookId, rating) {
    const current = Storage.getBookById(bookId);
    if (!current) return;
    // Click same star → clear rating
    const newRating = current.rating === rating ? null : rating;
    Storage.updateBook(bookId, { rating: newRating });
    Utils.toast(newRating ? `Rated ${newRating} ★` : 'Rating cleared', 'info');
    const detailsModal = document.getElementById('bookDetailsModal');
    if (detailsModal && !detailsModal.hasAttribute('hidden')) {
      Library.showDetailsModal(bookId);
      return;
    }
    // Re-render if we're on the library page
    if (Navigation.currentPage === 'library' || Navigation.currentPage === 'finished') {
      Navigation.renderCurrentPage();
    }
  }

  // ── Favorite ──────────────────────────────

  function toggleFavorite(bookId) {
    const book = Storage.toggleFavorite(bookId);
    const msg = book?.isFavorite ? 'Added to favorites ❤️' : 'Removed from favorites';
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

  // ── Book Details Modal ────────────────────
  // Opens when user clicks any book card in the library.
  // Reuses the existing #addBookModal element under a new title
  // so we don't need a second modal in the HTML.

  function showDetailsModal(bookId) {
    const book   = Storage.getBookById(bookId);
    if (!book) return;

    const modal  = document.getElementById('bookDetailsModal');
    const body   = document.getElementById('bookDetailsBody');
    if (!modal || !body) return;

    const pct       = Utils.readingProgress(book.currentPage, book.pageCount);
    const isReading = book.status === LIBRIQ.STATUS.READING;
    const hasPages  = book.pageCount > 0;

    // Strip any HTML from stored descriptions (GB descriptions can contain tags)
    const description = book.description
      ? book.description.replace(/<[^>]*>/g, '')
      : null;
    const synopsis = description || 'No description available yet.';

    const genreBadges = (book.genres || []).slice(0, 3)
      .map(g => `<span class="badge badge-genre">${Utils.sanitize(g)}</span>`)
      .join('');

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
            ${genreBadges}
          </div>

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

      <div class="book-details-description">
        <h3 class="book-details-section-title">About this book</h3>
        <p class="book-details-desc-text">${Utils.sanitize(synopsis)}</p>
      </div>

      <div class="book-details-actions" id="bookDetailsActions"></div>`;

    Utils.show(modal);
    document.body.style.overflow = 'hidden';

    // Build action buttons with real event listeners — avoids all string-escaping
    // issues and correctly reads live state (e.g. isFavorite after toggling).
    const actions = body.querySelector('#bookDetailsActions');

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
      // Close first only if the user confirms — removeBook calls confirm() internally.
      // We do the confirm here so we can control modal state.
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

  // ── Render a full book card ───────────────

  function renderBookCard(book) {
    const pct     = Utils.readingProgress(book.currentPage, book.pageCount);
    const isReading = book.status === LIBRIQ.STATUS.READING;

    const card = document.createElement('div');
    card.className = 'book-card';
    card.dataset.bookId = book.id;

    // Genre badges — first 2 only to keep cards compact
    const genreBadges = (book.genres || []).slice(0, 2)
      .map(g => `<span class="badge badge-genre">${Utils.sanitize(g)}</span>`)
      .join('');

    card.innerHTML = `
      ${Utils.buildCover(book, 'cover-md')}
      <div class="book-card-info">
        <div class="book-card-title">${Utils.sanitize(book.title)}</div>
        <div class="book-card-author">${Utils.sanitize(book.author)}</div>
        <div class="book-card-meta">
          <span class="badge ${Utils.statusBadgeClass(book.status)}">
            ${Utils.statusLabel(book.status)}
          </span>
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
          </div>` : ''}

        <div class="book-card-actions"></div>
      </div>`;

    // Build action buttons with addEventListener — avoids inline onclick string escaping
    // and keeps title-with-apostrophe handling safe.
    const actions = card.querySelector('.book-card-actions');

    if (isReading) {
      const updateBtn = document.createElement('button');
      updateBtn.className = 'btn btn-primary btn-sm';
      updateBtn.innerHTML = '<i class="ph ph-pencil"></i> Update';
      updateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Library.showProgressModal(book.id);
      });
      actions.appendChild(updateBtn);
    }

    if (book.status !== LIBRIQ.STATUS.FINISHED) {
      const finishBtn = document.createElement('button');
      finishBtn.className = 'btn btn-secondary btn-sm';
      finishBtn.innerHTML = '<i class="ph ph-check"></i> Finish';
      finishBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        Library.setStatus(book.id, LIBRIQ.STATUS.FINISHED);
        Navigation.renderCurrentPage();
      });
      actions.appendChild(finishBtn);
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
    actions.appendChild(favBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost btn-sm btn-icon';
    removeBtn.title = 'Remove';
    removeBtn.innerHTML = '<i class="ph ph-trash"></i>';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Library.removeBook(book.id, book.title);
    });
    actions.appendChild(removeBtn);

    // Click the card body (not action buttons) → open details modal
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.book-card-actions')) {
        Library.showDetailsModal(book.id);
      }
    });

    return card;
  }

  // ── Progress Modal ────────────────────────

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
    showDetailsModal, closeDetailsModal,
    _setFormRating,
  };
})();
