import { confirmAction as presentConfirmation } from '../../components/ui/confirmation.js';

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
  const confirm = confirmAction || presentConfirmation;
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
  const icon = name => `<img class="book-details-icon" src="assets/revamp/book-details/${name}.svg" alt="" aria-hidden="true" />`;
  const safeLink = value => {
    try {
      const url = new URL(String(value || ''));
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };

  function showDetailsModal(bookId) {
    const book   = Storage.getBookById(bookId);
    if (!book) return;

    const modal  = document.getElementById('bookDetailsModal');
    const body   = document.getElementById('bookDetailsBody');
    if (!modal || !body) return;

    const pct       = Math.max(0, Math.min(100, Number(Utils.readingProgress(book.currentPage, book.pageCount)) || 0));
    const isReading = book.status === LIBRIQ.STATUS.READING;
    const hasPages  = book.pageCount > 0;

    const description = book.description
      ? book.description.replace(/<[^>]*>/g, '')
      : null;
    const synopsis = description || 'No description available yet. Your reading progress, notes and quotes are still here.';
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
      : [];
    const subjectBadges = subjectList.slice(0, 5)
      .map(subject => `<span class="badge badge-accent">${Utils.sanitize(subject)}</span>`)
      .join('');
    const readableLinks = Array.from(new Set((Array.isArray(book.readableSourceLinks) ? book.readableSourceLinks : [])
      .map(safeLink).filter(Boolean)));
    const archiveLinks = readableLinks.filter(link => /(^|\.)archive\.org$/.test(new URL(link).hostname));
    const archiveUrl = safeLink(book.archiveUrl) || archiveLinks[0] || null;
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
    const sourceMeta = sourceLabels.length
      ? `<div class="book-details-meta-row">
              <dt>Sources</dt><dd>${sourceLabels.map(label => Utils.sanitize(label)).join(', ')}</dd>
            </div>`
      : '';
    const sourceLinks = Array.from(new Set([archiveUrl, ...readableLinks].filter(Boolean)));
    const archiveLinkBlock = sourceLinks.length
      ? `
      <div class="book-details-notes" id="bookArchiveLinksSection">
        <h3 class="book-details-section-title">Read / Archive</h3>
        <div class="book-details-link-list">
          ${sourceLinks.map(link => `<a class="btn btn-secondary btn-sm" href="${Utils.sanitize(link)}" target="_blank" rel="noopener noreferrer">${icon('progress')}${/(^|\.)archive\.org$/.test(new URL(link).hostname) ? 'Read on Internet Archive' : `Read on ${Utils.sanitize(new URL(link).hostname)}`}</a>`).join('')}
        </div>
      </div>`
      : '';

    body.innerHTML = `
      <div class="book-details-overview">
      <div class="book-details-hero">
        ${Utils.buildCover(book, 'cover-xl')}
        <div class="book-details-hero-info">
          <h2 class="book-details-title">${Utils.sanitize(book.title)}</h2>
          <div class="book-details-author">${Utils.sanitize(book.author)}</div>

          <div class="book-details-badges">
            <span class="badge ${Utils.statusBadgeClass(book.status)}">
              ${book.status === LIBRIQ.STATUS.READING ? icon('status-reading') : ''}${Utils.statusLabel(book.status)}
            </span>
            <span class="badge badge-metadata badge-metadata-${Utils.sanitize(metadataQuality.className)}">${icon('status-metadata')}${Utils.sanitize(metadataQuality.label)}</span>
            ${genreBadges}
          </div>
          ${subjectBadges ? `<div class="book-details-source-badges">${subjectBadges}</div>` : ''}

          <div class="book-details-rating-panel">
            <div class="book-details-rating" id="bookDetailsRating" role="group" aria-label="Your rating">
              <div class="star-rating">${[1, 2, 3, 4, 5].map(value => `<button class="star ${book.rating !== null && value <= book.rating ? 'filled' : ''}" type="button" data-action="set-book-rating" data-rating="${value}" aria-pressed="${value === book.rating}" aria-label="Rate ${value} out of 5">${icon(book.rating !== null && value <= book.rating ? 'star-filled' : 'star-empty')}</button>`).join('')}</div>
              <span class="book-details-rating-text">${book.rating ? `${book.rating}/5` : 'Not rated'}</span>
            </div>
            <p class="book-details-hint">Your rating · just for you</p>
          </div>
        </div>
      </div>
      <section class="book-details-information" aria-label="Book information">
          <h3 class="book-details-eyebrow">Book information</h3>
          <dl class="book-details-meta">
            ${book.publishYear ? `<div class="book-details-meta-row">
              <dt>Published</dt><dd>${Utils.sanitize(String(book.publishYear))}</dd>
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
            ${book.dateAdded ? `<div class="book-details-meta-row">
              <dt>Date added</dt><dd>${Utils.formatDate(book.dateAdded)}</dd>
            </div>` : ''}
            <div class="book-details-meta-row">
              <dt>Date finished</dt><dd>${book.dateFinished ? Utils.formatDate(book.dateFinished) : 'Not finished yet'}</dd>
            </div>
            ${sourceMeta}
          </dl>
      </section>
      </div>

      ${(isReading && hasPages) ? `
        <section class="book-details-progress" aria-label="Reading progress">
          <div class="book-details-progress-header">
            <span class="book-details-progress-label">Reading Progress</span>
            <span class="book-details-progress-pct">${pct}% Complete</span>
          </div>
          <div class="progress-bar" role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="book-details-progress-pages">
            Page ${book.currentPage.toLocaleString()} of ${book.pageCount.toLocaleString()}
          </div>
        </section>` : ''}

      <div class="book-details-workspace">
      <div class="book-details-main-column">
      <div class="book-details-description ${description ? '' : 'book-details-description--empty'}">
        <h3 class="book-details-section-title">About this book</h3>
        <p class="book-details-desc-text">${Utils.sanitize(synopsis)}</p>
      </div>

      ${archiveLinkBlock}

      <div class="book-details-notes" id="bookShelvesSection">
        <h3 class="book-details-section-title">Shelves</h3>
        <label class="book-details-notes-label" for="bookShelvesInput">Shelf tags</label>
        <input
          id="bookShelvesInput"
          class="form-input"
          type="text"
          value="${Utils.sanitize(Array.isArray(book.tags) ? book.tags.join(', ') : '')}"
          placeholder="e.g. Classics, Philosophy, Books to reread"
        />
        <p class="book-details-hint">Separate tags with commas.</p>
        ${shelfBadges ? `<div class="book-details-shelf-list">${shelfBadges}</div>` : ''}
        <div class="book-details-notes-actions book-details-shelf-actions">
          <span class="book-details-hint">${Array.isArray(book.tags) ? book.tags.length : 0} shelves</span>
          <button type="button" class="btn btn-primary" id="saveBookShelvesBtn">
            Save Shelves
          </button>
        </div>
      </div>

      <div class="book-details-notes" data-book-id="${Utils.sanitize(book.id)}">
        <h3 class="book-details-section-title">Private Notes</h3>
        <p class="book-details-hint">A space for your thoughts. Private to your account.</p>
        <label class="book-details-notes-label" for="bookNotesTextarea">Your notes</label>
        <textarea
          id="bookNotesTextarea"
          class="book-details-notes-textarea"
          rows="6"
          placeholder="Write your private thoughts about this book..."
        >${Utils.sanitize(notes)}</textarea>
        <div class="book-details-notes-meta" id="bookNotesMeta"${notesUpdatedText ? '' : ' hidden'}>${Utils.sanitize(notesUpdatedText)}</div>
        <div class="book-details-notes-actions">
          <button type="button" class="btn btn-primary" id="saveBookNoteBtn">
            Save Note
          </button>
          <button type="button" class="btn btn-ghost" id="clearBookNoteBtn">
            Clear Note
          </button>
        </div>
      </div>
      </div>

      <div class="book-details-notes" data-book-id="${Utils.sanitize(book.id)}" id="bookQuotesSection">
        <div class="book-details-quotes-heading"><h3 class="book-details-section-title">Private Quotes</h3><span id="bookQuotesCount" class="book-details-hint">${String(book.quotes?.length || 0).padStart(2, '0')}</span></div>
        <p class="book-details-hint">Keep the words you want to return to.</p>
        <label for="bookQuoteTextInput" class="book-details-notes-label">Quote</label>
        <textarea
          id="bookQuoteTextInput"
          class="book-details-notes-textarea"
          rows="4"
          placeholder="Paste a quote you want to keep..."
        ></textarea>
        <div class="book-detail-form-grid">
          <div><label for="bookQuotePageInput" class="book-details-notes-label">Page (optional)</label><input id="bookQuotePageInput" class="form-input" type="number" min="1" ${hasPages ? `max="${book.pageCount}"` : ''} step="1" placeholder="e.g. 86" /></div>
          <div><label for="bookQuoteNoteInput" class="book-details-notes-label">Your thought (optional)</label><input id="bookQuoteNoteInput" class="form-input" type="text" placeholder="A personal reflection…" /></div>
        </div>
        <div class="book-details-notes-actions">
          <button type="button" class="btn btn-primary" id="saveBookQuoteBtn">
            Save Quote
          </button>
        </div>
        <h4 class="book-details-eyebrow book-details-saved-heading">Saved quotes</h4>
        <div id="bookQuotesList" class="book-quotes-list" aria-live="polite"></div>
      </div>
      </div>
      `;

    const header = modal.querySelector('.modal-header');
    const closeButton = modal.querySelector('.modal-close');
    if (header && !header.querySelector('.book-details-back')) {
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'btn btn-secondary book-details-back';
      back.innerHTML = `${icon('arrow-left')}Back to library`;
      back.addEventListener('click', closeDetailsModal);
      header.prepend(back);
      if (closeButton) closeButton.innerHTML = `${icon('close')}<span>Close</span>`;
    }

    Utils.show(modal);
    document.body.style.overflow = 'hidden';

    let actions = modal.querySelector('#bookDetailsFooter');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'modal-footer book-details-footer';
      actions.id = 'bookDetailsFooter';
      body.appendChild(actions);
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
      const count = body.querySelector('#bookQuotesCount');
      if (count) count.textContent = String(safeQuotes.length).padStart(2, '0');
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
            <button type="button" class="btn btn-ghost btn-sm" data-quote-action="edit" data-quote-id="${Utils.sanitize(quote.id)}">${icon('edit')}Edit</button>
            <button type="button" class="btn btn-ghost btn-sm" data-quote-action="delete" data-quote-id="${Utils.sanitize(quote.id)}">${icon('delete')}Delete</button>
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
        const page = Number(pageValue);
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
      const page = pageValue ? Number(pageValue) : null;

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
      const rating = Number(trigger?.dataset.rating);
      if (trigger && Number.isInteger(rating) && rating >= 1 && rating <= 5) {
        Library.setRating(book.id, rating);
        const selectedRating = Storage.getBookById(book.id)?.rating || 0;
        ratingControl.querySelectorAll?.('[data-action="set-book-rating"]').forEach(button => {
          const value = Number(button.dataset.rating);
          button.setAttribute('aria-pressed', String(value === selectedRating));
          button.classList.toggle('filled', value <= selectedRating);
          button.innerHTML = icon(value <= selectedRating ? 'star-filled' : 'star-empty');
        });
        const ratingText = ratingControl.querySelector?.('.book-details-rating-text');
        if (ratingText) ratingText.textContent = selectedRating ? `${selectedRating}/5` : 'Not rated';
      }
    });

    quotesList?.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-quote-action]');
      if (!btn) return;
      const quoteId = btn.dataset.quoteId;
      const action = btn.dataset.quoteAction;
      const currentQuote = normalizeQuotes(Storage.getBookById(book.id)?.quotes || []).find(q => q.id === quoteId);
      if (!currentQuote) return;

      if (action === 'delete') {
        if (!await confirm('Delete this private quote?', { title: 'Delete private quote?', confirmLabel: 'Delete quote', trigger: btn })) return;
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
      updateBtn.innerHTML = `${icon('progress')}Update Progress`;
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
      finishBtn.innerHTML = `${icon('check')}Mark Finished`;
      finishBtn.className += ' book-details-finish';
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
    refreshBtn.innerHTML = `${icon('refresh')}Refresh metadata`;
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      try {
        const result = await Library.refreshMetadata(book.id);
        if (result?.status === 'updated') {
          Utils.toast('Metadata updated', 'success');
          Navigation.updateBadges();
          Navigation.renderCurrentPage();
          if (!document.getElementById('bookDetailsModal')?.hasAttribute('hidden')) {
            Library.showDetailsModal(book.id);
          }
          return;
        }

        if (result?.status === 'no-new') {
          Utils.toast('No new metadata found', 'info');
        } else {
          Utils.toast("Couldn't refresh metadata", 'error');
        }
      } catch {
        Utils.toast("Couldn't refresh metadata", 'error');
      } finally {
        refreshBtn.disabled = false;
      }
    });
    secondaryActions.appendChild(refreshBtn);

    const favBtn = document.createElement('button');
    favBtn.className = 'btn btn-ghost book-details-favorite';
    favBtn.dataset.detailsAction = 'icon';
    favBtn.title = book.isFavorite ? 'Remove from favorites' : 'Add to favorites';
    favBtn.innerHTML = `${icon('heart')}${favBtn.title}`;
    favBtn.setAttribute?.('aria-pressed', String(Boolean(book.isFavorite)));
    favBtn.addEventListener('click', () => {
      const updated = Library.toggleFavorite(book.id);
      favBtn.title = updated?.isFavorite ? 'Remove from favorites' : 'Add to favorites';
      favBtn.innerHTML = `${icon('heart')}${favBtn.title}`;
      favBtn.setAttribute?.('aria-pressed', String(Boolean(updated?.isFavorite)));
      Navigation.updateBadges();
      Navigation.renderCurrentPage();
    });
    utilityActions.appendChild(favBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-ghost';
    removeBtn.dataset.detailsAction = 'destructive';
    removeBtn.innerHTML = `${icon('delete')}Remove book`;
    removeBtn.addEventListener('click', async () => {
      if (!await confirm(`Remove "${book.title}" from your library?`, { title: 'Remove book?', confirmLabel: 'Remove book', trigger: removeBtn })) return;
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

    const privacy = document.createElement('p');
    privacy.className = 'book-details-hint book-details-privacy';
    privacy.innerHTML = `${icon('lock')}Your notes, quotes and progress are private to your account.`;
    actions.appendChild(privacy);

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
