export function createKindleImportPage({
  parseClippings,
  buildImportPlan,
  applyKindleImportPlan,
  actions = {},
  documentRoot,
} = {}) {
  if (typeof parseClippings !== 'function') throw new TypeError('createKindleImportPage requires parseClippings.');
  if (typeof buildImportPlan !== 'function') throw new TypeError('createKindleImportPage requires buildImportPlan.');
  if (typeof applyKindleImportPlan !== 'function') throw new TypeError('createKindleImportPage requires applyKindleImportPlan.');

  let boundRoot = null;
  let previewResult = null;
  let selectedFile = null;
  const getDocument = () => documentRoot || globalThis.document;

  function ensureModal() {
    const pageDocument = getDocument();
    if (!pageDocument) return null;
    let modal = pageDocument.getElementById?.('kindleImportModal');
    if (!modal) {
      modal = pageDocument.createElement?.('div');
      if (!modal) return null;
      modal.id = 'kindleImportModal';
      modal.className = 'modal-overlay';
      modal.hidden = true;
      modal.setAttribute?.('role', 'dialog');
      modal.setAttribute?.('aria-modal', 'true');
      modal.setAttribute?.('aria-labelledby', 'kindleImportTitle');
      pageDocument.body?.appendChild?.(modal);
    }
    return modal;
  }

  function renderShell(modal) {
    modal.innerHTML = `
      <div class="modal modal--centered whats-new-modal">
        <div class="modal-header">
          <div>
            <h2 class="modal-title" id="kindleImportTitle">Import Kindle Clippings</h2>
            <p class="whats-new-subtitle">Choose My Clippings.txt to build a read-only import preview.</p>
          </div>
          <button class="modal-close" type="button" aria-label="Close Kindle import" data-action="cancel-kindle-import">
            <i class="ph ph-x"></i>
          </button>
        </div>
        <div class="modal-body">
          <label class="form-label" for="kindleClippingsInput">My Clippings.txt</label>
          <input class="form-input" id="kindleClippingsInput" type="file" accept=".txt,text/plain" data-action="select-kindle-file" />
          <div id="kindleImportPreview" aria-live="polite"></div>
        </div>
        <div class="modal-footer whats-new-footer">
          <button class="btn btn-secondary" type="button" data-action="cancel-kindle-import">Cancel</button>
          <button class="btn btn-primary" id="continueKindleImport" type="button" data-action="continue-kindle-import" disabled>Continue Import</button>
        </div>
      </div>`;
  }

  function open() {
    const modal = ensureModal();
    if (!modal) return false;
    previewResult = null;
    selectedFile = null;
    renderShell(modal);
    bindActions(modal);
    modal.hidden = false;
    modal.querySelector?.('[data-action="cancel-kindle-import"]')?.focus?.();
    return true;
  }

  function close({ notify = false } = {}) {
    const modal = getDocument()?.getElementById?.('kindleImportModal');
    if (modal) modal.hidden = true;
    previewResult = null;
    selectedFile = null;
    if (notify) actions.cancel?.();
  }

  function bindActions(root) {
    if (boundRoot === root) return;
    boundRoot = root;
    root.addEventListener('change', handleFileChange);
    root.addEventListener('click', handleClick);
  }

  async function handleFileChange(event) {
    if (!event.target.matches?.('[data-action="select-kindle-file"]')) return;
    const file = event.target.files?.[0];
    previewResult = null;
    selectedFile = file || null;
    setContinueEnabled(false);
    if (!file || typeof file.text !== 'function') {
      renderError();
      return;
    }
    try {
      const text = await file.text();
      if (!String(text).trim()) {
        renderEmpty();
        return;
      }
      const parsed = parseClippings(text);
      if (!Array.isArray(parsed?.books) || parsed.books.length === 0) {
        renderError();
        return;
      }
      const existingBooks = actions.getExistingBooks?.() || [];
      const importPlan = buildImportPlan({ parsedBooks: parsed.books, existingBooks });
      const existingQuotesByBookId = actions.getExistingQuotesByBookId?.(existingBooks) || buildQuoteIndex(existingBooks);
      const quoteImportPlan = applyKindleImportPlan({ importPlan, existingQuotesByBookId });
      previewResult = { parsed, importPlan, quoteImportPlan, file };
      renderPreview(previewResult);
      setContinueEnabled(true);
      actions.previewReady?.(previewResult);
    } catch (error) {
      previewResult = null;
      renderError();
      actions.previewError?.(error, file);
    }
  }

  async function handleClick(event) {
    const trigger = event.target.closest?.('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    if (action === 'cancel-kindle-import') {
      event.preventDefault?.();
      close({ notify: true });
    } else if (action === 'continue-kindle-import' && previewResult) {
      event.preventDefault?.();
      setContinueEnabled(false);
      try {
        const result = await actions.continueImport?.(previewResult);
        if (result !== false) close();
        else setContinueEnabled(true);
      } catch (error) {
        setContinueEnabled(true);
        actions.executionError?.(error, previewResult);
      }
    }
  }

  function renderPreview({ importPlan, quoteImportPlan }) {
    const preview = getDocument()?.getElementById?.('kindleImportPreview');
    if (!preview) return;
    const values = [
      ['kindleBooksMatched', 'Books matched', importPlan.booksMatched],
      ['kindleBooksToCreate', 'Books to create', importPlan.booksCreated],
      ['kindleHighlightsDetected', 'Highlights detected', importPlan.totalHighlights],
      ['kindleNotesDetected', 'Notes detected', importPlan.totalNotes],
      ['kindleQuotesToImport', 'Quotes to import', quoteImportPlan.importedQuotes],
      ['kindleQuotesSkipped', 'Quotes skipped as duplicates', quoteImportPlan.skippedQuotes],
    ];
    preview.innerHTML = `
      <div class="goal-widget goal-widget--section-sm" id="kindleImportSummary">
        <div class="goal-header"><div class="goal-title">Import Preview</div></div>
        <div class="stats-row profile-stats-row profile-stats-grid">
          ${values.map(([id, label, value]) => `<div class="stat-card"><div class="stat-card-value" id="${id}">${Number(value) || 0}</div><div class="stat-card-label">${label}</div></div>`).join('')}
        </div>
      </div>`;
  }

  function renderEmpty() {
    renderMessage('No clippings found', 'The selected file is empty. Choose a populated My Clippings.txt file.');
  }

  function renderError() {
    renderMessage('Could not read this clippings file', 'Choose a valid My Clippings.txt file and try again.');
  }

  function renderMessage(title, body) {
    const preview = getDocument()?.getElementById?.('kindleImportPreview');
    if (!preview) return;
    preview.innerHTML = `
      <div class="empty-state empty-state--compact" id="kindleImportError">
        <div class="empty-state-title">${title}</div>
        <div class="empty-state-body">${body}</div>
      </div>`;
  }

  function setContinueEnabled(enabled) {
    const button = getDocument()?.getElementById?.('continueKindleImport');
    if (button) button.disabled = !enabled;
  }

  return { open, close, getPreview: () => previewResult, getSelectedFile: () => selectedFile };
}

export function buildQuoteIndex(books) {
  return Object.fromEntries((Array.isArray(books) ? books : [])
    .filter(book => book?.id)
    .map(book => [book.id, Array.isArray(book.quotes) ? book.quotes : []]));
}
