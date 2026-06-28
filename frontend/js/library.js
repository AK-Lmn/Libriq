/* ============================================
   LIBRIQ LIBRARY
   Book management: add, edit, remove, status
   ============================================ */

const Library = (() => {

  // ── Add Book Modal ────────────────────────

  function showAddModal(bookData) {
    const modal   = document.getElementById('addBookModal');
    const body    = document.getElementById('addBookBody');
    const closeBtn = document.getElementById('closeAddBook');

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
    if (Navigation.currentPage === 'dashboard') Dashboard.render();
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

  // ── Render a full book card ───────────────

  function renderBookCard(book) {
    const pct     = Utils.readingProgress(book.currentPage, book.pageCount);
    const isReading = book.status === LIBRIQ.STATUS.READING;

    const card = document.createElement('div');
    card.className = 'book-card';
    card.dataset.bookId = book.id;

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
          ${book.genres[0] ? `<span class="badge">${Utils.sanitize(book.genres[0])}</span>` : ''}
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

        <div class="book-card-actions">
          ${isReading ? `
            <button class="btn btn-primary btn-sm" onclick="Library.showProgressModal('${book.id}')">
              <i class="ph ph-pencil"></i> Update
            </button>` : ''}
          ${book.status !== LIBRIQ.STATUS.FINISHED ? `
            <button class="btn btn-secondary btn-sm"
              onclick="Library.setStatus('${book.id}', '${LIBRIQ.STATUS.FINISHED}')">
              <i class="ph ph-check"></i> Finish
            </button>` : ''}
          <button class="btn btn-ghost btn-sm btn-icon"
            onclick="Library.toggleFavorite('${book.id}')"
            title="${book.isFavorite ? 'Unfavorite' : 'Favorite'}">
            <i class="ph ${book.isFavorite ? 'ph-heart-fill' : 'ph-heart'}"
               style="color: ${book.isFavorite ? 'var(--color-danger)' : ''}"></i>
          </button>
          <button class="btn btn-ghost btn-sm btn-icon"
            onclick="Library.removeBook('${book.id}', '${Utils.sanitize(book.title).replace(/'/g, "\\'")}')"
            title="Remove">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </div>`;

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
    _setFormRating,
  };
})();