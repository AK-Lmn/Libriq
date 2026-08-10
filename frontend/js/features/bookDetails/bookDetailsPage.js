export function createBookDetailsPage({
  storage,
  utils,
  constants,
  bookApi,
  actions = {},
  documentRoot,
  createId,
  confirmAction,
} = {}) {
  if (!storage || !utils || !constants || !bookApi) throw new TypeError('createBookDetailsPage requires storage, utils, constants, and bookApi.');
  const Storage = storage;
  const Utils = utils;
  const LIBRIQ = constants;
  const BookAPI = bookApi;
  const document = documentRoot || globalThis.document;
  const crypto = { randomUUID: createId || (() => globalThis.crypto.randomUUID()) };
  const confirm = confirmAction || (message => globalThis.confirm(message));
  const _logActivity = (...args) => actions.logActivity?.(...args);
  const _getMetadataQuality = book => actions.getMetadataQuality?.(book) || { className: 'complete', label: 'Complete' };
  const _parseShelfInput = value => actions.parseShelfInput?.(value) || [];
  const Navigation = {
    updateBadges: () => actions.updateBadges?.(),
    renderCurrentPage: () => actions.renderCurrentPage?.(),
  };
  const Library = {
    showDetailsModal: bookId => showDetailsModal(bookId),
    showProgressModal: bookId => actions.showProgressModal?.(bookId),
    setStatus: (bookId, status) => actions.setStatus?.(bookId, status),
    setRating: (bookId, rating) => actions.setRating?.(bookId, rating),
    refreshMetadata: bookId => actions.refreshMetadata?.(bookId),
    toggleFavorite: bookId => actions.toggleFavorite?.(bookId),
  };
  let boundModal = null;

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
    const genreBadges = (book.genres || []).slice(0, 3)
      .map(g => `<span class="badge badge-genre">${Utils.sanitize(g)}</span>`)
      .join('');
    const shelfBadges = Array.isArray(book.tags) && book.tags.length
      ? book.tags.map(tag => `<span class="badge badge-accent">${Utils.sanitize(tag)}</span>`).join('')
      : '';
    const metadataQuality = _getMetadataQuality(book);
    const subjectList = Array.isArray(book?.subjects) && book.subjects.length > 0
      ? book.subjects
      : Array.isArray(book?.genres) ? book.genres : [];
    const subjectBadges = subjectList.slice(0, 5)
      .map(subject => `<span class="badge badge-accent">${Utils.sanitize(subject)}</span>`)
      .join('');
    const archiveLinks = Array.from(new Set((Array.isArray(book.readableSourceLinks) ? book.readableSourceLinks : [])
      .filter(link => String(link || '').includes('archive.org'))));
    const archiveUrl = book.archiveUrl || archiveLinks[0] || null;
    const sourceLabels = (() => {
      const labels = BookAPI.getSourceLabels(book);
      if (labels.length > 0) return labels;
      if (archiveUrl) return ['Internet Archive'];
      if (book?.source && book.source !== 'api') {
        const normalized = BookAPI.normalizeSource(book.source);
        const sourceLabelMap = {
          openlibrary: 'Open Library',
          google: 'Google Books',
        };
        return sourceLabelMap[normalized] ? [sourceLabelMap[normalized]] : [];
      }
      return [];
    })();
    const sourceBadges = sourceLabels.length
      ? `<div class="book-details-source-badges">${sourceLabels.map(label => `<span class="badge badge-accent">${Utils.sanitize(label)}</span>`).join('')}</div>`
      : '';
    const sourceMeta = sourceLabels.length
      ? `<div class="book-details-meta-row">
              <dt>Sources</dt><dd>${sourceLabels.map(label => Utils.sanitize(label)).join(', ')}</dd>
            </div>`
      : '';
    const archiveLinkBlock = archiveUrl
      ? `
      <div class="book-details-notes" id="bookArchiveLinksSection">
        <h3 class="book-details-section-title">Read / Archive</h3>
        <div class="book-details-link-list">
          <a class="btn btn-secondary btn-sm" href="${Utils.sanitize(archiveUrl)}" target="_blank" rel="noopener noreferrer">
            <i class="ph ph-archive"></i>
            Read on Internet Archive
          </a>
          ${book.readableSourceLinks?.some(link => String(link || '').includes('archive.org')) ? `
            <a class="btn btn-ghost btn-sm" href="${Utils.sanitize(archiveUrl)}" target="_blank" rel="noopener noreferrer">
              Archive link
            </a>` : ''}
        </div>
      </div>`
      : '';

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
          ${sourceBadges}
          ${subjectBadges ? `<div class="book-details-source-badges">${subjectBadges}</div>` : ''}

          ${shelfBadges ? `
          <div class="book-details-shelves">
            <div class="book-details-section-title">Shelves</div>
            <div class="book-details-shelf-list">${shelfBadges}</div>
          </div>` : ''}

          <div class="book-details-rating-panel">
            <h3 class="book-details-section-title">Your rating</h3>
            <div class="book-details-rating" id="bookDetailsRating">
              <div class="star-rating">${[1, 2, 3, 4, 5].map(value => `<button class="star ${book.rating !== null && value <= book.rating ? 'filled' : ''}" type="button" data-action="set-book-rating" data-rating="${value}" aria-label="Rate ${value} out of 5">★</button>`).join('')}</div>
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
            ${sourceMeta}
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

      ${archiveLinkBlock}

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
        <div class="book-detail-form-grid">
          <input id="bookQuotePageInput" class="form-input" type="number" min="1" placeholder="Page (optional)" />
          <input id="bookQuoteNoteInput" class="form-input" type="text" placeholder="Thought or context (optional)" />
        </div>
        <div class="book-details-notes-actions">
          <button type="button" class="btn btn-primary" id="saveBookQuoteBtn">
            <i class="ph ph-floppy-disk"></i>
            Save Quote
          </button>
        </div>
        <div id="bookQuotesList" class="book-quotes-list"></div>
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
    const primaryActions = document.createElement('div');
    primaryActions.className = 'book-details-primary-row';
    const secondaryActions = document.createElement('div');
    secondaryActions.className = 'book-details-secondary-row';
    const utilityActions = document.createElement('div');
    utilityActions.className = 'book-details-utility-row';
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
    const ratingControl = body.querySelector('#bookDetailsRating');
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
        ...quote,
        id: quote.id || crypto.randomUUID(),
        text: String(quote.text || ''),
        page: quote.page ?? null,
        note: String(quote.note || ''),
        createdAt: quote.createdAt || new Date().toISOString(),
        updatedAt: quote.updatedAt || quote.createdAt || new Date().toISOString(),
      }));
    }

    function renderQuotes() {
      if (!quotesList) return;
      const safeQuotes = normalizeQuotes(Storage.getBookById(book.id)?.quotes || book.quotes || []);
      if (!safeQuotes.length) {
      quotesList.innerHTML = `<div class="empty-state quote-empty-state"><div class="empty-state-body">No private quotes yet.</div></div>`;
        return;
      }

      quotesList.innerHTML = safeQuotes.map(quote => {
        const quoteText = quote.text.trim();
        const noteText = quote.note.trim();
        const isKindle = quote.source === 'kindle';
        const primaryText = quoteText || noteText || 'Untitled quote';
        const details = [
          isKindle ? (quoteText ? 'Kindle highlight' : 'Kindle note') : '',
          quote.page !== null && quote.page !== '' ? `p. ${Utils.sanitize(String(quote.page))}` : '',
          quoteText && noteText ? Utils.sanitize(noteText) : '',
        ].filter(Boolean);
        return `
        <div class="activity-item quote-list-item">
          <div class="activity-text quote-list-copy">
            <div class="activity-title quote-list-text">${Utils.sanitize(primaryText)}</div>
            ${details.length ? `<div class="activity-subtitle">${details.join(' · ')}</div>` : ''}
          </div>
          <div class="activity-time quote-list-actions">
            <button type="button" class="btn btn-ghost btn-sm" data-quote-action="edit" data-quote-id="${quote.id}">Edit</button>
            <button type="button" class="btn btn-ghost btn-sm" data-quote-action="delete" data-quote-id="${quote.id}">Delete</button>
          </div>
        </div>
      `;
      }).join('');
    }

    function persistQuotes(nextQuotes, eventType, payload = {}) {
      const updated = Storage.updateBook(book.id, {
        quotes: nextQuotes,
      });
      renderQuotes();
      _logActivity(eventType, updated, payload, updated?.source || 'system');
      return updated;
    }

    function validateQuoteInput(text, pageValue, noteValue, allowNoteOnly = false) {
      const quoteText = String(text || '').trim();
      const quoteNote = String(noteValue || '').trim();
      if (!quoteText && !(allowNoteOnly && quoteNote)) return 'Quote text is required.';

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
      const currentQuotes = normalizeQuotes(Storage.getBookById(book.id)?.quotes || []);
      const editingQuote = quoteId ? currentQuotes.find(quote => quote.id === quoteId) : null;
      const validationError = validateQuoteInput(text, pageValue, noteValue, editingQuote?.source === 'kindle');
      if (validationError) {
        Utils.toast(validationError, 'error');
        return null;
      }

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

    ratingControl?.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-action="set-book-rating"]');
      const rating = Number.parseInt(trigger?.dataset.rating || '', 10);
      if (trigger && Number.isFinite(rating)) Library.setRating(book.id, rating);
    });

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
      updateBtn.dataset.detailsAction = 'primary';
      updateBtn.innerHTML = '<i class="ph ph-pencil"></i> Update Progress';
      updateBtn.addEventListener('click', () => {
        closeDetailsModal();
        Library.showProgressModal(book.id);
      });
      primaryActions.appendChild(updateBtn);
    }

    if (book.status !== LIBRIQ.STATUS.FINISHED) {
      const finishBtn = document.createElement('button');
      finishBtn.className = 'btn btn-secondary';
      finishBtn.dataset.detailsAction = 'secondary';
      finishBtn.innerHTML = '<i class="ph ph-check"></i> Mark Finished';
      finishBtn.addEventListener('click', () => {
        Library.setStatus(book.id, LIBRIQ.STATUS.FINISHED);
        closeDetailsModal();
        Navigation.renderCurrentPage();
      });
      secondaryActions.appendChild(finishBtn);
    }

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn-secondary';
    refreshBtn.dataset.detailsAction = 'secondary';
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
    secondaryActions.appendChild(refreshBtn);

    const favBtn = document.createElement('button');
    favBtn.className = 'btn btn-ghost btn-icon';
    favBtn.dataset.detailsAction = 'icon';
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
    utilityActions.appendChild(favBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost';
    removeBtn.dataset.detailsAction = 'destructive';
    removeBtn.innerHTML = '<i class="ph ph-trash"></i> Remove';
    removeBtn.addEventListener('click', () => {
      if (!confirm(`Remove "${book.title}" from your library?`)) return;
      closeDetailsModal();
      Storage.removeBook(book.id);
      Utils.toast(`"${book.title}" removed`, 'info');
      Navigation.updateBadges();
      Navigation.renderCurrentPage();
    });
    utilityActions.appendChild(removeBtn);

    if (primaryActions.childElementCount) actions.appendChild(primaryActions);
    if (secondaryActions.childElementCount) actions.appendChild(secondaryActions);
    if (utilityActions.childElementCount) actions.appendChild(utilityActions);

    if (boundModal !== modal) {
      boundModal = modal;
      modal.querySelector('.modal-close')?.addEventListener('click', closeDetailsModal);
      modal.addEventListener('click', event => {
        if (event.target === modal) closeDetailsModal();
      });
    }
  }

  function closeDetailsModal() {
    const modal = document.getElementById('bookDetailsModal');
    Utils.hide(modal);
    document.body.style.overflow = '';
  }


  return { render: showDetailsModal, close: closeDetailsModal };
}
