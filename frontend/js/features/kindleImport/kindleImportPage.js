import { AccessibleDialog } from '../../components/ui/dialog.js';

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
  let dialog = null;
  let revision = 0;
  let importing = false;
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
      modal.setAttribute?.('aria-describedby', 'kindleImportDescription');
      pageDocument.body?.appendChild?.(modal);
    }
    return modal;
  }

  function renderShell(modal) {
    modal.innerHTML = `
      <div class="modal modal--centered kindle-import-panel" tabindex="-1">
        <div class="modal-header">
          <div class="kindle-import-heading">
            <span class="kindle-import-eyebrow"><i class="ph ph-book-open" aria-hidden="true"></i> From your Kindle</span>
            <h2 class="modal-title" id="kindleImportTitle">Import Kindle Clippings</h2>
            <p class="kindle-import-subtitle" id="kindleImportDescription">Choose My Clippings.txt to build a read-only import preview.</p>
          </div>
          <button class="modal-close" type="button" aria-label="Close Kindle import" data-action="cancel-kindle-import">
            <i class="ph ph-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="modal-body">
          <ol class="kindle-import-steps" aria-label="Import steps"><li><span>01</span> Choose file</li><li><span>02</span> Review preview</li><li><span>03</span> Import</li></ol>
          <div class="kindle-import-file">
            <div class="kindle-import-file-icon"><i class="ph ph-file-text" aria-hidden="true"></i></div>
            <div class="kindle-import-file-fields">
              <label class="form-label" for="kindleClippingsInput">My Clippings.txt</label>
              <p id="kindleFileHint">Connect your Kindle by USB, then choose the text file from its documents folder.</p>
              <input class="form-input" id="kindleClippingsInput" type="file" accept=".txt,text/plain" aria-describedby="kindleFileHint" data-action="select-kindle-file" />
            </div>
          </div>
          <div id="kindleImportPreview" aria-live="polite" aria-atomic="true"></div>
          <p class="kindle-import-privacy"><i class="ph ph-lock-simple" aria-hidden="true"></i> Your clippings stay in your private library. No Kindle account connection is needed.</p>
        </div>
        <div class="modal-footer kindle-import-footer">
          <button class="btn btn-secondary" type="button" data-action="cancel-kindle-import">Cancel</button>
          <button class="btn btn-primary" id="continueKindleImport" type="button" data-action="continue-kindle-import" disabled>Continue Import</button>
        </div>
      </div>`;
  }

  function open() {
    const modal = ensureModal();
    if (!modal) return false;
    dialog?.destroy();
    revision += 1;
    importing = false;
    previewResult = null;
    selectedFile = null;
    renderShell(modal);
    bindActions(modal);
    renderInitial();
    setState('initial');
    setContinueEnabled(false);
    if (typeof Element !== 'undefined' && modal instanceof Element) {
      dialog = new AccessibleDialog(modal, {
        panel: modal.firstElementChild,
        closeOnEscape: false,
        closeOnBackdrop: false,
        initialFocus: '.kindle-import-footer [data-action="cancel-kindle-import"]',
      });
      dialog.open();
    } else {
      modal.hidden = false;
      modal.querySelector?.('[data-action="cancel-kindle-import"]')?.focus?.();
    }
    return true;
  }

  function close({ notify = false } = {}) {
    revision += 1;
    importing = false;
    dialog?.close();
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
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !importing) {
        event.preventDefault?.();
        close({ notify: true });
      }
    });
  }

  async function handleFileChange(event) {
    if (!event.target.matches?.('[data-action="select-kindle-file"]')) return;
    if (importing) return;
    const request = ++revision;
    const file = event.target.files?.[0];
    previewResult = null;
    selectedFile = file || null;
    setContinueEnabled(false);
    if (!file) {
      renderInitial();
      setState('initial');
      return;
    }
    if (typeof file.text !== 'function') {
      renderError();
      return;
    }
    setState('reading');
    renderMessage('Reading your clippings…', 'Building a read-only preview. Nothing has been imported.', 'processing', 'ph-hourglass');
    try {
      const text = await file.text();
      if (request !== revision) return;
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
      if (request !== revision) return;
      previewResult = null;
      setContinueEnabled(false);
      renderError();
      actions.previewError?.(error, file);
    }
  }

  async function handleClick(event) {
    if (event.target === boundRoot && !importing) {
      close({ notify: true });
      return;
    }
    const trigger = event.target.closest?.('[data-action]');
    if (!trigger) return;
    const action = trigger.dataset.action;
    if (action === 'cancel-kindle-import') {
      event.preventDefault?.();
      if (!importing) close({ notify: true });
    } else if (action === 'continue-kindle-import' && previewResult && !importing) {
      event.preventDefault?.();
      const request = revision;
      const detail = previewResult;
      importing = true;
      setContinueEnabled(false);
      setState('importing');
      renderMessage('Importing your clippings…', 'Adding books and quotes to your library. Please keep this window open.', 'processing', 'ph-hourglass');
      getDocument()?.getElementById?.('kindleImportModal')?.querySelector?.('.kindle-import-panel')?.focus?.();
      try {
        const result = await actions.continueImport?.(detail);
        if (request !== revision) return;
        importing = false;
        if (result !== false) {
          renderMessage('Import complete', 'Your clippings have been added to your private library.', 'complete', 'ph-check-circle');
          close();
        } else renderExecutionError();
      } catch (error) {
        if (request !== revision) return;
        importing = false;
        renderExecutionError();
        actions.executionError?.(error, detail);
      }
    }
  }

  function renderPreview({ importPlan, quoteImportPlan, file }) {
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
    setState('preview');
    preview.innerHTML = `
      <div class="kindle-preview-summary" id="kindleImportSummary">
        <div class="kindle-preview-heading"><h3>Import Preview</h3><span><i class="ph ph-eye" aria-hidden="true"></i> Read-only</span></div>
        <p class="kindle-preview-filename">${escapeHtml(file?.name || 'My Clippings.txt')}</p>
        <dl class="kindle-preview-counts">
          ${values.map(([id, label, value]) => `<div class="kindle-preview-stat"><dt>${label}</dt><dd id="${id}">${Number(value) || 0}</dd></div>`).join('')}
        </dl>
        <p class="kindle-preview-explanation">Nothing has changed yet. Continue Import adds the planned books and quotes; duplicate quotes are skipped.</p>
      </div>`;
  }

  function renderInitial() {
    renderMessage('Preview before you import', 'Choose your clippings file to see matched books, new books, highlights and notes. Nothing changes until you continue.', 'initial', 'ph-eye');
  }

  function renderExecutionError() {
    renderPreview(previewResult);
    const preview = getDocument()?.getElementById?.('kindleImportPreview');
    if (preview) preview.innerHTML = `
      <div class="kindle-import-message kindle-import-message--error" id="kindleImportError" role="alert">
        <i class="ph ph-warning-circle" aria-hidden="true"></i>
        <div><h3>Could not complete the import</h3><p>Some changes may already have been applied. Check your library before retrying this import.</p></div>
      </div>${preview.innerHTML}`;
    setState('error');
    setContinueEnabled(true);
    getDocument()?.getElementById?.('kindleImportModal')?.querySelector?.('.kindle-import-footer [data-action="cancel-kindle-import"]')?.focus?.();
  }

  function setState(state) {
    const modal = getDocument()?.getElementById?.('kindleImportModal');
    modal?.setAttribute?.('data-state', state);
    const input = getDocument()?.getElementById?.('kindleClippingsInput');
    if (input) input.disabled = importing;
    modal?.querySelectorAll?.('[data-action="cancel-kindle-import"]').forEach(button => { button.disabled = importing; });
    const button = getDocument()?.getElementById?.('continueKindleImport');
    if (button) button.textContent = importing ? 'Importing…' : 'Continue Import';
  }

  function renderEmpty() {
    setState('empty');
    renderMessage('No clippings found', 'The selected file is empty. Choose a populated My Clippings.txt file.', 'empty', 'ph-file-text');
  }

  function renderError() {
    setState('error');
    renderMessage('Could not read this clippings file', 'Choose a valid My Clippings.txt file and try again.', 'error', 'ph-warning-circle');
  }

  function renderMessage(title, body, state, icon) {
    const preview = getDocument()?.getElementById?.('kindleImportPreview');
    if (!preview) return;
    preview.innerHTML = `
      <div class="kindle-import-message kindle-import-message--${state}" id="${state === 'error' || state === 'empty' ? 'kindleImportError' : 'kindleImportStatus'}" ${state === 'error' ? 'role="alert"' : ''}>
        <i class="ph ${icon}" aria-hidden="true"></i>
        <div><h3>${title}</h3><p>${body}</p></div>
        </div>
      `;
  }

  function setContinueEnabled(enabled) {
    const button = getDocument()?.getElementById?.('continueKindleImport');
    if (button) button.disabled = !enabled;
  }

  return { open, close, getPreview: () => previewResult, getSelectedFile: () => selectedFile };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function buildQuoteIndex(books) {
  return Object.fromEntries((Array.isArray(books) ? books : [])
    .filter(book => book?.id)
    .map(book => [book.id, Array.isArray(book.quotes) ? book.quotes : []]));
}
